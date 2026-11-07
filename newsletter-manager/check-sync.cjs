// בודק שדף הניהול באתר (admin/) ו-api/lib תואמים בדיוק לקוד הדסקטופ. רץ ב-pre-commit
// וב-npm run check-sync. אם יש פער: npm run build-admin.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const parts = ['discover-core.js', 'ai-core.js', 'template.cjs', 'web-bridge.js', 'renderer.js']
  .map(name => fs.readFileSync(path.join(__dirname, name), 'utf8')).join('\n');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="robots" content="noindex, nofollow">')
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="/admin/styles.css">')
  .replace('<script src="renderer.js" defer></script>', '<script src="/admin/app.js" defer></script>')
  .replace(/src="assets\/mark\.png"/g, 'src="/admin/mark.png"')
  .replace(/^[ \t]*<button id="refreshButton"[^\n]*\n/m, '')
  .replace(/^[ \t]*<button type="button" id="viewOnlyButton"[^\n]*\n/m, '');

const normalize = text => String(text).replace(/\r\n/g, '\n');
const expected = {
  'admin/app.js': parts,
  'admin/index.html': html,
  'admin/styles.css': fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8'),
  'api/lib/discover.cjs': fs.readFileSync(path.join(__dirname, 'discover.cjs'), 'utf8'),
  'api/lib/discover-core.js': fs.readFileSync(path.join(__dirname, 'discover-core.js'), 'utf8'),
  'api/lib/ai-core.js': fs.readFileSync(path.join(__dirname, 'ai-core.js'), 'utf8')
};
const stale = Object.entries(expected).filter(([file, content]) => {
  const target = path.join(root, file);
  return !fs.existsSync(target) || normalize(fs.readFileSync(target, 'utf8')) !== normalize(content);
}).map(([file]) => file);
if (stale.length) {
  console.error(`דף הניהול באתר לא מסונכרן עם קוד הדסקטופ: ${stale.join(', ')}\nהריצו: npm run build-admin`);
  process.exit(1);
}
console.log('admin/ ו-api/lib מסונכרנים עם קוד הדסקטופ.');
