// שכבת החיבור של דף הניהול באתר: מממשת את אותו ממשק newsletterApp של
// אפליקציית הדסקטופ, מעל קריאות fetch לפונקציית /api/newsletter-admin.
// הקובץ admin/app.js נבנה אוטומטית: web-bridge.js + renderer.js (npm run build-admin).
(function () {
  const API = '/api/newsletter-admin';

  function savedAuth() {
    return localStorage.getItem('newsletter-auth') || null;
  }

  function savedEmail() {
    return localStorage.getItem('newsletter-email') || null;
  }

  async function call(action, payload, authOverride) {
    const auth = authOverride || savedAuth();
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = `Basic ${auth}`;
    let response;
    try {
      response = await fetch(API, {
        method: 'POST',
        headers,
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

  function encodeCredentials(email, password) {
    return btoa(unescape(encodeURIComponent(`${email}:${password}`)));
  }

  const desktopOnly = () => Promise.reject(new Error('איתור עדכונים וניסוח עם AI זמינים באפליקציית הדסקטופ בלבד.'));
  const noop = () => () => {};

  window.newsletterApp = {
    // מנוע העדכונים (מעקב, התראות, ניסוח AI) רץ רק בדסקטופ; דף הווב מציג את ניהול הגיליונות בלבד.
    features: { discovery: false, desktop: false },
    openExternal(url) { window.open(url, '_blank', 'noopener'); return Promise.resolve(); },
    diagnostics() { return call('diagnostics'); },
    discovery: { state: desktopOnly, run: desktopOnly, addSource: desktopOnly, updateSource: desktopOnly, removeSource: desktopOnly, testSource: desktopOnly, resetSources: desktopOnly, setFindingStatus: desktopOnly, onProgress: noop, onFinished: noop },
    settings: { get: desktopOnly, set: desktopOnly, onChanged: noop },
    ai: { status: desktopOnly, setKey: desktopOnly, testKey: desktopOnly },
    draft: { generate: desktopOnly, onProgress: noop },
    onNavigate: noop,
    onRunDiscovery: noop,

    async getSession() {
      if (!savedAuth()) return null;
      try {
        const result = await call('ping');
        return { email: result.email, canWrite: true };
      } catch (error) {
        localStorage.removeItem('newsletter-auth');
        localStorage.removeItem('newsletter-email');
        return null;
      }
    },

    async login(details) {
      const email = String(details.email || '').trim().toLowerCase();
      const password = String(details.password || '');
      if (!email || !password) throw new Error('יש למלא אימייל וסיסמה.');
      const auth = encodeCredentials(email, password);
      await call('ping', {}, auth);
      localStorage.setItem('newsletter-auth', auth);
      localStorage.setItem('newsletter-email', email);
      const data = await call('load');
      return { email, canWrite: true, issues: data.issues, scheduled: data.scheduled, headSha: data.headSha };
    },

    async logout() {
      localStorage.removeItem('newsletter-auth');
      localStorage.removeItem('newsletter-email');
    },

    async load() {
      if (!savedAuth()) throw new Error('נדרשת התחברות.');
      const data = await call('load');
      return { email: savedEmail(), canWrite: true, issues: data.issues, scheduled: data.scheduled, headSha: data.headSha };
    },

    async readIssue(date) {
      return (await call('readIssue', { date })).html;
    },

    async scheduleRead(date) {
      return (await call('readIssue', { date, scheduled: true })).html;
    },

    confirmDiscard() {
      return Promise.resolve(window.confirm('יש שינויים שלא נשמרו. להמשיך ולבטל אותם?'));
    },

    importHtml() {
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.html,.htm';
        input.addEventListener('change', () => {
          const file = input.files && input.files[0];
          if (!file) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, content: String(reader.result) });
          reader.onerror = () => resolve(null);
          reader.readAsText(file, 'utf-8');
        });
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      });
    },

    saveFile(file) {
      const url = URL.createObjectURL(new Blob([file.content], { type: 'text/html;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return Promise.resolve(file.name);
    },

    async save(payload) {
      await call('save', payload);
      return this.load();
    },

    async scheduleAdd(entry) {
      return (await call('scheduleAdd', entry)).entries;
    },

    async scheduleRemove(date) {
      return (await call('scheduleRemove', { date })).entries;
    },

    async schedulePublish(date) {
      await call('schedulePublish', { date });
      return this.load();
    }
  };
})();

const state = {
  connected: false,
  email: null,
  canWrite: false,
  headSha: null,
  issues: [],
  scheduled: [],
  selectedDate: null,
  editingDate: null,
  editorIsNew: false,
  pendingFiles: new Map(),
  editedFiles: new Map(),
  textEditing: null,
  deletedDates: new Set(),
  dirty: false,
  toastTimer: null,
  query: '',
  textCache: new Map(),
  view: 'issues',
  draftMeta: null,     // פרטי טיוטת AI שנפתחה בעורך הגיליון
  pendingDraft: null,  // תוצאת ניסוח שעוד לא נפתחה
  updates: { loaded: false, sources: [], findings: [], status: {}, settings: null, ai: null, selected: new Set(), filter: 'new', scanning: false }
};

const $ = id => document.getElementById(id);
const elements = {
  welcome: $('welcome'),
  workspace: $('workspace'),
  connectionLabel: $('connectionLabel'),
  logoutButton: $('logoutButton'),
  connectForm: $('connectForm'),
  emailInput: $('emailInput'),
  passwordInput: $('passwordInput'),
  connectError: $('connectError'),
  connectButton: $('connectButton'),
  viewOnlyButton: $('viewOnlyButton'),
  issueList: $('issueList'),
  previewFrame: $('previewFrame'),
  previewEmpty: $('previewEmpty'),
  previewCaption: $('previewCaption'),
  issueCount: $('issueCount'),
  latestDate: $('latestDate'),
  saveButton: $('saveButton'),
  saveState: $('saveState'),
  editorBackdrop: $('editorBackdrop'),
  issueForm: $('issueForm'),
  editorTitle: $('editorTitle'),
  editorError: $('editorError'),
  editorSubmit: $('editorSubmit'),
  dateHint: $('dateHint'),
  draftNotes: $('draftNotes'),
  draftNotesList: $('draftNotesList'),
  toast: $('toast'),
  searchInput: $('searchInput'),
  searchCount: $('searchCount'),
  noResults: $('noResults'),
  scheduledPanel: $('scheduledPanel'),
  scheduledList: $('scheduledList'),
  scheduleRow: $('scheduleRow'),
  scheduleCheck: $('scheduleCheck'),
  addButton: $('addButton'),
  editButton: $('editButton'),
  editTextButton: $('editTextButton'),
  finishTextButton: $('finishTextButton'),
  cancelTextButton: $('cancelTextButton'),
  editToolbar: $('editToolbar'),
  toolSize: $('toolSize'),
  previewDevice: $('previewDevice'),
  deviceDesktop: $('deviceDesktop'),
  deviceMobile: $('deviceMobile'),
  downloadEmailButton: $('downloadEmailButton'),
  refreshButton: $('refreshButton'), // desktop only; the web page refreshes with F5
  publishBar: $('publishBar'),
  publishBarDetail: $('publishBarDetail'),
  publishButton: $('publishButton'),
  discardButton: $('discardButton'),
  viewIssues: $('viewIssues'),
  viewUpdates: $('viewUpdates'),
  viewSources: $('viewSources'),
  navUpdates: $('navUpdates'),
  navSources: $('navSources'),
  diagLabel: $('diagLabel'),
  manageSourcesButton: $('manageSourcesButton'),
  sourcesResetButton: $('sourcesResetButton'),
  sourcesScanButton: $('sourcesScanButton'),
  sourceFormFull: $('sourceFormFull'),
  sourceNameFull: $('sourceNameFull'),
  sourceUrlFull: $('sourceUrlFull'),
  sourceErrorFull: $('sourceErrorFull'),
  sourceAddFullButton: $('sourceAddFullButton'),
  sourcesTable: $('sourcesTable'),
  sourcesCount: $('sourcesCount'),
  updatesBadge: $('updatesBadge'),
  scanButton: $('scanButton'),
  scanStatus: $('scanStatus'),
  scanStatusText: $('scanStatusText'),
  settingsButton: $('settingsButton'),
  monitorToggle: $('monitorToggle'),
  monitorInfo: $('monitorInfo'),
  aiChip: $('aiChip'),
  findingsList: $('findingsList'),
  findingsEmpty: $('findingsEmpty'),
  findingsCaption: $('findingsCaption'),
  sourcesList: $('sourcesList'),
  sourceForm: $('sourceForm'),
  sourceName: $('sourceName'),
  sourceUrl: $('sourceUrl'),
  sourceError: $('sourceError'),
  sourceAddButton: $('sourceAddButton'),
  draftBar: $('draftBar'),
  draftCount: $('draftCount'),
  draftInstructions: $('draftInstructions'),
  draftButton: $('draftButton'),
  draftBackdrop: $('draftBackdrop'),
  draftTitle: $('draftTitle'),
  draftResult: $('draftResult'),
  draftCloseButton: $('draftCloseButton'),
  draftOpenButton: $('draftOpenButton'),
  settingsBackdrop: $('settingsBackdrop'),
  settingsError: $('settingsError'),
  aiKeyInput: $('aiKeyInput'),
  aiKeyStatus: $('aiKeyStatus'),
  aiKeyHint: $('aiKeyHint')
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function prettyDate(date) {
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : date;
}

function prettyDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function relativeTime(iso) {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return 'לפני רגע';
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'לפני שעה' : `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'אתמול' : `לפני ${days} ימים`;
}

function cleanError(message) {
  return String(message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

function setDirty(value) {
  state.dirty = value;
  elements.saveButton.disabled = !value || !state.canWrite;
  elements.saveState.classList.toggle('dirty', value);
  elements.saveState.classList.toggle('saving', false);
  elements.saveState.innerHTML = value
    ? '<span class="state-dot"></span> יש שינויים שלא פורסמו'
    : '<span class="state-dot"></span> האתר מעודכן';
  updateBars();
}

// הפס התחתון: פרסום (כשיש שינויים, בתצוגת הגיליונות) או ניסוח (כשנבחרו ממצאים, בתצוגת העדכונים).
function updateBars() {
  const showPublish = state.view === 'issues' && state.dirty && state.canWrite;
  const showDraft = state.view === 'updates' && state.updates.selected.size > 0;
  elements.publishBar.hidden = !showPublish;
  elements.draftBar.hidden = !showDraft;
  document.body.classList.toggle('has-bar', showPublish || showDraft);
  if (showPublish) {
    const parts = [];
    const newCount = state.issues.filter(issue => !issue.sourceDate).length;
    const deleted = state.deletedDates.size;
    const edited = state.editedFiles.size;
    if (newCount) parts.push(newCount === 1 ? 'גיליון חדש אחד' : `${newCount} גיליונות חדשים`);
    if (edited) parts.push(edited === 1 ? 'עריכת טקסט בגיליון אחד' : `עריכת טקסט ב-${edited} גיליונות`);
    if (deleted) parts.push(deleted === 1 ? 'מחיקת גיליון אחד' : `מחיקת ${deleted} גיליונות`);
    elements.publishBarDetail.textContent = parts.length
      ? `${parts.join(' · ')}. האתר יתעדכן תוך דקה-שתיים אחרי הפרסום.`
      : 'שינוי בסדר או בפרטי הגיליונות. האתר יתעדכן תוך דקה-שתיים אחרי הפרסום.';
  }
  if (showDraft) {
    const count = state.updates.selected.size;
    elements.draftCount.textContent = count === 1 ? 'נבחר עדכון אחד' : `נבחרו ${count} עדכונים`;
  }
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = cleanError(message);
  elements.toast.classList.toggle('error', isError);
  elements.toast.classList.add('visible');
  state.toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), isError ? 6500 : 4200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function getPreviewHtml(html) {
  const baseTag = '<base href="https://ho-me.org.il/newsletter/" data-preview-base="">';
  if (/<base\b/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
}

// The current HTML of an issue: a new file, a text edit, or the file as loaded from the site.
function issueContent(issue) {
  return state.pendingFiles.get(issue.date)
    || (issue.sourceDate && (state.editedFiles.get(issue.sourceDate) || state.loadedFiles?.get(issue.sourceDate)))
    || '';
}

function renderPreview(issue) {
  const content = issueContent(issue);
  if (!content) {
    elements.previewFrame.srcdoc = '';
    elements.previewFrame.hidden = true;
    elements.previewEmpty.hidden = false;
    elements.previewCaption.textContent = 'לא ניתן לטעון תצוגה לגיליון זה';
    return;
  }
  elements.previewFrame.hidden = false;
  elements.previewEmpty.hidden = true;
  elements.previewFrame.srcdoc = getPreviewHtml(content);
  elements.previewCaption.textContent = `גיליון ${issue.n} · ${prettyDate(issue.date)}`;
}

/* ---------- views ---------- */

function setView(view) {
  const hasDiscovery = Boolean(window.newsletterApp && window.newsletterApp.features && window.newsletterApp.features.discovery);
  if (view !== 'issues' && !hasDiscovery) return;
  state.view = view;
  elements.viewIssues.hidden = view !== 'issues';
  elements.viewUpdates.hidden = view !== 'updates';
  elements.viewSources.hidden = view !== 'sources';
  document.querySelectorAll('.side-link[data-view]').forEach(link => link.classList.toggle('active', link.dataset.view === view));
  if (view !== 'issues' && !state.updates.loaded) loadUpdates();
  updateBars();
}

/* ---------- diagnostics: GitHub token + AI key on the server ---------- */

async function runDiagnostics() {
  if (!state.canWrite || !window.newsletterApp.diagnostics) return;
  let result;
  try {
    result = await window.newsletterApp.diagnostics();
  } catch (error) {
    // שרת ישן בלי פעולת האבחון, או ניתוק רגעי: לא מציגים כלום.
    elements.diagLabel.hidden = true;
    return;
  }
  const rows = [];
  if (result.github && result.github.ok && result.github.push) {
    rows.push('<div class="row ok"><span class="state-dot"></span>GitHub: מפתח תקין עם הרשאת כתיבה</div>');
  } else if (result.github && result.github.ok) {
    rows.push('<div class="row warn"><span class="state-dot"></span>GitHub: המפתח נקרא, אבל נראה שאין לו הרשאת כתיבה (Contents: Read and write). פרסום עלול להיכשל.</div>');
    showToast('מפתח ה-GitHub ב-Vercel נראה ללא הרשאת כתיבה. בדקו שלאסימון יש Contents: Read and write על מאגר האתר.', true);
  } else {
    rows.push(`<div class="row warn"><span class="state-dot"></span>GitHub: ${escapeHtml(result.github ? result.github.error : 'לא נבדק')}</div>`);
    showToast(`בעיה במפתח ה-GitHub ב-Vercel: ${result.github ? result.github.error : ''}`, true);
  }
  rows.push(result.ai && result.ai.configured
    ? '<div class="row ok"><span class="state-dot"></span>מפתח AI מוגדר באתר (Vercel)</div>'
    : '<div class="row"><span class="state-dot"></span>מפתח AI לא מוגדר באתר (ANTHROPIC_API_KEY)</div>');
  elements.diagLabel.innerHTML = rows.join('');
  elements.diagLabel.hidden = false;
}

document.querySelectorAll('.side-link[data-view]').forEach(link => {
  link.addEventListener('click', () => setView(link.dataset.view));
});

/* ---------- scheduled issues ---------- */

function renderScheduled() {
  const entries = state.scheduled || [];
  elements.scheduledPanel.hidden = entries.length === 0;
  elements.scheduledList.replaceChildren();
  const today = todayIso();
  entries.forEach(entry => {
    const due = entry.date <= today;
    const item = document.createElement('div');
    item.className = `scheduled-item${due ? ' due' : ''}`;
    const main = document.createElement('div');
    main.className = 'sched-main';
    main.innerHTML = `<div class="sched-meta"><span>${escapeHtml(prettyDate(entry.date))}</span>${due ? '<span class="due-badge">הגיע מועד הפרסום</span>' : ''}</div><div class="sched-title">${escapeHtml(entry.title)}</div>`;
    main.addEventListener('click', () => previewScheduled(entry));
    const actions = document.createElement('div');
    actions.className = 'sched-actions';
    if (state.canWrite) {
      const publish = document.createElement('button');
      publish.className = 'mini-button';
      publish.type = 'button';
      publish.textContent = due ? 'פרסום לאתר עכשיו' : 'פרסום מוקדם';
      publish.addEventListener('click', () => publishScheduled(entry));
      const remove = document.createElement('button');
      remove.className = 'mini-button danger';
      remove.type = 'button';
      remove.textContent = 'הסרה';
      remove.addEventListener('click', () => removeScheduled(entry));
      actions.append(publish, remove);
    }
    item.append(main, actions);
    elements.scheduledList.append(item);
  });
}

async function previewScheduled(entry) {
  try {
    const html = await window.newsletterApp.scheduleRead(entry.date);
    elements.previewFrame.hidden = false;
    elements.previewEmpty.hidden = true;
    elements.previewFrame.srcdoc = getPreviewHtml(html);
    elements.previewCaption.textContent = `גיליון עתידי · ${prettyDate(entry.date)}`;
  } catch (error) {
    showToast(error.message, true);
  }
}

async function publishScheduled(entry) {
  if (!window.confirm(`לפרסם לאתר עכשיו את "${entry.title}" (${prettyDate(entry.date)})? הגיליון יעלה לאוויר תוך דקה-שתיים ויהפוך לגיליון האחרון.`)) return;
  try {
    const result = await window.newsletterApp.schedulePublish(entry.date);
    await loadData(result);
    showToast('הגיליון פורסם. האתר מתעדכן תוך דקה-שתיים. את המייל משגרים או מתזמנים ברב מסר.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function removeScheduled(entry) {
  if (!window.confirm(`להסיר את הגיליון העתידי "${entry.title}"? הקובץ שלו יימחק מהמאגר.`)) return;
  try {
    state.scheduled = await window.newsletterApp.scheduleRemove(entry.date);
    renderScheduled();
    showToast('הגיליון העתידי הוסר.');
  } catch (error) {
    showToast(error.message, true);
  }
}

/* ---------- search ---------- */

function issueText(issue) {
  const html = issueContent(issue);
  const key = `${issue.date}:${html.length}`;
  if (!state.textCache.has(key)) {
    state.textCache.set(key, html
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .toLowerCase());
  }
  return state.textCache.get(key);
}

function issueMatches(issue, query) {
  const haystack = [
    `גיליון ${issue.n}`, String(issue.n), issue.date, prettyDate(issue.date),
    issue.title, issue.sub
  ].join(' ').toLowerCase();
  if (haystack.includes(query)) return true;
  return issueText(issue).includes(query);
}

/* ---------- main render ---------- */

function render() {
  const issues = state.issues;
  const query = state.query.trim().toLowerCase();
  const visible = query ? issues.filter(issue => issueMatches(issue, query)) : issues;
  elements.welcome.hidden = state.connected;
  elements.workspace.hidden = !state.connected;
  elements.logoutButton.hidden = !state.connected || !state.email;
  if (elements.refreshButton) elements.refreshButton.hidden = !state.connected;
  elements.connectionLabel.textContent = state.connected
    ? (state.email ? `${state.email}${state.canWrite ? '' : ' · צפייה בלבד'}` : 'צפייה בלבד, ללא התחברות')
    : 'לא מחובר';
  if (!state.connected || !state.canWrite) elements.diagLabel.hidden = true;
  elements.addButton.disabled = !state.canWrite;
  elements.issueCount.textContent = String(issues.length);
  const firstKept = issues.find(issue => !state.deletedDates.has(issue.sourceDate));
  elements.latestDate.textContent = firstKept ? prettyDate(firstKept.date) : '·';
  elements.searchCount.hidden = !query;
  elements.searchCount.textContent = query ? `${visible.length} מתוך ${issues.length}` : '';
  elements.noResults.hidden = !query || visible.length > 0;
  renderScheduled();
  elements.issueList.replaceChildren();

  visible.forEach(issue => {
    const index = issues.indexOf(issue);
    const isDeleted = state.deletedDates.has(issue.sourceDate);
    const item = document.createElement('article');
    item.dataset.date = issue.date;
    item.className = `issue-item${issue === firstKept ? ' latest' : ''}${issue.date === state.selectedDate ? ' selected' : ''}${isDeleted ? ' deleted' : ''}`;

    const controls = document.createElement('div');
    controls.className = 'order-controls';
    controls.append(
      makeOrderButton('↑', query ? 'סידור זמין רק ללא חיפוש' : 'העברה למעלה', Boolean(query) || index === 0 || !state.canWrite, () => moveIssue(index, -1)),
      makeOrderButton('↓', query ? 'סידור זמין רק ללא חיפוש' : 'העברה למטה', Boolean(query) || index === issues.length - 1 || !state.canWrite, () => moveIssue(index, 1))
    );

    const main = document.createElement('div');
    main.className = 'issue-main';
    main.tabIndex = 0;
    main.setAttribute('role', 'button');
    main.setAttribute('aria-label', `תצוגה מקדימה: ${issue.title}`);
    main.innerHTML = `<div class="issue-meta"><span>גיליון ${escapeHtml(issue.n)}</span><span>·</span><span>${escapeHtml(prettyDate(issue.date))}</span>${issue === firstKept ? '<span class="latest-badge">מוצג ראשון</span>' : ''}${!issue.sourceDate ? '<span class="edited-badge">חדש · טרם פורסם</span>' : ''}${isDeleted ? '<span class="deleted-badge">יימחק בפרסום</span>' : ''}${state.editedFiles.has(issue.sourceDate) ? '<span class="edited-badge">טקסט נערך</span>' : ''}</div><div class="issue-title">${escapeHtml(issue.title)}</div><div class="issue-sub">${escapeHtml(issue.sub || 'ללא תיאור')}</div>`;
    main.addEventListener('click', () => selectIssue(issue));
    main.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectIssue(issue);
      }
    });

    const actions = document.createElement('div');
    actions.className = 'issue-actions';
    if (state.canWrite) {
      const edit = document.createElement('button');
      edit.className = 'mini-button';
      edit.type = 'button';
      edit.textContent = 'עריכה';
      edit.disabled = isDeleted;
      edit.addEventListener('click', () => openEditor(issue));
      actions.append(edit);
      if (issue.sourceDate) {
        const remove = document.createElement('button');
        remove.className = 'mini-button danger';
        remove.type = 'button';
        remove.textContent = isDeleted ? 'ביטול מחיקה' : 'מחיקה';
        remove.addEventListener('click', () => toggleDelete(issue));
        actions.append(remove);
      } else {
        const drop = document.createElement('button');
        drop.className = 'mini-button danger';
        drop.type = 'button';
        drop.textContent = 'הסרה';
        drop.title = 'הסרת הגיליון החדש מהרשימה לפני הפרסום';
        drop.addEventListener('click', () => dropNewIssue(issue));
        actions.append(drop);
      }
    }
    item.append(controls, main, actions);
    elements.issueList.append(item);
  });

  updatePreviewButtons();
  updateBars();
  if (issues.length && !issues.some(issue => issue.date === state.selectedDate)) {
    selectIssue(issues[0]);
  }
}

function updatePreviewButtons() {
  const issue = state.issues.find(item => item.date === state.selectedDate);
  const editable = state.canWrite && Boolean(issue) && !state.deletedDates.has(issue.sourceDate);
  const editing = Boolean(state.textEditing);
  elements.editButton.disabled = !editable;
  elements.editTextButton.disabled = !editable || !issueContent(issue);
  elements.editButton.hidden = editing;
  elements.editTextButton.hidden = editing;
  elements.finishTextButton.hidden = !editing;
  elements.cancelTextButton.hidden = !editing;
  elements.editToolbar.hidden = !editing;
  elements.previewDevice.classList.toggle('editing', editing);
  elements.downloadEmailButton.disabled = !issue || !issueContent(issue) || editing;
}

function makeOrderButton(label, title, disabled, onClick) {
  const button = document.createElement('button');
  button.className = 'order-button';
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function selectIssue(issue) {
  if (state.textEditing) {
    if (issue.date !== state.textEditing.date) showToast('סיימו או בטלו קודם את עריכת הטקסט.', true);
    return;
  }
  state.selectedDate = issue.date;
  renderPreview(issue);
  document.querySelectorAll('.issue-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.date === issue.date);
  });
  updatePreviewButtons();
}

function dropNewIssue(issue) {
  if (state.textEditing) {
    showToast('סיימו או בטלו קודם את עריכת הטקסט.', true);
    return;
  }
  if (!window.confirm(`להסיר את הגיליון החדש "${issue.title}" מהרשימה? הוא עדיין לא פורסם, ולא יישמר.`)) return;
  state.issues = state.issues.filter(item => item !== issue);
  state.pendingFiles.delete(issue.date);
  const stillDirty = state.issues.some(item => !item.sourceDate) || state.editedFiles.size > 0 || state.deletedDates.size > 0;
  setDirty(stillDirty);
  render();
}

/* ---------- text editing inside the preview ---------- */

// Keeps the original file byte-for-byte outside <body>, and inside it drops the <tbody>
// tags the browser parser adds, so an edit changes only the edited text.
function serializePreview(doc, originalHtml) {
  const bodyOpen = originalHtml.match(/<body[^>]*>/i);
  const bodyClose = originalHtml.toLowerCase().lastIndexOf('</body>');
  if (bodyOpen && bodyClose > bodyOpen.index) {
    let inner = doc.body.innerHTML;
    if (!/<tbody/i.test(originalHtml)) inner = inner.replace(/<\/?tbody>/g, '');
    const bodyStart = bodyOpen.index + bodyOpen[0].length;
    const trailing = originalHtml.slice(bodyStart, bodyClose).match(/\s*$/)[0];
    inner = inner.replace(/\s*$/, trailing);
    return originalHtml.slice(0, bodyStart) + inner + originalHtml.slice(bodyClose);
  }
  const root = doc.documentElement.cloneNode(true);
  root.querySelectorAll('[data-preview-base]').forEach(node => node.remove());
  const doctype = originalHtml.match(/^\s*(<!doctype[^>]*>)/i)?.[1] || '<!DOCTYPE html>';
  return `${doctype}\n${root.outerHTML}\n`;
}

function startTextEdit() {
  const issue = state.issues.find(item => item.date === state.selectedDate);
  const doc = elements.previewFrame.contentDocument;
  if (!issue || !doc || !doc.body || !doc.body.childNodes.length) {
    showToast('הגיליון עדיין נטען. נסו שוב בעוד רגע.', true);
    return;
  }
  const originalHtml = issueContent(issue);
  state.textEditing = { date: issue.date, originalHtml, baseline: serializePreview(doc, originalHtml) };
  doc.designMode = 'on';
  // Formatting as plain tags (<b>, <i>, <u>), which every mail client understands.
  doc.execCommand('styleWithCSS', false, false);
  // Enter adds a line break (not a new <div>, which mail clients collapse), except inside
  // a list where it starts a new item. Paste is plain text only.
  doc.addEventListener('keydown', event => {
    if (event.key === 'Enter' && state.textEditing && !closestInEditor('li')) {
      event.preventDefault();
      doc.execCommand('insertLineBreak');
    }
  });
  doc.addEventListener('paste', event => {
    event.preventDefault();
    doc.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  });
  doc.addEventListener('drop', event => event.preventDefault());
  doc.addEventListener('selectionchange', () => {
    if (!state.textEditing) return;
    const selection = doc.getSelection();
    if (selection.rangeCount && doc.body.contains(selection.anchorNode)) {
      state.textEditing.range = selection.getRangeAt(0).cloneRange();
    }
    updateToolbarState();
  });
  updatePreviewButtons();
  doc.body.focus();
}

/* ---------- rich-text toolbar ---------- */

function editorDoc() {
  return state.textEditing ? elements.previewFrame.contentDocument : null;
}

// Puts focus and the last selection back into the newsletter before running a command
// (clicking a toolbar control moves focus out of the preview).
function restoreSelection() {
  const doc = editorDoc();
  const live = doc.getSelection();
  const hasLive = live.rangeCount && !live.isCollapsed && doc.body.contains(live.anchorNode);
  elements.previewFrame.contentWindow.focus();
  const range = state.textEditing.range;
  if (!hasLive && range) {
    const selection = doc.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return doc;
}

function closestInEditor(selector) {
  const doc = editorDoc();
  const node = doc?.getSelection().anchorNode;
  const element = node && (node.nodeType === 1 ? node : node.parentElement);
  return element ? element.closest(selector) : null;
}

function requireSelection(doc) {
  const selection = doc.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) {
    showToast('סמנו קודם את הטקסט שרוצים לעצב.', true);
    return false;
  }
  return true;
}

// Wraps the selected text in <span style="..."> (inline style, the only kind mail clients keep).
// The browser marks the selection with a temporary <font>, which is then swapped for a span.
function applyInlineStyle(style) {
  const doc = restoreSelection();
  if (!requireSelection(doc)) return;
  doc.execCommand('fontName', false, 'ho-me-wrap');
  const properties = style.split(';').map(rule => rule.split(':')[0].trim()).filter(Boolean);
  doc.querySelectorAll('font[face="ho-me-wrap"]').forEach(font => {
    const span = doc.createElement('span');
    span.setAttribute('style', style);
    span.append(...font.childNodes);
    font.replaceWith(span);
    // An older style on the same text would win over the new one; drop it.
    span.querySelectorAll('[style]').forEach(inner => {
      properties.forEach(property => inner.style.removeProperty(property));
      if (!inner.getAttribute('style').trim()) inner.removeAttribute('style');
    });
  });
}

function styleNewLists(doc) {
  doc.querySelectorAll('ol:not([style]), ul:not([style])').forEach(list => {
    list.setAttribute('style', 'margin:0 0 10px 0; padding:0 22px 0 0;');
  });
  doc.querySelectorAll('li:not([style])').forEach(item => item.setAttribute('style', 'margin:0 0 4px 0;'));
}

function clearFormatting() {
  const doc = restoreSelection();
  if (!requireSelection(doc)) return;
  const range = doc.getSelection().getRangeAt(0);
  let root = range.commonAncestorContainer;
  if (root.nodeType !== 1) root = root.parentElement;
  // Only text-level tags. Links and the newsletter's buttons (<a style>) are left untouched.
  const candidates = [root, ...root.querySelectorAll('*')]
    .filter(element => element.matches('b, strong, i, em, u, s, strike, font, mark, span') && range.intersectsNode(element));
  candidates.forEach(element => element.replaceWith(...element.childNodes));
  if (!candidates.length) showToast('אין עיצוב להסרה בטקסט שסומן.');
}

function runCommand(command) {
  const doc = restoreSelection();
  if (command === 'link') return openLinkDialog();
  if (command === 'removeFormat') return clearFormatting();
  doc.execCommand(command, false, null);
  if (command === 'insertOrderedList' || command === 'insertUnorderedList') styleNewLists(doc);
  updateToolbarState();
}

function updateToolbarState() {
  const doc = editorDoc();
  if (!doc) return;
  elements.editToolbar.querySelectorAll('[data-state]').forEach(button => {
    let active = false;
    try { active = doc.queryCommandState(button.dataset.state); } catch (error) { /* unsupported */ }
    button.classList.toggle('active', active);
  });
}

function normalizeUrl(value) {
  const url = value.trim();
  if (!url) return '';
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(url)) return `https://${url}`;
  return null;
}

let linkDialog = null;
function openLinkDialog() {
  const doc = editorDoc();
  const selection = doc.getSelection();
  const selectedText = selection.rangeCount ? selection.toString() : '';
  const currentLink = closestInEditor('a');
  if (!linkDialog) {
    linkDialog = document.createElement('div');
    linkDialog.className = 'modal-backdrop';
    linkDialog.innerHTML = `
      <section class="editor-modal" role="dialog" aria-modal="true" aria-labelledby="linkTitle">
        <div class="modal-heading"><div><span class="eyebrow">עריכת טקסט</span><h2 id="linkTitle">הוספת קישור</h2></div></div>
        <form id="linkForm">
          <label for="linkUrl">כתובת הקישור</label>
          <input id="linkUrl" type="text" dir="ltr" placeholder="https://ho-me.org.il/...  או  a@ho-me.org.il">
          <label for="linkText" id="linkTextLabel">טקסט הקישור</label>
          <input id="linkText" type="text">
          <div id="linkError" class="form-error" role="alert"></div>
          <div class="modal-actions">
            <button type="button" id="linkCancel" class="button button-outline">ביטול</button>
            <button type="submit" class="button button-primary">הוספת קישור</button>
          </div>
        </form>
      </section>`;
    document.body.append(linkDialog);
    $('linkCancel').addEventListener('click', () => { linkDialog.hidden = true; });
    linkDialog.addEventListener('click', event => { if (event.target === linkDialog) linkDialog.hidden = true; });
    $('linkForm').addEventListener('submit', event => {
      event.preventDefault();
      const url = normalizeUrl($('linkUrl').value);
      if (!url) {
        $('linkError').textContent = url === '' ? 'יש להזין כתובת.' : 'הכתובת אינה תקינה. מתחילים ב-https:// או כותבים כתובת מייל.';
        return;
      }
      linkDialog.hidden = true;
      insertLink(url, $('linkText').value.trim());
    });
  }
  $('linkError').textContent = '';
  $('linkUrl').value = currentLink?.getAttribute('href') || '';
  $('linkText').value = selectedText;
  const needsText = !selectedText && !currentLink;
  $('linkText').hidden = !needsText;
  $('linkTextLabel').hidden = !needsText;
  linkDialog.hidden = false;
  $('linkUrl').focus();
}

function insertLink(url, text) {
  const doc = restoreSelection();
  const existing = closestInEditor('a');
  if (existing) {
    existing.setAttribute('href', url);
    return;
  }
  const selection = doc.getSelection();
  const link = doc.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener');
  link.setAttribute('style', 'color:#562E8C; text-decoration:underline;');
  if (selection.rangeCount && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    link.append(range.extractContents());
    range.insertNode(link);
  } else {
    link.textContent = text || url.replace(/^mailto:/, '');
    if (selection.rangeCount) selection.getRangeAt(0).insertNode(link);
    else return;
  }
  selection.removeAllRanges();
  const after = doc.createRange();
  after.setStartAfter(link);
  selection.addRange(after);
}

elements.editToolbar.addEventListener('mousedown', event => {
  // Keep the text selection inside the newsletter while clicking toolbar buttons.
  if (event.target.closest('button')) event.preventDefault();
});
elements.editToolbar.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !state.textEditing) return;
  if (button.dataset.cmd) runCommand(button.dataset.cmd);
  else if (button.dataset.mark) applyInlineStyle(`background-color:${button.dataset.mark}; color:#3d2a06;`);
  else if (button.dataset.color === '#EA6A4C') {
    // Brand orange on white passes WCAG AA only as large bold text, so it comes with both.
    applyInlineStyle('color:#EA6A4C; font-weight:800; font-size:19px;');
  } else if (button.dataset.color) applyInlineStyle(`color:${button.dataset.color};`);
});
elements.toolSize.addEventListener('change', () => {
  const size = elements.toolSize.value;
  elements.toolSize.value = '';
  if (size && state.textEditing) applyInlineStyle(`font-size:${size}px;`);
});

/* ---------- preview size: desktop / mobile ---------- */

const DESKTOP_WIDTH = 760;

// Desktop mode renders the page at a real desktop width and scales it down to fit the panel.
function fitPreview() {
  const frame = elements.previewFrame;
  const box = elements.previewDevice;
  const scale = box.clientWidth / DESKTOP_WIDTH;
  if (box.classList.contains('mobile') || scale >= 1) {
    frame.style.width = frame.style.height = frame.style.transform = frame.style.left = '';
    return;
  }
  frame.style.left = 'auto';
  frame.style.width = `${DESKTOP_WIDTH}px`;
  frame.style.height = `${box.clientHeight / scale}px`;
  frame.style.transformOrigin = 'top right';
  frame.style.transform = `scale(${scale})`;
}
new ResizeObserver(fitPreview).observe(elements.previewDevice);

function setDevice(mobile) {
  elements.previewDevice.classList.toggle('mobile', mobile);
  fitPreview();
  elements.deviceMobile.classList.toggle('active', mobile);
  elements.deviceDesktop.classList.toggle('active', !mobile);
  elements.deviceMobile.setAttribute('aria-pressed', String(mobile));
  elements.deviceDesktop.setAttribute('aria-pressed', String(!mobile));
}
elements.deviceDesktop.addEventListener('click', () => setDevice(false));
elements.deviceMobile.addEventListener('click', () => setDevice(true));

/* ---------- email version for Rav Messer ---------- */

const UNSUBSCRIBE_PLACEHOLDER = '{{קישור הסרה · רב-מסר}}';

// Site version → email version (CLAUDE.md section 2): no scripts, no OG tags, no
// "all issues" back bar, and the Rav Messer unsubscribe placeholder in the footer.
function toEmailHtml(html) {
  let out = html
    .replace(/[ \t]*<!--[^>]*?(Google Analytics|תפריט נגישות|Open Graph)[\s\S]*?-->[ \t]*\r?\n?/g, '')
    .replace(/[ \t]*<script\b[\s\S]*?<\/script>[ \t]*\r?\n?/gi, '')
    .replace(/[ \t]*<meta[^>]+(property=["']og:|name=["']twitter:)[^>]*>[ \t]*\r?\n?/gi, '')
    .replace(/[ \t]*<base\b[^>]*>[ \t]*\r?\n?/gi, '')
    .replace(/[ \t]*<div class="backbar">[\s\S]*?<\/div>[ \t]*\r?\n?/i, '')
    .replace(/[ \t]*\.backbar[^{]*\{[^}]*\}[ \t]*\r?\n?/g, '')
    .replace('(גרסת אתר)', '(גרסת מייל)');
  if (!out.includes(UNSUBSCRIBE_PLACEHOLDER)) {
    const footerLink = /(<a href="https:\/\/ho-me\.org\.il\/newsletter\/"[^>]*>כל הגיליונות<\/a>)/;
    out = footerLink.test(out)
      ? out.replace(footerLink, `$1<br>\n                ${UNSUBSCRIBE_PLACEHOLDER}`)
      : out.replace(/<\/body>/i, `<p style="text-align:center; font-size:12px; color:#6f6680;">${UNSUBSCRIBE_PLACEHOLDER}</p>\n</body>`);
  }
  return out;
}

// The pre-send checks from CLAUDE.md section 6.8.
function emailProblems(html) {
  const text = html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const count = pattern => (html.match(pattern) || []).length;
  const problems = [];
  if (/o@ho-me/i.test(html)) problems.push('מופיעה הכתובת o@ho-me.org.il (של העמותה: a@ho-me.org.il)');
  if (/—/.test(text)) problems.push('יש בטקסט קו מפריד ארוך (—)');
  if (/₪|ש["״]ח|\d\s*%|\d[\d,.]*\s*שקל/.test(text)) problems.push('נראה שיש בטקסט סכום או אחוז');
  if (/width=["']600["']/i.test(html)) problems.push('יש רוחב קבוע width="600" (מכווץ את המייל בנייד)');
  if (count(/<tr[\s>]/gi) !== count(/<\/tr>/gi)) problems.push(`מספר תגי <tr> ו-</tr> לא שווה`);
  if (count(/<td[\s>]/gi) !== count(/<\/td>/gi)) problems.push(`מספר תגי <td> ו-</td> לא שווה`);
  return problems;
}

async function downloadEmailHtml() {
  const issue = state.issues.find(item => item.date === state.selectedDate);
  const content = issue && issueContent(issue);
  if (!content) return;
  const html = toEmailHtml(content);
  const problems = emailProblems(html);
  if (problems.length && !window.confirm(`בדיקות לפני שליחה מצאו:\n· ${problems.join('\n· ')}\n\nלהוריד את הקובץ בכל זאת?`)) return;
  try {
    const saved = await window.newsletterApp.saveFile({ name: `${issue.date}-מייל.html`, content: html });
    if (!saved) return;
    const pending = state.dirty ? ' שימו לב: יש שינויים שעוד לא פורסמו לאתר, והם כלולים בקובץ.' : '';
    showToast(`הקובץ נשמר: ${saved}. ברב מסר: עורך HTML / קוד מקור, מדביקים את כל הקובץ.${pending}`);
  } catch (error) {
    showToast(error.message, true);
  }
}
elements.downloadEmailButton.addEventListener('click', downloadEmailHtml);

function finishTextEdit() {
  const editing = state.textEditing;
  const doc = elements.previewFrame.contentDocument;
  const issue = state.issues.find(item => item.date === editing.date);
  doc.designMode = 'off';
  const html = serializePreview(doc, editing.originalHtml);
  if (html === editing.baseline) {
    state.textEditing = null;
    updatePreviewButtons();
    showToast('לא בוצעו שינויים בטקסט.');
    return;
  }
  // CLAUDE.md content rules: no long dash, and the association address is a@ (not o@).
  const problems = [];
  if (/—/.test(doc.body.textContent)) problems.push('· יש בטקסט קו מפריד ארוך (—). מחליפים בפסיק, נקודה או ·');
  if (/o@ho-me/i.test(html)) problems.push('· מופיעה הכתובת o@ho-me.org.il. הכתובת של העמותה היא a@ho-me.org.il');
  if (problems.length && !window.confirm(`שימו לב:\n${problems.join('\n')}\n\nלשמור את העריכה בכל זאת?`)) {
    doc.designMode = 'on';
    return;
  }
  if (issue.sourceDate && !state.pendingFiles.has(issue.date)) {
    state.editedFiles.set(issue.sourceDate, html);
  } else {
    state.pendingFiles.set(issue.date, html);
  }
  state.textEditing = null;
  state.textCache.clear();
  setDirty(true);
  render();
  renderPreview(issue);
  showToast('העריכה נשמרה בטיוטה. לחצו "פרסום השינויים לאתר החי" כדי להעלות אותה לאתר.');
}

function cancelTextEdit() {
  const issue = state.issues.find(item => item.date === state.textEditing.date);
  state.textEditing = null;
  updatePreviewButtons();
  if (issue) renderPreview(issue);
}

function moveIssue(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= state.issues.length) return;
  [state.issues[index], state.issues[target]] = [state.issues[target], state.issues[index]];
  setDirty(true);
  render();
}

function toggleDelete(issue) {
  if (state.textEditing) {
    showToast('סיימו או בטלו קודם את עריכת הטקסט.', true);
    return;
  }
  if (state.deletedDates.has(issue.sourceDate)) {
    state.deletedDates.delete(issue.sourceDate);
  } else {
    const keptCount = state.issues.filter(item => item.sourceDate && !state.deletedDates.has(item.sourceDate)).length
      + state.issues.filter(item => !item.sourceDate).length;
    if (keptCount <= 1) {
      showToast('חייב להישאר לפחות גיליון אחד באתר.', true);
      return;
    }
    if (!window.confirm(`לסמן למחיקה את "${issue.title}" (${prettyDate(issue.date)})? המחיקה תתבצע באתר בלחיצה על "פרסום לאתר", והיא מסירה את הגיליון והקובץ שלו לצמיתות.`)) return;
    state.deletedDates.add(issue.sourceDate);
  }
  setDirty(true);
  render();
}

/* ---------- editor ---------- */

function openEditor(issue = null, imported = null) {
  if (state.textEditing) {
    showToast('סיימו או בטלו קודם את עריכת הטקסט.', true);
    return;
  }
  state.importedHtml = imported?.html || null;
  state.draftMeta = imported?.aiDraft || null;
  state.editorIsNew = !issue;
  state.editingDate = issue?.date || null;
  elements.editorTitle.textContent = issue ? 'עריכת פרטי גיליון' : (state.draftMeta ? 'טיוטת גיליון חדש (נוסחה עם AI)' : 'הוספת גיליון חדש');
  elements.editorSubmit.textContent = issue ? 'שמירת פרטים' : 'הוספה לרשימת הגיליונות';
  elements.editorError.textContent = '';
  $('issueDate').value = issue?.date || imported?.date || '';
  $('issueTitle').value = issue?.title || imported?.title || '';
  $('issueSub').value = issue?.sub || imported?.sub || '';
  elements.dateHint.textContent = state.draftMeta
    ? 'ברירת המחדל: יום שני הקרוב. בדקו מול לוח השנה העברי שהתאריך לא נופל על חג, צום או חול המועד. מספר הגיליון והתאריך במאסטהד מתעדכנים לפי השדה הזה.'
    : 'התאריך בארכיון ובשם הקובץ. תוכן ה-HTML עצמו נשאר כפי שהועלה.';
  const notes = state.draftMeta?.notes || [];
  elements.draftNotes.hidden = !notes.length;
  elements.draftNotesList.replaceChildren(...notes.map(note => {
    const item = document.createElement('li');
    item.textContent = note;
    return item;
  }));
  elements.scheduleRow.hidden = !state.editorIsNew;
  elements.scheduleCheck.checked = state.editorIsNew && !state.draftMeta && Boolean(imported?.date) && imported.date > todayIso();
  elements.editorBackdrop.hidden = false;
  $('issueDate').focus();
}

function closeEditor() {
  elements.editorBackdrop.hidden = true;
  state.editingDate = null;
}

function getMetadata(html) {
  const getMeta = pattern => html.match(pattern)?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() || '';
  let title = getMeta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (!title) title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
  title = title.replace(/\s*[·|–-]\s*הורה ומיוחד\s*$/, '').trim();
  const sub = getMeta(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || getMeta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  return { title, sub };
}

function dateFromFilename(filename) {
  const match = filename.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || '';
}

// טיוטת AI: מספר הגיליון והתאריך שנבחרו בטופס נכנסים למאסטהד, ל-<title>, להערת הפתיחה ול-og:url.
function applyIssueMeta(html, n, date) {
  const label = `גיליון ${n} · ${prettyDate(date)}`;
  return html
    .replace(/גיליון \d+ · \d{2}\.\d{2}\.\d{4}/g, label)
    .replace(/(<title>[^<]*גיליון )\d+(<\/title>)/, `$1${n}$2`)
    .replace(/(og:url" content="https:\/\/ho-me\.org\.il\/newsletter\/)\d{4}-\d{2}-\d{2}(\.html")/, `$1${date}$2`);
}

/* ---------- data loading ---------- */

async function loadData(data) {
  if (!data) return;
  state.connected = true;
  state.email = data.email || null;
  state.canWrite = data.canWrite;
  state.headSha = data.headSha;
  state.issues = data.issues.map(issue => ({ ...issue, sourceDate: issue.date }));
  state.scheduled = data.scheduled || [];
  state.pendingFiles.clear();
  state.editedFiles.clear();
  state.textEditing = null;
  state.deletedDates.clear();
  state.textCache.clear();
  state.loadedFiles = new Map();
  state.selectedDate = state.issues[0]?.date || null;
  setDirty(false);
  render();
  setLoading(true);
  try {
    for (const issue of state.issues) {
      try {
        const file = await window.newsletterApp.readIssue(issue.date);
        state.loadedFiles.set(issue.date, file);
      } catch (error) {
        // issue listed in the manifest but file missing in the repo; preview will show a notice
      }
    }
  } finally {
    setLoading(false);
  }
  if (state.issues[0]) selectIssue(state.issues[0]);
  elements.diagLabel.hidden = true;
  if (state.canWrite) runDiagnostics();
  const due = (state.scheduled || []).filter(entry => entry.date <= todayIso());
  if (due.length && state.canWrite) {
    showToast(`יש ${due.length === 1 ? 'גיליון עתידי שהגיע מועדו' : due.length + ' גיליונות עתידיים שהגיע מועדם'}. פרסמו אותו מהרשימה למעלה.`);
  }
}

/* ---------- events ---------- */

elements.connectForm.addEventListener('submit', async event => {
  event.preventDefault();
  elements.connectError.textContent = '';
  elements.connectButton.disabled = true;
  elements.connectButton.textContent = 'מתחבר...';
  try {
    const result = await window.newsletterApp.login({
      email: elements.emailInput.value,
      password: elements.passwordInput.value
    });
    elements.passwordInput.value = '';
    await loadData(result);
    if (result.notice) {
      showToast(result.notice, true);
    } else {
      showToast(`שלום ${state.email}, מחובר עם הרשאת ניהול מלאה.`);
    }
    if (state.updates.loaded) loadUpdates();
  } catch (error) {
    elements.connectError.textContent = cleanError(error.message);
  } finally {
    elements.connectButton.disabled = false;
    elements.connectButton.textContent = 'התחברות';
  }
});

if (elements.viewOnlyButton) elements.viewOnlyButton.addEventListener('click', async () => {
  elements.connectError.textContent = '';
  elements.viewOnlyButton.disabled = true;
  try {
    const data = await window.newsletterApp.load();
    await loadData(data);
  } catch (error) {
    elements.connectError.textContent = cleanError(error.message);
  } finally {
    elements.viewOnlyButton.disabled = false;
  }
});

elements.logoutButton.addEventListener('click', async () => {
  if (state.dirty && !(await window.newsletterApp.confirmDiscard())) return;
  await window.newsletterApp.logout();
  state.connected = false;
  state.email = null;
  state.canWrite = false;
  state.issues = [];
  state.scheduled = [];
  setDirty(false);
  render();
  if (state.updates.loaded) loadUpdates();
});

async function reloadFromSite() {
  const selected = state.selectedDate;
  await loadData(await window.newsletterApp.load());
  const again = state.issues.find(issue => issue.date === selected);
  if (again) selectIssue(again);
}

if (elements.refreshButton) elements.refreshButton.addEventListener('click', async () => {
  if ((state.dirty || state.textEditing) && !(await window.newsletterApp.confirmDiscard())) return;
  elements.refreshButton.disabled = true;
  elements.refreshButton.classList.add('spinning');
  try {
    await reloadFromSite();
    showToast('הגיליונות נטענו מחדש מהאתר.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.classList.remove('spinning');
  }
});

elements.discardButton.addEventListener('click', async () => {
  if (!(await window.newsletterApp.confirmDiscard())) return;
  try {
    await reloadFromSite();
    showToast('השינויים בוטלו. הרשימה נטענה מחדש מהאתר.');
  } catch (error) {
    showToast(error.message, true);
  }
});

elements.searchInput.addEventListener('input', () => {
  state.query = elements.searchInput.value;
  render();
});

elements.addButton.addEventListener('click', async () => {
  try {
    const imported = await window.newsletterApp.importHtml();
    if (!imported) return;
    const metadata = getMetadata(imported.content);
    openEditor(null, {
      ...metadata,
      date: dateFromFilename(imported.name),
      html: imported.content
    });
  } catch (error) {
    showToast(error.message, true);
  }
});

elements.editButton.addEventListener('click', () => {
  const issue = state.issues.find(item => item.date === state.selectedDate);
  if (issue && !state.deletedDates.has(issue.sourceDate)) openEditor(issue);
});

elements.editTextButton.addEventListener('click', startTextEdit);
elements.finishTextButton.addEventListener('click', finishTextEdit);
elements.cancelTextButton.addEventListener('click', cancelTextEdit);

$('closeEditorButton').addEventListener('click', closeEditor);
$('cancelEditorButton').addEventListener('click', closeEditor);
elements.editorBackdrop.addEventListener('click', event => {
  if (event.target === elements.editorBackdrop) closeEditor();
});

elements.issueForm.addEventListener('submit', event => {
  event.preventDefault();
  const date = $('issueDate').value;
  const title = $('issueTitle').value.trim();
  const sub = $('issueSub').value.trim();
  const duplicate = state.issues.some(issue => issue.date === date && issue.date !== state.editingDate);
  if (!date || !title) {
    elements.editorError.textContent = 'יש למלא תאריך וכותרת.';
    return;
  }
  if (duplicate) {
    elements.editorError.textContent = 'כבר קיים גיליון בתאריך הזה.';
    return;
  }

  if (state.editorIsNew) {
    let html = state.importedHtml;
    if (typeof html !== 'string') {
      elements.editorError.textContent = 'יש לבחור קובץ HTML לפני הוספת גיליון.';
      return;
    }
    const nextNumber = Math.max(0, ...state.issues.map(issue => issue.n)) + 1;
    if (state.draftMeta) {
      html = applyIssueMeta(html, nextNumber, date)
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`);
    }
    if (elements.scheduleCheck.checked) {
      window.newsletterApp.scheduleAdd({ date, title, sub, html })
        .then(entries => {
          state.scheduled = entries;
          state.importedHtml = null;
          state.draftMeta = null;
          closeEditor();
          renderScheduled();
          showToast(`הגיליון נשמר כגיליון עתידי ל-${prettyDate(date)}. ביום היעד תוצג התראה לפרסום.`);
        })
        .catch(error => { elements.editorError.textContent = cleanError(error.message); });
      return;
    }
    state.issues.unshift({ n: nextNumber, date, title, sub, sourceDate: null });
    state.pendingFiles.set(date, html);
    state.importedHtml = null;
    state.selectedDate = date;
    if (state.draftMeta) {
      state.draftMeta = null;
      showToast('הטיוטה נוספה לרשימה ומוצגת בתצוגה המקדימה. בדקו אותה (אפשר לערוך את הטקסט), ואז לחצו "פרסום השינויים לאתר החי".');
    }
  } else {
    const issue = state.issues.find(item => item.date === state.editingDate);
    const pending = state.pendingFiles.get(issue.date);
    issue.date = date;
    issue.title = title;
    issue.sub = sub;
    if (pending) {
      state.pendingFiles.delete(state.editingDate);
      state.pendingFiles.set(date, pending);
    }
    state.selectedDate = date;
  }

  closeEditor();
  setDirty(true);
  render();
  const selected = state.issues.find(issue => issue.date === state.selectedDate);
  if (selected) selectIssue(selected);
});

async function publishChanges() {
  if (!state.dirty || !state.canWrite) return;
  if (state.textEditing) {
    showToast('לחצו קודם "סיום עריכה" כדי שהטקסט ייכלל בפרסום.', true);
    return;
  }
  const deletions = state.issues.filter(issue => state.deletedDates.has(issue.sourceDate));
  if (deletions.length) {
    const names = deletions.map(issue => `· גיליון ${issue.n} (${prettyDate(issue.date)}) ${issue.title}`).join('\n');
    if (!window.confirm(`הפרסום ימחק לצמיתות מהאתר את הגיליונות הבאים:\n${names}\n\nלהמשיך?`)) return;
  }
  elements.saveButton.disabled = true;
  elements.publishButton.disabled = true;
  elements.publishButton.textContent = 'מפרסם לאתר...';
  elements.saveState.classList.add('saving');
  elements.saveState.innerHTML = '<span class="state-dot"></span> מפרסם לאתר...';
  try {
    const kept = state.issues.filter(issue => !state.deletedDates.has(issue.sourceDate));
    const newFiles = {};
    const editedFiles = {};
    for (const issue of kept) {
      if (!issue.sourceDate) {
        const html = state.pendingFiles.get(issue.date);
        if (html) newFiles[issue.date] = html;
      } else if (state.editedFiles.has(issue.sourceDate)) {
        editedFiles[issue.sourceDate] = state.editedFiles.get(issue.sourceDate);
      }
    }
    const result = await window.newsletterApp.save({
      headSha: state.headSha,
      issues: kept.map(({ n, date, title, sub, sourceDate }) => ({ n, date, title, sub, sourceDate })),
      newFiles,
      editedFiles
    });
    await loadData(result);
    setFlowStep(3, true);
    showToast('השינויים פורסמו. האתר מתעדכן תוך דקה-שתיים. את המייל משגרים ברב מסר.');
  } catch (error) {
    setDirty(true);
    showToast(error.message, true);
  } finally {
    elements.publishButton.disabled = false;
    elements.publishButton.textContent = '⬆ פרסום השינויים לאתר החי';
  }
}
elements.saveButton.addEventListener('click', publishChanges);
elements.publishButton.addEventListener('click', publishChanges);

/* ---------- drag & drop + loading ---------- */

function setLoading(value) {
  const bar = $('loadingBar');
  if (bar) bar.hidden = !value;
}

function importFromContent(name, content) {
  if (!/<html(?:\s|>)/i.test(content)) {
    showToast('הקובץ אינו גיליון HTML תקין.', true);
    return;
  }
  const metadata = getMetadata(content);
  openEditor(null, { ...metadata, date: dateFromFilename(name), html: content });
}

(function setupDragDrop() {
  const overlay = $('dropOverlay');
  if (!overlay) return;
  let depth = 0;
  window.addEventListener('dragenter', event => {
    if (!state.canWrite || ![...event.dataTransfer.types].includes('Files')) return;
    depth++;
    overlay.hidden = false;
  });
  window.addEventListener('dragleave', () => {
    if (--depth <= 0) { depth = 0; overlay.hidden = true; }
  });
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', async event => {
    event.preventDefault();
    depth = 0;
    overlay.hidden = true;
    if (!state.canWrite) return;
    const file = [...event.dataTransfer.files].find(item => /\.html?$/i.test(item.name));
    if (!file) { showToast('אפשר לגרור לכאן קובץ HTML של גיליון.', true); return; }
    importFromContent(file.name, await file.text());
  });
})();

/* ======================================================================
   עדכונים מהרשת: מקורות, סריקה, ממצאים, ניסוח עם AI (דסקטופ בלבד)
   ====================================================================== */

const discoveryApi = () => window.newsletterApp.discovery;

function setFlowStep(step, done = false) {
  [1, 2, 3].forEach(n => {
    const element = $(`flowStep${n}`);
    element.classList.toggle('active', n === step && !done);
    element.classList.toggle('done', n < step || (n === step && done));
  });
}

function applyUpdatesState(data) {
  const u = state.updates;
  u.loaded = true;
  u.sources = data.sources || [];
  u.findings = data.findings || [];
  u.status = data.status || {};
  u.settings = data.settings || u.settings;
  u.ai = data.ai || u.ai;
  for (const id of [...u.selected]) {
    if (!u.findings.some(finding => finding.id === id)) u.selected.delete(id);
  }
  renderUpdates();
}

async function loadUpdates() {
  try {
    applyUpdatesState(await discoveryApi().state());
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderUpdates() {
  const u = state.updates;
  if (!u.loaded) return;
  const settings = u.settings || { monitor: {} };
  elements.monitorToggle.checked = Boolean(settings.monitor.enabled);
  const lastRun = u.status.lastRun;
  const parts = [];
  parts.push(lastRun ? `בדיקה אחרונה ${relativeTime(lastRun)} (${prettyDateTime(lastRun)})` : 'עדיין לא נבדק');
  if (settings.monitor.enabled) parts.push(settings.monitor.intervalHours === 1 ? 'כל שעה' : `כל ${settings.monitor.intervalHours} שעות`);
  elements.monitorInfo.textContent = parts.join(' · ');
  if (u.ai && u.ai.available) {
    elements.aiChip.textContent = `AI פעיל · ${u.ai.source === 'local' ? 'מפתח מהמחשב הזה' : 'מפתח מהגדרות האתר'}`;
    elements.aiChip.className = 'ai-chip on';
  } else {
    elements.aiChip.textContent = 'AI לא מוגדר · דירוג לפי מילות מפתח בלבד';
    elements.aiChip.className = 'ai-chip off';
  }
  renderFindings();
  renderSources();
  renderSourcesFull();
  const newCount = u.findings.filter(finding => finding.status === 'new' && finding.relevance >= 7).length;
  elements.updatesBadge.hidden = newCount === 0;
  elements.updatesBadge.textContent = String(newCount);
  if (!u.findings.length) setFlowStep(1);
  else if (state.view === 'updates' && !state.pendingDraft) setFlowStep(2);
  updateBars();
}

function relevanceChip(relevance) {
  if (relevance >= 7) return '<span class="relevance high">חשוב</span>';
  if (relevance >= 4) return '<span class="relevance mid">אולי רלוונטי</span>';
  return '<span class="relevance low">רלוונטיות נמוכה</span>';
}

function visibleFindings() {
  const u = state.updates;
  const list = u.findings.filter(finding => {
    if (u.filter === 'new') return finding.status === 'new';
    if (u.filter === 'important') return finding.status === 'new' && finding.relevance >= 7;
    return true;
  });
  const rank = status => (status === 'new' ? 0 : status === 'used' ? 1 : 2);
  return list.sort((a, b) => rank(a.status) - rank(b.status) || b.relevance - a.relevance || String(b.foundAt).localeCompare(String(a.foundAt)));
}

function renderFindings() {
  const u = state.updates;
  const list = visibleFindings();
  elements.findingsList.replaceChildren();
  elements.findingsEmpty.hidden = list.length > 0;
  if (!list.length && u.findings.length) {
    elements.findingsEmpty.querySelector('strong').textContent = 'אין ממצאים בסינון הזה';
    elements.findingsEmpty.querySelector('small').textContent = 'נסו "הכול", או הריצו חיפוש חדש';
  } else if (!u.findings.length) {
    elements.findingsEmpty.querySelector('strong').textContent = 'עדיין אין ממצאים';
    elements.findingsEmpty.querySelector('small').textContent = 'לחצו "חיפוש עדכונים חדשים" כדי לסרוק את המקורות';
  }
  const total = u.findings.filter(finding => finding.status === 'new').length;
  elements.findingsCaption.textContent = total
    ? `${total} ממצאים חדשים · סמנו את העדכונים שמהם ייכתב הגיליון`
    : 'סמנו את העדכונים שמהם ייכתב הגיליון';

  for (const finding of list) {
    const card = document.createElement('article');
    card.className = `finding ${finding.status}${u.selected.has(finding.id) ? ' selected' : ''}`;
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = u.selected.has(finding.id);
    check.setAttribute('aria-label', `בחירת העדכון: ${finding.title}`);
    check.addEventListener('change', () => {
      if (check.checked) u.selected.add(finding.id); else u.selected.delete(finding.id);
      card.classList.toggle('selected', check.checked);
      updateBars();
    });
    const body = document.createElement('div');
    const statusBadge = finding.status === 'used' ? '<span class="status-badge">שימש לגיליון</span>'
      : finding.status === 'dismissed' ? '<span class="status-badge">נדחה</span>' : '';
    body.innerHTML = `<div class="finding-meta"><span class="finding-source${finding.via === 'search' ? ' web' : ''}">${finding.via === 'search' ? '🌐 ' : ''}${escapeHtml(finding.sourceName || '')}</span>${relevanceChip(finding.relevance)}${finding.topic ? `<span>${escapeHtml(finding.topic)}</span>` : ''}${finding.date ? `<span>${escapeHtml(prettyDate(finding.date))}</span>` : ''}<span>נמצא ${escapeHtml(relativeTime(finding.foundAt))}</span>${statusBadge}</div>
      <div class="finding-title"><a href="${escapeHtml(finding.link)}" data-external>${escapeHtml(finding.title)}</a></div>
      ${finding.aiSummary || finding.summary ? `<div class="finding-summary">${escapeHtml(finding.aiSummary || finding.summary)}</div>` : ''}`;
    const actions = document.createElement('div');
    actions.className = 'finding-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'mini-button';
    open.textContent = 'פתיחת המקור ↗';
    open.addEventListener('click', () => window.newsletterApp.openExternal(finding.link));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `mini-button${finding.status === 'new' ? ' danger' : ''}`;
    toggle.textContent = finding.status === 'new' ? 'דחייה' : 'החזרה לחדשים';
    toggle.addEventListener('click', async () => {
      try {
        u.findings = await discoveryApi().setFindingStatus([finding.id], finding.status === 'new' ? 'dismissed' : 'new');
        u.selected.delete(finding.id);
        renderUpdates();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    actions.append(open, toggle);
    body.append(actions);
    card.append(check, body);
    elements.findingsList.append(card);
  }
}

elements.findingsList.addEventListener('click', event => {
  const link = event.target.closest('a[data-external]');
  if (!link) return;
  event.preventDefault();
  window.newsletterApp.openExternal(link.getAttribute('href'));
});

document.querySelectorAll('.filter-chips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    state.updates.filter = chip.dataset.filter;
    document.querySelectorAll('.filter-chips .chip').forEach(other => other.classList.toggle('active', other === chip));
    renderFindings();
  });
});

function renderSources() {
  const u = state.updates;
  elements.sourcesList.replaceChildren();
  for (const source of u.sources) {
    const item = document.createElement('div');
    item.className = `source-item${source.enabled ? '' : ' disabled'}`;
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = Boolean(source.enabled);
    check.title = source.enabled ? 'פעיל · לחיצה משהה את המקור' : 'מושהה · לחיצה מפעילה';
    check.addEventListener('change', async () => {
      try {
        u.sources = await discoveryApi().updateSource(source.id, { enabled: check.checked });
        renderSources();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    const text = document.createElement('div');
    text.style.minWidth = '0';
    let info;
    let infoClass = 'source-info';
    if (source.lastResult && source.lastResult.ok === false) {
      info = `לא נענה: ${source.lastResult.error}`;
      infoClass += ' error';
    } else if (source.lastResult && source.lastCheck) {
      info = `נבדק ${relativeTime(source.lastCheck)} · ${source.lastResult.count} פריטים${source.lastResult.firstRun ? ' (סריקה ראשונה)' : ` · ${source.lastResult.newCount} חדשים`}`;
    } else {
      let host = source.url;
      try { host = new URL(source.url).hostname.replace(/^www\./, ''); } catch (error) { /* keep url */ }
      info = `${host}${source.kind === 'rss' ? ' · RSS' : ''} · טרם נבדק`;
    }
    text.innerHTML = `<div class="source-name" title="${escapeHtml(source.url)}">${escapeHtml(source.name)}</div><div class="${infoClass}">${escapeHtml(info)}</div>`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button';
    remove.title = 'הסרת המקור';
    remove.setAttribute('aria-label', `הסרת המקור ${source.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`להסיר את המקור "${source.name}" מהמעקב?`)) return;
      try {
        u.sources = await discoveryApi().removeSource(source.id);
        renderSources();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    item.append(check, text, remove);
    elements.sourcesList.append(item);
  }
}

function bindSourceForm(form, nameInput, urlInput, errorBox, button) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    errorBox.textContent = '';
    button.disabled = true;
    button.textContent = 'בודק את המקור...';
    try {
      const result = await discoveryApi().addSource({ name: nameInput.value, url: urlInput.value });
      state.updates.sources = result.sources;
      nameInput.value = '';
      urlInput.value = '';
      renderSources();
      renderSourcesFull();
      showToast(`המקור נוסף (${result.kind === 'rss' ? 'RSS' : 'דף אינטרנט'}, נקראו ${result.probeCount} פריטים). הוא ייכלל בסריקה הבאה.`);
    } catch (error) {
      errorBox.textContent = cleanError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = '＋ הוספה ובדיקה';
    }
  });
}
bindSourceForm(elements.sourceForm, elements.sourceName, elements.sourceUrl, elements.sourceError, elements.sourceAddButton);
bindSourceForm(elements.sourceFormFull, elements.sourceNameFull, elements.sourceUrlFull, elements.sourceErrorFull, elements.sourceAddFullButton);

/* ---------- sources view (full management) ---------- */

function sourceStatus(source) {
  if (source.lastResult && source.lastResult.ok === false) return { text: `לא נענה: ${source.lastResult.error}`, cls: 'error' };
  if (source.lastResult && source.lastCheck) {
    const base = `נבדק ${relativeTime(source.lastCheck)} · ${source.lastResult.count} פריטים`;
    if (source.lastResult.probe || source.lastResult.firstRun) return { text: base, cls: 'ok' };
    return { text: `${base} · ${source.lastResult.newCount} חדשים`, cls: 'ok' };
  }
  return { text: 'טרם נבדק', cls: '' };
}

function renderSourcesFull() {
  const u = state.updates;
  elements.sourcesTable.replaceChildren();
  const active = u.sources.filter(source => source.enabled).length;
  elements.sourcesCount.textContent = `${u.sources.length} מקורות · ${active} פעילים`;
  for (const source of u.sources) {
    const row = document.createElement('div');
    row.className = `source-row${source.enabled ? '' : ' disabled'}`;

    const toggle = document.createElement('label');
    toggle.className = 'switch-row';
    toggle.title = source.enabled ? 'פעיל · לחיצה משהה' : 'מושהה · לחיצה מפעילה';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = Boolean(source.enabled);
    check.setAttribute('aria-label', `הפעלת המקור ${source.name}`);
    check.addEventListener('change', async () => {
      try {
        u.sources = await discoveryApi().updateSource(source.id, { enabled: check.checked });
        renderUpdates();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    const knob = document.createElement('span');
    knob.className = 'switch';
    toggle.append(check, knob);

    const main = document.createElement('div');
    main.className = 'source-row-main';
    main.innerHTML = `<div class="source-row-name"><span>${escapeHtml(source.name)}</span><span class="kind-chip">${source.kind === 'rss' ? 'RSS' : 'דף אינטרנט'}</span></div><span class="source-row-url"><a href="${escapeHtml(source.url)}" data-external>${escapeHtml(source.url)}</a></span>`;

    const status = sourceStatus(source);
    const statusBox = document.createElement('div');
    statusBox.className = `source-row-status ${status.cls}`;
    statusBox.textContent = status.text;

    const actions = document.createElement('div');
    actions.className = 'source-row-actions';
    const test = document.createElement('button');
    test.type = 'button';
    test.className = 'mini-button';
    test.textContent = 'בדיקה';
    test.addEventListener('click', async () => {
      test.disabled = true;
      test.textContent = 'בודק...';
      try {
        const result = await discoveryApi().testSource(source.id);
        u.sources = result.sources;
        renderUpdates();
        if (result.ok) showToast(`${source.name}: נקראו ${result.count} פריטים${result.sample.length ? `. לדוגמה: ${result.sample[0]}` : ''}`);
        else showToast(`${source.name}: ${result.error}`, true);
      } catch (error) {
        showToast(error.message, true);
      }
    });
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'mini-button';
    rename.textContent = 'שינוי שם';
    rename.addEventListener('click', async () => {
      const name = window.prompt('שם חדש למקור:', source.name);
      if (!name || !name.trim() || name.trim() === source.name) return;
      try {
        u.sources = await discoveryApi().updateSource(source.id, { name: name.trim() });
        renderUpdates();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mini-button danger';
    remove.textContent = 'הסרה';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`להסיר את המקור "${source.name}" מהמעקב?`)) return;
      try {
        u.sources = await discoveryApi().removeSource(source.id);
        renderUpdates();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    actions.append(test, rename, remove);
    row.append(toggle, main, statusBox, actions);
    elements.sourcesTable.append(row);
  }
}

elements.sourcesTable.addEventListener('click', event => {
  const link = event.target.closest('a[data-external]');
  if (!link) return;
  event.preventDefault();
  window.newsletterApp.openExternal(link.getAttribute('href'));
});
elements.manageSourcesButton.addEventListener('click', () => setView('sources'));
elements.sourcesScanButton.addEventListener('click', () => { setView('updates'); runScan(); });
elements.sourcesResetButton.addEventListener('click', async () => {
  if (!window.confirm('לשחזר את רשימת ברירת המחדל? מקורות שהוספתם בעצמכם יישארו, והמקורות המובנים יחזרו למצבם ההתחלתי.')) return;
  try {
    state.updates.sources = await discoveryApi().resetSources();
    renderUpdates();
    showToast('רשימת המקורות שוחזרה.');
  } catch (error) {
    showToast(error.message, true);
  }
});

async function runScan() {
  const u = state.updates;
  if (u.scanning) return;
  u.scanning = true;
  elements.scanButton.disabled = true;
  elements.scanButton.textContent = 'סורק...';
  elements.scanStatus.hidden = false;
  elements.scanStatusText.textContent = 'מתחילים סריקה...';
  setFlowStep(1);
  const unsubscribe = discoveryApi().onProgress(event => {
    if (event.stage === 'source') elements.scanStatusText.textContent = `בודק את ${event.name} (${event.index} מתוך ${event.total})`;
    else if (event.stage === 'search') elements.scanStatusText.textContent = 'מחפש ברשת עם AI (יכול לקחת דקה-שתיים)...';
    else if (event.stage === 'score') elements.scanStatusText.textContent = `מדרג ${event.count} פריטים חדשים לפי חשיבות עם AI...`;
  });
  try {
    const data = await discoveryApi().run({});
    applyUpdatesState(data);
    const summary = data.result.summary;
    const bits = [];
    bits.push(summary.newCount ? `נמצאו ${summary.newCount} פריטים חדשים, מתוכם ${summary.importantCount} חשובים` : 'לא נמצאו פריטים חדשים מאז הסריקה הקודמת');
    if (summary.sourcesFailed) bits.push(`${summary.sourcesFailed} מקורות לא נענו`);
    showToast(`${bits.join(' · ')}.`, false);
    if (summary.scoringError) showToast(`הדירוג עם AI נכשל, הפריטים דורגו לפי מילות מפתח: ${summary.scoringError}`, true);
    else if (summary.searchError) showToast(`החיפוש ברשת עם AI נכשל: ${summary.searchError}`, true);
    if (summary.newCount) {
      state.updates.filter = 'new';
      document.querySelectorAll('.filter-chips .chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'new'));
      renderFindings();
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    unsubscribe();
    u.scanning = false;
    elements.scanButton.disabled = false;
    elements.scanButton.textContent = '🔍 חיפוש עדכונים חדשים';
    elements.scanStatus.hidden = true;
  }
}
elements.scanButton.addEventListener('click', runScan);

elements.monitorToggle.addEventListener('change', async () => {
  try {
    state.updates.settings = await window.newsletterApp.settings.set({ monitor: { enabled: elements.monitorToggle.checked } });
    renderUpdates();
    showToast(elements.monitorToggle.checked
      ? 'המעקב האוטומטי הופעל. האפליקציה תבדוק את המקורות ברקע ותתריע בהודעת Windows על חומר חשוב.'
      : 'המעקב האוטומטי כבוי.');
  } catch (error) {
    showToast(error.message, true);
  }
});

/* ---------- drafting ---------- */

function nextMonday() {
  const date = new Date();
  const ahead = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + ahead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function styleSampleText() {
  const first = state.issues[0];
  const html = first ? (state.loadedFiles?.get(first.date) || '') : '';
  if (!html) return '';
  const body = html.replace(/[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*/i, '');
  return body
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|td|tr|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
    .slice(0, 6000);
}

function setDraftStep(id, status, detail = '') {
  const element = $(id);
  element.className = status;
  const small = element.querySelector('small');
  if (small) small.textContent = detail;
}

async function generateDraft() {
  const u = state.updates;
  const ids = [...u.selected];
  const instructions = elements.draftInstructions.value.trim();
  if (!ids.length && !instructions) {
    showToast('סמנו לפחות עדכון אחד, או כתבו נושא בשדה ההנחיות.', true);
    return;
  }
  if (!u.ai || !u.ai.available) {
    showToast('לניסוח עם AI צריך מפתח. פתחו את "הגדרות מעקב ו-AI" והזינו מפתח Anthropic.', true);
    openSettings();
    return;
  }
  state.pendingDraft = null;
  elements.draftTitle.textContent = 'כותבים את הגיליון...';
  elements.draftResult.hidden = true;
  elements.draftResult.innerHTML = '';
  elements.draftCloseButton.hidden = true;
  elements.draftOpenButton.hidden = true;
  setDraftStep('draftStepRead', ids.length ? 'active' : 'done', '');
  setDraftStep('draftStepWrite', ids.length ? '' : 'active');
  setDraftStep('draftStepRender', '');
  elements.draftBackdrop.hidden = false;
  elements.draftButton.disabled = true;
  setFlowStep(2);
  const unsubscribe = window.newsletterApp.draft.onProgress(event => {
    if (event.stage === 'read') setDraftStep('draftStepRead', 'active', `${event.index} מתוך ${event.total}: ${event.title}`);
    if (event.stage === 'write') { setDraftStep('draftStepRead', 'done', ''); setDraftStep('draftStepWrite', 'active'); }
  });
  try {
    const result = await window.newsletterApp.draft.generate({
      findingIds: ids,
      instructions,
      issueNumber: Math.max(0, ...state.issues.map(issue => issue.n)) + 1,
      date: nextMonday(),
      styleSample: styleSampleText()
    });
    setDraftStep('draftStepRead', 'done', '');
    setDraftStep('draftStepWrite', 'done');
    setDraftStep('draftStepRender', result.problems.length ? 'failed' : 'done');
    state.pendingDraft = result;
    elements.draftTitle.textContent = 'הטיוטה מוכנה';
    const notes = (result.draft.editorNotes || []).map(note => `<li>${escapeHtml(note)}</li>`).join('');
    const problems = (result.problems || []).map(problem => `<li class="warn">${escapeHtml(problem)}</li>`).join('');
    const unread = (result.draft.readProblems || []).map(title => `<li>לא ניתן היה לקרוא: ${escapeHtml(title)}</li>`).join('');
    elements.draftResult.innerHTML = `<h4>${escapeHtml(result.draft.title)}</h4><div>${escapeHtml(result.draft.sub)}</div>
      <div style="margin-top:8px"><strong>שורת נושא מוצעת למייל:</strong> ${escapeHtml(result.draft.subject)}</div>
      ${problems ? `<div style="margin-top:8px"><strong>הבדיקות הטכניות מצאו:</strong><ul>${problems}</ul></div>` : ''}
      ${notes ? `<div style="margin-top:8px"><strong>לאימות לפני הפרסום:</strong><ul>${notes}</ul></div>` : ''}
      ${unread ? `<ul>${unread}</ul>` : ''}`;
    elements.draftResult.hidden = false;
    elements.draftCloseButton.hidden = false;
    elements.draftOpenButton.hidden = false;
    elements.draftOpenButton.textContent = state.canWrite ? 'פתיחת הטיוטה לבדיקה ולפרסום' : 'שמירת הטיוטה כקובץ HTML';
    elements.draftInstructions.value = '';
    u.selected.clear();
    await loadUpdates();
  } catch (error) {
    ['draftStepRead', 'draftStepWrite', 'draftStepRender'].forEach(id => { if ($(id).className === 'active') setDraftStep(id, 'failed'); });
    elements.draftTitle.textContent = 'הניסוח לא הצליח';
    elements.draftResult.innerHTML = `<span class="warn">${escapeHtml(cleanError(error.message))}</span>`;
    elements.draftResult.hidden = false;
    elements.draftCloseButton.hidden = false;
  } finally {
    unsubscribe();
    elements.draftButton.disabled = false;
  }
}
elements.draftButton.addEventListener('click', generateDraft);
elements.draftCloseButton.addEventListener('click', () => { elements.draftBackdrop.hidden = true; });

elements.draftOpenButton.addEventListener('click', async () => {
  const draft = state.pendingDraft;
  if (!draft) return;
  elements.draftBackdrop.hidden = true;
  if (!state.canWrite) {
    try {
      const saved = await window.newsletterApp.saveFile({ name: `${draft.date}.html`, content: draft.html });
      if (saved) showToast(`הטיוטה נשמרה: ${saved}. כדי לפרסם לאתר, התחברו עם הרשאת ניהול והוסיפו אותה כגיליון.`);
    } catch (error) {
      showToast(error.message, true);
    }
    return;
  }
  setView('issues');
  openEditor(null, {
    date: draft.date,
    title: draft.draft.title,
    sub: draft.draft.sub,
    html: draft.html,
    aiDraft: { n: draft.n, notes: draft.draft.editorNotes || [], problems: draft.problems || [] }
  });
  setFlowStep(3);
});

/* ---------- settings ---------- */

async function openSettings() {
  const u = state.updates;
  try {
    u.settings = await window.newsletterApp.settings.get();
    u.ai = await window.newsletterApp.ai.status();
  } catch (error) {
    showToast(error.message, true);
    return;
  }
  $('settingMonitor').checked = Boolean(u.settings.monitor.enabled);
  $('settingInterval').value = String(u.settings.monitor.intervalHours);
  $('settingNotify').checked = Boolean(u.settings.monitor.notify);
  $('settingAutoWebSearch').checked = Boolean(u.settings.monitor.webSearch);
  $('settingManualWebSearch').checked = Boolean(u.settings.manualWebSearch);
  $('settingStartup').checked = Boolean(u.settings.startWithWindows);
  $('settingTray').checked = Boolean(u.settings.keepInTray);
  elements.aiKeyInput.value = '';
  elements.aiKeyStatus.textContent = '';
  elements.aiKeyStatus.style.color = '';
  elements.aiKeyInput.placeholder = u.ai.available ? (u.ai.source === 'local' ? 'מפתח שמור במחשב הזה · הזינו מפתח חדש להחלפה' : 'מפתח נטען מהגדרות האתר · אפשר להזין מפתח משלכם') : 'sk-ant-...';
  elements.settingsError.textContent = '';
  elements.settingsBackdrop.hidden = false;
}
elements.settingsButton.addEventListener('click', openSettings);
$('closeSettingsButton').addEventListener('click', () => { elements.settingsBackdrop.hidden = true; renderUpdates(); });
$('settingsDoneButton').addEventListener('click', () => { elements.settingsBackdrop.hidden = true; renderUpdates(); });
elements.settingsBackdrop.addEventListener('click', event => {
  if (event.target === elements.settingsBackdrop) { elements.settingsBackdrop.hidden = true; renderUpdates(); }
});

async function saveSetting(patch) {
  try {
    state.updates.settings = await window.newsletterApp.settings.set(patch);
    elements.settingsError.textContent = '';
  } catch (error) {
    elements.settingsError.textContent = cleanError(error.message);
  }
}
$('settingMonitor').addEventListener('change', event => saveSetting({ monitor: { enabled: event.target.checked } }));
$('settingInterval').addEventListener('change', event => saveSetting({ monitor: { intervalHours: Number(event.target.value) } }));
$('settingNotify').addEventListener('change', event => saveSetting({ monitor: { notify: event.target.checked } }));
$('settingAutoWebSearch').addEventListener('change', event => saveSetting({ monitor: { webSearch: event.target.checked } }));
$('settingManualWebSearch').addEventListener('change', event => saveSetting({ manualWebSearch: event.target.checked }));
$('settingStartup').addEventListener('change', event => saveSetting({ startWithWindows: event.target.checked }));
$('settingTray').addEventListener('change', event => saveSetting({ keepInTray: event.target.checked }));

$('aiKeySaveButton').addEventListener('click', async () => {
  const key = elements.aiKeyInput.value.trim();
  try {
    state.updates.ai = await window.newsletterApp.ai.setKey(key);
    elements.aiKeyInput.value = '';
    elements.aiKeyStatus.style.color = '#2d7a4f';
    elements.aiKeyStatus.textContent = key ? 'המפתח נשמר מוצפן במחשב הזה.' : 'המפתח המקומי נמחק.';
    renderUpdates();
  } catch (error) {
    elements.aiKeyStatus.style.color = '';
    elements.aiKeyStatus.textContent = cleanError(error.message);
  }
});
$('aiKeyTestButton').addEventListener('click', async () => {
  elements.aiKeyStatus.style.color = '';
  elements.aiKeyStatus.textContent = 'בודק מול שירות ה-AI...';
  try {
    const result = await window.newsletterApp.ai.testKey(elements.aiKeyInput.value.trim() || null);
    elements.aiKeyStatus.style.color = '#2d7a4f';
    elements.aiKeyStatus.textContent = `המפתח תקין. המודל: ${result.model}.`;
  } catch (error) {
    elements.aiKeyStatus.textContent = cleanError(error.message);
  }
});

/* ---------- startup ---------- */

async function startup() {
  if (!window.newsletterApp) {
    elements.connectButton.disabled = true;
    elements.addButton.disabled = true;
    showToast('להפעלה מלאה, פתחו את האפליקציה באמצעות npm start.', true);
    return;
  }
  const features = window.newsletterApp.features || {};
  if (features.discovery) {
    elements.navUpdates.hidden = false;
    elements.navSources.hidden = false;
    window.newsletterApp.onNavigate(view => setView(view));
    window.newsletterApp.onRunDiscovery(() => { setView('updates'); runScan(); });
    window.newsletterApp.discovery.onFinished(event => {
      if (event.mode === 'auto') loadUpdates();
    });
    window.newsletterApp.settings.onChanged(settings => { state.updates.settings = settings; renderUpdates(); });
    loadUpdates();
  }
  try {
    const session = await window.newsletterApp.getSession();
    if (session) {
      const data = await window.newsletterApp.load();
      await loadData(data);
      if (session.email && !session.canWrite) {
        showToast('למשתמש הזה אין הרשאת ניהול ניוזלטרים. ניתן לצפות בלבד.', true);
      }
    }
  } catch (error) {
    showToast(error.message, true);
  }
}

startup();
