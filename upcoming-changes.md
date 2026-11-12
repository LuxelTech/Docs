# Upcoming changes

## Phases (current and upcoming)

- **Up next:** nothing planned.
- **Then:** nothing planned.
- **Later:** contact details (left out for now, by request).

## Decisions

- Custom domain `luxel.tech` (`docs/CNAME`).
- Layout: hero, then one section per core service, each with a scene drawn in code (no photos).
- Hero: a thermal scan sweeping up a point-cloud building.
- Logo, favicon and palette reused from Luxel's main site.
- No contact information for now.
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
