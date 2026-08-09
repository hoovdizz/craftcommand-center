const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const dgram = require('dgram');
const net = require('net');
const os = require('os');
const https = require('https');
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

  out.externalServer = { ...(out.externalServer || {}) };
  const externalHost = firstEnv('CCC_EXTERNAL_HOST');
  const externalPort = firstEnv('CCC_EXTERNAL_PORT');
  const externalTimeout = firstEnv('CCC_EXTERNAL_TIMEOUT_MS');
  const externalMode = firstEnv('CCC_EXTERNAL_CHECK_MODE');
  if (externalHost) out.externalServer.host = externalHost;
  if (externalPort && Number.isFinite(Number(externalPort))) out.externalServer.port = Number(externalPort);
  if (externalTimeout && Number.isFinite(Number(externalTimeout))) out.externalServer.timeoutMs = Number(externalTimeout);
  if (externalMode) out.externalServer.mode = externalMode;
  out.externalServer.enabled = envBool('CCC_EXTERNAL_CHECK_ENABLED', out.externalServer.enabled === true || Boolean(out.externalServer.host));

  out.backup = { ...(out.backup || {}) };
  const backupSource = firstEnv('CCC_BACKUP_SOURCE_PATH');
  const backupDir = firstEnv('CCC_BACKUP_DIR');
  const backupRetention = firstEnv('CCC_BACKUP_RETENTION');
  const backupTimeout = firstEnv('CCC_BACKUP_TIMEOUT_MS');
  if (backupSource) out.backup.sourcePath = backupSource;
  if (backupDir) out.backup.directory = backupDir;
  if (backupRetention && Number.isFinite(Number(backupRetention))) out.backup.retention = Number(backupRetention);
  if (backupTimeout && Number.isFinite(Number(backupTimeout))) out.backup.timeoutMs = Number(backupTimeout);
  out.backup.enabled = envBool('CCC_BACKUP_ENABLED', out.backup.enabled !== false);
  out.backup.saveHold = envBool('CCC_BACKUP_SAVE_HOLD', out.backup.saveHold !== false);

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
  return normalizedAuthUsers(cfg).find(user => safeEqualText(user.username.toLowerCase(), wanted.toLowerCase())) || null;
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
  const resolved = applyEnvOverrides(cfg);
  resolved.connection = readConnectionSettings(resolved);
  resolved.quickItems = readQuickItems(resolved);
  resolved.teleportLocations = readTeleportLocations(resolved);
  return resolved;
}

