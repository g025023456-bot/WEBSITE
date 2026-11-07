// מנוע איתור העדכונים: עוקב אחרי רשימת מקורות (דפי אינטרנט ו-RSS), מזהה פריטים
// חדשים מאז הבדיקה הקודמת, מדרג אותם לפי רלוונטיות (עם AI אם יש מפתח, אחרת לפי
// מילות מפתח), ושומר את הממצאים בקובצי JSON בתיקיית הנתונים של האפליקציה.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_SOURCES = [
  { id: 'btl-news', name: 'ביטוח לאומי · חדשות והודעות', url: 'https://www.btl.gov.il/About/news/Pages/default.aspx', enabled: true },
  { id: 'btl-disabled-child', name: 'ביטוח לאומי · ילד נכה', url: 'https://www.btl.gov.il/benefits/Disabled_Child/Pages/default.aspx', enabled: true },
  { id: 'kolzchut-recent', name: 'כל זכות · עדכונים אחרונים', url: 'https://www.kolzchut.org.il/he/Special:RecentChanges?feed=atom', enabled: true },
  { id: 'kolzchut-children', name: 'כל זכות · ילדים עם מוגבלות', url: 'https://www.kolzchut.org.il/he/%D7%99%D7%9C%D7%93%D7%99%D7%9D_%D7%A2%D7%9D_%D7%A6%D7%A8%D7%9B%D7%99%D7%9D_%D7%9E%D7%99%D7%95%D7%97%D7%93%D7%99%D7%9D', enabled: true },
  { id: 'bizchut', name: 'בזכות · זכויות אנשים עם מוגבלות', url: 'https://bizchut.org.il/', enabled: true },
  { id: 'kesher', name: 'קשר · הבית של המשפחות המיוחדות', url: 'https://www.kesher.org.il/feed/', enabled: true },
  { id: 'alut', name: 'אלו"ט · אוטיזם', url: 'https://alut.org.il/feed/', enabled: true },
  { id: 'beitissie', name: 'בית איזי שפירא', url: 'https://www.beitissie.org.il/feed/', enabled: false },
  { id: 'nitzan', name: 'ניצן · לקויות למידה', url: 'https://www.nitzan-israel.org.il/feed/', enabled: false },
  { id: 'akim', name: 'אקים', url: 'https://www.akim.org.il/feed/', enabled: false }
];

// מילות מפתח לדירוג בסיסי כשאין מפתח AI (ציון 0-10).
const KEYWORDS = [
  ['ילד נכה', 4], ['ילד עם מוגבלות', 4], ['ילדים עם מוגבלות', 4], ['צרכים מיוחדים', 4], ['חינוך מיוחד', 4],
  ['גמלת ילד נכה', 5], ['קצבת ילד נכה', 5], ['קצבה', 2], ['קצבאות', 2], ['זכאות', 2], ['זכויות', 2], ['זכות', 1],
  ['ביטוח לאומי', 2], ['ועדה', 2], ['ועדת', 2], ['השמה', 2], ['אפיון', 2], ['סייעת', 3], ['סייעות', 3], ['הסעה', 2], ['הסעות', 2],
  ['סל שיקום', 3], ['סל תקשורת', 3], ['התפתחות הילד', 3], ['אוטיזם', 3], ['מוגבלות', 2], ['נכות', 2], ['שיקום', 1],
  ['תג נכה', 3], ['תג חניה', 3], ['הנחה', 2], ['הנחות', 2], ['פטור', 2], ['הטבה', 2], ['הטבות', 2], ['מענק', 2],
  ['משרד הרווחה', 2], ['משרד החינוך', 2], ['משרד הבריאות', 1], ['קופת חולים', 1], ['טיפול', 1], ['טיפולים', 1],
  ['הורים', 1], ['משפחה', 1], ['משפחות', 1], ['מעסיק', 1], ['ימי מחלה', 2], ['היעדרות', 2], ['נופשון', 2], ['מטפל', 1],
  ['מבחן', 0], ['דרוש', -3], ['דרושה', -3], ['משרה', -3], ['תרומה', -2], ['אירוע', -1], ['כנס', -1], ['בחירות', -1]
];

const STOP_TEXTS = new Set([
  'דף הבית', 'צור קשר', 'צרו קשר', 'אודות', 'עוד', 'קרא עוד', 'קראו עוד', 'המשך קריאה', 'לפרטים', 'לפרטים נוספים',
  'הצהרת נגישות', 'מפת האתר', 'תנאי שימוש', 'מדיניות פרטיות', 'מדיניות הפרטיות', 'תרומה', 'תרומות', 'הרשמה', 'התחברות', 'כניסה'
]);

const FETCH_TIMEOUT_MS = 25000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 ho-me-newsletter-manager/1.1';
const MAX_ITEMS_PER_SOURCE = 40;
const FIRST_RUN_CANDIDATES = 12;
const MAX_FINDINGS = 500;

