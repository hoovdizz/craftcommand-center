const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const PACKAGE = require('./package.json');

const APP_VERSION = PACKAGE.version || '2.1.0';

const PORT = Number(process.env.PORT || 8223);
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
const FALLBACK_CONFIG = path.join(__dirname, 'config.example.json');
const DEFAULT_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BOOTSTRAP_PASSWORD = process.env.CCC_PASSWORD || process.env.MCQB_PASSWORD || '';
const BOOTSTRAP_PASSWORD_HASH = BOOTSTRAP_PASSWORD ? hashPassword(BOOTSTRAP_PASSWORD) : '';


function envBool(name, current) {
  if (process.env[name] === undefined) return current;
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name]).toLowerCase());
}

function firstEnv(...names) {
  for (const name of names) {
    if (process.env[name] !== undefined && String(process.env[name]).trim() !== '') return String(process.env[name]).trim();
  }
  return undefined;
}

function applyEnvOverrides(cfg) {
  const out = { ...cfg };

  const title = firstEnv('CCC_APP_TITLE', 'MCQB_APP_TITLE');
  if (title) out.appTitle = title;

  out.auth = { ...(out.auth || {}) };
  const username = firstEnv('CCC_USERNAME', 'MCQB_USERNAME');
  if (username) out.auth.username = username;
  const passwordHash = firstEnv('CCC_PASSWORD_HASH', 'MCQB_PASSWORD_HASH');
  const password = firstEnv('CCC_PASSWORD', 'MCQB_PASSWORD');
  if (passwordHash) out.auth.passwordHash = passwordHash;
  else if (password) out.auth.passwordHash = BOOTSTRAP_PASSWORD_HASH || hashPassword(password);
  const sessionHours = firstEnv('CCC_SESSION_HOURS');
  if (sessionHours && Number.isFinite(Number(sessionHours))) out.auth.sessionHours = Number(sessionHours);

  const container = firstEnv('CCC_MINECRAFT_CONTAINER', 'MCQB_MINECRAFT_CONTAINER', 'MINECRAFT_CONTAINER_NAME');
  if (container) out.minecraftContainerName = container;

  const dockerUser = firstEnv('CCC_DOCKER_USER', 'MCQB_DOCKER_USER');
  if (dockerUser) out.dockerUser = dockerUser;

  const screen = firstEnv('CCC_SCREEN_SESSION', 'MCQB_SCREEN_SESSION');
  if (screen) out.screenSession = screen;

  const commandMethod = firstEnv('CCC_COMMAND_METHOD', 'MCQB_COMMAND_METHOD');
  if (commandMethod) out.commandMethod = commandMethod;

  const minecraftWebUiUrl = firstEnv('CCC_MINECRAFT_WEBUI_URL', 'MCQB_MINECRAFT_WEBUI_URL');
  const unraidDockerUrl = firstEnv('CCC_UNRAID_DOCKER_URL', 'MCQB_UNRAID_DOCKER_URL');
  if (minecraftWebUiUrl || unraidDockerUrl) {
    const existing = Array.isArray(out.links) ? out.links : [];
    const byLabel = new Map(existing.map(l => [String(l.label || '').toLowerCase(), { ...l }]));
    if (minecraftWebUiUrl) byLabel.set('minecraft webui console', { label: 'Minecraft WebUI Console', url: minecraftWebUiUrl });
    if (unraidDockerUrl) byLabel.set('unraid docker', { label: 'Unraid Docker', url: unraidDockerUrl });
    out.links = Array.from(byLabel.values());
  }

  out.autoRefreshAttachmentOnBoot = envBool('CCC_AUTO_REFRESH_ATTACHMENT_ON_BOOT', out.autoRefreshAttachmentOnBoot);
  out.refreshAttachmentBeforeCommand = envBool('CCC_REFRESH_ATTACHMENT_BEFORE_COMMAND', out.refreshAttachmentBeforeCommand);
  out.showRawOutput = envBool('CCC_SHOW_RAW_OUTPUT', out.showRawOutput);
  out.audit = { ...(out.audit || {}) };
  out.audit.enabled = envBool('CCC_AUDIT_ENABLED', out.audit.enabled !== false);
  const auditMax = firstEnv('CCC_AUDIT_MAX_ENTRIES');
  if (auditMax && Number.isFinite(Number(auditMax))) out.audit.maxEntries = Number(auditMax);

  return out;
}


function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  try {
    const [scheme, salt, expectedHex] = String(storedHash || '').split('$');
    if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
    const actual = crypto.scryptSync(String(password), salt, expectedHex.length / 2);
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function safeEqualText(a, b) {
  const aa = crypto.createHash('sha256').update(String(a)).digest();
  const bb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(aa, bb);
}

const ROLE_LEVEL = { viewer: 0, operator: 1, admin: 2 };

function normalizeRole(value) {
  const role = String(value || 'admin').toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_LEVEL, role) ? role : 'viewer';
}

function usersFilePath() {
  return path.join(DEFAULT_DATA_DIR, 'users.json');
}

