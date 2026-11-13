# Luxel splash page

The splash page for Luxel Inspection Services at <https://luxel.tech/>: drone photogrammetry, aerial mapping and
thermography for large commercial and residential buildings. One static page with animated scenes drawn on canvas;
no build step and no dependencies.

## Preview

```sh
python3 -m http.server 8000 -d docs
```

Then open <http://localhost:8000/>.

## What is on the page

- **Hero:** the Luxel logo, "See What's Hidden." and a point-cloud building that a scan plane sweeps up, turning each
  point into its thermal colour.
- **Photogrammetry & Mapping:** what the service delivers, beside a drone that circles a building taking photos; the
  photos become a point cloud, a 3D model, and then a top-down orthomosaic map of the site.
- **Thermography:** what the service finds, beside a building facade split into a visible-light and an infrared view,
  with labelled problems (missing insulation, air leakage, moisture, an overheating breaker). Visitors drag the
  divider, or use the slider under it.
- **Who it's for:** a commercial panel (a drone surveys a warehouse roof and finds wet insulation) and a residential
  panel (heat leaks on an apartment block and a row of houses), each with the client types Luxel works for.
- **How it works:** four steps (plan the flight, fly and capture, process, deliver the report), each with a small
  animated icon; one step is active at a time while a bar over it fills.

Every animation stops for visitors who ask their system for reduced motion; they see a still frame instead.

Links shared to luxel.tech show `docs/assets/img/social-card.png` as their preview: the hero at 1200×630. After
changing the hero, regenerate it with `NODE_PATH=<folder holding playwright> node tools/social-card.js` (needs
Playwright with Chromium). Unknown addresses get `docs/404.html`.

## Publishing

GitHub Pages serves the `docs/` folder of `main`; a push to `main` is live within about a minute.

One-time setup for the custom domain:

1. Repository **Settings → Pages**: deploy from branch `main`, folder `/docs`. Custom domain: `luxel.tech`
   (`docs/CNAME` already names it).
2. DNS for `luxel.tech`: `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and
   `185.199.111.153` (optionally `AAAA` records to `2606:50c0:8000::153` through `2606:50c0:8003::153`), and a
   `www` `CNAME` to `luxeltech.github.io`.
3. Organization **Settings → Pages**: verify the domain (a `TXT` record GitHub gives you), so no other repository
   can claim it.
4. Back in the repository's Pages settings, once the certificate is issued: **Enforce HTTPS**.
