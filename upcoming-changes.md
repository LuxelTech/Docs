# Upcoming changes

## Phases (current and upcoming)

- **Up next:** nothing planned; new requests go in `new.md`.
- **Later:** contact details (left out for now, by request).

## Decisions

- Custom domain `luxel.tech` (`docs/CNAME`).
- Layout: hero, then one section per core service, each with a scene drawn in code (no photos).
- Hero: a thermal scan sweeping up a point-cloud building.
- Logo, favicon and palette reused from Luxel's main site.
- No contact information for now.
- New sections go after the two service demos: who it's for, how it works, sample deliverables.
- Scenes use 2D canvas rather than WebGL: the point counts are small, and it needs no fallback.

## Done

- **Scaffold and hero** (`docs/index.html`, `docs/style.css`, `docs/main.js` hero section): page chrome, logo,
  favicon, CNAME, the scene runner and the hero thermal scan.
- **Photogrammetry & Mapping** (`#photogrammetry` in `docs/index.html`, the photogrammetry section of
  `docs/main.js`): a drone circles a tower and wing leaving camera frusta, then sparse and dense points, a shaded
  mesh, and a top-down orthomosaic tiling in with a survey grid, ground control points and a scale bar.
  Still frame: the finished mesh.
- **Thermography** (`#thermography` in `docs/index.html`, the thermography section of `docs/main.js`): an
  apartment block over shops in visible light and infrared, a divider moving by itself until dragged or set with
  the `#ir-wipe` slider, pulsing callouts with temperatures, a °C scale. Still frame: divider at the slider (50%).
- **Sharing and polish** (`docs/assets/img/social-card.png` from `tools/social-card.js`, the `og:`/`twitter:` tags
  in `docs/index.html`, `docs/404.html` and `.lost` in `docs/style.css`): a 1200×630 PNG link preview of the hero,
  and a 404 page. Still open, for the user: a look on a real phone and desktop browser (smoothness, the slider by
  touch).
- **Who it's for** (`#who` in `docs/index.html`, `.audience` in `docs/style.css`, the "Who it's for" section of
  `docs/main.js`): heading "Built for big buildings.", a commercial panel (a drone flies lanes over a warehouse roof,
  a thermal grid fills in and shows wet insulation) and a residential panel (heat leaks glow on an apartment block
  and houses, a crosshair labels each), with client-type lists. The hero keeps its two links. Still frames: lane 4
  with the wet patch labelled; the window-frame leak labelled.
- **How it works** (`#how` in `docs/index.html`, `.how-*` in `docs/style.css`, the "How it works" section of
  `docs/main.js`): heading "From flight plan to report.", four steps (plan the flight, fly and capture, process,
  deliver the report) with animated icons, one active at a time with a filling bar, the others dimmed in their
  finished state; no durations. Still: every icon finished, none dimmed.
- **Sample deliverables** (`#deliverables` in `docs/index.html`, `.report` in `docs/style.css`, the "What you
  receive" section of `docs/main.js`): heading "A report, not a pile of images.", the deliverables (no file formats)
  beside a sample report page: letterhead, "Sample · illustrative data" stamp, a thermal image of a flat roof and a
  roof plan with findings 1–3, and a findings table whose rows highlight their markers (hover, focus, tap).