function readPersistentAuthUsers() {
  const filePath = usersFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writePersistentAuthUsers(users) {
  fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
  fs.writeFileSync(usersFilePath(), `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

function normalizedAuthUsers(cfg) {
  const auth = cfg.auth || {};
  const byName = new Map();
  const add = (entry, source, defaultRole = 'operator') => {
    const username = String(entry?.username || '').trim();
    const passwordHash = String(entry?.passwordHash || '').trim();
    if (!username || !passwordHash || entry?.enabled === false) return;
    byName.set(username.toLowerCase(), {
      username,
      passwordHash,
      role: normalizeRole(entry.role || defaultRole),
      source
    });
  };

  for (const entry of readPersistentAuthUsers()) add(entry, 'persistent', 'operator');
  if (Array.isArray(auth.users)) for (const entry of auth.users) add(entry, 'config', 'operator');
  if (auth.username && auth.passwordHash) add({ username: auth.username, passwordHash: auth.passwordHash, role: auth.role || 'admin' }, 'primary', 'admin');
  return Array.from(byName.values());
}

function publicAuthUsers(cfg) {
  return normalizedAuthUsers(cfg).map(({ username, role, source }) => ({ username, role, source }));
}

function validateAccountUsername(value) {
  const username = String(value || '').trim();
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw new Error('Username must be 3-32 characters using letters, numbers, dots, dashes, or underscores');
  return username;
}

function savePersistentAuthUser(cfg, input) {
  const username = validateAccountUsername(input.username);
  const password = String(input.password || '');
  const role = normalizeRole(input.role || 'viewer');
  if (password.length < 10) throw new Error('Password must be at least 10 characters');
  if (String((cfg.auth || {}).username || '').toLowerCase() === username.toLowerCase()) {
    throw new Error('The primary admin account is managed in the Unraid template');
  }
  const users = readPersistentAuthUsers().filter(user => String(user.username || '').toLowerCase() !== username.toLowerCase());
  users.push({ username, passwordHash: hashPassword(password), role, enabled: true });
  writePersistentAuthUsers(users);
  return { username, role, source: 'persistent' };
}

function deletePersistentAuthUser(cfg, usernameValue, currentUsername) {
  const username = validateAccountUsername(usernameValue);
  if (username.toLowerCase() === String(currentUsername || '').toLowerCase()) throw new Error('You cannot delete the account you are currently using');
  if (String((cfg.auth || {}).username || '').toLowerCase() === username.toLowerCase()) throw new Error('The primary admin account is managed in the Unraid template');
  const before = readPersistentAuthUsers();
  const after = before.filter(user => String(user.username || '').toLowerCase() !== username.toLowerCase());
  if (after.length === before.length) throw new Error('Persistent account not found');
  writePersistentAuthUsers(after);
  return username;
}

function findAuthUser(cfg, username) {
  const wanted = String(username || '').trim();
  return normalizedAuthUsers(cfg).find(user => safeEqualText(user.username, wanted)) || null;
}

function roleAtLeast(session, minimum) {
  return Boolean(session) && (ROLE_LEVEL[normalizeRole(session.role)] >= ROLE_LEVEL[normalizeRole(minimum)]);
}

function requireRole(session, minimum) {
  if (!roleAtLeast(session, minimum)) throw new Error(`This action requires the ${minimum} role`);
}

const sessions = new Map();
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}
function requestIsHttps(req) {
  return String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
}
function setSessionCookie(req, res, token, maxAgeSeconds) {
  const secure = requestIsHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ccc_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`);
}
function clearSessionCookie(req, res) {
  const secure = requestIsHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ccc_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
function getSession(req) {
  const token = parseCookies(req).ccc_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}
function createSession(username, role, cfg) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hours = Math.max(1, Math.min(168, Number((cfg.auth || {}).sessionHours || 12)));
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  sessions.set(token, { username, role: normalizeRole(role), expiresAt });
  return { token, expiresAt, maxAgeSeconds: Math.floor((expiresAt - Date.now()) / 1000) };
}
function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    json(res, 401, { ok: false, error: 'Authentication required' });
    return null;
  }
  return session;
}

function loadConfig() {
  const p = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : FALLBACK_CONFIG;
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  return applyEnvOverrides(cfg);
}


function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
}

const loginAttempts = new Map();
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}
function loginRateState(req) {
  const key = clientIp(req);
  const now = Date.now();
  const state = loginAttempts.get(key) || { count: 0, firstAt: now, blockedUntil: 0 };
  if (state.blockedUntil > now) return { key, state, blocked: true, retrySeconds: Math.ceil((state.blockedUntil - now) / 1000) };
  if (now - state.firstAt > 10 * 60 * 1000) return { key, state: { count: 0, firstAt: now, blockedUntil: 0 }, blocked: false };
  return { key, state, blocked: false };
}
function recordLoginFailure(rate) {
  const state = { ...rate.state, count: rate.state.count + 1 };
  if (state.count >= 6) state.blockedUntil = Date.now() + 10 * 60 * 1000;
  loginAttempts.set(rate.key, state);
}
function clearLoginFailures(req) { loginAttempts.delete(clientIp(req)); }
function sameOriginAllowed(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  try { return new URL(origin).host === String(req.headers.host || ''); } catch { return false; }
}

function json(res, status, data) {
  setSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function text(res, status, data, type = 'text/plain; charset=utf-8') {
  setSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': type });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function safeItemName(item) {
  const value = String(item || '').trim();
  if (!/^[a-z0-9_:.\-]+$/i.test(value)) throw new Error('Invalid item name');
  return value;
}

function safeAmount(amount, max = 2304) {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`Amount must be 1-${max}`);
  return n;
}



function stripAnsi(value) {
  return String(value || '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function compactResult(result, cfg) {
  const compact = {
    ok: result.ok,
    code: result.code,
    command: result.command,
    method: result.method,
    activeScreenSession: result.activeScreenSession || attachmentState.activeScreenSession || null
  };

  if (cfg.showRawOutput === true || !result.ok) {
    compact.stdout = stripAnsi(result.stdout || '').trim();
    compact.stderr = stripAnsi(result.stderr || '').trim();
  }

  return compact;
}

function safeKitId(kitId) {
  const value = String(kitId || '').trim();
  if (!/^[a-z0-9_-]+$/i.test(value)) throw new Error('Invalid kit id');
  return value;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTarget(target, cfg) {
  const wanted = String(target || '').trim();
  const targets = mergedPlayerTargets(cfg);
  const hit = targets.find(p => p.target === wanted || p.label === wanted);
  if (!hit) {
    // Fallback for a valid player name typed/sent by the browser after discovery.
    if (isValidPlayerName(wanted)) return safeMinecraftTargetValue(wanted);
    throw new Error('Target must be one of the configured or discovered players');
  }
  const t = String(hit.target || '').trim();
  if (t.startsWith('@')) return t;
  return safeMinecraftTargetValue(t);
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'"'"'`)}'`;
}


let attachmentState = {
  ok: false,
  container: null,
  dockerUser: null,
  configuredScreenSession: null,
  activeScreenSession: null,
  method: null,
  checkedAt: null,
  reason: null,
  error: 'Not checked yet',
  screenList: ''
};
let refreshInFlight = null;


let playerState = {
  ok: false,
  checkedAt: null,
  players: [],
  sources: [],
  error: 'Not checked yet'
};
let playerRefreshInFlight = null;


function activityLogPath(cfg) {
  const configured = String((cfg.audit || {}).file || '').trim();
  return configured ? (path.isAbsolute(configured) ? configured : path.join(DEFAULT_DATA_DIR, configured)) : path.join(DEFAULT_DATA_DIR, 'activity.jsonl');
}

function appendActivity(cfg, entry) {
  if ((cfg.audit || {}).enabled === false) return;
  try {
    const filePath = activityLogPath(cfg);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const clean = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      username: String(entry.username || 'system'),
      role: normalizeRole(entry.role || 'viewer'),
      action: String(entry.action || 'unknown').slice(0, 80),
      target: entry.target ? String(entry.target).slice(0, 100) : null,
      summary: String(entry.summary || '').slice(0, 300),
      ok: entry.ok !== false,
      error: entry.error ? String(entry.error).slice(0, 500) : null,
      commands: Number(entry.commands || 0),
      ip: entry.ip ? String(entry.ip).slice(0, 100) : null
    };
    fs.appendFileSync(filePath, `${JSON.stringify(clean)}\n`, 'utf8');
    const maxEntries = Math.max(100, Math.min(10000, Number((cfg.audit || {}).maxEntries || 2000)));
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-maxEntries);
      fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
    }
  } catch (err) {
    console.log(`Activity log write failed: ${err.message}`);
  }
}

