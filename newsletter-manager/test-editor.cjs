// Rich-editor, device-toggle and email-export test. Runs the app in view-only mode,
// unlocks the editing UI locally (nothing is saved to the site) and checks the HTML.
const { _electron } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'main.cjs')], env });
  const page = await app.firstWindow();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  if (await page.isVisible('#viewOnlyButton')) await page.click('#viewOnlyButton');
  await page.waitForSelector('#workspace:not([hidden])', { timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('loadingBar').hidden, null, { timeout: 60000 });
  await page.evaluate(() => { state.canWrite = true; render(); selectIssue(state.issues[0]); });
  await page.waitForTimeout(1500);

  // Device toggle
  await page.click('#deviceMobile');
  const mobileWidth = await page.$eval('#previewFrame', f => f.getBoundingClientRect().width);
  await page.screenshot({ path: path.join(__dirname, 'smoke-mobile.png') });
  const frameEl = page.frames().find(f => f !== page.mainFrame());
  const hScroll = await frameEl.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.click('#deviceDesktop');
  const desktop = await page.$eval('#previewFrame', f => ({ shown: Math.round(f.getBoundingClientRect().width), layout: f.offsetWidth }));
  console.log('DEVICE: mobile', mobileWidth, 'horizontal scroll on mobile:', hScroll, '· desktop', JSON.stringify(desktop));

  // Refresh button (no unsaved changes yet, so no confirmation dialog)
  console.log('REFRESH visible:', await page.isVisible('#refreshButton'));
  await page.click('#refreshButton');
  await page.waitForFunction(() => !document.getElementById('refreshButton').disabled, null, { timeout: 60000 });
  console.log('REFRESH toast:', await page.$eval('#toast', t => t.textContent), '· issues:', await page.evaluate(() => state.issues.length));
  await page.evaluate(() => { state.canWrite = true; render(); });
  await page.waitForTimeout(1500);

  await page.click('#editTextButton');
  const frame = page.frames().find(f => f !== page.mainFrame());
  console.log('TOOLBAR visible:', await page.isVisible('#editToolbar'));

  // Select a word in the lead paragraph: helper selects the Nth word of the first long <p>.
  const selectWords = (from, to) => frame.evaluate(([a, b]) => {
    const p = [...document.querySelectorAll('p')].find(el => el.textContent.trim().length > 80);
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let node = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!node || n.length > node.length) node = n;
    const range = document.createRange();
    range.setStart(node, a);
    range.setEnd(node, b);
    const s = getSelection(); s.removeAllRanges(); s.addRange(range);
    return range.toString();
  }, [from, to]);

  console.log('select:', await selectWords(0, 2));
  await page.click('[data-cmd="bold"]');
  console.log('bold active:', await page.$eval('[data-cmd="bold"]', b => b.classList.contains('active')));
  await selectWords(3, 6);
  await page.click('[data-color="#562E8C"]');
  await selectWords(7, 10);
  await page.click('[data-color="#EA6A4C"]');
  await selectWords(11, 14);
  await page.click('[data-mark]');
  await selectWords(15, 18);
  await page.selectOption('#toolSize', '18');
  await selectWords(20, 24);
  await page.click('[data-cmd="link"]');
  await page.fill('#linkUrl', 'ho-me.org.il/newsletter/');
  await page.click('#linkForm button[type="submit"]');
  await selectWords(26, 30);
  await page.click('[data-cmd="justifyCenter"]');

  // A numbered list in the "לא לפספס" section
  await frame.evaluate(() => {
    const p = [...document.querySelectorAll('p')].filter(el => el.textContent.trim().length > 20)[2];
    const range = document.createRange(); range.selectNodeContents(p);
    const s = getSelection(); s.removeAllRanges(); s.addRange(range);
  });
  await page.click('[data-cmd="insertOrderedList"]');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('פריט שני ברשימה');
  await page.screenshot({ path: path.join(__dirname, 'smoke-editor.png') });

  // Undo the last typed text, then redo it
  await page.click('[data-cmd="undo"]');
  const afterUndo = await frame.evaluate(() => document.body.innerHTML.includes('פריט שני ברשימה'));
  await page.click('[data-cmd="redo"]');
  const afterRedo = await frame.evaluate(() => document.body.innerHTML.includes('פריט שני ברשימה'));
  console.log('UNDO removed text:', !afterUndo, '· REDO restored:', afterRedo);

  await page.click('#finishTextButton');
  await page.waitForTimeout(400);

  const html = await page.evaluate(() => state.editedFiles.get(state.issues[0].sourceDate) || '');
  const checks = {
    bold: /<b>[^<]+<\/b>/.test(html),
    purple: /<span style="color:#562E8C;">/.test(html),
    orange: /color:#EA6A4C; font-weight:800; font-size:19px;/.test(html),
    marker: /background-color:#FFD455; color:#3d2a06;/.test(html),
    size: /<span style="font-size:18px;">/.test(html),
    link: /<a href="https:\/\/ho-me\.org\.il\/newsletter\/" target="_blank" rel="noopener" style="color:#562E8C; text-decoration:underline;">/.test(html),
    center: /text-align: ?center/.test(html),
    orderedList: /<ol style="margin:0 0 10px 0; padding:0 22px 0 0;">/.test(html) && html.includes('פריט שני ברשימה'),
    noTempFont: !html.includes('ho-me-wrap'),
    noTbody: !html.includes('<tbody'),
    noEmptyDiv: !/<div[^>]*>\s*<\/div>/.test(html)
  };
  console.log('FORMAT CHECKS:', JSON.stringify(checks, null, 2));

  // Email export of the edited issue
  const email = await page.evaluate(() => {
    const out = toEmailHtml(issueContent(state.issues[0]));
    return { out, problems: emailProblems(out), downloadEnabled: !document.getElementById('downloadEmailButton').disabled };
  });
  const e = email.out;
  console.log('EMAIL:', JSON.stringify({
    downloadEnabled: email.downloadEnabled,
    noScripts: !/<script/i.test(e),
    noOg: !/og:|twitter:/i.test(e),
    noBackbar: !/backbar/.test(e),
    unsubscribe: e.includes('{{קישור הסרה · רב-מסר}}'),
    markedEmail: e.includes('(גרסת מייל)'),
    keepsEdits: e.includes('פריט שני ברשימה'),
    problems: email.problems
  }, null, 2));
  if (process.env.EDIT_DUMP) fs.writeFileSync(path.join(process.env.EDIT_DUMP, 'email.html'), e);

  await app.close();
})().catch(err => { console.error('DRIVER FAILED:', err); process.exit(1); });
