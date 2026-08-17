#!/usr/bin/env node
/* ============================================================
   פרסום גיליון ניוזלטר · פקודה אחת
   ------------------------------------------------------------
   שימוש:
       node publish.js <נתיב-לקובץ-הגיליון>

   דוגמה:
       node publish.js ../../ממתינים/2026-08-10.html

   מה זה עושה אוטומטית:
     1. מעתיק את הגיליון לתיקייה בשם מתוארך  (2026-08-10.html)
     2. דורס את latest.html  → הקישור הקבוע שמשותף בוואטסאפ מתעדכן מיד
     3. מוסיף שורה בראש newsletter-data.js → דף הארכיון מתעדכן לבד
     4. מוריד אוטומטית את התגית "הגיליון האחרון" מהגיליון הקודם

   אופציונלי — לדרוס כותרת/תיאור שנקראו מהקובץ:
       node publish.js <קובץ> --title "כותרת" --sub "תיאור"

   בדיקה בלי לשנות כלום:
       node publish.js <קובץ> --dry
   ============================================================ */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const DATA = path.join(DIR, 'newsletter-data.js');
const LATEST = path.join(DIR, 'latest.html');

// ---------- קריאת ארגומנטים ----------
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) {
  console.error('\n  שימוש:  node publish.js <נתיב-לקובץ-הגיליון>  [--title "..."] [--sub "..."] [--dry]\n');
  process.exit(1);
}
const srcArg = argv[0];
const flag = (name) => { const i = argv.indexOf('--' + name); return i > -1 ? argv[i + 1] : null; };
const DRY = argv.includes('--dry');

const src = path.resolve(process.cwd(), srcArg);
if (!fs.existsSync(src)) { console.error('\n  ✗ לא נמצא הקובץ: ' + src + '\n'); process.exit(1); }

const html = fs.readFileSync(src, 'utf8');

// ---------- תאריך: משם הקובץ, אחרת היום ----------
const m = path.basename(src).match(/(\d{4}-\d{2}-\d{2})/);
const date = m ? m[1] : new Date().toISOString().slice(0, 10);

// ---------- כותרת ותיאור: מתוך תגי הקובץ ----------
const pick = (re) => { const r = html.match(re); return r ? r[1].trim() : null; };
const clean = (s) => s ? s.replace(/\s+/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : null;

let title = flag('title') || clean(
  pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
  pick(/<title>([\s\S]*?)<\/title>/i)
);
let sub = flag('sub') || clean(
  pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
  pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
) || '';

// ניקוי סיומת מותג מהכותרת ("... · הורה ומיוחד")
if (title) title = title.replace(/\s*[·|–-]\s*הורה ומיוחד\s*$/, '').trim();
if (!title) { console.error('\n  ✗ לא הצלחתי לזהות כותרת. הוסיפו --title "הכותרת"\n'); process.exit(1); }

// ---------- קריאת הרשימה (רק גוף המערך, בלי ההערות שלמעלה) ----------
let data = fs.readFileSync(DATA, 'utf8');
const anchor = 'window.NEWSLETTER_ISSUES = [';
const at = data.indexOf(anchor);
if (at === -1) {
  console.error('\n  ✗ מבנה newsletter-data.js השתנה — לא מצאתי את הרשימה.\n');
  process.exit(1);
}
const body = data.slice(at + anchor.length);   // רק מהרשימה והלאה

// ---------- מספר גיליון הבא ----------
const nums = [...body.matchAll(/\bn\s*:\s*(\d+)/g)].map(x => +x[1]);
const nextN = nums.length ? Math.max(...nums) + 1 : 1;

// ---------- כבר קיים? ----------
if (new RegExp("date:\\s*'" + date + "'").test(body)) {
  console.error(`\n  ✗ הגיליון בתאריך ${date} כבר קיים ברשימה. לא שיניתי כלום.\n`);
  process.exit(1);
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const line = `  { n:${nextN}, date:'${date}', title:'${esc(title)}', sub:'${esc(sub)}' },`;

// ---------- סיכום ----------
console.log('\n  ── פרסום גיליון ' + nextN + ' ──');
console.log('  תאריך :  ' + date);
console.log('  כותרת :  ' + title);
console.log('  תיאור :  ' + (sub || '(ריק)'));
console.log('  מקור  :  ' + src);

if (DRY) { console.log('\n  [--dry] בדיקה בלבד — לא שונה דבר.\n'); process.exit(0); }

// ---------- ביצוע ----------
// 1+2. עותק מתוארך + דריסת latest
const dated = path.join(DIR, date + '.html');
fs.copyFileSync(src, dated);
fs.copyFileSync(src, LATEST);

// 3. הוספת השורה בראש הרשימה
data = data.slice(0, at + anchor.length) + '\n' + line + data.slice(at + anchor.length);
fs.writeFileSync(DATA, data, 'utf8');

console.log('\n  ✓ נוצר   ' + path.basename(dated));
console.log('  ✓ עודכן  latest.html   (הקישור הקבוע לוואטסאפ)');
console.log('  ✓ עודכן  newsletter-data.js');
console.log('\n  נשאר רק:  git add -A && git commit -m "ניוזלטר ' + date + '" && git push\n');
