// שכבת החיבור של דף הניהול באתר: מממשת את אותו ממשק newsletterApp של אפליקציית הדסקטופ.
// ניהול הגיליונות: קריאות fetch לפונקציית /api/newsletter-admin.
// מנוע העדכונים: המקורות והממצאים נשמרים בדפדפן (localStorage), קריאת האתרים נעשית דרך
// השרת (fetchSource / fetchArticle, כי הדפדפן חסום ב-CORS), וה-AI נקרא ישירות מהדפדפן
// עם המפתח שמוגדר ב-Vercel. מעקב אוטומטי ברקע והודעות Windows קיימים רק בדסקטופ.
// הקובץ admin/app.js נבנה אוטומטית: discover-core + ai-core + template + web-bridge + renderer (npm run build-admin).
(function () {
  const API = '/api/newsletter-admin';
  const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
  const core = window.AiCore;
  const dcore = window.DiscoverCore;
  const template = window.NewsletterTemplate;

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

  /* ---------- אחסון מקומי של מנוע העדכונים ---------- */

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(`nl.${key}`);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem(`nl.${key}`, JSON.stringify(value));
      return value;
    }
  };

  const DEFAULT_SETTINGS = { monitor: { enabled: false, intervalHours: 6, notify: false, webSearch: false }, manualWebSearch: true, startWithWindows: false, keepInTray: false };

  function getSettings() {
    const stored = store.get('settings', {});
    return { ...DEFAULT_SETTINGS, ...stored, monitor: { ...DEFAULT_SETTINGS.monitor, ...(stored.monitor || {}) } };
  }

  function getSources() {
    const stored = store.get('sources', null);
    if (Array.isArray(stored)) return stored;
    return store.set('sources', dcore.DEFAULT_SOURCES.map(source => ({ ...source })));
  }

  function getFindings() {
    const stored = store.get('findings', []);
    return Array.isArray(stored) ? stored : [];
  }

  function randomId(prefix) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    return `${prefix}-${[...bytes].map(b => b.toString(16).padStart(2, '0')).join('')}`;
  }

  // מזהה יציב לקישור (FNV-1a על הכתובת המנורמלת).
  function itemKey(link) {
    const text = dcore.normalizeLink(link);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${hash.toString(16).padStart(8, '0')}${text.length.toString(16)}`;
  }

  const listeners = { progress: new Set(), finished: new Set(), draft: new Set() };
  function emit(name, payload) {
    for (const listener of listeners[name]) {
      try { listener(payload); } catch (error) { /* מאזין שבור לא עוצר את המנוע */ }
    }
  }
  function subscribe(name, callback) {
    listeners[name].add(callback);
    return () => listeners[name].delete(callback);
  }

  /* ---------- AI ישירות מהדפדפן ---------- */

  let serverKey = { value: null, checkedAt: 0 };
  async function resolveKey() {
    if (!savedAuth()) return null;
    if (serverKey.value && Date.now() - serverKey.checkedAt < 10 * 60 * 1000) return serverKey.value;
    if (!serverKey.value && Date.now() - serverKey.checkedAt < 60 * 1000) return null;
    try {
      const result = await call('aiKey');
      serverKey = { value: result.key || null, checkedAt: Date.now() };
    } catch (error) {
      serverKey = { value: null, checkedAt: Date.now() };
    }
    return serverKey.value;
  }

  function describeAiError(error) {
    if (error.status === 401) return 'מפתח ה-AI שמוגדר באתר אינו תקין או שבוטל.';
    if (error.status === 403) return 'למפתח ה-AI אין הרשאה לפעולה הזו.';
    if (error.status === 429) return 'חרגנו ממכסת הבקשות של שירות ה-AI. נסו שוב בעוד דקה.';
    if (error.status === 529 || error.status === 503) return 'שירות ה-AI עמוס כרגע. נסו שוב בעוד דקה.';
    if (error.network) return 'אין חיבור לשירות ה-AI. בדקו את החיבור לאינטרנט.';
    return `שגיאה משירות ה-AI${error.status ? ` (${error.status})` : ''}: ${error.message}`;
  }

  async function claude(params, key) {
    const headers = {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    const attempt = async withFallback => {
      const body = { ...params };
      const requestHeaders = { ...headers };
      if (withFallback) {
        requestHeaders['anthropic-beta'] = core.FALLBACK_BETA;
        body.fallbacks = 'default';
      }
      let response;
      try {
        response = await fetch(ANTHROPIC_URL, { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) });
      } catch (error) {
        const failure = new Error(error.message);
        failure.network = true;
        throw failure;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const failure = new Error((data.error && data.error.message) || `HTTP ${response.status}`);
        failure.status = response.status;
        throw failure;
      }
      return data;
    };
    try {
      return await attempt(true);
    } catch (error) {
      if (error.status === 400 && /fallback|beta/i.test(error.message)) {
        try { return await attempt(false); } catch (again) { throw new Error(describeAiError(again)); }
      }
      throw new Error(describeAiError(error));
    }
  }

  async function structured(key, { system, user, schema, effort = 'medium', maxTokens = 16000 }) {
    const message = await claude({
      model: core.MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort, format: { type: 'json_schema', schema } }
    }, key);
    return core.parseStructured(message);
  }

  async function scoreItems(key, items) {
    const results = new Array(items.length).fill(null);
    const BATCH = 40;
    for (let start = 0; start < items.length; start += BATCH) {
      const batch = items.slice(start, start + BATCH);
      const parsed = await structured(key, core.scoreRequest(batch, start));
      core.applyScores(parsed, results, items.length);
    }
    return results;
  }

  async function webDiscover(key) {
    const request = core.searchRequest({ today: new Date().toISOString().slice(0, 10) });
    const messages = [{ role: 'user', content: request.user }];
    let message;
    for (let round = 0; round < 6; round++) {
      message = await claude({
        model: core.MODEL, max_tokens: 16000, system: request.system, messages,
        output_config: { effort: request.effort }, tools: [request.tool]
      }, key);
      if (message.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: message.content });
    }
    if (message.stop_reason === 'refusal') throw new Error('שירות ה-AI סירב לחיפוש.');
    const text = core.textOf(message.content);
    let parsed = core.extractJson(text);
    if (!parsed || !Array.isArray(parsed.items)) {
      parsed = await structured(key, { system: request.structureSystem, user: text || 'לא נמצאו פריטים.', schema: request.schema, effort: 'low', maxTokens: 8000 });
    }
    return core.normalizeSearchItems(parsed);
  }

  /* ---------- מנוע הסריקה (גרסת הדפדפן של Discovery.run) ---------- */

  let running = false;
  async function runDiscovery({ webSearch }) {
    if (running) throw new Error('סריקה כבר רצה. המתינו לסיומה.');
    running = true;
    const startedAt = new Date().toISOString();
    try {
      const sources = getSources();
      const seen = store.get('seen', {});
      const findings = getFindings();
      const known = new Set(findings.map(finding => finding.key));
      const candidates = [];
      const sourceResults = [];
      const enabled = sources.filter(source => source.enabled);
      let index = 0;
      for (const source of enabled) {
        index++;
        emit('progress', { stage: 'source', index, total: enabled.length, name: source.name });
        const firstRun = !seen[source.id];
        const seenMap = seen[source.id] || {};
        const now = new Date().toISOString();
        try {
          const { kind, items } = await call('fetchSource', { url: source.url });
          const fresh = items.filter(item => !seenMap[itemKey(item.link)]);
          const picked = firstRun ? items.slice(0, dcore.FIRST_RUN_CANDIDATES) : fresh;
          for (const item of items) {
            const key = itemKey(item.link);
            if (!seenMap[key]) seenMap[key] = now;
          }
          seen[source.id] = seenMap;
          source.kind = kind;
          source.lastCheck = now;
          source.lastResult = { ok: true, count: items.length, newCount: picked.length, firstRun };
          for (const item of picked) {
            const key = itemKey(item.link);
            if (known.has(key)) continue;
            known.add(key);
            candidates.push({ ...item, key, sourceId: source.id, sourceName: source.name, via: 'source' });
          }
          sourceResults.push({ id: source.id, name: source.name, ok: true, count: items.length, newCount: picked.length, firstRun });
        } catch (error) {
          source.lastCheck = now;
          source.lastResult = { ok: false, error: error.message };
          sourceResults.push({ id: source.id, name: source.name, ok: false, error: error.message });
        }
      }
      store.set('sources', sources);
      store.set('seen', seen);

      const key = await resolveKey();
      let searchError = null;
      if (webSearch && key) {
        emit('progress', { stage: 'search' });
        try {
          for (const item of await webDiscover(key)) {
            if (!item.link) continue;
            const itemId = itemKey(item.link);
            if (known.has(itemId)) continue;
            known.add(itemId);
            candidates.push({
              title: dcore.clip(item.title, 180), link: item.link, date: item.date || null, summary: dcore.clip(item.summary || '', 320),
              key: itemId, sourceId: 'web', sourceName: item.source || dcore.hostOf(item.link) || 'חיפוש ברשת', via: 'search',
              relevance: typeof item.relevance === 'number' && !Number.isNaN(item.relevance) ? item.relevance : undefined
            });
          }
        } catch (error) {
          searchError = error.message;
        }
      }

      let scoringError = null;
      if (candidates.length && key) {
        emit('progress', { stage: 'score', count: candidates.length });
        try {
          const scored = await scoreItems(key, candidates);
          scored.forEach((result, position) => {
            if (!result) return;
            candidates[position].relevance = result.relevance;
            candidates[position].aiSummary = result.summary;
            candidates[position].topic = result.topic;
          });
        } catch (error) {
          scoringError = error.message;
        }
      }
      for (const candidate of candidates) {
        if (typeof candidate.relevance !== 'number') candidate.relevance = dcore.keywordScore(candidate);
        candidate.relevance = Math.max(0, Math.min(10, Math.round(candidate.relevance)));
      }

      const foundAt = new Date().toISOString();
      const added = candidates.map(candidate => ({
        id: randomId('f'), key: candidate.key, title: candidate.title, link: candidate.link, date: candidate.date,
        summary: candidate.summary, aiSummary: candidate.aiSummary || '', topic: candidate.topic || '', relevance: candidate.relevance,
        sourceId: candidate.sourceId, sourceName: candidate.sourceName, via: candidate.via, status: 'new', foundAt
      }));
      let merged = [...added, ...findings];
      const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
      merged = merged.filter(finding => !(finding.status === 'dismissed' && Date.parse(finding.foundAt) < cutoff));
      if (merged.length > dcore.MAX_FINDINGS) {
        merged.sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || b.foundAt.localeCompare(a.foundAt));
        merged = merged.slice(0, dcore.MAX_FINDINGS);
      }
      store.set('findings', merged);
      const important = added.filter(finding => finding.relevance >= 7);
      const summary = {
        startedAt, finishedAt: foundAt, mode: 'manual',
        sourcesChecked: sourceResults.filter(result => result.ok).length,
        sourcesFailed: sourceResults.filter(result => !result.ok).length,
        newCount: added.length, importantCount: important.length,
        scored: Boolean(key) && !scoringError, webSearch: Boolean(webSearch && key && !searchError),
        searchError, scoringError
      };
      const status = store.get('status', {});
      status.lastRun = foundAt;
      status.lastSummary = summary;
      store.set('status', status);
      emit('finished', { summary, mode: 'manual' });
      return { summary, sourceResults, addedCount: added.length, importantCount: important.length };
    } finally {
      running = false;
    }
  }

  async function aiStatus() {
    const key = await resolveKey();
    return { available: Boolean(key), source: key ? 'server' : null, model: core.MODEL };
  }

  async function discoveryState() {
    return { sources: getSources(), findings: getFindings(), status: store.get('status', {}), settings: getSettings(), ai: await aiStatus(), running };
  }

  const desktopOnly = () => Promise.reject(new Error('הפעולה הזו זמינה באפליקציית הדסקטופ בלבד.'));
  const noop = () => () => {};

  window.newsletterApp = {
    // מנוע העדכונים רץ גם כאן; מעקב ברקע, הודעות Windows ומפתח מקומי קיימים רק בדסקטופ.
    features: { discovery: true, monitor: false, localKey: false, desktop: false },
    openExternal(url) { window.open(url, '_blank', 'noopener'); return Promise.resolve(); },
    diagnostics() { return call('diagnostics'); },
    onNavigate: noop,
    onRunDiscovery: noop,

    discovery: {
      state: discoveryState,
      async run(options) {
        const settings = getSettings();
        const webSearch = options && typeof options.webSearch === 'boolean' ? options.webSearch : settings.manualWebSearch;
        const result = await runDiscovery({ webSearch });
        return { ...(await discoveryState()), result };
      },
      async addSource({ name, url }) {
        const cleanUrl = String(url || '').trim();
        const cleanName = String(name || '').trim() || dcore.hostOf(cleanUrl);
        if (!/^https?:\/\/[^\s]+$/i.test(cleanUrl)) throw new Error('הכתובת צריכה להתחיל ב-https:// ולהיות כתובת של דף או של RSS.');
        const sources = getSources();
        if (sources.some(source => dcore.normalizeLink(source.url) === dcore.normalizeLink(cleanUrl))) throw new Error('המקור הזה כבר ברשימה.');
        const probe = await call('fetchSource', { url: cleanUrl });
        sources.push({ id: randomId('src'), name: cleanName, url: cleanUrl, enabled: true, kind: probe.kind, lastCheck: null, lastResult: { ok: true, count: probe.items.length, newCount: 0, probe: true } });
        store.set('sources', sources);
        return { sources, probeCount: probe.items.length, kind: probe.kind };
      },
      async updateSource(id, patch) {
        const sources = getSources();
        const source = sources.find(item => item.id === id);
        if (!source) throw new Error('המקור לא נמצא.');
        if (typeof patch.enabled === 'boolean') source.enabled = patch.enabled;
        if (typeof patch.name === 'string' && patch.name.trim()) source.name = patch.name.trim();
        return store.set('sources', sources);
      },
      async removeSource(id) {
        const sources = getSources();
        const remaining = sources.filter(item => item.id !== id);
        if (remaining.length === sources.length) throw new Error('המקור לא נמצא.');
        const seen = store.get('seen', {});
        delete seen[id];
        store.set('seen', seen);
        return store.set('sources', remaining);
      },
      async testSource(id) {
        const sources = getSources();
        const source = sources.find(item => item.id === id);
        if (!source) throw new Error('המקור לא נמצא.');
        const now = new Date().toISOString();
        try {
          const { kind, items } = await call('fetchSource', { url: source.url });
          source.kind = kind;
          source.lastCheck = now;
          source.lastResult = { ok: true, count: items.length, newCount: 0, probe: true };
          store.set('sources', sources);
          return { ok: true, kind, count: items.length, sample: items.slice(0, 3).map(item => item.title), sources };
        } catch (error) {
          source.lastCheck = now;
          source.lastResult = { ok: false, error: error.message };
          store.set('sources', sources);
          return { ok: false, error: error.message, sources };
        }
      },
      async resetSources() {
        const custom = getSources().filter(source => String(source.id).startsWith('src-'));
        return store.set('sources', [...dcore.DEFAULT_SOURCES.map(source => ({ ...source })), ...custom]);
      },
      async setFindingStatus(ids, status) {
        if (!['new', 'used', 'dismissed'].includes(status)) throw new Error('סטטוס לא מוכר.');
        const wanted = new Set(Array.isArray(ids) ? ids : [ids]);
        const findings = getFindings();
        for (const finding of findings) if (wanted.has(finding.id)) finding.status = status;
        return store.set('findings', findings);
      },
      onProgress: callback => subscribe('progress', callback),
      onFinished: callback => subscribe('finished', callback)
    },

    settings: {
      async get() { return getSettings(); },
      async set(patch) {
        const current = getSettings();
        const next = { ...current, ...patch, monitor: { ...current.monitor, ...(patch.monitor || {}) } };
        next.monitor.enabled = false; // מעקב ברקע: דסקטופ בלבד
        return store.set('settings', next);
      },
      onChanged: noop
    },

    ai: {
      status: aiStatus,
      setKey: () => Promise.reject(new Error('בדף הניהול באתר המפתח מגיע מהגדרות האתר ב-Vercel (ANTHROPIC_API_KEY). מפתח מקומי אפשר לשמור באפליקציית הדסקטופ.')),
      async testKey(candidate) {
        const key = candidate ? String(candidate).trim() : await resolveKey();
        if (!key) throw new Error('אין מפתח לבדיקה. הגדירו ANTHROPIC_API_KEY ב-Vercel ועשו Redeploy.');
        let response;
        try {
          response = await fetch(`https://api.anthropic.com/v1/models/${core.MODEL}`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
        } catch (error) {
          throw new Error('אין חיבור לשירות ה-AI. בדקו את החיבור לאינטרנט.');
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const failure = new Error((data.error && data.error.message) || `HTTP ${response.status}`);
          failure.status = response.status;
          throw new Error(describeAiError(failure));
        }
        return { ok: true, model: data.display_name || core.MODEL };
      }
    },

    draft: {
      async generate(request) {
        const key = await resolveKey();
        if (!key) throw new Error('לא הוגדר מפתח AI באתר. הגדירו ANTHROPIC_API_KEY ב-Vercel ועשו Redeploy.');
        const wanted = new Set(request.findingIds || []);
        const findings = getFindings();
        const selected = findings.filter(finding => wanted.has(finding.id));
        const instructions = String(request.instructions || '');
        if (!selected.length && !instructions.trim()) throw new Error('בחרו לפחות עדכון אחד, או כתבו נושא והנחיות לכותב.');
        const pages = [];
        for (const [index, finding] of selected.entries()) {
          emit('draft', { stage: 'read', index: index + 1, total: selected.length, title: finding.title });
          try {
            const result = await call('fetchArticle', { url: finding.link });
            pages.push({ finding, text: result.text, ok: result.length > 200 });
          } catch (error) {
            pages.push({ finding, text: '', ok: false, error: error.message });
          }
        }
        if (!pages.some(page => page.ok) && !instructions.trim()) {
          throw new Error('לא הצלחנו לקרוא אף אחד מהמקורות שנבחרו, ולא ניתנו הנחיות. בחרו מקור אחר או כתבו נושא.');
        }
        emit('draft', { stage: 'write' });
        const raw = await structured(key, { ...core.draftRequest({ pages, instructions, styleSample: String(request.styleSample || '') }), maxTokens: 16000 });
        const draft = core.normalizeDraft(raw, pages);
        const n = Number(request.issueNumber) || 1;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(request.date || '') ? request.date : new Date().toISOString().slice(0, 10);
        const html = template.renderIssue({ n, date, content: draft });
        if (selected.length) {
          for (const finding of findings) if (wanted.has(finding.id)) finding.status = 'used';
          store.set('findings', findings);
        }
        return { html, n, date, draft, problems: template.contentProblems(html) };
      },
      onProgress: callback => subscribe('draft', callback)
    },

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
      serverKey = { value: null, checkedAt: 0 };
      const data = await call('load');
      return { email, canWrite: true, issues: data.issues, scheduled: data.scheduled, headSha: data.headSha };
    },

    async logout() {
      localStorage.removeItem('newsletter-auth');
      localStorage.removeItem('newsletter-email');
      serverKey = { value: null, checkedAt: 0 };
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
