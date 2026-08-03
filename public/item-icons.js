(() => {
  'use strict';

  const CURRENT_WIKI = 'https://minecraft.wiki/w/Special:Redirect/file/';
  const LEGACY_WIKI = 'https://minecraft.fandom.com/wiki/Special:Redirect/file/';

  // Bedrock command identifiers sometimes differ from the player-facing/wiki name.
  const NAME_OVERRIDES = {
    golden_rail: 'Powered Rail',
    redstone: 'Redstone Dust',
    experience_bottle: "Bottle o' Enchanting",
    enchanting_table: 'Enchanting Table',
    lit_pumpkin: "Jack o'Lantern",
    reeds: 'Sugar Cane',
    slime: 'Slime Block',
    totem: 'Totem of Undying',
    fireball: 'Fire Charge',
    speckled_melon: 'Glistering Melon Slice',
    empty_map: 'Empty Map',
    map: 'Map',
    cooked_beef: 'Steak',
    cooked_fish: 'Cooked Cod',
    fish: 'Raw Cod',
    wooden_door: 'Oak Door',
    wooden_sword: 'Wooden Sword',
    wooden_pickaxe: 'Wooden Pickaxe',
    wooden_axe: 'Wooden Axe',
    wooden_shovel: 'Wooden Shovel',
    wooden_hoe: 'Wooden Hoe'
  };

  function normalizeId(value) {
    return String(value || '').replace(/^minecraft:/, '').trim().toLowerCase();
  }

  function titleFromId(id) {
    return normalizeId(id)
      .split('_')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function itemName(itemOrId) {
    if (typeof itemOrId === 'object' && itemOrId) {
      const id = normalizeId(itemOrId.id);
      return NAME_OVERRIDES[id] || itemOrId.name || titleFromId(id);
    }
    const id = normalizeId(itemOrId);
    return NAME_OVERRIDES[id] || titleFromId(id);
  }

  function fileUrl(base, filename) {
    return base + encodeURIComponent(filename).replace(/%2F/gi, '/');
  }

  function candidates(itemOrId) {
    const id = normalizeId(typeof itemOrId === 'object' ? itemOrId.id : itemOrId);
    const name = itemName(itemOrId);
    const spriteId = id.replace(/_/g, '-');
    const filenames = [
      `Invicon ${name}.png`,
      `ItemSprite ${spriteId}.png`,
      `BlockSprite ${spriteId}.png`
    ];
    return [
      ...filenames.map(filename => fileUrl(CURRENT_WIKI, filename)),
      ...filenames.map(filename => fileUrl(LEGACY_WIKI, filename))
    ];
  }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('') || '?';
  }

  function placeholder(name) {
    const text = initials(name);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#111827"/><rect x="5" y="5" width="54" height="54" rx="5" fill="#26364f" stroke="#6c83a7" stroke-width="3"/><path d="M9 47h46v8H9z" fill="#17243a"/><text x="32" y="39" text-anchor="middle" font-family="monospace" font-size="22" font-weight="700" fill="#f5f8fc">${text}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function create(itemOrId, options = {}) {
    const id = normalizeId(typeof itemOrId === 'object' ? itemOrId.id : itemOrId);
    const name = itemName(itemOrId);
    const urls = candidates(itemOrId);
    const img = document.createElement('img');
    img.className = ['minecraftItemIcon', options.className || ''].filter(Boolean).join(' ');
    img.alt = options.alt || `${name} inventory icon`;
    img.title = options.title || name;
    img.loading = options.eager ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.dataset.itemId = id;
    img.dataset.iconIndex = '0';
    img.src = urls[0] || placeholder(name);
    img.addEventListener('error', () => {
      const next = Number(img.dataset.iconIndex || 0) + 1;
      img.dataset.iconIndex = String(next);
      if (next < urls.length) img.src = urls[next];
      else {
        img.removeAttribute('data-icon-index');
        img.src = placeholder(name);
        img.classList.add('iconFallback');
      }
    });
    return img;
  }

  function mount(target, itemOrId, options = {}) {
    if (!target) return null;
    const img = create(itemOrId, options);
    target.replaceChildren(img);
    return img;
  }

  window.CCCItemIcons = {
    sourceName: 'Minecraft Wiki inventory sprites',
    sourceUrl: 'https://minecraft.wiki/w/Category:Item_icons',
    normalizeId,
    itemName,
    candidates,
    create,
    mount
  };
})();