function readActivity(cfg, limit = 100) {
  const filePath = activityLogPath(cfg);
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-safeLimit).reverse().map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function clearActivity(cfg) {
  const filePath = activityLogPath(cfg);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '', 'utf8');
}

function dataDirectoryWritable() {
  try {
    fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
    const test = path.join(DEFAULT_DATA_DIR, `.write-test-${process.pid}`);
    fs.writeFileSync(test, 'ok');
    fs.unlinkSync(test);
    return true;
  } catch { return false; }
}

async function runDiagnostics(cfg, req) {
  const checks = [];
  const add = (id, label, ok, detail, severity = 'error') => checks.push({ id, label, ok: Boolean(ok), detail: String(detail || ''), severity });
  add('app', 'CraftCommand Center', true, `Version ${APP_VERSION}`);
  add('docker-socket', 'Docker socket', fs.existsSync('/var/run/docker.sock'), fs.existsSync('/var/run/docker.sock') ? 'Available' : 'Missing /var/run/docker.sock');
  add('data', 'Persistent data', dataDirectoryWritable(), dataDirectoryWritable() ? `${DEFAULT_DATA_DIR} is writable` : `${DEFAULT_DATA_DIR} is not writable`);
  add('https', 'Encrypted browser connection', requestIsHttps(req), requestIsHttps(req) ? 'HTTPS detected' : 'HTTP detected; use a reverse proxy for encryption', 'warning');

  const containerName = safeDockerName(cfg.minecraftContainerName || 'binhex-minecraftbedrockserver', 'Minecraft container name');
  const inspect = await runDocker(['inspect', '--format', '{{.State.Running}}|{{.State.Status}}|{{.Config.Image}}', containerName], 8000);
  if (inspect.ok) {
    const [running, status, image] = inspect.stdout.trim().split('|');
    add('container', 'Binhex container', running === 'true', `${containerName}: ${status || 'unknown'} (${image || 'unknown image'})`);
  } else {
    add('container', 'Binhex container', false, stripAnsi(inspect.stderr || inspect.stdout || 'Container not found').trim());
  }

  const attachment = await refreshAttachment(cfg, 'diagnostics');
  add('screen', 'Minecraft console attachment', attachment.ok, attachment.ok ? `${attachment.activeScreenSession} as ${attachment.dockerUser}` : attachment.error || 'Screen session not found');

  const users = normalizedAuthUsers(cfg);
  add('auth', 'Dashboard account', users.length > 0, `${users.length} enabled account(s)`);
  const weakDefault = String(process.env.CCC_PASSWORD || '') === 'change-me-now' || String(process.env.MCQB_PASSWORD || '') === 'change-me-now';
  add('default-password', 'Default password changed', !weakDefault, weakDefault ? 'Change the default password before beta testing' : 'No default environment password detected', 'warning');

  const errors = checks.filter(c => !c.ok && c.severity !== 'warning').length;
  const warnings = checks.filter(c => !c.ok && c.severity === 'warning').length;
  return { ok: errors === 0, ready: errors === 0, errors, warnings, checkedAt: new Date().toISOString(), checks, attachment: publicAttachmentState(cfg), appVersion: APP_VERSION };
}

function manualPlayersPath(cfg) {
  const configured = String(cfg.manualPlayersFile || '').trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.join(DEFAULT_DATA_DIR, configured);
  return path.join(DEFAULT_DATA_DIR, 'manual-players.json');
}

function normalizeManualPlayerEntry(entry, source = 'manual player list') {
  if (!entry) return null;
  const raw = typeof entry === 'string' ? entry : (entry.target || entry.name || entry.label);
  const clean = normalizePlayerName(raw);
  if (!isValidPlayerName(clean)) return null;
  const label = normalizePlayerName((typeof entry === 'object' && (entry.label || entry.name)) || clean) || clean;
  return { label, target: clean, source };
}

function readManualPlayers(cfg) {
  const players = [];
  for (const p of cfg.manualPlayers || []) {
    const entry = normalizeManualPlayerEntry(p, 'config manualPlayers');
    if (entry) players.push(entry);
  }

  const filePath = manualPlayersPath(cfg);
  if (fs.existsSync(filePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw.players) ? raw.players : []);
      for (const p of list) {
        const entry = normalizeManualPlayerEntry(p, 'web UI manual list');
        if (entry) players.push(entry);
      }
    } catch {
      // If the manual file is malformed, ignore it so the dashboard still loads.
    }
  }

  const merged = new Map();
  for (const p of players) {
    const key = p.target.toLowerCase();
    if (!merged.has(key)) merged.set(key, { label: p.label, target: p.target, source: p.source });
  }
  return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function writeManualPlayers(cfg, players) {
  const filePath = manualPlayersPath(cfg);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const clean = [];
  const seen = new Set();
  for (const p of players || []) {
    const entry = normalizeManualPlayerEntry(p, 'web UI manual list');
    if (!entry) continue;
    const key = entry.target.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ label: entry.label, target: entry.target });
  }
  clean.sort((a, b) => a.label.localeCompare(b.label));
  fs.writeFileSync(filePath, JSON.stringify({ players: clean, updatedAt: new Date().toISOString() }, null, 2));
  return clean;
}

