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

Every animation stops for visitors who ask their system for reduced motion; they see a still frame instead.

## Publishing

GitHub Pages serves the `docs/` folder of `main`; a push to `main` is live within about a minute.

One-time setup for the custom domain:

1. Repository **Settings → Pages**: deploy from branch `main`, folder `/docs`. Custom domain: `luxel.tech`
   (`docs/CNAME` already names it).
2. DNS for `luxel.tech`: `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and
   `185.199.111.153`, and a `www` `CNAME` to `luxeltech.github.io`.
3. Organization **Settings → Pages**: verify the domain, so no other repository can claim it.
4. Back in the repository's Pages settings, once the certificate is issued: **Enforce HTTPS**.
