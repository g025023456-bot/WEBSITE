const { app, BrowserWindow, Menu, Tray, Notification, dialog, ipcMain, safeStorage, shell, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { GitHubStore } = require('./github.cjs');
const CONFIG = require('./app-config.cjs');
const { Discovery } = require('./discover.cjs');
const { AiService } = require('./ai.cjs');
const { renderIssue, contentProblems } = require('./template.cjs');

app.setName('ho-me-newsletter-manager');
app.setAppUserModelId('il.org.ho-me.newsletter-manager');
// HO_ME_USER_DATA: תיקיית נתונים חלופית לבדיקות אוטומטיות, כדי לא לגעת בנתוני המשתמש.
app.setPath('userData', process.env.HO_ME_USER_DATA || path.join(app.getPath('appData'), 'ho-me-newsletter-manager'));

const ASSETS = path.join(__dirname, 'assets');
const APP_ICON = path.join(ASSETS, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const START_HIDDEN = process.argv.includes('--hidden');

let session = null;   // { email, password, canWrite }
let anonStore = null; // anonymous GitHub reads for view-only mode
let loadedHead = null;
let mainWindow = null;
let tray = null;
let quitting = false;

const discovery = new Discovery({ dataDir: path.join(app.getPath('userData'), 'discovery') });
const ai = new AiService({
  dataDir: app.getPath('userData'),
  safeStorage,
  getServerKey: async () => {
    if (!session || !session.canWrite) return null;
    const result = await callApi('aiKey', {});
    return result.key || null;
  }
});

/* ---------- single instance ---------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

/* ---------- settings (local, plain) ---------- */

const DEFAULT_SETTINGS = {
  monitor: { enabled: false, intervalHours: 6, notify: true, webSearch: false },
  manualWebSearch: true,
  startWithWindows: false,
  keepInTray: true,
  trayHintShown: false,
  shortcutCreated: false
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function getSettings() {
  try {
    const stored = JSON.parse(await fs.readFile(settingsPath(), 'utf8'));
    return { ...DEFAULT_SETTINGS, ...stored, monitor: { ...DEFAULT_SETTINGS.monitor, ...(stored.monitor || {}) } };
  } catch (error) {
    return { ...DEFAULT_SETTINGS, monitor: { ...DEFAULT_SETTINGS.monitor } };
  }
}

async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch, monitor: { ...current.monitor, ...(patch.monitor || {}) } };
  next.monitor.intervalHours = [1, 3, 6, 12, 24].includes(Number(next.monitor.intervalHours)) ? Number(next.monitor.intervalHours) : 6;
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  if (app.isPackaged && typeof patch.startWithWindows === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: next.startWithWindows, path: process.execPath, args: ['--hidden'] });
  }
  updateTrayMenu(next);
  return next;
}

/* ---------- drafts (local, plain JSON) ---------- */
// טיוטות: כל גיליון שנוסח עם AI נשמר כאן אוטומטית, כדי שלא יאבד עד הפרסום ויהיה זמין גם אחרי כן.

function draftsPath() {
  return path.join(app.getPath('userData'), 'drafts.json');
}

async function getDrafts() {
  try {
    const drafts = JSON.parse(await fs.readFile(draftsPath(), 'utf8'));
    return Array.isArray(drafts) ? drafts : [];
  } catch (error) {
    return [];
  }
}

async function saveDrafts(drafts) {
  await fs.writeFile(draftsPath(), JSON.stringify(drafts, null, 2), 'utf8');
  return drafts;
}

async function upsertDraft(draft) {
  const drafts = await getDrafts();
  const index = drafts.findIndex(item => item.id === draft.id);
  const now = new Date().toISOString();
  if (index >= 0) drafts[index] = { ...drafts[index], ...draft, updatedAt: now };
  else drafts.unshift({ ...draft, createdAt: draft.createdAt || now, updatedAt: now });
  return saveDrafts(drafts.slice(0, 200));
}

async function removeDraft(id) {
  const drafts = await getDrafts();
  return saveDrafts(drafts.filter(item => item.id !== id));
}

/* ---------- desktop shortcut ---------- */

function shortcutPath() {
  return path.join(app.getPath('desktop'), 'ניהול הניוזלטרים · הורה ומיוחד.lnk');
}

function createDesktopShortcut() {
  if (process.platform !== 'win32') return { ok: false, reason: 'לא Windows' };
  if (!app.isPackaged) return { ok: false, reason: 'קיצור דרך נוצר רק מהגרסה המותקנת (לא מ-npm start).' };
  const ok = shell.writeShortcutLink(shortcutPath(), 'create', {
    target: process.execPath,
    cwd: path.dirname(process.execPath),
    icon: process.execPath,
    iconIndex: 0,
    description: 'ניהול הניוזלטרים · הורה ומיוחד',
    appUserModelId: 'il.org.ho-me.newsletter-manager'
  });
  return { ok, path: shortcutPath() };
}

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
  ai.forgetServerKey();
  await persistSession();
  return loadData();
}

