# M2-04 browser terrain image

`mars_terrain.png` is a losslessly optimized 1068 × 1068 grayscale + alpha PNG derived from the D08 CTX display image. It is a browser-ready static image; no GIS code is needed at runtime. Serve it with `imagery_metadata.json` and the M2-02 package. The PNG is not itself georeferenced: use the accompanying metadata.

The image and 267 × 267 grid share the same outer bounds and Mars 2000 sphere equirectangular CRS. Image origin is top-left; x increases east, y increases south. One 20 m projected grid cell spans 4 × 4 image pixels at 5 m projected spacing. For `[row,col]`, its centre has continuous image corner-origin coordinates `(4*col+2, 4*row+2)`. These are continuous coordinates, not necessarily PNG pixel centres. For the image affine `[a,b,c,d,e,f]`, projected coordinates are `x=a*pixelX+b*pixelY+c`, `y=d*pixelX+e*pixelY+f`. Image pixels represent display-resampled data, not 5 m native science observations.

Draw the full image over the metadata bounds without flipping or distortion. Account for viewport pan, zoom and CSS scaling before mapping screen clicks; test the UI against M2-03. Use masks to exclude blocked/unknown route cells. Research/demo only: numerical alignment is not independent physical image-to-DEM registration, the DEM vertical datum is unresolved, and the data do not establish real terrain safety.

Rebuild/validate from the workspace with Python 3.10+, GDAL Python bindings, NumPy and Pillow: `python scripts/build_m2_04_imagery.py`; run focused tests with `python -m unittest discover -s tests -p test_m2_04_imagery.py -v`. Source data remains read-only. `checksums.sha256` covers the image, metadata, this README and validation report, excluding itself.
