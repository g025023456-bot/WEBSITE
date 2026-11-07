// שכבת ה-AI: דירוג רלוונטיות של פריטים, חיפוש עדכונים ברשת, וניסוח גיליון מלא
// על פי כללי התוכן של הניוזלטר (CLAUDE.md). המפתח נשמר מוצפן במחשב, או מגיע
// מהגדרות האתר (ANTHROPIC_API_KEY ב-Vercel) למשתמש מחובר.
const fs = require('node:fs/promises');
const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk');
const { fetchText, stripTags, clip } = require('./discover.cjs');

const MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const PAGE_TEXT_LIMIT = 9000;

const AUDIENCE = `הקהל: כ-700 משפחות חרדיות בישראל שמגדלות ילדים עם צרכים מיוחדים (מוגבלות פיזית, שכלית, התפתחותית, אוטיזם, מחלות כרוניות). הם מחפשים זכויות, קצבאות, שירותים, הליכים מול ביטוח לאומי, משרד הרווחה, משרד החינוך, משרד הבריאות, קופות החולים והרשויות המקומיות, וטיפים מעשיים.`;

const CONTENT_RULES = `כללי תוכן מחייבים (הפרה = פסילה):
1. בלי סכומי כסף ובלי אחוזים, אף פעם. במקום זה: "שווה לבדוק", "תלוי בהחלטת הוועדה", "משתנה בין רשות לרשות".
2. תוכן נצחי, לא תלוי תאריך: בלי "השבוע", "עכשיו", "לאחרונה", "לפני החגים", בלי שמות חודשים ובלי תאריכים. כותבים עקרונות ("לפני כל פתיחת שנה...").
3. בלי קו מפריד ארוך (—) ובלי מקף ארוך (–) בשום מקום. משתמשים בפסיק, בנקודה או בנקודה-אמצעית (·).
4. בלי ציטוטים, בלי סיפורי הצלחה ובלי דוגמאות על אנשים. רק מידע.
5. מידע כללי, לא ייעוץ ולא הבטחה: "פעמים רבות", "עשויים להיות זכאים", "כדאי לבדוק". בלי מספרי סעיפים בחוק ובלי תנאים מספריים מדויקים (גילאים, ותק, מספר ימים) אלא אם הם מופיעים במפורש במקור.
6. עברית תקנית, חמה ופשוטה, פנייה בלשון רבים ("אתם"). קהל חרדי: ניסוח מכבד, בלי סלנג.
7. העמותה: "הורה ומיוחד", המייל a@ho-me.org.il. אין להזכיר כתובת מייל אחרת. את "מימושים" לא מזכירים.
8. לא ממציאים זכות או הליך שלא מופיעים במקורות. אם המקורות דלים, כותבים על מה שיש, בזהירות.
9. בלי סימני מרקדאון, מלבד **הדגשה** של ביטוי אחד או שניים בכל קטע, אם יש צורך.`;

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string', description: 'שורת נושא למייל, עד 60 תווים, סקרנות ורלוונטיות בלי קליקבייט' },
    title: { type: 'string', description: 'כותרת הכתבה הראשית, עד 60 תווים' },
    sub: { type: 'string', description: 'משפט או שניים מתחת לכותרת שמסבירים מה הזכות ולמה זה חשוב, עד 170 תווים' },
    lead: {
      type: 'object',
      properties: {
        opening: { type: 'string', description: 'פסקת פתיחה בלי כותרת, 2-3 משפטים שמתארים את המצב מנקודת מבט ההורה' },
        paragraphs: {
          type: 'array',
          description: '3-4 פסקאות, לכל אחת כותרת קצרה (2-4 מילים, למשל "מה הזכות") ו-2-4 משפטים',
          items: {
            type: 'object',
            properties: { heading: { type: 'string' }, text: { type: 'string' } },
            required: ['heading', 'text'],
            additionalProperties: false
          }
        },
        closing: { type: 'string', description: 'משפט סיום אחד שמזמין לכתוב לעמותה, למשל "לא בטוחים אם זה חל עליכם? כתבו לנו, נעזור לכם להבין מה מגיע."' }
      },
      required: ['opening', 'paragraphs', 'closing'],
      additionalProperties: false
    },
    right: {
      type: 'object',
      description: 'מדור "זכות השבוע": היבט מעשי אחד קשור לנושא',
      properties: {
        heading: { type: 'string', description: 'כותרת קצרה, עד 45 תווים, בלי המילים "זכות השבוע"' },
        text: { type: 'string', description: '60-110 מילים' }
      },
      required: ['heading', 'text'],
      additionalProperties: false
    },
    dontMiss: { type: 'array', description: 'מדור "לא לפספס": 3 משפטים מעשיים, כל אחד משפט אחד, בלי תאריכים', items: { type: 'string' } },
    tip: { type: 'string', description: 'מדור "טיפ מהשטח": 50-90 מילים, עצה פרקטית אחת שהורה יכול ליישם' },
    editorNotes: { type: 'array', description: 'נקודות שהעורך האנושי צריך לאמת מול גורם מקצועי לפני הפרסום (תנאי זכאות, הליכים, שינויים חדשים)', items: { type: 'string' } },
    sourcesUsed: { type: 'array', description: 'כתובות המקורות שבאמת שימשו לכתיבה', items: { type: 'string' } }
  },
  required: ['subject', 'title', 'sub', 'lead', 'right', 'dontMiss', 'tip', 'editorNotes', 'sourcesUsed'],
  additionalProperties: false
};

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'מספר הפריט כפי שניתן' },
          relevance: { type: 'integer', description: '0-10: עד כמה הפריט חשוב להורים לילדים עם צרכים מיוחדים בישראל. 8-10 זכות/קצבה/שירות/שינוי הליך שנוגע ישירות לילדים עם מוגבלות ולמשפחותיהם. 5-7 רלוונטי חלקית. 0-4 לא רלוונטי: מודעות דרושים, גיוס תרומות, אירועים פנימיים, חדשות כלליות.' },
          summary: { type: 'string', description: 'משפט אחד בעברית, עד 160 תווים, מה חדש ולמי זה נוגע. בלי סכומים ואחוזים.' },
          topic: { type: 'string', description: 'תגית נושא קצרה: קצבאות, חינוך, בריאות, רווחה, תעסוקת הורים, נגישות, הטבות, כללי' }
        },
        required: ['index', 'relevance', 'summary', 'topic'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
};

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD אם ידוע, אחרת מחרוזת ריקה' },
          summary: { type: 'string', description: 'משפט אחד בעברית' },
          source: { type: 'string', description: 'שם האתר או הגוף' },
          relevance: { type: 'integer', description: '0-10' }
        },
        required: ['title', 'url', 'date', 'summary', 'source', 'relevance'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
};

