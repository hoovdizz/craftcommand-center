let cfg = null;
let catalog = { metadata: {}, items: [] };
let catalogMap = new Map();
let kits = [];
let selectedKit = null;
let builderItems = [];
let currentUser = { username: '', role: 'viewer' };

const ROLE_LEVEL = { viewer: 0, operator: 1, admin: 2 };
function can(minimum) { return (ROLE_LEVEL[currentUser.role] ?? 0) >= (ROLE_LEVEL[minimum] ?? 0); }

const $ = sel => document.querySelector(sel);
const result = $('#result');
const attachmentStatus = $('#attachmentStatus');
const playerStatus = $('#playerStatus');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function itemInfo(itemId) {
  return catalogMap.get(String(itemId || '').replace(/^minecraft:/,'')) || { id:itemId, name:String(itemId || '').replace(/^minecraft:/,'').split('_').map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' '), icon:'◼️', description:'Custom or unlisted Bedrock item.' };
}
function iconFor(itemId) { return itemInfo(itemId).icon || '◼️'; }
function target() { return $('#target').value; }
function setDisplayMode(mode) {
  const allowed = ['both','icon','text'];
  const finalMode = allowed.includes(mode) ? mode : 'both';
  document.body.dataset.display = finalMode;
  localStorage.setItem('cccDisplayMode', finalMode);
  if ($('#displayMode')) $('#displayMode').value = finalMode;
}
function formatTime(value) {
  if (!value) return 'Not checked yet';
  try { return new Date(value).toLocaleString(); } catch { return value; }
}
function show(data) {
  if (!result) return;
  if (typeof data === 'string') return void (result.textContent = data);
  if (data?.players) {
    renderPlayers(data);
    result.textContent = `✅ Player list refreshed\nTargets loaded: ${data.players.length}\nDiscovered from server: ${data.discoveredCount || 0}\nManual players: ${data.manualCount || 0}`;
    return;
  }
  if (data?.ok && data.attachment) {
    renderAttachment(data.attachment);
    result.textContent = `✅ Attachment refreshed\nContainer: ${data.attachment.container}\nScreen: ${data.attachment.activeScreenSession || 'not found'}\nMethod: ${data.attachment.method}`;
    return;
  }
  if (data?.ok && typeof data.kit === 'string') {
    result.textContent = `✅ Sent kit: ${data.kit}\nCommands sent: ${data.sent ?? data.commands?.length ?? 0}\n\n${(data.commands || []).map(c => '• ' + c).join('\n')}`;
    return;
  }
  if (data?.ok && data.command) {
    result.textContent = `✅ Sent command\n${data.command}\n\nScreen: ${data.activeScreenSession || 'auto'}\nMethod: ${data.method || 'attach'}`;
    return;
  }
  if (data && !data.ok) return void (result.textContent = `❌ Request failed\n${data.error || data.stderr || JSON.stringify(data, null, 2)}`);
  result.textContent = JSON.stringify(data, null, 2);
}

async function request(path, options = {}) {
  const res = await fetch(path, { cache:'no-store', credentials:'same-origin', ...options });
  let data;
  try { data = await res.json(); } catch { data = { ok:false, error:`HTTP ${res.status}` }; }
  if (res.status === 401 && path !== '/api/auth/login') {
    showLogin('Your session expired. Sign in again.');
    throw new Error(data.error || 'Authentication required');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data });
  return data;
}
async function api(path, body) {
  try {
    const data = await request(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body || {}) });
    show(data);
    loadStatus().catch(()=>{});
    return data;
  } catch (err) {
    show(err.data || { ok:false, error:err.message });
    throw err;
  }
}

