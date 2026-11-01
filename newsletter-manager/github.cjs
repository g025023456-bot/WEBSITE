// GitHub storage layer: the app manages the live site by committing to the
// repo that Vercel deploys from. All functions throw Hebrew-language errors.
const API = 'https://api.github.com';

function headers(token, extra = {}) {
  const base = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ho-me-newsletter-manager'
  };
  if (token) base.Authorization = `Bearer ${token}`;
  return { ...base, ...extra };
}

async function request(method, path, { token, body, allow404 = false } = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: headers(token, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    throw new Error('אין חיבור לאינטרנט, או ש-GitHub אינו זמין כרגע.');
  }
  if (allow404 && response.status === 404) return null;
  if (response.status === 401) throw new Error('הטוקן אינו תקין או שפג תוקפו. הזינו טוקן חדש במסך ההתחברות.');
  if (response.status === 403 || response.status === 404) {
    const text = await response.text().catch(() => '');
    if (/rate limit/i.test(text)) throw new Error('חרגתם ממכסת הבקשות של GitHub. נסו שוב בעוד כמה דקות, או התחברו עם טוקן.');
    throw new Error(method === 'GET'
      ? 'המאגר או הקובץ לא נמצאו. בדקו את שם המאגר במסך ההתחברות.'
      : 'אין לטוקן הרשאת כתיבה למאגר הזה. צרו טוקן עם הרשאת Contents: Read and write.');
  }
  if (response.status === 409 || response.status === 422) {
    const text = await response.text().catch(() => '');
    if (/fast.forward|reference|expected/i.test(text)) {
      throw new Error('האתר השתנה בינתיים ממקום אחר. טענו מחדש ונסו שוב.');
    }
    throw new Error(`GitHub דחה את הפעולה (${response.status}).`);
  }
  if (!response.ok) throw new Error(`שגיאת GitHub ${response.status}.`);
  return response.json();
}

function decodeContent(payload) {
  return Buffer.from(payload.content, 'base64').toString('utf8');
}

class GitHubStore {
  constructor(repo, token) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('שם המאגר צריך להיות בצורת owner/repo, למשל g025023456-bot/WEBSITE.');
    this.repo = repo;
    this.token = token || null;
    this.branch = 'main';
    this.blobCache = new Map();
  }

  async verify() {
    const info = await request('GET', `/repos/${this.repo}`, { token: this.token });
    this.branch = info.default_branch || 'main';
    if (this.token) {
      const self = await request('GET', '/user', { token: this.token });
      if (!info.permissions || !info.permissions.push) {
        throw new Error(`לטוקן של ${self.login} אין הרשאת כתיבה למאגר. צרו טוקן עם הרשאת Contents: Read and write.`);
      }
    }
    return info;
  }

  async head() {
    const ref = await request('GET', `/repos/${this.repo}/git/ref/${encodeURIComponent(`heads/${this.branch}`)}`, { token: this.token });
    return ref.object.sha;
  }

  async readFile(path, ref) {
    const key = `${ref}:${path}`;
    if (this.blobCache.has(key)) return this.blobCache.get(key);
    const payload = await request('GET', `/repos/${this.repo}/contents/${encodePath(path)}?ref=${ref}`, { token: this.token, allow404: true });
    const result = payload ? decodeContent(payload) : null;
    this.blobCache.set(key, result);
    return result;
  }

  async listDir(path, ref) {
    const payload = await request('GET', `/repos/${this.repo}/contents/${encodePath(path)}?ref=${ref}`, { token: this.token, allow404: true });
    return Array.isArray(payload) ? payload : [];
  }

  // changes: [{ path, content }] where content === null means delete.
  async commit(baseSha, message, changes) {
    if (!this.token) throw new Error('לפעולה הזו צריך להתחבר עם טוקן בעל הרשאת כתיבה.');
    if (!changes.length) throw new Error('אין שינויים לשמירה.');
    const baseCommit = await request('GET', `/repos/${this.repo}/git/commits/${baseSha}`, { token: this.token });
    const tree = [];
    for (const change of changes) {
      if (change.content === null) {
        tree.push({ path: change.path, mode: '100644', sha: null });
      } else {
        const blob = await request('POST', `/repos/${this.repo}/git/blobs`, {
          token: this.token,
          body: { content: Buffer.from(change.content, 'utf8').toString('base64'), encoding: 'base64' }
        });
        tree.push({ path: change.path, mode: '100644', sha: blob.sha });
      }
    }
    const newTree = await request('POST', `/repos/${this.repo}/git/trees`, {
      token: this.token,
      body: { base_tree: baseCommit.tree.sha, tree }
    });
    const commit = await request('POST', `/repos/${this.repo}/git/commits`, {
      token: this.token,
      body: { message, tree: newTree.sha, parents: [baseSha] }
    });
    await request('PATCH', `/repos/${this.repo}/git/refs/${encodeURIComponent(`heads/${this.branch}`)}`, {
      token: this.token,
      body: { sha: commit.sha, force: false }
    });
    return commit.sha;
  }
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

module.exports = { GitHubStore };
