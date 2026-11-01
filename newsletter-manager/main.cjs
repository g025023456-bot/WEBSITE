const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { GitHubStore } = require('./github.cjs');
const CONFIG = require('./app-config.cjs');

app.setName('ho-me-newsletter-manager');
app.setPath('userData', path.join(app.getPath('appData'), 'ho-me-newsletter-manager'));

let session = null;   // { email, password, canWrite }
let anonStore = null; // anonymous GitHub reads for view-only mode
let loadedHead = null;

/* ---------- session persistence (encrypted, local) ---------- */

function sessionPath() {
  return path.join(app.getPath('userData'), 'session.json');
}

async function persistSession() {
  if (!session) {
    await fs.rm(sessionPath(), { force: true });
    return;
  }
  const raw = JSON.stringify({ email: session.email, password: session.password });
  const stored = safeStorage.isEncryptionAvailable()
    ? { data: safeStorage.encryptString(raw).toString('base64'), encrypted: true }
    : { data: Buffer.from(raw, 'utf8').toString('base64'), encrypted: false };
  await fs.writeFile(sessionPath(), JSON.stringify(stored), 'utf8');
}

async function restoreSession() {
  try {
    const stored = JSON.parse(await fs.readFile(sessionPath(), 'utf8'));
    const raw = stored.encrypted
      ? safeStorage.decryptString(Buffer.from(stored.data, 'base64'))
      : Buffer.from(stored.data, 'base64').toString('utf8');
    const saved = JSON.parse(raw);
    if (!saved.email || !saved.password) return false;
    session = { email: saved.email, password: saved.password, canWrite: false };
    try {
      await callApi('ping', {});
      session.canWrite = true;
    } catch (error) {
      session = null;
      return false;
    }
    return true;
  } catch (error) {
    session = null;
    return false;
  }
}

/* ---------- server API ---------- */

async function callApi(action, payload) {
  if (!session) throw new Error('נדרשת התחברות.');
  const auth = Buffer.from(`${session.email}:${session.password}`, 'utf8').toString('base64');
  let response;
  try {
    response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload: payload || {} })
    });
  } catch (error) {
    throw new Error('אין חיבור לאינטרנט, או שהשרת אינו זמין כרגע.');
  }
  const data = await response.json().catch(() => ({}));
  if (data && data.error) throw new Error(data.error);
  if (!response.ok) throw new Error(`שגיאת שרת ${response.status}.`);
  return data;
}

/* ---------- data loading ---------- */

function getAnonStore() {
  if (!anonStore) anonStore = new GitHubStore(CONFIG.REPO, null);
  return anonStore;
}

