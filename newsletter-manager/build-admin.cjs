// בונה את דף הניהול שבאתר מתוך קוד הדסקטופ: admin/app.js = web-bridge.js +
// renderer.js, ומעתיק את styles.css. להריץ אחרי כל שינוי בממשק.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const bridge = fs.readFileSync(path.join(__dirname, 'web-bridge.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
fs.writeFileSync(path.join(root, 'admin', 'app.js'), `${bridge}\n${renderer}`, 'utf8');
fs.copyFileSync(path.join(__dirname, 'styles.css'), path.join(root, 'admin', 'styles.css'));
console.log('admin/app.js + admin/styles.css updated');