function connectionSettingsPath() { return path.join(DEFAULT_DATA_DIR, 'connection.json'); }
function sanitizePort(value, fallback) {
  const port = Number(value == null || value === '' ? fallback : value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ports must be whole numbers from 1 to 65535');
  return port;
}
function sanitizeConnectionSettings(value = {}) {
  const mode = String(value.mode || 'binhex').toLowerCase();
  if (!['binhex', 'rcon'].includes(mode)) throw new Error('Connection mode must be binhex or rcon');
  const host = String(value.host || '').trim().replace(/^\[|\]$/g, '');
  if (host && (host.length > 253 || !/^[A-Za-z0-9_.:-]+$/.test(host))) throw new Error('Server host must be a hostname or IP address');
  return { mode, host, gamePort: sanitizePort(value.gamePort, 19132), rconPort: sanitizePort(value.rconPort, 25575), rconPassword: String(value.rconPassword || '').slice(0, 512) };
}
function readConnectionSettings(cfg) {
  const defaults = sanitizeConnectionSettings(cfg.connection || {});
  try {
    if (!fs.existsSync(connectionSettingsPath())) return defaults;
    return sanitizeConnectionSettings({ ...defaults, ...JSON.parse(fs.readFileSync(connectionSettingsPath(), 'utf8')) });
  } catch (err) { console.log(`Could not load connection settings: ${err.message}`); return defaults; }
}
function writeConnectionSettings(value) {
  const clean = sanitizeConnectionSettings(value);
  if (clean.mode === 'rcon' && (!clean.host || !clean.rconPassword)) throw new Error('RCON mode requires a server host and RCON password');
  fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
  fs.writeFileSync(connectionSettingsPath(), `${JSON.stringify(clean, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return clean;
}
function publicConnectionSettings(cfg) {
  const value = sanitizeConnectionSettings(cfg.connection || {});
  return { ...value, rconPassword: '', passwordConfigured: Boolean(value.rconPassword) };
}


function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https://minecraft.wiki https://minecraft.fandom.com https://static.wikia.nocookie.net; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'");
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

function quickItemsPath() {
  return path.join(DEFAULT_DATA_DIR, 'quick-items.json');
}

function sanitizeQuickItem(entry) {
  const item = safeItemName(entry?.item);
  const amount = safeAmount(entry?.amount || 1, 2304);
  const fallbackLabel = `${item.replace(/^minecraft:/, '').split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')} x${amount}`;
  const label = String(entry?.label || fallbackLabel).trim().slice(0, 60);
  if (!label) throw new Error('Quick button label is required');
  return { label, item, amount };
}

function factoryQuickItems() {
  const factory = JSON.parse(fs.readFileSync(FALLBACK_CONFIG, 'utf8'));
  return (factory.quickItems || []).map(sanitizeQuickItem);
}

function readQuickItems(cfg) {
  const filePath = quickItemsPath();
  if (!fs.existsSync(filePath)) return (cfg.quickItems || []).map(sanitizeQuickItem);
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.quickItems;
    return (Array.isArray(list) ? list : []).map(sanitizeQuickItem);
  } catch (err) {
    console.log(`Could not load quick buttons: ${err.message}`);
    return (cfg.quickItems || []).map(sanitizeQuickItem);
  }
}

function writeQuickItems(items) {
  const clean = items.map(sanitizeQuickItem);
  if (clean.length > 50) throw new Error('A maximum of 50 quick buttons is allowed');
  fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
  fs.writeFileSync(quickItemsPath(), `${JSON.stringify({ quickItems: clean, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  return clean;
}

function addQuickItem(cfg, entry) {
  const item = sanitizeQuickItem(entry);
  const items = readQuickItems(cfg);
  items.push(item);
  return { item, quickItems: writeQuickItems(items) };
}

function deleteQuickItem(cfg, index) {
  const items = readQuickItems(cfg);
  const position = Number(index);
  if (!Number.isInteger(position) || position < 0 || position >= items.length) throw new Error('Quick button was not found');
  const [deleted] = items.splice(position, 1);
  return { deleted, quickItems: writeQuickItems(items) };
}

function resetQuickItems() {
  return writeQuickItems(factoryQuickItems());
}

function reorderQuickItems(cfg, order) {
  const items = readQuickItems(cfg);
  if (!Array.isArray(order) || order.length !== items.length) throw new Error('Quick button order is incomplete');
  const indexes = order.map(Number);
  if (indexes.some(index => !Number.isInteger(index) || index < 0 || index >= items.length) || new Set(indexes).size !== items.length) {
    throw new Error('Quick button order is invalid');
  }
  return writeQuickItems(indexes.map(index => items[index]));
}

function teleportLocationsPath() {
  return path.join(DEFAULT_DATA_DIR, 'teleport-locations.json');
}

function safeCoordinate(value, axis) {
  if (value === null || value === undefined || String(value).trim() === '') throw new Error(`${axis.toUpperCase()} coordinate is required`);
  const coordinate = Number(value);
  const limit = axis === 'y' ? 2048 : 30000000;
  if (!Number.isFinite(coordinate) || coordinate < -limit || coordinate > limit) {
    throw new Error(`${axis.toUpperCase()} coordinate must be between ${-limit} and ${limit}`);
  }
  return Object.is(coordinate, -0) ? 0 : coordinate;
}

function sanitizeTeleportLocation(entry) {
  const title = String(entry?.title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60);
  if (!title) throw new Error('Teleport button title is required');
  const dimension = String(entry?.dimension || 'current').trim().toLowerCase();
  if (!['current', 'overworld', 'nether', 'the_end'].includes(dimension)) throw new Error('Invalid teleport dimension');
  return {
    title,
    dimension,
    x: safeCoordinate(entry?.x, 'x'),
    y: safeCoordinate(entry?.y, 'y'),
    z: safeCoordinate(entry?.z, 'z')
  };
}

function factoryTeleportLocations() {
  const factory = JSON.parse(fs.readFileSync(FALLBACK_CONFIG, 'utf8'));
  return (factory.teleportLocations || []).map(sanitizeTeleportLocation);
}

function readTeleportLocations(cfg) {
  const filePath = teleportLocationsPath();
  if (!fs.existsSync(filePath)) return (cfg.teleportLocations || []).map(sanitizeTeleportLocation);
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.teleportLocations;
    return (Array.isArray(list) ? list : []).map(sanitizeTeleportLocation);
  } catch (err) {
    console.log(`Could not load teleport locations: ${err.message}`);
    return (cfg.teleportLocations || []).map(sanitizeTeleportLocation);
  }
}

function writeTeleportLocations(locations) {
  const clean = locations.map(sanitizeTeleportLocation);
  if (clean.length > 50) throw new Error('A maximum of 50 teleport locations is allowed');
  fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
  fs.writeFileSync(teleportLocationsPath(), `${JSON.stringify({ teleportLocations: clean, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  return clean;
}

function addTeleportLocation(cfg, entry) {
  const location = sanitizeTeleportLocation(entry);
  const locations = readTeleportLocations(cfg);
  locations.push(location);
  return { location, teleportLocations: writeTeleportLocations(locations) };
}

function updateTeleportLocation(cfg, index, entry) {
  const locations = readTeleportLocations(cfg);
  const position = Number(index);
  if (!Number.isInteger(position) || position < 0 || position >= locations.length) throw new Error('Teleport location was not found');
  const previous = locations[position];
  const location = sanitizeTeleportLocation(entry);
  locations[position] = location;
  return { previous, location, teleportLocations: writeTeleportLocations(locations) };
}

function deleteTeleportLocation(cfg, index) {
  const locations = readTeleportLocations(cfg);
  const position = Number(index);
  if (!Number.isInteger(position) || position < 0 || position >= locations.length) throw new Error('Teleport location was not found');
  const [deleted] = locations.splice(position, 1);
  return { deleted, teleportLocations: writeTeleportLocations(locations) };
}

function resetTeleportLocations() {
  return writeTeleportLocations(factoryTeleportLocations());
}

function reorderTeleportLocations(cfg, order) {
  const locations = readTeleportLocations(cfg);
  if (!Array.isArray(order) || order.length !== locations.length) throw new Error('Teleport location order is incomplete');
  const indexes = order.map(Number);
  if (indexes.some(index => !Number.isInteger(index) || index < 0 || index >= locations.length) || new Set(indexes).size !== locations.length) {
    throw new Error('Teleport location order is invalid');
  }
  return writeTeleportLocations(indexes.map(index => locations[index]));
}

function teleportCommand(location, target) {
  const clean = sanitizeTeleportLocation(location);
  const command = `tp ${target} ${clean.x} ${clean.y} ${clean.z} true`;
  return clean.dimension === 'current' ? command : `execute in ${clean.dimension} run ${command}`;
}

function teleportPreloadPlan(location, target) {
  const clean = sanitizeTeleportLocation(location);
  const areaName = `ccc_tp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const add = `tickingarea add circle ${clean.x} ${clean.y} ${clean.z} 1 ${areaName} true`;
  const dimensions = ['overworld', 'nether', 'the_end'];
  const addCommands = clean.dimension === 'current'
    ? (target.startsWith('@') ? dimensions.map(dimension => `execute in ${dimension} run ${add}`) : [`execute at ${target} run ${add}`])
    : [`execute in ${clean.dimension} run ${add}`];
  const cleanupDimensions = clean.dimension === 'current' ? dimensions : [clean.dimension];
  return {
    addCommands,
    teleport: teleportCommand(clean, target),
    cleanupCommands: cleanupDimensions.map(dimension => `execute in ${dimension} run tickingarea remove ${areaName}`)
  };
}

function commandOutput(result) {
  return stripAnsi(`${result?.stdout || ''}\n${result?.stderr || ''}`).trim();
}

function teleportOutputFailed(result) {
  return /unable to teleport|no targets matched|syntax error|unknown command|failed to execute/i.test(commandOutput(result));
}

function conciseCommandFailure(result, fallback) {
  const output = commandOutput(result);
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const meaningful = lines.filter(line => /unable to teleport|unloaded area|ticking area|no targets matched|syntax error|unknown command|failed to execute/i.test(line)).pop();
  return meaningful || (output ? output.slice(-800) : fallback);
}

async function runTeleportWithPreload(location, target, cfg) {
  const plan = teleportPreloadPlan(location, target);
  const rawCfg = { ...cfg, showRawOutput: true };
  const results = [];
  let preloadOk = true;
  for (const command of plan.addCommands) {
    const result = await runMinecraftCommand(command, rawCfg);
    results.push(result);
    if (!result.ok || /could not add ticking area|maximum number of ticking areas|syntax error|failed to execute/i.test(commandOutput(result))) {
      preloadOk = false;
      break;
    }
  }

  let teleportResult = null;
  if (preloadOk) {
    await sleep(750);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      teleportResult = await runMinecraftCommand(plan.teleport, rawCfg);
      results.push(teleportResult);
      const unloaded = /unloaded area/i.test(commandOutput(teleportResult));
      if (teleportResult.ok && !teleportOutputFailed(teleportResult)) break;
      if (!unloaded || attempt === 2) break;
      await sleep(1000);
    }
  }

  const cleanupResults = [];
  for (const command of plan.cleanupCommands) {
    const result = await runMinecraftCommand(command, rawCfg);
    cleanupResults.push(result);
    await sleep(75);
  }

  const ok = preloadOk && Boolean(teleportResult?.ok) && !teleportOutputFailed(teleportResult);
  const failure = !preloadOk
    ? conciseCommandFailure(results.find(result => !result.ok || /could not add ticking area|maximum number of ticking areas|syntax error|failed to execute/i.test(commandOutput(result))), 'Could not preload the destination chunks')
    : (!ok ? conciseCommandFailure(teleportResult, 'Teleport command failed') : null);
  const cleanupFailed = cleanupResults.some(result => !result.ok);
  return {
    ok,
    command: plan.teleport,
    activeScreenSession: teleportResult?.activeScreenSession || results[0]?.activeScreenSession || null,
    method: teleportResult?.method || results[0]?.method || cfg.commandMethod || 'attach',
    error: failure,
    warning: cleanupFailed ? 'The teleport completed, but one or more temporary ticking-area cleanup commands could not be sent.' : null,
    commands: results.length + cleanupResults.length
  };
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
  const safeLimit = Math.max(1, Math.min(10000, Number(limit || 100)));
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

function readActivityForSession(cfg, session, limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
  if (normalizeRole(session?.role) === 'admin') {
    return { entries: readActivity(cfg, safeLimit), scope: 'all' };
  }
  const wanted = String(session?.username || '').trim().toLowerCase();
  const entries = readActivity(cfg, 10000)
    .filter(entry => String(entry.username || '').trim().toLowerCase() === wanted)
    .slice(0, safeLimit);
  return { entries, scope: 'self' };
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
  const networkMode = (cfg.connection || {}).mode === 'rcon';
  add('connection-mode', 'Minecraft connection', true, networkMode ? `Binhex Windows / RCON at ${(cfg.connection || {}).host}:${(cfg.connection || {}).rconPort}` : 'Binhex Unraid / GNU screen');
  if (!networkMode) add('docker-socket', 'Docker socket', fs.existsSync('/var/run/docker.sock'), fs.existsSync('/var/run/docker.sock') ? 'Available' : 'Missing /var/run/docker.sock');
  add('data', 'Persistent data', dataDirectoryWritable(), dataDirectoryWritable() ? `${DEFAULT_DATA_DIR} is writable` : `${DEFAULT_DATA_DIR} is not writable`);
  add('https', 'Encrypted browser connection', requestIsHttps(req), requestIsHttps(req) ? 'HTTPS detected' : 'HTTP detected; use a reverse proxy for encryption', 'warning');

  const containerName = safeDockerName(cfg.minecraftContainerName || 'binhex-minecraftbedrockserver', 'Minecraft container name');
  if (!networkMode) {
  const inspect = await runDocker(['inspect', '--format', '{{.State.Running}}|{{.State.Status}}|{{.Config.Image}}', containerName], 8000);
  if (inspect.ok) {
    const [running, status, image] = inspect.stdout.trim().split('|');
    add('container', 'Binhex container', running === 'true', `${containerName}: ${status || 'unknown'} (${image || 'unknown image'})`);
  } else {
    add('container', 'Binhex container', false, stripAnsi(inspect.stderr || inspect.stdout || 'Container not found').trim());
  }
  }

  const attachment = await refreshAttachment(cfg, 'diagnostics');
  add('console', networkMode ? 'RCON authentication' : 'Minecraft console attachment', attachment.ok, attachment.ok ? (networkMode ? attachment.endpoint : `${attachment.activeScreenSession} as ${attachment.dockerUser}`) : attachment.error || 'Console connection unavailable');

  const external = await checkExternalReachability(cfg);
  if (external.configured) add('external', 'Public Bedrock endpoint', external.reachable, external.reachable ? `${external.endpoint} replied in ${external.latencyMs} ms` : `${external.endpoint}: ${external.error || 'No response'}`, 'warning');
  else add('external', 'Public Bedrock endpoint', true, external.error || 'Not configured (optional)', 'warning');

  try {
    const backup = backupSettings(cfg);
    fs.mkdirSync(backup.directory, { recursive: true });
    fs.accessSync(backup.directory, fs.constants.W_OK);
    add('backup', 'Backup/export storage', true, backup.enabled ? `${backup.directory} is writable` : 'Backup/export is disabled', 'warning');
  } catch (err) {
    add('backup', 'Backup/export storage', false, err.message, 'warning');
  }

  const users = normalizedAuthUsers(cfg);
  add('auth', 'Dashboard account', users.length > 0, `${users.length} enabled account(s)`);
  const weakDefault = String(process.env.CCC_PASSWORD || '') === 'changemenow' || String(process.env.MCQB_PASSWORD || '') === 'changemenow';
  add('default-password', 'Default password changed', !weakDefault, weakDefault ? 'Change the default password before beta testing' : 'No default environment password detected', 'warning');

  const errors = checks.filter(c => !c.ok && c.severity !== 'warning').length;
  const warnings = checks.filter(c => !c.ok && c.severity === 'warning').length;
  return { ok: errors === 0, ready: errors === 0, errors, warnings, checkedAt: new Date().toISOString(), checks, attachment: publicAttachmentState(cfg), appVersion: APP_VERSION };
}


function externalServerSettings(cfg) {
  const raw = cfg.externalServer || {};
  const host = String(raw.host || '').trim().replace(/^\[|\]$/g, '');
  const port = Math.max(1, Math.min(65535, Number(raw.port || 19132)));
  const timeoutMs = Math.max(1000, Math.min(30000, Number(raw.timeoutMs || 5000)));
  const mode = ['external', 'local', 'both'].includes(String(raw.mode || '').toLowerCase()) ? String(raw.mode).toLowerCase() : 'external';
  return { enabled: raw.enabled === true && Boolean(host), host, port, timeoutMs, mode };
}

function validateExternalHost(host) {
  const value = String(host || '').trim();
  if (!value || value.length > 253 || !/^[A-Za-z0-9_.:-]+$/.test(value)) throw new Error('External host must be a hostname or IP address');
  return value;
}

function queryBedrockUdp(hostValue, portValue, timeoutMsValue) {
  return new Promise((resolve) => {
    const host = validateExternalHost(hostValue);
    const port = Math.max(1, Math.min(65535, Number(portValue || 19132)));
    const timeoutMs = Math.max(1000, Math.min(30000, Number(timeoutMsValue || 5000)));
    const started = Date.now();
    const family = host.includes(':') ? 'udp6' : 'udp4';
    const socket = dgram.createSocket(family);
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve({ endpoint: `${host}:${port}`, checkedAt: new Date().toISOString(), ...result });
    };
    const timer = setTimeout(() => finish({ configured: true, reachable: false, error: `No Bedrock UDP response within ${timeoutMs} ms`, latencyMs: null }), timeoutMs);
    socket.on('error', err => finish({ configured: true, reachable: false, error: err.message, latencyMs: null }));
    socket.on('message', message => {
      if (!message || message.length < 35 || message[0] !== 0x1c) return;
      try {
        const length = message.readUInt16BE(33);
        const motdText = message.subarray(35, Math.min(message.length, 35 + length)).toString('utf8');
        const fields = motdText.split(';');
        finish({
          configured: true,
          reachable: true,
          latencyMs: Date.now() - started,
          motd: fields[1] || '',
          protocol: fields[2] || '',
          version: fields[3] || '',
          onlinePlayers: Number(fields[4] || 0),
          maxPlayers: Number(fields[5] || 0),
          subMotd: fields[7] || '',
          gameMode: fields[8] || '',
          rawMotd: motdText,
          error: null
        });
      } catch (err) {
        finish({ configured: true, reachable: false, error: `Invalid Bedrock UDP response: ${err.message}`, latencyMs: Date.now() - started });
      }
    });
    const magic = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
    const packet = Buffer.alloc(33);
    packet[0] = 0x01;
    packet.writeBigInt64BE(BigInt(Date.now()), 1);
    magic.copy(packet, 9);
    crypto.randomBytes(8).copy(packet, 25);
    socket.send(packet, port, host, err => {
      if (err) finish({ configured: true, reachable: false, error: err.message, latencyMs: null });
    });
  });
}

function localIpv4Subnets(hintAddress = '') {
  const subnets = new Set();
  for (const entries of Object.values(os.networkInterfaces())) for (const entry of entries || []) {
    if (entry.family === 'IPv4' && !entry.internal && entry.address) subnets.add(entry.address.split('.').slice(0, 3).join('.'));
  }
  const hint = String(hintAddress || '').replace(/^::ffff:/, '');
  if (/^(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(hint)) subnets.add(hint.split('.').slice(0, 3).join('.'));
  return [...subnets];
}

function scanLanBedrockServers(portValue, timeoutMs = 1800, hintAddress = '') {
  const port = sanitizePort(portValue, 19132);
  const subnets = localIpv4Subnets(hintAddress);
  if (!subnets.length) return Promise.resolve([]);
  return new Promise(resolve => {
    const socket = dgram.createSocket('udp4');
    const found = new Map();
    const magic = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
    const packet = Buffer.alloc(33); packet[0] = 0x01; packet.writeBigInt64BE(BigInt(Date.now()), 1); magic.copy(packet, 9); crypto.randomBytes(8).copy(packet, 25);
    const finish = () => { try { socket.close(); } catch {} resolve([...found.values()].sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }))); };
    socket.on('message', (message, remote) => {
      if (!message || message.length < 35 || message[0] !== 0x1c) return;
      const length = message.readUInt16BE(33); const fields = message.subarray(35, Math.min(message.length, 35 + length)).toString('utf8').split(';');
      found.set(`${remote.address}:${remote.port}`, { host: remote.address, port: remote.port, motd: fields[1] || 'Minecraft Server', version: fields[3] || '', onlinePlayers: Number(fields[4] || 0), maxPlayers: Number(fields[5] || 0), gameMode: fields[8] || '' });
    });
    socket.on('error', finish);
    socket.bind(0, '0.0.0.0', () => {
      for (const subnet of subnets) for (let last = 1; last <= 254; last += 1) socket.send(packet, port, `${subnet}.${last}`, () => {});
      setTimeout(finish, Math.max(500, Math.min(10000, Number(timeoutMs) || 1800)));
    });
  });
}

function rconPacket(id, type, body) {
  const payload = Buffer.from(String(body), 'utf8'); const packet = Buffer.alloc(payload.length + 14);
  packet.writeInt32LE(payload.length + 10, 0); packet.writeInt32LE(id, 4); packet.writeInt32LE(type, 8); payload.copy(packet, 12); return packet;
}
function runRconCommand(command, cfg) {
  const settings = sanitizeConnectionSettings(cfg.connection || {});
  return new Promise(resolve => {
    if (!settings.host || !settings.rconPassword) { resolve({ ok: false, code: 1, stdout: '', stderr: 'RCON host or password is not configured', command, method: 'rcon' }); return; }
    const socket = net.createConnection({ host: settings.host, port: settings.rconPort }); let buffer = Buffer.alloc(0); let authenticated = false; let settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); socket.destroy(); resolve(compactResult({ command, method: 'rcon', endpoint: `${settings.host}:${settings.rconPort}`, ...result }, cfg)); };
    const timer = setTimeout(() => finish({ ok: false, code: 1, stdout: '', stderr: 'RCON connection timed out', timedOut: true }), Number(cfg.commandTimeoutMs || 15000));
    socket.on('connect', () => socket.write(rconPacket(1, 3, settings.rconPassword)));
    socket.on('error', err => finish({ ok: false, code: 1, stdout: '', stderr: err.message }));
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4 && buffer.length >= buffer.readInt32LE(0) + 4) {
        const size = buffer.readInt32LE(0); const packet = buffer.subarray(0, size + 4); buffer = buffer.subarray(size + 4);
        const id = packet.readInt32LE(4); const body = packet.subarray(12, size + 2).toString('utf8');
        if (!authenticated) { if (id === -1) return finish({ ok: false, code: 1, stdout: '', stderr: 'RCON authentication failed' }); authenticated = true; socket.write(rconPacket(2, 2, command)); }
        else return finish({ ok: true, code: 0, stdout: body, stderr: '' });
      }
    });
  });
}


function queryExternalBedrockStatus(hostValue, portValue, timeoutMsValue) {
  return new Promise((resolve) => {
    const host = validateExternalHost(hostValue);
    const port = Math.max(1, Math.min(65535, Number(portValue || 19132)));
    const timeoutMs = Math.max(1000, Math.min(30000, Number(timeoutMsValue || 8000)));
    const address = encodeURIComponent(`${host}:${port}`);
    const request = https.get({
      hostname: 'api.mcsrvstat.us',
      path: `/bedrock/3/${address}`,
      headers: { 'User-Agent': `CraftCommand-Center/${APP_VERSION} (https://github.com/hoovdizz/craftcommand-center)` },
      timeout: timeoutMs
    }, response => {
      let body = '';
      response.on('data', chunk => { if (body.length < 1000000) body += chunk.toString(); });
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) throw new Error(`External probe returned HTTP ${response.statusCode}`);
          const data = JSON.parse(body);
          const motd = Array.isArray(data?.motd?.clean) ? data.motd.clean.join(' ') : String(data?.motd?.clean || data?.motd?.raw || '');
          resolve({
            configured: true,
            reachable: data.online === true,
            externalConfirmed: true,
            provider: 'mcsrvstat.us',
            providerCached: Boolean(data?.debug?.cachehit),
            endpoint: `${host}:${port}`,
            checkedAt: new Date().toISOString(),
            motd,
            version: String(data?.version || data?.protocol?.name || ''),
            onlinePlayers: Number(data?.players?.online || 0),
            maxPlayers: Number(data?.players?.max || 0),
            gameMode: String(data?.gamemode || ''),
            error: data.online === true ? null : 'The external probe could not reach the Bedrock server'
          });
        } catch (err) {
          resolve({ configured: true, reachable: false, externalConfirmed: false, provider: 'mcsrvstat.us', endpoint: `${host}:${port}`, checkedAt: new Date().toISOString(), error: err.message });
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`External probe timed out after ${timeoutMs} ms`)));
    request.on('error', err => resolve({ configured: true, reachable: false, externalConfirmed: false, provider: 'mcsrvstat.us', endpoint: `${host}:${port}`, checkedAt: new Date().toISOString(), error: err.message }));
  });
}

async function checkExternalReachability(cfg) {
  const settings = externalServerSettings(cfg);
  if (!settings.enabled) {
    return { configured: false, reachable: false, externalConfirmed: false, mode: settings.mode, endpoint: settings.host ? `${settings.host}:${settings.port}` : '', checkedAt: new Date().toISOString(), error: settings.host ? 'External check is disabled' : 'External hostname/IP is not configured' };
  }
  try {
    if (settings.mode === 'local') {
      const local = await queryBedrockUdp(settings.host, settings.port, settings.timeoutMs);
      return { ...local, mode: 'local', externalConfirmed: false, provider: 'Unraid local UDP probe', note: 'This is a local/NAT-loopback test, not confirmation from outside your network.' };
    }
    const external = await queryExternalBedrockStatus(settings.host, settings.port, settings.timeoutMs);
    if (settings.mode === 'external') {
      return { ...external, mode: 'external', note: 'The status is checked by an internet-hosted Bedrock probe and may be cached briefly by the provider.' };
    }
    const local = await queryBedrockUdp(settings.host, settings.port, settings.timeoutMs);
    return { ...external, mode: 'both', localProbe: local, note: 'External reachability uses mcsrvstat.us; localProbe separately reports the Unraid/NAT-loopback result.' };
  } catch (err) {
    return { configured: true, reachable: false, externalConfirmed: false, mode: settings.mode, endpoint: `${settings.host}:${settings.port}`, checkedAt: new Date().toISOString(), error: err.message };
  }
}

function stripDockerTimestamp(line) {
  const match = String(line || '').match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)$/);
  return match ? { at: match[1], body: match[2] } : { at: null, body: String(line || '') };
}

