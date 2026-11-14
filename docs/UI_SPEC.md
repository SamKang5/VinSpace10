# Mars Navigator UI specification

## §1 Design thesis

Use a north-up geospatial workstation as the model. Give the CTX image the largest uninterrupted area and put shared route metrics on one baseline per row. Keep route hue and line pattern consistent between the map and comparison. Give warm hazard colours to the raster and neutral colours to commands.

The previous interface used two cards for a single comparison, rounded away the reference cost decimals, and competed with the image for attention. Shared rows follow the side-by-side attribute inspection pattern in ArcGIS Pro. [ArcGIS Pro pop-up inspection](https://pro.arcgis.com/en/pro-app/3.5/help/mapping/navigation/pop-ups.htm)

Keep scale and projection information beside the map, following the QGIS status bar. The corner navigation and north indicators borrow the placement of Blender viewport gizmos. [QGIS interface](https://docs.qgis.org/3.44/en/docs/user_manual/introduction/qgis_gui.html) · [Blender viewport gizmos](https://docs.blender.org/manual/en/latest/editors/3dview/display/gizmo.html)

## §2 Visual system

| Token | Value | Use and placement | Contrast on ground / rail |
| --- | --- | --- | --- |
| `--p-bg` | #14110F | Keep. Map ground, map strips, selected column and fields | — |
| `--p-surface` | #1E1A17 | Keep. Header, continuous rail, controls and dialog | — |
| `--p-ink` | #F4EFE6 | Keep. Readings, button and heading text, scale outline | 16.42 / 15.09 |
| `--p-muted` | #A49B8D | Keep. Units, inactive labels, status and provenance | 6.85 / 6.30 |
| `--p-accent` | #E9E2D7 | Replace orange. Calculate button and checked input | 14.62 / 13.43 |
| `--p-accent-ink` | #14110F | Keep. Text over light fills | 14.62 on accent |
| `--pressed` | #C9BFB0 | Momentary button press | 10.35 with accent ink |
| `--control` | #827366 | Field and control outline, rail boundary, scroll thumb | 4.11 / 3.78 |
| `--rule` | #39312B | Decorative 1 px row and section rules | 1.48 / 1.36 |
| `--warn` | #FFAA9C | Excluded cell label and endpoint outline | 10.28 / 9.45 |
| `--focus` | #FFFFFF | Focus outline and keyboard map cursor | 18.80 / 17.28 |
| Shortest | #38BDF8 | Keep. Solid line and matching route swatches | 8.78 / 8.07 |
| Terrain-aware | #F0A9DA | Replace orange. Dashed line and matching route swatches | 10.20 / 9.37 |
| Endpoint fill | #F4EFE6 | Replace blue and orange. A and B use their letter for identity | 17.35 against marker ink |
| Marker ink | #0B0908 | Canvas marker letters | 17.35 on endpoint fill |
| Route casing | #0A0807 at 70% | Canvas strokes underneath each route | Variable over imagery |
| Marker outline | #000000 at 60% | Canvas endpoint outline | Variable over imagery |
| Grid line | #FFEED6 at 10% | Canvas grid | Variable over imagery |
| Backdrop | #14110F at 76% | Modal backdrop | — |
| Slope 0–3 | #00000000 / #E6C35A41 / #F2843B69 / #F2442D96 | Raster and swatches in class order | Text labels carry meaning |
| Elevation 0–4 | #263E7E / #406C9A / #76989C / #BAB28A / #E2D0A8 | Stops at 0/25/50/75/100%. Raster alpha 120/255, key opaque | Endpoints labelled in text |

Text target 4.5:1. Required control boundaries target 3:1. Table rules are decorative and row alignment uses geometry and labels. Colours on CTX vary with the pixel underneath. Retain casing, line patterns, marker letters and the DOM legend.

| Role | Font | Size / line height | Weight | Tracking | Tabular |
| --- | --- | --- | --- | --- | --- |
| Header title | Host Grotesk | 20/24 px, mobile 18/20 px | 700 | −0.02 em | No |
| Header subtitle | Host Grotesk | 13/16 px, mobile 12/16 px | 400 | normal | No |
| Modal and asset-error heading | Host Grotesk | 20/24 px | 700 | normal | No |
| Buttons | Host Grotesk | 13/16 px, route columns 12/16 px | 600 | normal | No |
| Body and status | Host Grotesk | 13/16 px, modal and error 14/20 px | 400 | normal | No |
| Table labels and provenance | Host Grotesk | 12/16 px | 500 table, 400 prose | normal | No |
| Section labels | JetBrains Mono | 11/16 px | 500 | +0.08 em | Yes |
| Stat and inspector keys | JetBrains Mono | 10/12 px | 400 header, 500 inspector | +0.06 em | Yes |
| Modelled cost | JetBrains Mono | 20/24 px | 500 | normal | Yes |
| Other metrics and primary readouts | JetBrains Mono | 14/20 px | 400 | normal | Yes |
| Grid, positions and scale | JetBrains Mono | 12/16 px grid, 11/16 px details and map, 10/16 px mobile map footer | 400 | normal | Yes |
| Units | JetBrains Mono | 11 px, inherit row height | 400 | normal | Yes |

Load Host Grotesk 400–700 and JetBrains Mono 400–500 via the Google Fonts stylesheet in `index.html`. Use system fallback faces while fonts load and on offline cache misses.

Base spacing 4 px. Inset 4, adjacent 8, map edge 12, section 16, stat group 20, header gap 24. Use 4 px control radius in place of 12 px and square map and rail edges. Endpoint circles encode their marker shape. Separate surfaces with 1 px rules. Use 24 × 24 inline SVG paths with 1.5 px `currentColor` stroke, round joins and caps, no fill. Reduce help and disclosure artwork to 16 px while maintaining the target size.

## §3 Layout

```text
Desktop 1440 × 900                    laptop 1280 × 720
+----------------------+----------+   +--------------------+--------+
| Mars Navigator     GRID  HELP   |   | Brand        GRID   HELP    |
+----------------------+----------+   +--------------------+--------+
| CTX             Hint | Compare  |   | CTX           Hint | Compare|
| N                    | Endpoints|   | N                  | Ends   |
|    terrain       [+] | Inspector|   |   terrain      [+] | Inspect|
|                  [-] | Key      |   |                 [-] |   ^    |
|                [fit] | Source   |   |               [fit] |   v    |
| scale       route key|    ^v    |   | scale     route key |        |
+----------------------+----------+   +--------------------+--------+
      1064 × 844         376 × 844         928 × 664         352 × 664

Tablet 900–1279 wide                  Mobile 375–899 wide
+------------------+------------+     +------------------------+
| Brand      GRID       HELP    |     | Brand              HELP|
+------------------+------------+     +------------------------+
| CTX         Hint | Comparison |     | CTX               Hint |
| N  terrain   [+] | Endpoints  |     | N    terrain       [+] |
|              [-] | Inspector  |     |                     [-]|
|            [fit] |     ^v     |     | scale        route key |
| scale   route key|            |     +------------------------+
+------------------+------------+     | Comparison             |
    W − 332 px         332 px         | Endpoints          ^v  |
                                      +------------------------+
```

The document never scrolls. The rail owns workspace scrolling. Keep `main#main` focusable via the skip link and use `div.app__map` for the map. Set `html, body, #root` to 100% height and hidden overflow. Use a `100dvh` grid with a 56 px header plus `minmax(0, 1fr)`; subtract safe area padding where present. Workspace tracks have zero gutter and the rail has a 1 px boundary. Desktop uses `minmax(0,1fr) 376px`; 1280–1439 uses 352 px; 900–1279 uses 332 px. Map tracks are 36 px / remainder / 40 px. Rail sections use 16 px horizontal padding and a 40 px disclosure row. At 1440 × 900 the image viewport is 1064 × 768 px. At 1280 × 720 it is 928 × 588 px.

At ≤899 px use one column with map size `clamp(224px,46dvh,440px)` and rail `minmax(144px,1fr)`. The map uses 28 px / remainder / 36 px. At 390 × 844 the canvas is approximately 390 × 324 px and the rail is 399 px. At height ≤500 px allocate 42% of the workspace to the rail with a 116 px minimum and give the balance to the map. This resolves the old 340 px map minimum in short landscape windows.

## §4 Component specifications

Shared controls start on the rail surface with a control border. Hover on fine pointers deepens the surface and switches the border to ink. Active press uses `--pressed` and accent ink. Focus uses a 2 px outline with 2 px offset; use an inset outline for table and disclosure controls. Pressed selections remain visible by border, fill and programmatic state. Disabled controls use muted text and the decorative rule, with activation guarded where `aria-disabled` keeps focus on the control. The primary action starts light and hovers to ink. See §8 for loading and outcome text.

| File / entry point | Anatomy, labels and state | Inputs and events |
| --- | --- | --- |
| `src/App.tsx`, `App`, `useExample`, `calculate`, `handleMapClick` | `Mars Navigator`, `Jezero Crater · Western fan`, Grid, Cell, CRS, How to use. Ready starts on the D08 comparison. Rail order is Route comparison, Endpoints, Cell inspector, Terrain key, Model and source. Loading and error preserve the same shell. | Own decoded assets, endpoints, selected slot, route results and emphasis, toggles, current inspection and modal. Run both routes on Calculate and D08 example. Invalidate routes on endpoint edits. |
| `src/components/MapViewer.tsx`, `MapViewer`, `clampView`, `coverView`, `zoomBy`, `handleMapKey` | Canvas with CTX orthomosaic strip, placement hint, grid north, zoom cluster, projected scale and route key. Zoom limits disable the corresponding controls. Keyboard cursor appears on map-key inspection. | Accept decoded image, image metadata, markers, paths, overlay canvases and toggles, placement slot and view revision. Emit hover, deliberate inspection, placement and cancel. |
| `src/components/ControlPanel.tsx`, `ControlPanel` | Start A and End B in two columns. Show `Unset`, `[row, column]`, `Blocked` or `Unknown`. Actions `Calculate routes`, `D08 example`, `Clear`. Checkboxes `Slope classes` and `Elevation tint`. | Press a slot to arm or disarm it. Calculate requires two eligible endpoints. Clear requires at least one endpoint. Both checkboxes default off. |
| `src/components/RouteComparison.tsx`, `RouteComparison` | One table with shared labels and two right-aligned columns. `Shortest` and `Terrain-aware` headers bring a route forward while retaining both on the map. Emphasise modelled cost at 20 px and the active column with the ground tone. | Accept results, active mode, status and result revision. Header buttons use `aria-pressed`. Show a status in the same position in all states. |
| `src/components/TerrainInfoPanel.tsx`, `TerrainInfoPanel` | Cell, inclusion status and optional A/B label, followed by Elev, Slope, Friction, Slope class, Easting and Northing. Empty copy `Hover or tap the map, or enter a cell below.` | Accept the existing raster values and dimensions. Row and Column native numeric fields are required integers from 0 to 266 for this grid. `Inspect cell` submits. `Place A here` / `Place B here` commits through the map-click path. Enable placement only when a slot is armed. |
| `src/components/MapLegend.tsx`, `MapLegend` | `CTX orthomosaic crop`, `Mars 2000 sphere · Equirectangular`, `Elevation tint`, `Slope classes`, grid counts. Four labelled slope swatches and one elevation ramp. | Accept elevation bounds, hazard counts, grid stats and projected pixel and area measures. Read-only. Formula and threshold are in the adjacent source footnote. |
| `src/components/HowToModal.tsx`, `HowToModal`, `handleTabKey` | Native modal at 480 px max, 16 px inside, 8 px tab gap. Exact headings `How to use`, `Endpoints`, `Compare`, `Inspect`, `Close help`. | `open` and `onClose`. Start on Endpoints. Left/Right wraps the topics, Home/End selects an edge topic. Escape and backdrop close. Return focus to the help button. |
| `src/components/Block.tsx`, `Block` | One h2 with a full-width button and chevron, one animated body. Default open for comparison, endpoints and inspector. Terrain key starts closed. | Accept title, defaultOpen and children. Track state with `aria-expanded` and `aria-controls`. Collapsed content is inert and removed from the accessibility tree. |
| `src/components/Icon.tsx`, `Icon` | Shared 24-grid artwork for help, north, zoom, fill, disclosure and close. | Accept an icon name. The parent supplies the accessible label. This component removes duplicate SVG markup. |

Comparison format from live results. Use an em dash for unavailable values and retain units in muted text on the row axis.

| Display row | Source | Precision | D08 Shortest | D08 Terrain-aware |
| --- | --- | --- | --- | --- |
| Distance · km | `distanceMeters / 1000` | 2 decimals | 5.58 | 6.02 |
| Modelled cost · m × index | `modeledCost` | 1 decimal | 8113.5 | 7261.5 |
| Mean slope · ° | `meanSlopeDeg` | 1 decimal | 6.2 | 4.0 |
| Max slope · ° | `maxSlopeDeg` | 1 decimal | 14.5 | 10.9 |
| Path size · cells | `cells` | integer | 207 | 246 |
| Search · ms | `computationMs` | integer | runtime | runtime |

Display height to 1 decimal metre, slope to 1 decimal degree, friction to 2 decimals and projected positions to 2 decimal metres. The project uses Mars 2000 spherical equirectangular metres and radius 3,396,190 m. EPSG:9001 describes the linear unit in this WKT. IAU 9122 describes the angular unit. The projected cell spacing is 20 m. Path distance sums great-circle steps on the sphere. This is why scale is labelled projected in the accessible text while route distances use the router result.

## §5 The map stage

| Order | Surface | Style and behaviour |
| --- | --- | --- |
| 0 | Canvas ground | #14110F. Fit the entire AOI on load and D08 reset using `min(W/801,H/801)`; letterbox symmetrically. Keep Fill view as a user action with `max(W/801,H/801)`. |
| 1 | CTX image | Local 801 × 801 PNG, native colour, 6.667 projected m/px. Render smooth below 2 CSS px per image px. |
| 2 | Elevation tint | Existing 267 × 267 raster, elevation ramp from §2. Render nearest neighbour with 120/255 alpha. |
| 3 | Slope classes | Existing raster and exact alphas in §2. Class 0 transparent. If both overlays are checked, slope draws over elevation. |
| 4 | Cell grid | Draw 1 px strokes only at ≥6 CSS px per cell. |
| 5 | Routes | Inactive then active. Casing widths 5/7 px. Fill strokes 2/3.5 px. Inactive global alpha .60. Round joins and caps. Terrain-aware dash [9, 6]. An exactly coincident segment can be covered by the active route; the column controls let the viewer reverse the draw order. |
| 6 | Endpoints | Radius 13 px, 3 px dark stroke, 13 px mono label at weight 500. A and B sharing a cell render one marker labelled AB. |
| 7 | Keyboard cursor | 16 × 16 px DOM box, 2 px white border and 1 px ground outline. Pointer-transparent. |
| 8 | Navigation | Static grid north top-left, zoom in/out/fill top-right. Top/side inset 12 px desktop and 8 px mobile, gap 4 px. Buttons 36 × 36 px desktop and 44 × 44 px mobile. |
| Adjacent | Top strip | `CTX orthomosaic` at left. `Inspect terrain`, `Place Start A`, or `Place End B` on the right. |
| Adjacent | Bottom strip | Scale at left. Compute largest fitting value in 10, 20, 50, 100, 200, 500, 1000, 2000, 5000 projected m at 130 px max. 8 px tall stroke and metre/kilometre text. Show solid/dashed route key at right for routes present. |

The 3:1 image-pixel-to-grid-cell alignment describes the digital grid. Physical CTX-to-DEM registration is still unresolved. The default fit keeps both reference endpoints visible even in portrait and wide aspect ratios. User-controlled zoom retains pointer anchoring and the original 0.6–24 CSS px per image px clamp. The initial full-image fit may be below 0.6 on a small viewport. Zooming out is disabled there until a zoom-in or Fill view.

## §6 Motion

| Trigger | CSS property | Duration | Easing | Delay | Reduced motion |
| --- | --- | --- | --- | --- | --- |
| Hover, press, select, disable | text, border and background colour | 120 ms | `cubic-bezier(.2,.75,.2,1)` | 0 | Immediate |
| Disclosure | grid-template-rows and chevron transform | 180 ms body, 160 ms icon | same | 0 | Immediate; inert state still applies |
| Results commit | table opacity .65 → 1 | 160 ms | same | 0 | Immediate |
| Open help or change topic | opacity .65 → 1 | 160 ms | same | 0 | Immediate |
| Focus, map pan/zoom, mode draw order, overlay toggle, endpoint edit, loading/error | focus and canvas redraw or DOM replacement | 0 ms | — | 0 | Immediate |

Fade only the result readout. The canvas redraws using the current transform so motion never misrepresents terrain or temporarily changes route alignment. The waiting skeleton is static. No timers animate data.

## §7 Interaction & keyboard

1. On arrival, inspect the D08 result. Select a column to bring that route to the front. Click or tap the raster to read the cell while no endpoint is armed.
2. Select Start or End to move that endpoint. Clear removes both and arms A. Valid placement advances to the unset slot or returns to inspection when both are set. An excluded cell stays selected and the slot remains armed so it can be corrected. Selecting the armed button again cancels placement.
3. Drag more than 3 px along either axis to pan; capture the primary pointer. A short press inside the raster inspects or places. Pointer cancellation never places an endpoint. Mouse hover submits at most one sample per animation frame and leaving restores the last deliberate inspection. Touch uses tap and one-finger drag, with the zoom cluster for scale changes.
4. Wheel zoom uses `exp(−deltaY × 0.0015)`, anchored at the pointer with the existing clamp. Buttons zoom by 1.35 and its reciprocal about the viewport centre. Fill view recentres and covers. Outside-image taps leave the data unchanged.

| Context | Key | Effect |
| --- | --- | --- |
| Document entry | Tab, Enter | Focus and activate `Skip to content`, then proceed through the workspace |
| Canvas only | Arrows | Inspect one cell at a time, starting at the viewport centre; keep the cursor visible at the bounds |
| Canvas only | Shift + arrows | Pan 48 CSS px |
| Canvas only | + / =, −, 0 | Zoom in, zoom out, Fill view |
| Canvas only | Enter, Esc | Inspect or place at the cursor; cancel armed placement |
| Buttons and disclosures | Enter or Space | Invoke the visible action |
| Overlay checkboxes | Space | Toggle |
| Row/column form | Enter | Inspect valid coordinates |
| Help | Left/Right, Home/End | Switch topics when the topic tab has focus |
| Help | Esc | Close and return focus to help trigger |

Ready tab order is Skip, Help, Canvas, Zoom in, Zoom out, Fill view, Route comparison disclosure, route headers, Endpoints disclosure, A, B, Calculate, D08 example, Clear, Slope classes, Elevation tint, Cell inspector disclosure, Row, Column, Inspect cell, Place endpoint, Terrain key disclosure, source link. Shift+Tab reverses order. Skip skips the header. Disabled zoom buttons and collapsed bodies leave the tab order. Help confines keyboard focus to its contents.

## §8 States

| State | Exact presentation and transition |
| --- | --- |
| Loading | `Loading navigation grid and terrain rasters…`, then `Decoding CTX orthomosaic…`. Render four 8 px placeholder rows with widths 100/80/60/40%, 8 px gaps, 12 px frame padding and max width 320 px. Comparison says `Waiting for terrain files.` Use actual phase changes. |
| Asset error | `Terrain files unavailable`, loader detail, `Retry terrain load`. Image failures say `The CTX orthomosaic could not be loaded or decoded.` Retry starts a fresh request and focuses main. Compare says `Comparison unavailable.` |
| D08 ready | `D08 reference traverse · Two routes found`, both result columns and both endpoints. |
| Empty | `Place Start A and End B to compare routes.` The armed marker hint is `Select a map cell for Start A.` or `Select a map cell for End B.` |
| Pair ready | `Calculate routes to compare this pair.` Idle instruction `Select Start or End to move an endpoint.` |
| Calculating | `Calculating…` on the command and `Calculating both routes…` in the live comparison. Commit both results together. |
| No route | `No route connects these endpoints.` Keep both endpoint positions and remove outdated routes and numbers. |
| Blocked endpoint | Endpoint shows `Blocked` or `Unknown`. Status `Choose another cell for A.`, `Choose another cell for B.`, or `Choose another cell for A and B.` Comparison reads `An endpoint is excluded from routing.` |
| Out of bounds | Native field constraints reject out-of-range inspection. If the router returns the status, display `An endpoint is outside the grid.` |

The rail ends with `Model and source`. Copy: “Research prototype. Friction is an uncalibrated, dimensionless slope index 1 + (slope in degrees ÷ 10)². It does not measure energy, speed or safety. Both modes exclude cells at 15° or steeper. Physical image-to-DEM registration and the DEM vertical datum remain unresolved.” Link text `CTX orthomosaic · Fergason et al. 2020 · USGS Astrogeology / NASA MRO` points to DOI 10.5066/P9GV1ND3. The raster key shows the actual exported elevation range, −2552.55 m to −2101.25 m, without asserting a resolved vertical datum. [USGS data release](https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-context-camera-orthorectified-image-mosaic)

## §9 Responsive behaviour

At 1440 and above, present all three header readouts and a horizontal brand line. At 1280–1439 shrink the rail to 352 px. At 900–1279 use the 332 px rail. At ≤1100 stack title and subtitle with a 4 px gap. At ≤899 hide repeat header readouts from the header and retain data in Terrain key. Reuse the same rail as a pinned bottom pane with internal scroll. It stays open beside the workflow, so switching between map placement and tool controls requires no modal dismissal. Use 12 px horizontal rail padding and 44 px control target height. Display route swatches at 20 px width in the lower map strip. At ≤500 px tall and ≤899 px wide arrange zoom buttons in one row. Keep the map, route comparison, both endpoint controls, inspector, and terrain key reachable at 375 px.

## §10 Accessibility

Use visible semantic headings, a real comparison table with row and column scope, labelled numeric fields, a named canvas, and a native dialog. The focus outline is white and appears immediately. Draw it inside viewport-clipped controls. Pair the canvas with the DOM inspector and coordinate-entry form, which can inspect or place any cell without a map pixel. Draw marker identity by letter and route identity by line pattern as well as hue. Keep hover readouts out of the live region. Deliberate inspection announces cell, inclusion, elevation, slope and friction. Announce route status and the two result cost and cell counts politely. Announce asset failure as an alert. Use inert plus aria-hidden for closed disclosure bodies. Reduced motion switches off transitions and animations. [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) · [WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)

## §11 Build notes

| Order | File | Change | Estimate |
| --- | --- | --- | --- |
| 1 | `src/lib/theme.ts` | Shared stroke, dash, label and endpoint colours | 0.25 h |
| 2 | `src/lib/overlay.ts` | Share slope swatches and exact class labels | 0.25 h |
| 3 | `src/components/Icon.tsx` | Inline SVG artwork | 0.25 h |
| 4 | `src/components/Block.tsx` | Accessible disclosure and inert content | 0.5 h |
| 5 | `src/components/RouteComparison.tsx` | Shared table, units, live status and route priority | 1 h |
| 6 | `src/components/ControlPanel.tsx` | Endpoints, actions, validation state and overlays | 0.75 h |
| 7 | `src/components/TerrainInfoPanel.tsx` | Readout and input path | 1 h |
| 8 | `src/components/MapLegend.tsx` | Precision, statistics and class keys | 0.5 h |
| 9 | `src/components/HowToModal.tsx` | Dialog focus and arrow navigation | 0.75 h |
| 10 | `src/components/MapViewer.tsx` | Preserve rendering pipeline, replace chrome and add keyboard interaction | 2 h |
| 11 | `src/App.tsx` | Shell, asset load states, D08 and route orchestration | 2 h |
| 12 | `src/styles.css` | Scoped app tokens, fixed frame, responsive rows and CSS motion. Retire kit imports from the SPA. | 3 h |
| 13 | `index.html` | Clean kit attributes and keep a relative favicon | 0.25 h |
| 14 | `scripts/offline-worker.js` and `scripts/build-offline-worker.mjs` | Native versioned static asset cache. Precache the generated app assets and terrain on first connected load. Use the last cached shell on offline navigation. | 1 h each |
| 15 | `package.json` and `src/main.tsx` | Generate the worker after Vite builds, register in production | 0.25 h each |

Routing engine and published data contract changes required: zero. Repository facts take precedence for implementation. The v1 navigation wire file is 427,746 bytes with 12-byte header, Float32 costs, valid mask and blocked mask. `decodeGrid` uses the cost and valid mask and reconstructs slope with `slopeFromCost`. The router uses `NODATA = -9999`. Source imagery, raster values, geospatial maths, and fail-closed parsing already live in the repository. CSS handles all motion and native Canvas 2D handles terrain.

Build with `npm run build`, then use `npm run check` and preview `dist`. Verify at 1440 × 900, 1920 × 1080, 1280 × 720, 1024 × 768, 900 × 768, 768 × 1024, 390 × 844, 375 × 667 and 844 × 390. Check overflow, both D08 columns, contrast, blocked and disconnected routes, touch placement, keyboard focus and inspection, image-error retry, and offline reload after the worker takes control.

## §12 Deliverable

A frontend engineer can build and verify the fixed map workspace, comparison, endpoint placement, accessible terrain inspection, overlay keys, help, loading and recovery states, mobile layout and offline-ready build from the rules and file targets above. The implementation uses the existing data and routing entry points. The UI source and this spec are delivered together.