function addManualPlayer(cfg, name) {
  const entry = normalizeManualPlayerEntry(name, 'web UI manual list');
  if (!entry) throw new Error('Invalid player name. Example: ViaSue');
  const players = readManualPlayers(cfg);
  const key = entry.target.toLowerCase();
  const existing = players.find(p => String(p.target).toLowerCase() === key);
  if (!existing) players.push({ label: entry.label, target: entry.target });
  writeManualPlayers(cfg, players);
  // Also add it to current in-memory discovery so the dropdown updates immediately.
  const map = new Map((playerState.players || []).map(p => [String(p.target).toLowerCase(), { ...p }]));
  if (!map.has(key)) map.set(key, { label: entry.label, target: entry.target, sources: ['web UI manual list'] });
  playerState = {
    ...playerState,
    ok: true,
    checkedAt: new Date().toISOString(),
    players: Array.from(map.values()),
    sources: Array.from(new Set([...(playerState.sources || []), 'web UI manual list'])),
    error: playerState.error === 'Not checked yet' ? null : playerState.error,
    reason: 'manual-add'
  };
  return entry;
}


function customKitsPath(cfg) {
  const configured = String(cfg.customKitsFile || '').trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.join(DEFAULT_DATA_DIR, configured);
  return path.join(DEFAULT_DATA_DIR, 'custom-kits.json');
}

function sanitizeKit(kit, custom = false) {
  const label = String(kit.label || kit.name || '').trim();
  if (!label || label.length > 60) throw new Error('Kit name must be 1-60 characters');
  const id = safeKitId(kit.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50));
  const description = String(kit.description || '').trim().slice(0, 240);
  const icon = String(kit.icon || '🎒').trim().slice(0, 8) || '🎒';
  const items = [];
  for (const entry of Array.isArray(kit.items) ? kit.items : []) {
    items.push({ item: safeItemName(entry.item), amount: safeAmount(entry.amount || 1, 2304) });
  }
  if (!items.length && !kit.xp) throw new Error('A kit needs at least one item or XP entry');
  if (items.length > 30) throw new Error('A kit can contain at most 30 item entries');
  let xp = null;
  if (kit.xp && Number(kit.xp.amount || 0) > 0) {
    xp = { amount: safeAmount(kit.xp.amount, 10000), levels: kit.xp.levels !== false };
  }
  return { id, label, description, icon, items, xp, custom };
}

function readCustomKits(cfg) {
  const filePath = customKitsPath(cfg);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw.kits) ? raw.kits : []);
    return list.map(k => sanitizeKit(k, true)).sort((a, b) => a.label.localeCompare(b.label));
  } catch (err) {
    console.log(`Could not load custom kits: ${err.message}`);
    return [];
  }
}

function writeCustomKits(cfg, kits) {
  const filePath = customKitsPath(cfg);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const clean = kits.map(k => sanitizeKit(k, true));
  fs.writeFileSync(filePath, JSON.stringify({ kits: clean, updatedAt: new Date().toISOString() }, null, 2));
  return clean;
}

function mergedKits(cfg) {
  const builtIn = (cfg.kits || []).map(k => sanitizeKit(k, false));
  const custom = readCustomKits(cfg);
  const map = new Map();
  for (const kit of [...builtIn, ...custom]) map.set(kit.id, kit);
  return Array.from(map.values());
}

function saveCustomKit(cfg, rawKit) {
  const kit = sanitizeKit(rawKit, true);
  if ((cfg.kits || []).some(existing => String(existing.id) === kit.id)) {
    throw new Error('That kit name conflicts with a built-in kit. Choose a different name.');
  }
  const kits = readCustomKits(cfg).filter(k => k.id !== kit.id);
  kits.push(kit);
  writeCustomKits(cfg, kits);
  return kit;
}

function deleteCustomKit(cfg, kitId) {
  const id = safeKitId(kitId);
  const kits = readCustomKits(cfg);
  const remaining = kits.filter(k => k.id !== id);
  if (remaining.length === kits.length) throw new Error('Custom kit not found');
  writeCustomKits(cfg, remaining);
}

