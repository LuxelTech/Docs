# Upcoming changes

## Phases (current and upcoming)

- **Up next:** 1. Photogrammetry & Mapping demo section.
- **Then:** 2. Thermography demo section, then a polish pass (phone layout, performance, accessibility).
- **Later:** contact details (left out for now, by request).

## Decisions

- Custom domain `luxel.tech` (`docs/CNAME`).
- Layout: hero, then one section per core service, each with a scene drawn in code (no photos).
- Hero: a thermal scan sweeping up a point-cloud building.
- Logo, favicon and palette reused from Luxel's main site.
- No contact information for now.
- Scenes use 2D canvas rather than WebGL: the point counts are small, and it needs no fallback.

## 1. Photogrammetry & Mapping

Text column (orthomosaics, 3D models, measurements, roof and facade documentation) beside a canvas that loops
through four stages, named in a HUD stage list: a drone orbits a tower and leaves a camera frustum at each capture
point; sparse points appear; they densify and a shaded mesh fades in; the camera tilts to top-down and an
orthomosaic tiles in with a survey grid, ground control points and a scale bar. Still frame: the finished mesh.

## 2. Thermography

Text column (roof moisture, missing insulation, air leakage, electrical hot spots) beside a facade shown in visible
light, with a wipe that reveals the infrared view (auto-moving until the visitor drags it or uses the keyboard).
Hot spots pulse, with callouts giving their temperatures, and a °C colour scale. Still frame: wipe at 50%.

## Done

- **Scaffold and hero** (`docs/index.html`, `docs/style.css`, `docs/main.js` hero section): page chrome, logo,
  favicon, CNAME, the scene runner and the hero thermal scan.
