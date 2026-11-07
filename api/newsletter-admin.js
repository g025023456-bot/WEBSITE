// שרת ניהול הניוזלטרים: רץ כפונקציית Vercel בתוך פרויקט האתר.
// הזדהות: Basic auth מול רשימת המשתמשים בהגדרות הפרויקט ב-Vercel.
// משתני סביבה: NEWSLETTER_USERS ("email:password,email2:password2"),
// GITHUB_TOKEN (מפתח עם Contents: Read and write), REPO (ברירת מחדל למטה).
const crypto = require('node:crypto');

const API = 'https://api.github.com';
const REPO = process.env.REPO || 'g025023456-bot/WEBSITE';
const DATA_PATH = 'newsletter/newsletter-data.js';
const LATEST_PATH = 'newsletter/latest.html';
const SCHEDULE_DIR = 'newsletter/scheduled';
const SCHEDULE_PATH = `${SCHEDULE_DIR}/schedule.json`;
const VERCELIGNORE_PATH = '.vercelignore';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- auth ---------- */

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authenticate(req) {
  const users = (process.env.NEWSLETTER_USERS || '')
    .split(',').map(pair => pair.trim()).filter(Boolean);
  if (!users.length) {
    throw new Error('המערכת לא הוגדרה עד הסוף: רשימת המשתמשים (NEWSLETTER_USERS) חסרה בהגדרות Vercel.');
  }
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) throw unauthorized();
  let email = '', password = '';
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    email = decoded.slice(0, separator).trim().toLowerCase();
    password = decoded.slice(separator + 1);
  } catch (error) {
    throw unauthorized();
  }
  for (const pair of users) {
    const separator = pair.indexOf(':');
    if (separator < 1) continue;
    const userEmail = pair.slice(0, separator).trim().toLowerCase();
    const userPassword = pair.slice(separator + 1);
    if (userEmail === email && safeEqual(userPassword, password)) return email;
  }
  throw unauthorized();
}

function unauthorized() {
  const error = new Error('אימייל או סיסמה שגויים.');
  error.status = 401;
  return error;
}

/* ---------- GitHub client ---------- */

function ghHeaders(json) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('המערכת לא הוגדרה עד הסוף: חסר מפתח GitHub (GITHUB_TOKEN) בהגדרות Vercel.');
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ho-me-newsletter-admin',
    Authorization: `Bearer ${token}`
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function gh(method, path, body, allow404 = false) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: ghHeaders(Boolean(body)),
    body: body ? JSON.stringify(body) : undefined
  });
  if (allow404 && response.status === 404) return null;
  if (response.status === 401) throw new Error('מפתח ה-GitHub בהגדרות Vercel אינו תקין או שפג תוקפו.');
  if (response.status === 409 || response.status === 422) {
    const text = await response.text().catch(() => '');
    if (/fast.forward|reference|expected/i.test(text)) {
      throw new Error('האתר השתנה בינתיים ממקום אחר. טענו מחדש ונסו שוב.');
    }
    throw new Error(`GitHub דחה את הפעולה (${response.status}).`);
  }
  if (!response.ok) throw new Error(`שגיאת GitHub ${response.status}.`);
  return response.json();
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function head() {
  const ref = await gh('GET', `/repos/${REPO}/git/ref/${encodeURIComponent('heads/main')}`);
  return ref.object.sha;
}

async function readFile(path, ref) {
  const payload = await gh('GET', `/repos/${REPO}/contents/${encodePath(path)}?ref=${ref}`, undefined, true);
  return payload ? Buffer.from(payload.content, 'base64').toString('utf8') : null;
}

