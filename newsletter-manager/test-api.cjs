// Local harness for api/newsletter-admin.js: mocks Vercel's req/res and
// checks auth + error paths without deploying. Read-only against GitHub.
const handler = require('../api/newsletter-admin.js');

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.body = obj; return res; };
  return res;
}

async function run(name, { method = 'POST', auth = null, body = {} }, env = {}) {
  const saved = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === null) delete process.env[key]; else process.env[key] = value;
  }
  const headers = {};
  if (auth) headers.authorization = `Basic ${Buffer.from(auth, 'utf8').toString('base64')}`;
  const res = makeRes();
  await handler({ method, headers, body }, res);
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  console.log(`${name}: HTTP ${res.statusCode} ${JSON.stringify(res.body)}`);
  return res;
}

(async () => {
  const USERS = 'o@ho-me.org.il:Secret123, a@ho-me.org.il:Other456';
  await run('no users configured', { auth: 'x@x:y' }, { NEWSLETTER_USERS: null });
  await run('wrong password', { auth: 'o@ho-me.org.il:nope', body: { action: 'ping' } }, { NEWSLETTER_USERS: USERS });
  await run('unknown user', { auth: 'zvi@ho-me.org.il:Secret123', body: { action: 'ping' } }, { NEWSLETTER_USERS: USERS });
  await run('good login ping', { auth: 'O@Ho-Me.org.il:Secret123', body: { action: 'ping' } }, { NEWSLETTER_USERS: USERS });
  await run('write without github token', { auth: 'o@ho-me.org.il:Secret123', body: { action: 'load' } }, { NEWSLETTER_USERS: USERS, GITHUB_TOKEN: null });
  await run('bad method', { method: 'GET' }, { NEWSLETTER_USERS: USERS });
  await run('unknown action', { auth: 'o@ho-me.org.il:Secret123', body: { action: 'wat' } }, { NEWSLETTER_USERS: USERS });
})().catch(err => { console.error('API TEST FAILED:', err); process.exit(1); });