function parseLastPlayerConnection(logText) {
  let last = null;
  for (const rawLine of stripAnsi(logText || '').split(/\r?\n/)) {
    const { at, body } = stripDockerTimestamp(rawLine);
    const connected = body.match(/Player connected:\s*([^,\r\n]+)/i) || body.match(/\b([A-Za-z0-9_ .-]{2,32})\s+joined the game\b/i);
    if (connected) last = { player: normalizePlayerName(connected[1]), at, line: body.trim() };
  }
  return last;
}

function parseOnlinePlayerList(text) {
  const lines = stripAnsi(text || '').split(/\r?\n/);
  let found = { online: 0, max: 0, players: [], raw: '' };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/There are\s+(\d+)\/(\d+)\s+players online:\s*(.*)$/i);
    if (!match) continue;
    let names = String(match[3] || '').trim();
    if (!names && index + 1 < lines.length) {
      const next = stripDockerTimestamp(lines[index + 1]).body.trim();
      if (next && !/^\[.*\b(?:INFO|WARN|ERROR)\]/i.test(next)) names = next;
    }
    const players = names.split(/,\s*/).map(normalizePlayerName).filter(isValidPlayerName);
    found = { online: Number(match[1]), max: Number(match[2]), players, raw: line.trim() };
  }
  return found;
}

