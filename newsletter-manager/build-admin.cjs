// בונה את דף הניהול שבאתר מתוך קוד הדסקטופ: admin/app.js = web-bridge.js +
// renderer.js, ומעתיק את styles.css. להריץ אחרי כל שינוי בממשק.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const bridge = fs.readFileSync(path.join(__dirname, 'web-bridge.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
fs.writeFileSync(path.join(root, 'admin', 'app.js'), `${bridge}\n${renderer}`, 'utf8');
fs.copyFileSync(path.join(__dirname, 'styles.css'), path.join(root, 'admin', 'styles.css'));
fs.copyFileSync(path.join(__dirname, 'assets', 'mark.png'), path.join(root, 'admin', 'mark.png'));

// admin/index.html נגזר מ-index.html של הדסקטופ: נתיבים מוחלטים, noindex, ובלי כפתורים שקיימים רק בדסקטופ.
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="robots" content="noindex, nofollow">')
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="/admin/styles.css">')
  .replace('<script src="renderer.js" defer></script>', '<script src="/admin/app.js" defer></script>')
  .replace(/src="assets\/mark\.png"/g, 'src="/admin/mark.png"')
  .replace(/^[ \t]*<button id="refreshButton"[^\n]*\n/m, '')
  .replace(/^[ \t]*<button type="button" id="viewOnlyButton"[^\n]*\n/m, '');
fs.writeFileSync(path.join(root, 'admin', 'index.html'), html, 'utf8');
console.log('admin/app.js + admin/styles.css + admin/index.html + admin/mark.png updated');
