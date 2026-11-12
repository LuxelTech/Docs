# CLAUDE.md

Luxel's splash page (<https://luxel.tech/>): a static GitHub Pages site, one page, plain HTML/CSS/JS, no build, no
dependencies. Luxel does drone photogrammetry, aerial mapping and thermography for large commercial and residential
buildings; the page shows those services with animated scenes drawn in code (no photos).

- **What is served:** everything in `docs/` (`index.html`, `style.css`, `main.js`, `assets/`, `CNAME`). Pages deploys
  from `main` / `/docs`; `docs/.nojekyll` turns off Jekyll; `docs/CNAME` holds the custom domain.
- **What a push publishes:** a push to `main` puts the site live within about a minute. There are no workflows, so a
  push uses no Actions minutes.
- **Preview:** `python3 -m http.server <port> -d docs`.
- **Brand:** colours (`:root` in `style.css`) and the logo come from Luxel's main site. `assets/img/luxel-logo-700.webp`
  and `-1400.webp` (2× screens) are re-encoded from its 2172 px `luxel-logo.png`; `favicon.png` is copied as is.
- **Scenes:** `main.js` draws every scene on a 2D canvas. `addScene(canvas, { draw, still })` registers one: it is
  resized to the device pixel ratio, and drawn every frame only while on screen and the tab is visible. Each scene
  keeps its own clock (`t`, seconds while visible). `camera()` is the shared perspective projection (y up, `yaw`
  turns around the target, `pitch` looks down, up to top-down) and `ironbow()` the shared thermal colour ramp
  (also `--ironbow` in CSS). `hud(name, text)` sets the `[data-hud=name]` readouts in the overlay. Random values
  come from `seeded()`, so every visit looks the same.
- **Hero:** points sampled on a mid-rise block and a gabled house, each with a face normal (back faces are skipped)
  and a made-up temperature; sorted by temperature so each colour is drawn as one batch. A scan plane climbs over
  `HERO_SWEEP` s and recolours the points it has passed, holds, then fades back (`HERO_PERIOD`).
- **Photogrammetry:** one timeline in seconds (`PG`: capture, sparse, dense/mesh, tilt to top-down, tiles, hold,
  end). `pg` holds the blocks' faces (flat-shaded, with window quads), the points sampled on them (shuffled, so a
  growing prefix is a growing random subset), the drone's capture points and the site's ground features. The
  orthomosaic is the site drawn through the top-down camera, clipped to the tiles revealed so far. `setStage()`
  highlights the HUD stage list.
- **Motion:** every animation must stop under `prefers-reduced-motion: reduce`, in both `style.css` and `main.js`;
  in `main.js` each scene then draws its `still` time once.
- **Checking:** headless Chromium (Playwright) against the preview server: screenshots at 1440×900 and 390×844, no
  console errors, each canvas changes between two frames, and stays the same under `reducedMotion: 'reduce'`.
  Headless Chromium renders canvases in software, so judge smoothness on a real browser.
