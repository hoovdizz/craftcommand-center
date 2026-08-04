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

const recipe = (items, note = 'Ingredients for one recipe. A crafting table is included when the recipe needs the 3×3 grid.') => ({
  supplyType: 'Recipe materials',
  supplyNote: note,
  items
});
const kit = (items, note = 'Equipment and consumables used for this achievement. Complete the activity in a legitimate Survival world for credit.') => ({
  supplyType: 'Activity supplies',
  supplyNote: note,
  items
});
const noKit = (note = 'No inventory kit is required. Follow the activity guide in a legitimate Survival world.') => ({
  supplyType: 'No item kit',
  supplyNote: note,
  items: []
});

// Every Bedrock achievement is deliberately listed here. Do not infer supplies from
// wiki links: linked pages often name the finished item instead of its ingredients.
const ACHIEVEMENT_SUPPLIES = {
  'Taking Inventory': noKit(),
  'Getting Wood': noKit('No inventory kit is required; punch a naturally generated tree.'),
  'Benchmaking': recipe([['planks', 4]], 'Four planks make one crafting table in the 2×2 inventory grid.'),
  'Time to Mine!': recipe([['planks', 3], ['stick', 2], ['crafting_table', 1]], 'Three planks and two sticks make one wooden pickaxe.'),
  'Hot Topic': recipe([['cobblestone', 8], ['crafting_table', 1]], 'Eight cobblestone make one furnace.'),
  'Acquire Hardware': recipe([['raw_iron', 1], ['coal', 1], ['furnace', 1]], 'Smelt one raw iron with fuel in a furnace.'),
  'Time to Farm!': recipe([['planks', 2], ['stick', 2], ['crafting_table', 1]], 'Two planks and two sticks make one wooden hoe.'),
  'Bake Bread': recipe([['wheat', 3], ['crafting_table', 1]], 'Three wheat make one loaf of bread.'),
  'The Lie': recipe([['wheat', 3], ['sugar', 2], ['milk_bucket', 3], ['egg', 1], ['crafting_table', 1]]),
  'Getting an Upgrade': recipe([['cobblestone', 3], ['stick', 2], ['crafting_table', 1]], 'Three cobblestone and two sticks make one stone pickaxe.'),
  'Delicious Fish': recipe([['cod', 1], ['coal', 1], ['furnace', 1]], 'Catch raw cod, then cook it with fuel in a furnace.'),
  'On A Rail': kit([['minecart', 1], ['rail', 500]], 'Five hundred regular rails cover the required straight-line distance; slopes or powered sections may need powered rails.'),
  'Time to Strike!': recipe([['planks', 2], ['stick', 1], ['crafting_table', 1]], 'Two planks and one stick make one wooden sword.'),
  'Monster Hunter': kit([['wooden_sword', 1]]),
  'Cow Tipper': kit([['wooden_sword', 1]], 'Leather must be harvested from a cow; the sword is only the required equipment.'),
  'When Pigs Fly': kit([['saddle', 1], ['carrot_on_a_stick', 1]]),
  'Sniper Duel': kit([['bow', 1], ['arrow', 16]]),
  'DIAMONDS!': kit([['iron_pickaxe', 1]], 'Mine naturally generated diamond ore with an iron-tier or better pickaxe.'),
  'Into The Nether': kit([['obsidian', 10], ['flint_and_steel', 1]], 'Ten obsidian build the smallest valid portal frame; ignite it with flint and steel.'),
  'Return to Sender': noKit('Return a Ghast fireball with a timed attack; no inventory item is required.'),
  'Into Fire': kit([['wooden_sword', 1]], 'Defeat a naturally spawned Blaze and collect its dropped rod.'),
  'Local Brewery': recipe([['brewing_stand', 1], ['glass_bottle', 3], ['nether_wart', 1], ['blaze_powder', 1]], 'Fill the bottles with water, fuel the stand with blaze powder, and brew with nether wart.'),
  'The End?': kit([['ender_eye', 12]], 'A portal can require up to twelve Eyes of Ender; naturally generated frames may already contain some.'),
  'The End': kit([['bow', 1], ['arrow', 64], ['diamond_sword', 1]]),
  'Enchanter': recipe([['book', 1], ['diamond', 2], ['obsidian', 4], ['crafting_table', 1]]),
  'Overkill': kit([['diamond_sword', 1]], 'Enchantments or a Strength effect may still be needed to reach nine hearts in one hit.'),
  'Librarian': recipe([['planks', 6], ['book', 3], ['crafting_table', 1]], 'Six matching planks and three books make one bookshelf. Repeat the recipe for additional shelves.'),
  'Adventuring Time': noKit('This is an exploration achievement; visit the required biomes in one Survival world.'),
  'The Beginning?': kit([['wither_skeleton_skull', 3], ['soul_sand', 4]]),
  'The Beginning.': kit([['diamond_sword', 1], ['bow', 1], ['arrow', 64]]),
  'The Beaconator': recipe([['glass', 5], ['nether_star', 1], ['obsidian', 3], ['crafting_table', 1], ['iron_block', 164]], 'The beacon recipe uses five glass, one Nether Star, and three obsidian. A full four-level solid pyramid needs 164 mineral blocks.'),
  'Repopulation': kit([['wheat', 2]]),
  'Diamonds to you!': kit([['diamond', 1]]),
  'Overpowered': kit([['enchanted_golden_apple', 1]]),
  'MOAR Tools': recipe([['planks', 9], ['stick', 8], ['crafting_table', 1]], 'Nine planks and eight sticks make one wooden pickaxe, axe, shovel, and hoe.'),
  'Dispense with This': recipe([['cobblestone', 7], ['bow', 1], ['redstone', 1], ['crafting_table', 1]]),
  'Leader of the Pack': kit([['bone', 32]], 'Taming is chance-based, so the kit includes extra bones for five wolves.'),
  'Pork Chop': recipe([['porkchop', 1], ['coal', 1], ['furnace', 1]], 'Cook a raw porkchop with fuel, then eat the cooked result.'),
  'Passing the Time': noKit(),
  'The Haggler': kit([['emerald', 30]], 'Spend these emeralds through villager or wandering-trader trades; availability depends on the traders you find.'),
  'Pot Planter': recipe([['brick', 3], ['crafting_table', 1]], 'Three bricks make one flower pot.'),
  "It's a Sign!": recipe([['planks', 6], ['stick', 1], ['crafting_table', 1]], 'Six matching planks and one stick make three signs; place one oak sign.'),
  'Iron Belly': kit([['rotten_flesh', 1]]),
  'Have a Shearful Day': kit([['shears', 1]]),
  'Rainbow Collection': kit([
    ['white_wool', 1], ['orange_wool', 1], ['magenta_wool', 1], ['light_blue_wool', 1],
    ['yellow_wool', 1], ['lime_wool', 1], ['pink_wool', 1], ['gray_wool', 1],
    ['light_gray_wool', 1], ['cyan_wool', 1], ['purple_wool', 1], ['blue_wool', 1],
    ['brown_wool', 1], ['green_wool', 1], ['red_wool', 1], ['black_wool', 1]
  ]),
  "Stayin' Frosty": recipe([['brewing_stand', 1], ['glass_bottle', 1], ['nether_wart', 1], ['magma_cream', 1], ['blaze_powder', 1]], 'Fill the bottle with water, brew an Awkward Potion with nether wart, then add magma cream for Fire Resistance.'),
  'Chestful of Cobblestone': kit([['cobblestone', 1728], ['chest', 1]]),
  'Renewable Energy': recipe([['log', 1], ['charcoal', 1], ['furnace', 1]], 'Use charcoal as the fuel while smelting a log into more charcoal.'),
  'Body Guard': kit([['iron_block', 4], ['carved_pumpkin', 1]]),
  'Iron Man': recipe([['iron_ingot', 24], ['crafting_table', 1]], 'Twenty-four iron ingots make a full helmet, chestplate, leggings, and boots set.'),
  'Zombie Doctor': recipe([['brewing_stand', 1], ['glass_bottle', 1], ['fermented_spider_eye', 1], ['gunpowder', 1], ['blaze_powder', 1], ['golden_apple', 1]], 'Fill the bottle, brew Weakness with a fermented spider eye, add gunpowder to make it splash, then use it before the golden apple.'),
  'Lion Hunter': kit([['cod', 16]], 'Ocelot trust is chance-based; approach slowly and feed raw cod.'),
  'Archer': kit([['bow', 1], ['arrow', 16]]),
  'Tie Dye Outfit': kit([['cauldron', 1], ['water_bucket', 1], ['red_dye', 4], ['leather_helmet', 1], ['leather_chestplate', 1], ['leather_leggings', 1], ['leather_boots', 1]], 'In Bedrock Edition, add water and dye to the cauldron, then dye all four leather armor pieces.'),
  'Trampoline': kit([['slime', 1]], 'The Bedrock command ID for a slime block is “slime.”'),
  'Camouflage': kit([['zombie_head', 1], ['wooden_sword', 1]], 'Wear the zombie head while killing a zombie. Other matching mob/head combinations also work.'),
  'Map Room': kit([['frame', 9], ['empty_map', 9]], 'Explore and align all nine maps before placing them in a 3×3 grid of item frames.'),
  'Freight Station': kit([['hopper', 1], ['chest_minecart', 1], ['chest', 1], ['rail', 1]]),
  'Smelt Everything!': kit([['furnace', 1], ['hopper', 3], ['chest', 3]]),
  'Taste of Your Own Medicine': recipe([['brewing_stand', 1], ['glass_bottle', 1], ['nether_wart', 1], ['spider_eye', 1], ['gunpowder', 1], ['blaze_powder', 1]], 'Brew an Awkward Potion, add a spider eye for Poison, then gunpowder to make it a splash potion.'),
  'Inception': kit([['piston', 1], ['sticky_piston', 1], ['lever', 2]], 'Use the regular piston to push the sticky piston, then power the sticky piston to pull the first piston.'),
  'Saddle Up': kit([['golden_carrot', 8], ['saddle', 1]], 'Taming itself requires repeated mounting; food helps growth/healing and the saddle lets you control the horse afterward.'),
  'Artificial Selection': kit([['golden_carrot', 2]], 'Feed one golden carrot to a tamed horse and one to a tamed donkey.'),
  'Free Diver': recipe([['brewing_stand', 1], ['glass_bottle', 1], ['nether_wart', 1], ['pufferfish', 1], ['redstone', 1], ['blaze_powder', 1]], 'Brew Water Breathing and add redstone dust to extend it to eight minutes.'),
  'Rabbit Season': recipe([['rabbit', 1], ['coal', 1], ['furnace', 1]], 'Cook raw rabbit with fuel, then eat the cooked rabbit.'),
  'The Deep End': kit([['trident', 1], ['shield', 1]], 'Water Breathing and defensive enchantments are recommended but cannot be encoded by a plain item command.'),
  'Dry Spell': recipe([['wet_sponge', 1], ['coal', 1], ['furnace', 1]], 'Smelt one wet sponge with fuel in a furnace.'),
  'Super Fuel': kit([['lava_bucket', 1], ['furnace', 1]]),
  'You Need a Mint': kit([['glass_bottle', 1]]),
  'Beam Me Up': kit([['ender_pearl', 4]]),
  'The End... Again...': kit([['end_crystal', 4]]),
  'Great View From Up Here': noKit('Stand in a Shulker projectile path and maintain Levitation for fifty blocks.'),
  'Super Sonic': kit([['elytra', 1], ['firework_rocket', 16]]),
  'Treasure Hunter': kit([['emerald', 20], ['compass', 1]], 'Trade with a cartographer for its explorer map; a command-given generic map does not contain the required destination data.'),
  'Organizational Wizard': kit([['shulker_box', 1], ['anvil', 1]], 'Rename the Shulker Box directly in the anvil; a name tag is not required.'),
  'Cheating Death': kit([['totem_of_undying', 1]]),
  'Feeling Ill': kit([['diamond_sword', 1]]),
  'Let It Go!': kit([['leather_boots', 1], ['enchanted_book', 1], ['anvil', 1]], 'The boots must actually have Frost Walker. Plain /give commands cannot select that enchantment, so obtain a Frost Walker book before using the anvil.'),
  'So I Got That Going for Me': kit([['lead', 5]], 'Lead one llama and let four nearby tamed llamas join its caravan; extra leads make setup easier.'),
  'Atlantis?': kit([['oak_boat', 1]]),
  'Sail the 7 Seas': kit([['oak_boat', 1]]),
  'Castaway': kit([['dried_kelp', 64]]),
  'Ahoy!': kit([['oak_boat', 1]]),
  'I am a Marine Biologist': kit([['water_bucket', 1]], 'Use the water bucket on a live fish to collect it; a pre-filled fish bucket skips the required action.'),
  'Me Gold!': kit([['iron_shovel', 1]], 'Find the buried-treasure location legitimately; generic command-given maps do not contain treasure data.'),
  'Sleep with the Fishes': recipe([['brewing_stand', 1], ['glass_bottle', 3], ['nether_wart', 1], ['pufferfish', 1], ['redstone', 1], ['blaze_powder', 1]], 'One brewing batch makes three extended Water Breathing potions, enough for one full Minecraft day.'),
  'Alternative Fuel': kit([['dried_kelp_block', 1], ['furnace', 1]]),
  'Do a Barrel Roll!': kit([['trident', 1], ['enchanted_book', 1], ['anvil', 1]], 'The trident must actually have Riptide. Plain /give commands cannot select that enchantment.'),
  'One Pickle, Two Pickle, Sea Pickle, Four': kit([['sea_pickle', 4]]),
  'Echolocation': kit([['cod', 1]]),
  'Moskstraumen': recipe([['nautilus_shell', 8], ['heart_of_the_sea', 1], ['crafting_table', 1], ['prismarine', 16]], 'Eight nautilus shells and one Heart of the Sea make the conduit; sixteen valid prismarine-family blocks form the minimum activation frame.'),
  'Top of the World': kit([['scaffolding', 384]], 'This covers the full modern Overworld height range; the exact number used depends on the starting elevation.'),
  'Where Have You Been?': kit([['cod', 16], ['bed', 1]], 'Tame a cat with raw cod, sleep with it able to reach you, and leave room for its morning gift.'),
  'Zoologist': kit([['bamboo', 2]]),
  'Fruit on the Loom': recipe([['enchanted_golden_apple', 1], ['paper', 1], ['banner', 1], ['red_dye', 1], ['loom', 1]], 'Craft the Thing/Mojang banner pattern from paper and an enchanted golden apple, then apply it to a banner with dye in a loom.'),
  'Plethora of Cats': kit([['cod', 64]], 'Cat taming is chance-based, so the kit includes extra raw cod.'),
  'Kill the Beast!': kit([['bow', 1], ['arrow', 64], ['diamond_sword', 1]]),
  'Buy Low, Sell High': noKit('Earn a strong villager discount, such as Hero of the Village or curing a zombie villager, then complete a discounted trade.'),
  'Disenchanted': kit([['grindstone', 1], ['enchanted_book', 1]]),
  "We're being attacked!": kit([['ominous_bottle', 1]], 'Drink the Ominous Bottle, then enter a village to convert Bad Omen into Raid Omen and trigger the raid.'),
  'Sound the Alarm!': kit([['bell', 1]], 'Ring the bell while a hostile raid enemy is present in the village.'),
  "I've got a bad feeling about this": kit([['diamond_sword', 1]], 'Defeat a naturally spawned Pillager Captain.'),
  'Master Trader': noKit('This long-term achievement requires receiving a cumulative 1,000 emeralds through legitimate villager trades.'),
  'Time for Stew': kit([['suspicious_stew', 1]]),
  'Bee our guest': kit([['campfire', 1], ['glass_bottle', 1]]),
  'Total Beelocation': kit([['diamond_pickaxe', 1]], 'The tool must actually have Silk Touch. Plain /give commands cannot select that enchantment, and the nest must contain three bees.'),
  'Sticky Situation': kit([['honey_block', 1]]),
  'Bullseye': recipe([['redstone', 4], ['hay_block', 1], ['crafting_table', 1], ['bow', 1], ['arrow', 8]], 'Four redstone dust and one hay bale make the target; use the bow and arrows to hit its center.'),
  'Cover me in debris': kit([['netherite_helmet', 1], ['netherite_chestplate', 1], ['netherite_leggings', 1], ['netherite_boots', 1]]),
  'Oooh, shiny!': kit([['gold_ingot', 1]]),
  'Hot tourist destination': noKit('This is an exploration achievement; visit every Nether biome in one Survival world.'),
  'Whatever Floats Your Goat': kit([['oak_boat', 1]]),
  'Wax on, Wax off': kit([
    ['copper_block', 1], ['exposed_copper', 1], ['weathered_copper', 1], ['oxidized_copper', 1],
    ['cut_copper', 1], ['exposed_cut_copper', 1], ['weathered_cut_copper', 1], ['oxidized_cut_copper', 1],
    ['cut_copper_slab', 1], ['exposed_cut_copper_slab', 1], ['weathered_cut_copper_slab', 1], ['oxidized_cut_copper_slab', 1],
    ['cut_copper_stairs', 1], ['exposed_cut_copper_stairs', 1], ['weathered_cut_copper_stairs', 1], ['oxidized_cut_copper_stairs', 1],
    ['honeycomb', 16], ['stone_axe', 1]
  ], 'Wax and then scrape the original sixteen copper block, cut-block, slab, and stair oxidation variants. Newer copper shapes are not part of this achievement.'),
  'The Healing Power of Friendship!': kit([['axolotl_bucket', 1], ['diamond_sword', 1]]),
  'Caves & Cliffs': kit([['water_bucket', 1]], 'Land in placed water to survive the full build-limit-to-bottom fall.'),
  'Star trader': kit([['emerald', 16], ['minecart', 1], ['rail', 64]], 'Move or find a villager at build height, then complete any available trade there.'),
  'Sound of Music': kit([['jukebox', 1], ['music_disc_13', 1]]),
  'Feels Like Home': kit([['warped_fungus_on_a_stick', 1], ['saddle', 1], ['lava_bucket', 8]]),
  'It spreads': kit([['sculk_catalyst', 1], ['wooden_sword', 1]]),
  'Birthday song': kit([['cake', 2], ['noteblock', 1]], 'Give the Allay one cake as its filter item and let it collect the second cake, then play the note block so it drops the collected cake there.'),
  'With our powers combined!': kit([['pearlescent_froglight', 1], ['verdant_froglight', 1], ['ochre_froglight', 1]]),
  'Sneak 100': kit([['sculk_sensor', 1]]),
  'Planting the past': kit([['torchflower_seeds', 1], ['pitcher_pod', 1]], 'Plant either a Torchflower Seed or a Pitcher Pod; both are supplied so either route is available.'),
  'Careful restoration': recipe([['angler_pottery_sherd', 1], ['archer_pottery_sherd', 1], ['arms_up_pottery_sherd', 1], ['blade_pottery_sherd', 1], ['crafting_table', 1]], 'Place four pottery sherds in the decorated-pot recipe; any four sherd types can be used.'),
  'Smithing with style': kit([
    ['spire_armor_trim_smithing_template', 1], ['snout_armor_trim_smithing_template', 1],
    ['rib_armor_trim_smithing_template', 1], ['ward_armor_trim_smithing_template', 1],
    ['silence_armor_trim_smithing_template', 1], ['vex_armor_trim_smithing_template', 1],
    ['tide_armor_trim_smithing_template', 1], ['wayfinder_armor_trim_smithing_template', 1],
    ['iron_chestplate', 1], ['redstone', 8], ['smithing_table', 1]
  ], 'Apply each of the eight named templates. The same armor piece can be re-trimmed; each application consumes one template and one trim material.'),
  'Crafters Crafting Crafters': recipe([['crafter', 1], ['iron_ingot', 5], ['crafting_table', 1], ['redstone', 2], ['dropper', 1]], 'Use the first Crafter as the machine. Five iron ingots, one crafting table, two redstone dust, and one dropper are the ingredients for the Crafter it must produce.'),
  'Who Needs Rockets?': recipe([['breeze_rod', 2]], 'Each Breeze Rod crafts into four Wind Charges, so two rods provide the eight charges named by the achievement.'),
  'Over-Overkill': kit([['mace', 1]], 'Use a high-density smash attack; appropriate enchantments and a sufficient fall height are still required to reach fifty hearts.'),
  'Revaulting': kit([['ominous_bottle', 1]], 'Ominous Trial Keys carry special item data and are not safely generated by the generic item command. Drink the bottle, complete an ominous trial, and earn a key from its spawners.'),
  'Stay Hydrated!': kit([['dried_ghast', 1], ['water_bucket', 1]]),
  'Mob Kabob': recipe([['planks', 1], ['stick', 2], ['crafting_table', 1]], 'One plank and two sticks make a wooden spear. Line up five mobs and hit them with the same charge.')
};

