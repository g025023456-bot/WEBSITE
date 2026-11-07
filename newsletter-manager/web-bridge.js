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
    discovery: { state: desktopOnly, run: desktopOnly, addSource: desktopOnly, updateSource: desktopOnly, removeSource: desktopOnly, setFindingStatus: desktopOnly, onProgress: noop, onFinished: noop },
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
