const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const required = [
  'config.example.json', 'public/item-catalog.json', 'public/index.html',
  'public/items.html', 'public/activity.html', 'public/accounts.html',
  'public/help.html', 'public/status.html', 'public/status.js', 'public/achievements.html',
  'public/achievements.js', 'public/achievements.json', 'public/pwa.js', 'public/manifest.webmanifest',
  'public/app-icon-192.png', 'public/app-icon-512.png', 'public/item-icons.js', 'templates/my-craftcommand-center.xml', 'Dockerfile'
];
for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Missing required file: ${file}`);
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/item-catalog.json'), 'utf8'));
const achievements = JSON.parse(fs.readFileSync(path.join(root, 'public/achievements.json'), 'utf8'));
if (config.minecraftContainerName !== 'binhex-minecraftbedrockserver') throw new Error('Unexpected default Minecraft container');
if (config.screenSession !== 'auto' || config.commandMethod !== 'attach') throw new Error('Binhex attachment defaults are incorrect');
if (config.display?.defaultMode !== 'text') throw new Error('Text-only must be the default button mode');
if (!Array.isArray(config.teleportLocations)) throw new Error('Teleport locations must be an array');
if (config.backup?.sourcePath !== '/config' || config.backup?.directory !== '/app/backups') throw new Error('Backup defaults are incorrect');
if (Number(config.externalServer?.port) !== 19132) throw new Error('External Bedrock port default is incorrect');
if (!Array.isArray(catalog.items) || catalog.items.length < 1000) throw new Error('Item catalog is incomplete');
if (catalog.metadata.count !== catalog.items.length) throw new Error('Catalog count metadata is incorrect');
if (catalog.metadata.minecraftRelease !== config.itemCatalog.release) throw new Error('Catalog release tags do not match');
if (!Array.isArray(achievements.achievements) || achievements.achievements.length < 130) throw new Error('Achievement catalog is incomplete');
if (achievements.metadata.count !== achievements.achievements.length) throw new Error('Achievement count metadata is incorrect');
if (new Set(achievements.achievements.map(entry => entry.id)).size !== achievements.achievements.length) throw new Error('Achievement IDs must be unique');
const itemIds = new Set(catalog.items.map(item => item.id));
for (const achievement of achievements.achievements) {
  if (!['Recipe materials', 'Activity supplies', 'No item kit'].includes(achievement.supplyType)) {
    throw new Error(`Invalid achievement supply type: ${achievement.title}`);
  }
  if (typeof achievement.supplyNote !== 'string' || !achievement.supplyNote.trim()) {
    throw new Error(`Missing achievement supply note: ${achievement.title}`);
  }
  if (achievement.supplyType === 'No item kit' && achievement.items?.length) {
    throw new Error(`No-item achievement contains supplies: ${achievement.title}`);
  }
  for (const entry of achievement.items || []) {
    if (!itemIds.has(entry.item)) throw new Error(`Unknown achievement supply item: ${entry.item}`);
    if (!Number.isInteger(entry.amount) || entry.amount < 1 || entry.amount > 2304) throw new Error(`Invalid achievement supply amount: ${entry.item}`);
  }
}

const recipeRegressions = {
  'Benchmaking': { planks: 4 },
  'Time to Mine!': { planks: 3, stick: 2, crafting_table: 1 },
  'Hot Topic': { cobblestone: 8, crafting_table: 1 },
  'Time to Farm!': { planks: 2, stick: 2, crafting_table: 1 },
  'Getting an Upgrade': { cobblestone: 3, stick: 2, crafting_table: 1 },
  'Time to Strike!': { planks: 2, stick: 1, crafting_table: 1 },
  'Enchanter': { book: 1, diamond: 2, obsidian: 4, crafting_table: 1 },
  'Librarian': { planks: 6, book: 3, crafting_table: 1 },
  'MOAR Tools': { planks: 9, stick: 8, crafting_table: 1 },
  'Dispense with This': { cobblestone: 7, bow: 1, redstone: 1, crafting_table: 1 },
  'Pot Planter': { brick: 3, crafting_table: 1 },
  "It's a Sign!": { planks: 6, stick: 1, crafting_table: 1 },
  'Iron Man': { iron_ingot: 24, crafting_table: 1 },
  'Moskstraumen': { nautilus_shell: 8, heart_of_the_sea: 1, crafting_table: 1, prismarine: 16 },
  'Bullseye': { redstone: 4, hay_block: 1, crafting_table: 1, bow: 1, arrow: 8 },
  'Careful restoration': { angler_pottery_sherd: 1, archer_pottery_sherd: 1, arms_up_pottery_sherd: 1, blade_pottery_sherd: 1, crafting_table: 1 },
  'Birthday song': { cake: 2, noteblock: 1 },
  'Crafters Crafting Crafters': { crafter: 1, iron_ingot: 5, crafting_table: 1, redstone: 2, dropper: 1 },
  'Who Needs Rockets?': { breeze_rod: 2 },
  'Mob Kabob': { planks: 1, stick: 2, crafting_table: 1 }
};
for (const [title, expected] of Object.entries(recipeRegressions)) {
  const achievement = achievements.achievements.find(entry => entry.title === title);
  if (!achievement) throw new Error(`Missing recipe regression achievement: ${title}`);
  const actual = Object.fromEntries(achievement.items.map(entry => [entry.item, entry.amount]));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Incorrect audited recipe supplies: ${title}`);
}
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
for (const requiredCommand of ['time set ${time}', 'tp ${target} ${clean.x} ${clean.y} ${clean.z} true', 'execute in ${clean.dimension} run ${command}']) {
  if (!serverSource.includes(requiredCommand)) throw new Error(`Missing validated world-control command: ${requiredCommand}`);
}
console.log(`Config check OK: ${catalog.items.length} items, ${achievements.achievements.length} achievements, Bedrock ${catalog.metadata.minecraftRelease}`);
