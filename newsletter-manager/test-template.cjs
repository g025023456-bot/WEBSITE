// בדיקת התבנית: מרנדר גיליון מתוכן לדוגמה, מוודא שהבדיקות הטכניות של CLAUDE.md
// עוברות, שה-escape עובד, ושהמבנה הסטטי (פוטר, משבצות, מאסטהד) זהה לגיליון שפורסם.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { renderIssue, contentProblems } = require('./template.cjs');

const content = {
  title: 'כותרת לדוגמה <עם תו מיוחד>',
  sub: 'תיאור קצר "עם מרכאות" ותו & מיוחד.',
  lead: {
    opening: 'פסקת פתיחה אחת.',
    paragraphs: [
      { heading: 'מה הזכות', text: 'טקסט עם **הדגשה** ועוד משפט.' },
      { heading: 'מי זכאי', text: 'משפט שני.' }
    ],
    closing: 'כתבו לנו, נעזור.'
  },
  right: { heading: 'מה מבקשים', text: 'טקסט של זכות השבוע עם **הדגשה**.' },
  dontMiss: ['דגש ראשון.', 'דגש שני.', 'דגש שלישי.'],
  tip: 'טיפ מעשי אחד.'
};

const html = renderIssue({ n: 5, date: '2026-11-09', content });
const problems = contentProblems(html);
assert.deepStrictEqual(problems, [], `בעיות תוכן: ${problems.join(' · ')}`);
assert.ok(html.includes('גיליון 5 · 09.11.2026'), 'מאסטהד');
assert.ok(html.includes('&lt;עם תו מיוחד&gt;'), 'escape בכותרת');
assert.ok(html.includes('content="תיאור קצר &quot;עם מרכאות&quot; ותו &amp; מיוחד."'), 'escape במטא');
assert.ok(html.includes('<strong>הדגשה</strong>'), 'הדגשה');
assert.ok(html.includes('<strong style="color:#562E8C;">מה הזכות.</strong>'), 'כותרת פסקה');
assert.ok(html.includes('og:url" content="https://ho-me.org.il/newsletter/2026-11-09.html"'), 'og:url');
assert.ok(!html.includes('o@ho-me'), 'כתובת');

// המבנה הסטטי זהה לגיליון שפורסם: משווים את הקטע מהמשבצות ועד הסוף, ואת הראש עד ה-<title>.
const published = fs.readFileSync(path.join(__dirname, '..', 'newsletter', '2026-10-14.html'), 'utf8').replace(/\r\n/g, '\n');
const tail = source => source.slice(source.indexOf('<!-- 3 משבצות פעולה'));
assert.strictEqual(tail(html), tail(published), 'הפוטר והמשבצות זהים לגיליון שפורסם');
const styleBlock = source => source.slice(source.indexOf('<style>'), source.indexOf('</style>'));
assert.strictEqual(styleBlock(html), styleBlock(published), 'בלוק ה-style זהה');

// הגנה: קו ארוך ואחוז מזוהים.
assert.ok(contentProblems(html.replace('טיפ מעשי אחד.', 'טיפ — עם 5% הנחה')).length >= 2, 'זיהוי קו ארוך ואחוז');

console.log('TEMPLATE OK', `${html.length} chars`);
