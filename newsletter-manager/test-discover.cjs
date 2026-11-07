// בדיקת מנוע האיתור מול המקורות האמיתיים (בלי AI): כל מקור ברירת מחדל נקרא,
// מריצים סריקה ראשונה ושנייה בתיקייה זמנית, ובודקים את הדירוג לפי מילות מפתח.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Discovery, DEFAULT_SOURCES, fetchSource, keywordScore, parseFeed, parsePage } = require('./discover.cjs');

(async () => {
  // פרסרים על קלט קבוע
  const feed = parseFeed(`<rss><channel><item><title>קצבת ילד נכה &#8211; עדכון</title><link>https://x.org/a?utm_source=rss</link><pubDate>Mon, 02 Nov 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>תיאור <b>קצר</b></p>]]></description></item></channel></rss>`, 'https://x.org/');
  assert.strictEqual(feed.length, 1);
  assert.strictEqual(feed[0].title, 'קצבת ילד נכה – עדכון');
  assert.strictEqual(feed[0].date, '2026-11-02');
  assert.strictEqual(feed[0].summary, 'תיאור קצר');
  const page = parsePage(`<html><body><nav><a href="/x">קישור ניווט ארוך מאוד בתפריט</a></nav><div><a href="/news/1.aspx">01.11.2026 הודעה חשובה להורים לילדים עם מוגבלות</a><a href="https://other.com/p">קישור חיצוני ארוך לאתר אחר</a><a href="/short">קצר</a></div></body></html>`, 'https://site.gov.il/news/');
  assert.strictEqual(page.length, 1, JSON.stringify(page));
  assert.strictEqual(page[0].date, '2026-11-01');
  assert.strictEqual(page[0].title, 'הודעה חשובה להורים לילדים עם מוגבלות');
  assert.ok(keywordScore({ title: 'גמלת ילד נכה: שינוי בהליך הוועדה' }) >= 7);
  assert.ok(keywordScore({ title: 'דרושה מזכירה למשרד' }) <= 2);
  console.log('PARSERS OK');

  // מקורות אמיתיים
  let okCount = 0;
  for (const source of DEFAULT_SOURCES) {
    const started = Date.now();
    try {
      const { kind, items } = await fetchSource(source);
      okCount += items.length > 0 ? 1 : 0;
      console.log(`${items.length > 0 ? 'OK ' : 'EMPTY'} ${source.name} [${kind}] ${items.length} items, ${Date.now() - started}ms · ${items[0] ? items[0].title.slice(0, 60) : ''}`);
    } catch (error) {
      console.log(`FAIL ${source.name}: ${error.message}`);
    }
  }
  assert.ok(okCount >= 5, 'לפחות חמישה מקורות ברירת מחדל מחזירים פריטים');

  // סריקה ראשונה ושנייה
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ho-me-discover-'));
  const discovery = new Discovery({ dataDir });
  const sources = await discovery.getSources();
  for (const source of sources) source.enabled = ['btl-news', 'kesher'].includes(source.id);
  await discovery.saveSources(sources);
  const progress = [];
  const first = await discovery.run({ onProgress: event => progress.push(event.stage) });
  console.log('FIRST RUN', JSON.stringify(first.summary));
  assert.ok(first.added.length > 0, 'סריקה ראשונה מוסיפה ממצאים');
  assert.ok(first.added.every(finding => typeof finding.relevance === 'number' && finding.status === 'new'));
  assert.ok(progress.includes('source'));
  const second = await discovery.run({});
  console.log('SECOND RUN', JSON.stringify(second.summary));
  assert.strictEqual(second.added.length, 0, 'סריקה שנייה מיד אחרי הראשונה לא מוצאת חדשים');
  const findings = await discovery.getFindings();
  assert.strictEqual(findings.length, first.added.length);
  await discovery.setFindingStatus(findings[0].id, 'dismissed');
  assert.strictEqual((await discovery.getFindings())[0].status, 'dismissed');

  // הוספת מקור והסרה
  const extraUrl = 'https://www.kolzchut.org.il/he/%D7%97%D7%99%D7%A0%D7%95%D7%9A_%D7%9E%D7%99%D7%95%D7%97%D7%93';
  const added = await discovery.addSource({ name: 'כל זכות · חינוך מיוחד', url: extraUrl });
  assert.ok(added.probeCount > 0);
  await assert.rejects(discovery.addSource({ name: 'כפול', url: extraUrl }), /כבר ברשימה/);
  await assert.rejects(discovery.addSource({ name: 'שבור', url: 'https://nonexistent-host.ho-me.invalid/' }));
  const remaining = await discovery.removeSource(added.sources[added.sources.length - 1].id);
  assert.strictEqual(remaining.length, sources.length);
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('DISCOVERY OK');
})().catch(error => { console.error('DISCOVER TEST FAILED:', error); process.exit(1); });
