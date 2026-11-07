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
