// החלק הטהור של מנוע האיתור, משותף לדסקטופ (Node) ולדף הניהול באתר (דפדפן):
// רשימת ברירת המחדל של המקורות, דירוג לפי מילות מפתח, ונרמול כתובות.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DiscoverCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
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

  const FIRST_RUN_CANDIDATES = 12;
  const MAX_FINDINGS = 500;

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

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (error) { return ''; }
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

  return { DEFAULT_SOURCES, KEYWORDS, FIRST_RUN_CANDIDATES, MAX_FINDINGS, clip, normalizeLink, hostOf, keywordScore };
});

// ליבת ה-AI המשותפת לדסקטופ (Node, דרך ai.cjs) ולדף הניהול באתר (דפדפן, דרך web-bridge.js):
// ההנחיות, הסכמות, בניית הבקשות ועיבוד התשובות. אין כאן קריאות רשת, רק טקסט ולוגיקה.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AiCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MODEL = 'claude-opus-5-5';
  const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
  const PAGE_TEXT_LIMIT = 9000;

  const AUDIENCE = 'הקהל: כ-700 משפחות חרדיות בישראל שמגדלות ילדים עם צרכים מיוחדים (מוגבלות פיזית, שכלית, התפתחותית, אוטיזם, מחלות כרוניות). הם מחפשים זכויות, קצבאות, שירותים, הליכים מול ביטוח לאומי, משרד הרווחה, משרד החינוך, משרד הבריאות, קופות החולים והרשויות המקומיות, וטיפים מעשיים.';

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

  // בלי user_location: קוד המדינה IL לא נתמך בכלי החיפוש; ההקשר הישראלי מגיע מההנחיות והחיפושים בעברית.
  const WEB_SEARCH_TOOL = {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: 10
  };

  function clip(text, max) {
    const value = String(text || '').trim();
    return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
  }

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

  function cleanText(value) {
    return String(value || '')
      .replace(/\s*[—–]\s*/g, ', ')
      .replace(/,\s*,/g, ',')
      .replace(/\s+([,.!?])/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  // מחלץ JSON מתוך תשובה טקסטואלית (כשאין פורמט מובנה, למשל אחרי חיפוש ברשת).
  function extractJson(text) {
    const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidates = [fenced ? fenced[1] : null, String(text)];
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

  // אחרי חיפוש ברשת הטקסט מגיע בכמה בלוקים (ציטוטים חותכים אותו גם באמצע מחרוזת), לכן מחברים בלי מפריד.
  function textOf(content) {
    return (content || []).filter(block => block.type === 'text').map(block => block.text).join('').trim();
  }

  // טקסט הכתבה מתוך דף HTML: בלי ניווט, סקריפטים וטפסים; מעדיף <article> או <main>.
  function extractArticle(html) {
    // אתרי ASP.NET (ביטוח לאומי) עוטפים את כל הדף ב-<form>, לכן מסירים רק שדות קלט ולא את הטופס כולו.
    let body = String(html)
      .replace(/<(script|style|noscript|svg|template|iframe|select|textarea|button)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<input\b[^>]*>/gi, ' ')
      .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');
    const toText = fragment => stripTags(fragment.replace(/<\/(p|div|li|h[1-6]|tr|br|section)>|<br\s*\/?>/gi, '\n'))
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim();
    const main = body.match(/<article\b[\s\S]*?<\/article>/i) || body.match(/<main\b[\s\S]*?<\/main>/i);
    // באתרים כמו ביטוח לאומי ה-<main> מכיל רק כותרת; אז לוקחים את כל הדף.
    const focused = main ? toText(main[0]) : '';
    return focused.length >= 300 ? focused : toText(body);
  }

  /* ---------- דירוג ---------- */

  function scoreRequest(batch, startIndex) {
    const listing = batch.map((item, offset) =>
      `${startIndex + offset + 1}. [${item.sourceName}] ${item.title}${item.date ? ` (${item.date})` : ''}\n   ${item.link}${item.summary ? `\n   ${clip(item.summary, 240)}` : ''}`
    ).join('\n');
    return {
      system: `אתם עורכי התוכן של הניוזלטר השבועי של עמותת "הורה ומיוחד". ${AUDIENCE}\nהמשימה: לדרג פריטים שנאספו מאתרים ומ-RSS לפי מידת החשיבות שלהם לקהל, ולסכם כל פריט במשפט. הציון חייב לשקף תועלת ישירה להורים: זכות חדשה או שהשתנתה, קצבה, הליך, שירות, מועד פתיחת הרשמה, הנחיה רשמית. פריטים שאינם קשורים למוגבלות או לצרכים מיוחדים, מודעות דרושים, גיוס תרומות, פוליטיקה וברכות לחג מקבלים ציון נמוך. בלי סכומים ואחוזים בסיכום.`,
      user: `דרגו את כל ${batch.length} הפריטים הבאים והחזירו שורה לכל פריט לפי מספרו:\n\n${listing}`,
      schema: SCORE_SCHEMA,
      effort: 'medium'
    };
  }

  function applyScores(parsed, results, total) {
    for (const row of (parsed && parsed.items) || []) {
      const position = Number(row.index) - 1;
      if (position < 0 || position >= total || results[position]) continue;
      results[position] = {
        relevance: Math.max(0, Math.min(10, Math.round(Number(row.relevance) || 0))),
        summary: cleanText(clip(row.summary, 220)),
        topic: cleanText(clip(row.topic, 30))
      };
    }
    return results;
  }

  /* ---------- חיפוש ברשת ---------- */

  function searchRequest({ instructions = '', today }) {
    return {
      system: `אתם חוקרי התוכן של הניוזלטר של עמותת "הורה ומיוחד". ${AUDIENCE}\nהמשימה: לאתר ברשת עדכונים חדשים מ-45 הימים האחרונים (היום ${today}) שחשובים לקהל: זכויות וקצבאות (ביטוח לאומי, גמלת ילד נכה, קצבאות, ניידות), חינוך מיוחד (ועדות, סייעות, הסעות, הרשמה), בריאות (התפתחות הילד, סל שיקום, סל תקשורת, קופות חולים), רווחה (משרד הרווחה, נופשונים, מסגרות), הטבות ברשויות, הנחיות ממשלתיות חדשות מאתר gov.il, ופרסומים של ארגוני סיוע בישראל. חפשו בעברית, בכמה חיפושים שונים. העדיפו מקורות רשמיים (btl.gov.il, gov.il, kolzchut.org.il, health.gov.il, education.gov.il) וארגונים מוכרים. אל תמציאו כתובות: כל URL חייב להופיע בתוצאות החיפוש.`,
      user: `חפשו וחזרו עם עד 12 העדכונים החשובים ביותר. ${instructions ? `דגש מיוחד: ${instructions}\n` : ''}בסיום, החזירו אך ורק JSON בצורה: {"items":[{"title":"","url":"","date":"YYYY-MM-DD או ריק","summary":"משפט אחד בעברית בלי סכומים ואחוזים","source":"שם האתר","relevance":0}]}`,
      structureSystem: 'המירו את הטקסט הבא לרשימת פריטים מובנית. אל תוסיפו פריטים שלא מופיעים בטקסט.',
      schema: SEARCH_SCHEMA,
      tool: WEB_SEARCH_TOOL,
      effort: 'medium'
    };
  }

  function normalizeSearchItems(parsed) {
    return ((parsed && parsed.items) || [])
      .filter(item => item && /^https?:\/\//i.test(String(item.url || '')))
      .map(item => ({
        title: cleanText(item.title), link: String(item.url).trim(), date: /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ? item.date : null,
        summary: cleanText(item.summary), source: cleanText(item.source), relevance: Number(item.relevance)
      }));
  }

  /* ---------- ניסוח ---------- */

  function draftRequest({ pages, instructions = '', styleSample = '' }) {
    const usable = pages.filter(page => page.ok);
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
    return { system, user, schema: DRAFT_SCHEMA, effort: 'high' };
  }

  function normalizeDraft(draft, pages) {
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

  // מעבד תשובת מודל בפורמט מובנה: בודק סיבת עצירה ומפענח את ה-JSON.
  function parseStructured(message) {
    if (message.stop_reason === 'refusal') throw new Error('שירות ה-AI סירב לבקשה הזו.');
    if (message.stop_reason === 'max_tokens') throw new Error('התשובה של ה-AI נקטעה. נסו עם פחות פריטים.');
    const text = textOf(message.content);
    try {
      return JSON.parse(text);
    } catch (error) {
      const parsed = extractJson(text);
      if (parsed) return parsed;
      throw new Error('התשובה של ה-AI לא הייתה במבנה הצפוי.');
    }
  }

  return {
    MODEL, FALLBACK_BETA, PAGE_TEXT_LIMIT, AUDIENCE, CONTENT_RULES, DRAFT_SCHEMA, SCORE_SCHEMA, SEARCH_SCHEMA, WEB_SEARCH_TOOL,
    clip, stripTags, cleanText, extractJson, textOf, extractArticle,
    scoreRequest, applyScores, searchRequest, normalizeSearchItems, draftRequest, normalizeDraft, parseStructured
  };
});

// תבנית הגיליון: משכפלת אחד לאחד את מבנה הגיליונות שפורסמו באתר (גרסת אתר, כולל
// תגי OG וסרגל "כל הגיליונות"), ומחליפה רק את התוכן. כל טקסט שמגיע מה-AI עובר
// escape; **הדגשה** הופכת ל-<strong>. אין כאן שום דבר שמשנה מבנה, צבעים או כתובות.
// הקובץ משמש גם בדסקטופ (Node) וגם בדף הניהול באתר (דפדפן, window.NewsletterTemplate).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NewsletterTemplate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function inline(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*/g, '');
}

function prettyDate(date) {
  const [year, month, day] = String(date).split('-');
  return `${day}.${month}.${year}`;
}

function attribute(value) {
  return escapeHtml(String(value ?? '').replace(/\s+/g, ' ').trim());
}

function renderLead(lead) {
  const parts = [];
  if (lead.opening) parts.push(`<p style="margin:0 0 10px 0;">${inline(lead.opening)}</p>`);
  for (const paragraph of lead.paragraphs || []) {
    const heading = paragraph.heading ? `<strong style="color:#562E8C;">${escapeHtml(paragraph.heading)}.</strong> ` : '';
    parts.push(`<p style="margin:0 0 10px 0;">${heading}${inline(paragraph.text)}</p>`);
  }
  if (lead.closing) parts.push(`<p style="margin:0;"><span style="color:#562E8C; font-weight:700;">${inline(lead.closing)}</span></p>`);
  return parts.map(part => `                ${part}`).join('\n');
}

function renderDontMiss(items) {
  return items.map(item => `• ${inline(item)}`).join('<br>\n                    ');
}

// content: { title, sub, lead:{opening, paragraphs:[{heading,text}], closing}, right:{heading,text}, dontMiss:[...], tip }
function renderIssue({ n, date, content }) {
  const dateLabel = prettyDate(date);
  const description = attribute(content.sub);
  const title = attribute(content.title);
  return `<!DOCTYPE html>
<!--
  הורה ומיוחד · הניוזלטר השבועי · גיליון ${n} · ${dateLabel} (גרסת אתר)
-->
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <!-- Google Analytics 4 · מעקב צפיות, מקורות תנועה ולחיצות (המזהה מוגדר בקובץ analytics.js) -->
  <script src="../analytics.js" defer></script>
  <!-- תפריט נגישות (גרסת האתר בלבד; לקוחות מייל מתעלמים מסקריפטים) -->
  <script src="../a11y-widget.js" defer></script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>הורה ומיוחד · הניוזלטר השבועי · גיליון ${n}</title>
  <meta name="description" content="${description}">
  <!-- Open Graph · כרטיס התצוגה כשמשתפים את הקישור בוואטסאפ -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="הורה ומיוחד">
  <meta property="og:locale" content="he_IL">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="https://ho-me.org.il/newsletter/${date}.html">
  <meta property="og:image" content="https://ho-me.org.il/logo-horeh-umeyuhad.webp">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="https://ho-me.org.il/favicon.ico">
  <style>
    .backbar{ max-width:600px; margin:0 auto; padding:14px 16px 0 16px; box-sizing:border-box; }
    .backbar a{ display:inline-block; color:#562E8C; text-decoration:none; font-size:13px; font-weight:700; background:#fff; padding:8px 16px; border-radius:20px; border:1px solid #e3def0; }
    body{ margin:0; padding:0; background-color:#eceaf2; font-family:Arial,'Heebo','Segoe UI',Tahoma,sans-serif; }
    @media only screen and (max-width:640px){
      .email{ width:100% !important; }
      .px{ padding-left:14px !important; padding-right:14px !important; }
      .h-lead{ font-size:23px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#eceaf2; font-family:Arial, 'Heebo', 'Segoe UI', Tahoma, sans-serif;">

  <div class="backbar"><a href="/newsletter/">← כל הגיליונות</a></div>

  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(content.sub)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eceaf2" style="background-color:#eceaf2;">
    <tr>
      <td align="center" style="padding:16px 10px;">
        <table role="presentation" width="100%" class="email" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">

          <!-- מאסטהד -->
          <tr>
            <td class="px" align="center" style="padding:20px 18px 10px 18px;">
              <a href="https://ho-me.org.il/" target="_blank" rel="noopener" style="text-decoration:none;"><img src="https://ho-me.org.il/logo-horeh-umeyuhad.webp" width="170" alt="הורה ומיוחד · ביחד אנחנו חזקים" style="width:170px; max-width:80%; height:auto; display:block; margin:0 auto; border:0; outline:none;"></a>
              <div style="color:#562E8C; font-size:12px; font-weight:800; letter-spacing:0.3px; margin-top:10px;">הניוזלטר השבועי להורים לילדים מיוחדים</div>
              <div style="color:#6f5f96; font-size:12px; font-weight:700; margin-top:3px;">גיליון ${n} · ${dateLabel}</div>
            </td>
          </tr>
          <tr><td class="px" style="padding:0 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="3" bgcolor="#562E8C" style="height:3px; background-color:#562E8C; font-size:0; line-height:3px;">&nbsp;</td></tr></table></td></tr>
          <tr><td class="px" style="padding:2px 18px 0 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="1" bgcolor="#562E8C" style="height:1px; background-color:#562E8C; font-size:0; line-height:1px;">&nbsp;</td></tr></table></td></tr>

          <!-- כתבת השבוע -->
          <tr>
            <td class="px" style="padding:20px 18px 6px 18px;" align="right">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;"><tr><td bgcolor="#562E8C" style="background-color:#562E8C; color:#ffffff; font-size:12px; font-weight:800; padding:4px 12px; border-radius:4px; letter-spacing:0.5px;">כתבת השבוע</td></tr></table>
              <div class="h-lead" style="color:#222222; font-size:25px; font-weight:800; line-height:1.3; margin-bottom:6px;">${escapeHtml(content.title)}</div>
              <div style="color:#6f5f96; font-size:13px; font-weight:600; margin-bottom:14px;">${escapeHtml(content.sub)}</div>
              <div style="color:#333333; font-size:15px; line-height:1.85;">
${renderLead(content.lead || {})}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 18px 8px 18px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="9" height="9" bgcolor="#EA6A4C" style="width:9px; height:9px; background-color:#EA6A4C; border-radius:50%; font-size:0; line-height:9px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="13" height="13" bgcolor="#FFD455" style="width:13px; height:13px; background-color:#FFD455; border-radius:3px; font-size:0; line-height:13px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#562E8C" style="width:11px; height:11px; background-color:#562E8C; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="15" height="15" bgcolor="#1CA6A6" style="width:15px; height:15px; background-color:#1CA6A6; border-radius:4px; font-size:0; line-height:15px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#562E8C" style="width:11px; height:11px; background-color:#562E8C; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="13" height="13" bgcolor="#FFD455" style="width:13px; height:13px; background-color:#FFD455; border-radius:3px; font-size:0; line-height:13px;">&nbsp;</td></tr></table></td><td style="padding:0 3px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="9" height="9" bgcolor="#EA6A4C" style="width:9px; height:9px; background-color:#EA6A4C; border-radius:50%; font-size:0; line-height:9px;">&nbsp;</td></tr></table></td></tr></table>
            </td>
          </tr>
          <!-- זכות השבוע -->
          <tr>
            <td class="px" style="padding:6px 18px;">
              <div style="border:1px solid #ece8f4; border-radius:10px; overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#562E8C" style="background-color:#562E8C; color:#ffffff; font-size:12px; font-weight:800; padding:9px 15px; letter-spacing:0.3px;">זכות השבוע · ${escapeHtml(content.right?.heading || '')}</td></tr></table>
                <div style="padding:15px;" align="right"><div style="color:#444444; font-size:14px; line-height:1.75;">${inline(content.right?.text || '')}</div></div>
              </div>
            </td>
          </tr>
          <!-- לא לפספס -->
          <tr>
            <td class="px" style="padding:6px 18px;">
              <div style="border:1px solid #f3ead0; border-radius:10px; overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#FFD455" style="background-color:#FFD455; color:#3d2a06; font-size:12px; font-weight:800; padding:9px 15px; letter-spacing:0.3px;">&#128204; לא לפספס</td></tr></table>
                <div style="padding:15px;" align="right">
                  <div style="color:#5a4500; font-size:14px; line-height:1.85;">
                    ${renderDontMiss(content.dontMiss || [])}
                  </div>
                </div>
              </div>
            </td>
          </tr>
          <!-- טיפ מהשטח -->
          <tr>
            <td class="px" style="padding:6px 18px;">
              <div style="border:1px solid #f6e0d8; border-radius:10px; overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#EA6A4C" style="background-color:#EA6A4C; color:#3d1405; font-size:12px; font-weight:800; padding:9px 15px; letter-spacing:0.3px;">&#128161; טיפ מהשטח</td></tr></table>
                <div style="padding:15px;" align="right"><div style="color:#444444; font-size:14px; line-height:1.75;">${inline(content.tip || '')}</div></div>
              </div>
            </td>
          </tr>

          <!-- 3 משבצות פעולה · טבלה קבועה של 3 עמודות, שורה אחת גם בנייד -->
          <tr>
            <td class="px" align="center" style="padding:12px 15px 16px 15px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:540px; margin:0 auto; table-layout:fixed;">
                <tr>
                  <td width="33%" valign="top" style="width:33%; padding:0 3px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f1fa" style="background-color:#f4f1fa; border:1px solid #e3def0; border-radius:10px;">
                      <tr><td bgcolor="#f4f1fa" align="center" valign="top" style="background-color:#f4f1fa; padding:10px 4px 10px 4px;">
                        <div style="font-size:17px; line-height:1; margin-bottom:4px;">&#10067;</div>
                        <div style="color:#562E8C; font-size:13px; font-weight:800; line-height:1.25; margin-bottom:3px;">שאלו אותנו</div>
                        <div style="color:#6b6b6b; font-size:12px; line-height:1.35; margin-bottom:8px;">שאלה על זכות?</div>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td bgcolor="#562E8C" align="center" style="background-color:#562E8C; border-radius:14px;"><a href="mailto:a@ho-me.org.il?subject=%D7%A9%D7%90%D7%9C%D7%94%20%D7%9C%D7%9E%D7%93%D7%95%D7%A8%20%D7%A9%D7%90%D7%9C%D7%95%20%D7%90%D7%95%D7%AA%D7%A0%D7%95" target="_blank" rel="noopener" style="display:inline-block; color:#ffffff; text-decoration:none; font-size:12px; font-weight:800; padding:6px 10px; border-radius:14px; line-height:1.2;">לשאלה</a></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                  <td width="33%" valign="top" style="width:33%; padding:0 3px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fff3ef" style="background-color:#fff3ef; border:1px solid #f6e0d8; border-radius:10px;">
                      <tr><td bgcolor="#fff3ef" align="center" valign="top" style="background-color:#fff3ef; padding:10px 4px 10px 4px;">
                        <div style="font-size:17px; line-height:1; margin-bottom:4px;">&#127760;</div>
                        <div style="color:#b03e22; font-size:13px; font-weight:800; line-height:1.25; margin-bottom:3px;">האתר שלנו</div>
                        <div style="color:#6b6b6b; font-size:12px; line-height:1.35; margin-bottom:8px;">בודקי זכאות ומדריכים</div>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td bgcolor="#EA6A4C" align="center" style="background-color:#EA6A4C; border-radius:14px;"><a href="https://ho-me.org.il/" target="_blank" rel="noopener" style="display:inline-block; color:#3d1405; text-decoration:none; font-size:12px; font-weight:800; padding:6px 10px; border-radius:14px; line-height:1.2;">לאתר</a></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                  <td width="33%" valign="top" style="width:33%; padding:0 3px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0fafa" style="background-color:#f0fafa; border:1px solid #d8eded; border-radius:10px;">
                      <tr><td bgcolor="#f0fafa" align="center" valign="top" style="background-color:#f0fafa; padding:10px 4px 10px 4px;">
                        <div style="font-size:17px; line-height:1; margin-bottom:4px;">&#9993;</div>
                        <div style="color:#0d6b6a; font-size:13px; font-weight:800; line-height:1.25; margin-bottom:3px;">קבוצת המייל</div>
                        <div style="color:#6b6b6b; font-size:12px; line-height:1.35; margin-bottom:8px;">עדכונים בין הגיליונות</div>
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td bgcolor="#1CA6A6" align="center" style="background-color:#1CA6A6; border-radius:14px;"><a href="https://groups.google.com/a/ho-me.org.il/g/bs" target="_blank" rel="noopener" style="display:inline-block; color:#06302f; text-decoration:none; font-size:12px; font-weight:800; padding:6px 10px; border-radius:14px; line-height:1.2;">להצטרפות</a></td></tr></table>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- פוטר -->
          <tr>
            <td class="px" bgcolor="#562E8C" style="background-color:#562E8C; padding:20px 18px 24px 18px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:12px;"><tr>
                <td style="padding:0 2px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#EA6A4C" style="width:11px; height:11px; background-color:#EA6A4C; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td>
                <td style="padding:0 2px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#FFD455" style="width:11px; height:11px; background-color:#FFD455; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td>
                <td style="padding:0 2px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#ffffff" style="width:11px; height:11px; background-color:#ffffff; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td>
                <td style="padding:0 2px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="11" height="11" bgcolor="#1CA6A6" style="width:11px; height:11px; background-color:#1CA6A6; border-radius:3px; font-size:0; line-height:11px;">&nbsp;</td></tr></table></td>
              </tr></table>
              <div style="color:#ffffff; font-size:17px; font-weight:800; margin-bottom:2px;">הורה ומיוחד</div>
              <div style="color:#FFD455; font-size:12px; font-weight:700; margin-bottom:10px;">ביחד אנחנו חזקים</div>
              <div style="color:#cbbde8; font-size:12px; line-height:1.8;">
                עמותה רשומה ע״ר 580715282<br>
                בית שמש, פומבדיתא 1 · ירושלים, הצבי 15<br>
                02-5023456 · <a href="mailto:a@ho-me.org.il" style="color:#FFD455; text-decoration:none;">a@ho-me.org.il</a> · <a href="https://ho-me.org.il/" style="color:#FFD455; text-decoration:none;">ho-me.org.il</a>
              </div>
              <div style="margin-top:12px; color:#b8abd8; font-size:12px; line-height:1.6;">
                המידע כללי, אינו כולל סכומים, ואינו תחליף לייעוץ אישי. הסכומים והתנאים מתעדכנים בתחילת כל שנה.<br>
                הדף עוצב לפי תקן ישראלי 5568 (WCAG 2.1 AA). <a href="https://ho-me.org.il/" style="color:#FFD455; text-decoration:underline;">להצהרת הנגישות ולתפריט הנגישות באתר</a><br>
                <a href="https://ho-me.org.il/newsletter/" style="color:#cbbde8;">כל הגיליונות</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;
}

// בדיקות התוכן של CLAUDE.md סעיף 6.8 על גיליון מוכן.
function contentProblems(html) {
  const text = html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const count = pattern => (html.match(pattern) || []).length;
  const problems = [];
  if (/o@ho-me/i.test(html)) problems.push('מופיעה הכתובת o@ho-me.org.il');
  if (/[—–]/.test(text)) problems.push('יש בטקסט קו מפריד ארוך');
  if (/₪|ש["״]ח|\d\s*%|\d[\d,.]*\s*שקל|אחוז/.test(text)) problems.push('נראה שיש בטקסט סכום או אחוז');
  if (/\b(השבוע|עכשיו|לאחרונה|החודש|השנה הזו|לפני החגים)\b/.test(text.replace(/כתבת השבוע|זכות השבוע/g, ''))) problems.push('יש ניסוח תלוי זמן ("השבוע", "עכשיו" וכדומה)');
  if (count(/<tr[\s>]/gi) !== count(/<\/tr>/gi)) problems.push('מספר תגי <tr> ו-</tr> לא שווה');
  if (count(/<td[\s>]/gi) !== count(/<\/td>/gi)) problems.push('מספר תגי <td> ו-</td> לא שווה');
  return problems;
}

return { renderIssue, contentProblems, escapeHtml, prettyDate };
});

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

  // קריאת מקור דרך השרת. אתרים שחוסמים כתובות של חוות שרתים (למשל כל זכות עם Cloudflare)
  // נכשלים כאן אבל נקראים בלי בעיה באפליקציית הדסקטופ, שמגיעה מהמחשב של המשתמש.
  async function fetchSourceViaServer(url) {
    try {
      return await call('fetchSource', { url });
    } catch (error) {
      if (/חוסם|Cloudflare|דחה את הבקשה|לא ענה בזמן/.test(error.message)) {
        throw new Error(`${error.message} החסימה היא כלפי שרת האתר; באפליקציית הדסקטופ המקור נקרא מהמחשב שלכם ועובד.`);
      }
      throw error;
    }
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
          const { kind, items } = await fetchSourceViaServer(source.url);
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
    features: { discovery: true, monitor: false, localKey: false, desktop: false, shortcut: false, openPreview: true },
    openExternal(url) { window.open(url, '_blank', 'noopener'); return Promise.resolve(); },
    diagnostics() { return call('diagnostics'); },
    createShortcut: desktopOnly,
    openPreview(html) {
      // תצוגה בכרטיסייה חדשה בדפדפן.
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return Promise.resolve(true);
    },
    drafts: {
      async list() { const drafts = store.get('drafts', []); return Array.isArray(drafts) ? drafts : []; },
      async save(draft) {
        const drafts = await this.list();
        const index = drafts.findIndex(item => item.id === draft.id);
        const now = new Date().toISOString();
        if (index >= 0) drafts[index] = { ...drafts[index], ...draft, updatedAt: now };
        else drafts.unshift({ ...draft, createdAt: draft.createdAt || now, updatedAt: now });
        return store.set('drafts', drafts.slice(0, 200));
      },
      async remove(id) { return store.set('drafts', (await this.list()).filter(item => item.id !== id)); }
    },
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
        const probe = await fetchSourceViaServer(cleanUrl);
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
          const { kind, items } = await fetchSourceViaServer(source.url);
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
  drafts: [],          // טיוטות שמורות (מקומי)
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
  draftRetryButton: $('draftRetryButton'),
  draftSavedNote: $('draftSavedNote'),
  draftsPanel: $('draftsPanel'),
  draftsList: $('draftsList'),
  draftsCaption: $('draftsCaption'),
  draftsBadge: $('draftsBadge'),
  reviewBanner: $('reviewBanner'),
  reviewText: $('reviewText'),
  reviewNotes: $('reviewNotes'),
  reviewNotesList: $('reviewNotesList'),
  fullPreviewButton: $('fullPreviewButton'),
  openPreviewButton: $('openPreviewButton'),
  previewBackdrop: $('previewBackdrop'),
  fullPreviewFrame: $('fullPreviewFrame'),
  fullPreviewDevice: $('fullPreviewDevice'),
  fullPreviewCaption: $('fullPreviewCaption'),
  emptyScanButton: $('emptyScanButton'),
  aiConnState: $('aiConnState'),
  aiKeyDetails: $('aiKeyDetails'),
  shortcutButton: $('shortcutButton'),
  shortcutStatus: $('shortcutStatus'),
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
    elements.reviewBanner.hidden = true;
    return;
  }
  elements.previewFrame.hidden = false;
  elements.previewEmpty.hidden = true;
  elements.previewFrame.srcdoc = getPreviewHtml(content);
  elements.previewCaption.textContent = `גיליון ${issue.n} · ${prettyDate(issue.date)}`;
  renderReviewBanner(issue);
}

// "איפה אני": גיליון שעדיין לא באתר (חדש או עם טקסט ערוך) מקבל פס הכוונה מעל התצוגה.
function renderReviewBanner(issue) {
  const unpublished = !issue.sourceDate;
  const edited = Boolean(issue.sourceDate && state.editedFiles.has(issue.sourceDate));
  elements.reviewBanner.hidden = !(unpublished || edited);
  if (elements.reviewBanner.hidden) return;
  elements.reviewText.textContent = unpublished
    ? 'הגיליון הזה עדיין לא באתר. בדקו את התצוגה (גם בנייד), ערכו אם צריך, ואז "פרסום לאתר".'
    : 'הטקסט הערוך עדיין לא באתר. כך הוא ייראה אחרי הפרסום. אפשר לשחזר את המקור מהרשימה.';
  const draft = issue.draftId ? state.drafts.find(item => item.id === issue.draftId) : null;
  const notes = draft && draft.notes ? draft.notes : [];
  elements.reviewNotes.hidden = !notes.length;
  elements.reviewNotes.open = false;
  $('reviewNotesSummary').textContent = `לאימות לפני הפרסום (${notes.length} נקודות מהכותב)`;
  elements.reviewNotesList.replaceChildren(...notes.map(note => {
    const item = document.createElement('li');
    item.textContent = note;
    return item;
  }));
}

/* ---------- full preview ---------- */

function selectedIssueContent() {
  const issue = state.issues.find(item => item.date === state.selectedDate);
  return issue ? { issue, content: issueContent(issue) } : { issue: null, content: '' };
}

function openFullPreview() {
  const { issue, content } = selectedIssueContent();
  if (!content) return;
  elements.fullPreviewCaption.textContent = `גיליון ${issue.n} · ${prettyDate(issue.date)}${issue.sourceDate ? '' : ' · טרם פורסם'}`;
  elements.fullPreviewFrame.srcdoc = getPreviewHtml(content);
  elements.previewBackdrop.hidden = false;
}
function setFullDevice(mobile) {
  elements.fullPreviewDevice.classList.toggle('mobile', mobile);
  $('fullDeviceMobile').classList.toggle('active', mobile);
  $('fullDeviceDesktop').classList.toggle('active', !mobile);
}
elements.fullPreviewButton.addEventListener('click', openFullPreview);
$('closePreviewButton').addEventListener('click', () => { elements.previewBackdrop.hidden = true; });
elements.previewBackdrop.addEventListener('click', event => { if (event.target === elements.previewBackdrop) elements.previewBackdrop.hidden = true; });
$('fullDeviceDesktop').addEventListener('click', () => setFullDevice(false));
$('fullDeviceMobile').addEventListener('click', () => setFullDevice(true));
elements.openPreviewButton.addEventListener('click', async () => {
  const { content } = selectedIssueContent();
  if (!content) return;
  try { await window.newsletterApp.openPreview(content); } catch (error) { showToast(error.message, true); }
});

// Esc סוגר את החלון הפתוח (לא באמצע ניסוח).
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!elements.previewBackdrop.hidden) elements.previewBackdrop.hidden = true;
  else if (!elements.settingsBackdrop.hidden) { elements.settingsBackdrop.hidden = true; renderUpdates(); }
  else if (!elements.draftBackdrop.hidden && !elements.draftCloseButton.hidden) elements.draftBackdrop.hidden = true;
  else if (!elements.editorBackdrop.hidden) closeEditor();
});

/* ---------- drafts (saved locally, survive reloads) ---------- */

async function loadDrafts() {
  if (!window.newsletterApp.drafts) return;
  try {
    state.drafts = await window.newsletterApp.drafts.list();
  } catch (error) {
    state.drafts = [];
  }
  renderDrafts();
}

async function saveDraftRecord(draft) {
  state.drafts = await window.newsletterApp.drafts.save(draft);
  renderDrafts();
  return state.drafts.find(item => item.id === draft.id);
}

async function setDraftStatus(id, status, patch = {}) {
  if (!id) return;
  const draft = state.drafts.find(item => item.id === id);
  if (!draft || (draft.status === status && !Object.keys(patch).length)) return;
  await saveDraftRecord({ ...draft, ...patch, status });
}

function draftStatusLabel(status) {
  return { draft: 'ממתינה לבדיקה', added: 'ברשימה · לפרסום', published: 'פורסמה', scheduled: 'עתידית' }[status] || status;
}

function renderDrafts() {
  const drafts = state.drafts || [];
  const waiting = drafts.filter(draft => draft.status === 'draft');
  elements.draftsBadge.hidden = waiting.length === 0;
  elements.draftsBadge.textContent = String(waiting.length);
  elements.draftsPanel.hidden = drafts.length === 0 || !state.connected;
  elements.draftsCaption.textContent = waiting.length ? `${waiting.length} ממתינות לבדיקה` : 'כל הטיוטות טופלו';
  elements.draftsList.replaceChildren();
  const visible = [...drafts].sort((a, b) => (a.status === 'draft' ? 0 : a.status === 'added' ? 1 : 2) - (b.status === 'draft' ? 0 : b.status === 'added' ? 1 : 2) || String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 8);
  for (const draft of visible) {
    const item = document.createElement('div');
    item.className = 'draft-item';
    const main = document.createElement('div');
    main.style.minWidth = '0';
    main.innerHTML = `<div class="draft-meta"><span class="draft-status ${escapeHtml(draft.status)}">${draftStatusLabel(draft.status)}</span><span>נוצרה ${escapeHtml(relativeTime(draft.createdAt))}</span>${draft.findingTitles && draft.findingTitles.length ? `<span>מתוך: ${escapeHtml(draft.findingTitles.slice(0, 2).join(' · '))}</span>` : ''}</div><div class="draft-title">${escapeHtml(draft.title)}</div>`;
    const actions = document.createElement('div');
    actions.className = 'draft-actions';
    const button = (label, handler, danger = false) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `mini-button${danger ? ' danger' : ''}`;
      element.textContent = label;
      element.addEventListener('click', handler);
      return element;
    };
    if (draft.status === 'draft' && state.canWrite) actions.append(button('לבדיקה ולפרסום', () => openDraftForReview(draft)));
    if (draft.status === 'added') actions.append(button('הצגה', () => { const issue = state.issues.find(i => i.draftId === draft.id); if (issue) selectIssue(issue); }));
    actions.append(button('תצוגה', () => previewDraft(draft)));
    actions.append(button('הורדה', () => window.newsletterApp.saveFile({ name: `${draft.date}.html`, content: draft.html }).catch(error => showToast(error.message, true))));
    if (draft.status !== 'added') actions.append(button('מחיקה', async () => {
      if (!window.confirm(`למחוק את הטיוטה "${draft.title}"?`)) return;
      state.drafts = await window.newsletterApp.drafts.remove(draft.id);
      renderDrafts();
    }, true));
    item.append(main, actions);
    elements.draftsList.append(item);
  }
}

function previewDraft(draft) {
  elements.previewFrame.hidden = false;
  elements.previewEmpty.hidden = true;
  elements.previewFrame.srcdoc = getPreviewHtml(draft.html);
  elements.previewCaption.textContent = `טיוטה · ${draft.title}`;
  elements.reviewBanner.hidden = false;
  elements.reviewText.textContent = draft.status === 'draft' ? 'טיוטה שמורה. "לבדיקה ולפרסום" מוסיף אותה לרשימת הגיליונות.' : `טיוטה במצב: ${draftStatusLabel(draft.status)}.`;
  elements.reviewNotes.hidden = !(draft.notes && draft.notes.length);
  elements.reviewNotes.open = false;
  $('reviewNotesSummary').textContent = `לאימות לפני הפרסום (${(draft.notes || []).length} נקודות מהכותב)`;
  elements.reviewNotesList.replaceChildren(...(draft.notes || []).map(note => { const li = document.createElement('li'); li.textContent = note; return li; }));
}

function openDraftForReview(draft) {
  if (!state.canWrite) {
    showToast('להוספה לרשימה צריך להתחבר עם הרשאת ניהול.', true);
    return;
  }
  setView('issues');
  openEditor(null, {
    date: draft.date,
    title: draft.title,
    sub: draft.sub,
    html: draft.html,
    aiDraft: { id: draft.id, n: draft.n, notes: draft.notes || [], problems: draft.problems || [] }
  });
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
  // תקין = סימן אחד וזהו. רק בעיה מקבלת הסבר.
  const rows = [];
  if (result.github && result.github.ok && result.github.push) {
    rows.push('<div class="row ok"><span class="state-dot"></span>✓ חיבור לאתר תקין</div>');
  } else if (result.github && result.github.ok) {
    rows.push('<div class="row warn"><span class="state-dot"></span>אין הרשאת כתיבה לאתר. פרסום ייכשל.</div>');
    showToast('לאסימון ה-GitHub ב-Vercel אין הרשאת כתיבה (צריך Contents: Read and write).', true);
  } else {
    rows.push(`<div class="row warn"><span class="state-dot"></span>${escapeHtml(result.github ? result.github.error : 'החיבור לאתר לא נבדק')}</div>`);
  }
  if (result.ai && !result.ai.configured && !(window.newsletterApp.features || {}).localKey) {
    rows.push('<div class="row warn"><span class="state-dot"></span>AI לא מוגדר באתר</div>');
  }
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
        if (state.editedFiles.has(issue.sourceDate)) {
          const revert = document.createElement('button');
          revert.className = 'mini-button';
          revert.type = 'button';
          revert.textContent = 'שחזור המקור';
          revert.title = 'ביטול עריכת הטקסט של הגיליון הזה בלבד';
          revert.addEventListener('click', () => revertTextEdit(issue));
          actions.append(revert);
        }
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
  const hasContent = Boolean(issue) && Boolean(issueContent(issue));
  elements.fullPreviewButton.disabled = !hasContent || editing;
  elements.openPreviewButton.disabled = !hasContent || editing;
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

function recomputeDirty() {
  setDirty(state.issues.some(item => !item.sourceDate) || state.editedFiles.size > 0 || state.deletedDates.size > 0 || state.orderChanged === true);
}

function dropNewIssue(issue) {
  if (state.textEditing) {
    showToast('סיימו או בטלו קודם את עריכת הטקסט.', true);
    return;
  }
  const hasDraft = Boolean(issue.draftId);
  if (!window.confirm(`להסיר את "${issue.title}" מהרשימה?${hasDraft ? ' הטיוטה נשארת שמורה תחת "טיוטות".' : ' הגיליון לא פורסם ולא יישמר.'}`)) return;
  state.issues = state.issues.filter(item => item !== issue);
  state.pendingFiles.delete(issue.date);
  if (hasDraft) setDraftStatus(issue.draftId, 'draft');
  recomputeDirty();
  render();
}

function revertTextEdit(issue) {
  if (state.textEditing) {
    showToast('סיימו או בטלו קודם את עריכת הטקסט.', true);
    return;
  }
  if (!window.confirm(`לשחזר את הטקסט המקורי של "${issue.title}"? העריכה שלא פורסמה תימחק.`)) return;
  state.editedFiles.delete(issue.sourceDate);
  state.textCache.clear();
  recomputeDirty();
  render();
  selectIssue(issue);
  showToast('הטקסט המקורי שוחזר.');
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
    if (issue.draftId) setDraftStatus(issue.draftId, 'added', { html });
  }
  state.textEditing = null;
  state.textCache.clear();
  setDirty(true);
  render();
  renderPreview(issue);
  showToast('העריכה נשמרה. היא תעלה לאתר בלחיצה על "פרסום לאתר".');
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
  state.orderChanged = true;
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
    ? 'ברירת המחדל: יום שני הקרוב. ודאו שלא חג או צום. המאסטהד מתעדכן לפי התאריך.'
    : 'התאריך בארכיון ובשם הקובץ. תוכן ה-HTML נשאר כפי שהועלה.';
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
  state.orderChanged = false;
  state.loadedFiles = new Map();
  state.selectedDate = state.issues[0]?.date || null;
  setDirty(false);
  // טיוטות שהיו ברשימה ולא פורסמו חוזרות למצב "ממתינה לבדיקה".
  await loadDrafts();
  for (const draft of state.drafts.filter(item => item.status === 'added')) await setDraftStatus(draft.id, 'draft');
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
    const draftId = state.draftMeta ? state.draftMeta.id : null;
    if (elements.scheduleCheck.checked) {
      window.newsletterApp.scheduleAdd({ date, title, sub, html })
        .then(entries => {
          state.scheduled = entries;
          state.importedHtml = null;
          state.draftMeta = null;
          if (draftId) setDraftStatus(draftId, 'scheduled', { date, title, sub, html });
          closeEditor();
          renderScheduled();
          showToast(`נשמר כגיליון עתידי ל-${prettyDate(date)}. ביום היעד תופיע כאן התראה לפרסום.`);
        })
        .catch(error => { elements.editorError.textContent = cleanError(error.message); });
      return;
    }
    state.issues.unshift({ n: nextNumber, date, title, sub, sourceDate: null, draftId });
    state.pendingFiles.set(date, html);
    state.importedHtml = null;
    state.selectedDate = date;
    if (draftId) {
      state.draftMeta = null;
      setDraftStatus(draftId, 'added', { date, title, sub, html, n: nextNumber });
      showToast('הטיוטה ברשימה. בדקו אותה בתצוגה, ערכו אם צריך, ואז "פרסום לאתר".');
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
    const publishedDrafts = kept.filter(issue => !issue.sourceDate && issue.draftId).map(issue => issue.draftId);
    const result = await window.newsletterApp.save({
      headSha: state.headSha,
      issues: kept.map(({ n, date, title, sub, sourceDate }) => ({ n, date, title, sub, sourceDate })),
      newFiles,
      editedFiles
    });
    for (const id of publishedDrafts) await setDraftStatus(id, 'published');
    await loadData(result);
    setFlowStep(3, true);
    showToast('פורסם. האתר מתעדכן תוך דקה-שתיים. את המייל משגרים ברב מסר.');
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

function setFlowStep() {
  if (state.updates.loaded) updateFlow();
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
    elements.aiChip.textContent = '✓ AI מחובר';
    elements.aiChip.title = u.ai.source === 'local' ? 'מפתח שמור במחשב הזה' : 'מפתח מהגדרות האתר';
    elements.aiChip.className = 'ai-chip on';
  } else if (!state.canWrite) {
    elements.aiChip.textContent = 'AI: צריך להתחבר';
    elements.aiChip.title = 'המפתח נטען מהאתר אחרי התחברות';
    elements.aiChip.className = 'ai-chip off';
  } else {
    elements.aiChip.textContent = 'AI לא מחובר';
    elements.aiChip.title = 'בלי AI הדירוג לפי מילות מפתח, ואין ניסוח. פרטים בהגדרות.';
    elements.aiChip.className = 'ai-chip off';
  }
  renderFindings();
  renderSources();
  renderSourcesFull();
  const newCount = u.findings.filter(finding => finding.status === 'new' && finding.relevance >= 7).length;
  elements.updatesBadge.hidden = newCount === 0;
  elements.updatesBadge.textContent = String(newCount);
  updateFlow();
  updateBars();
}

// פס השלבים משקף את המצב בפועל וגם מנווט: 1 סריקה, 2 ממצאים, 3 גיליונות.
function updateFlow() {
  const u = state.updates;
  const newFindings = u.findings.filter(finding => finding.status === 'new').length;
  const waitingDrafts = (state.drafts || []).filter(draft => draft.status === 'draft' || draft.status === 'added').length;
  const last = u.status.lastRun ? `נסרק ${relativeTime(u.status.lastRun)}` : 'עדיין לא נסרק';
  $('flowStep1Text').textContent = newFindings ? `${last} · ${newFindings} ממצאים חדשים` : last;
  $('flowStep2Text').textContent = u.selected.size ? `נבחרו ${u.selected.size} · לחצו "ניסוח גיליון"` : 'מסמנים עדכונים ולוחצים "ניסוח"';
  $('flowStep3Text').textContent = waitingDrafts ? `${waitingDrafts} טיוטות ממתינות בגיליונות` : 'בגיליונות: בודקים, עורכים, מפרסמים';
  const step = waitingDrafts ? 3 : (newFindings ? 2 : 1);
  [1, 2, 3].forEach(n => {
    const element = $(`flowStep${n}`);
    element.classList.toggle('active', n === step);
    element.classList.toggle('done', n < step);
  });
}
document.querySelectorAll('.flow-step').forEach(step => {
  step.addEventListener('click', () => {
    const n = Number(step.dataset.step);
    if (n === 1) runScan();
    else if (n === 2) elements.findingsList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else setView('issues');
  });
});
elements.emptyScanButton.addEventListener('click', runScan);

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
    bits.push(summary.newCount ? `${summary.newCount} חדשים, ${summary.importantCount} חשובים` : 'אין חדש מאז הסריקה הקודמת');
    if (summary.sourcesFailed) bits.push(`${summary.sourcesFailed} מקורות לא נענו (מסומנים ברשימה)`);
    showToast(`${bits.join(' · ')}.`, false);
    if (summary.scoringError) showToast(`הדירוג עם AI לא הצליח, דורג לפי מילות מפתח. ${summary.scoringError}`, true);
    else if (summary.searchError) showToast(`החיפוש ברשת לא הצליח: ${summary.searchError}`, true);
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
    showToast(elements.monitorToggle.checked ? '✓ מעקב אוטומטי פעיל. תקבלו הודעה כשיימצא חומר חשוב.' : 'המעקב האוטומטי כבוי.');
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
    const features = window.newsletterApp.features || {};
    showToast(features.localKey
      ? 'AI לא מחובר. התחברו לאתר, או הזינו מפתח בהגדרות.'
      : (state.canWrite ? 'AI לא מוגדר באתר (ANTHROPIC_API_KEY ב-Vercel).' : 'התחברו קודם, ה-AI נטען מהאתר.'), true);
    if (features.localKey) openSettings();
    return;
  }
  state.pendingDraft = null;
  elements.draftTitle.textContent = 'כותבים את הגיליון...';
  elements.draftResult.hidden = true;
  elements.draftResult.innerHTML = '';
  elements.draftSavedNote.hidden = true;
  elements.draftCloseButton.hidden = true;
  elements.draftRetryButton.hidden = true;
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
    const findingTitles = ids.map(id => (u.findings.find(finding => finding.id === id) || {}).title).filter(Boolean);
    const record = await saveDraftRecord({
      id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'draft',
      title: result.draft.title, sub: result.draft.sub, subject: result.draft.subject,
      date: result.date, n: result.n, html: result.html,
      notes: result.draft.editorNotes || [], problems: result.problems || [],
      findingIds: ids, findingTitles, instructions
    });
    state.pendingDraft = { ...result, id: record.id, findingIds: ids };
    elements.draftSavedNote.hidden = false;
    elements.draftRetryButton.hidden = false;
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
    elements.draftOpenButton.textContent = state.canWrite ? 'לבדיקה ולפרסום' : 'הורדה כקובץ HTML';
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
  const pending = state.pendingDraft;
  if (!pending) return;
  elements.draftBackdrop.hidden = true;
  elements.draftInstructions.value = '';
  if (!state.canWrite) {
    try {
      const saved = await window.newsletterApp.saveFile({ name: `${pending.date}.html`, content: pending.html });
      if (saved) showToast(`נשמר: ${saved}. הטיוטה נשארת גם תחת "טיוטות".`);
    } catch (error) {
      showToast(error.message, true);
    }
    return;
  }
  const record = state.drafts.find(item => item.id === pending.id);
  if (record) openDraftForReview(record);
});

// ניסוח מחדש: אותם עדכונים, הנחיות אחרות.
elements.draftRetryButton.addEventListener('click', () => {
  const pending = state.pendingDraft;
  elements.draftBackdrop.hidden = true;
  if (pending && pending.findingIds) {
    for (const id of pending.findingIds) if (state.updates.findings.some(finding => finding.id === id)) state.updates.selected.add(id);
    state.updates.filter = 'all';
    document.querySelectorAll('.filter-chips .chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all'));
    renderFindings();
    updateBars();
  }
  elements.draftInstructions.focus();
  showToast('שנו את ההנחיות ולחצו שוב "ניסוח גיליון". הטיוטה הקודמת נשארת שמורה.');
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
  const features = window.newsletterApp.features || {};
  if (u.ai.available) {
    elements.aiConnState.textContent = '✓ מחובר';
    elements.aiConnState.className = 'conn-state ok';
    elements.aiConnState.title = u.ai.source === 'local' ? 'מפתח שמור במחשב הזה' : 'מפתח מהגדרות האתר';
  } else {
    elements.aiConnState.textContent = features.localKey ? 'לא מחובר. התחברו לאתר, או הזינו מפתח למטה.' : (state.canWrite ? 'לא מוגדר באתר. מנהל האתר מגדיר ANTHROPIC_API_KEY ב-Vercel.' : 'התחברו לאתר כדי לחבר את ה-AI.');
    elements.aiConnState.className = 'conn-state off';
    elements.aiConnState.title = '';
  }
  elements.aiKeyDetails.hidden = !features.localKey;
  elements.aiKeyDetails.open = features.localKey && !u.ai.available;
  $('aiKeySummary').textContent = u.ai.source === 'local' ? 'החלפת המפתח השמור' : 'הזנת מפתח משלכם';
  elements.shortcutStatus.textContent = '';
  elements.settingsError.textContent = '';
  elements.settingsBackdrop.hidden = false;
}

elements.shortcutButton.addEventListener('click', async () => {
  try {
    const result = await window.newsletterApp.createShortcut();
    elements.shortcutStatus.textContent = result.ok ? '✓ נוצר בשולחן העבודה' : (result.reason || 'לא נוצר');
  } catch (error) {
    elements.shortcutStatus.textContent = cleanError(error.message);
  }
});
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
    elements.aiKeyStatus.textContent = key ? '✓ נשמר' : 'המפתח המקומי נמחק.';
    elements.aiConnState.textContent = state.updates.ai.available ? '✓ מחובר' : 'לא מחובר';
    elements.aiConnState.className = `conn-state ${state.updates.ai.available ? 'ok' : 'off'}`;
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
    elements.aiKeyStatus.textContent = `✓ תקין (${result.model})`;
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
  loadDrafts();
  if (features.discovery) {
    elements.navUpdates.hidden = false;
    elements.navSources.hidden = false;
    if (!features.monitor) {
      // דף הניהול באתר: אין מעקב ברקע ואין הודעות Windows; שאר המנוע זהה.
      $('monitorRow').hidden = true;
      $('monitorWebNote').hidden = false;
      $('settingsMonitorSection').hidden = true;
      $('settingsWindowsSection').hidden = true;
      $('sourcesWebNote').hidden = false;
    }
    if (!features.localKey) elements.aiKeyDetails.hidden = true;
    if (!features.shortcut) elements.shortcutButton.parentElement.hidden = true;
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
