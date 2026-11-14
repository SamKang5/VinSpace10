# M2-04 imagery validation

**PASS — research/demo only.** D08 image SHA-256 matches its established value; source CTX SHA-256 matches M2-02 provenance. A fresh in-memory GDAL bilinear resample of CTX into M2-02 bounds equals the D08 image in every grayscale and alpha pixel. The output PNG decodes identically to D08 (lossless); PNG compression was optimized and the smaller of optimized and original encodings selected.

- Input PNG: 553,085 bytes; output: 531,304 bytes. Image 1068 × 1068, 8-bit grayscale + alpha; grid 267 × 267, exactly 4 × 4 image pixels per cell.
- Mars 2000 spherical equirectangular CRS verified against D07 WKT; grid transform and image bounds checked to absolute tolerance 1e-07 m, zero relative tolerance. Image affine `[5.0, 0.0, 4582523.250853, 0.0, -5.0, 1095993.140188]`, 5 × 5 projected m pixels; bounds `[4582523.250853, 1090653.140188, 4587863.250853, 1095993.140188]`.
- Four grid corners, centre and both route endpoint centres round-trip through image pixel coordinates; maximum observed projected coordinate discrepancy 0 m.
- `[230,30]` -> image `(122,922)` -> projected `(4583133.250853,1091383.140188)`; `[35,235]` -> image `(942,142)` -> projected `(4587233.250853,1095283.140188)`. Both are supported, unblocked, finite-cost cells in M2-02. Image coordinates are continuous from top-left pixel corner.
- PNG pixel equality includes alpha; no lossy codec or movement cost changes. JSON serialization rejects non-finite numbers.

**Limitations:** This validates numeric mapping and decoded imagery, not physical CTX-to-DEM registration or DEM vertical datum. No astronaut or rover safety is implied; UI integration, browser screen-to-map clicks and routing remain separate tests.