async function commit(baseSha, message, changes) {
  const baseCommit = await gh('GET', `/repos/${REPO}/git/commits/${baseSha}`);
  const tree = [];
  for (const change of changes) {
    if (change.content === null) {
      tree.push({ path: change.path, mode: '100644', sha: null });
    } else {
      const blob = await gh('POST', `/repos/${REPO}/git/blobs`, {
        content: Buffer.from(change.content, 'utf8').toString('base64'),
        encoding: 'base64'
      });
      tree.push({ path: change.path, mode: '100644', sha: blob.sha });
    }
  }
  const newTree = await gh('POST', `/repos/${REPO}/git/trees`, { base_tree: baseCommit.tree.sha, tree });
  const newCommit = await gh('POST', `/repos/${REPO}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [baseSha]
  });
  await gh('PATCH', `/repos/${REPO}/git/refs/${encodeURIComponent('heads/main')}`, {
    sha: newCommit.sha,
    force: false
  });
  return newCommit.sha;
}

/* ---------- newsletter-data.js parsing ---------- */

function decodeString(value) {
  return value.replace(/\\([\\'nrt])/g, (_, c) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c));
}

function encodeString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`;
}

function parseIssues(source) {
  const marker = 'window.NEWSLETTER_ISSUES = [';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error('לא נמצא מערך הניוזלטרים בקובץ newsletter-data.js.');
  const arrayStart = markerIndex + marker.length;
  const arrayEnd = source.indexOf('];', arrayStart);
  if (arrayEnd < 0) throw new Error('מבנה newsletter-data.js אינו תקין.');
  const body = source.slice(arrayStart, arrayEnd);
  const rowPattern = /^\s*\{\s*n:\s*(\d+)\s*,\s*date:\s*'((?:\\.|[^'\\])*)'\s*,\s*title:\s*'((?:\\.|[^'\\])*)'\s*,\s*sub:\s*'((?:\\.|[^'\\])*)'\s*\}\s*,?\s*$/gm;
  const issues = [];
  let match;
  while ((match = rowPattern.exec(body)) !== null) {
    issues.push({
      n: Number(match[1]),
      date: decodeString(match[2]),
      title: decodeString(match[3]),
      sub: decodeString(match[4])
    });
  }
  if (body.trim() && issues.length === 0) {
    throw new Error('לא ניתן לקרוא את מבנה הגיליונות בקובץ newsletter-data.js.');
  }
  return { issues, arrayStart, arrayEnd };
}

function serializeManifest(manifest, issues) {
  const { arrayStart, arrayEnd } = parseIssues(manifest);
  const rows = issues.map(issue =>
    `\n  { n:${issue.n}, date:${encodeString(issue.date)}, title:${encodeString(issue.title)}, sub:${encodeString(issue.sub)} },`
  ).join('');
  return `${manifest.slice(0, arrayStart)}${rows}\n${manifest.slice(arrayEnd)}`;
}

function validDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function issuePath(date) {
  if (!validDate(date)) throw new Error(`התאריך "${date}" אינו תקין.`);
  return `newsletter/${date}.html`;
}

function prepareSiteHtml(html) {
  if (!/<head(?:\s|>)/i.test(html) || !/<\/head>/i.test(html)) {
    throw new Error('קובץ ה-HTML חייב לכלול תגי <head> ו-</head>.');
  }
  let output = html;
  if (!/analytics\.js|googletagmanager/i.test(output)) {
    output = output.replace(/<\/head>/i, '  <script src="../analytics.js" defer></script>\n</head>');
  }
  if (!/a11y-widget\.js/i.test(output)) {
    output = output.replace(/<\/head>/i, '  <script src="../a11y-widget.js" defer></script>\n</head>');
  }
  return output;
}

async function readSchedule(ref) {
  const raw = await readFile(SCHEDULE_PATH, ref);
  if (raw === null) return [];
  let entries;
  try {
    entries = JSON.parse(raw);
  } catch (error) {
    throw new Error('קובץ התזמונים (schedule.json) פגום.');
  }
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => validDate(entry.date) && typeof entry.title === 'string');
}

async function ensureVercelIgnoreChange(ref) {
  const raw = await readFile(VERCELIGNORE_PATH, ref);
  if (raw !== null && raw.split(/\r?\n/).some(line => line.trim() === SCHEDULE_DIR)) return null;
  const content = raw === null ? `${SCHEDULE_DIR}\n` : `${raw.replace(/\n*$/, '\n')}${SCHEDULE_DIR}\n`;
  return { path: VERCELIGNORE_PATH, content };
}

/* ---------- actions ---------- */

async function actionLoad() {
  const headSha = await head();
  const manifest = await readFile(DATA_PATH, headSha);
  if (manifest === null) throw new Error('לא נמצא newsletter/newsletter-data.js במאגר.');
  const { issues } = parseIssues(manifest);
  const scheduled = await readSchedule(headSha);
  return { ok: true, issues, scheduled, headSha };
}

async function actionReadIssue(payload) {
  const headSha = await head();
  const path = payload.scheduled ? `${SCHEDULE_DIR}/${payload.date}.html` : issuePath(payload.date);
  const html = await readFile(path, headSha);
  if (html === null) throw new Error(`הקובץ של ${payload.date} לא נמצא במאגר.`);
  return { ok: true, html };
}