function parseIssuesPublic(source) {
  const marker = 'window.NEWSLETTER_ISSUES = [';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error('לא נמצא מערך הניוזלטרים בקובץ newsletter-data.js.');
  const arrayStart = markerIndex + marker.length;
  const arrayEnd = source.indexOf('];', arrayStart);
  if (arrayEnd < 0) throw new Error('מבנה newsletter-data.js אינו תקין.');
  const body = source.slice(arrayStart, arrayEnd);
  const rowPattern = /^\s*\{\s*n:\s*(\d+)\s*,\s*date:\s*'((?:\\.|[^'\\])*)'\s*,\s*title:\s*'((?:\\.|[^'\\])*)'\s*,\s*sub:\s*'((?:\\.|[^'\\])*)'\s*\}\s*,?\s*$/gm;
  const decode = value => value.replace(/\\([\\'nrt])/g, (_, c) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c));
  const issues = [];
  let match;
  while ((match = rowPattern.exec(body)) !== null) {
    issues.push({ n: Number(match[1]), date: decode(match[2]), title: decode(match[3]), sub: decode(match[4]) });
  }
  if (body.trim() && issues.length === 0) throw new Error('לא ניתן לקרוא את מבנה הגיליונות.');
  return issues;
}

async function loadData() {
  if (session && session.canWrite) {
    const data = await callApi('load', {});
    loadedHead = data.headSha;
    return {
      email: session.email,
      canWrite: true,
      issues: data.issues,
      scheduled: data.scheduled,
      headSha: data.headSha
    };
  }
  // view-only mode: anonymous read of the public repo
  const store = getAnonStore();
  const head = await store.head();
  const manifest = await store.readFile('newsletter/newsletter-data.js', head);
  if (manifest === null) throw new Error('לא נמצא newsletter-data.js במאגר.');
  const issues = parseIssuesPublic(manifest);
  let scheduled = [];
  const scheduleRaw = await store.readFile('newsletter/scheduled/schedule.json', head);
  if (scheduleRaw !== null) {
    try { scheduled = JSON.parse(scheduleRaw); } catch (error) { scheduled = []; }
  }
  loadedHead = head;
  return {
    email: session ? session.email : null,
    canWrite: false,
    issues,
    scheduled: Array.isArray(scheduled) ? scheduled : [],
    headSha: head
  };
}

async function readIssue(date, scheduledFile = false) {
  if (session && session.canWrite) {
    const data = await callApi('readIssue', { date, scheduled: scheduledFile });
    return data.html;
  }
  const store = getAnonStore();
  const filePath = scheduledFile ? `newsletter/scheduled/${date}.html` : `newsletter/${date}.html`;
  const html = await store.readFile(filePath, loadedHead || await store.head());
  if (html === null) throw new Error(`הקובץ של ${date} לא נמצא במאגר.`);
  return html;
}

/* ---------- auth actions ---------- */

async function login(details) {
  const email = String(details.email || '').trim().toLowerCase();
  const password = String(details.password || '');
  if (!email || !password) throw new Error('יש למלא אימייל וסיסמה.');
  session = { email, password, canWrite: false };
  try {
    await callApi('ping', {});
  } catch (error) {
    session = null;
    throw error;
  }
  session.canWrite = true;
  await persistSession();
  return loadData();
}

async function logout() {
  session = null;
  if (anonStore) anonStore.blobCache.clear();
  await persistSession();
}

/* ---------- misc ---------- */

async function importHtml(window) {
  const result = await dialog.showOpenDialog(window, {
    title: 'בחירת קובץ HTML לניוזלטר',
    properties: ['openFile'],
    filters: [{ name: 'קובץ HTML', extensions: ['html', 'htm'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const content = await fs.readFile(result.filePaths[0], 'utf8');
  if (!/<html(?:\s|>)/i.test(content)) throw new Error('הקובץ שנבחר אינו מסמך HTML תקין.');
  return { name: path.basename(result.filePaths[0]), content };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#f5f2f8',
    title: 'ניהול הניוזלטרים · הורה ומיוחד',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#562e8c', symbolColor: '#ffffff', height: 48 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
  return window;
}

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  ipcMain.handle('newsletter:get-session', async () => {
    if (!session) await restoreSession();
    return session ? { email: session.email, canWrite: session.canWrite } : null;
  });
  ipcMain.handle('newsletter:login', (_event, details) => login(details));
  ipcMain.handle('newsletter:logout', () => logout());
  ipcMain.handle('newsletter:load', () => loadData());
  ipcMain.handle('newsletter:read-issue', (_event, date) => readIssue(date, false));
  ipcMain.handle('newsletter:schedule-read', (_event, date) => readIssue(date, true));
  ipcMain.handle('newsletter:confirm-discard', async event => {
    const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
      type: 'warning',
      title: 'שינויים שלא נשמרו',
      message: 'יש שינויים שלא נשמרו. להמשיך ולבטל אותם?',
      buttons: ['חזרה לעריכה', 'ביטול השינויים'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    return result.response === 1;
  });
  ipcMain.handle('newsletter:save', async (_event, payload) => {
    await callApi('save', payload);
    return loadData();
  });
  ipcMain.handle('newsletter:schedule-add', async (_event, entry) => {
    const result = await callApi('scheduleAdd', entry);
    return result.entries;
  });
  ipcMain.handle('newsletter:schedule-remove', async (_event, date) => {
    const result = await callApi('scheduleRemove', { date });
    return result.entries;
  });
  ipcMain.handle('newsletter:schedule-publish', async (_event, date) => {
    await callApi('schedulePublish', { date });
    return loadData();
  });
  ipcMain.handle('newsletter:import-html', event => importHtml(BrowserWindow.fromWebContents(event.sender)));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