async function queryOnlinePlayers(cfg) {
  const rawCfg = { ...cfg, showRawOutput: true, commandTimeoutMs: Math.max(10000, Number(cfg.commandTimeoutMs || 15000)) };
  const result = await runMinecraftCommand('list', rawCfg);
  const parsed = parseOnlinePlayerList(`${result.stdout || ''}\n${result.stderr || ''}`);
  return { ok: result.ok, ...parsed, error: result.ok ? null : (result.stderr || result.error || 'Could not query online players') };
}

function markedFileSections(text) {
  const sections = [];
  const re = /__CCC_FILE__:(.*?)\r?\n([\s\S]*?)\r?\n__CCC_END__/g;
  let match;
  while ((match = re.exec(String(text || ''))) !== null) sections.push({ file: match[1].trim(), content: match[2].trim() });
  return sections;
}

let worldIdentityCache = null;
let worldIdentityInFlight = null;
async function getWorldIdentity(cfg, force = false) {
  const container = safeDockerName(cfg.minecraftContainerName, 'Minecraft container name');
  const now = Date.now();
  if (!force && worldIdentityCache?.container === container && now - worldIdentityCache.cachedAt < 30000) return worldIdentityCache.value;
  if (worldIdentityInFlight) return worldIdentityInFlight;
  worldIdentityInFlight = (async () => {
    const shell = String.raw`set +e
for p in /config /data /minecraft /server /serverdata /home/nobody /home/nobody/minecraft; do
  if [ -d "$p" ]; then
    find "$p" -maxdepth 6 -iname 'server.properties' -type f -print 2>/dev/null
  fi
done | sort -u | while IFS= read -r f; do
  echo "__CCC_FILE__:$f"
  cat "$f" 2>/dev/null || true
  echo "__CCC_END__"
done`;
    const result = await runDocker(['exec', '-u', 'root', container, 'bash', '-lc', shell], 10000);
    const sections = markedFileSections(result.stdout || '');
    for (const section of sections) {
      const match = section.content.match(/^level-name\s*=\s*(.*?)\s*$/mi);
      const name = String(match?.[1] || '').trim();
      if (name) {
        const value = { connected: true, name: name.slice(0, 120), checkedAt: new Date().toISOString(), error: null };
        worldIdentityCache = { container, cachedAt: Date.now(), value };
        return value;
      }
    }
    const detail = stripAnsi(result.stderr || '').trim();
    const value = {
      connected: false,
      name: null,
      checkedAt: new Date().toISOString(),
      error: result.ok ? 'The level-name setting was not found in server.properties' : (detail || 'Could not read server.properties')
    };
    worldIdentityCache = { container, cachedAt: Date.now(), value };
    return value;
  })();
  try { return await worldIdentityInFlight; }
  finally { worldIdentityInFlight = null; }
}

