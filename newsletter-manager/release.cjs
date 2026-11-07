// שחרור גרסה בפקודה אחת (npm run release): בונה את דף הניהול באתר מאותו קוד, אורז את
// אפליקציית הדסקטופ עם האייקון, ויוצר ZIP. כך האתר (אחרי git push) והדסקטופ תמיד זהים.
// אם האפליקציה הארוזה רצה כרגע (התיקייה נעולה), הבנייה נכתבת ל-dist/new.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const here = __dirname;
const dist = path.join(here, 'dist');
const APP_DIR = 'NewsletterManager-win32-x64';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', cwd: here, ...options });
  if (result.status !== 0) {
    console.error(`\nנכשל: ${command} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
}

function folderLocked(folder) {
  if (!fs.existsSync(folder)) return false;
  try {
    const probe = `${folder}-probe-${Date.now()}`;
    fs.renameSync(folder, probe);
    fs.renameSync(probe, folder);
    return false;
  } catch (error) {
    return true;
  }
}

(async () => {
  console.log('1/3 דף הניהול באתר (admin/ + api/lib) מאותו קוד...');
  run('node', ['build-admin.cjs']);

  const locked = folderLocked(path.join(dist, APP_DIR));
  const out = locked ? path.join(dist, 'new') : dist;
  if (locked) console.log('האפליקציה הארוזה רצה כרגע, הבנייה תיכתב ל-dist\\new (סגרו את האפליקציה והעבירו את התיקייה).');
  if (!locked && fs.existsSync(path.join(dist, 'new'))) fs.rmSync(path.join(dist, 'new'), { recursive: true, force: true });

  console.log('2/3 אריזת אפליקציית הדסקטופ...');
  const packagerModule = await import('@electron/packager');
  const packager = packagerModule.packager || packagerModule.default;
  await packager({
    dir: here,
    name: 'NewsletterManager',
    platform: 'win32',
    arch: 'x64',
    out,
    overwrite: true,
    icon: path.join(here, 'assets', 'icon.ico'),
    appCopyright: 'הורה ומיוחד',
    win32metadata: { ProductName: 'ניהול הניוזלטרים · הורה ומיוחד', FileDescription: 'ניהול הניוזלטרים · הורה ומיוחד', CompanyName: 'הורה ומיוחד' },
    ignore: [/^\/dist($|\/)/, /^\/test-.*\.cjs$/, /^\/smoke-.*\.(png|html)$/, /^\/web-bridge\.js$/, /^\/build-admin\.cjs$/, /^\/make-icons\.cjs$/, /^\/release\.cjs$/, /^\/check-sync\.cjs$/]
  });

  console.log('3/3 יצירת ZIP...');
  const zip = path.join(dist, `${APP_DIR}.zip`);
  if (fs.existsSync(zip)) fs.rmSync(zip, { force: true });
  const source = path.join(out, APP_DIR);
  run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path "${source}" -DestinationPath "${zip}" -CompressionLevel Optimal`]);
  const size = (fs.statSync(zip).size / 1024 / 1024).toFixed(0);
  console.log(`\nמוכן:\n  תיקיית האפליקציה: ${source}\n  קובץ ZIP (${size}MB): ${zip}\n  דף הניהול באתר: admin/ (יעלה לאתר עם git push)`);
})().catch(error => { console.error('RELEASE FAILED:', error); process.exit(1); });
