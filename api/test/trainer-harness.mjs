/* The real server.js in a child process on a throwaway DATA_DIR, for the trainer and students
 * tests. The spawn, the `secret` file and the signed `gymsid` cookie are the ones
 * server-first-user-admin.test.js uses; this just keeps them in one place.
 *
 *   const s = await startServer(t, { env: { TRAINER_MODE: '1' }, users: [{ id: 'u1', name: 'Ana' }] });
 *   const r = await s.call('/api/me', { as: 'u1' });          // { status, body, headers }
 *   const p = await s.call('/api/x', { method: 'POST', body: {}, as: 'u1' });
 *   s.db()                                                    // db.json as it is on disk now
 *
 * `as` is the uid of the caller (no `as`: not signed in). The child is killed, and waited for, when
 * the test ends, then the directory goes. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://localhost:8080';

export async function startServer(t, { env = {}, users = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-trainer-'));
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir, 'secret'), secret, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites: [] }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dir, ORIGIN, RP_ID: 'localhost', TRUST_PROXY: '1', INVITE_ONLY: '', ADMIN_UIDS: '', TRAINER_MODE: '', PASSWORD_LOGIN: '', ...env }
  });
  let log = '';
  child.stdout.on('data', d => log += d);
  child.stderr.on('data', d => log += d);
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); }
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); // Windows may hold it briefly
  });
  const base = `http://127.0.0.1:${await boundPort(child, () => log)}`;

  const mint = (uid, sv = 0) => {
    const payload = `${uid}:${Date.now() + 86400000}:${sv}`;
    return 'gymsid=' + payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  };
  // Sec-Fetch-Site: same-origin is what the server's cross-site check on writes looks for.
  const call = async (p, { method = 'GET', body, as } = {}) => {
    const r = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'X-Forwarded-For': '198.51.100.1', ...(as ? { Cookie: mint(as) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await r.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON: hand back the text */ }
    return { status: r.status, body: parsed, headers: r.headers };
  };
  const db = () => JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
  return { base, dir, call, mint, db };
}
