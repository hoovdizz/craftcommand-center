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
  for (const entry of achievement.items || []) {
    if (!itemIds.has(entry.item)) throw new Error(`Unknown achievement supply item: ${entry.item}`);
    if (!Number.isInteger(entry.amount) || entry.amount < 1 || entry.amount > 2304) throw new Error(`Invalid achievement supply amount: ${entry.item}`);
  }
}
console.log(`Config check OK: ${catalog.items.length} items, ${achievements.achievements.length} achievements, Bedrock ${catalog.metadata.minecraftRelease}`);