/* ---------- helpers ---------- */

function decodeEntities(value) {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function clip(text, max) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function normalizeLink(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (/[?&](diff|oldid|curid)=/.test(parsed.search)) parsed.search = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|__cft|ref)/i.test(key)) parsed.searchParams.delete(key);
    }
    let out = parsed.toString();
    if (out.endsWith('/') && parsed.pathname !== '/') out = out.slice(0, -1);
    return out;
  } catch (error) {
    return String(url);
  }
}

function itemKey(link) {
  return crypto.createHash('sha1').update(normalizeLink(link)).digest('hex').slice(0, 16);
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const dotted = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, '0')}-${dotted[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (error) { return ''; }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'he,en;q=0.7', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? 'האתר לא ענה בזמן.' : 'לא ניתן להתחבר לאתר.');
  } finally {
    clearTimeout(timer);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || '';
  let charset = (contentType.match(/charset=([\w-]+)/i) || [])[1];
  if (!charset) {
    const head = buffer.slice(0, 4096).toString('latin1');
    charset = (head.match(/charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  }
  let text;
  try { text = new TextDecoder(charset).decode(buffer); } catch (error) { text = buffer.toString('utf8'); }
  if (/<title>Just a moment\.\.\.<\/title>|cf-chl|challenge-platform/i.test(text.slice(0, 4000))) {
    throw new Error('האתר חוסם גישה אוטומטית (בדיקת Cloudflare). נסו שוב מאוחר יותר.');
  }
  // חלק מהאתרים מחזירים דף אמיתי עם קוד 404 (למשל כל זכות). דף קצר הוא שגיאה אמיתית.
  if (!response.ok && text.length < 5000) throw new Error(`האתר החזיר שגיאה ${response.status}.`);
  return { text, contentType, finalUrl: response.url || url };
}

/* ---------- parsers ---------- */

function parseFeed(xml, baseUrl) {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  const field = (block, names) => {
    for (const name of names) {
      const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
      if (match) return decodeEntities(match[1]).trim();
    }
    return '';
  };
  for (const block of blocks) {
    const title = stripTags(field(block, ['title']));
    let link = field(block, ['link']);
    if (!link) {
      const atomLink = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
        || block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
      link = atomLink ? decodeEntities(atomLink[1]) : '';
    }
    if (!link) link = field(block, ['guid']);
    if (!title || !/^https?:/i.test(link)) continue;
    const date = parseDate(field(block, ['pubDate', 'published', 'updated', 'dc:date']));
    const summary = clip(stripTags(field(block, ['description', 'summary', 'content:encoded', 'content'])), 320);
    try { link = new URL(link, baseUrl).toString(); } catch (error) { continue; }
    items.push({ title: clip(title, 180), link, date, summary });
    if (items.length >= MAX_ITEMS_PER_SOURCE * 2) break;
  }
  return items;
}

function parsePage(html, pageUrl) {
  const cleaned = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  const pageHost = hostOf(pageUrl);
  const selfKey = normalizeLink(pageUrl);
  const seen = new Set();
  const items = [];
  const pattern = /<a\b([^>]*)href=["']([^"'#]+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(cleaned)) !== null) {
    const rawHref = decodeEntities(match[2]).trim();
    if (/^(javascript:|mailto:|tel:|data:)/i.test(rawHref)) continue;
    let text = stripTags(match[4]);
    if (!text) continue;
    const dateMatch = text.match(/^(\d{1,2}[./]\d{1,2}[./]\d{4})\s*[-·:]?\s*/);
    let date = null;
    if (dateMatch) {
      date = parseDate(dateMatch[1]);
      text = text.slice(dateMatch[0].length).trim();
    }
    if (text.length < 14 || text.length > 180) continue;
    if (STOP_TEXTS.has(text) || /^(https?:|www\.)/i.test(text)) continue;
    if (!/[֐-׿]/.test(text)) continue; // רק כותרות בעברית
    let link;
    try { link = new URL(rawHref, pageUrl).toString(); } catch (error) { continue; }
    if (!/^https?:/i.test(link)) continue;
    const host = hostOf(link);
    if (host !== pageHost && !host.endsWith(`.${pageHost}`) && !pageHost.endsWith(`.${host}`)) continue;
    const key = normalizeLink(link);
    if (key === selfKey || seen.has(key)) continue;
    if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?)$/i.test(new URL(link).pathname) && text.length < 20) continue;
    seen.add(key);
    items.push({ title: text, link, date, summary: '' });
    if (items.length >= MAX_ITEMS_PER_SOURCE * 3) break;
  }
  // בדף חדשות, הפריטים עם תאריך הם הידיעות; קישורי ניווט בלי תאריך נדחקים לסוף.
  const dated = items.filter(item => item.date);
  if (dated.length >= 3) {
    dated.sort((a, b) => b.date.localeCompare(a.date));
    return [...dated, ...items.filter(item => !item.date)].slice(0, MAX_ITEMS_PER_SOURCE);
  }
  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

async function fetchSource(source) {
  const { text, contentType, finalUrl } = await fetchText(source.url);
  const head = text.slice(0, 3000);
  const isFeed = /xml/i.test(contentType) && /<(rss|feed|rdf:RDF)\b/i.test(head) || /^\s*(<\?xml[^>]*>\s*)?<(rss|feed)\b/i.test(head);
  const kind = isFeed ? 'rss' : 'page';
  const items = isFeed ? parseFeed(text, finalUrl) : parsePage(text, finalUrl);
  return { kind, items: items.slice(0, MAX_ITEMS_PER_SOURCE) };
}

function keywordScore(item) {
  const haystack = `${item.title} ${item.summary || ''}`;
  let score = 0;
  let hits = 0;
  for (const [word, weight] of KEYWORDS) {
    if (haystack.includes(word)) { score += weight; hits++; }
  }
  if (!hits) return 1;
  return Math.max(0, Math.min(10, 2 + score));
}

/* ---------- storage + engine ---------- */

class Discovery {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.running = false;
    this.cache = {};
  }

  file(name) { return path.join(this.dataDir, name); }

  async readJson(name, fallback) {
    try {
      return JSON.parse(await fs.readFile(this.file(name), 'utf8'));
    } catch (error) {
      return fallback;
    }
  }

  async writeJson(name, value) {
    await fs.mkdir(this.dataDir, { recursive: true });
    const tmp = `${this.file(name)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmp, this.file(name));
  }

  async getSources() {
    const stored = await this.readJson('sources.json', null);
    if (!Array.isArray(stored)) {
      await this.writeJson('sources.json', DEFAULT_SOURCES);
      return DEFAULT_SOURCES.map(source => ({ ...source }));
    }
    return stored;
  }

  async saveSources(sources) {
    await this.writeJson('sources.json', sources);
    return sources;
  }

  async addSource({ name, url }) {
    const cleanUrl = String(url || '').trim();
    const cleanName = String(name || '').trim() || hostOf(cleanUrl);
    if (!/^https?:\/\/[^\s]+$/i.test(cleanUrl)) throw new Error('הכתובת צריכה להתחיל ב-https:// ולהיות כתובת של דף או של RSS.');
    const sources = await this.getSources();
    if (sources.some(source => normalizeLink(source.url) === normalizeLink(cleanUrl))) throw new Error('המקור הזה כבר ברשימה.');
    // בדיקה מיידית: האתר נגיש ואפשר לקרוא ממנו פריטים.
    const probe = await fetchSource({ url: cleanUrl });
    const source = {
      id: `src-${crypto.randomBytes(4).toString('hex')}`,
      name: cleanName,
      url: cleanUrl,
      enabled: true,
      kind: probe.kind,
      lastCheck: null,
      lastResult: { ok: true, count: probe.items.length, newCount: 0, probe: true }
    };
    sources.push(source);
    await this.saveSources(sources);
    return { sources, probeCount: probe.items.length, kind: probe.kind };
  }

  async updateSource(id, patch) {
    const sources = await this.getSources();
    const source = sources.find(item => item.id === id);
    if (!source) throw new Error('המקור לא נמצא.');
    if (typeof patch.enabled === 'boolean') source.enabled = patch.enabled;
    if (typeof patch.name === 'string' && patch.name.trim()) source.name = patch.name.trim();
    await this.saveSources(sources);
    return sources;
  }

  async removeSource(id) {
    const sources = await this.getSources();
    const remaining = sources.filter(item => item.id !== id);
    if (remaining.length === sources.length) throw new Error('המקור לא נמצא.');
    await this.saveSources(remaining);
    const seen = await this.readJson('seen.json', {});
    delete seen[id];
    await this.writeJson('seen.json', seen);
    return remaining;
  }

  async resetSource(id) {
    const seen = await this.readJson('seen.json', {});
    delete seen[id];
    await this.writeJson('seen.json', seen);
  }

  async getFindings() {
    const findings = await this.readJson('findings.json', []);
    return Array.isArray(findings) ? findings : [];
  }

  async setFindingStatus(ids, status) {
    if (!['new', 'used', 'dismissed'].includes(status)) throw new Error('סטטוס לא מוכר.');
    const findings = await this.getFindings();
    const wanted = new Set(Array.isArray(ids) ? ids : [ids]);
    for (const finding of findings) {
      if (wanted.has(finding.id)) finding.status = status;
    }
    await this.writeJson('findings.json', findings);
    return findings;
  }

  async getStatus() {
    return this.readJson('status.json', { lastRun: null, lastAutoRun: null, lastSummary: null, running: this.running });
  }

  // מריץ סריקה מלאה. ai: אובייקט עם scoreItems/webDiscover (או null). options.webSearch: האם להפעיל חיפוש AI ברשת.
  async run({ ai = null, mode = 'manual', webSearch = false, onProgress = () => {} } = {}) {
    if (this.running) throw new Error('סריקה כבר רצה. המתינו לסיומה.');
    this.running = true;
    const startedAt = new Date().toISOString();
    try {
      const sources = await this.getSources();
      const seen = await this.readJson('seen.json', {});
      const findings = await this.getFindings();
      const known = new Set(findings.map(finding => finding.key));
      const candidates = [];
      const sourceResults = [];
      const enabled = sources.filter(source => source.enabled);
      let index = 0;
      for (const source of enabled) {
        index++;
        onProgress({ stage: 'source', index, total: enabled.length, name: source.name });
        const firstRun = !seen[source.id];
        const seenMap = seen[source.id] || {};
        const now = new Date().toISOString();
        try {
          const { kind, items } = await fetchSource(source);
          const fresh = items.filter(item => !seenMap[itemKey(item.link)]);
          const picked = firstRun ? items.slice(0, FIRST_RUN_CANDIDATES) : fresh;
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
      await this.saveSources(sources);
      await this.writeJson('seen.json', seen);

      let searchError = null;
      if (webSearch && ai) {
        onProgress({ stage: 'search' });
        try {
          const found = await ai.webDiscover();
          for (const item of found) {
            if (!item.link) continue;
            const key = itemKey(item.link);
            if (known.has(key)) continue;
            known.add(key);
            candidates.push({
              title: clip(item.title, 180), link: item.link, date: item.date || null, summary: clip(item.summary || '', 320),
              key, sourceId: 'web', sourceName: item.source || hostOf(item.link) || 'חיפוש ברשת', via: 'search',
              relevance: typeof item.relevance === 'number' ? item.relevance : undefined
            });
          }
        } catch (error) {
          searchError = error.message;
        }
      }

      let scoringError = null;
      if (candidates.length && ai) {
        onProgress({ stage: 'score', count: candidates.length });
        try {
          const scored = await ai.scoreItems(candidates);
          for (const [position, result] of scored.entries()) {
            const candidate = candidates[position];
            if (!candidate || !result) continue;
            candidate.relevance = result.relevance;
            candidate.aiSummary = result.summary;
            candidate.topic = result.topic;
          }
        } catch (error) {
          scoringError = error.message;
        }
      }
      for (const candidate of candidates) {
        if (typeof candidate.relevance !== 'number') candidate.relevance = keywordScore(candidate);
        candidate.relevance = Math.max(0, Math.min(10, Math.round(candidate.relevance)));
      }

      const foundAt = new Date().toISOString();
      const added = candidates.map(candidate => ({
        id: `f-${crypto.randomBytes(5).toString('hex')}`,
        key: candidate.key,
        title: candidate.title,
        link: candidate.link,
        date: candidate.date,
        summary: candidate.summary,
        aiSummary: candidate.aiSummary || '',
        topic: candidate.topic || '',
        relevance: candidate.relevance,
        sourceId: candidate.sourceId,
        sourceName: candidate.sourceName,
        via: candidate.via,
        status: 'new',
        foundAt
      }));
      let merged = [...added, ...findings];
      const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
      merged = merged.filter(finding => !(finding.status === 'dismissed' && Date.parse(finding.foundAt) < cutoff));
      if (merged.length > MAX_FINDINGS) {
        merged.sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || b.foundAt.localeCompare(a.foundAt));
        merged = merged.slice(0, MAX_FINDINGS);
      }
      await this.writeJson('findings.json', merged);

      const important = added.filter(finding => finding.relevance >= 7);
      const summary = {
        startedAt, finishedAt: foundAt, mode,
        sourcesChecked: sourceResults.filter(result => result.ok).length,
        sourcesFailed: sourceResults.filter(result => !result.ok).length,
        newCount: added.length,
        importantCount: important.length,
        scored: Boolean(ai) && !scoringError,
        webSearch: Boolean(webSearch && ai && !searchError),
        searchError,
        scoringError
      };
      const status = await this.getStatus();
      status.lastRun = foundAt;
      if (mode === 'auto') status.lastAutoRun = foundAt;
      status.lastSummary = summary;
      await this.writeJson('status.json', status);
      return { summary, sourceResults, added, important, findings: merged, sources };
    } finally {
      this.running = false;
    }
  }
}

module.exports = { Discovery, DEFAULT_SOURCES, fetchSource, fetchText, stripTags, parseFeed, parsePage, keywordScore, normalizeLink, clip };