async function actionSave(payload, userEmail) {
  if (!Array.isArray(payload.issues) || payload.issues.length === 0) {
    throw new Error('נדרש לפחות גיליון אחד ברשימה.');
  }
  const headSha = await head();
  if (headSha !== payload.headSha) {
    throw new Error('האתר השתנה בינתיים ממקום אחר. טענו מחדש לפני השמירה.');
  }
  const manifest = await readFile(DATA_PATH, headSha);
  if (manifest === null) throw new Error('לא נמצא newsletter-data.js במאגר.');
  const current = parseIssues(manifest).issues;
  const currentByDate = new Map(current.map(issue => [issue.date, issue]));

  const seenDates = new Set();
  const seenSources = new Set();
  const changes = [];
  const summary = [];
  const normalized = [];
  let nextNumber = current.reduce((maximum, issue) => Math.max(maximum, issue.n), 0) + 1;

  for (const draft of payload.issues) {
    if (!validDate(draft.date)) throw new Error(`התאריך "${draft.date}" אינו תקין.`);
    if (seenDates.has(draft.date)) throw new Error(`יש יותר מגיליון אחד בתאריך ${draft.date}.`);
    if (typeof draft.title !== 'string' || !draft.title.trim()) throw new Error('לכל גיליון חייבת להיות כותרת.');
    if (typeof draft.sub !== 'string') throw new Error('תיאור הגיליון אינו תקין.');
    seenDates.add(draft.date);

    let html;
    if (draft.sourceDate) {
      if (seenSources.has(draft.sourceDate)) throw new Error('אותו גיליון מופיע ברשימה יותר מפעם אחת.');
      seenSources.add(draft.sourceDate);
      if (!currentByDate.has(draft.sourceDate)) throw new Error('גיליון קיים השתנה במאגר. טענו מחדש.');
      html = await readFile(issuePath(draft.sourceDate), headSha);
      if (html === null) throw new Error(`הקובץ ${draft.sourceDate}.html חסר במאגר.`);
      const editedHtml = payload.editedFiles && payload.editedFiles[draft.sourceDate];
      if (typeof editedHtml === 'string') {
        if (!/<html(?:\s|>)/i.test(editedHtml)) throw new Error(`הטקסט הערוך של ${draft.sourceDate} אינו מסמך HTML תקין.`);
        html = prepareSiteHtml(editedHtml);
        if (draft.sourceDate === draft.date) changes.push({ path: issuePath(draft.date), content: html });
        summary.push(`עריכת טקסט בגיליון ${currentByDate.get(draft.sourceDate).n}`);
      }
      if (draft.sourceDate !== draft.date) {
        if (currentByDate.has(draft.date) || await readFile(issuePath(draft.date), headSha) !== null) {
          throw new Error(`כבר קיים קובץ בשם ${draft.date}.html. לא בוצעו שינויים.`);
        }
        changes.push({ path: issuePath(draft.date), content: html });
        changes.push({ path: issuePath(draft.sourceDate), content: null });
        summary.push(`שינוי תאריך ${draft.sourceDate} ← ${draft.date}`);
      }
    } else {
      const importedHtml = payload.newFiles && payload.newFiles[draft.date];
      if (typeof importedHtml !== 'string' || !/<html(?:\s|>)/i.test(importedHtml)) {
        throw new Error(`קובץ ה-HTML של הגיליון ${draft.date} חסר או אינו תקין.`);
      }
      if (currentByDate.has(draft.date) || await readFile(issuePath(draft.date), headSha) !== null) {
        throw new Error(`כבר קיים קובץ בשם ${draft.date}.html. לא בוצעו שינויים.`);
      }
      html = prepareSiteHtml(importedHtml);
      changes.push({ path: issuePath(draft.date), content: html });
      summary.push(`גיליון חדש ${draft.date}`);
    }

    normalized.push({
      n: draft.sourceDate ? currentByDate.get(draft.sourceDate).n : nextNumber++,
      date: draft.date,
      title: draft.title.trim(),
      sub: draft.sub.trim(),
      html
    });
  }

  for (const existing of current) {
    if (!seenSources.has(existing.date)) {
      changes.push({ path: issuePath(existing.date), content: null });
      summary.push(`מחיקת גיליון ${existing.n} (${existing.date})`);
    }
  }

  changes.push({ path: DATA_PATH, content: serializeManifest(manifest, normalized) });
  changes.push({ path: LATEST_PATH, content: normalized[0].html });
  if (!summary.length) summary.push('עדכון סדר ופרטי גיליונות');

  await commit(headSha, `ניוזלטר: ${summary.join(' · ')} (${userEmail})`, changes);
  return { ok: true };
}

