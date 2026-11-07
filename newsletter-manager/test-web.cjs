// בדיקת עשן לדף הניהול באתר (admin/): מרים שרת מקומי שמגיש את admin/ ומריץ את פונקציית
// ה-API האמיתית (עם משתמש בדיקה; פעולות GitHub מדומות), טוען את הדף בחלון Electron,
// מתחבר, סורק מקורות אמיתיים דרך השרת, ובודק את תצוגת המקורות. בלי מפתח AI.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert');
const { _electron } = require('playwright-core');

const root = path.join(__dirname, '..');
process.env.NEWSLETTER_USERS = 'test@ho-me.org.il:test-pass';
delete process.env.GITHUB_TOKEN;
const handler = require(path.join(root, 'api', 'newsletter-admin.js'));
const FAKE_ISSUES = [{ n: 4, date: '2026-10-14', title: 'גיליון בדיקה', sub: 'תיאור' }];
const SAMPLE_HTML = fs.readFileSync(path.join(root, 'newsletter', '2026-10-14.html'), 'utf8');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/newsletter-admin') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const parsed = JSON.parse(body || '{}');
      const fake = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { res.writeHead(this.code || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); } };
      // פעולות שצריכות GitHub מדומות; כל השאר עובר לפונקציה האמיתית.
      if (parsed.action === 'load') return fake.json({ ok: true, issues: FAKE_ISSUES, scheduled: [], headSha: 'test' });
      if (parsed.action === 'readIssue') return fake.json({ ok: true, html: SAMPLE_HTML });
      if (parsed.action === 'diagnostics') return fake.json({ ok: true, github: { ok: true, push: true }, ai: { configured: false } });
      await handler({ method: 'POST', headers: req.headers, body: parsed }, fake);
    });
    return;
  }
  let file = url.pathname === '/admin' ? '/admin/index.html' : url.pathname;
  const target = path.join(root, file);
  if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const type = target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(target).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mainFile = path.join(os.tmpdir(), `ho-me-web-main-${Date.now()}.cjs`);
  fs.writeFileSync(mainFile, `const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => { const w = new BrowserWindow({ width: 1440, height: 960, webPreferences: { sandbox: true } }); w.loadURL('http://127.0.0.1:${port}/admin'); });`, 'utf8');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: require('electron'), args: [mainFile], env });
  const page = await app.firstWindow();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE:', msg.text()); });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#welcome:not([hidden])', { timeout: 15000 });
  const nav = await page.evaluate(() => ({ updates: !document.getElementById('navUpdates').hidden, sources: !document.getElementById('navSources').hidden, refresh: Boolean(document.getElementById('refreshButton')), viewOnly: Boolean(document.getElementById('viewOnlyButton')) }));
  console.log('WEB NAV', JSON.stringify(nav));
  assert.ok(nav.updates && nav.sources && !nav.refresh && !nav.viewOnly);

  await page.fill('#emailInput', 'test@ho-me.org.il');
  await page.fill('#passwordInput', 'test-pass');
  await page.click('#connectButton');
  await page.waitForSelector('#workspace:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(1500);
  console.log('LOGGED IN', JSON.stringify(await page.evaluate(() => ({ items: document.querySelectorAll('.issue-item').length, diag: document.getElementById('diagLabel').textContent.trim().slice(0, 60) }))));

  await page.click('#navUpdates');
  await page.waitForSelector('#viewUpdates:not([hidden])');
  await page.waitForTimeout(600);
  const strip = await page.evaluate(() => ({ monitorRowHidden: document.getElementById('monitorRow').hidden, webNote: !document.getElementById('monitorWebNote').hidden, ai: document.getElementById('aiChip').textContent, sources: document.querySelectorAll('.source-item').length }));
  console.log('WEB UPDATES', JSON.stringify(strip));
  assert.ok(strip.monitorRowHidden && strip.webNote && strip.sources >= 7);

  await page.click('#scanButton');
  await page.waitForFunction(() => !document.getElementById('scanStatus').hidden);
  await page.waitForFunction(() => document.getElementById('scanStatus').hidden, null, { timeout: 180000 });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ findings: document.querySelectorAll('.finding').length, toast: document.getElementById('toast').textContent, stored: JSON.parse(localStorage.getItem('nl.findings') || '[]').length }));
  console.log('WEB SCAN', JSON.stringify(after));
  assert.ok(after.findings > 0 && after.stored === after.findings);
  await page.screenshot({ path: path.join(__dirname, 'smoke-web-updates.png') });

  await page.click('#settingsButton');
  await page.waitForTimeout(400);
  console.log('WEB SETTINGS', JSON.stringify(await page.evaluate(() => ({ keyRowHidden: document.getElementById('aiKeyRow').hidden, monitorHidden: document.getElementById('settingsMonitorSection').hidden, hint: document.getElementById('aiKeyHint').textContent.slice(0, 40) }))));
  await page.screenshot({ path: path.join(__dirname, 'smoke-web-settings.png') });
  await page.click('#settingsDoneButton');

  await page.click('#navSources');
  await page.waitForSelector('#viewSources:not([hidden])');
  await page.waitForTimeout(400);
  console.log('WEB SOURCES', JSON.stringify(await page.evaluate(() => ({ rows: document.querySelectorAll('.source-row').length }))));

  await page.click('#navUpdates');
  if (process.env.ANTHROPIC_API_KEY) {
    // עם מפתח (דרך aiKey של השרת): דירוג עם AI, חיפוש ברשת, וניסוח אמיתי מהדפדפן.
    await page.evaluate(() => { localStorage.removeItem('nl.findings'); localStorage.removeItem('nl.seen'); });
    await page.reload();
    await page.waitForSelector('#workspace:not([hidden])', { timeout: 20000 });
    await page.click('#navUpdates');
    await page.waitForFunction(() => document.getElementById('aiChip').classList.contains('on'), null, { timeout: 20000 });
    console.log('AI CHIP:', await page.evaluate(() => document.getElementById('aiChip').textContent));
    await page.click('#scanButton');
    await page.waitForFunction(() => !document.getElementById('scanStatus').hidden);
    await page.waitForFunction(() => document.getElementById('scanStatus').hidden, null, { timeout: 600000 });
    await page.waitForTimeout(500);
    const scored = await page.evaluate(() => {
      const findings = JSON.parse(localStorage.getItem('nl.findings') || '[]');
      return { total: findings.length, withAi: findings.filter(f => f.aiSummary).length, fromSearch: findings.filter(f => f.via === 'search').length, important: findings.filter(f => f.relevance >= 7).length, toast: document.getElementById('toast').textContent, top: findings.filter(f => f.relevance >= 7).slice(0, 3).map(f => `${f.relevance} · ${f.title} · ${f.aiSummary}`) };
    });
    console.log('AI SCAN', JSON.stringify(scored, null, 1));
    assert.ok(scored.withAi > 0, 'דירוג AI התבצע');
    await page.screenshot({ path: path.join(__dirname, 'smoke-web-ai-scan.png') });
    const first = await page.$('.finding input[type="checkbox"]');
    await first.click();
    await page.fill('#draftInstructions', 'בדיקת מערכת: גיליון קצר ומדויק');
    await page.click('#draftButton');
    await page.waitForFunction(() => !document.getElementById('draftOpenButton').hidden || !document.getElementById('draftCloseButton').hidden, null, { timeout: 600000 });
    const draftResult = await page.evaluate(() => ({ title: document.getElementById('draftTitle').textContent, result: document.getElementById('draftResult').innerText.slice(0, 600), canOpen: !document.getElementById('draftOpenButton').hidden }));
    console.log('AI DRAFT', JSON.stringify(draftResult, null, 1));
    assert.ok(draftResult.canOpen, 'הטיוטה נוצרה');
    await page.screenshot({ path: path.join(__dirname, 'smoke-web-ai-draft.png') });
    await page.click('#draftOpenButton');
    await page.waitForSelector('#editorBackdrop:not([hidden])');
    console.log('EDITOR', JSON.stringify(await page.evaluate(() => ({ title: document.getElementById('issueTitle').value, date: document.getElementById('issueDate').value, notes: document.querySelectorAll('#draftNotesList li').length }))));
    await page.click('#editorSubmit');
    await page.waitForTimeout(1500);
    const added = await page.evaluate(() => ({ items: document.querySelectorAll('.issue-item').length, publishVisible: !document.getElementById('publishBar').hidden, caption: document.getElementById('previewCaption').textContent, masthead: (document.getElementById('previewFrame').contentDocument.body.innerText.match(/גיליון \d+ · [\d.]+/) || [''])[0] }));
    console.log('ADDED TO LIST', JSON.stringify(added));
    assert.ok(added.publishVisible && added.items === 2, 'הטיוטה ברשימה ופס הפרסום מוצג');
    await page.screenshot({ path: path.join(__dirname, 'smoke-web-ai-issue.png') });
    fs.writeFileSync(path.join(__dirname, 'smoke-draft.html'), await page.evaluate(() => state.pendingFiles.values().next().value), 'utf8');
  } else {
    // ניסוח בלי מפתח: הודעה ברורה שהמפתח מוגדר ב-Vercel
    const checks = await page.$$('.finding input[type="checkbox"]');
    await checks[0].click();
    await page.click('#draftButton');
    await page.waitForTimeout(400);
    console.log('WEB DRAFT NO KEY:', await page.evaluate(() => document.getElementById('toast').textContent));
  }

  await app.close();
  server.close();
  fs.rmSync(mainFile, { force: true });
  console.log('WEB SMOKE OK');
})().catch(error => { console.error('WEB SMOKE FAILED:', error); server.close(); process.exit(1); });
