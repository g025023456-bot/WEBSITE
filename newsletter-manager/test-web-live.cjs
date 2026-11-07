// בדיקה חיה של דף הניהול באתר עם מפתח ה-AI האמיתי, בתוך תהליך Electron אחד:
// המפתח נקרא מהשרת (עם ההתחברות השמורה במחשב) ונשאר בזיכרון בלבד; השרת המקומי מגיש את
// admin/ ומריץ את פונקציית ה-API האמיתית; החלון מריץ סריקה עם דירוג AI, חיפוש ברשת,
// וניסוח גיליון מלא מהדפדפן. הרצה: npx electron test-web-live.cjs
const { app, BrowserWindow, safeStorage } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('./app-config.cjs');

const root = path.join(__dirname, '..');
process.env.NEWSLETTER_USERS = 'test@ho-me.org.il:test-pass';
delete process.env.GITHUB_TOKEN;
const handler = require(path.join(root, 'api', 'newsletter-admin.js'));
const SAMPLE_HTML = fs.readFileSync(path.join(root, 'newsletter', '2026-10-14.html'), 'utf8');
// מפתח ההצפנה של ההתחברות השמורה נמצא ב-Local State של האפליקציה, לכן משתמשים באותה תיקיית נתונים.
app.setName('ho-me-newsletter-manager');
app.setPath('userData', path.join(app.getPath('appData'), 'ho-me-newsletter-manager'));

let liveKey = null;

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api/newsletter-admin') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body || '{}');
        const fake = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { res.writeHead(this.code || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); } };
        if (parsed.action === 'load') return fake.json({ ok: true, issues: [{ n: 4, date: '2026-10-14', title: 'גיליון בדיקה', sub: 'תיאור' }], scheduled: [], headSha: 'test' });
        if (parsed.action === 'readIssue') return fake.json({ ok: true, html: SAMPLE_HTML });
        if (parsed.action === 'diagnostics') return fake.json({ ok: true, github: { ok: true, push: true }, ai: { configured: Boolean(liveKey) } });
        if (parsed.action === 'aiKey') return fake.json({ ok: true, key: liveKey });
        await handler({ method: 'POST', headers: req.headers, body: parsed }, fake);
      });
      return;
    }
    const file = url.pathname === '/admin' ? '/admin/index.html' : url.pathname;
    const target = path.join(root, file);
    if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    const type = target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(target).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function fetchLiveKey() {
  const sessionFile = path.join(app.getPath('appData'), 'ho-me-newsletter-manager', 'session.json');
  const stored = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  const { email, password } = JSON.parse(String(safeStorage.decryptString(Buffer.from(stored.data, 'base64'))));
  const auth = Buffer.from(`${email}:${password}`, 'utf8').toString('base64');
  const response = await fetch(CONFIG.API_URL, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'aiKey', payload: {} }) });
  const data = await response.json();
  return data.key || null;
}

app.whenReady().then(async () => {
  liveKey = await fetchLiveKey();
  console.log('live key available:', Boolean(liveKey));
  const server = await startServer();
  const port = server.address().port;
  const window = new BrowserWindow({ width: 1440, height: 960, show: false, webPreferences: { sandbox: true } });
  const run = code => window.webContents.executeJavaScript(code, true);
  const waitFor = async (code, timeout = 20000, label = code) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await run(code)) return true;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    throw new Error(`timeout: ${label}`);
  };
  const shot = async name => fs.writeFileSync(path.join(__dirname, name), (await window.webContents.capturePage()).toPNG());
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 2 && !/srcdoc/.test(message)) console.log('CONSOLE:', message); });

  await window.loadURL(`http://127.0.0.1:${port}/admin`);
  await run('localStorage.clear()');
  await window.loadURL(`http://127.0.0.1:${port}/admin`);
  await waitFor('!document.getElementById("welcome").hidden');
  await run('document.getElementById("emailInput").value = "test@ho-me.org.il"; document.getElementById("passwordInput").value = "test-pass"; document.getElementById("connectButton").click(); true');
  await waitFor('!document.getElementById("workspace").hidden');
  await run('document.getElementById("navUpdates").click(); true');
  await waitFor('document.getElementById("aiChip").classList.contains("on")', 30000, 'ai chip on');
  console.log('AI CHIP:', await run('document.getElementById("aiChip").textContent'));

  console.log('scanning with AI scoring + web search...');
  await run('document.getElementById("scanButton").click(); true');
  await waitFor('!document.getElementById("scanStatus").hidden');
  await waitFor('document.getElementById("scanStatus").hidden', 600000, 'scan finished');
  await new Promise(resolve => setTimeout(resolve, 600));
  const scan = await run(`(() => { const f = JSON.parse(localStorage.getItem('nl.findings') || '[]'); return { total: f.length, withAi: f.filter(x => x.aiSummary).length, fromSearch: f.filter(x => x.via === 'search').length, important: f.filter(x => x.relevance >= 7).length, toast: document.getElementById('toast').textContent, top: f.filter(x => x.relevance >= 7).slice(0, 4).map(x => x.relevance + ' · ' + x.sourceName + ' · ' + x.title + ' · ' + x.aiSummary) }; })()`);
  console.log('AI SCAN', JSON.stringify(scan, null, 1));
  window.show();
  await shot('smoke-web-ai-scan.png');

  console.log('drafting...');
  await run('document.querySelector(".finding input[type=checkbox]").click(); document.getElementById("draftInstructions").value = "בדיקת מערכת: גיליון קצר ומדויק"; document.getElementById("draftButton").click(); true');
  await waitFor('!document.getElementById("draftOpenButton").hidden || !document.getElementById("draftCloseButton").hidden', 600000, 'draft finished');
  const draft = await run(`({ title: document.getElementById('draftTitle').textContent, result: document.getElementById('draftResult').innerText.slice(0, 700), canOpen: !document.getElementById('draftOpenButton').hidden })`);
  console.log('AI DRAFT', JSON.stringify(draft, null, 1));
  await shot('smoke-web-ai-draft.png');
  if (!draft.canOpen) throw new Error('draft failed');
  await run('document.getElementById("draftOpenButton").click(); true');
  await waitFor('!document.getElementById("editorBackdrop").hidden');
  console.log('EDITOR', JSON.stringify(await run(`({ title: document.getElementById('issueTitle').value, date: document.getElementById('issueDate').value, notes: document.querySelectorAll('#draftNotesList li').length })`)));
  await run('document.getElementById("editorSubmit").click(); true');
  await waitFor('!document.getElementById("publishBar").hidden', 10000, 'publish bar');
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log('ADDED', JSON.stringify(await run(`({ items: document.querySelectorAll('.issue-item').length, caption: document.getElementById('previewCaption').textContent, masthead: (document.getElementById('previewFrame').contentDocument.body.innerText.match(/גיליון \\d+ · [\\d.]+/) || [''])[0] })`)));
  fs.writeFileSync(path.join(__dirname, 'smoke-draft.html'), await run('state.pendingFiles.values().next().value'), 'utf8');
  await shot('smoke-web-ai-issue.png');
  console.log('WEB LIVE OK');
  server.close();
  app.exit(0);
}).catch(error => { console.error('WEB LIVE FAILED:', error.message); app.exit(1); });
