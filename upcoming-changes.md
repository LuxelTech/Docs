# Upcoming changes

## Phases (current and upcoming)

- **Up next:** Who it's for.
- **Then:** 1. How it works. 2. Sample deliverables.
- **Later:** contact details (left out for now, by request).

## Who it's for

A section after the demos: one panel for commercial buildings (offices, warehouses, flat roofs), one for
residential (apartment blocks, homes, associations), each with a small drawn illustration. To plan.

## How it works

A four-step strip (plan the flight, fly and capture, process, deliver the report), each with a small animated icon
in the HUD style. To plan.

## Sample deliverables

A drawn mock-up of a Luxel inspection report page (thermal image, findings table, roof plan with markers): what a
client receives. To plan.

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