function normalizePlayerName(name) {
  return String(name || '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidPlayerName(name) {
  const n = normalizePlayerName(name);
  // Xbox gamertags can include spaces. Keep this broad but block shell/control characters.
  return n.length >= 2 && n.length <= 32 && /^[A-Za-z0-9_ .-]+$/.test(n) && !n.startsWith('@');
}

function addPlayer(map, name, source) {
  const clean = normalizePlayerName(name);
  if (!isValidPlayerName(clean)) return;
  const key = clean.toLowerCase();
  if (!map.has(key)) map.set(key, { label: clean, target: clean, sources: new Set() });
  map.get(key).sources.add(source);
}

function parsePlayersFromLogs(text, map) {
  const body = stripAnsi(text || '');
  const regexes = [
    /Player connected:\s*([^,\r\n]+)(?:,|\r|\n)/gi,
    /Player disconnected:\s*([^,\r\n]+)(?:,|\r|\n)/gi,
    /\b([^\r\n]{2,32})\s+joined the game\b/gi,
    /\b([^\r\n]{2,32})\s+left the game\b/gi,
    /Gave\s+.+?\s+to\s+([A-Za-z0-9_ .-]{2,32})(?:\r|\n|$)/gi,
    /Teleported\s+([A-Za-z0-9_ .-]{2,32})(?:\r|\n|$)/gi,
    /Made\s+([A-Za-z0-9_ .-]{2,32})\s+a server operator/gi,
    /De-opped\s+([A-Za-z0-9_ .-]{2,32})/gi,
    /There are\s+\d+\/\d+\s+players online:\s*([^\r\n]+)/gi
  ];
  for (const re of regexes) {
    let m;
    while ((m = re.exec(body)) !== null) {
      if (re.source.includes('players online')) {
        for (const piece of String(m[1] || '').split(/,\s*/)) addPlayer(map, piece, 'docker logs');
      } else {
        addPlayer(map, m[1], 'docker logs');
      }
    }
  }
}

function parsePlayersFromJsonText(text, map, source) {
  const body = String(text || '');
  // Be forgiving because we may be parsing multiple files glued together with markers.
  const nameRe = /"name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/gi;
  let m;
  while ((m = nameRe.exec(body)) !== null) {
    try { addPlayer(map, JSON.parse(`"${m[1]}"`), source); }
    catch { addPlayer(map, m[1], source); }
  }
}

async function discoverKnownPlayers(cfg, reason = 'manual') {
  if (playerRefreshInFlight) return playerRefreshInFlight;
  playerRefreshInFlight = (async () => {
    const started = new Date().toISOString();
    const container = safeDockerName(cfg.minecraftContainerName, 'Minecraft container name');
    const user = safeDockerName(cfg.dockerUser || 'nobody', 'Docker user');
    const discoveryCfg = cfg.playerDiscovery || {};
    const map = new Map();
    const sources = [];
    const errors = [];

    for (const p of cfg.players || []) {
      if (p && p.target && !String(p.target).startsWith('@')) addPlayer(map, p.target, 'config.json');
    }
    for (const p of readManualPlayers(cfg)) {
      addPlayer(map, p.target, p.source || 'manual player list');
    }

    try {
      const inspect = await runDocker(['inspect', '-f', '{{.State.Running}}', container], 7000);
      if (!inspect.ok || inspect.stdout.trim() !== 'true') {
        throw new Error(`Minecraft container is not running or not found: ${container}`);
      }

      if (discoveryCfg.useDockerLogs !== false) {
        const tail = String(Number(discoveryCfg.dockerLogTail || 50000));
        const logs = await runDocker(['logs', '--tail', tail, container], Number(discoveryCfg.dockerLogTimeoutMs || 12000));
        if (logs.ok || logs.stdout || logs.stderr) {
          parsePlayersFromLogs(`${logs.stdout || ''}\n${logs.stderr || ''}`, map);
          sources.push(`docker logs --tail ${tail}`);
        } else {
          errors.push(`docker logs failed: ${stripAnsi(logs.stderr || logs.stdout || '').trim()}`);
        }
      }

      if (discoveryCfg.useOnlineList !== false) {
        const listCfg = { ...cfg, showRawOutput: true, commandTimeoutMs: Number(discoveryCfg.onlineListTimeoutMs || cfg.commandTimeoutMs || 15000) };
        const online = await runMinecraftCommand('list', listCfg);
        if (online.ok || online.stdout || online.stderr) {
          parsePlayersFromLogs(`${online.stdout || ''}
${online.stderr || ''}`, map);
          sources.push('server list command');
        } else if (online.stderr) {
          errors.push(`online list failed: ${stripAnsi(online.stderr || '').trim()}`);
        }
      }

      if (discoveryCfg.useServerFiles !== false) {
        const shell = String.raw`set -e
for p in /config /data /minecraft /server /serverdata /home/nobody /home/nobody/minecraft; do
  if [ -d "$p" ]; then
    find "$p" -maxdepth 6 \( -iname 'allowlist.json' -o -iname 'whitelist.json' -o -iname 'permissions.json' \) -type f -print 2>/dev/null
  fi
done | sort -u | while IFS= read -r f; do
  echo "__MCQB_FILE__:$f"
  cat "$f" 2>/dev/null || true
  echo "__MCQB_END__"
done`;
        const files = await runDocker(['exec', '-u', user, container, 'bash', '-lc', shell], Number(discoveryCfg.fileSearchTimeoutMs || 12000));
        if (files.ok || files.stdout) {
          parsePlayersFromJsonText(files.stdout || '', map, 'allowlist/permissions files');
          const fileHits = (files.stdout || '').match(/__MCQB_FILE__:/g);
          if (fileHits) sources.push(`${fileHits.length} allowlist/permissions file(s)`);
        } else if (files.stderr) {
          errors.push(`file scan failed: ${stripAnsi(files.stderr).trim()}`);
        }
      }

      const players = Array.from(map.values())
        .map(p => ({ label: p.label, target: p.target, sources: Array.from(p.sources).sort() }))
        .sort((a, b) => a.label.localeCompare(b.label));

      playerState = {
        ok: true,
        checkedAt: started,
        players,
        sources,
        error: errors.length ? errors.join(' | ') : null,
        reason
      };
      return playerState;
    } catch (err) {
      playerState = {
        ok: false,
        checkedAt: started,
        players: Array.from(map.values()).map(p => ({ label: p.label, target: p.target, sources: Array.from(p.sources).sort() })),
        sources,
        error: err.message,
        reason
      };
      return playerState;
    }
  })();

  try {
    return await playerRefreshInFlight;
  } finally {
    playerRefreshInFlight = null;
  }
}

function publicPlayers(cfg) {
  const all = mergedPlayerTargets(cfg);
  all.sort((a, b) => {
    if (a.target === '@a') return -1;
    if (b.target === '@a') return 1;
    return String(a.label).localeCompare(String(b.label));
  });
  return {
    ok: playerState.ok,
    checkedAt: playerState.checkedAt,
    players: all,
    discoveredCount: (playerState.players || []).length,
    manualCount: readManualPlayers(cfg).length,
    sources: playerState.sources || [],
    error: playerState.error || null,
    reason: playerState.reason || null
  };
}

function mergedPlayerTargets(cfg) {
  const merged = new Map();
  for (const p of cfg.players || []) {
    if (!p || !p.target) continue;
    merged.set(String(p.target).toLowerCase(), { label: p.label || p.target, target: p.target, configured: true });
  }
  for (const p of readManualPlayers(cfg)) {
    if (!p || !p.target) continue;
    const key = String(p.target).toLowerCase();
    if (!merged.has(key)) merged.set(key, { label: p.label || p.target, target: p.target, manual: true, sources: [p.source || 'manual player list'] });
  }
  for (const p of playerState.players || []) {
    if (!p || !p.target) continue;
    const key = String(p.target).toLowerCase();
    if (!merged.has(key)) merged.set(key, { label: p.label || p.target, target: p.target, discovered: true, sources: p.sources || [] });
  }
  return Array.from(merged.values());
}

function safeMinecraftTargetValue(t) {
  if (String(t || '').startsWith('@')) return String(t);
  const raw = normalizePlayerName(t);
  if (!isValidPlayerName(raw)) throw new Error('Invalid player target');
  // Bedrock accepts quoted gamer tags. Quoting also handles Xbox names with spaces.
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function safeDockerName(value, label = 'Docker name') {
  const v = String(value || '').trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(v)) throw new Error(`Invalid ${label}`);
  return v;
}

function runDocker(args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn('docker', args);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ ok: false, code: 1, stdout, stderr: err.message, timedOut });
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr, timedOut });
    });
  });
}

