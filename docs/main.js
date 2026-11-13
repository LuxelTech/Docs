// Luxel splash page: the animated scenes, all drawn on 2D canvases (no libraries).
// Each scene is { canvas, draw(ctx, w, h, t), still } and only runs while it is on screen. Under
// prefers-reduced-motion every scene draws one still frame at time `still` instead of animating.
'use strict';

(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const TAU = Math.PI * 2;
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const ease = (v) => v * v * (3 - 2 * v);
    const mix = (a, b, k) => a + (b - a) * k;

    // ---------- thermal colour ramp ("ironbow", as thermal cameras show it) ----------
    const RAMP = [
        [0, 20, 10, 46], [0.22, 91, 26, 154], [0.45, 210, 48, 122],
        [0.65, 255, 122, 26], [0.85, 255, 178, 28], [1, 255, 244, 176],
    ];
    const LUT = [];
    for (let i = 0; i < 256; i++) {
        const v = i / 255;
        let j = 1;
        while (RAMP[j][0] < v) j++;
        const a = RAMP[j - 1], b = RAMP[j], k = (v - a[0]) / (b[0] - a[0]);
        LUT.push([mix(a[1], b[1], k) | 0, mix(a[2], b[2], k) | 0, mix(a[3], b[3], k) | 0]);
    }
    const ironbow = (v) => LUT[clamp(v) * 255 | 0];
    const css = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;

    // ---------- a perspective camera orbiting a target (y is up) ----------
    // yaw turns around the target, pitch looks down from above (up to ~π/2 for top-down).
    function camera(w, h, { yaw, pitch, dist, target = [0, 0, 0], fov = 0.9 }) {
        const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
        const eye = [target[0] + dist * sy * cp, target[1] + dist * sp, target[2] + dist * cy * cp];
        const f = [-sy * cp, -sp, -cy * cp];         // forward
        const r = [cy, 0, -sy];                       // right, always horizontal
        const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
        const F = Math.min(w, h) * 0.5 / Math.tan(fov / 2);
        const out = [0, 0, 0];
        return {
            F,
            eye,
            // Returns [screen x, screen y, depth] in a reused array; depth <= 0 is behind the camera.
            project(x, y, z) {
                const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
                const d = dx * f[0] + dy * f[1] + dz * f[2];
                out[0] = w / 2 + (dx * r[0] + dz * r[2]) * F / d;
                out[1] = h / 2 - (dx * u[0] + dy * u[1] + dz * u[2]) * F / d;
                out[2] = d;
                return out;
            },
        };
    }

    // ---------- the scene runner ----------
    const scenes = [];
    let raf = 0, last = 0;

    function addScene(canvas, scene) {
        if (!canvas) return;
        const s = { canvas, ctx: canvas.getContext('2d'), t: 0, visible: false, w: 0, h: 0, ...scene };
        scenes.push(s);
        new ResizeObserver(() => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            s.w = canvas.clientWidth;
            s.h = canvas.clientHeight;
            canvas.width = Math.round(s.w * dpr);
            canvas.height = Math.round(s.h * dpr);
            s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            render(s);
        }).observe(canvas);
        new IntersectionObserver(([e]) => {
            s.visible = e.isIntersecting;
            start();
        }).observe(canvas);
        return s;
    }

    function render(s) {
        if (!s.w || !s.h) return;
        s.ctx.clearRect(0, 0, s.w, s.h);
        s.draw(s.ctx, s.w, s.h, reduce.matches ? s.still : s.t);
    }

    function frame(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        let any = false;
        for (const s of scenes) {
            if (!s.visible) continue;
            any = true;
            s.t += dt;
            render(s);
        }
        raf = any ? requestAnimationFrame(frame) : 0;
    }

    function start() {
        if (reduce.matches || document.hidden || raf) return;
        if (!scenes.some((s) => s.visible)) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
    }

    function stop() {
        cancelAnimationFrame(raf);
        raf = 0;
    }

    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    reduce.addEventListener('change', () => {
        stop();
        scenes.forEach(render);
        start();
    });

    // Sets the text of a HUD readout (only when it changes, so the DOM is not touched every frame).
    function hud(name, text) {
        for (const el of document.querySelectorAll(`[data-hud="${name}"]`)) {
            if (el.textContent !== text) el.textContent = text;
        }
    }

    // ======================================================================================
    // Hero: a point cloud of a mid-rise block and a gabled house. A scan plane sweeps up them
    // and every point it has passed shows its temperature on the ironbow ramp.
    // ======================================================================================
    const HERO_PERIOD = 10;      // seconds per scan: sweep, hold, fade back
    const HERO_SWEEP = 6.5;
    const HERO_HOLD = 8.5;
    const HERO_TOP = 5.4;        // height the scan plane climbs to
    const HERO_BUCKETS = 32;     // points are drawn in batches of one colour each

    // Points sampled on the surfaces, with a made-up temperature (0..1) for each.
    const hero = (() => {
        const pts = [];
        const rand = seeded(7);
        const blob = (x, y, z, cx, cy, cz, r) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / (r * r));

        // Mid-rise block: 8 floors of windows on every side.
        const BX = 1.5, BZ = 1.15, BH = 5.2, FLOOR = BH / 8, OFF = -1.4;
        const win = (u, y, half) => {          // is (u along the facade, y) inside a window, and how near its frame?
            const fy = (y % FLOOR) / FLOOR;
            const n = Math.round(half * 2 / 0.6);
            const cw = half * 2 / n, fu = ((u + half) % cw) / cw;
            const inside = fy > 0.3 && fy < 0.8 && fu > 0.2 && fu < 0.8 && y > FLOOR * 0.9;
            const edge = Math.min(Math.abs(fy - 0.3), Math.abs(fy - 0.8), Math.abs(fu - 0.2), Math.abs(fu - 0.8));
            return { inside, edge, slab: Math.min(fy, 1 - fy) };
        };
        const blockHeat = (x, y, z, w) => {
            let h = 0.3 + (rand() - 0.5) * 0.05;
            if (y > FLOOR * 0.9) h += 0.32 * Math.exp(-w.edge * 30);   // heat loss round window frames
            h += 0.14 * Math.exp(-w.slab * 22);                       // floor slabs bridge heat out
            h += 0.5 * blob(x, y, z, OFF + 0.5, 3.1, BZ, 0.55);       // missing insulation
            h += 0.45 * blob(x, y, z, OFF - BX, 1.6, 0.2, 0.5);       // wet wall
            return h;
        };
        // Each point is x, y, z, the normal of its face (nx, ny, nz) and its temperature.
        const add = (x, y, z, nx, ny, nz, h) => pts.push(x, y, z, nx, ny, nz, h);
        const S = 0.085;
        const glass = (x, y, z) => 0.62 + rand() * 0.06 + 0.4 * blob(x, y, z, OFF + 0.5, 3.1, BZ, 0.55);
        for (let u = -BX; u <= BX; u += S) {
            for (let y = 0; y <= BH; y += S) {
                for (const side of [-1, 1]) {
                    const x = OFF + u + (rand() - 0.5) * S * 0.6, jy = y + (rand() - 0.5) * S * 0.6, z = side * BZ;
                    const w = win(x - OFF, jy, BX);
                    if (!w.inside) add(x, jy, z, 0, 0, side, blockHeat(x, jy, z, w));
                    else if (rand() < 0.3) add(x, jy, z, 0, 0, side, glass(x, jy, z));
                }
            }
        }
        for (let u = -BZ; u <= BZ; u += S) {
            for (let y = 0; y <= BH; y += S) {
                for (const side of [-1, 1]) {
                    const z = u + (rand() - 0.5) * S * 0.6, jy = y + (rand() - 0.5) * S * 0.6, x = OFF + side * BX;
                    const w = win(z, jy, BZ);
                    if (!w.inside) add(x, jy, z, side, 0, 0, blockHeat(x, jy, z, w));
                    else if (rand() < 0.3) add(x, jy, z, side, 0, 0, glass(x, jy, z));
                }
            }
        }
        for (let x = -BX; x <= BX; x += S * 1.3) {
            for (let z = -BZ; z <= BZ; z += S * 1.3) {
                const px = OFF + x + (rand() - 0.5) * 0.05;
                add(px, BH, z, 0, 1, 0, 0.3 + 0.55 * blob(px, BH, z, OFF + 0.7, BH, -0.4, 0.6)); // ponding on the roof
            }
        }

        // Gabled house beside it, ridge along x, with a warm attic ridge and a leaky door.
        const HX0 = 0.8, HX1 = 3.0, HZ = 0.9, WALL = 1.2, RIDGE = 2.1, EAVE = 0.15;
        const houseHeat = (x, y, z) => 0.2 + (rand() - 0.5) * 0.06
            + 0.45 * Math.exp(-(((RIDGE - y) * 3) ** 2))              // heat escaping at the ridge
            + 0.55 * blob(x, y, z, 1.9, 0.5, HZ, 0.3);              // air leak round the door
        const HS = 0.08;
        const slope = Math.hypot(RIDGE - WALL, HZ + EAVE), ny = (HZ + EAVE) / slope, nz = (RIDGE - WALL) / slope;
        for (let x = HX0; x <= HX1; x += HS) {
            for (let y = 0; y <= WALL; y += HS) {
                for (const side of [-1, 1]) add(x, y, side * HZ, 0, 0, side, houseHeat(x, y, side * HZ));
            }
            for (let k = 0; k <= 1; k += HS / 1.65) {            // two roof planes
                const y = mix(WALL, RIDGE, k), z = mix(HZ + EAVE, 0, k);
                for (const side of [-1, 1]) add(x, y, side * z, 0, ny, side * nz, houseHeat(x, y, side * z));
            }
        }
        for (let z = -HZ; z <= HZ; z += HS) {
            const top = mix(RIDGE, WALL, Math.abs(z) / HZ);
            for (let y = 0; y <= top; y += HS) {
                for (const side of [-1, 1]) add(side < 0 ? HX0 : HX1, y, z, side, 0, 0, houseHeat(side < 0 ? HX0 : HX1, y, z));
            }
        }

        // Sort by temperature so each colour bucket is one contiguous run.
        const n = pts.length / 7, order = [...Array(n).keys()].sort((a, b) => pts[a * 7 + 6] - pts[b * 7 + 6]);
        const xyz = new Float32Array(n * 3), nrm = new Float32Array(n * 3), heat = new Float32Array(n);
        const starts = new Int32Array(HERO_BUCKETS + 1);
        order.forEach((o, i) => {
            xyz.set(pts.slice(o * 7, o * 7 + 3), i * 3);
            nrm.set(pts.slice(o * 7 + 3, o * 7 + 6), i * 3);
            heat[i] = clamp(pts[o * 7 + 6]);
        });
        for (let b = 0, i = 0; b <= HERO_BUCKETS; b++) {
            while (i < n && heat[i] * HERO_BUCKETS < b) i++;
            starts[b] = i;
        }
        // Box edges for the faint wireframe.
        const edges = [];
        const box = (x0, x1, y0, y1, z0, z1) => {
            const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
            [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
                .forEach(([a, b]) => edges.push(c[a], c[b]));
        };
        box(OFF - BX, OFF + BX, 0, BH, -BZ, BZ);
        box(HX0, HX1, 0, WALL, -HZ, HZ);
        edges.push([HX0, RIDGE, 0], [HX1, RIDGE, 0], [HX0, WALL, -HZ], [HX0, RIDGE, 0], [HX0, WALL, HZ], [HX0, RIDGE, 0],
            [HX1, WALL, -HZ], [HX1, RIDGE, 0], [HX1, WALL, HZ], [HX1, RIDGE, 0]);
        return { n, xyz, nrm, heat, starts, edges, colours: [...Array(HERO_BUCKETS)].map((_, b) => css(ironbow((b + 0.5) / HERO_BUCKETS))) };
    })();

    // A small deterministic random generator, so every visit looks the same.
    function seeded(seed) {
        return () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };
    }

    function drawHero(ctx, w, h, t) {
        const p = t % HERO_PERIOD;
        const scanY = ease(clamp(p / HERO_SWEEP)) * HERO_TOP;
        const fade = 1 - ease(clamp((p - HERO_HOLD) / (HERO_PERIOD - HERO_HOLD)));
        const cam = camera(w, h, { yaw: 0.7 + t * 0.12, pitch: 0.3, dist: 12.5, target: [0.2, 2.3, 0], fov: 0.72 });
        const { n, xyz, nrm, heat, starts, colours } = hero;
        const sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const e = cam.eye, k = i * 3;   // faces turned away from the camera are left out (size 0)
            if ((e[0] - xyz[k]) * nrm[k] + (e[1] - xyz[k + 1]) * nrm[k + 1] + (e[2] - xyz[k + 2]) * nrm[k + 2] < 0) {
                sz[i] = 0;
                continue;
            }
            const q = cam.project(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]);
            sx[i] = q[0];
            sy[i] = q[1];
            sz[i] = clamp(0.05 * cam.F / q[2], 1, 3.8);
        }
        const scanned = (i) => xyz[i * 3 + 1] <= scanY;

        // Wireframe and ground ring.
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(92,200,255,0.16)';
        ctx.beginPath();
        for (let i = 0; i < hero.edges.length; i += 2) {
            const a = cam.project(...hero.edges[i]);
            ctx.moveTo(a[0], a[1]);
            const b = cam.project(...hero.edges[i + 1]);
            ctx.lineTo(b[0], b[1]);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,122,26,0.18)';
        for (const r of [4.2, 5.2]) {
            ctx.beginPath();
            for (let a = 0; a <= TAU + 0.01; a += TAU / 72) {
                const q = cam.project(Math.cos(a) * r, 0, Math.sin(a) * r);
                a === 0 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]);
            }
            ctx.stroke();
        }

        // Cold points (not scanned yet, or fading back after the hold).
        ctx.fillStyle = 'rgba(92,200,255,0.55)';
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            if (sz[i] && (!scanned(i) || fade < 1)) {
                const s = sz[i] * 0.8;
                ctx.rect(sx[i] - s / 2, sy[i] - s / 2, s, s);
            }
        }
        ctx.globalAlpha = fade < 1 ? 1 - fade * 0.7 : 1;
        ctx.fill();

        // Scanned points in their thermal colours.
        ctx.globalAlpha = fade;
        let tmax = 0;
        for (let b = 0; b < HERO_BUCKETS; b++) {
            ctx.fillStyle = colours[b];
            ctx.beginPath();
            let any = false;
            for (let i = starts[b]; i < starts[b + 1]; i++) {
                if (!sz[i] || !scanned(i)) continue;
                any = true;
                tmax = heat[i];
                const s = sz[i];
                ctx.rect(sx[i] - s / 2, sy[i] - s / 2, s, s);
            }
            if (any) ctx.fill();
        }
        ctx.globalAlpha = 1;

        // The scan plane itself, with a bright edge where it cuts the buildings.
        if (p < HERO_HOLD) {
            const corners = [[-3.4, -1.9], [3.5, -1.9], [3.5, 1.9], [-3.4, 1.9]].map(([x, z]) => [...cam.project(x, scanY, z)]);
            ctx.beginPath();
            corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,122,26,0.07)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,178,28,0.75)';
            ctx.shadowColor = '#ff7a1a';
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff4b0';
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                if (sz[i] && Math.abs(xyz[i * 3 + 1] - scanY) < 0.06) ctx.rect(sx[i] - 1, sy[i] - 1, 2, 2);
            }
            ctx.fill();
        }

        hud('scan', `${Math.round(scanY / HERO_TOP * 100)}%`);
        hud('tmax', scanY > 0.05 ? (12 + tmax * 30).toFixed(1) : '--.-');
    }

    addScene(document.getElementById('hero-canvas'), { draw: drawHero, still: 4.6 });
    // ======================================================================================
    // Photogrammetry & Mapping: a drone circles a tower and its wing taking photos (camera frusta),
    // the photos become a sparse then dense point cloud, a shaded mesh, and finally the view turns
    // top-down while an orthomosaic tiles in. 1 unit = 5 m.
    // ======================================================================================
    const PG = { CAPTURE: 5, SPARSE: 8, DENSE: 11.5, TILT: 13.5, TILES: 16.5, HOLD: 18.2, END: 19 };
    const PG_TARGET = [0.6, 2.6, 0.3];
    const PG_LIGHT = (() => { const l = [0.45, 0.8, 0.4], m = Math.hypot(...l); return l.map((v) => v / m); })();
    const PG_TILE = 1.75, PG_TILES_N = 8;        // the orthomosaic is 8 × 8 tiles of 1.75 units, centred on 0, 0

    const pg = (() => {
        const rand = seeded(11);
        // Blocks: x0, x1, z0, z1, height, floors (0 = no windows), wall and roof colours.
        const boxes = [
            { x: [-1.3, 1.3], z: [-1.3, 1.3], y: [0, 6.4], floors: 10, wall: [120, 128, 140], roof: [132, 136, 142] },
            { x: [1.3, 4.6], z: [-1.1, 1.6], y: [0, 2.2], floors: 3, wall: [104, 110, 122], roof: [92, 96, 104] },
            { x: [-0.8, -0.2], z: [-0.7, -0.1], y: [6.4, 6.75], floors: 0, wall: [150, 154, 160], roof: [178, 182, 188] },
            { x: [0.3, 0.9], z: [0.2, 0.8], y: [6.4, 6.7], floors: 0, wall: [150, 154, 160], roof: [178, 182, 188] },
        ];
        // Faces with their corners, outward normal, flat-shaded colour and window quads.
        const faces = [];
        const shade = (c, n) => {
            const d = Math.max(0, n[0] * PG_LIGHT[0] + n[1] * PG_LIGHT[1] + n[2] * PG_LIGHT[2]);
            return c.map((v) => Math.round(v * (0.38 + 0.62 * d)));
        };
        for (const b of boxes) {
            const [x0, x1] = b.x, [z0, z1] = b.z, [y0, y1] = b.y;
            const sides = [
                { n: [0, 0, 1], c: [[x0, z1], [x1, z1]] }, { n: [0, 0, -1], c: [[x1, z0], [x0, z0]] },
                { n: [1, 0, 0], c: [[x1, z1], [x1, z0]] }, { n: [-1, 0, 0], c: [[x0, z0], [x0, z1]] },
            ];
            for (const { n, c: [[ax, az], [bx, bz]] } of sides) {
                const wins = [];
                if (b.floors) {
                    const len = Math.hypot(bx - ax, bz - az), cols = Math.max(2, Math.round(len / 0.55)), fh = (y1 - y0) / b.floors;
                    for (let f = 0; f < b.floors; f++) {
                        for (let k = 0; k < cols; k++) {
                            const u0 = (k + 0.18) / cols, u1 = (k + 0.82) / cols, v0 = y0 + fh * (f + 0.28), v1 = y0 + fh * (f + 0.8);
                            const p = (u, v) => [mix(ax, bx, u), v, mix(az, bz, u)];
                            wins.push([p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1)]);
                        }
                    }
                }
                faces.push({ n, pts: [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], fill: css(shade(b.wall, n)), wins });
            }
            faces.push({ n: [0, 1, 0], pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], fill: css(shade(b.roof, [0, 1, 0])), wins: [] });
        }
        // Points on every face (grey from the face's shade) plus the ground, in random order so a
        // growing prefix of them is a growing random subset.
        const pts = [];
        for (const f of faces) {
            const [a, b, , d] = f.pts, g = css(shade([215, 215, 225], f.n));
            const lu = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), lv = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
            const count = Math.round(lu * lv / 0.018);
            for (let i = 0; i < count; i++) {
                const u = rand(), v = rand();
                pts.push({ p: [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u + (d[k] - a[k]) * v), g });
            }
        }
        for (let i = 0; i < 1400; i++) {
            const x = (rand() - 0.5) * 13, z = (rand() - 0.5) * 13;
            pts.push({ p: [x, 0, z], g: 'rgb(110,104,96)' });
        }
        for (let i = pts.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [pts[i], pts[j]] = [pts[j], pts[i]];
        }
        const greys = [...new Set(pts.map((q) => q.g))];
        const xyz = new Float32Array(pts.length * 3), grey = new Uint8Array(pts.length);
        pts.forEach((q, i) => {
            xyz.set(q.p, i * 3);
            grey[i] = greys.indexOf(q.g);
        });

        // Capture points: two rings (high and low), 24 photos each.
        const shots = [];
        for (const [ring, y, r, aim] of [[0, 7.4, 6.2, 2.4], [1, 3.8, 6.8, 1.6]]) {
            for (let k = 0; k < 24; k++) {
                const a = (k / 24 + ring * 0.02) * TAU;
                shots.push({ pos: [PG_TARGET[0] + Math.cos(a) * r, y, PG_TARGET[2] + Math.sin(a) * r], aim: [PG_TARGET[0], aim, PG_TARGET[2]] });
            }
        }

        // The site seen from above (the orthomosaic), drawn on the ground plane.
        const ground = [
            { fill: '#1f2d1c', poly: [[-7, -7], [7, -7], [7, 7], [-7, 7]] },                       // lawn
            { fill: '#2a2a30', poly: [[-7, 4.9], [7, 4.9], [7, 6.4], [-7, 6.4]] },                 // road
            { fill: '#2d2d33', poly: [[-6.4, -5.2], [-2.1, -5.2], [-2.1, 4.9], [-6.4, 4.9]] },     // car park
            { fill: '#5f5c58', poly: [[-2.1, -2.2], [5.4, -2.2], [5.4, 2.5], [-2.1, 2.5]] },       // plaza
            { fill: '#4d4a46', poly: [[2.2, 2.5], [3.0, 2.5], [3.0, 4.9], [2.2, 4.9]] },           // path to road
        ];
        const lines = [];                                     // parking bays and road markings
        for (let z = -4.8; z <= 4.4; z += 0.55) lines.push([[-6.2, z], [-5.1, z]], [[-3.4, z], [-2.3, z]]);
        for (let x = -6.6; x < 7; x += 0.9) lines.push([[x, 5.65], [x + 0.45, 5.65]]);
        const trees = [];
        for (let i = 0; i < 26; i++) {
            const side = i % 2, x = side ? 5.6 + rand() * 1.2 : -1.4 + rand() * 7, z = side ? -6.5 + rand() * 11 : -3.2 - rand() * 3.5;
            trees.push([x, z, 0.3 + rand() * 0.35]);
        }
        const gcps = [[-5.8, -6.2], [6.2, -6.0], [6.0, 4.3], [-5.6, 4.2]];
        return { faces, xyz, grey, greys, n: pts.length, shots, ground, lines, trees, gcps };
    })();

    // Draws a polygon of [x, y, z] points through the camera.
    function poly3(ctx, cam, pts) {
        ctx.beginPath();
        pts.forEach((p, i) => {
            const q = cam.project(p[0], p[1], p[2]);
            i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        });
        ctx.closePath();
    }

    function drawMesh(ctx, cam, alpha, ortho) {
        const visible = [];
        for (const f of pg.faces) {
            const c = f.pts.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
            const e = cam.eye;
            if ((e[0] - c[0]) * f.n[0] + (e[1] - c[1]) * f.n[1] + (e[2] - c[2]) * f.n[2] <= 0) continue;
            visible.push([Math.hypot(e[0] - c[0], e[1] - c[1], e[2] - c[2]), f]);
        }
        visible.sort((a, b) => b[0] - a[0]);
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        for (const [, f] of visible) {
            poly3(ctx, cam, f.pts);
            ctx.fillStyle = f.fill;
            ctx.fill();
            ctx.strokeStyle = ortho ? 'rgba(0,0,0,0.35)' : 'rgba(255,178,28,0.35)';
            ctx.stroke();
            ctx.fillStyle = 'rgba(20,34,52,0.78)';
            for (const w of f.wins) {
                poly3(ctx, cam, w);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawSite(ctx, cam) {
        for (const g of pg.ground) {
            poly3(ctx, cam, g.poly.map(([x, z]) => [x, 0, z]));
            ctx.fillStyle = g.fill;
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(230,230,230,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const [[ax, az], [bx, bz]] of pg.lines) {
            const a = cam.project(ax, 0, az);
            ctx.moveTo(a[0], a[1]);
            const b = cam.project(bx, 0, bz);
            ctx.lineTo(b[0], b[1]);
        }
        ctx.stroke();
        for (const [x, z, r] of pg.trees) {
            const q = cam.project(x, 0.4, z), s = r * cam.F / q[2];
            ctx.fillStyle = '#2c4423';
            ctx.beginPath();
            ctx.arc(q[0], q[1], s, 0, TAU);
            ctx.fill();
            ctx.fillStyle = 'rgba(120,160,80,0.35)';
            ctx.beginPath();
            ctx.arc(q[0] - s * 0.25, q[1] - s * 0.25, s * 0.55, 0, TAU);
            ctx.fill();
        }
    }

    function frustum(ctx, cam, shot, size) {
        const [px, py, pz] = shot.pos, d = shot.aim.map((v, k) => v - shot.pos[k]), m = Math.hypot(...d);
        const f = d.map((v) => v / m), r = [-f[2], 0, f[0]], rm = Math.hypot(...r);
        r[0] /= rm; r[2] /= rm;
        const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
        const corner = (sx, sy) => [0, 1, 2].map((k) => shot.pos[k] + (f[k] + (r[k] * sx + u[k] * sy) * 0.6) * size);
        const apex = [...cam.project(px, py, pz)];
        const cs = [corner(-1, -0.7), corner(1, -0.7), corner(1, 0.7), corner(-1, 0.7)].map((c) => [...cam.project(...c)]);
        ctx.beginPath();
        for (const c of cs) {
            ctx.moveTo(apex[0], apex[1]);
            ctx.lineTo(c[0], c[1]);
        }
        cs.forEach((c, i) => (i ? ctx.lineTo(c[0], c[1]) : ctx.moveTo(c[0], c[1])));
        ctx.closePath();
        ctx.stroke();
    }

    let pgStage = -1;
    function setStage(i) {
        if (i === pgStage) return;
        pgStage = i;
        document.querySelectorAll('[data-stages] li').forEach((li, k) => li.classList.toggle('is-active', k === i));
    }

    function drawPhotogrammetry(ctx, w, h, t) {
        t %= PG.END;
        const tilt = ease(clamp((t - PG.DENSE) / (PG.TILT - PG.DENSE)));
        const orbitYaw = 0.5 + Math.min(t, PG.DENSE) * 0.05;
        const cam = camera(w, h, {
            yaw: mix(orbitYaw, 0, tilt), pitch: mix(0.36, Math.PI / 2, tilt), dist: mix(19.5, 20, tilt),
            target: [mix(PG_TARGET[0], 0, tilt), mix(PG_TARGET[1], 0, tilt), mix(PG_TARGET[2], 0, tilt)], fov: 0.75,
        });
        setStage(t < PG.CAPTURE ? 0 : t < PG.SPARSE ? 1 : t < PG.TILT ? 2 : 3);
        ctx.globalAlpha = 1;
        const out = 1 - clamp((t - PG.HOLD) / (PG.END - PG.HOLD));

        // Ground grid (fades as the orthomosaic arrives).
        ctx.strokeStyle = `rgba(92,200,255,${0.12 * out})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = -7; k <= 7; k += 1) {
            let a = cam.project(k, 0, -7), b;
            ctx.moveTo(a[0], a[1]);
            b = cam.project(k, 0, 7);
            ctx.lineTo(b[0], b[1]);
            a = cam.project(-7, 0, k);
            ctx.moveTo(a[0], a[1]);
            b = cam.project(7, 0, k);
            ctx.lineTo(b[0], b[1]);
        }
        ctx.stroke();

        // A faint outline of the building until the mesh replaces it.
        if (t < PG.SPARSE + 2) {
            ctx.strokeStyle = `rgba(92,200,255,${0.35 * (1 - clamp((t - PG.SPARSE) / 2))})`;
            ctx.lineWidth = 1;
            for (const f of pg.faces) {
                poly3(ctx, cam, f.pts);
                ctx.stroke();
            }
        }

        // Stage 1: capture. Frusta stay behind the drone and fade during alignment.
        const shotsTaken = Math.min(pg.shots.length, Math.floor(clamp(t / PG.CAPTURE) * pg.shots.length + 0.0001));
        const frustaAlpha = t < PG.CAPTURE ? 1 : 1 - clamp((t - PG.CAPTURE) / (PG.SPARSE - PG.CAPTURE + 1));
        if (frustaAlpha > 0) {
            ctx.lineWidth = 1;
            for (let i = 0; i < shotsTaken; i++) {
                const age = t < PG.CAPTURE ? (shotsTaken - 1 - i) : 99;
                ctx.strokeStyle = age < 1 ? `rgba(255,244,176,${frustaAlpha})` : `rgba(255,122,26,${0.45 * frustaAlpha})`;
                frustum(ctx, cam, pg.shots[i], age < 1 ? 0.9 : 0.6);
            }
        }
        if (t < PG.CAPTURE) {
            // The drone flies between capture points.
            const k = clamp(t / PG.CAPTURE) * pg.shots.length, i = Math.min(pg.shots.length - 1, Math.floor(k)), j = (i + 1) % pg.shots.length;
            const a = pg.shots[i].pos, b = pg.shots[j].pos, f = k - i;
            const q = cam.project(mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)), s = 0.32 * cam.F / q[2];
            ctx.strokeStyle = '#f5f1f8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(q[0] - s, q[1] - s * 0.4);
            ctx.lineTo(q[0] + s, q[1] + s * 0.4);
            ctx.moveTo(q[0] + s, q[1] - s * 0.4);
            ctx.lineTo(q[0] - s, q[1] + s * 0.4);
            ctx.stroke();
            for (const [dx, dy] of [[-1, -0.4], [1, 0.4], [1, -0.4], [-1, 0.4]]) {
                ctx.beginPath();
                ctx.ellipse(q[0] + dx * s, q[1] + dy * s, s * 0.5, s * 0.2, 0, 0, TAU);
                ctx.stroke();
            }
            ctx.fillStyle = (t * 4) % 1 < 0.5 ? '#ff3c88' : '#ffb21c';
            ctx.beginPath();
            ctx.arc(q[0], q[1], 2.2, 0, TAU);
            ctx.fill();
        }
        hud('images', String(Math.round(shotsTaken / pg.shots.length * 412)));

        // Stages 2–3: points appear (sparse, then dense), then the mesh covers them.
        const meshAlpha = ease(clamp((t - (PG.SPARSE + 1.5)) / 2));
        if (t >= PG.CAPTURE && meshAlpha < 1) {
            const frac = t < PG.SPARSE ? 0.12 * ease(clamp((t - PG.CAPTURE) / (PG.SPARSE - PG.CAPTURE))) : mix(0.12, 1, ease(clamp((t - PG.SPARSE) / 1.5)));
            const count = Math.floor(pg.n * frac);
            const size = t < PG.SPARSE ? 2.2 : 1.6;
            ctx.globalAlpha = 1 - meshAlpha;
            for (let gi = 0; gi < pg.greys.length; gi++) {
                ctx.fillStyle = t < PG.SPARSE ? 'rgba(255,190,90,0.9)' : pg.greys[gi];
                ctx.beginPath();
                for (let i = 0; i < count; i++) {
                    if (pg.grey[i] !== gi) continue;
                    const q = cam.project(pg.xyz[i * 3], pg.xyz[i * 3 + 1], pg.xyz[i * 3 + 2]);
                    ctx.rect(q[0] - size / 2, q[1] - size / 2, size, size);
                }
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // Stage 4: the orthomosaic tiles in along a lawnmower path once the view is top-down.
        const tiles = t < PG.TILT ? 0 : Math.floor(ease(clamp((t - PG.TILT) / (PG.TILES - PG.TILT))) * PG_TILES_N * PG_TILES_N + 0.0001);
        const half = PG_TILE * PG_TILES_N / 2;
        const tileRect = (i) => {
            const row = Math.floor(i / PG_TILES_N), col = row % 2 ? PG_TILES_N - 1 - (i % PG_TILES_N) : i % PG_TILES_N;
            const x0 = -half + col * PG_TILE, z0 = -half + row * PG_TILE;
            return [[x0, 0, z0], [x0 + PG_TILE, 0, z0], [x0 + PG_TILE, 0, z0 + PG_TILE], [x0, 0, z0 + PG_TILE]];
        };
        if (meshAlpha > 0) drawMesh(ctx, cam, meshAlpha * out, false);
        if (tiles > 0) {
            ctx.save();
            ctx.beginPath();
            for (let i = 0; i < tiles; i++) {
                tileRect(i).forEach((p, k) => {
                    const q = cam.project(...p);
                    k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
                });
                ctx.closePath();
            }
            ctx.clip();
            ctx.globalAlpha = out;
            drawSite(ctx, cam);
            drawMesh(ctx, cam, out, true);
            ctx.restore();

            // Survey grid, the tile being captured, ground control points and a scale bar.
            ctx.globalAlpha = out;
            ctx.strokeStyle = 'rgba(255,178,28,0.22)';
            ctx.lineWidth = 1;
            for (let i = 0; i < PG_TILES_N * PG_TILES_N; i++) {
                poly3(ctx, cam, tileRect(i));
                ctx.stroke();
            }
            if (tiles < PG_TILES_N * PG_TILES_N) {
                poly3(ctx, cam, tileRect(tiles));
                ctx.fillStyle = 'rgba(255,122,26,0.25)';
                ctx.fill();
                ctx.strokeStyle = '#ffb21c';
                ctx.stroke();
            }
            ctx.font = '600 10px ui-monospace, Consolas, monospace';
            pg.gcps.forEach(([x, z], i) => {
                const q = cam.project(x, 0, z);
                ctx.strokeStyle = '#ffd84c';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(q[0], q[1], 7, 0, TAU);
                ctx.moveTo(q[0] - 11, q[1]);
                ctx.lineTo(q[0] + 11, q[1]);
                ctx.moveTo(q[0], q[1] - 11);
                ctx.lineTo(q[0], q[1] + 11);
                ctx.stroke();
                ctx.fillStyle = '#ffd84c';
                ctx.fillText(`GCP ${i + 1}`, q[0] + 10, q[1] - 9);
            });
            const a = cam.project(-6.6, 0, 6.75), b = cam.project(-2.6, 0, 6.75);   // 4 units = 20 m
            ctx.strokeStyle = '#f5f1f8';
            ctx.beginPath();
            ctx.moveTo(a[0], a[1] - 4);
            ctx.lineTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.lineTo(b[0], b[1] - 4);
            ctx.stroke();
            ctx.fillStyle = '#f5f1f8';
            ctx.fillText('20 m', a[0], a[1] - 8);
            ctx.globalAlpha = 1;
        }
    }

    addScene(document.getElementById('pg-canvas'), { draw: drawPhotogrammetry, still: PG.DENSE });

    // ======================================================================================
    // Thermography: an apartment block over shops, drawn once in visible light and once as an
    // infrared image computed from a made-up temperature field. A wipe shows one over the other;
    // it moves by itself until the visitor drags it or uses the slider. Facade units: 800 × 560.
    // ======================================================================================
    const IR_W = 800, IR_H = 560;
    const IR_MIN = -2, IR_MAX = 22;                   // °C at the ends of the colour scale
    const IR_BX = [110, 690], IR_TOP = 110, IR_SHOP = 400, IR_GROUND = 500;
    const IR_FLOOR = (IR_SHOP - IR_TOP) / 3;
    const IR_COLS = [...Array(6)].map((_, i) => IR_BX[0] + 48 + i * (IR_BX[1] - IR_BX[0]) / 6);

    const blob2 = (x, y, cx, cy, rx, ry = rx) => Math.exp(-(((x - cx) / rx) ** 2) - (((y - cy) / ry) ** 2));

    // Surface temperature in °C at a facade point.
    function irTemp(x, y, noise = 0) {
        if (y < 90 && !(x > 520 && x < 600 && y > 58)) return -18 + y * 0.05;          // clear night sky
        if (y >= IR_GROUND) return 3.5 + (y - IR_GROUND) * 0.01 + noise;              // pavement
        if (x < IR_BX[0] || x > IR_BX[1]) return y < IR_TOP ? -18 : -14 + y * 0.02;    // sky beside the block
        if (y < 90) return 16 + 10 * blob2(x, y, 560, 66, 30, 14);                     // rooftop unit exhaust
        let t = 5.5 + noise;
        if (y < IR_TOP) return t - 1;                                                  // parapet
        if (y >= IR_SHOP) {                                                            // shopfront
            const lx = (x - IR_BX[0]) % 116;
            const glass = y > IR_SHOP + 14 && y < IR_GROUND - 6 && lx > 8 && lx < 108;
            t = glass ? 11.5 : 8;
            const door = Math.abs(x - 400) < 26 && y > IR_SHOP + 14;
            if (door) t = 12 + 6 * Math.max(0, 1 - Math.min(Math.abs(Math.abs(x - 400) - 24), Math.abs(y - IR_SHOP - 16)) / 5);
            t += 5 * blob2(x, y, 656, 445, 20, 28) + 44 * blob2(x, y, 660, 436, 5);  // electrical panel, hot breaker
            return t + noise;
        }
        // Upper floors: floor slabs bridge heat, window frames leak, glass reflects the cold sky.
        const fy = (y - IR_TOP) % IR_FLOOR;
        t += 2.6 * Math.exp(-Math.min(fy, IR_FLOOR - fy) / 4);
        for (const cx of IR_COLS) {
            const dx = Math.abs(x - cx), wy0 = fy - 22, wy1 = 82 - fy;
            if (dx < 25 && wy0 > 0 && wy1 > 0) {
                const edge = Math.min(25 - dx, wy0, wy1);
                t = edge < 4 ? 13 - edge * 0.6 : 7.5 + 1.5 * (fy / IR_FLOOR);
            }
        }
        t += 8 * blob2(x, y, 303, 255, 30, 38);                                         // missing insulation
        t += 7 * blob2(x, y, 545, 118, 24, 12) + 4 * blob2(x, y, 560, 112, 14, 30);     // air leak above a window
        t -= 3.5 * (blob2(x, y, 190, 128, 40, 18) + 0.7 * blob2(x, y, 235, 160, 26, 22)); // damp masonry
        return t;
    }

    const IR_CALLOUTS = [
        { x: 303, y: 255, label: 'MISSING INSULATION', dx: -10, dy: 60 },
        { x: 548, y: 118, label: 'AIR LEAKAGE', dx: 0, dy: 64 },
        { x: 200, y: 132, label: 'MOISTURE', dx: 30, dy: 60 },
        { x: 660, y: 436, label: 'BREAKER OVERHEAT', dx: -40, dy: -58 },
    ].map((c) => ({ ...c, temp: irTemp(c.x, c.y) }));

    const irImages = (() => {
        // Visible light at dusk.
        const vis = document.createElement('canvas');
        vis.width = IR_W;
        vis.height = IR_H;
        const g = vis.getContext('2d');
        const rand = seeded(5);
        let grad = g.createLinearGradient(0, 0, 0, IR_GROUND);
        grad.addColorStop(0, '#0f1830');
        grad.addColorStop(1, '#53607e');
        g.fillStyle = grad;
        g.fillRect(0, 0, IR_W, IR_GROUND);
        g.fillStyle = '#34343a';
        g.fillRect(0, IR_GROUND, IR_W, IR_H - IR_GROUND);
        g.fillStyle = '#4a4a50';
        g.fillRect(0, IR_GROUND, IR_W, 5);
        g.fillStyle = '#7d7f86';                                    // rooftop unit
        g.fillRect(520, 58, 80, 32);
        g.strokeStyle = '#55575d';
        g.beginPath();
        g.arc(560, 72, 10, 0, TAU);
        g.stroke();
        g.fillStyle = '#6e4a38';                                    // brick
        g.fillRect(IR_BX[0], IR_TOP - 20, IR_BX[1] - IR_BX[0], IR_GROUND - IR_TOP + 20);
        g.strokeStyle = 'rgba(0,0,0,0.14)';
        g.lineWidth = 1;
        g.beginPath();
        for (let y = IR_TOP; y < IR_SHOP; y += 7) {
            g.moveTo(IR_BX[0], y + 0.5);
            g.lineTo(IR_BX[1], y + 0.5);
            for (let x = IR_BX[0] + ((y / 7) % 2) * 9; x < IR_BX[1]; x += 18) {
                g.moveTo(x + 0.5, y);
                g.lineTo(x + 0.5, y + 7);
            }
        }
        g.stroke();
        for (let i = 0; i < 260; i++) {                             // weathering
            g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,220,190'},${0.04 + rand() * 0.05})`;
            g.fillRect(IR_BX[0] + rand() * 580, IR_TOP + rand() * 290, 9 + rand() * 9, 6);
        }
        g.fillStyle = '#a89c8c';                                    // parapet coping and string courses
        g.fillRect(IR_BX[0] - 6, IR_TOP - 24, IR_BX[1] - IR_BX[0] + 12, 8);
        for (let k = 1; k <= 3; k++) g.fillRect(IR_BX[0], IR_TOP + k * IR_FLOOR - 3, IR_BX[1] - IR_BX[0], 6);
        for (let f = 0; f < 3; f++) {
            for (const cx of IR_COLS) {
                const y0 = IR_TOP + f * IR_FLOOR + 22, lit = rand() < 0.35;
                g.fillStyle = '#d9d2c6';
                g.fillRect(cx - 27, y0 - 2, 54, 64);
                grad = g.createLinearGradient(cx - 25, y0, cx + 25, y0 + 60);
                grad.addColorStop(0, lit ? '#f0c879' : '#30405a');
                grad.addColorStop(1, lit ? '#b8803c' : '#6d82a0');
                g.fillStyle = grad;
                g.fillRect(cx - 25, y0, 50, 60);
                g.fillStyle = '#d9d2c6';
                g.fillRect(cx - 1, y0, 2, 60);
                g.fillStyle = '#9a8e80';
                g.fillRect(cx - 29, y0 + 60, 58, 5);
            }
        }
        g.fillStyle = '#1b1c22';                                    // shop sign band
        g.fillRect(IR_BX[0], IR_SHOP, IR_BX[1] - IR_BX[0], 14);
        for (let x = IR_BX[0]; x < IR_BX[1] - 8; x += 116) {
            grad = g.createLinearGradient(0, IR_SHOP + 14, 0, IR_GROUND);
            grad.addColorStop(0, '#e9c98e');
            grad.addColorStop(1, '#8a6a44');
            g.fillStyle = grad;
            g.fillRect(x + 8, IR_SHOP + 14, 100, IR_GROUND - IR_SHOP - 20);
            g.strokeStyle = '#2a2b31';
            g.lineWidth = 3;
            g.strokeRect(x + 8, IR_SHOP + 14, 100, IR_GROUND - IR_SHOP - 20);
        }
        g.fillStyle = '#26272d';                                    // door
        g.fillRect(376, IR_SHOP + 16, 48, IR_GROUND - IR_SHOP - 16);
        g.fillStyle = '#c9a76c';
        g.fillRect(382, IR_SHOP + 24, 36, 50);
        g.fillStyle = '#8c9097';                                    // electrical panel and conduit
        g.fillRect(642, 418, 30, 54);
        g.fillStyle = '#6a6e75';
        g.fillRect(646, 424, 22, 3);
        g.fillRect(668, 360, 3, 58);
        g.fillStyle = '#4b4d53';                                    // downpipe
        g.fillRect(118, IR_TOP - 16, 5, IR_GROUND - IR_TOP + 16);

        // Infrared: the temperature field sampled at a thermal camera's low resolution, then smoothed.
        const SW = 200, SH = 140, small = document.createElement('canvas');
        small.width = SW;
        small.height = SH;
        const sg = small.getContext('2d'), img = sg.createImageData(SW, SH);
        for (let j = 0; j < SH; j++) {
            for (let i = 0; i < SW; i++) {
                const t = irTemp((i + 0.5) * IR_W / SW, (j + 0.5) * IR_H / SH, (rand() - 0.5) * 0.5);
                const [r, gg, b] = ironbow((t - IR_MIN) / (IR_MAX - IR_MIN)), o = (j * SW + i) * 4;
                img.data.set([r, gg, b, 255], o);
            }
        }
        sg.putImageData(img, 0, 0);
        const ir = document.createElement('canvas');
        ir.width = IR_W;
        ir.height = IR_H;
        const ig = ir.getContext('2d');
        ig.imageSmoothingQuality = 'high';
        ig.drawImage(small, 0, 0, IR_W, IR_H);
        return { vis, ir };
    })();

    const irState = { auto: true, wipe: 0.5, k: 1, ox: 0, oy: 0 };
    const irSlider = document.getElementById('ir-wipe');

    function drawThermography(ctx, w, h, t) {
        const k = Math.min(w / IR_W, h / IR_H), ox = (w - IR_W * k) / 2, oy = (h - IR_H * k) / 2;
        Object.assign(irState, { k, ox, oy });
        const still = reduce.matches;
        if (irState.auto && !still) {
            irState.wipe = 0.5 + 0.4 * Math.sin(t * 0.5);
            if (irSlider) irSlider.value = Math.round(irState.wipe * 100);
        }
        const split = irState.wipe * IR_W;           // the infrared image is shown left of the split
        ctx.drawImage(irImages.vis, ox, oy, IR_W * k, IR_H * k);
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, split * k, IR_H * k);
        ctx.clip();
        ctx.drawImage(irImages.ir, ox, oy, IR_W * k, IR_H * k);

        // Callouts on the infrared side.
        const fs = Math.max(9, Math.round(11 * Math.min(1, k * 1.25)));
        ctx.font = `700 ${fs}px ui-monospace, Consolas, monospace`;
        ctx.textBaseline = 'middle';
        for (const c of IR_CALLOUTS) {
            const x = ox + c.x * k, y = oy + c.y * k, pulse = still ? 0.5 : (t * 0.8 + c.x * 0.003) % 1;
            ctx.strokeStyle = `rgba(255,255,255,${0.9 - pulse * 0.8})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, (8 + pulse * 14) * Math.max(0.6, k), 0, TAU);
            ctx.stroke();
            const lx = x + c.dx * k, ly = y + c.dy * k;
            const text = `${c.label} ${c.temp.toFixed(1)} °C`, tw = ctx.measureText(text).width;
            const bx = clamp(lx - tw / 2 - 6, ox + 4, ox + IR_W * k - tw - 16);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(lx, ly);
            ctx.stroke();
            ctx.fillStyle = 'rgba(5,4,10,0.82)';
            ctx.fillRect(bx, ly - fs * 0.8, tw + 12, fs * 1.6);
            ctx.fillStyle = '#fff4b0';
            ctx.fillText(text, bx + 6, ly);
        }
        ctx.restore();

        // The divider and its handle.
        const sx = ox + split * k;
        ctx.strokeStyle = '#ffb21c';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff7a1a';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(sx, oy);
        ctx.lineTo(sx, oy + IR_H * k);
        ctx.stroke();
        ctx.shadowBlur = 0;
        const hy = oy + IR_H * k / 2;
        ctx.fillStyle = 'rgba(5,4,10,0.85)';
        ctx.beginPath();
        ctx.arc(sx, hy, 15, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffb21c';
        ctx.beginPath();
        ctx.moveTo(sx - 4, hy - 6); ctx.lineTo(sx - 10, hy); ctx.lineTo(sx - 4, hy + 6);
        ctx.moveTo(sx + 4, hy - 6); ctx.lineTo(sx + 10, hy); ctx.lineTo(sx + 4, hy + 6);
        ctx.fill();
        ctx.font = '700 10px ui-monospace, Consolas, monospace';
        ctx.textBaseline = 'alphabetic';
        if (split > 120) {
            ctx.fillStyle = 'rgba(255,244,176,0.9)';
            ctx.fillText('INFRARED', sx - 72, hy - 26);
        }
        if (split < IR_W - 120) {
            ctx.fillStyle = 'rgba(245,241,248,0.9)';
            ctx.fillText('VISIBLE', sx + 14, hy - 26);
        }
    }

    const irScene = addScene(document.getElementById('ir-canvas'), { draw: drawThermography, still: 0 });
    if (irScene && irSlider) {
        const setWipe = (v) => {
            irState.auto = false;
            irState.wipe = clamp(v);
            irSlider.value = Math.round(irState.wipe * 100);
            render(irScene);
        };
        irSlider.addEventListener('input', () => setWipe(irSlider.value / 100));
        irSlider.addEventListener('focus', () => (irState.auto = false));
        const fromPointer = (e) => {
            const r = irScene.canvas.getBoundingClientRect();
            setWipe((e.clientX - r.left - irState.ox) / (IR_W * irState.k));
        };
        irScene.canvas.addEventListener('pointerdown', (e) => {
            irScene.canvas.setPointerCapture(e.pointerId);
            fromPointer(e);
        });
        irScene.canvas.addEventListener('pointermove', (e) => {
            if (irScene.canvas.hasPointerCapture(e.pointerId)) fromPointer(e);
        });
    }

    // ======================================================================================
    // Who it's for: two small drawings in an oblique projection (x right, y up, z back), in units
    // of 480 × 300 fitted to the canvas. Commercial: a drone flies lanes over a warehouse roof and a
    // thermal grid fills in behind it, showing a wet patch. Residential: heat leaks glow on an
    // apartment block and a row of houses while a crosshair visits each one.
    // ======================================================================================
    const AU_W = 480, AU_H = 300, AU_GROUND = 262;
    const AU_LINE = 'rgba(92,200,255,0.55)', AU_FAINT = 'rgba(92,200,255,0.16)';
    const AU_FONT = '700 {fs}px ui-monospace, Consolas, monospace';

    function oblique(w, h) {
        const k = Math.min(w / AU_W, h / AU_H), ox = (w - AU_W * k) / 2, oy = (h - AU_H * k) / 2;
        return {
            k,
            fs: Math.max(9, Math.round(11 * Math.min(1, k * 1.25))),
            P: (x, y, z = 0) => [ox + (x + z * 0.62) * k, oy + (AU_GROUND - y - z * 0.42) * k],
        };
    }

    function poly(ctx, P, pts, fill, stroke = AU_LINE) {
        ctx.beginPath();
        for (const [x, y, z] of pts) ctx.lineTo(...P(x, y, z));
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.stroke();
        }
    }

    // The faces of a box (x0..x1, 0..h, 0..d) this view sees: right side, top, front.
    function auBox(ctx, P, x0, x1, h, d) {
        poly(ctx, P, [[x1, 0, 0], [x1, 0, d], [x1, h, d], [x1, h, 0]], '#08060d');
        poly(ctx, P, [[x0, h, 0], [x1, h, 0], [x1, h, d], [x0, h, d]], '#120e1a');
        poly(ctx, P, [[x0, 0, 0], [x1, 0, 0], [x1, h, 0], [x0, h, 0]], '#0b0912');
    }

    // A gabled house with its gable end to the front.
    function auHouse(ctx, P, x0, x1, h, r, d) {
        const xm = (x0 + x1) / 2;
        poly(ctx, P, [[x1, 0, 0], [x1, 0, d], [x1, h, d], [x1, h, 0]], '#08060d');
        poly(ctx, P, [[x0, h, 0], [xm, h + r, 0], [xm, h + r, d], [x0, h, d]], '#120e1a');
        poly(ctx, P, [[xm, h + r, 0], [x1, h, 0], [x1, h, d], [xm, h + r, d]], '#0f0c16');
        poly(ctx, P, [[x0, 0, 0], [x1, 0, 0], [x1, h, 0], [xm, h + r, 0], [x0, h, 0]], '#0b0912');
    }

    // An outlined rectangle on the front plane (z = 0).
    const auRect = (ctx, P, x, y, w, h, stroke = AU_FAINT) =>
        poly(ctx, P, [[x, y, 0], [x + w, y, 0], [x + w, y + h, 0], [x, y + h, 0]], null, stroke);

    function auGround(ctx, P) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = AU_FAINT;
        ctx.beginPath();
        for (let z = 0; z <= 120; z += 40) {
            ctx.moveTo(...P(-40, 0, z));
            ctx.lineTo(...P(AU_W, 0, z));
        }
        for (let x = 0; x <= AU_W; x += 40) {
            ctx.moveTo(...P(x, 0, 0));
            ctx.lineTo(...P(x, 0, 120));
        }
        ctx.stroke();
    }

    // A pulsing crosshair ring with a label box beside it, as in the thermography callouts.
    function auCallout(ctx, x, y, text, fs, pulse, k, w) {
        ctx.strokeStyle = `rgba(255,255,255,${0.9 - pulse * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, (6 + pulse * 12) * Math.max(0.6, k), 0, TAU);
        ctx.stroke();
        ctx.font = AU_FONT.replace('{fs}', fs);
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(text).width, lx = clamp(x - tw / 2 - 6, 4, w - tw - 16), ly = y - 34 * Math.max(0.7, k);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 6 * Math.max(0.6, k));
        ctx.lineTo(x, ly + fs * 0.8);
        ctx.stroke();
        ctx.fillStyle = 'rgba(5,4,10,0.86)';
        ctx.fillRect(lx, ly - fs * 0.8, tw + 12, fs * 1.6);
        ctx.fillStyle = '#fff4b0';
        ctx.fillText(text, lx + 6, ly);
    }

    // ---------- commercial: an office block and a warehouse whose roof is surveyed ----------
    const COM_ROOF = { x0: 140, x1: 390, h: 70, d: 110, cols: 10, rows: 5 };
    const COM_LANE = 1.6;                                   // seconds per lane
    const COM_HOLD = 2.6, COM_FADE = 0.8;
    const COM_PERIOD = COM_ROOF.rows * COM_LANE + COM_HOLD + COM_FADE;
    const COM_WET = { col: 6, row: 2 };                     // the cell at the wet patch's centre
    const comCells = (() => {
        const rand = seeded(11), out = [];
        const cw = (COM_ROOF.x1 - COM_ROOF.x0) / COM_ROOF.cols, cd = COM_ROOF.d / COM_ROOF.rows;
        const wx = COM_ROOF.x0 + (COM_WET.col + 0.5) * cw, wz = (COM_WET.row + 0.5) * cd;
        for (let r = 0; r < COM_ROOF.rows; r++) {
            for (let c = 0; c < COM_ROOF.cols; c++) {
                const x = COM_ROOF.x0 + c * cw, z = r * cd;
                const v = 0.22 + rand() * 0.08 + 0.62 * blob2(x + cw / 2, z + cd / 2, wx, wz, 42, 30);
                out.push({ c, r, x, z, cw, cd, v });
            }
        }
        return out;
    })();

    function drawCommercial(ctx, w, h, t) {
        const { k, fs, P } = oblique(w, h);
        const R = COM_ROOF, p = t % COM_PERIOD, flying = p < R.rows * COM_LANE;
        const lane = Math.min(R.rows - 1, Math.floor(p / COM_LANE)), u = flying ? (p % COM_LANE) / COM_LANE : 1;
        const fade = clamp((p - R.rows * COM_LANE - COM_HOLD) / COM_FADE);
        const lx = lane % 2 ? mix(R.x1 + 10, R.x0 - 10, u) : mix(R.x0 - 10, R.x1 + 10, u);
        const cd = R.d / R.rows;
        const dz = (lane + 0.5) * cd + (lane < R.rows - 1 ? cd * ease(clamp((u - 0.88) / 0.12)) : 0);
        const done = (cell) => !flying || cell.r < lane ||
            (cell.r === lane && (lane % 2 ? cell.x + cell.cw / 2 > lx : cell.x + cell.cw / 2 < lx));

        ctx.lineWidth = 1;
        auGround(ctx, P);
        auBox(ctx, P, 30, 120, 170, 60);                     // office block
        for (let f = 0; f < 9; f++) {
            for (let c = 0; c < 4; c++) auRect(ctx, P, 38 + c * 20.5, 18 + f * 17, 12, 9);
        }
        auBox(ctx, P, R.x0, R.x1, R.h, R.d);                 // warehouse and its loading doors
        for (let i = 0; i < 5; i++) auRect(ctx, P, 160 + i * 44, 0, 30, 38);

        // Thermal cells on the roof, filled in behind the drone.
        const alpha = 0.88 * (1 - fade);
        if (alpha > 0) {
            for (const cell of comCells) {
                if (!done(cell)) continue;
                poly(ctx, P, [
                    [cell.x + 0.8, R.h, cell.z + 0.8], [cell.x + cell.cw - 0.8, R.h, cell.z + 0.8],
                    [cell.x + cell.cw - 0.8, R.h, cell.z + cell.cd - 0.8], [cell.x + 0.8, R.h, cell.z + cell.cd - 0.8],
                ], css(ironbow(cell.v), alpha), null);
            }
        }
        const wet = comCells[COM_WET.row * R.cols + COM_WET.col];
        hud('lane', flying ? String(lane + 1) : String(R.rows));

        // The drone, its camera footprint on the roof, and a blinking light.
        if (flying) {
            const [sx, sy] = P(lx, R.h + 62, dz);
            const foot = [[lx - 14, R.h, dz - cd / 2], [lx + 14, R.h, dz - cd / 2], [lx + 14, R.h, dz + cd / 2], [lx - 14, R.h, dz + cd / 2]];
            poly(ctx, P, foot, 'rgba(255,178,28,0.10)', 'rgba(255,178,28,0.6)');
            ctx.beginPath();
            for (const [x, y, z] of foot) {
                ctx.moveTo(sx, sy);
                ctx.lineTo(...P(x, y, z));
            }
            ctx.stroke();
            const s = Math.max(0.7, k);
            ctx.strokeStyle = '#ffb21c';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx - 9 * s, sy - 3 * s); ctx.lineTo(sx + 9 * s, sy + 3 * s);
            ctx.moveTo(sx + 9 * s, sy - 3 * s); ctx.lineTo(sx - 9 * s, sy + 3 * s);
            for (const [ax, ay] of [[-9, -3], [9, 3], [9, -3], [-9, 3]]) {
                ctx.moveTo(sx + ax * s + 4.5 * s, sy + ay * s);
                ctx.ellipse(sx + ax * s, sy + ay * s, 4.5 * s, 1.6 * s, 0, 0, TAU);
            }
            ctx.stroke();
            ctx.fillStyle = (t * 2) % 1 < 0.5 ? '#ff3c88' : 'rgba(255,60,136,0.3)';
            ctx.fillRect(sx - 1.5 * s, sy - 1.5 * s, 3 * s, 3 * s);
        }

        if (done(wet) && fade < 1) {
            const [cx, cy] = P(wet.x + wet.cw / 2, R.h, wet.z + wet.cd / 2);
            ctx.globalAlpha = 1 - fade;
            auCallout(ctx, cx, cy, 'WET INSULATION +3.8 °C', fs, reduce.matches ? 0.5 : (t * 0.8) % 1, k, w);
            ctx.globalAlpha = 1;
        }
    }

    addScene(document.getElementById('com-canvas'), { draw: drawCommercial, still: 3 * COM_LANE + 0.6 * COM_LANE });

    // ---------- residential: an apartment block and a row of houses with heat leaks ----------
    const RES_HOUSES = [190, 262, 334].map((x) => ({ x0: x, x1: x + 60, h: 55, r: 32, d: 70 }));
    const RES_LEAKS = [
        { at: [76, 132, 0], rx: 13, ry: 11, label: 'WINDOW FRAME 14.2 °C' },
        { at: [97, 72, 0], rx: 46, ry: 6, label: 'THERMAL BRIDGE 11.8 °C' },
        { at: [379, 55 + 16, 35], rx: 16, ry: 12, label: 'ROOF INSULATION 9.6 °C' },
        { at: [292, 14, 0], rx: 9, ry: 18, label: 'DOOR DRAUGHT 16.4 °C' },
    ];
    const RES_STEP = 2.6, RES_MOVE = 0.7;                   // seconds per leak, of which moving

    function drawResidential(ctx, w, h, t) {
        const { k, fs, P } = oblique(w, h);
        ctx.lineWidth = 1;
        auGround(ctx, P);
        auBox(ctx, P, 24, 170, 180, 55);                    // apartment block: 7 floors over an entrance
        for (let f = 0; f < 7; f++) {
            for (let c = 0; c < 5; c++) auRect(ctx, P, 34 + c * 27.5, 34 + f * 20.5, 16, 12);
            auRect(ctx, P, 24, 30 + f * 20.5, 146, 1.5, 'rgba(92,200,255,0.10)');
        }
        auRect(ctx, P, 84, 0, 26, 24);
        for (const H of RES_HOUSES) {
            auHouse(ctx, P, H.x0, H.x1, H.h, H.r, H.d);
            auRect(ctx, P, H.x0 + 23, 0, 14, 26);
            auRect(ctx, P, H.x0 + 7, 30, 12, 12);
            auRect(ctx, P, H.x1 - 19, 30, 12, 12);
        }

        // Heat leaks: soft ironbow glows that breathe out of step with each other.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        RES_LEAKS.forEach((L, i) => {
            const [x, y] = P(...L.at), pulse = reduce.matches ? 0.85 : 0.75 + 0.25 * Math.sin(t * 1.8 + i * 1.7);
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(L.rx * k, L.ry * k);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
            g.addColorStop(0, css(ironbow(0.95), 0.9 * pulse));
            g.addColorStop(0.35, css(ironbow(0.7), 0.6 * pulse));
            g.addColorStop(0.7, css(ironbow(0.4), 0.3 * pulse));
            g.addColorStop(1, css(ironbow(0.2), 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, TAU);
            ctx.fill();
            ctx.restore();
        });
        ctx.restore();

        // A crosshair moves from leak to leak and labels each.
        const n = RES_LEAKS.length, step = t / RES_STEP, i = Math.floor(step) % n, q = (step % 1) * RES_STEP;
        const from = P(...RES_LEAKS[(i + n - 1) % n].at), to = P(...RES_LEAKS[i].at);
        const m = ease(clamp(q / RES_MOVE)), cx = mix(from[0], to[0], m), cy = mix(from[1], to[1], m);
        hud('leaks', String(i + 1));
        ctx.strokeStyle = '#ffb21c';
        ctx.lineWidth = 1.5;
        const s = 9 * Math.max(0.7, k);
        ctx.beginPath();
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            ctx.moveTo(cx + a * s, cy + b * s * 0.4);
            ctx.lineTo(cx + a * s, cy + b * s);
            ctx.lineTo(cx + a * s * 0.4, cy + b * s);
        }
        ctx.stroke();
        if (q >= RES_MOVE) auCallout(ctx, cx, cy, RES_LEAKS[i].label, fs, reduce.matches ? 0.5 : ((q - RES_MOVE) * 0.8) % 1, k, w);
    }

    addScene(document.getElementById('res-canvas'), { draw: drawResidential, still: RES_MOVE + 0.8 });

})();
