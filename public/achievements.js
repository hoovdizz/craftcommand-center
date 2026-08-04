let currentUser = { username: '', role: 'viewer' };
let achievementData = { metadata: {}, achievements: [] };
let itemCatalog = { items: [] };
const itemMap = new Map();
const ROLE_LEVEL = { viewer: 0, operator: 1, admin: 2 };
const $ = selector => document.querySelector(selector);
const can = minimum => (ROLE_LEVEL[currentUser.role] ?? 0) >= (ROLE_LEVEL[minimum] ?? 0);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));

async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...options });
  let data;
  try { data = await response.json(); } catch { data = { ok: false, error: `HTTP ${response.status}` }; }
  if (response.status === 401) { location.href = '/'; throw new Error('Sign in required'); }
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function progressKey() {
  return `cccAchievementProgress:${$('#achievementPlatform').value || 'all'}:${$('#achievementTarget').value || currentUser.username}`;
}
function completedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(progressKey()) || '[]')); } catch { return new Set(); }
}
function saveCompleted(values) {
  localStorage.setItem(progressKey(), JSON.stringify([...values]));
}
function itemInfo(id) {
  return itemMap.get(id) || { id, name: id.replace(/^minecraft:/, '').split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' '), description: '' };
}
function itemListHtml(items) {
  if (!items.length) return '';
  return `<ul class="achievementItems">${items.map(entry => {
    const info = itemInfo(entry.item);
    return `<li data-achievement-item="${escapeHtml(entry.item)}"><span class="achievementItemIcon"></span><span><strong>${escapeHtml(info.name)} × ${entry.amount}</strong><code>${escapeHtml(entry.item)}</code></span></li>`;
  }).join('')}</ul>`;
}
function mountItemIcons(card, achievement) {
  card.querySelectorAll('[data-achievement-item]').forEach(row => {
    const info = itemInfo(row.dataset.achievementItem);
    if (window.CCCItemIcons) window.CCCItemIcons.mount(row.querySelector('.achievementItemIcon'), info);
  });
}

async function sendPracticeSupplies(achievement, button) {
  if (!achievement.items.length || !can('operator') || !$('#achievementTarget').value) return;
  if (!confirm(`Send the listed ${achievement.supplyType.toLowerCase()} for “${achievement.title}” to ${$('#achievementTarget').selectedOptions[0]?.textContent || 'the selected player'}?\n\nThis uses commands. It is for practice only and can make the world ineligible for achievements.`)) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Sending…';
  try {
    for (const entry of achievement.items) {
      await request('/api/give', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ target: $('#achievementTarget').value, item: entry.item, amount: entry.amount }) });
    }
    button.textContent = 'Supplies sent';
  } catch (error) {
    alert(`Could not send supplies: ${error.message}`);
    button.textContent = original;
  } finally {
    button.disabled = false;
    setTimeout(() => { button.textContent = original; }, 1800);
  }
}