async function logout() {
  session = null;
  ai.forgetServerKey();
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

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function showWindow(navigateTo = null) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (navigateTo) sendToWindow('app:navigate', navigateTo);
}

function notify(title, body, navigateTo = 'updates') {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body, icon: path.join(ASSETS, 'icon-256.png') });
  notification.on('click', () => showWindow(navigateTo));
  notification.show();
}

/* ---------- discovery + monitoring ---------- */

async function discoveryState() {
  const [sources, findings, status, settings, aiStatus] = await Promise.all([
    discovery.getSources(), discovery.getFindings(), discovery.getStatus(), getSettings(), ai.status()
  ]);
  return { sources, findings, status, settings, ai: aiStatus, running: discovery.running };
}

async function runDiscovery({ mode = 'manual', webSearch = false } = {}) {
  const aiStatus = await ai.status();
  const result = await discovery.run({
    ai: aiStatus.available ? ai : null,
    mode,
    webSearch: webSearch && aiStatus.available,
    onProgress: event => sendToWindow('discover:progress', event)
  });
  sendToWindow('discover:finished', { summary: result.summary, mode });
  return result;
}

let monitorBusy = false;
async function monitorTick(force = false) {
  if (monitorBusy || discovery.running) return;
  const settings = await getSettings();
  if (!force && !settings.monitor.enabled) return;
  const status = await discovery.getStatus();
  const due = !status.lastAutoRun || (Date.now() - Date.parse(status.lastAutoRun)) >= settings.monitor.intervalHours * 3600 * 1000;
  if (!force && !due) return;
  monitorBusy = true;
  try {
    if (!session) await restoreSession();
    const result = await runDiscovery({ mode: 'auto', webSearch: settings.monitor.webSearch });
    if (settings.monitor.notify && result.important.length) {
      const top = result.important.slice(0, 2).map(finding => `· ${finding.title}`).join('\n');
      notify(
        result.important.length === 1 ? 'נמצא עדכון חשוב חדש' : `נמצאו ${result.important.length} עדכונים חשובים`,
        `${top}${result.important.length > 2 ? '\nועוד...' : ''}\nלחצו כדי לפתוח ולנסח גיליון.`
      );
    } else if (settings.monitor.notify && result.added.length && force) {
      notify('הסריקה הסתיימה', `נמצאו ${result.added.length} פריטים חדשים, אף אחד מהם לא סומן כחשוב.`);
    }
  } catch (error) {
    // שגיאת רשת בסריקה אוטומטית: ננסה שוב בבדיקה הבאה.
  } finally {
    monitorBusy = false;
  }
}

/* ---------- tray ---------- */

function updateTrayMenu(settings) {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'פתיחת ניהול הניוזלטרים', click: () => showWindow() },
    { label: 'חיפוש עדכונים עכשיו', click: () => { showWindow('updates'); sendToWindow('app:run-discovery', {}); } },
    { type: 'separator' },
    {
      label: 'מעקב אוטומטי אחרי המקורות',
      type: 'checkbox',
      checked: Boolean(settings.monitor.enabled),
      click: async item => { await setSettings({ monitor: { enabled: item.checked } }); sendToWindow('settings:changed', await getSettings()); }
    },
    { type: 'separator' },
    { label: 'יציאה', click: () => { quitting = true; app.quit(); } }
  ]));
}

async function createTray() {
  const image = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(image);
  tray.setToolTip('הורה ומיוחד · ניהול הניוזלטרים');
  tray.on('click', () => showWindow());
  updateTrayMenu(await getSettings());
}

