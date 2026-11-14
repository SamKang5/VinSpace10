"""Python port of scripts/build-overlay-bins.mjs from the old project.

Copies elevation.bin / hazard.bin into an output directory and writes
overlay_metadata.json with the same schema, so the new (E) tooling can feed
the old app without changing the original code.
"""

import argparse
import json
import shutil
from pathlib import Path

import numpy as np


def main():
    parser = argparse.ArgumentParser(description="Build browser overlay bins (compat).")
    parser.add_argument("--grid-json", required=True)
    parser.add_argument("--overlay-dir", required=True, help="Directory with elevation.bin and hazard.bin")
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    grid = json.loads(Path(args.grid_json).read_text(encoding="utf-8"))
    width, height = grid["width"], grid["height"]
    n = width * height

    overlay_dir = Path(args.overlay_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    elev_path = overlay_dir / "elevation.bin"
    haz_path = overlay_dir / "hazard.bin"
    elevation = elev_path.read_bytes()
    hazard = haz_path.read_bytes()

    if len(elevation) != n * 4:
        raise SystemExit(f"elevation.bin is {len(elevation)} bytes, expected {n * 4}")
    if len(hazard) != n:
        raise SystemExit(f"hazard.bin is {len(hazard)} bytes, expected {n}")

    elev_arr = np.frombuffer(elevation, dtype="<f4")
    elev_min = float(np.nanmin(elev_arr[np.isfinite(elev_arr)]))
    elev_max = float(np.nanmax(elev_arr[np.isfinite(elev_arr)]))

    class_counts = [0, 0, 0, 0]
    blocked_mismatch = 0
    for i in range(n):
        cls = hazard[i]
        if cls <= 3:
            class_counts[cls] += 1
        blocked_in_grid = grid.get("blockedMask", [0] * n)[i] == 1
        if blocked_in_grid != (cls == 3):
            blocked_mismatch += 1
    if blocked_mismatch > 0:
        raise SystemExit(f"hazard classes disagree with grid blocked mask on {blocked_mismatch} cells")

    metadata = {
        "schemaVersion": "1.0",
        "width": width,
        "height": height,
        "layout": "row-major",
        "bounds": [4582523.250853, 1090653.140188, 4587863.250853, 1095993.140188],
        "geotransform": [4582523.250853, 20, 0, 1095993.140188, 0, -20],
        "arrays": "row-major north to south; Float32 little-endian elevation; uint8 hazard class",
        "elevation": {"min": elev_min, "max": elev_max, "unit": "metre", "datum": "Mars 2000 sphere"},
        "hazard": {"edges": [5, 10, 15], "counts": class_counts},
    }

    shutil.copyfile(elev_path, out_dir / "elevation.bin")
    shutil.copyfile(haz_path, out_dir / "hazard.bin")
    (out_dir / "overlay_metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out_dir}/elevation.bin, hazard.bin, overlay_metadata.json")


if __name__ == "__main__":
    main()