function render() {
  const search = $('#achievementSearch').value.trim().toLowerCase();
  const category = $('#achievementCategory').value;
  const platform = $('#achievementPlatform').value;
  const state = $('#achievementState').value;
  const completed = completedSet();
  const hasTarget = Boolean($('#achievementTarget').value);
  const filtered = achievementData.achievements.filter(achievement => {
    const matchesText = !search || `${achievement.title} ${achievement.description} ${achievement.guide} ${achievement.items.map(item => item.item).join(' ')}`.toLowerCase().includes(search);
    const matchesCategory = !category || achievement.category === category;
    const matchesPlatform = !platform || achievement.platforms.includes(platform);
    const isDone = completed.has(achievement.id);
    const matchesState = !state || (state === 'done' ? isDone : !isDone);
    return matchesText && matchesCategory && matchesPlatform && matchesState;
  });

  $('#achievementCount').textContent = `${filtered.length} of ${achievementData.achievements.length} achievements shown`;
  $('#achievementProgress').textContent = `${completed.size} marked complete for this system/player checklist`;
  const grid = $('#achievementGrid');
  grid.innerHTML = '';
  for (const achievement of filtered) {
    const done = completed.has(achievement.id);
    const card = document.createElement('article');
    card.className = `card achievementCard${done ? ' completed' : ''}`;
    card.innerHTML = `
      <div class="achievementCardTop"><span class="achievementNumber">#${achievement.order}</span><span class="badge">${escapeHtml(achievement.category)}</span><span class="achievementScore">${achievement.gamerscore ? `${achievement.gamerscore}G` : ''}${achievement.trophy ? ` • ${escapeHtml(achievement.trophy)}` : ''}</span></div>
      <h2>${escapeHtml(achievement.title)}</h2>
      <p class="achievementDescription">${escapeHtml(achievement.description)}</p>
      <details><summary>How to complete it</summary><p>${escapeHtml(achievement.guide)}</p></details>
      <h3>${escapeHtml(achievement.supplyType)}</h3>
      <p class="hint achievementSupplyNote">${escapeHtml(achievement.supplyNote)}</p>
      ${itemListHtml(achievement.items)}
      <p class="achievementPlatforms">${achievement.platforms.map(value => `<span>${escapeHtml(value)}</span>`).join('')}</p>
      <div class="achievementActions">
        <button type="button" class="${done ? '' : 'good'}" data-toggle-achievement>${done ? 'Mark not completed' : 'Mark completed'}</button>
        ${achievement.items.length ? `<button type="button" class="warn" data-practice-supplies ${can('operator') && hasTarget ? '' : 'disabled'}>Send listed supplies</button>` : ''}
      </div>`;
    card.querySelector('[data-toggle-achievement]').addEventListener('click', () => {
      const updated = completedSet();
      if (updated.has(achievement.id)) updated.delete(achievement.id); else updated.add(achievement.id);
      saveCompleted(updated);
      render();
    });
    card.querySelector('[data-practice-supplies]')?.addEventListener('click', event => sendPracticeSupplies(achievement, event.currentTarget));
    mountItemIcons(card, achievement);
    grid.appendChild(card);
  }
  if (!filtered.length) grid.innerHTML = '<section class="card wide"><p>No achievements match these filters.</p></section>';
}

async function init() {
  const auth = await request('/api/auth/status');
  if (!auth.authenticated) { location.href = '/'; return; }
  currentUser = { username: auth.username || '', role: auth.role || 'viewer' };
  $('#userBadge').textContent = `${currentUser.username} • ${currentUser.role}`;
  document.querySelectorAll('[data-admin-nav]').forEach(element => element.classList.toggle('hidden', !can('admin')));
  const [achievements, catalog, players] = await Promise.all([
    fetch('/achievements.json', { cache: 'no-store' }).then(response => response.json()),
    fetch('/item-catalog.json', { cache: 'no-store' }).then(response => response.json()),
    request('/api/players')
  ]);
  achievementData = achievements;
  itemCatalog = catalog;
  itemCatalog.items.forEach(item => itemMap.set(item.id, item));
  [...new Set(achievementData.achievements.map(item => item.category))].sort().forEach(category => {
    const option = document.createElement('option'); option.value = category; option.textContent = category; $('#achievementCategory').appendChild(option);
  });
  (players.players || []).forEach(player => {
    const option = document.createElement('option'); option.value = player.target; option.textContent = player.label; $('#achievementTarget').appendChild(option);
  });
  ['achievementSearch', 'achievementCategory', 'achievementPlatform', 'achievementState', 'achievementTarget'].forEach(id => {
    $(`#${id}`).addEventListener(id === 'achievementSearch' ? 'input' : 'change', render);
  });
  render();
}
init().catch(error => { $('#achievementGrid').innerHTML = `<section class="card wide"><p class="notice">Could not load achievements: ${escapeHtml(error.message)}</p></section>`; });
