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