function parseMinecraftScreenSession(screenList, configured = 'auto') {
  const text = String(screenList || '');
  const desired = String(configured || 'auto').trim();
  if (desired && desired !== 'auto') {
    const exact = new RegExp(`^\\s*(${desired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s+\\((Attached|Detached)\\)`, 'm');
    const hit = text.match(exact);
    if (hit) return hit[1];
  }

  const matches = [];
  const re = /^\s*([A-Za-z0-9_.-]*\.minecraft|[0-9]+\.minecraft)\s+\((Attached|Detached)\)/gm;
  let m;
  while ((m = re.exec(text)) !== null) matches.push({ name: m[1], state: m[2] });
  if (!matches.length) {
    const broad = text.match(/\b([A-Za-z0-9_.-]+\.minecraft)\b/);
    if (broad) return broad[1];
    return '';
  }

  const attached = matches.find(x => x.state === 'Attached');
  return (attached || matches[0]).name;
}

function publicAttachmentState(cfg) {
  return {
    ok: attachmentState.ok,
    container: attachmentState.container || cfg.minecraftContainerName,
    dockerUser: attachmentState.dockerUser || cfg.dockerUser || 'nobody',
    configuredScreenSession: attachmentState.configuredScreenSession || cfg.screenSession || 'auto',
    activeScreenSession: attachmentState.activeScreenSession || null,
    method: attachmentState.method || cfg.commandMethod || 'attach',
    checkedAt: attachmentState.checkedAt,
    reason: attachmentState.reason,
    error: attachmentState.error || null,
    screenList: attachmentState.screenList || ''
  };
}

