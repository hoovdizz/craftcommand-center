const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public', 'item-catalog.json'), 'utf8'));
const catalogIds = new Set(catalog.items.map(item => item.id));
const input = fs.readFileSync(0, 'utf8');
const source = JSON.parse(input).parse?.wikitext?.['*'];
if (!source) throw new Error('Minecraft achievement wikitext was not found');

function achievementTemplates(text) {
  const templates = [];
  let start = text.indexOf('{{Achievements');
  while (start >= 0) {
    let braces = 0;
    let end = start;
    for (; end < text.length - 1; end += 1) {
      const pair = text.slice(end, end + 2);
      if (pair === '{{') { braces += 1; end += 1; continue; }
      if (pair === '}}') {
        braces -= 1;
        end += 1;
        if (braces === 0) { templates.push(text.slice(start, end + 1)); break; }
      }
    }
    start = text.indexOf('{{Achievements', end + 1);
  }
  return templates;
}

function splitArguments(template) {
  const args = [];
  let current = '';
  let braces = 0;
  let links = 0;
  const body = template.slice('{{Achievements'.length, -2);
  for (let index = 0; index < body.length; index += 1) {
    const pair = body.slice(index, index + 2);
    if (pair === '{{') { braces += 1; current += pair; index += 1; continue; }
    if (pair === '}}') { braces -= 1; current += pair; index += 1; continue; }
    if (pair === '[[') { links += 1; current += pair; index += 1; continue; }
    if (pair === ']]') { links -= 1; current += pair; index += 1; continue; }
    if (body[index] === '|' && braces === 0 && links === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += body[index];
  }
  args.push(current.trim());
  if (!args[0]) args.shift();
  return args;
}

function clean(value) {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/gi, '')
    .replace(/\{\{control\|([^}]+)\}\}/gi, '$1')
    .replace(/\{\{(?:sic|Sic|Verify)(?:\|[^}]*)?\}\}/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[([^|\]#]+)(?:#[^|\]]*)?\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^|\]#]+)(?:#[^\]]*)?\]\]/g, '$1')
    .replace(/''+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&\#44;|&#44;/g, ',')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const ITEM_OVERRIDES = {
  'Bake Bread': [['wheat', 3]],
  'The Lie': [['wheat', 3], ['sugar', 2], ['milk_bucket', 3], ['egg', 1]],
  'On A Rail': [['minecart', 1], ['rail', 500]],
  'When Pigs Fly': [['saddle', 1], ['carrot_on_a_stick', 1]],
  'Sniper Duel': [['bow', 1], ['arrow', 16]],
  'Into The Nether': [['obsidian', 10], ['flint_and_steel', 1]],
  'Local Brewery': [['brewing_stand', 1], ['glass_bottle', 3], ['nether_wart', 1]],
  'The End?': [['ender_eye', 12]],
  'Enchanter': [['enchanting_table', 1]],
  'Overkill': [['diamond_sword', 1], ['potion_of_strength', 1]],
  'Librarian': [['bookshelf', 15]],
  'The Beginning?': [['wither_skeleton_skull', 3], ['soul_sand', 4]],
  'The Beaconator': [['beacon', 1], ['iron_block', 164]],
  'Repopulation': [['wheat', 2]],
  'Diamonds to you!': [['diamond', 1]],
  'Overpowered': [['enchanted_golden_apple', 1]],
  'Leader of the Pack': [['bone', 32]],
  'Iron Belly': [['rotten_flesh', 1]],
  'Rainbow Collection': [
    ['white_wool', 1], ['orange_wool', 1], ['magenta_wool', 1], ['light_blue_wool', 1],
    ['yellow_wool', 1], ['lime_wool', 1], ['pink_wool', 1], ['gray_wool', 1],
    ['light_gray_wool', 1], ['cyan_wool', 1], ['purple_wool', 1], ['blue_wool', 1],
    ['brown_wool', 1], ['green_wool', 1], ['red_wool', 1], ['black_wool', 1]
  ],
  "Stayin' Frosty": [['potion_of_fire_resistance', 1]],
  'Chestful of Cobblestone': [['cobblestone', 1728], ['chest', 1]],
  'Body Guard': [['iron_block', 4], ['carved_pumpkin', 1]],
  'Iron Man': [['iron_helmet', 1], ['iron_chestplate', 1], ['iron_leggings', 1], ['iron_boots', 1]],
  'Zombie Doctor': [['splash_potion_of_weakness', 1], ['golden_apple', 1]],
  'Archer': [['bow', 1], ['arrow', 16]],
  'Tie Dye Outfit': [['cauldron', 1], ['leather_helmet', 1], ['leather_chestplate', 1], ['leather_leggings', 1], ['leather_boots', 1]],
  'Map Room': [['item_frame', 9], ['empty_map', 9]],
  'Freight Station': [['hopper', 1], ['chest_minecart', 1], ['chest', 1]],
  'Smelt Everything!': [['furnace', 1], ['hopper', 3], ['chest', 3]],
  'Taste of Your Own Medicine': [['splash_potion_of_poison', 1]],
  'Inception': [['piston', 2], ['slime_block', 1], ['redstone', 8]],
  'Free Diver': [['potion_of_water_breathing', 1]],
  'Super Fuel': [['lava_bucket', 1], ['furnace', 1]],
  'You Need a Mint': [['glass_bottle', 1]],
  'Beam Me Up': [['ender_pearl', 4]],
  'The End... Again...': [['end_crystal', 4]],
  'Super Sonic': [['elytra', 1], ['firework_rocket', 16]],
  'Organizational Wizard': [['shulker_box', 1], ['anvil', 1], ['name_tag', 1]],
  'Cheating Death': [['totem_of_undying', 1]],
  'Let It Go!': [['leather_boots', 1]],
  'Castaway': [['dried_kelp', 64]],
  'I am a Marine Biologist': [['water_bucket', 1]],
  'Sleep with the Fishes': [['potion_of_water_breathing', 3]],
  'Alternative Fuel': [['dried_kelp_block', 1], ['furnace', 1]],
  'Do a Barrel Roll!': [['trident', 1]],
  'One Pickle, Two Pickle, Sea Pickle, Four': [['sea_pickle', 4]],
  'Echolocation': [['cod', 1]],
  'Moskstraumen': [['conduit', 1], ['prismarine', 16]],
  'Top of the World': [['scaffolding', 64]],
  'Fruit on the Loom': [['white_banner', 1], ['enchanted_golden_apple', 1], ['paper', 1]],
  'Disenchanted': [['grindstone', 1], ['enchanted_book', 1]],
  'Sound the Alarm!': [['bell', 1]],
  'Time for Stew': [['suspicious_stew', 1]],
  'Bee our guest': [['campfire', 1], ['glass_bottle', 1]],
  'Total Beelocation': [['diamond_pickaxe', 1]],
  'Sticky Situation': [['honey_block', 1]],
  'Bullseye': [['target', 1], ['bow', 1], ['arrow', 8]],
  'Cover me in debris': [['netherite_helmet', 1], ['netherite_chestplate', 1], ['netherite_leggings', 1], ['netherite_boots', 1]],
  'Oooh, shiny!': [['gold_ingot', 1]],
  'Whatever Floats Your Goat': [['oak_boat', 1]],
  'Wax on, Wax off': [['honeycomb', 64], ['stone_axe', 1]],
  'Caves & Cliffs': [['water_bucket', 1], ['slime_block', 1]],
  'Sound of Music': [['jukebox', 1], ['music_disc_13', 1]],
  'Feels Like Home': [['warped_fungus_on_a_stick', 1], ['saddle', 1], ['lava_bucket', 8]],
  'It spreads': [['sculk_catalyst', 1]],
  'Birthday song': [['cake', 2], ['note_block', 1]],
  'With our powers combined!': [['pearlescent_froglight', 1], ['verdant_froglight', 1], ['ochre_froglight', 1]],
  'Sneak 100': [['sculk_sensor', 1]],
  'Careful restoration': [['decorated_pot', 1]],
  'Crafters Crafting Crafters': [['crafter', 2]],
  'Who Needs Rockets?': [['wind_charge', 8]],
  'Over-Overkill': [['mace', 1], ['potion_of_strength', 1]],
  'Revaulting': [['ominous_trial_key', 1]],
  'Stay Hydrated!': [['dried_ghast', 1], ['water_bucket', 1]],
  'Mob Kabob': [['spear', 1]]
};

function inferredItems(raw, title) {
  if (ITEM_OVERRIDES[title]) return ITEM_OVERRIDES[title].filter(([item]) => catalogIds.has(item)).map(([item, amount]) => ({ item, amount }));
  const found = [];
  for (const match of raw.matchAll(/\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]+)?\]\]/g)) {
    const id = match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (catalogIds.has(id) && !found.includes(id)) found.push(id);
  }
  return found.slice(0, 8).map(item => ({ item, amount: 1 }));
}