async function actionScheduleAdd(entry, userEmail) {
  if (!validDate(entry.date)) throw new Error(`התאריך "${entry.date}" אינו תקין.`);
  if (typeof entry.title !== 'string' || !entry.title.trim()) throw new Error('לגיליון עתידי חייבת להיות כותרת.');
  if (typeof entry.html !== 'string' || !/<html(?:\s|>)/i.test(entry.html)) throw new Error('קובץ ה-HTML של הגיליון חסר או אינו תקין.');

  const headSha = await head();
  if (await readFile(issuePath(entry.date), headSha) !== null) {
    throw new Error(`כבר קיים גיליון מפורסם בתאריך ${entry.date}.`);
  }
  const entries = await readSchedule(headSha);
  if (entries.some(existing => existing.date === entry.date)) {
    throw new Error(`כבר קיים גיליון מתוזמן לתאריך ${entry.date}.`);
  }
  entries.push({ date: entry.date, title: entry.title.trim(), sub: String(entry.sub || '').trim() });
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const changes = [
    { path: `${SCHEDULE_DIR}/${entry.date}.html`, content: prepareSiteHtml(entry.html) },
    { path: SCHEDULE_PATH, content: JSON.stringify(entries, null, 2) }
  ];
  const ignoreChange = await ensureVercelIgnoreChange(headSha);
  if (ignoreChange) changes.push(ignoreChange);

  await commit(headSha, `ניוזלטר: גיליון עתידי ${entry.date} בהמתנה (${userEmail})`, changes);
  return { ok: true, entries };
}

async function actionScheduleRemove(date, userEmail) {
  if (!validDate(date)) throw new Error(`התאריך "${date}" אינו תקין.`);
  const headSha = await head();
  const entries = await readSchedule(headSha);
  const remaining = entries.filter(entry => entry.date !== date);
  if (remaining.length === entries.length) throw new Error('הגיליון המתוזמן לא נמצא.');
  await commit(headSha, `ניוזלטר: הסרת גיליון עתידי ${date} (${userEmail})`, [
    { path: `${SCHEDULE_DIR}/${date}.html`, content: null },
    { path: SCHEDULE_PATH, content: JSON.stringify(remaining, null, 2) }
  ]);
  return { ok: true, entries: remaining };
}

async function actionSchedulePublish(date, userEmail) {
  const headSha = await head();
  const entries = await readSchedule(headSha);
  const entry = entries.find(item => item.date === date);
  if (!entry) throw new Error('הגיליון המתוזמן לא נמצא.');
  const html = await readFile(`${SCHEDULE_DIR}/${date}.html`, headSha);
  if (html === null) throw new Error('קובץ הגיליון המתוזמן לא נמצא במאגר.');

  const manifest = await readFile(DATA_PATH, headSha);
  if (manifest === null) throw new Error('לא נמצא newsletter-data.js במאגר.');
  const current = parseIssues(manifest).issues;
  if (current.some(issue => issue.date === date) || await readFile(issuePath(date), headSha) !== null) {
    throw new Error(`כבר קיים גיליון מפורסם בתאריך ${date}.`);
  }
  const nextNumber = current.reduce((maximum, issue) => Math.max(maximum, issue.n), 0) + 1;
  const issues = [{ n: nextNumber, date, title: entry.title, sub: entry.sub || '' }, ...current];
  const remaining = entries.filter(item => item.date !== date);

  await commit(headSha, `ניוזלטר: פרסום גיליון ${nextNumber} · ${date} (${userEmail})`, [
    { path: issuePath(date), content: html },
    { path: DATA_PATH, content: serializeManifest(manifest, issues) },
    { path: LATEST_PATH, content: html },
    { path: `${SCHEDULE_DIR}/${date}.html`, content: null },
    { path: SCHEDULE_PATH, content: JSON.stringify(remaining, null, 2) }
  ]);
  return { ok: true };
}

/* ---------- handler ---------- */

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'שיטה לא נתמכת.' });
    return;
  }
  try {
    const email = authenticate(req);
    const body = req.body || {};
    const action = body.action;
    const payload = body.payload || {};
    let result;
    switch (action) {
      case 'ping': result = { ok: true, email }; break;
      // מפתח ה-AI לאפליקציית הדסקטופ (ANTHROPIC_API_KEY בהגדרות Vercel), למשתמש מחובר בלבד.
      case 'aiKey': result = { ok: true, key: process.env.ANTHROPIC_API_KEY || null }; break;
      case 'load': result = await actionLoad(); break;
      case 'readIssue': result = await actionReadIssue(payload); break;
      case 'save': result = await actionSave(payload, email); break;
      case 'scheduleAdd': result = await actionScheduleAdd(payload, email); break;
      case 'scheduleRemove': result = await actionScheduleRemove(payload.date, email); break;
      case 'schedulePublish': result = await actionSchedulePublish(payload.date, email); break;
      default: throw new Error('פעולה לא מוכרת.');
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
};
