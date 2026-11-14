import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.warp import reproject


def export_overlay(reference_path, source_path, output_dir, kind, unit):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with rasterio.open(reference_path) as reference, rasterio.open(source_path) as source:
        if reference.crs is None or source.crs is None:
            raise ValueError("Both rasters must have a CRS.")

        # Source NoData, internal masks, NaN, and infinity become NaN.
        source_values = source.read(1, masked=True).astype(np.float32)
        source_array = source_values.filled(np.nan)
        source_array[~np.isfinite(source_array)] = np.nan

        aligned = np.full(
            (reference.height, reference.width),
            np.nan,
            dtype=np.float32,
        )

        # Nearest-neighbor avoids inventing intermediate cost values.
        # It also preserves source samples for slope visualization.
        reproject(
            source=source_array,
            destination=aligned,
            src_transform=source.transform,
            src_crs=source.crs,
            src_nodata=np.nan,
            dst_transform=reference.transform,
            dst_crs=reference.crs,
            dst_nodata=np.nan,
            resampling=Resampling.nearest,
        )

        valid = np.isfinite(aligned)
        values = aligned[valid]

        if values.size == 0:
            raise ValueError("No valid source pixels overlap the reference grid.")

        geotiff_path = output_dir / f"{kind}_aligned.tif"
        png_path = output_dir / f"{kind}_overlay.png"
        legend_path = output_dir / f"{kind}_legend.json"

        # The GeoTIFF retains the navigation grid's CRS and transform.
        with rasterio.open(
            geotiff_path,
            "w",
            driver="GTiff",
            width=reference.width,
            height=reference.height,
            count=1,
            dtype="float32",
            crs=reference.crs,
            transform=reference.transform,
            nodata=np.nan,
            compress="deflate",
        ) as output:
            output.write(aligned, 1)

        actual_min = float(values.min())
        actual_max = float(values.max())

        # Display bounds only: outliers are clipped visually, not in the GeoTIFF.
        legend_min, legend_max = (
            float(x) for x in np.percentile(values, [2, 98])
        )

        normalized = np.zeros(aligned.shape, dtype=np.float32)
        if legend_max > legend_min:
            normalized[valid] = np.clip(
                (aligned[valid] - legend_min) / (legend_max - legend_min),
                0,
                1,
            )

        # Low = blue, middle = yellow, high = red.
        stops = np.array([0.0, 0.5, 1.0])
        colors = np.array([
            [44, 123, 182],
            [255, 255, 140],
            [215, 25, 28],
        ])

        rgba = np.zeros((*aligned.shape, 4), dtype=np.uint8)
        for channel in range(3):
            rgba[:, :, channel] = np.interp(
                normalized, stops, colors[:, channel]
            ).astype(np.uint8)

        rgba[:, :, 3] = np.where(valid, 200, 0).astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(png_path)

        bounds = reference.bounds
        transform = reference.transform

        metadata = {
            "overlay_type": kind,
            "unit": unit,
            "source_file": str(source_path),
            "reference_file": str(reference_path),
            "aligned_geotiff": geotiff_path.name,
            "image": png_path.name,
            "width": reference.width,
            "height": reference.height,
            "crs_wkt": reference.crs.to_wkt(),
            "bounds": {
                "left": bounds.left,
                "bottom": bounds.bottom,
                "right": bounds.right,
                "top": bounds.top,
            },
            "bounds_crs": "reference CRS",
            "affine_transform": {
                "a": transform.a,
                "b": transform.b,
                "c": transform.c,
                "d": transform.d,
                "e": transform.e,
                "f": transform.f,
            },
            "resampling": "nearest",
            "valid_pixel_count": int(values.size),
            "data_min": actual_min,
            "data_max": actual_max,
            "legend_min": legend_min,
            "legend_max": legend_max,
            "legend_method": "2nd–98th percentile, visually clipped",
            "color_stops": [
                {"position": 0.0, "color": "#2c7bb6", "label": "low"},
                {"position": 0.5, "color": "#ffff8c", "label": "middle"},
                {"position": 1.0, "color": "#d7191c", "label": "high"},
            ],
            "nodata": "transparent in PNG; NaN in GeoTIFF",
        }

        legend_path.write_text(
            json.dumps(metadata, indent=2),
            encoding="utf-8",
        )

    print(f"Aligned GeoTIFF: {geotiff_path}")
    print(f"Overlay PNG:     {png_path}")
    print(f"Legend JSON:     {legend_path}")
    print(f"Valid pixels:    {values.size}")
    print(f"Legend bounds:   {legend_min:.4g} to {legend_max:.4g} {unit}")


def main():
    parser = argparse.ArgumentParser(
        description="Align a slope or terrain-cost raster and export an overlay."
    )
    parser.add_argument("--reference", required=True, help="Navigation-grid GeoTIFF")
    parser.add_argument("--source", required=True, help="Slope or cost GeoTIFF")
    parser.add_argument("--output-dir", default="overlays")
    parser.add_argument("--kind", required=True, choices=["slope", "terrain_cost"])
    parser.add_argument("--unit", default="unspecified")
    args = parser.parse_args()

    export_overlay(
        args.reference,
        args.source,
        args.output_dir,
        args.kind,
        args.unit,
    )


if __name__ == "__main__":
    main()