function auditedSupplies(title) {
  const audited = ACHIEVEMENT_SUPPLIES[title];
  if (!audited) throw new Error(`Achievement supplies have not been audited: ${title}`);
  for (const [item, amount] of audited.items) {
    if (!catalogIds.has(item)) throw new Error(`Unknown catalog item in ${title}: ${item}`);
    if (!Number.isInteger(amount) || amount < 1) throw new Error(`Invalid amount in ${title}: ${item} x${amount}`);
  }
  return {
    supplyType: audited.supplyType,
    supplyNote: audited.supplyNote,
    items: audited.items.map(([item, amount]) => ({ item, amount }))
  };
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
  const supplies = auditedSupplies(title);
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
    supplyType: supplies.supplyType,
    supplyNote: supplies.supplyNote,
    items: supplies.items
  };
}).filter(entry => entry.title);

const output = {
  metadata: {
    edition: 'Bedrock Edition',
    count: achievements.length,
    snapshotDate: '2026-08-04',
    source: 'https://minecraft.fandom.com/wiki/Achievement',
    supplyMethod: 'Achievement requirements and crafting quantities were audited against the linked Minecraft Fandom item and recipe pages. Recipe goals list raw ingredients; activity goals list usable equipment and consumables.',
    platformNote: 'Xbox, Windows, Android, iOS, and Nintendo Switch use Microsoft-account achievements. PlayStation records supported goals as PSN trophies.'
  },
  achievements
};

if (achievements.length < 130) throw new Error(`Expected at least 130 achievements, parsed ${achievements.length}`);
fs.writeFileSync(path.join(root, 'public', 'achievements.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Wrote ${achievements.length} achievements`);
