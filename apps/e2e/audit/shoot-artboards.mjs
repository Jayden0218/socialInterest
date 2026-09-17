/**
 * PHOTOGRAPH THE APPROVED DESIGN, so it can be put beside the app.
 *
 * WHY THIS EXISTS, WHICH IS THE USEFUL PART. The artboard-vs-app comparison ran
 * for hours off the artboards' SOURCE — reading `.dc.html` and holding it
 * against the code — and the owner kept saying the result still looked wrong.
 * They were right, and the reason was that nobody had ever LOOKED at the design:
 * a diff of inline styles tells you a padding is 9, and nothing about whether a
 * screen reads as the thing that was drawn.
 *
 * It is possible because `design/012-ui`'s artboards are STATIC HTML — `_gen.py`
 * writes every card out literally, so there is no `sc-for`, no `{{hole}}` and no
 * canvas runtime to stand in for. They open in a browser as they are. (007's do
 * not: those are templated, which is why this could not have been done against
 * that set.)
 *
 * Two things it does deliberately:
 *
 *  - serves the artboards over HTTP rather than `file://`, so their relative
 *    references resolve the way they do on the canvas;
 *  - serves THE SAME FOUR FONT FILES THE APP SHIPS and waits on `document.fonts`
 *    before shooting. The artboards ask Google Fonts for Plus Jakarta Sans and
 *    this sandbox cannot reach it, so without that the design would be
 *    photographed in a serif fallback — which is exactly the trap the app's own
 *    captures fell into for three rounds while `getComputedStyle` reported the
 *    family CSS had ASKED for.
 *
 * Usage:  node apps/e2e/audit/shoot-artboards.mjs Main Explore InterestSpace
 * Output: /tmp/artboard-shots/<name>.png at 390x844, the artboards' own frame.
 */
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const DIR = '/tmp/artboards';
const OUT = '/tmp/artboard-shots';
mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.ttf': 'font/ttf', '.css': 'text/css', '.js': 'application/javascript' };
const server = createServer((req, res) => {
  const f = resolve(DIR, decodeURIComponent(req.url.replace(/^\//, '')) || 'x');
  if (!f.startsWith(DIR) || !existsSync(f)) return res.writeHead(404).end('no');
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((d) => server.listen(0, '127.0.0.1', d));
const port = server.address().port;

// The artboards ask Google Fonts for Plus Jakarta Sans and this sandbox cannot
// reach it. The same four files the app ships are served beside them instead,
// so what gets photographed is the design IN ITS OWN TYPEFACE rather than in a
// fallback — which is exactly the trap the app's own captures fell into.
const LOCAL_FONT = `
  @font-face{font-family:'Plus Jakarta Sans';font-weight:400;src:url('/fonts/PlusJakartaSans-Regular.ttf') format('truetype')}
  @font-face{font-family:'Plus Jakarta Sans';font-weight:500;src:url('/fonts/PlusJakartaSans-Medium.ttf') format('truetype')}
  @font-face{font-family:'Plus Jakarta Sans';font-weight:600;src:url('/fonts/PlusJakartaSans-SemiBold.ttf') format('truetype')}
  @font-face{font-family:'Plus Jakarta Sans';font-weight:700;src:url('/fonts/PlusJakartaSans-Bold.ttf') format('truetype')}`;

// The sandbox's pinned build, exactly as `support/browser.ts` resolves it: the
// packaged revision is not present here and downloading one is blocked.
const CANDIDATES = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'];
const local = CANDIDATES.find((p) => existsSync(p));
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'], ...(local ? { executablePath: local } : {}) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const name of process.argv.slice(2)) {
  await page.goto(`http://127.0.0.1:${port}/${name}.dc.html`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: LOCAL_FONT });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const el = await page.$('.phone');
  await (el ?? page).screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot ${name}`);
}
await browser.close();
server.close();
