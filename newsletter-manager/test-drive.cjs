// Smoke-test driver: launches the app, connects to the live repo (read-only,
// no token) through the real GitHub API, and verifies list/search/preview.
const { _electron } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

(async () => {
  // Start from a clean session state so the welcome screen shows.
  const userData = path.join(os.homedir(), 'AppData', 'Roaming', 'ho-me-newsletter-manager');
  fs.rmSync(path.join(userData, 'connection.json'), { force: true });
  fs.rmSync(path.join(userData, 'session.json'), { force: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // set by the VS Code host; makes Electron run as plain Node
  const exe = process.argv[2] || require('electron');
  const app = await _electron.launch({
    executablePath: exe,
    args: exe === require('electron') ? [path.join(__dirname, 'main.cjs')] : [],
    env
  });
  const page = await app.firstWindow();
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE:', msg.text()); });
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  await page.waitForSelector('#welcome:not([hidden])', { timeout: 15000 });
  await page.screenshot({ path: path.join(__dirname, 'smoke-welcome.png') });
  console.log('WELCOME: login screen shown');

  // Login with bad credentials: expect a clean Hebrew error, not a crash.
  await page.fill('#emailInput', 'nobody@example.com');
  await page.fill('#passwordInput', 'wrong-password');
  await page.click('#connectButton');
  await page.waitForTimeout(4000);
  console.log('LOGIN ERROR SHOWN:', await page.evaluate(() => document.getElementById('connectError').textContent));

  // Enter view-only mode against the real public repo (no auth needed).
  await page.click('#viewOnlyButton');
  try {
    await page.waitForSelector('#workspace:not([hidden])', { timeout: 30000 });
  } catch (error) {
    console.log('CONNECT ERROR:', await page.evaluate(() => document.getElementById('connectError').textContent));
    await page.screenshot({ path: path.join(__dirname, 'smoke-fail.png') });
    throw error;
  }
  await page.waitForTimeout(3000); // let issue files + preview load

  const counts = await page.evaluate(() => ({
    issues: document.querySelectorAll('.issue-item').length,
    connection: document.getElementById('connectionLabel').textContent,
    latest: document.getElementById('latestDate').textContent,
    previewHidden: document.getElementById('previewFrame').hidden,
    caption: document.getElementById('previewCaption').textContent,
    saveDisabled: document.getElementById('saveButton').disabled,
    addDisabled: document.getElementById('addButton').disabled,
    deleteButtons: document.querySelectorAll('.mini-button.danger').length
  }));
  console.log(JSON.stringify(counts, null, 2));
  await page.screenshot({ path: path.join(__dirname, 'smoke-main.png') });

  // Search: a word that appears only inside issue content
  await page.fill('#searchInput', 'סוכות');
  await page.waitForTimeout(300);
  const search = await page.evaluate(() => ({
    visible: [...document.querySelectorAll('.issue-item .issue-meta span:first-child')].map(el => el.textContent),
    count: document.getElementById('searchCount').textContent
  }));
  console.log('SEARCH("סוכות"):', JSON.stringify(search));
  await page.fill('#searchInput', '24.09');
  await page.waitForTimeout(300);
  console.log('SEARCH("24.09") items:', await page.evaluate(() => document.querySelectorAll('.issue-item').length));
  await page.fill('#searchInput', '');
  await page.waitForTimeout(300);

  // Preview iframe: did the newsletter's styles apply?
  const frame = page.frames().find(f => f !== page.mainFrame());
  if (frame) {
    const styleInfo = await frame.evaluate(() => {
      const purpleEls = [...document.querySelectorAll('[bgcolor], td')].slice(0, 400);
      return {
        bodyBg: getComputedStyle(document.body).backgroundColor,
        anyPurple: purpleEls.some(el => getComputedStyle(el).backgroundColor === 'rgb(86, 46, 140)')
      };
    }).catch(e => ({ error: e.message }));
    console.log('PREVIEW:', JSON.stringify(styleInfo));
  } else {
    console.log('PREVIEW: no iframe frame found');
  }

  await app.close();
})().catch(err => { console.error('DRIVER FAILED:', err); process.exit(1); });