function categoryFor(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (/nether|ghast|blaze|strider|piglin/.test(text)) return 'Nether';
  if (/ender|dragon|shulker|elytra/.test(text)) return 'The End';
  if (/ocean|underwater|fish|dolphin|conduit|kelp|trident/.test(text)) return 'Ocean';
  if (/villager|trade|raid|pillager|ravager|evoker/.test(text)) return 'Village';
  if (/breed|farm|wheat|animal|bee|cat|wolf|panda|goat/.test(text)) return 'Farming';
  if (/kill|attack|damage|monster|sword|bow|armor|mace|spear/.test(text)) return 'Combat';
  if (/piston|hopper|furnace|crafter|redstone|dispenser/.test(text)) return 'Engineering';
  if (/travel|visit|find|discover|biome|map|treasure/.test(text)) return 'Exploration';
  return 'Progression';
}

const achievements = achievementTemplates(source).map((template, index) => {
  const args = splitArguments(template);
  const named = {};
  const positional = [];
  for (const arg of args) {
    const match = arg.match(/^([a-z][a-z ]*)\s*=\s*([\s\S]*)$/i);
    if (match) named[match[1].trim().toLowerCase()] = match[2].trim();
    else positional.push(arg);
  }
  const title = clean(named.title);
  const description = clean(positional[0]);
  const detail = clean(positional[1]) || description;
  const gamerscore = clean(positional[2]);
  const trophy = clean(positional[3]);
  const items = inferredItems(`${positional[0] || ''}\n${positional[1] || ''}`, title);
  return {
    id: title.toLowerCase().replace(/\?/g, ' question').replace(/&[^;]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    order: index + 1,
    title,
    description,
    guide: detail,
    category: categoryFor(title, `${description} ${detail}`),
    gamerscore: Number.parseInt(gamerscore, 10) || 0,
    platforms: trophy ? ['Xbox', 'Windows', 'Android', 'iOS', 'Nintendo Switch', 'PlayStation'] : ['Xbox', 'Windows', 'Android', 'iOS', 'Nintendo Switch'],
    trophy: trophy || null,
    items
  };
}).filter(entry => entry.title);

const output = {
  metadata: {
    edition: 'Bedrock Edition',
    count: achievements.length,
    snapshotDate: '2026-08-03',
    source: 'https://minecraft.fandom.com/wiki/Achievement',
    platformNote: 'Xbox, Windows, Android, iOS, and Nintendo Switch use Microsoft-account achievements. PlayStation records supported goals as PSN trophies.'
  },
  achievements
};

if (achievements.length < 130) throw new Error(`Expected at least 130 achievements, parsed ${achievements.length}`);
fs.writeFileSync(path.join(root, 'public', 'achievements.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Wrote ${achievements.length} achievements`);