function accessRecordsFromJson(value, source, out = []) {
  if (Array.isArray(value)) {
    for (const entry of value) accessRecordsFromJson(entry, source, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const name = String(value.name || value.playerName || value.username || value.gamertag || '').trim();
  const xuid = String(value.xuid || value.XUID || value.uuid || '').trim();
  const permission = String(value.permission || value.level || '').trim();
  const reason = String(value.reason || '').trim();
  if (name || xuid || permission) out.push({ name: name || (xuid ? `XUID ${xuid}` : 'Unknown'), xuid: xuid || null, permission: permission || null, reason: reason || null, source });
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') accessRecordsFromJson(nested, source, out);
  }
  return out;
}

function uniqueAccessRecords(records) {
  const map = new Map();
  for (const record of records) {
    const key = String(record.xuid || record.name || '').toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, record);
  }
  return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function readServerAccessLists(cfg) {
  const container = safeDockerName(cfg.minecraftContainerName, 'Minecraft container name');
  const shell = String.raw`set +e
for p in /config /data /minecraft /server /serverdata /home/nobody /home/nobody/minecraft; do
  if [ -d "$p" ]; then
    find "$p" -maxdepth 6 \( -iname 'allowlist.json' -o -iname 'whitelist.json' -o -iname 'permissions.json' -o -iname 'banned-players.json' -o -iname 'banned_players.json' -o -iname 'banlist.json' -o -iname 'blacklist.json' -o -iname 'banned.json' -o -iname 'server.properties' \) -type f -print 2>/dev/null
  fi
done | sort -u | while IFS= read -r f; do
  echo "__CCC_FILE__:$f"
  cat "$f" 2>/dev/null || true
  echo "__CCC_END__"
done`;
  const result = await runDocker(['exec', '-u', 'root', container, 'bash', '-lc', shell], 15000);
  if (!result.ok && !result.stdout) return { ok: false, whitelist: [], blacklist: [], permissions: [], files: [], allowListEnabled: null, error: stripAnsi(result.stderr || result.stdout || 'Access-list scan failed').trim() };
  const sections = markedFileSections(result.stdout || '');
  let whitelist = [];
  let blacklist = [];
  let permissions = [];
  let allowListEnabled = null;
  for (const section of sections) {
    const base = path.basename(section.file).toLowerCase();
    if (base === 'server.properties') {
      const match = section.content.match(/^(?:allow-list|white-list)\s*=\s*(true|false)\s*$/mi);
      if (match) allowListEnabled = match[1].toLowerCase() === 'true';
      continue;
    }
    try {
      const parsed = JSON.parse(section.content || 'null');
      const records = accessRecordsFromJson(parsed, section.file);
      if (base.includes('allowlist') || base.includes('whitelist')) whitelist.push(...records);
      else if (base.includes('permission')) permissions.push(...records);
      else if (base.includes('ban') || base.includes('blacklist')) blacklist.push(...records);
    } catch {}
  }
  whitelist = uniqueAccessRecords(whitelist);
  const namesByXuid = new Map(whitelist.filter(x => x.xuid).map(x => [x.xuid, x.name]));
  permissions = uniqueAccessRecords(permissions.map(entry => ({ ...entry, name: entry.xuid && namesByXuid.has(entry.xuid) ? namesByXuid.get(entry.xuid) : entry.name })));
  blacklist = uniqueAccessRecords(blacklist);
  return { ok: true, whitelist, blacklist, permissions, files: sections.map(x => x.file), allowListEnabled, error: result.ok ? null : stripAnsi(result.stderr || '').trim() };
}

let serverOverviewCache = null;
let serverOverviewInFlight = null;
async function getServerOverview(cfg, force = false) {
  const now = Date.now();
  if (!force && serverOverviewCache && now - serverOverviewCache.cachedAt < 20000) return serverOverviewCache.value;
  if (serverOverviewInFlight) return serverOverviewInFlight;
  serverOverviewInFlight = (async () => {
    const container = safeDockerName(cfg.minecraftContainerName, 'Minecraft container name');
    const networkMode = (cfg.connection || {}).mode === 'rcon';
    const [inspectResult, logsResult, access, online, external, world] = await Promise.all([
      networkMode ? Promise.resolve({ ok: false, stdout: '', stderr: '' }) : runDocker(['inspect', container], 10000),
      networkMode ? Promise.resolve({ ok: true, stdout: '', stderr: '' }) : runDocker(['logs', '--timestamps', '--tail', '20000', container], 15000),
      networkMode ? Promise.resolve({ whitelist: [], blacklist: [], permissions: [], allowListEnabled: null }) : readServerAccessLists(cfg),
      queryOnlinePlayers(cfg),
      checkExternalReachability(cfg),
      networkMode ? Promise.resolve({ connected: true, name: null, error: 'World metadata requires local server-file access' }) : getWorldIdentity(cfg, force)
    ]);
    let docker = { running: false, status: 'unknown', startedAt: null, uptimeSeconds: 0, image: null, restartCount: 0, error: null };
    if (inspectResult.ok) {
      try {
        const inspected = JSON.parse(inspectResult.stdout)[0];
        const startedAt = inspected?.State?.StartedAt || null;
        docker = {
          running: inspected?.State?.Running === true,
          status: inspected?.State?.Status || 'unknown',
          startedAt,
          uptimeSeconds: inspected?.State?.Running && startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) : 0,
          image: inspected?.Config?.Image || null,
          restartCount: Number(inspected?.RestartCount || 0),
          health: inspected?.State?.Health?.Status || null,
          error: inspected?.State?.Error || null
        };
      } catch (err) { docker.error = err.message; }
    } else docker.error = networkMode ? null : stripAnsi(inspectResult.stderr || inspectResult.stdout || 'Docker inspect failed').trim();
    const logs = `${logsResult.stdout || ''}\n${logsResult.stderr || ''}`;
    const value = {
      ok: networkMode ? online.ok : docker.running,
      connectionMode: networkMode ? 'rcon' : 'binhex',
      checkedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      docker,
      online,
      lastPlayerConnection: parseLastPlayerConnection(logs),
      world,
      access,
      external,
      attachment: publicAttachmentState(cfg)
    };
    serverOverviewCache = { cachedAt: Date.now(), value };
    return value;
  })();
  try { return await serverOverviewInFlight; }
  finally { serverOverviewInFlight = null; }
}