function showLogin(message = '') {
  $('#loginView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
  $('#loginMessage').textContent = message;
  setTimeout(() => $('#loginUsername').focus(), 0);
}
function showApp() {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
}

function applyRoleAccess() {
  const role = currentUser.role || 'viewer';
  const badge = $('#userBadge');
  if (badge) badge.textContent = `${currentUser.username || 'user'} • ${role}`;
  document.querySelectorAll('[data-min-role]').forEach(el => {
    const allowed = can(el.dataset.minRole || 'viewer');
    el.classList.toggle('roleHidden', !allowed);
    el.querySelectorAll('button,input,select').forEach(control => { control.disabled = !allowed; });
  });
}

function renderDiagnostics(data) {
  const summary = $('#healthSummary');
  const grid = $('#diagnosticChecks');
  if (!summary || !grid || !data) return;
  summary.className = `healthSummary ${data.ready ? 'ready' : 'attention'}`;
  summary.innerHTML = `<strong>${data.ready ? '✅ Ready for commands' : '⚠️ Needs attention'}</strong><span>Version ${escapeHtml(data.appVersion || cfg?.appVersion || '')} • ${data.errors || 0} error(s) • ${data.warnings || 0} warning(s) • checked ${escapeHtml(formatTime(data.checkedAt))}</span>`;
  grid.innerHTML = (data.checks || []).map(check => `<div class="diagnosticItem ${check.ok ? 'pass' : check.severity === 'warning' ? 'warn' : 'fail'}"><span class="diagnosticIcon">${check.ok ? '✓' : check.severity === 'warning' ? '!' : '×'}</span><div><strong>${escapeHtml(check.label)}</strong><p>${escapeHtml(check.detail)}</p></div></div>`).join('');
  if (data.attachment) renderAttachment(data.attachment);
}

async function loadDiagnostics(showResult = false) {
  const data = await request('/api/diagnostics');
  renderDiagnostics(data);
  if (showResult) show(data.ready ? '✅ Diagnostics passed.' : `⚠️ Diagnostics found ${data.errors || 0} error(s) and ${data.warnings || 0} warning(s).`);
  return data;
}

function renderAttachment(att) {
  if (!attachmentStatus || !att) return;
  attachmentStatus.className = att.ok ? 'statusBox ok' : 'statusBox bad';
  attachmentStatus.innerHTML = `
    <div><strong>Status:</strong> ${att.ok ? '✅ Ready' : '⚠️ Not attached'}</div>
    <div><strong>Container:</strong> <code>${escapeHtml(att.container || 'unknown')}</code></div>
    <div><strong>Docker user:</strong> <code>${escapeHtml(att.dockerUser || 'unknown')}</code></div>
    <div><strong>Configured screen:</strong> <code>${escapeHtml(att.configuredScreenSession || 'auto')}</code></div>
    <div><strong>Active screen:</strong> <code>${escapeHtml(att.activeScreenSession || 'not found')}</code></div>
    <div><strong>Method:</strong> <code>${escapeHtml(att.method || 'attach')}</code></div>
    <div><strong>Last check:</strong> ${formatTime(att.checkedAt)}${att.reason ? ` (${escapeHtml(att.reason)})` : ''}</div>
    ${att.error ? `<div><strong>Error:</strong> ${escapeHtml(att.error)}</div>` : ''}`;
}
function renderPlayers(data) {
  const select = $('#target');
  if (!select || !Array.isArray(data?.players)) return;
  const previous = select.value;
  select.innerHTML = '';
  data.players.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.target;
    opt.textContent = p.manual && !p.configured ? `${p.label} ✚` : p.discovered && !p.configured ? `${p.label} ★` : p.label;
    opt.title = p.sources ? `Sources: ${p.sources.join(', ')}` : '';
    select.appendChild(opt);
  });
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
  if (playerStatus) playerStatus.textContent = `${data.players.length} target(s) loaded. ${data.discoveredCount || 0} discovered, ${data.manualCount || 0} manually saved.`;
}
async function loadPlayers() { const data = await request('/api/players'); renderPlayers(data); return data; }
async function loadStatus() { const data = await request('/api/status'); renderAttachment(data.attachment); return data; }

