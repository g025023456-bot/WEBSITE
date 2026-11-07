// שכבת ה-AI של הדסקטופ: ניהול המפתח, קריאות ל-Claude דרך ה-SDK הרשמי, ושלוש הפעולות
// (דירוג, חיפוש ברשת, ניסוח). ההנחיות והסכמות נמצאות ב-ai-core.js, המשותף לדף הניהול באתר.
const fs = require('node:fs/promises');
const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk');
const core = require('./ai-core.js');
const { fetchText } = require('./discover.cjs');

const MODEL = core.MODEL;

function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'מפתח ה-AI אינו תקין או שבוטל. בדקו אותו בהגדרות.';
  if (error instanceof Anthropic.PermissionDeniedError) return 'למפתח ה-AI אין הרשאה לפעולה הזו.';
  if (error instanceof Anthropic.RateLimitError) return 'חרגנו ממכסת הבקשות של שירות ה-AI. נסו שוב בעוד דקה.';
  if (error instanceof Anthropic.APIConnectionError) return 'אין חיבור לשירות ה-AI. בדקו את החיבור לאינטרנט.';
  if (error instanceof Anthropic.BadRequestError) return `שירות ה-AI דחה את הבקשה: ${error.message}`;
  if (error instanceof Anthropic.APIError) return `שגיאה משירות ה-AI (${error.status}): ${error.message}`;
  return error && error.message ? error.message : 'שגיאה לא ידועה בשירות ה-AI.';
}

class AiService {
  constructor({ dataDir, safeStorage, getServerKey }) {
    this.dataDir = dataDir;
    this.safeStorage = safeStorage;
    this.getServerKey = getServerKey; // async () => string|null (ממשתמש מחובר לאתר)
    this.serverKeyCache = undefined;
    this.serverKeyCheckedAt = 0;
  }

  keyPath() { return path.join(this.dataDir, 'ai-key.json'); }

  async readLocalKey() {
    try {
      const stored = JSON.parse(await fs.readFile(this.keyPath(), 'utf8'));
      if (!stored.data) return null;
      return stored.encrypted
        ? this.safeStorage.decryptString(Buffer.from(stored.data, 'base64'))
        : Buffer.from(stored.data, 'base64').toString('utf8');
    } catch (error) {
      return null;
    }
  }

  async setKey(key) {
    const clean = String(key || '').trim();
    if (!clean) {
      await fs.rm(this.keyPath(), { force: true });
      return;
    }
    if (!/^sk-ant-/.test(clean)) throw new Error('מפתח Anthropic מתחיל ב-sk-ant-. בדקו שהעתקתם את המפתח המלא.');
    await fs.mkdir(this.dataDir, { recursive: true });
    const stored = this.safeStorage.isEncryptionAvailable()
      ? { data: this.safeStorage.encryptString(clean).toString('base64'), encrypted: true }
      : { data: Buffer.from(clean, 'utf8').toString('base64'), encrypted: false };
    await fs.writeFile(this.keyPath(), JSON.stringify(stored), 'utf8');
  }

  // { key, source: 'local' | 'server' | null }
  // מפתח מהשרת נשמר בזיכרון; תשובה ריקה (עדיין לא הוגדר, או לא מחוברים) נבדקת שוב אחרי דקה,
  // כך שהגדרה חדשה ב-Vercel נקלטת בלי להפעיל מחדש את האפליקציה.
  async resolveKey() {
    const local = await this.readLocalKey();
    if (local) return { key: local, source: 'local' };
    const stale = !this.serverKeyCheckedAt || Date.now() - this.serverKeyCheckedAt > 60 * 1000;
    if (this.getServerKey && (!this.serverKeyCache || stale)) {
      try { this.serverKeyCache = (await this.getServerKey()) || null; } catch (error) { this.serverKeyCache = null; }
      this.serverKeyCheckedAt = Date.now();
    }
    if (this.serverKeyCache) return { key: this.serverKeyCache, source: 'server' };
    return { key: null, source: null };
  }

  forgetServerKey() { this.serverKeyCache = undefined; this.serverKeyCheckedAt = 0; }

  async status() {
    const { source } = await this.resolveKey();
    return { available: Boolean(source), source, model: MODEL };
  }

  async client() {
    const { key } = await this.resolveKey();
    if (!key) throw new Error('לא הוגדר מפתח AI. הזינו מפתח בהגדרות המעקב, או בקשו ממנהל האתר להגדיר ANTHROPIC_API_KEY ב-Vercel.');
    return new Anthropic({ apiKey: key, maxRetries: 2, timeout: 10 * 60 * 1000 });
  }

