// בדיקת עשן לתצוגת העדכונים: מפעיל את האפליקציה, בודק שכפתורי שורת הכותרת לא
// מוסתרים מתחת לכפתורי החלון, עובר לתצוגת העדכונים, מריץ סריקה אמיתית (בלי AI),
// פותח את ההגדרות, ומצלם. משתמש בתיקיית נתונים זמנית כדי לא לגעת בנתוני המשתמש.
const { _electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

(async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'ho-me-smoke-'));
  const env = { ...process.env, HO_ME_USER_DATA: path.join(appData, 'ho-me-newsletter-manager') };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'main.cjs')], env });
  const page = await app.firstWindow();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE:', msg.text()); });
  await page.waitForSelector('#welcome:not([hidden])', { timeout: 15000 });

  // שורת הכותרת: אף כפתור לא נמצא באזור כפתורי החלון של Windows.
  const bar = await page.evaluate(() => {
    const overlay = navigator.windowControlsOverlay;
    const rect = overlay && overlay.visible ? overlay.getTitlebarAreaRect() : { x: 0, width: innerWidth };
    const boxes = [...document.querySelectorAll('.titlebar-actions > *:not([hidden]), .titlebar-brand')].map(el => {
      const b = el.getBoundingClientRect();
      return { id: el.id || el.className, left: Math.round(b.left), right: Math.round(b.right) };
    });
    return { area: { x: Math.round(rect.x), right: Math.round(rect.x + rect.width) }, boxes, innerWidth };
  });
  console.log('TITLEBAR', JSON.stringify(bar));
  for (const box of bar.boxes) {
    assert.ok(box.left >= bar.area.x - 1 && box.right <= bar.area.right + 1, `האלמנט ${box.id} (${box.left}-${box.right}) חורג מהאזור הפנוי ${bar.area.x}-${bar.area.right}`);
  }
  await page.screenshot({ path: path.join(__dirname, 'smoke-welcome.png') });

  // תצוגת העדכונים
  await page.click('#navUpdates');
  await page.waitForSelector('#viewUpdates:not([hidden])');
  await page.waitForTimeout(800);
  const initial = await page.evaluate(() => ({
    sources: document.querySelectorAll('.source-item').length,
    aiChip: document.getElementById('aiChip').textContent,
    scanEnabled: !document.getElementById('scanButton').disabled
  }));
  console.log('UPDATES VIEW', JSON.stringify(initial));
  assert.ok(initial.sources >= 7, 'מקורות ברירת מחדל מוצגים');
  await page.screenshot({ path: path.join(__dirname, 'smoke-updates-empty.png') });

  // סריקה אמיתית מול המקורות (בלי מפתח AI: דירוג לפי מילות מפתח)
  await page.click('#scanButton');
  await page.waitForFunction(() => !document.getElementById('scanStatus').hidden);
  await page.waitForFunction(() => document.getElementById('scanStatus').hidden, null, { timeout: 120000 });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    findings: document.querySelectorAll('.finding').length,
    important: document.querySelectorAll('.relevance.high').length,
    monitorInfo: document.getElementById('monitorInfo').textContent,
    toast: document.getElementById('toast').textContent,
    badge: document.getElementById('updatesBadge').textContent,
    sourcesInfo: [...document.querySelectorAll('.source-info')].map(el => el.textContent)
  }));
  console.log('AFTER SCAN', JSON.stringify(after, null, 1));
  assert.ok(after.findings > 0, 'נמצאו ממצאים');
  await page.screenshot({ path: path.join(__dirname, 'smoke-updates.png'), fullPage: true });

  // בחירת שני ממצאים מציגה את פס הניסוח
  const checks = await page.$$('.finding input[type="checkbox"]');
  await checks[0].click();
  await checks[1].click();
  await page.waitForSelector('#draftBar:not([hidden])');
  console.log('DRAFT BAR', await page.evaluate(() => document.getElementById('draftCount').textContent));
  // ניסוח בלי מפתח AI: הודעה ברורה ופתיחת ההגדרות
  await page.click('#draftButton');
  await page.waitForSelector('#settingsBackdrop:not([hidden])');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'smoke-settings.png') });
  // מפתח לא תקין נדחה עם הודעה
  await page.fill('#aiKeyInput', 'not-a-key');
  await page.click('#aiKeySaveButton');
  await page.waitForTimeout(300);
  console.log('BAD KEY:', await page.evaluate(() => document.getElementById('aiKeyStatus').textContent));
  await page.click('#settingsDoneButton');

  // הפעלת מעקב אוטומטי נשמרת בהגדרות
  await page.click('.monitor-strip .switch');
  await page.waitForTimeout(500);
  const settings = JSON.parse(fs.readFileSync(path.join(appData, 'ho-me-newsletter-manager', 'settings.json'), 'utf8'));
  assert.strictEqual(settings.monitor.enabled, true, 'המעקב נשמר');
  console.log('MONITOR INFO:', await page.evaluate(() => document.getElementById('monitorInfo').textContent));

  // חזרה לגיליונות: צפייה בלבד, ואז בדיקה שפס הפרסום לא מופיע בלי הרשאה
  await page.click('.side-link[data-view="issues"]');
  await page.click('#viewOnlyButton');
  await page.waitForSelector('#workspace:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const issues = await page.evaluate(() => ({
    items: document.querySelectorAll('.issue-item').length,
    publishHidden: document.getElementById('publishBar').hidden,
    saveText: document.getElementById('saveButton').textContent.trim()
  }));
  console.log('ISSUES', JSON.stringify(issues));
  assert.strictEqual(issues.saveText, '⬆ פרסום לאתר');
  await page.screenshot({ path: path.join(__dirname, 'smoke-main.png') });

  await app.close();
  fs.rmSync(appData, { recursive: true, force: true });
  console.log('UPDATES SMOKE OK');
})().catch(err => { console.error('UPDATES SMOKE FAILED:', err); process.exit(1); });
