let currentUser = { username: '', role: 'viewer' };
const ROLE_LEVEL = { viewer: 0, operator: 1, admin: 2 };
const $ = selector => document.querySelector(selector);
const can = minimum => (ROLE_LEVEL[currentUser.role] ?? 0) >= (ROLE_LEVEL[minimum] ?? 0);
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function formatTime(value) { if (!value) return 'Not available'; try { return new Date(value).toLocaleString(); } catch { return String(value); } }
function formatDuration(seconds) {
  let value = Math.max(0, Number(seconds || 0));
  const days = Math.floor(value / 86400); value %= 86400;
  const hours = Math.floor(value / 3600); value %= 3600;
  const minutes = Math.floor(value / 60);
  const parts = [];
  if (days) parts.push(`${days}d`); if (hours || days) parts.push(`${hours}h`); parts.push(`${minutes}m`);
  return parts.join(' ');
}
function formatBytes(bytes) {
  let value = Number(bytes || 0); const units = ['B','KB','MB','GB','TB']; let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}
async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...options });
  let data; try { data = await response.json(); } catch { data = { ok: false, error: `HTTP ${response.status}` }; }
  if (response.status === 401) { location.href = '/'; throw new Error('Sign in required'); }
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function setResult(message) { $('#statusResult').textContent = typeof message === 'string' ? message : JSON.stringify(message, null, 2); }
function renderServerLinks(config) {
  const box = $('#serverLinks');
  if (!box || !can('admin')) return;
  box.innerHTML = '';
  for (const link of config.links || []) {
    const anchor = document.createElement('a');
    anchor.className = 'linkButton serverLink';
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.innerHTML = `<span class="btnIcon">${escapeHtml(link.icon || '🔗')}</span><span class="btnText">${escapeHtml(link.label)}</span>`;
    box.appendChild(anchor);
  }
  if (!box.children.length) box.innerHTML = '<p class="hint">No home server links are configured.</p>';
}
function applyRole() {
  $('#userBadge').textContent = `${currentUser.username} • ${currentUser.role}`;
  document.querySelectorAll('[data-min-role]').forEach(element => element.classList.toggle('hidden', !can(element.dataset.minRole || 'viewer')));
  document.querySelectorAll('[data-admin-nav]').forEach(element => element.classList.toggle('hidden', !can('admin')));
}
function renderDiagnostics(data) {
  const summary = $('#healthSummary');
  summary.className = `healthSummary ${data.ready ? 'ready' : 'attention'}`;
  summary.innerHTML = `<strong>${data.ready ? 'Ready for commands' : 'Needs attention'}</strong><span>Version ${escapeHtml(data.appVersion || '')} • ${data.errors || 0} error(s) • ${data.warnings || 0} warning(s) • ${escapeHtml(formatTime(data.checkedAt))}</span>`;
  $('#diagnosticChecks').innerHTML = (data.checks || []).map(check => `<div class="diagnosticItem ${check.ok ? 'pass' : check.severity === 'warning' ? 'warn' : 'fail'}"><span class="diagnosticIcon">${check.ok ? '✓' : check.severity === 'warning' ? '!' : '×'}</span><div><strong>${escapeHtml(check.label)}</strong><p>${escapeHtml(check.detail)}</p></div></div>`).join('');
  if (data.attachment) renderAttachment(data.attachment);
}
function renderAttachment(att) {
  const box = $('#attachmentStatus');
  box.className = att?.ok ? 'statusBox ok' : 'statusBox bad';
  box.innerHTML = `<div><strong>Status:</strong> ${att?.ok ? 'Ready' : 'Not attached'}</div><div><strong>Container:</strong> <code>${escapeHtml(att?.container || 'unknown')}</code></div><div><strong>Docker user:</strong> <code>${escapeHtml(att?.dockerUser || 'unknown')}</code></div><div><strong>Configured screen:</strong> <code>${escapeHtml(att?.configuredScreenSession || 'auto')}</code></div><div><strong>Active screen:</strong> <code>${escapeHtml(att?.activeScreenSession || 'not found')}</code></div><div><strong>Method:</strong> <code>${escapeHtml(att?.method || 'attach')}</code></div><div><strong>Last check:</strong> ${escapeHtml(formatTime(att?.checkedAt))}</div>${att?.error ? `<div><strong>Error:</strong> ${escapeHtml(att.error)}</div>` : ''}`;
}
function renderConnection(connection) {
  $('#connectionMode').value = connection.mode || 'binhex';
  $('#connectionContainerName').value = connection.containerName || 'binhex-minecraftbedrockserver';
}
function accessRecordHtml(entry) {
  const details = [entry.permission ? `Permission: ${entry.permission}` : '', entry.xuid ? `XUID: ${entry.xuid}` : '', entry.reason ? `Reason: ${entry.reason}` : '', entry.source ? `Source: ${entry.source}` : ''].filter(Boolean);
  return `<article class="accessEntry"><strong>${escapeHtml(entry.name || 'Unknown')}</strong>${details.length ? `<span>${escapeHtml(details.join(' • '))}</span>` : ''}</article>`;
}
function renderAccessList(selector, entries, emptyText) {
  const element = $(selector);
  element.innerHTML = entries?.length ? entries.map(accessRecordHtml).join('') : `<p class="hint">${escapeHtml(emptyText)}</p>`;
}
function renderOverview(data) {
  renderAttachment(data.attachment || {});
  const docker = data.docker || {};
  const last = data.lastPlayerConnection;
  $('#serverStats').innerHTML = [
    ['World', data.world?.name || 'Not detected'],
    ['Container', docker.running ? 'Running' : docker.status || 'Not running'],
    ['Uptime', docker.running ? formatDuration(docker.uptimeSeconds) : 'Not running'],
    ['Started', formatTime(docker.startedAt)],
    ['Image', docker.image || 'Unknown'],
    ['Restarts', docker.restartCount ?? 0],
    ['Health', docker.health || 'No Docker health state'],
    ['Last player connection', last ? `${last.player} • ${formatTime(last.at)}` : 'Not found in retained Docker logs']
  ].map(([label, value]) => `<div class="statItem"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

  const external = data.external || {};
  const externalBox = $('#externalStatus');
  externalBox.className = external.reachable ? 'statusBox ok' : 'statusBox bad';
  externalBox.innerHTML = external.configured
    ? `<div><strong>Endpoint:</strong> <code>${escapeHtml(external.endpoint || '')}</code></div><div><strong>Status:</strong> ${external.reachable ? 'Reachable from this probe' : 'No public Bedrock response'}</div><div><strong>Latency:</strong> ${external.latencyMs == null ? 'N/A' : `${external.latencyMs} ms`}</div>${external.motd ? `<div><strong>MOTD:</strong> ${escapeHtml(external.motd)}</div>` : ''}${external.version ? `<div><strong>Version:</strong> ${escapeHtml(external.version)}</div>` : ''}${external.provider ? `<div><strong>Probe:</strong> ${escapeHtml(external.provider)}${external.providerCached ? ' (cached)' : ''}</div>` : ''}${external.error ? `<div><strong>Detail:</strong> ${escapeHtml(external.error)}</div>` : ''}${external.localProbe ? `<div><strong>Local probe:</strong> ${external.localProbe.reachable ? 'reachable' : escapeHtml(external.localProbe.error || 'no response')}</div>` : ''}`
    : `<div><strong>Not configured.</strong> Set the external hostname/IP and UDP port in the Unraid Edit screen, then enable the reachability check.</div>`;

  const online = data.online || { online: 0, max: 0, players: [] };
  $('#onlineSummary').textContent = online.error ? `Query warning: ${online.error}` : `${online.online || 0} of ${online.max || 0} player slots currently in use.`;
  renderAccessList('#onlinePlayers', (online.players || []).map(name => ({ name })), 'No players are currently listed online.');

  const access = data.access || { whitelist: [], blacklist: [], permissions: [] };
  $('#whitelistSummary').textContent = `${access.whitelist?.length || 0} whitelisted player(s). Allowlist setting: ${access.allowListEnabled == null ? 'not found' : access.allowListEnabled ? 'enabled' : 'disabled'}.`;
  $('#blacklistSummary').textContent = `${access.blacklist?.length || 0} blacklisted/banned player(s) found in recognized server files.`;
  renderAccessList('#whitelistPlayers', access.whitelist || [], 'No whitelist entries were found.');
  renderAccessList('#blacklistPlayers', access.blacklist || [], 'No blacklist or banned-player entries were found.');
  renderAccessList('#permissionPlayers', access.permissions || [], 'No permission entries were found.');
}
function renderBackups(data) {
  const settings = data.settings || {};
  $('#backupSettings').innerHTML = `<div><strong>Status:</strong> ${settings.enabled ? 'Enabled' : 'Disabled'}</div><div><strong>Binhex source:</strong> <code>${escapeHtml(settings.sourcePath || '/config')}</code></div><div><strong>Retention:</strong> ${settings.retention || 0} export(s)</div>`;
  const list = $('#backupList');
  const backups = data.backups || [];
  if (!backups.length) { list.innerHTML = '<p class="hint">No server exports have been created yet.</p>'; return; }
  list.innerHTML = backups.map(backup => `<article class="backupEntry"><div><strong>${escapeHtml(backup.name)}</strong><span>${escapeHtml(formatTime(backup.createdAt))} • ${escapeHtml(formatBytes(backup.size))}</span></div><div class="buttonRow"><a class="linkButton good compact" href="/api/backups/download?file=${encodeURIComponent(backup.name)}">Download</a><button class="danger compact" type="button" data-delete-backup="${escapeHtml(backup.name)}">Delete</button></div></article>`).join('');
  list.querySelectorAll('[data-delete-backup]').forEach(button => button.addEventListener('click', async () => {
    const file = button.dataset.deleteBackup;
    if (!confirm(`Delete ${file}?`)) return;
    const updated = await request('/api/backups/delete', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ file }) });
    renderBackups({ ...data, backups: updated.backups || [] });
    setResult(`Deleted ${file}`);
  }));
}
async function loadDiagnostics() { const data = await request('/api/diagnostics'); renderDiagnostics(data); return data; }
async function loadOverview(force = false) { const data = await request(`/api/status/overview${force ? '?refresh=1' : ''}`); renderOverview(data); return data; }
async function loadBackups() { if (!can('admin')) return; const data = await request('/api/backups'); renderBackups(data); }
async function init() {
  const auth = await request('/api/auth/status');
  if (!auth.authenticated) { location.href = '/'; return; }
  currentUser = { username: auth.username || '', role: auth.role || 'viewer' };
  applyRole();
  const [config] = await Promise.all([request('/api/config'), loadDiagnostics(), loadOverview(false), loadBackups()]);
  document.body.dataset.display = localStorage.getItem('cccDisplayMode') || config.display?.defaultMode || 'both';
  if (can('admin')) renderServerLinks(config);
  if (can('admin')) renderConnection(config.connection || {});
}
$('#connectionForm')?.addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { const body = { mode: $('#connectionMode').value, containerName: $('#connectionContainerName').value.trim() }; const data = await request('/api/connection/save', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }); renderConnection(data.connection); renderAttachment(data.attachment); setResult(data.attachment.ok ? 'Docker connection saved and screen attached.' : `Saved, but attachment failed: ${data.attachment.error || 'unknown error'}`); } catch (error) { setResult(`Connection failed: ${error.message}`); } finally { button.disabled = false; } });
$('#runDiagnostics').addEventListener('click', async event => { const button = event.currentTarget; button.disabled = true; try { await loadDiagnostics(); setResult('Diagnostics refreshed.'); } catch (error) { setResult(error.message); } finally { button.disabled = false; } });
$('#refreshOverview').addEventListener('click', async event => { const button = event.currentTarget; button.disabled = true; try { await loadOverview(true); setResult('Server status refreshed.'); } catch (error) { setResult(error.message); } finally { button.disabled = false; } });
$('#refreshAttachment').addEventListener('click', async event => { if (!can('operator')) return; const button = event.currentTarget; button.disabled = true; try { const data = await request('/api/refresh-attachment', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' }); renderAttachment(data.attachment); setResult(`Attached to ${data.attachment.activeScreenSession}`); } catch (error) { setResult(error.message); } finally { button.disabled = false; } });
$('#createBackup').addEventListener('click', async event => { if (!can('admin')) return; if (!confirm('Create a compressed export of the Binhex server data now? Large worlds can take several minutes.')) return; const button = event.currentTarget; button.disabled = true; button.textContent = 'Creating Export…'; setResult('Creating server export. Keep this page open…'); try { const data = await request('/api/backups/create', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' }); renderBackups({ backups: data.backups || [], settings: { enabled: true, retention: 10, sourcePath: data.backup.sourcePath } }); setResult(`Created ${data.backup.name} (${formatBytes(data.backup.size)})${data.backup.warning ? `\nWarning: ${data.backup.warning}` : ''}`); } catch (error) { setResult(`Backup failed: ${error.message}`); } finally { button.disabled = false; button.textContent = 'Create Server Export'; await loadBackups().catch(() => {}); } });
init().catch(error => { setResult(`Could not load status: ${error.message}`); });