  async testKey(candidate) {
    const key = candidate ? String(candidate).trim() : (await this.resolveKey()).key;
    if (!key) throw new Error('אין מפתח לבדיקה.');
    try {
      const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 30 * 1000 });
      const model = await client.models.retrieve(MODEL);
      return { ok: true, model: model.display_name || MODEL };
    } catch (error) {
      throw new Error(describeError(error));
    }
  }

  // קריאה אחת למודל, עם fallback שרת במקרה של סירוב. אם החשבון לא תומך בפרמטר, חוזרים בלעדיו.
  async createMessage(client, params) {
    try {
      return await client.beta.messages.create({ ...params, betas: [core.FALLBACK_BETA], fallbacks: 'default' });
    } catch (error) {
      if (error instanceof Anthropic.BadRequestError && /fallback|beta/i.test(error.message)) {
        return client.beta.messages.create(params);
      }
      throw error;
    }
  }

  async structured(client, { system, user, schema, effort = 'medium', maxTokens = 16000 }) {
    let message;
    try {
      message = await this.createMessage(client, {
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { effort, format: { type: 'json_schema', schema } }
      });
    } catch (error) {
      throw new Error(describeError(error));
    }
    return core.parseStructured(message);
  }

  /* ---------- דירוג פריטים ---------- */

  async scoreItems(items) {
    if (!items.length) return [];
    const client = await this.client();
    const results = new Array(items.length).fill(null);
    const BATCH = 40;
    for (let start = 0; start < items.length; start += BATCH) {
      const batch = items.slice(start, start + BATCH);
      const parsed = await this.structured(client, core.scoreRequest(batch, start));
      core.applyScores(parsed, results, items.length);
    }
    return results;
  }

  /* ---------- חיפוש ברשת ---------- */

  async webDiscover({ instructions = '' } = {}) {
    const client = await this.client();
    const request = core.searchRequest({ instructions, today: new Date().toISOString().slice(0, 10) });
    const messages = [{ role: 'user', content: request.user }];
    let message;
    try {
      for (let round = 0; round < 6; round++) {
        message = await this.createMessage(client, {
          model: MODEL,
          max_tokens: 16000,
          system: request.system,
          messages,
          output_config: { effort: request.effort },
          tools: [request.tool]
        });
        if (message.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: message.content });
      }
    } catch (error) {
      throw new Error(describeError(error));
    }
    if (message.stop_reason === 'refusal') throw new Error('שירות ה-AI סירב לחיפוש.');
    const text = core.textOf(message.content);
    let parsed = core.extractJson(text);
    if (!parsed || !Array.isArray(parsed.items)) {
      parsed = await this.structured(client, {
        system: request.structureSystem,
        user: text || 'לא נמצאו פריטים.',
        schema: request.schema,
        effort: 'low',
        maxTokens: 8000
      });
    }
    return core.normalizeSearchItems(parsed);
  }

  /* ---------- ניסוח גיליון ---------- */

  async fetchSourcesText(findings, onProgress = () => {}) {
    const pages = [];
    for (const [index, finding] of findings.entries()) {
      onProgress({ stage: 'read', index: index + 1, total: findings.length, title: finding.title });
      try {
        const { text } = await fetchText(finding.link);
        const article = core.extractArticle(text);
        pages.push({ finding, text: article.slice(0, core.PAGE_TEXT_LIMIT), ok: article.length > 200 });
      } catch (error) {
        pages.push({ finding, text: '', ok: false, error: error.message });
      }
    }
    return pages;
  }

  async draft({ findings = [], instructions = '', styleSample = '', onProgress = () => {} }) {
    const client = await this.client();
    const pages = await this.fetchSourcesText(findings, onProgress);
    if (!pages.some(page => page.ok) && !instructions.trim()) {
      throw new Error('לא הצלחנו לקרוא אף אחד מהמקורות שנבחרו, ולא ניתנו הנחיות. בחרו מקור אחר או כתבו נושא.');
    }
    onProgress({ stage: 'write' });
    const request = core.draftRequest({ pages, instructions, styleSample });
    const draft = await this.structured(client, { ...request, maxTokens: 16000 });
    return core.normalizeDraft(draft, pages);
  }
}

module.exports = { AiService, MODEL, describeError, extractArticle: core.extractArticle, cleanText: core.cleanText, DRAFT_SCHEMA: core.DRAFT_SCHEMA };