function safeContainerPath(value, label = 'container path') {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/') || raw.includes('..') || !/^\/[A-Za-z0-9_./-]+$/.test(raw)) throw new Error(`Invalid ${label}`);
  return raw.replace(/\/$/, '') || '/';
}

function backupSettings(cfg) {
  const raw = cfg.backup || {};
  const directory = path.resolve(String(raw.directory || '/app/backups'));
  if (!directory.startsWith('/app/')) throw new Error('Backup directory must be mounted inside /app');
  return {
    enabled: raw.enabled !== false,
    directory,
    sourcePath: safeContainerPath(raw.sourcePath || '/config', 'backup source path'),
    retention: Math.max(1, Math.min(100, Number(raw.retention || 10))),
    timeoutMs: Math.max(60000, Math.min(4 * 60 * 60 * 1000, Number(raw.timeoutMs || 60 * 60 * 1000))),
    saveHold: raw.saveHold !== false
  };
}

function listServerBackups(cfg) {
  const settings = backupSettings(cfg);
  fs.mkdirSync(settings.directory, { recursive: true });
  return fs.readdirSync(settings.directory)
    .filter(name => /^craftcommand-bedrock-[A-Za-z0-9_.-]+\.tar\.gz$/.test(name))
    .map(name => {
      const full = path.join(settings.directory, name);
      const stat = fs.statSync(full);
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function pruneServerBackups(cfg) {
  const settings = backupSettings(cfg);
  const backups = listServerBackups(cfg);
  for (const backup of backups.slice(settings.retention)) {
    try { fs.unlinkSync(path.join(settings.directory, backup.name)); } catch {}
  }
}

function streamContainerArchive(container, sourcePath, outputPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-u', 'root', container, 'tar', '-C', sourcePath, '-czf', '-', '.']);
    const output = fs.createWriteStream(outputPath, { mode: 0o600 });
    let stderr = '';
    let closed = false;
    let finished = false;
    let exitCode = null;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Backup timed out'));
    }, timeoutMs);
    const maybeFinish = () => {
      if (!closed || !finished) return;
      clearTimeout(timer);
      if (exitCode === 0) resolve();
      else reject(new Error(stripAnsi(stderr || `Backup command exited with code ${exitCode}`).trim()));
    };
    child.stderr.on('data', data => { if (stderr.length < 200000) stderr += data.toString(); });
    child.stdout.pipe(output);
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => { closed = true; exitCode = code; maybeFinish(); });
    output.on('finish', () => { finished = true; maybeFinish(); });
    output.on('error', err => { clearTimeout(timer); child.kill('SIGKILL'); reject(err); });
  });
}