function makeVisualButton({ label, icon='◼️', subtext='', className='', click, tooltip='' }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  if (tooltip) b.dataset.tooltip = tooltip;
  b.innerHTML = `<span class="btnIcon" aria-hidden="true">${escapeHtml(icon)}</span><span class="btnText">${escapeHtml(label)}${subtext ? `<small>${escapeHtml(subtext)}</small>` : ''}</span>`;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', async event => {
    if (b.dataset.busy === 'true') return;
    try {
      const pending = click(event);
      if (pending && typeof pending.then === 'function') {
        b.dataset.busy = 'true';
        b.setAttribute('aria-busy', 'true');
        b.disabled = true;
        await pending;
      }
    } finally {
      if (b.dataset.busy === 'true') {
        delete b.dataset.busy;
        b.removeAttribute('aria-busy');
        b.disabled = false;
      }
    }
  });
  return b;
}
function kitTooltip(kit) {
  const lines = [kit.description || kit.label, ''];
  for (const i of kit.items || []) lines.push(`${iconFor(i.item)} ${itemInfo(i.item).name} × ${i.amount}`);
  if (kit.xp) lines.push(`✨ ${kit.xp.amount}${kit.xp.levels ? ' levels' : ' XP'}`);
  return lines.join('\n');
}
function renderQuickItems() {
  const box = $('#quickItems'); box.innerHTML = '';
  (cfg.quickItems || []).forEach(item => {
    const info = itemInfo(item.item);
    const button = makeVisualButton({ label:item.label || info.name, icon:item.icon || info.icon, subtext:item.label ? item.item : `× ${item.amount}`, className:'good itemButton', click:()=>api('/api/give',{target:target(),item:item.item,amount:item.amount}) });
    button.disabled = !can('operator');
    box.appendChild(button);
  });
}
function renderXpButtons() {
  const box = $('#xpButtons');
  if (!box) return;
  box.innerHTML = '';
  (cfg.xpButtons || []).forEach(entry => {
    const button = makeVisualButton({ label: entry.label || `${entry.amount}${entry.levels ? ' levels' : ' XP'}`, icon: '✨', subtext: entry.levels ? 'Levels' : 'Experience points', className: 'good itemButton', click: () => api('/api/xp', { target: target(), amount: entry.amount, levels: entry.levels !== false }) });
    button.disabled = !can('operator');
    box.appendChild(button);
  });
}

function renderKits() {
  const box = $('#kits'); box.innerHTML = '';
  kits.forEach(kit => {
    const button = makeVisualButton({ label:kit.label, icon:kit.icon || '🎒', subtext:`${kit.items?.length || 0} items${kit.custom ? ' • custom' : ''}`, className:'kitButton', tooltip:kitTooltip(kit), click:()=>openKitDialog(kit) });
    button.disabled = !can('operator');
    box.appendChild(button);
  });
}
function openKitDialog(kit) {
  selectedKit = kit;
  const body = $('#kitDialogBody');
  body.innerHTML = `<h2>${escapeHtml(kit.icon || '🎒')} ${escapeHtml(kit.label)}</h2><p>${escapeHtml(kit.description || '')}</p><ul class="kitContents">${(kit.items || []).map(i=>{const info=itemInfo(i.item);return `<li><span>${escapeHtml(info.icon)}</span><div><strong>${escapeHtml(info.name)} × ${i.amount}</strong><br><code>${escapeHtml(i.item)}</code></div></li>`}).join('')}${kit.xp ? `<li><span>✨</span><div><strong>${kit.xp.amount}${kit.xp.levels ? ' levels' : ' XP'}</strong></div></li>` : ''}</ul><p class="hint">Target: <strong>${escapeHtml($('#target').selectedOptions[0]?.textContent || target())}</strong></p>`;
  $('#deleteKit').classList.toggle('hidden', !kit.custom || !can('admin'));
  $('#sendKit').disabled = !can('operator');
  $('#kitDialog').showModal();
}
async function loadKits() { const data = await request('/api/kits'); kits = data.kits || []; renderKits(); }

