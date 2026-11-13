// Renders docs/assets/img/social-card.png (1200×630, the link preview) from the page itself: the hero at that
// size, on its reduced-motion still frame, with the parts that don't read at thumbnail size hidden.
// Needs Playwright with Chromium: NODE_PATH=<dir holding playwright> node tools/social-card.js
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', 'docs');
const out = path.join(root, 'assets', 'img', 'social-card.png');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png' };

const CARD_CSS = `
    body::after, .rail, .step-link, .lede, .service, .audience, .how, .site-footer { display: none; }
    body.has-rail { padding-left: 0; }
    .hero { min-height: 590px; padding: 0; gap: 40px; }
    .logo { width: 400px; margin-bottom: 22px; }
    h1 { font-size: 76px; }
`;

const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});

server.listen(0, '127.0.0.1', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.addStyleTag({ content: CARD_CSS });
        await page.waitForTimeout(500);
        await page.screenshot({ path: out });
        console.log('wrote', path.relative(process.cwd(), out));
    } finally {
        await browser.close();
        server.close();
    }
});