async function createServerBackup(cfg) {
  const settings = backupSettings(cfg);
  if (!settings.enabled) throw new Error('Server backup/export is disabled');
  fs.mkdirSync(settings.directory, { recursive: true });
  const container = safeDockerName(cfg.minecraftContainerName, 'Minecraft container name');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `craftcommand-bedrock-${stamp}.tar.gz`;
  const finalPath = path.join(settings.directory, name);
  const tempPath = `${finalPath}.partial`;
  let held = false;
  let warning = null;
  try {
    if (settings.saveHold) {
      const hold = await runMinecraftCommand('save hold', cfg);
      held = hold.ok;
      if (!held) warning = 'Could not confirm save hold; backup continued as a live filesystem export.';
      else await sleep(750);
    }
    await streamContainerArchive(container, settings.sourcePath, tempPath, settings.timeoutMs);
    fs.renameSync(tempPath, finalPath);
    pruneServerBackups(cfg);
    const stat = fs.statSync(finalPath);
    return { name, size: stat.size, createdAt: stat.mtime.toISOString(), sourcePath: settings.sourcePath, warning };
  } finally {
    if (fs.existsSync(tempPath)) { try { fs.unlinkSync(tempPath); } catch {} }
    if (held) await runMinecraftCommand('save resume', cfg).catch(() => {});
  }
}

function deleteServerBackup(cfg, fileName) {
  const settings = backupSettings(cfg);
  const name = path.basename(String(fileName || ''));
  if (name !== String(fileName || '') || !/^craftcommand-bedrock-[A-Za-z0-9_.-]+\.tar\.gz$/.test(name)) throw new Error('Invalid backup file name');
  const full = path.join(settings.directory, name);
  if (!fs.existsSync(full)) throw new Error('Backup not found');
  fs.unlinkSync(full);
  return name;
}