function populateCatalogInputs() {
  const list = $('#itemOptions');
  const frag = document.createDocumentFragment();
  catalog.items.forEach(item => { const opt=document.createElement('option'); opt.value=item.id; opt.label=`${item.icon} ${item.name} — ${item.description}`; frag.appendChild(opt); });
  list.replaceChildren(frag);
}
function updateCustomHelp() {
  const value = $('#customItem').value.replace(/^minecraft:/,'');
  const info = catalogMap.get(value);
  $('#customItemHelp').textContent = info ? `${info.icon} ${info.name}: ${info.description} (${info.category})` : 'Custom or add-on item ID. Confirm that the server recognizes it.';
}
function renderBuilderItems() {
  const box = $('#builderItems');
  if (!builderItems.length) { box.innerHTML = '<p class="hint">No items added yet.</p>'; return; }
  box.innerHTML = '';
  builderItems.forEach((entry,index) => {
    const info=itemInfo(entry.item); const row=document.createElement('div'); row.className='builderItem';
    row.innerHTML=`<span class="icon">${escapeHtml(info.icon)}</span><div><strong>${escapeHtml(info.name)}</strong><code>${escapeHtml(entry.item)}</code></div><input aria-label="Amount" type="number" min="1" max="2304" value="${entry.amount}"><button class="danger" aria-label="Remove">×</button>`;
    row.querySelector('input').addEventListener('change',e=>{entry.amount=Math.max(1,Math.min(2304,Number(e.target.value)||1));});
    row.querySelector('button').addEventListener('click',()=>{builderItems.splice(index,1);renderBuilderItems();});
    box.appendChild(row);
  });
}
function clearBuilder() {
  builderItems=[]; $('#kitName').value=''; $('#kitDescription').value=''; $('#kitIcon').value='🎒'; $('#kitItemSearch').value=''; $('#kitXp').value='0'; renderBuilderItems();
}
async function saveBuilderKit() {
  const name=$('#kitName').value.trim(); if(!name) return show('Type a kit name first.');
  const kit={label:name,icon:$('#kitIcon').value.trim()||'🎒',description:$('#kitDescription').value.trim(),items:builderItems,xp:Number($('#kitXp').value)>0?{amount:Number($('#kitXp').value),levels:true}:null};
  const data=await api('/api/kits/custom/save',{kit}); kits=data.kits||kits; renderKits(); clearBuilder(); $('#kitBuilderCard').classList.add('hidden'); show(`✅ Saved custom kit: ${data.kit.label}`);
}

