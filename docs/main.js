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
})();
