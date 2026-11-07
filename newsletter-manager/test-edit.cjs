// Text-editing test: launches the app in view-only mode, unlocks the editing UI
// locally (nothing is saved to the site), edits a line inside the preview and
// checks the HTML that would be sent on save.
const { _electron } = require('playwright-core');
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

  await page.click('#editTextButton');
  const frame = page.frames().find(f => f !== page.mainFrame());
  const before = await frame.evaluate(() => ({ designMode: document.designMode }));
  console.log('EDIT MODE:', JSON.stringify(before), 'finish visible:', await page.isVisible('#finishTextButton'));

  // Put the caret at the end of the first long text cell and type.
  await frame.evaluate(() => {
    const cell = [...document.querySelectorAll('td, p')].find(el => el.children.length === 0 && el.textContent.trim().length > 40);
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type(' בדיקת עריכה');
  await page.keyboard.press('Enter');
  await page.keyboard.type('שורה שנייה');
  await page.click('#finishTextButton');
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const issue = state.issues[0];
    const html = state.editedFiles.get(issue.sourceDate) || '';
    const original = state.loadedFiles.get(issue.sourceDate);
    return {
      edited: Boolean(html),
      dirty: state.dirty,
      hasText: html.includes('בדיקת עריכה<br>שורה שנייה'),
      noPreviewBase: !html.includes('data-preview-base'),
      doctype: html.slice(0, 15),
      noContentEditable: !/contenteditable|designmode/i.test(html),
      newDivs: (html.match(/<div/g) || []).length - (original.match(/<div/g) || []).length,
      sizeOriginal: original.length,
      sizeEdited: html.length,
      badge: Boolean(document.querySelector('.edited-badge'))
    };
  });
  console.log('RESULT:', JSON.stringify(result, null, 2));
  if (process.env.EDIT_DUMP) {
    const files = await page.evaluate(() => ({
      original: state.loadedFiles.get(state.issues[0].sourceDate),
      edited: state.editedFiles.get(state.issues[0].sourceDate)
    }));
    require('node:fs').writeFileSync(path.join(process.env.EDIT_DUMP, 'original.html'), files.original);
    require('node:fs').writeFileSync(path.join(process.env.EDIT_DUMP, 'edited.html'), files.edited);
  }
  await page.screenshot({ path: path.join(__dirname, 'smoke-edit.png') });
  await app.close();
})().catch(err => { console.error('DRIVER FAILED:', err); process.exit(1); });
