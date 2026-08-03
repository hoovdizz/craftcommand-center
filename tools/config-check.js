const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const required = [
  'config.example.json', 'public/item-catalog.json', 'public/index.html',
  'public/items.html', 'public/activity.html', 'public/accounts.html',
  'public/help.html', 'templates/my-craftcommand-center.xml', 'Dockerfile'
];
for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Missing required file: ${file}`);
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/item-catalog.json'), 'utf8'));
if (config.minecraftContainerName !== 'binhex-minecraftbedrockserver') throw new Error('Unexpected default Minecraft container');
if (config.screenSession !== 'auto' || config.commandMethod !== 'attach') throw new Error('Binhex attachment defaults are incorrect');
if (!Array.isArray(catalog.items) || catalog.items.length < 1000) throw new Error('Item catalog is incomplete');
if (catalog.metadata.count !== catalog.items.length) throw new Error('Catalog count metadata is incorrect');
if (catalog.metadata.minecraftRelease !== config.itemCatalog.release) throw new Error('Catalog release tags do not match');
console.log(`Config check OK: ${catalog.items.length} items, Bedrock ${catalog.metadata.minecraftRelease}`);