function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'מפתח ה-AI אינו תקין או שבוטל. בדקו אותו בהגדרות.';
  if (error instanceof Anthropic.PermissionDeniedError) return 'למפתח ה-AI אין הרשאה לפעולה הזו.';
  if (error instanceof Anthropic.RateLimitError) return 'חרגנו ממכסת הבקשות של שירות ה-AI. נסו שוב בעוד דקה.';
  if (error instanceof Anthropic.APIConnectionError) return 'אין חיבור לשירות ה-AI. בדקו את החיבור לאינטרנט.';
  if (error instanceof Anthropic.BadRequestError) return `שירות ה-AI דחה את הבקשה: ${error.message}`;
  if (error instanceof Anthropic.APIError) return `שגיאה משירות ה-AI (${error.status}): ${error.message}`;
  return error && error.message ? error.message : 'שגיאה לא ידועה בשירות ה-AI.';
}

function textOf(message) {
  return message.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
}

// מחלץ JSON מתוך תשובה טקסטואלית (כשאין פורמט מובנה, למשל אחרי חיפוש ברשת).
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced ? fenced[1] : null, text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.search(/[{[]/);
    if (start < 0) continue;
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (end <= start) continue;
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch (error) { /* ננסה את המועמד הבא */ }
  }
  return null;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function extractArticle(html) {
  let body = html
    .replace(/<(script|style|noscript|svg|template|iframe|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const main = body.match(/<article\b[\s\S]*?<\/article>/i) || body.match(/<main\b[\s\S]*?<\/main>/i);
  if (main) body = main[0];
  const text = stripTags(body.replace(/<\/(p|div|li|h[1-6]|tr|br|section)>|<br\s*\/?>/gi, '\n'))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return text;
}

class AiService {
  constructor({ dataDir, safeStorage, getServerKey }) {
    this.dataDir = dataDir;
    this.safeStorage = safeStorage;
    this.getServerKey = getServerKey; // async () => string|null (ממשתמש מחובר לאתר)
    this.serverKeyCache = undefined;
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
      return await client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' });
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
    if (message.stop_reason === 'refusal') throw new Error('שירות ה-AI סירב לבקשה הזו.');
    if (message.stop_reason === 'max_tokens') throw new Error('התשובה של ה-AI נקטעה. נסו עם פחות פריטים.');
    const text = textOf(message);
    try {
      return JSON.parse(text);
    } catch (error) {
      const parsed = extractJson(text);
      if (parsed) return parsed;
      throw new Error('התשובה של ה-AI לא הייתה במבנה הצפוי.');
    }
  }

  /* ---------- דירוג פריטים ---------- */

  async scoreItems(items) {
    if (!items.length) return [];
    const client = await this.client();
    const results = new Array(items.length).fill(null);
    const BATCH = 40;
    for (let start = 0; start < items.length; start += BATCH) {
      const batch = items.slice(start, start + BATCH);
      const listing = batch.map((item, offset) =>
        `${start + offset + 1}. [${item.sourceName}] ${item.title}${item.date ? ` (${item.date})` : ''}\n   ${item.link}${item.summary ? `\n   ${clip(item.summary, 240)}` : ''}`
      ).join('\n');
      const parsed = await this.structured(client, {
        system: `אתם עורכי התוכן של הניוזלטר השבועי של עמותת "הורה ומיוחד". ${AUDIENCE}\nהמשימה: לדרג פריטים שנאספו מאתרים ומ-RSS לפי מידת החשיבות שלהם לקהל, ולסכם כל פריט במשפט. הציון חייב לשקף תועלת ישירה להורים: זכות חדשה או שהשתנתה, קצבה, הליך, שירות, מועד פתיחת הרשמה, הנחיה רשמית. פריטים שאינם קשורים למוגבלות או לצרכים מיוחדים, מודעות דרושים, גיוס תרומות, פוליטיקה וברכות לחג מקבלים ציון נמוך. בלי סכומים ואחוזים בסיכום.`,
        user: `דרגו את כל ${batch.length} הפריטים הבאים והחזירו שורה לכל פריט לפי מספרו:\n\n${listing}`,
        schema: SCORE_SCHEMA,
        effort: 'medium'
      });
      for (const row of parsed.items || []) {
        const position = Number(row.index) - 1;
        if (position < 0 || position >= items.length || results[position]) continue;
        results[position] = {
          relevance: Math.max(0, Math.min(10, Math.round(Number(row.relevance) || 0))),
          summary: cleanText(clip(row.summary, 220)),
          topic: cleanText(clip(row.topic, 30))
        };
      }
    }
    return results;
  }

  /* ---------- חיפוש ברשת ---------- */

  async webDiscover({ instructions = '' } = {}) {
    const client = await this.client();
    const today = new Date().toISOString().slice(0, 10);
    const system = `אתם חוקרי התוכן של הניוזלטר של עמותת "הורה ומיוחד". ${AUDIENCE}\nהמשימה: לאתר ברשת עדכונים חדשים מ-45 הימים האחרונים (היום ${today}) שחשובים לקהל: זכויות וקצבאות (ביטוח לאומי, גמלת ילד נכה, קצבאות, ניידות), חינוך מיוחד (ועדות, סייעות, הסעות, הרשמה), בריאות (התפתחות הילד, סל שיקום, סל תקשורת, קופות חולים), רווחה (משרד הרווחה, נופשונים, מסגרות), הטבות ברשויות, הנחיות ממשלתיות חדשות מאתר gov.il, ופרסומים של ארגוני סיוע בישראל. חפשו בעברית, בכמה חיפושים שונים. העדיפו מקורות רשמיים (btl.gov.il, gov.il, kolzchut.org.il, health.gov.il, education.gov.il) וארגונים מוכרים. אל תמציאו כתובות: כל URL חייב להופיע בתוצאות החיפוש.`;
    const user = `חפשו וחזרו עם עד 12 העדכונים החשובים ביותר. ${instructions ? `דגש מיוחד: ${instructions}\n` : ''}בסיום, החזירו אך ורק JSON בצורה: {"items":[{"title":"","url":"","date":"YYYY-MM-DD או ריק","summary":"משפט אחד בעברית בלי סכומים ואחוזים","source":"שם האתר","relevance":0}]}`;
    const messages = [{ role: 'user', content: user }];
    let message;
    try {
      for (let round = 0; round < 6; round++) {
        message = await this.createMessage(client, {
          model: MODEL,
          max_tokens: 16000,
          system,
          messages,
          output_config: { effort: 'medium' },
          tools: [{
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 10,
            user_location: { type: 'approximate', country: 'IL', timezone: 'Asia/Jerusalem' }
          }]
        });
        if (message.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: message.content });
      }
    } catch (error) {
      throw new Error(describeError(error));
    }
    if (message.stop_reason === 'refusal') throw new Error('שירות ה-AI סירב לחיפוש.');
    const text = textOf(message);
    let parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.items)) {
      parsed = await this.structured(client, {
        system: 'המירו את הטקסט הבא לרשימת פריטים מובנית. אל תוסיפו פריטים שלא מופיעים בטקסט.',
        user: text || 'לא נמצאו פריטים.',
        schema: SEARCH_SCHEMA,
        effort: 'low',
        maxTokens: 8000
      });
    }
    return (parsed.items || [])
      .filter(item => item && /^https?:\/\//i.test(String(item.url || '')))
      .map(item => ({
        title: cleanText(item.title), link: String(item.url).trim(), date: /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ? item.date : null,
        summary: cleanText(item.summary), source: cleanText(item.source), relevance: Number(item.relevance)
      }));
  }

  /* ---------- ניסוח גיליון ---------- */

  async fetchSourcesText(findings, onProgress = () => {}) {
    const pages = [];
    for (const [index, finding] of findings.entries()) {
      onProgress({ stage: 'read', index: index + 1, total: findings.length, title: finding.title });
      try {
        const { text } = await fetchText(finding.link);
        const article = extractArticle(text);
        pages.push({ finding, text: article.slice(0, PAGE_TEXT_LIMIT), ok: article.length > 200 });
      } catch (error) {
        pages.push({ finding, text: '', ok: false, error: error.message });
      }
    }
    return pages;
  }

  async draft({ findings = [], instructions = '', styleSample = '', onProgress = () => {} }) {
    const client = await this.client();
    const pages = await this.fetchSourcesText(findings, onProgress);
    const usable = pages.filter(page => page.ok);
    if (!usable.length && !instructions.trim()) {
      throw new Error('לא הצלחנו לקרוא אף אחד מהמקורות שנבחרו, ולא ניתנו הנחיות. בחרו מקור אחר או כתבו נושא.');
    }
    onProgress({ stage: 'write' });

    const sourcesBlock = pages.map((page, index) => {
      const head = `### מקור ${index + 1}: ${page.finding.title}\nכתובת: ${page.finding.link}${page.finding.sourceName ? `\nמאתר: ${page.finding.sourceName}` : ''}${page.finding.aiSummary ? `\nתקציר: ${page.finding.aiSummary}` : ''}`;
      const body = page.ok ? page.text : `(לא ניתן היה לקרוא את הדף: ${page.error || 'תוכן קצר מדי'}. הסתמכו על הכותרת והתקציר בלבד.)`;
      return `${head}\n\n${body}`;
    }).join('\n\n');

    const system = `אתם הכותבים של הניוזלטר השבועי של עמותת "הורה ומיוחד" (הסלוגן: "ביחד אנחנו חזקים"). ${AUDIENCE}
מטרת הגיליון: ערך, לא שיווק. בכל גיליון: כתבה ראשית על זכות או נושא אחד, מדור "זכות השבוע" עם היבט מעשי, "לא לפספס" עם שלושה דגשים, ו"טיפ מהשטח".

${CONTENT_RULES}

סגנון: כמו הדוגמה המצורפת. פסקאות קצרות, כותרת מודגשת קצרה לכל פסקה, משפטים ברורים, חום בלי פאתוס. אורך הכתבה הראשית: 280-420 מילים.${styleSample ? `\n\nדוגמה לגיליון שפורסם (לסגנון בלבד, לא לתוכן):\n"""\n${clip(styleSample, 6000)}\n"""` : ''}`;

    const user = `כתבו גיליון חדש על בסיס המקורות הבאים.${instructions.trim() ? `\n\nהנחיות העורך: ${instructions.trim()}` : ''}${usable.length ? '' : '\n\n(אין מקורות קריאים. כתבו על הנושא שבהנחיות מתוך ידע כללי, בזהירות, וציינו ב-editorNotes מה צריך אימות.)'}

${sourcesBlock || '(לא נבחרו מקורות)'}

זכרו: בלי סכומים, בלי אחוזים, בלי תאריכים, בלי קו מפריד ארוך, בלי סיפורים. ב-editorNotes פרטו כל עובדה שכדאי לאמת מול גורם מקצועי לפני השליחה.`;

    let draft;
    try {
      draft = await this.structured(client, { system, user, schema: DRAFT_SCHEMA, effort: 'high', maxTokens: 16000 });
    } catch (error) {
      throw new Error(error.message);
    }
    return {
      subject: cleanText(draft.subject),
      title: cleanText(draft.title),
      sub: cleanText(draft.sub),
      lead: {
        opening: cleanText(draft.lead.opening),
        paragraphs: (draft.lead.paragraphs || []).map(p => ({ heading: cleanText(p.heading).replace(/[.:]+$/, ''), text: cleanText(p.text) })).filter(p => p.text),
        closing: cleanText(draft.lead.closing)
      },
      right: { heading: cleanText(draft.right.heading), text: cleanText(draft.right.text) },
      dontMiss: (draft.dontMiss || []).map(cleanText).filter(Boolean).slice(0, 4),
      tip: cleanText(draft.tip),
      editorNotes: (draft.editorNotes || []).map(cleanText).filter(Boolean),
      sourcesUsed: (draft.sourcesUsed || []).filter(url => /^https?:/i.test(String(url))),
      readProblems: pages.filter(page => !page.ok).map(page => page.finding.title)
    };
  }
}

module.exports = { AiService, MODEL, describeError, extractArticle, cleanText, DRAFT_SCHEMA };