async function initializeApp() {
  showApp();
  [cfg, catalog] = await Promise.all([request('/api/config'), fetch('/item-catalog.json',{cache:'no-store'}).then(r=>r.json())]);
  catalogMap = new Map(catalog.items.map(i=>[i.id,i]));
  currentUser = cfg.currentUser || currentUser;
  applyRoleAccess();
  $('#title').textContent=cfg.appTitle||'CraftCommand Center'; $('#subtitle').textContent=cfg.appSubtitle||'Companion dashboard for binhex-minecraftbedrockserver.';
  $('#transportBadge').textContent=cfg.security?.transportEncrypted?'🔒 HTTPS':'⚠️ HTTP'; $('#transportBadge').title=cfg.security?.note||'';
  setDisplayMode(localStorage.getItem('cccDisplayMode') || cfg.display?.defaultMode || 'both');
  $('#displayMode').addEventListener('change',e=>setDisplayMode(e.target.value));
  const links=$('#links'); links.innerHTML=''; (cfg.links||[]).forEach(l=>{const a=document.createElement('a');a.className='linkButton';a.href=l.url;a.target='_blank';a.rel='noopener noreferrer';a.innerHTML=`<span class="btnIcon">${escapeHtml(l.icon||'🔗')}</span><span class="btnText">${escapeHtml(l.label)}</span>`;links.appendChild(a);});
  populateCatalogInputs(); renderQuickItems(); renderXpButtons(); updateCustomHelp();
  await Promise.all([loadPlayers(),loadStatus(),loadKits(),loadDiagnostics(false)]);
  const urlItem=new URLSearchParams(location.search).get('item'); if(urlItem){$('#customItem').value=urlItem;updateCustomHelp();$('#customItem').scrollIntoView({behavior:'smooth'});}
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginMessage').textContent='Signing in…';
  try { const login = await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('#loginUsername').value,password:$('#loginPassword').value})}); currentUser={username:login.username,role:login.role||'admin'}; $('#loginPassword').value=''; await initializeApp(); }
  catch(err){ $('#loginMessage').textContent=err.message; }
});
$('#logout').addEventListener('click', async()=>{await request('/api/auth/logout',{method:'POST'}).catch(()=>{});location.reload();});
$('#runDiagnostics').addEventListener('click', async e=>{const b=e.currentTarget,old=b.textContent;b.disabled=true;b.textContent='Checking…';try{await loadDiagnostics(true);}finally{b.disabled=false;b.textContent=old;}});
$('#refreshAttachment').addEventListener('click',()=>api('/api/refresh-attachment',{}));
$('#loadStatus').addEventListener('click',()=>loadStatus().then(show));
$('#refreshPlayers').addEventListener('click',async e=>{const b=e.currentTarget,old=b.textContent;b.disabled=true;b.textContent='Pulling…';try{const data=await api('/api/players/refresh',{});renderPlayers(data);}finally{b.disabled=false;b.textContent=old;}});
const addPlayer=async()=>{const input=$('#manualPlayer');const name=input.value.trim();if(!name)return show('Type a player name first.');const data=await api('/api/players/add',{name});renderPlayers(data);input.value='';};
$('#addPlayer').addEventListener('click',addPlayer); $('#manualPlayer').addEventListener('keydown',e=>{if(e.key==='Enter')addPlayer();});
$('#sendCustom').addEventListener('click',()=>api('/api/give',{target:target(),item:$('#customItem').value,amount:Number($('#customAmount').value)})); $('#customItem').addEventListener('input',updateCustomHelp);
$('#openKitBuilder').addEventListener('click',()=>{$('#kitBuilderCard').classList.remove('hidden');$('#kitBuilderCard').scrollIntoView({behavior:'smooth'});}); $('#closeKitBuilder').addEventListener('click',()=>$('#kitBuilderCard').classList.add('hidden'));
$('#addKitItem').addEventListener('click',()=>{const item=$('#kitItemSearch').value.trim().replace(/^minecraft:/,'');const amount=Math.max(1,Math.min(2304,Number($('#kitItemAmount').value)||1));if(!item)return show('Choose or type an item ID.');const existing=builderItems.find(i=>i.item===item);if(existing)existing.amount+=amount;else builderItems.push({item,amount});$('#kitItemSearch').value='';renderBuilderItems();});
$('#saveKit').addEventListener('click',saveBuilderKit); $('#clearKit').addEventListener('click',clearBuilder);
$('#sendKit').addEventListener('click',async()=>{if(!selectedKit)return;$('#kitDialog').close();await api('/api/kit',{target:target(),kitId:selectedKit.id});});
$('#deleteKit').addEventListener('click',async()=>{if(!selectedKit?.custom)return;if(!confirm(`Delete custom kit “${selectedKit.label}”?`))return;const data=await api('/api/kits/custom/delete',{kitId:selectedKit.id});kits=data.kits||[];renderKits();$('#kitDialog').close();});

(async()=>{setDisplayMode(localStorage.getItem('cccDisplayMode')||'both');try{const auth=await request('/api/auth/status');if(auth.authenticated)await initializeApp();else showLogin();}catch(err){showLogin(err.message);}})();
