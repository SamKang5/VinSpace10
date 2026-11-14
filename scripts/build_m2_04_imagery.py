#!/usr/bin/env python3
"""Build and verify a lossless browser image aligned to the M2-02 grid."""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path

SCALE = 4
SIZE = 1068
TOL = 1e-7


def image_affine(grid_affine, scale):
    a,b,c,d,e,f = grid_affine
    return [a/scale,b/scale,c,d/scale,e/scale,f]


def grid_to_image(row, col):
    if type(row) is not int or type(col) is not int or not (0 <= row < 267 and 0 <= col < 267):
        raise ValueError('grid indices outside grid')
    return SCALE * (col + .5), SCALE * (row + .5)


def image_to_grid(x, y):
    if not math.isfinite(x) or not math.isfinite(y) or not (0 <= x < SIZE and 0 <= y < SIZE):
        raise ValueError('image coordinate outside image')
    return math.floor(y / SCALE), math.floor(x / SCALE)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    from PIL import Image
    import numpy as np
    from osgeo import gdal, osr
    gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')
    gdal.UseExceptions()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path(r'D:\Nasa_Data'))
    parser.add_argument('--grid-dir', type=Path, default=Path('Data/navigation'))
    parser.add_argument('--out-dir', type=Path, default=Path('Data/imagery'))
    args = parser.parse_args()
    root = args.data_dir.resolve(); out = args.out_dir.resolve(); grid_dir = args.grid_dir.resolve()
    require(out != root and root not in out.parents, 'output must be outside source data directory')
    require(out != grid_dir and grid_dir not in out.parents, 'output must be outside navigation dataset')
    meta_path = grid_dir/'grid_metadata.json'
    nav = json.loads(meta_path.read_text(encoding='utf8'))
    grid = json.loads((grid_dir/'navigation_grid.json').read_text(encoding='utf8'))
    d08 = root/'D08_AStar_Routing/public/data'
    source_path = d08/'orthomosaic.png'
    source_metadata = json.loads((d08/'grid.json').read_text(encoding='utf8'))
    source_tif = root/'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif'
    d07 = root/'D07_Navigation_Pipeline/navigation_grid.tif'
    require(digest(source_path) == '086739f4cb301dd4642c012cc4215f8a96ffe01eaca535577326960271f56f7a', 'unexpected D08 image hash')
    require(digest(source_tif) == nav['sourceProvenance'][str(source_tif)]['sha256'], 'CTX source differs from M2-02 provenance')
    require((nav['width'],nav['height']) == (267,267) and (grid['width'],grid['height']) == (267,267), 'grid dimensions differ')
    require(source_metadata['background_bounds'] == nav['bounds'] and (source_metadata['background_width'],source_metadata['background_height']) == (SIZE,SIZE), 'D08 bounds or size differs')
    t = nav['affine']['values']; it = image_affine(t,SCALE)
    require(t[1] == t[3] == 0 and t[0] == 20 and t[4] == -20, 'unexpected grid affine')
    bounds = [it[2],it[5]+SIZE*it[4],it[2]+SIZE*it[0],it[5]]
    require(all(abs(a-b)<=TOL for a,b in zip(bounds,nav['bounds'])), 'image bounds mismatch')
    raster = gdal.Open(str(d07),gdal.GA_ReadOnly)
    refcrs = osr.SpatialReference(); refcrs.ImportFromWkt(nav['crs']['wkt'])
    rastercrs = osr.SpatialReference(); rastercrs.ImportFromWkt(raster.GetProjection())
    require(bool(refcrs.IsSame(rastercrs)), 'D07 CRS differs from navigation metadata')
    gt = raster.GetGeoTransform()
    require(all(abs(a-b)<=TOL for a,b in zip([gt[1],gt[2],gt[0],gt[4],gt[5],gt[3]],t)), 'D07 affine mismatch')
    ctx = gdal.Open(str(source_tif),gdal.GA_ReadOnly)
    expected = gdal.Warp('',ctx,format='MEM',dstSRS=nav['crs']['wkt'],outputBounds=nav['bounds'],width=SIZE,height=SIZE,resampleAlg='bilinear',dstAlpha=True)
    original = gdal.Open(str(source_path),gdal.GA_ReadOnly)
    require((original.RasterXSize,original.RasterYSize,original.RasterCount) == (SIZE,SIZE,2), 'D08 PNG dimensions/bands mismatch')
    require(np.array_equal(expected.ReadAsArray(),original.ReadAsArray()), 'D08 pixels differ from direct source resample')
    with Image.open(source_path) as image:
        image.load(); require(image.mode=='LA' and image.size==(SIZE,SIZE), 'unexpected source image type')
        candidate = io.BytesIO(); image.save(candidate,format='PNG',optimize=True)
        original_bytes = source_path.read_bytes()
        png_bytes = min((candidate.getvalue(),original_bytes), key=len)
        with Image.open(io.BytesIO(png_bytes)) as check:
            require(check.mode == image.mode and np.array_equal(np.array(image),np.array(check)), 'optimized pixels or alpha differ')
    max_error=0.0
    points=[(0,0),(0,266),(266,0),(266,266),(133,133),(230,30),(35,235)]
    endpoints=[]
    for row,col in points:
        px,py=grid_to_image(row,col)
        x=it[0]*px+it[2]; y=it[4]*py+it[5]
        gx=t[0]*(col+.5)+t[2]; gy=t[4]*(row+.5)+t[5]
        max_error=max(max_error,abs(x-gx),abs(y-gy))
        require(abs(x-gx)<=TOL and abs(y-gy)<=TOL and image_to_grid(px,py)==(row,col), 'coordinate alignment failed')
        if (row,col) in [(230,30),(35,235)]:
            index=row*267+col
            require(grid['validDataMask'][index] == 1 and grid['blockedMask'][index] == 0 and grid['cost'][index] is not None, 'route endpoint unavailable')
            endpoints.append({'row':row,'col':col,'imageCornerCoordinates':[px,py],'projectedCoordinates':[x,y],'cost':grid['cost'][index]})
    metadata = {'schemaVersion':'1.0','image':'mars_terrain.png','mimeType':'image/png','width':SIZE,'height':SIZE,'pixelFormat':'8-bit grayscale + alpha',
        'imageOrigin':'top-left; pixel x increases east and pixel y increases south',
        'crs':nav['crs'],'affine':{'order':'a,b,c,d,e,f','values':it,'maps':'x=a*pixelX+b*pixelY+c; y=d*pixelX+e*pixelY+f','coordinates':'continuous pixel-corner coordinates'},
        'bounds':nav['bounds'],'resolutionProjectedMeters':[5,5],
        'navigationGrid':{'width':267,'height':267,'pixelsPerCell':[4,4],'cellCenterToImage':'pixelX=4*(col+0.5), pixelY=4*(row+0.5)','metadataSha256':digest(meta_path)},
        'source':{'description':'D08 display PNG, losslessly optimized; original image created by bilinear GDAL resampling of CTX orthomosaic over M2-02 grid bounds','d08ImageSha256':digest(source_path),'ctxSourceFilename':source_tif.name,'ctxSourceSha256':digest(source_tif)},
        'routeEndpoints':endpoints,
        'limitations':['Research/demo only; not operational navigation or a safety product.','Numerical image/grid alignment does not verify physical CTX-to-DEM registration.','DEM vertical datum remains unresolved.']}
    meta_bytes=(json.dumps(metadata,indent=2,allow_nan=False)+'\n').encode('utf8')
    readme='''# M2-04 browser terrain image\n\n`mars_terrain.png` is a losslessly optimized 1068 × 1068 grayscale + alpha PNG derived from the D08 CTX display image. It is a browser-ready static image; no GIS code is needed at runtime. Serve it with `imagery_metadata.json` and the M2-02 package. The PNG is not itself georeferenced: use the accompanying metadata.\n\nThe image and 267 × 267 grid share the same outer bounds and Mars 2000 sphere equirectangular CRS. Image origin is top-left; x increases east, y increases south. One 20 m projected grid cell spans 4 × 4 image pixels at 5 m projected spacing. For `[row,col]`, its centre has continuous image corner-origin coordinates `(4*col+2, 4*row+2)`. These are continuous coordinates, not necessarily PNG pixel centres. For the image affine `[a,b,c,d,e,f]`, projected coordinates are `x=a*pixelX+b*pixelY+c`, `y=d*pixelX+e*pixelY+f`. Image pixels represent display-resampled data, not 5 m native science observations.\n\nDraw the full image over the metadata bounds without flipping or distortion. Account for viewport pan, zoom and CSS scaling before mapping screen clicks; test the UI against M2-03. Use masks to exclude blocked/unknown route cells. Research/demo only: numerical alignment is not independent physical image-to-DEM registration, the DEM vertical datum is unresolved, and the data do not establish real terrain safety.\n\n## Source attribution and provenance\n\nCredit: USGS Astrogeology Science Center; CTX instrument, NASA Mars Reconnaissance Orbiter. Fergason et al. (2020), *Mars 2020 Terrain Relative Navigation Context Camera Orthorectified Image Mosaic*, [USGS DOI 10.5066/P9GV1ND3](https://doi.org/10.5066/P9GV1ND3); [USGS product record](https://astrogeology.usgs.gov/search/map/Mars/Mars2020/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0). The USGS data-release citation lists five creators: Fergason, Galuszka, Hare, Mayer and Redding. The local XML separately lists six originators, adding Smith, and its literal title is “Context Camera Orthorectifiedimage Mosaic for Mars 2020 Terrain Relative Navigation”. The live product page separately references a nine-author conference work; these are distinct author lists, not a combined citation.\n\nThe live USGS product record states access constraints “None” and use constraints “Please cite authors”; cite the product and its authors. The older local FGDC XML states `accconst=None` and `useconst=None`; the live record is the more explicit current instruction. No separate license grant or original local retrieval date has been verified. The independent review reports successful live DOI/product access and publisher-hosted CTX and DTM re-downloads on 2026-11-14; their SHA-256 values matched the local fingerprints below. No official publisher checksum manifest was found. Publication date is not the original retrieval date. NASA/USGS endorsement is not implied.\n\nCTX `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif`: SHA-256 `842b457afee7c2672022b66e3f60be836c6d52e99474015bfd9ced60099b8615`. Paired DEM `JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif`: SHA-256 `16a1aa66c3f48c1bca252795827db7b417876217aff0f5e1aff18027fab2327b`. D08 intermediate image SHA-256 `086739f4cb301dd4642c012cc4215f8a96ffe01eaca535577326960271f56f7a`; D08 bilinearly resampled CTX, then this package losslessly optimized the PNG.\n\nThe reviewed build used GDAL 3.13.3 and Pillow 12.3.0. PNG pixels are checked losslessly; compressed bytes may differ across Pillow/zlib versions, so regenerate the checksum manifest when intentionally rebuilding.\n\nRebuild/validate from the workspace with Python 3.10+, GDAL Python bindings, NumPy and Pillow: `python scripts/build_m2_04_imagery.py`; run focused tests with `python -m unittest discover -s tests -p test_m2_04_imagery.py -v`. Source data remains read-only. `checksums.sha256` covers the image, metadata, this README and validation report, excluding itself.\n'''.encode('utf8')
    report=f'''# M2-04 imagery validation\n\n**PASS — research/demo only.** D08 image SHA-256 matches its established value; source CTX SHA-256 matches M2-02 provenance. A fresh in-memory GDAL bilinear resample of CTX into M2-02 bounds equals the D08 image in every grayscale and alpha pixel. The output PNG decodes identically to D08 (lossless); PNG compression was optimized and the smaller of optimized and original encodings selected.\n\n- Input PNG: {len(original_bytes):,} bytes; output: {len(png_bytes):,} bytes. Image 1068 × 1068, 8-bit grayscale + alpha; grid 267 × 267, exactly 4 × 4 image pixels per cell.\n- Mars 2000 spherical equirectangular CRS verified against D07 WKT; grid transform and image bounds checked to absolute tolerance {TOL:g} m, zero relative tolerance. Image affine `{it}`, 5 × 5 projected m pixels; bounds `{bounds}`.\n- Four grid corners, centre and both route endpoint centres round-trip through image pixel coordinates; maximum observed projected coordinate discrepancy {max_error:g} m.\n- `[230,30]` -> image `(122,922)` -> projected `(4583133.250853,1091383.140188)`; `[35,235]` -> image `(942,142)` -> projected `(4587233.250853,1095283.140188)`. Both are supported, unblocked, finite-cost cells in M2-02. Image coordinates are continuous from top-left pixel corner.\n- PNG pixel equality includes alpha; no lossy codec or movement cost changes. JSON serialization rejects non-finite numbers.\n\n**Limitations:** This validates numeric mapping and decoded imagery, not physical CTX-to-DEM registration or DEM vertical datum. No astronaut or rover safety is implied; UI integration, browser screen-to-map clicks and routing remain separate tests.\n'''.encode('utf8')
    files={'mars_terrain.png':png_bytes,'imagery_metadata.json':meta_bytes,'README.md':readme,'M2_04_validation_report.md':report}
    checks=''.join(f'{hashlib.sha256(files[name]).hexdigest()}  {name}\n' for name in sorted(files)).encode('ascii')
    out.mkdir(parents=True,exist_ok=True)
    for name,content in files.items(): (out/name).write_bytes(content)
    (out/'checksums.sha256').write_bytes(checks)
    for name,content in files.items(): require((out/name).read_bytes()==content, f'output mismatch: {name}')
    print(f'PASS: 1068x1068 PNG {len(original_bytes)} -> {len(png_bytes)} bytes; {len(points)} alignment points; max {max_error:g} m; output {out}')

if __name__=='__main__': main()
