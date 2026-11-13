# Upcoming changes

## Phases (current and upcoming)

- **Up next:** nothing planned; new requests go in `new.md`.
- **Later:** a contact form (see "Contact form" below); not to be built until the user asks.

## Decisions

- Custom domain `luxel.tech` (`docs/CNAME`).
- Layout: hero, then one section per core service, each with a scene drawn in code (no photos).
- Hero: a thermal scan sweeping up a point-cloud building.
- Logo, favicon and palette reused from Luxel's main site.
- No contact information for now.
- New sections go after the two service demos: who it's for, how it works, sample deliverables.
- Scenes use 2D canvas rather than WebGL: the point counts are small, and it needs no fallback.

## Contact form (later phase)

The request: a free contact form that emails Luxel and can't be used by scripts or for phishing. GitHub Pages can't
send email, so the form posts to a small service that sends it.

Decided so far:

- **Backend:** Cloudflare Turnstile (free bot check) plus a Cloudflare Worker (free plan) that verifies the token,
  checks a honeypot field and field lengths, rate-limits, and sends a plain-text email. The Worker's code goes in
  `worker/` (not served by Pages); the user deploys it with `wrangler` from their Cloudflare account.
- **Anti-abuse rules:** the recipient is fixed in the Worker (a secret, not in the repo or the page); no copy or
  auto-reply goes to the visitor; the visitor's address goes only in Reply-To.
- **Fields:** name, email, organisation, service of interest (Photogrammetry & Mapping, Thermography, Both, Not
  sure), and the message itself.
- **Placement:** a new last section, "Contact", after "What you receive", with its own rail icon and
  Previous/Next links.
- **DNS:** `luxel.tech` is on Namecheap, so Cloudflare Email Routing isn't available as it stands.

Open when this phase is planned:

- Sending: Resend (free plan, a few DNS records added at Namecheap) or moving the domain's DNS to Cloudflare
  (then Email Routing). Moving DNS means re-creating the GitHub Pages records there.
- Which fields are required (name, email and message are the likely ones), and the privacy note's wording.
- This reverses the earlier "no contact information" decision.


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
- **Section navigation** (`nav.rail` and the `.step-link`s in `docs/index.html`, the rail and step-link styles in
  `docs/style.css`, the section rail at the end of `docs/main.js`): six icons on the left (Home, Photogrammetry &
  Mapping, Thermography, Who it's for, How it works, Report), always visible, also on phones, with pop-out labels and
  the current section lit; "▴ Previous · <section>" / "▾ Next · <section>" links at each section's top and bottom,
  replacing the hero's "01"/"02" buttons. The link preview is unchanged.