function streamBackupDownload(res, cfg, fileName) {
  const settings = backupSettings(cfg);
  const name = path.basename(String(fileName || ''));
  if (name !== String(fileName || '') || !/^craftcommand-bedrock-[A-Za-z0-9_.-]+\.tar\.gz$/.test(name)) throw new Error('Invalid backup file name');
  const full = path.join(settings.directory, name);
  if (!fs.existsSync(full)) throw new Error('Backup not found');
  const stat = fs.statSync(full);
  setSecurityHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'application/gzip',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Content-Length': stat.size
  });
  fs.createReadStream(full).pipe(res);
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
  if ((cfg.connection || {}).mode === 'rcon') return { ok: attachmentState.ok, method: 'rcon', endpoint: `${cfg.connection.host}:${cfg.connection.rconPort}`, gameEndpoint: `${cfg.connection.host}:${cfg.connection.gamePort}`, checkedAt: attachmentState.checkedAt, reason: attachmentState.reason, error: attachmentState.error || null };
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
    if ((cfg.connection || {}).mode === 'rcon') {
      const result = await runRconCommand('list', { ...cfg, showRawOutput: true });
      attachmentState = { ok: result.ok, method: 'rcon', endpoint: `${cfg.connection.host}:${cfg.connection.rconPort}`, checkedAt: new Date().toISOString(), reason, error: result.ok ? null : result.stderr };
      return attachmentState;
    }
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
  if ((cfg.connection || {}).mode === 'rcon') return runRconCommand(command, cfg);
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
  if (session?.role === 'admin' && Array.isArray(copy.links)) {
    copy.links = copy.links.map(link => ({ ...link, url: resolveTemplateUrl(link.url, req) }));
  } else delete copy.links;
  if (copy.backup) copy.backup = { enabled: copy.backup.enabled !== false };
  if (copy.externalServer) copy.externalServer = { enabled: copy.externalServer.enabled === true, host: copy.externalServer.host || '', port: Number(copy.externalServer.port || 19132), mode: copy.externalServer.mode || 'external' };
  copy.connection = publicConnectionSettings(cfg);
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

    if (req.method === 'GET' && url.pathname === '/api/connection') {
      requireRole(session, 'admin');
      json(res, 200, { ok: true, connection: publicConnectionSettings(cfg) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      json(res, 200, { ok: true, attachment: publicAttachmentState(cfg), world: await getWorldIdentity(cfg) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/world') {
      json(res, 200, { ok: true, world: await getWorldIdentity(cfg) });
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
      const scoped = readActivityForSession(cfg, session, limit);
      json(res, 200, { ok: true, entries: scoped.entries, scope: scoped.scope, currentUser: { username: session.username, role: session.role } });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status/overview') {
      const refresh = url.searchParams.get('refresh') === '1';
      json(res, 200, await getServerOverview(cfg, refresh));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/backups') {
      requireRole(session, 'admin');
      json(res, 200, { ok: true, backups: listServerBackups(cfg), settings: { enabled: backupSettings(cfg).enabled, retention: backupSettings(cfg).retention, sourcePath: backupSettings(cfg).sourcePath } });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/backups/download') {
      requireRole(session, 'admin');
      streamBackupDownload(res, cfg, url.searchParams.get('file') || '');
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

    if (url.pathname === '/api/connection/scan') {
      requireRole(session, 'admin');
      const servers = await scanLanBedrockServers(body.port || (cfg.connection || {}).gamePort || 19132, 1800, clientIp(req));
      appendActivity(cfg, { username: session.username, role: session.role, action: 'lan-scan', summary: `Found ${servers.length} Minecraft server(s) on UDP port ${body.port || (cfg.connection || {}).gamePort || 19132}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, servers }); return;
    }

    if (url.pathname === '/api/connection/save') {
      requireRole(session, 'admin');
      const existing = sanitizeConnectionSettings(cfg.connection || {});
      const connection = writeConnectionSettings({ ...body, rconPassword: String(body.rconPassword || '') || existing.rconPassword });
      const fresh = { ...cfg, connection };
      const state = connection.mode === 'rcon' ? await refreshAttachment(fresh, 'settings-save') : { ok: true };
      appendActivity(cfg, { username: session.username, role: session.role, action: 'connection-save', target: connection.host, summary: `Selected ${connection.mode === 'rcon' ? 'Binhex Windows / RCON' : 'Binhex Unraid'} connection mode`, ok: state.ok, error: state.error, ip: clientIp(req) });
      json(res, state.ok ? 200 : 400, { ok: state.ok, connection: publicConnectionSettings(fresh), attachment: publicAttachmentState(fresh), error: state.error || undefined }); return;
    }

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

    if (url.pathname === '/api/backups/create') {
      requireRole(session, 'admin');
      const backup = await createServerBackup(cfg);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'server-backup', target: cfg.minecraftContainerName, summary: `Created server export ${backup.name}`, ok: true, commands: 1, ip: clientIp(req) });
      json(res, 200, { ok: true, backup, backups: listServerBackups(cfg) });
      return;
    }

    if (url.pathname === '/api/backups/delete') {
      requireRole(session, 'admin');
      const deleted = deleteServerBackup(cfg, body.file || body.name);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'delete-backup', target: deleted, summary: `Deleted server export ${deleted}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, deleted, backups: listServerBackups(cfg) });
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

    if (url.pathname === '/api/quick-items/add') {
      requireRole(session, 'admin');
      const saved = addQuickItem(cfg, body);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'add-quick-item', summary: `Added quick button ${saved.item.label}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, ...saved });
      return;
    }

    if (url.pathname === '/api/quick-items/delete') {
      requireRole(session, 'admin');
      const deleted = deleteQuickItem(cfg, body.index);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'delete-quick-item', summary: `Removed quick button ${deleted.deleted.label}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, ...deleted });
      return;
    }

    if (url.pathname === '/api/quick-items/reset') {
      requireRole(session, 'admin');
      const quickItems = resetQuickItems();
      appendActivity(cfg, { username: session.username, role: session.role, action: 'reset-quick-items', summary: 'Restored factory quick buttons', ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, quickItems });
      return;
    }

    if (url.pathname === '/api/quick-items/reorder') {
      requireRole(session, 'admin');
      const quickItems = reorderQuickItems(cfg, body.order);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'reorder-quick-items', summary: 'Reordered quick buttons', ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, quickItems });
      return;
    }

    if (url.pathname === '/api/teleport-locations/add') {
      requireRole(session, 'admin');
      const saved = addTeleportLocation(cfg, body);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'add-teleport-location', summary: `Added teleport button ${saved.location.title}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, ...saved });
      return;
    }

    if (url.pathname === '/api/teleport-locations/update') {
      requireRole(session, 'admin');
      const saved = updateTeleportLocation(cfg, body.index, body);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'update-teleport-location', summary: `Updated teleport button ${saved.previous.title} to ${saved.location.title}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, ...saved });
      return;
    }

    if (url.pathname === '/api/teleport-locations/delete') {
      requireRole(session, 'admin');
      const deleted = deleteTeleportLocation(cfg, body.index);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'delete-teleport-location', summary: `Removed teleport button ${deleted.deleted.title}`, ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, ...deleted });
      return;
    }

    if (url.pathname === '/api/teleport-locations/reset') {
      requireRole(session, 'admin');
      const teleportLocations = resetTeleportLocations();
      appendActivity(cfg, { username: session.username, role: session.role, action: 'reset-teleport-locations', summary: 'Restored factory teleport locations', ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, teleportLocations });
      return;
    }

    if (url.pathname === '/api/teleport-locations/reorder') {
      requireRole(session, 'admin');
      const teleportLocations = reorderTeleportLocations(cfg, body.order);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'reorder-teleport-locations', summary: 'Reordered teleport buttons', ok: true, ip: clientIp(req) });
      json(res, 200, { ok: true, teleportLocations });
      return;
    }

    if (url.pathname === '/api/world-time') {
      requireRole(session, 'operator');
      const time = String(body.time || '').trim().toLowerCase();
      if (!['day', 'night'].includes(time)) throw new Error('World time must be day or night');
      const command = `time set ${time}`;
      const result = await runMinecraftCommand(command, cfg);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'set-world-time', summary: `Set world time to ${time}`, ok: result.ok, error: result.ok ? null : (result.stderr || result.error), commands: result.ok ? 1 : 0, ip: clientIp(req) });
      json(res, result.ok ? 200 : 500, result);
      return;
    }

    if (url.pathname === '/api/teleport') {
      requireRole(session, 'operator');
      const locations = readTeleportLocations(cfg);
      const position = Number(body.index);
      if (!Number.isInteger(position) || position < 0 || position >= locations.length) throw new Error('Teleport location was not found');
      const location = locations[position];
      const target = getTarget(body.target, cfg);
      const result = await runTeleportWithPreload(location, target, cfg);
      appendActivity(cfg, { username: session.username, role: session.role, action: 'teleport-player', target: body.target || null, summary: `Teleported to ${location.title} (${location.dimension}: ${location.x}, ${location.y}, ${location.z})`, ok: result.ok, error: result.ok ? null : result.error, commands: result.commands, ip: clientIp(req) });
      json(res, result.ok ? 200 : 500, { ...result, location });
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
  const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.js' ? 'application/javascript; charset=utf-8' : ext === '.json' ? 'application/json; charset=utf-8' : ext === '.webmanifest' ? 'application/manifest+json; charset=utf-8' : ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : ext === '.ico' ? 'image/x-icon' : 'application/octet-stream';
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
