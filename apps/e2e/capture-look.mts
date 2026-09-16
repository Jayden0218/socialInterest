import { launchChromium } from './support/browser';
import { startWebServer } from './support/web-server';

const OUT = '/tmp/shots';
const VIEW = { width: 390, height: 844 };

const web = await startWebServer('http://127.0.0.1:3000');
const browser = await launchChromium();
const page = await browser.newPage({ viewport: VIEW });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text().slice(0,140)); });

const id = (t) => `[data-testid="${t}"]`;
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('captured', name); };

await page.goto(web.url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await shot('01-launch');

// Sign up through the real screens.
const nonce = Date.now().toString(36);
await page.click(id('open-sign-in')).catch(()=>{});
await page.waitForTimeout(800);
await shot('02-sign-in');
await page.click(id('sign-in-create-account')).catch(()=>{});
await page.waitForTimeout(600);
await shot('03-sign-up');
await page.fill(id('sign-up-email'), `look${nonce}@example.com`).catch(()=>{});
await page.fill(id('sign-up-password'), 'a-long-enough-password').catch(()=>{});
await page.fill(id('sign-up-handle'), `look${nonce}`.slice(0,20)).catch(()=>{});
await page.fill(id('sign-up-display-name'), 'Looker').catch(()=>{});
await shot('04-sign-up-filled');
await page.click(id('sign-up-submit')).catch(()=>{});
await page.waitForTimeout(3000);
await shot('05-after-sign-up');
await page.click(id('pick-skip')).catch(()=>{});
await page.waitForTimeout(2500);
await shot('06-feed-new-account');

for (const [tab, name] of [['discover','07-explore'],['chats','08-chats'],['notifications','09-activity'],['profile','10-you']]) {
  await page.click(id(`tab-${tab}`)).catch(()=>{});
  await page.waitForTimeout(1800);
  await shot(name);
}
await browser.close();
await web.stop();