async function refreshAttachment(cfg, reason = 'manual') {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const container = safeDockerName(cfg.minecraftContainerName, 'Minecraft container name');
    const user = safeDockerName(cfg.dockerUser || 'nobody', 'Docker user');
    const configuredScreenSession = String(cfg.screenSession || 'auto').trim() || 'auto';
    const method = String(cfg.commandMethod || 'attach').toLowerCase();

    const base = {
      ok: false,
      container,
      dockerUser: user,
      configuredScreenSession,
      activeScreenSession: null,
      method,
      checkedAt: new Date().toISOString(),
      reason,
      error: null,
      screenList: ''
    };

    try {
      const inspect = await runDocker(['inspect', '-f', '{{.State.Running}}', container], 7000);
      if (!inspect.ok || inspect.stdout.trim() !== 'true') {
        attachmentState = {
          ...base,
          error: `Minecraft container is not running or not found: ${container}. ${stripAnsi(inspect.stderr || inspect.stdout || '').trim()}`.trim()
        };
        return attachmentState;
      }

      const screen = await runDocker(['exec', '-u', user, container, 'bash', '-lc', 'screen -ls 2>&1'], 10000);
      const screenList = stripAnsi(`${screen.stdout || ''}${screen.stderr || ''}`).trim();
      const activeScreenSession = parseMinecraftScreenSession(screenList, configuredScreenSession);
      if (!activeScreenSession) {
        attachmentState = {
          ...base,
          screenList,
          error: `No Minecraft screen session found for user ${user}.`
        };
        return attachmentState;
      }

      attachmentState = {
        ...base,
        ok: true,
        activeScreenSession,
        screenList,
        error: null
      };
      return attachmentState;
    } catch (err) {
      attachmentState = { ...base, error: err.message };
      return attachmentState;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function getActiveScreenSession(cfg) {
  const configured = String(cfg.screenSession || 'auto').trim() || 'auto';
  if (configured !== 'auto') return safeDockerName(configured, 'screen session name');

  const needsRefresh = !attachmentState.ok ||
    attachmentState.container !== cfg.minecraftContainerName ||
    attachmentState.dockerUser !== (cfg.dockerUser || 'nobody') ||
    attachmentState.configuredScreenSession !== configured;

  if (needsRefresh || cfg.refreshAttachmentBeforeCommand === true) {
    await refreshAttachment(cfg, needsRefresh ? 'before-command' : 'before-command-forced');
  }

  if (!attachmentState.ok || !attachmentState.activeScreenSession) {
    throw new Error(attachmentState.error || 'No Minecraft screen session found');
  }
  return safeDockerName(attachmentState.activeScreenSession, 'screen session name');
}

async function sendMinecraftCommandOnce(command, cfg, activeSession) {
  return new Promise((resolve) => {
    const container = safeDockerName(cfg.minecraftContainerName, 'Minecraft container name');
    const user = safeDockerName(cfg.dockerUser || 'nobody', 'Docker user');
    const prefix = cfg.commandPrefix || '';
    const cmdToSend = `${prefix}${command}`;
    const sessionQ = shellQuote(activeSession);
    const method = String(cfg.commandMethod || 'attach').toLowerCase();

    let shell;
    if (method === 'stuff') {
      const commandQ = shellQuote(cmdToSend);
      shell = [
        `SESSION=${sessionQ}`,
        `screen -S "$SESSION" -p 0 -X stuff ${commandQ}$(printf \\r)`
      ].join('; ');
    } else {
      const payloadQ = shellQuote(cmdToSend.replace(/\r|\n/g, ' '));
      shell = [
        `SESSION=${sessionQ}`,
        `if command -v script >/dev/null 2>&1; then printf '%s\\r\\001d' ${payloadQ} | script -q -c "screen -x $SESSION" /dev/null; else echo "The 'script' command is missing in the Minecraft container" >&2; exit 3; fi`
      ].join('; ');
    }

    const args = ['exec', '-i', '-u', user, container, 'bash', '-lc', shell];
    const child = spawn('docker', args);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, Number(cfg.commandTimeoutMs || 15000));

    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('error', err => {
      clearTimeout(timer);
      resolve(compactResult({ ok: false, code: 1, stdout, stderr: err.message, command: cmdToSend, method, activeScreenSession: activeSession, timedOut }, cfg));
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve(compactResult({ ok: code === 0, code, stdout, stderr, command: cmdToSend, method, activeScreenSession: activeSession, timedOut }, cfg));
    });
  });
}

function looksLikeStaleScreen(result) {
  const text = `${result.stdout || ''}\n${result.stderr || ''}`.toLowerCase();
  return text.includes('no screen') ||
    text.includes('not found') ||
    text.includes('no sockets') ||
    text.includes('cannot exec') ||
    text.includes('permission denied') ||
    text.includes('there is no screen');
}

async function runMinecraftCommand(command, cfg) {
  try {
    const activeSession = await getActiveScreenSession(cfg);
    let result = await sendMinecraftCommandOnce(command, cfg, activeSession);
    if (!result.ok && String(cfg.screenSession || 'auto') === 'auto' && looksLikeStaleScreen(result)) {
      await refreshAttachment(cfg, 'retry-after-command-failure');
      if (attachmentState.ok && attachmentState.activeScreenSession && attachmentState.activeScreenSession !== activeSession) {
        result = await sendMinecraftCommandOnce(command, cfg, attachmentState.activeScreenSession);
      }
    }
    return result;
  } catch (err) {
    return compactResult({ ok: false, code: 1, stdout: '', stderr: err.message, command, method: cfg.commandMethod || 'attach' }, cfg);
  }
}

function buildKitCommands(kit, target, cfg) {
  const commands = [];

  for (const entry of kit.items || []) {
    const item = safeItemName(entry.item);
    const amount = safeAmount(entry.amount || 1, 2304);
    commands.push(`give ${target} ${item} ${amount}`);
  }

  if (kit.xp) {
    const amount = safeAmount(kit.xp.amount || 1, 10000);
    commands.push(`xp ${amount}${kit.xp.levels ? 'L' : ''} ${target}`);
  }

  return commands;
}

async function runMinecraftCommands(commands, cfg) {
  const results = [];
  for (const command of commands) {
    const result = await runMinecraftCommand(command, cfg);
    results.push(result);
    if (!result.ok) break;
    await sleep(175);
  }
  return { ok: results.every(r => r.ok), results, commands };
}

function requestHostParts(req) {
  const hostHeader = String((req.headers || {}).host || '').trim();
  const hostWithoutPort = hostHeader.startsWith('[')
    ? hostHeader.slice(1).split(']')[0]
    : hostHeader.split(':')[0];
  return { hostHeader, hostWithoutPort: hostWithoutPort || hostHeader };
}

function resolveTemplateUrl(value, req) {
  const { hostHeader, hostWithoutPort } = requestHostParts(req);
  return String(value || '')
    .replace(/\[HOST\]/g, hostHeader)
    .replace(/\[IP\]/g, hostWithoutPort);
}

function publicConfig(cfg, req, session = null) {
  const copy = { ...cfg };
  delete copy.auth;
  copy.kits = mergedKits(cfg);
  copy.appVersion = APP_VERSION;
  copy.currentUser = session ? { username: session.username, role: session.role } : null;
  copy.security = {
    authenticated: true,
    transportEncrypted: requestIsHttps(req),
    note: requestIsHttps(req) ? 'HTTPS transport detected.' : 'HTTP detected. Use an HTTPS reverse proxy for encrypted transport.'
  };
  if (Array.isArray(copy.links)) {
    copy.links = copy.links.map(link => ({ ...link, url: resolveTemplateUrl(link.url, req) }));
  }
  return copy;
}

async function handleApi(req, res, url, cfg) {
  try {
    if (url.pathname === '/api/auth/status' && req.method === 'GET') {
      const session = getSession(req);
      json(res, 200, {
        ok: true,
        authenticated: Boolean(session),
        username: session ? session.username : null,
        role: session ? session.role : null,
        https: requestIsHttps(req),
        appTitle: cfg.appTitle || 'CraftCommand Center',
        appVersion: APP_VERSION
      });
      return;
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      if (!sameOriginAllowed(req)) {
        json(res, 403, { ok: false, error: 'Cross-origin request blocked' });
        return;
      }
      const rate = loginRateState(req);
      if (rate.blocked) {
        json(res, 429, { ok: false, error: `Too many login attempts. Try again in ${rate.retrySeconds} seconds.` });
        return;
      }
      const body = await readBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const authUser = findAuthUser(cfg, username);
      if (!authUser || !verifyPassword(password, authUser.passwordHash)) {
        recordLoginFailure(rate);
        appendActivity(cfg, { username: username || 'unknown', role: 'viewer', action: 'login', summary: 'Failed sign-in', ok: false, error: 'Invalid username or password', ip: clientIp(req) });
        json(res, 401, { ok: false, error: 'Invalid username or password' });
        return;
      }
      clearLoginFailures(req);
      const session = createSession(authUser.username, authUser.role, cfg);
      setSessionCookie(req, res, session.token, session.maxAgeSeconds);
      appendActivity(cfg, { username: authUser.username, role: authUser.role, action: 'login', summary: 'Signed in', ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, username: authUser.username, role: authUser.role, expiresAt: new Date(session.expiresAt).toISOString() });
      return;
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = parseCookies(req).ccc_session;
      if (token) sessions.delete(token);
      clearSessionCookie(req, res);
      json(res, 200, { ok: true });
      return;
    }

    const session = requireAuth(req, res);
    if (!session) return;
    if (req.method !== 'GET' && !sameOriginAllowed(req)) {
      json(res, 403, { ok: false, error: 'Cross-origin request blocked' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      json(res, 200, publicConfig(cfg, req, session));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      json(res, 200, { ok: true, attachment: publicAttachmentState(cfg) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/players') {
      if (!playerState.checkedAt && (cfg.playerDiscovery || {}).autoRefreshOnPageLoad === true) {
        discoverKnownPlayers(cfg, 'page-load').catch(() => {});
      }
      json(res, 200, publicPlayers(cfg));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/kits') {
      json(res, 200, { ok: true, kits: mergedKits(cfg) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/activity') {
      const limit = Number(url.searchParams.get('limit') || 100);
      json(res, 200, { ok: true, entries: readActivity(cfg, limit), currentUser: { username: session.username, role: session.role } });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/diagnostics') {
      const diagnostics = await runDiagnostics(cfg, req);
      json(res, 200, diagnostics);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/users') {
      requireRole(session, 'admin');
      json(res, 200, { ok: true, users: publicAuthUsers(cfg), currentUser: { username: session.username, role: session.role } });
      return;
    }

    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    const body = await readBody(req);

    if (url.pathname === '/api/users/save') {
      requireRole(session, 'admin');
      const user = savePersistentAuthUser(cfg, body);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'save-account', target: user.username, summary: `Saved ${user.role} account ${user.username}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, user, users: publicAuthUsers(loadConfig()) });
      return;
    }

    if (url.pathname === '/api/users/delete') {
      requireRole(session, 'admin');
      const deleted = deletePersistentAuthUser(cfg, body.username, session.username);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'delete-account', target: deleted, summary: `Deleted account ${deleted}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, deleted, users: publicAuthUsers(loadConfig()) });
      return;
    }

    if (url.pathname === '/api/activity/clear') {
      requireRole(session, 'admin');
      clearActivity(cfg);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'activity-clear', summary: 'Cleared activity history', ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, message: 'Activity history cleared' });
      return;
    }

    if (url.pathname === '/api/refresh-attachment') {
      requireRole(session, 'operator');
      const state = await refreshAttachment(cfg, 'manual-button');
      appendActivity(cfg, { username: session.username, role: session.role, action: 'refresh-attachment', summary: state.ok ? `Attached to ${state.activeScreenSession}` : 'Attachment refresh failed', ok: state.ok, error: state.error, ip: clientIp(req) });
      json(res, state.ok ? 200 : 500, { ok: state.ok, attachment: publicAttachmentState(cfg), error: state.error || undefined });
      return;
    }

    if (url.pathname === '/api/players/refresh') {
      requireRole(session, 'operator');
      await discoverKnownPlayers(cfg, 'manual-button');
      appendActivity(cfg, { username: session.username, role: session.role, action: 'refresh-players', summary: `Loaded ${publicPlayers(cfg).players.length} targets`, ok: true, ip: clientIp(req) });
      json(res, 200, publicPlayers(cfg));
      return;
    }

    if (url.pathname === '/api/players/add') {
      requireRole(session, 'admin');
      const addedPlayer = addManualPlayer(cfg, body.name || body.player || body.target);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'add-player', target: addedPlayer.target, summary: `Added player ${addedPlayer.label}`, ok: true, ip: clientIp(req) });
      json(res, 200, publicPlayers(cfg));
      return;
    }

    if (url.pathname === '/api/kits/custom/save') {
      requireRole(session, 'admin');
      const kit = saveCustomKit(cfg, body.kit || body);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'save-kit', summary: `Saved custom kit ${kit.label}`, ok: true, commands: (kit.items || []).length + (kit.xp ? 1 : 0), ip: clientIp(req) });
      json(res, 200, { ok: true, kit, kits: mergedKits(cfg) });
      return;
    }

    if (url.pathname === '/api/kits/custom/delete') {
      requireRole(session, 'admin');
      deleteCustomKit(cfg, body.kitId);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'delete-kit', summary: `Deleted custom kit ${body.kitId}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, kits: mergedKits(cfg) });
      return;
    }

    let command;
    requireRole(session, 'operator');
    if (url.pathname === '/api/give') {
      const target = getTarget(body.target, cfg);
      const item = safeItemName(body.item);
      const amount = safeAmount(body.amount, 2304);
      command = `give ${target} ${item} ${amount}`;
    } else if (url.pathname === '/api/xp') {
      const target = getTarget(body.target, cfg);
      const amount = safeAmount(body.amount, 10000);
      command = `xp ${amount}${body.levels ? 'L' : ''} ${target}`;
    } else if (url.pathname === '/api/kit') {
      const target = getTarget(body.target, cfg);
      const kitId = safeKitId(body.kitId);
      const kit = mergedKits(cfg).find(k => k.id === kitId);
      if (!kit) throw new Error('Kit must be one of the available kits');
      const commands = buildKitCommands(kit, target, cfg);
      if (!commands.length) throw new Error('Kit has no commands');
      if (commands.length > 31) throw new Error('Kit is too large; max 30 items plus XP');
      const result = await runMinecraftCommands(commands, cfg);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'send-kit', target: body.target, summary: `Sent kit ${kit.label}`, ok: result.ok, error: result.ok ? null : (result.results.find(r => !r.ok)?.stderr || 'Kit command failed'), commands: result.results.filter(r => r.ok).length, ip: clientIp(req) });
      json(res, result.ok ? 200 : 500, { ok: result.ok, kit: kit.label, sent: result.results.filter(r => r.ok).length, commands: result.commands, results: result.results });
      return;
    } else if (url.pathname === '/api/raw' && cfg.allowRawCommand) {
      command = String(body.command || '').trim();
      if (!command || command.length > 200) throw new Error('Invalid raw command');
      if (!/^[A-Za-z0-9_:@ .,/"'\-]+$/.test(command)) throw new Error('Raw command has blocked characters');
    } else {
      json(res, 404, { ok: false, error: 'Unknown API path' });
      return;
    }

    const result = await runMinecraftCommand(command, cfg);
    appendActivity(cfg, { username: session.username, role: session.role, action: url.pathname === '/api/xp' ? 'give-xp' : url.pathname === '/api/give' ? 'give-item' : 'raw-command', target: body.target || null, summary: command, ok: result.ok, error: result.ok ? null : (result.stderr || result.error), commands: result.ok ? 1 : 0, ip: clientIp(req) });
    json(res, result.ok ? 200 : 500, result);
  } catch (err) {
    json(res, 400, { ok: false, error: err.message });
  }
}

function serveStatic(req, res, url) {
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^\.{2,}/, '');
  const full = path.join(__dirname, 'public', file);
  if (!full.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(full)) {
    text(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(full).toLowerCase();
  const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.js' ? 'application/javascript; charset=utf-8' : ext === '.json' ? 'application/json; charset=utf-8' : ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : ext === '.ico' ? 'image/x-icon' : 'application/octet-stream';
  text(res, 200, fs.readFileSync(full), type);
}

const server = http.createServer(async (req, res) => {
  const cfg = loadConfig();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url, cfg);
  } else {
    serveStatic(req, res, url);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CraftCommand Center listening on http://0.0.0.0:${PORT}`);
  try {
    const cfg = loadConfig();
    if (cfg.autoRefreshAttachmentOnBoot !== false) {
      refreshAttachment(cfg, 'startup').then(state => {
        if (state.ok) {
          console.log(`Minecraft attachment ready: ${state.container} / ${state.dockerUser} / ${state.activeScreenSession}`);
        } else {
          console.log(`Minecraft attachment not ready: ${state.error}`);
        }
      });
    }
    if ((cfg.playerDiscovery || {}).autoRefreshOnBoot !== false) {
      discoverKnownPlayers(cfg, 'startup').then(state => {
        if (state.ok) {
          console.log(`Known player discovery ready: ${state.players.length} player(s)`);
        } else {
          console.log(`Known player discovery issue: ${state.error}`);
        }
      });
    }
  } catch (err) {
    console.log(`Minecraft attachment startup check skipped: ${err.message}`);
  }
});
