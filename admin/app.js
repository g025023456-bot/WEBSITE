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

  window.newsletterApp = {
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
  deletedDates: new Set(),
  dirty: false,
  toastTimer: null,
  query: '',
  textCache: new Map()
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
  toast: $('toast'),
  searchInput: $('searchInput'),
  searchCount: $('searchCount'),
  noResults: $('noResults'),
  scheduledPanel: $('scheduledPanel'),
  scheduledList: $('scheduledList'),
  scheduleRow: $('scheduleRow'),
  scheduleCheck: $('scheduleCheck'),
  addButton: $('addButton'),
  editButton: $('editButton')
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function prettyDate(date) {
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : date;
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
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = cleanError(message);
  elements.toast.classList.toggle('error', isError);
  elements.toast.classList.add('visible');
  state.toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 4200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function getPreviewHtml(html) {
  const baseTag = '<base href="https://ho-me.org.il/newsletter/">';
  if (/<base\b/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
}

function renderPreview(issue) {
  let content = state.pendingFiles.get(issue.date);
  if (!content && issue.sourceDate) {
    content = state.loadedFiles?.get(issue.sourceDate);
  }
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
  const html = state.pendingFiles.get(issue.date)
    || (issue.sourceDate && state.loadedFiles?.get(issue.sourceDate)) || '';
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
  elements.connectionLabel.textContent = state.connected
    ? (state.email ? `${state.email}${state.canWrite ? '' : ' · צפייה בלבד'}` : 'צפייה בלבד, ללא התחברות')
    : 'לא מחובר';
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
    main.innerHTML = `<div class="issue-meta"><span>גיליון ${escapeHtml(issue.n)}</span><span>·</span><span>${escapeHtml(prettyDate(issue.date))}</span>${issue === firstKept ? '<span class="latest-badge">מוצג ראשון</span>' : ''}${isDeleted ? '<span class="deleted-badge">יימחק בשמירה</span>' : ''}</div><div class="issue-title">${escapeHtml(issue.title)}</div><div class="issue-sub">${escapeHtml(issue.sub || 'ללא תיאור')}</div>`;
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
      }
    }
    item.append(controls, main, actions);
    elements.issueList.append(item);
  });

  elements.editButton.disabled = !state.canWrite || !issues.some(issue => issue.date === state.selectedDate);
  if (issues.length && !issues.some(issue => issue.date === state.selectedDate)) {
    selectIssue(issues[0]);
  }
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
  state.selectedDate = issue.date;
  renderPreview(issue);
  document.querySelectorAll('.issue-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.date === issue.date);
  });
  elements.editButton.disabled = !state.canWrite;
}

function moveIssue(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= state.issues.length) return;
  [state.issues[index], state.issues[target]] = [state.issues[target], state.issues[index]];
  setDirty(true);
  render();
}

function toggleDelete(issue) {
  if (state.deletedDates.has(issue.sourceDate)) {
    state.deletedDates.delete(issue.sourceDate);
  } else {
    const keptCount = state.issues.filter(item => item.sourceDate && !state.deletedDates.has(item.sourceDate)).length
      + state.issues.filter(item => !item.sourceDate).length;
    if (keptCount <= 1) {
      showToast('חייב להישאר לפחות גיליון אחד באתר.', true);
      return;
    }
    if (!window.confirm(`לסמן למחיקה את "${issue.title}" (${prettyDate(issue.date)})? המחיקה תתבצע באתר בלחיצה על "שמירת שינויים", והיא מסירה את הגיליון והקובץ שלו לצמיתות.`)) return;
    state.deletedDates.add(issue.sourceDate);
  }
  setDirty(true);
  render();
}

/* ---------- editor ---------- */

function openEditor(issue = null, imported = null) {
  state.importedHtml = imported?.html || null;
  state.editorIsNew = !issue;
  state.editingDate = issue?.date || null;
  elements.editorTitle.textContent = issue ? 'עריכת פרטי גיליון' : 'הוספת גיליון חדש';
  elements.editorError.textContent = '';
  $('issueDate').value = issue?.date || imported?.date || '';
  $('issueTitle').value = issue?.title || imported?.title || '';
  $('issueSub').value = issue?.sub || imported?.sub || '';
  elements.scheduleRow.hidden = !state.editorIsNew;
  elements.scheduleCheck.checked = state.editorIsNew && Boolean(imported?.date) && imported.date > todayIso();
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
    const html = state.importedHtml;
    if (typeof html !== 'string') {
      elements.editorError.textContent = 'יש לבחור קובץ HTML לפני הוספת גיליון.';
      return;
    }
    if (elements.scheduleCheck.checked) {
      window.newsletterApp.scheduleAdd({ date, title, sub, html })
        .then(entries => {
          state.scheduled = entries;
          state.importedHtml = null;
          closeEditor();
          renderScheduled();
          showToast(`הגיליון נשמר כגיליון עתידי ל-${prettyDate(date)}. ביום היעד תוצג התראה לפרסום.`);
        })
        .catch(error => { elements.editorError.textContent = cleanError(error.message); });
      return;
    }
    const nextNumber = Math.max(0, ...state.issues.map(issue => issue.n)) + 1;
    state.issues.unshift({ n: nextNumber, date, title, sub, sourceDate: null });
    state.pendingFiles.set(date, html);
    state.importedHtml = null;
    state.selectedDate = date;
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

elements.saveButton.addEventListener('click', async () => {
  if (!state.dirty || !state.canWrite) return;
  const deletions = state.issues.filter(issue => state.deletedDates.has(issue.sourceDate));
  if (deletions.length) {
    const names = deletions.map(issue => `· גיליון ${issue.n} (${prettyDate(issue.date)}) ${issue.title}`).join('\n');
    if (!window.confirm(`השמירה תמחק לצמיתות מהאתר את הגיליונות הבאים:\n${names}\n\nלהמשיך?`)) return;
  }
  elements.saveButton.disabled = true;
  elements.saveState.classList.add('saving');
  elements.saveState.innerHTML = '<span class="state-dot"></span> מפרסם לאתר...';
  try {
    const kept = state.issues.filter(issue => !state.deletedDates.has(issue.sourceDate));
    const newFiles = {};
    for (const issue of kept) {
      if (!issue.sourceDate) {
        const html = state.pendingFiles.get(issue.date);
        if (html) newFiles[issue.date] = html;
      }
    }
    const result = await window.newsletterApp.save({
      headSha: state.headSha,
      issues: kept.map(({ n, date, title, sub, sourceDate }) => ({ n, date, title, sub, sourceDate })),
      newFiles
    });
    await loadData(result);
    showToast('השינויים פורסמו. האתר מתעדכן תוך דקה-שתיים.');
  } catch (error) {
    setDirty(true);
    showToast(error.message, true);
  }
});

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

/* ---------- startup ---------- */

async function startup() {
  if (!window.newsletterApp) {
    elements.connectButton.disabled = true;
    elements.addButton.disabled = true;
    showToast('להפעלה מלאה, פתחו את האפליקציה באמצעות npm start.', true);
    return;
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