/* ---------- window ---------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1050,
    minHeight: 700,
    show: !START_HIDDEN,
    backgroundColor: '#f5f2f8',
    title: 'ניהול הניוזלטרים · הורה ומיוחד',
    icon: APP_ICON,
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
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('close', async event => {
    if (quitting) return;
    const settings = await getSettings().catch(() => DEFAULT_SETTINGS);
    if (!settings.keepInTray || !settings.monitor.enabled) return;
    event.preventDefault();
    mainWindow.hide();
    if (!settings.trayHintShown) {
      await setSettings({ trayHintShown: true });
      notify('ממשיכים לעקוב ברקע', 'האפליקציה ממשיכה לבדוק את המקורות ותתריע על עדכונים חשובים. ליציאה מלאה: לחיצה ימנית על האייקון באזור ההתראות.', null);
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
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
  ipcMain.handle('newsletter:save-file', async (event, file) => {
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'שמירת קובץ HTML לרב מסר',
      defaultPath: path.join(app.getPath('downloads'), path.basename(String(file.name))),
      filters: [{ name: 'קובץ HTML', extensions: ['html'] }]
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, String(file.content), 'utf8');
    return result.filePath;
  });

  /* discovery, sources, findings */
  ipcMain.handle('app:open-external', (_event, url) => {
    if (!/^https?:\/\//i.test(String(url))) throw new Error('כתובת לא תקינה.');
    return shell.openExternal(String(url));
  });
  ipcMain.handle('discover:state', () => discoveryState());
  ipcMain.handle('discover:run', async (_event, options) => {
    const settings = await getSettings();
    const webSearch = options && typeof options.webSearch === 'boolean' ? options.webSearch : settings.manualWebSearch;
    const result = await runDiscovery({ mode: 'manual', webSearch });
    return { ...(await discoveryState()), result: { summary: result.summary, sourceResults: result.sourceResults, addedCount: result.added.length, importantCount: result.important.length } };
  });
  ipcMain.handle('discover:source-add', async (_event, entry) => discovery.addSource(entry));
  ipcMain.handle('discover:source-update', (_event, id, patch) => discovery.updateSource(id, patch || {}));
  ipcMain.handle('discover:source-remove', (_event, id) => discovery.removeSource(id));
  ipcMain.handle('discover:source-test', (_event, id) => discovery.testSource(id));
  ipcMain.handle('discover:sources-reset', () => discovery.resetSources());
  ipcMain.handle('newsletter:diagnostics', () => callApi('diagnostics', {}));
  ipcMain.handle('discover:finding-status', (_event, ids, status) => discovery.setFindingStatus(ids, status));

  /* settings + AI */
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_event, patch) => setSettings(patch || {}));
  ipcMain.handle('ai:status', () => ai.status());
  ipcMain.handle('ai:set-key', async (_event, key) => { await ai.setKey(key); return ai.status(); });
  ipcMain.handle('ai:test-key', (_event, key) => ai.testKey(key));

  /* drafting: findings → AI → full issue HTML on the published template */
  ipcMain.handle('draft:generate', async (_event, request) => {
    const findings = await discovery.getFindings();
    const wanted = new Set(request.findingIds || []);
    const selected = findings.filter(finding => wanted.has(finding.id));
    if (!selected.length && !String(request.instructions || '').trim()) {
      throw new Error('בחרו לפחות עדכון אחד, או כתבו נושא והנחיות לכותב.');
    }
    const draft = await ai.draft({
      findings: selected,
      instructions: String(request.instructions || ''),
      styleSample: String(request.styleSample || ''),
      onProgress: event => sendToWindow('draft:progress', event)
    });
    const n = Number(request.issueNumber) || 1;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(request.date || '') ? request.date : new Date().toISOString().slice(0, 10);
    const html = renderIssue({ n, date, content: draft });
    if (selected.length) await discovery.setFindingStatus(selected.map(finding => finding.id), 'used');
    return { html, n, date, draft, problems: contentProblems(html) };
  });
  ipcMain.handle('monitor:run-now', () => monitorTick(true));

  /* drafts + shortcut */
  ipcMain.handle('drafts:list', () => getDrafts());
  ipcMain.handle('drafts:save', (_event, draft) => upsertDraft(draft));
  ipcMain.handle('drafts:remove', (_event, id) => removeDraft(id));
  ipcMain.handle('app:create-shortcut', () => createDesktopShortcut());
  ipcMain.handle('app:open-preview', async (_event, html) => {
    // תצוגה בדפדפן המלא של המחשב: קובץ זמני בתיקיית הנתונים.
    const file = path.join(app.getPath('userData'), 'preview.html');
    await fs.writeFile(file, String(html), 'utf8');
    await shell.openPath(file);
    return true;
  });

  createWindow();
  await createTray();
  const settings = await getSettings();
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: Boolean(settings.startWithWindows), path: process.execPath, args: ['--hidden'] });
    // בהפעלה הראשונה של הגרסה המותקנת נוצר קיצור דרך בשולחן העבודה (פעם אחת; אפשר ליצור שוב מההגדרות).
    if (!settings.shortcutCreated) {
      try {
        const result = createDesktopShortcut();
        if (result.ok) await setSettings({ shortcutCreated: true });
      } catch (error) { /* בלי קיצור דרך האפליקציה עדיין עובדת */ }
    }
  }
  setTimeout(() => monitorTick(false), 90 * 1000);
  setInterval(() => monitorTick(false), 5 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { quitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && quitting) app.quit();
  else if (process.platform !== 'darwin') {
    // החלון נסגר בלי מעקב פעיל: יוצאים. עם מעקב פעיל החלון רק מוסתר, והאפליקציה נשארת בטריי.
    getSettings().then(settings => { if (!settings.keepInTray || !settings.monitor.enabled) app.quit(); });
  }
});
