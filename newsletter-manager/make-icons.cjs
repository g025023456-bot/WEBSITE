// מייצר את קובצי האייקון הממותגים של האפליקציה מתוך סמל המותג (ארבע הצורות של הלוגו):
//   assets/icon.ico   · אייקון ה-EXE, שורת המשימות וחלון האפליקציה (Windows)
//   assets/icon.png   · אותו אייקון ב-512px (התראות)
//   assets/tray.png   · אייקון אזור ההתראות (32px)
//   assets/mark.png   · סמל לשורת הכותרת ולמסך ההתחברות (על רקע לבן)
// הרצה: npm run icons   (נדרש Electron, כי הציור נעשה ב-Chromium)
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, 'assets');

// סמל המותג: עיגול כתום, ריבוע צהוב, קפסולה (סגולה בלוגו) וריבוע תכלת, בסידור של הלוגו.
function markShapes(pillColor) {
  return `
    <circle cx="183" cy="176" r="56" fill="#EA6A4C"/>
    <rect x="272" y="112" width="126" height="126" rx="30" fill="#FFD455"/>
    <rect x="118" y="256" width="126" height="150" rx="36" fill="${pillColor}"/>
    <rect x="272" y="256" width="126" height="106" rx="30" fill="#1CA6A6"/>`;
}

const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6a3aa8"/>
      <stop offset="1" stop-color="#3f1f6b"/>
    </linearGradient>
  </defs>
  <rect x="14" y="14" width="484" height="484" rx="118" fill="url(#bg)"/>
  <rect x="14" y="14" width="484" height="484" rx="118" fill="none" stroke="#ffffff" stroke-opacity=".16" stroke-width="6"/>
  ${markShapes('#ffffff')}
</svg>`;

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="14" y="14" width="484" height="484" rx="118" fill="#ffffff"/>
  ${markShapes('#562E8C')}
</svg>`;

function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buffer } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(buffer);
    offset += buffer.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

let canvas = null;
async function renderSvg(svg) {
  if (!canvas) {
    canvas = new BrowserWindow({
      show: false, width: 512, height: 512, frame: false, transparent: true,
      backgroundColor: '#00000000', webPreferences: { offscreen: true }
    });
  }
  const html = `<!doctype html><html><body style="margin:0;background:transparent;">${svg}</body></html>`;
  await canvas.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise(resolve => setTimeout(resolve, 400));
  return canvas.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const icon = await renderSvg(appIconSvg);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map(size => ({ size, buffer: icon.resize({ width: size, height: size, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(pngs));
  fs.writeFileSync(path.join(OUT, 'icon.png'), icon.toPNG());
  fs.writeFileSync(path.join(OUT, 'icon-256.png'), icon.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(OUT, 'tray.png'), icon.resize({ width: 32, height: 32, quality: 'best' }).toPNG());
  const mark = await renderSvg(markSvg);
  fs.writeFileSync(path.join(OUT, 'mark.png'), mark.resize({ width: 128, height: 128, quality: 'best' }).toPNG());
  console.log('icons written to', OUT, sizes.map(size => `${size}px`).join(', '));
  app.quit();
}).catch(error => {
  console.error('ICON BUILD FAILED:', error);
  app.exit(1);
});
