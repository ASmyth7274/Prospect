// Mineral catalogue. Prices are per kg; weights are log-normal around `kg` (median),
// clamped to [min, max]. `stat` is the museum stat this mineral boosts when displayed.

export const TIERS = [
  { id: 'common', name: 'Common', color: '#d7dde6', glow: '#ffffff', luckExp: 0, museum: 0.01 },
  { id: 'uncommon', name: 'Uncommon', color: '#5fe36a', glow: '#7dff8a', luckExp: 0.45, museum: 0.012 },
  { id: 'rare', name: 'Rare', color: '#4aa8ff', glow: '#6cc0ff', luckExp: 0.75, museum: 0.015 },
  { id: 'epic', name: 'Epic', color: '#b76bff', glow: '#cf98ff', luckExp: 0.95, museum: 0.022 },
  { id: 'legendary', name: 'Legendary', color: '#ffb22e', glow: '#ffd36b', luckExp: 1.1, museum: 0.032 },
  { id: 'mythic', name: 'Mythic', color: '#ff4f7b', glow: '#ff86a6', luckExp: 1.2, museum: 0.05 },
  { id: 'exotic', name: 'Exotic', color: '#7affea', glow: '#ffffff', luckExp: 1.3, museum: 0.1, rainbow: true },
];

export const STAT_NAMES = {
  luck: 'Luck',
  capacity: 'Capacity',
  digStrength: 'Dig Strength',
  digSpeed: 'Dig Speed',
  shakeStrength: 'Shake Strength',
  shakeSpeed: 'Shake Speed',
  sellBoost: 'Sell Boost',
  sizeBoost: 'Size Boost',
  modifierBoost: 'Modifier Boost',
  walkSpeed: 'Walk Speed',
  toughness: 'Toughness',
};

// shape: nugget | crystal | gem | shell | sphere | coin | bone | orb | shard | skull | branch
const KG_SCALE = 0.35;
const M = (id, name, tier, price, kg0, colors, shape, stat, desc, extra = {}) => ({
  id,
  name,
  tier,
  price,
  kg: kg0 * KG_SCALE,
  min: (extra.min ?? kg0 * 0.12) * KG_SCALE,
  max: (extra.max ?? kg0 * 40) * KG_SCALE,
  colors,
  shape,
  stat,
  desc,
  ...extra,
});

export const MINERALS = [
  // ---------- Common ----------
  M('pyrite', 'Pyrite', 0, 500, 0.09, ['#c9b037', '#8a7420'], 'nugget', 'capacity', "Fool's gold. Every prospector's first heartbreak."),
  M('silver', 'Silver', 0, 700, 0.07, ['#d5dbe0', '#8b96a0'], 'nugget', 'shakeSpeed', 'A bright, soft metal. Polishes up nicely.'),
  M('copper', 'Copper', 0, 800, 0.08, ['#d07a3c', '#7d3f17'], 'nugget', 'digSpeed', 'Conductive and common. The creek is full of it.'),
  M('gold', 'Gold', 0, 1000, 0.06, ['#ffd23f', '#b8860b'], 'nugget', 'sellBoost', 'The reason anyone picks up a pan.'),
  M('quartz', 'Quartz', 0, 1200, 0.08, ['#f4f7ff', '#b9c4dd'], 'crystal', 'shakeStrength', 'Clear, six-sided crystals.'),
  M('platinum', 'Platinum', 0, 2000, 0.05, ['#eef0f2', '#9aa3ad'], 'nugget', 'luck', 'Heavier than it looks, worth more than gold.'),
  M('seashell', 'Seashell', 0, 2200, 0.05, ['#ffe9d6', '#e6a07a'], 'shell', 'sizeBoost', 'Hold it to your ear. Hear that? Money.'),
  M('obsidian', 'Obsidian', 0, 3000, 0.07, ['#2a2433', '#6b5a85'], 'shard', 'digStrength', 'Volcanic glass with a razor edge.'),
  M('desert_glass', 'Desert Glass', 0, 2800, 0.06, ['#cfe9b4', '#7fae6a'], 'shard', 'shakeSpeed', 'Sand fused by ancient lightning.'),
  M('amethyst', 'Amethyst', 0, 3500, 0.06, ['#a868e8', '#5b2a8f'], 'crystal', 'luck', 'Purple quartz said to bring clear thinking.'),
  M('rime_stone', 'Rime Stone', 0, 3200, 0.07, ['#dff4ff', '#8fc3e6'], 'crystal', 'capacity', 'Always cold to the touch.'),

  // ---------- Uncommon ----------
  M('titanium', 'Titanium', 1, 12000, 0.05, ['#a9b4bf', '#5d6873'], 'nugget', 'digStrength', 'Light, strong, and stubborn.'),
  M('sulfur', 'Sulfur', 1, 11000, 0.06, ['#f3e04a', '#b59b10'], 'crystal', 'digStrength', 'Smells like trouble.'),
  M('coral', 'Coral', 1, 13000, 0.05, ['#ff8a8a', '#c94a5a'], 'branch', 'sizeBoost', 'Washed up from the reef.'),
  M('topaz', 'Topaz', 1, 14000, 0.04, ['#ffb347', '#c26a12'], 'gem', 'luck', 'A warm golden gem.'),
  M('neodymium', 'Neodymium', 1, 15000, 0.04, ['#9ea6b0', '#3c434b'], 'nugget', 'modifierBoost', 'Snaps to your shovel. Magnetic!'),
  M('desert_rose', 'Desert Rose', 1, 15000, 0.06, ['#e8b68a', '#a26b45'], 'crystal', 'sizeBoost', 'Gypsum petals grown in the dunes.'),
  M('smoky_quartz', 'Smoky Quartz', 1, 16000, 0.05, ['#a68c73', '#5c4636'], 'crystal', 'shakeStrength', 'Quartz with a mysterious haze.'),
  M('cobalt', 'Cobalt', 1, 16000, 0.04, ['#3f6fe0', '#1d3a8a'], 'nugget', 'shakeSpeed', 'Deep blue metal from cold places.'),
  M('zircon', 'Zircon', 1, 17000, 0.04, ['#c7f0ff', '#5ab3d6'], 'gem', 'shakeSpeed', 'Older than almost anything on Earth.'),
  M('malachite', 'Malachite', 1, 18000, 0.05, ['#2fbf71', '#0d5c34'], 'sphere', 'capacity', 'Banded green stone.'),
  M('garnet', 'Garnet', 1, 19000, 0.04, ['#a3172b', '#4f0612'], 'gem', 'digSpeed', 'Deep red and dependable.'),
  M('pearl', 'Pearl', 1, 20000, 0.02, ['#fbf7f0', '#d9cbb4'], 'sphere', 'sellBoost', 'A tiny moon from an oyster.'),
  M('sapphire', 'Sapphire', 1, 22000, 0.035, ['#2f6bff', '#0b2a8a'], 'gem', 'luck', 'Royal blue corundum.'),

  // ---------- Rare ----------
  M('ruby', 'Ruby', 2, 30000, 0.035, ['#ff2a4f', '#8a0019'], 'gem', 'luck', 'The king of gems.'),
  M('lapis', 'Lapis Lazuli', 2, 40000, 0.04, ['#2443b8', '#e1c35a'], 'sphere', 'modifierBoost', 'Ultramarine flecked with gold.'),
  M('jade', 'Jade', 2, 40000, 0.04, ['#4fc58a', '#1d6b48'], 'sphere', 'sellBoost', 'Smooth, cool, and priceless to collectors.'),
  M('silver_clamshell', 'Silver Clamshell', 2, 50000, 0.05, ['#e8eef5', '#8ea2b8'], 'shell', 'capacity', 'A clam that swallowed a silver vein.'),
  M('peridot', 'Peridot', 2, 60000, 0.03, ['#b5e61d', '#5f8a00'], 'gem', 'shakeSpeed', 'Lime-green gem born in volcanoes.'),
  M('onyx', 'Onyx', 2, 75000, 0.04, ['#1b1b1f', '#55555f'], 'sphere', 'digStrength', 'Black and banded.'),
  M('meteoric_iron', 'Meteoric Iron', 2, 80000, 0.06, ['#6d6a73', '#2c2a30'], 'nugget', 'digStrength', 'Iron that fell from the sky.'),
  M('sunstone', 'Sunstone', 2, 85000, 0.03, ['#ff9a3c', '#c2410c'], 'gem', 'sellBoost', 'Glitters like a desert sunset.'),
  M('emerald', 'Emerald', 2, 90000, 0.03, ['#18c96b', '#05592c'], 'gem', 'luck', 'Green fire.'),
  M('glacial_quartz', 'Glacial Quartz', 2, 100000, 0.05, ['#bfeaff', '#5fb1e8'], 'crystal', 'shakeStrength', 'Frozen for ten thousand years.'),
  M('azuralite', 'Azuralite', 2, 120000, 0.04, ['#22d3ff', '#0369a1'], 'crystal', 'luck', 'Glows faintly blue in the dark.'),
  M('pyrelith', 'Pyrelith', 2, 150000, 0.05, ['#ff6a2a', '#7a1d00'], 'shard', 'sizeBoost', 'Warm enough to cook an egg on.'),

  // ---------- Epic ----------
  M('iridium', 'Iridium', 3, 150000, 0.03, ['#e3e8ef', '#7f8c9c'], 'nugget', 'digSpeed', 'One of the densest metals there is.'),
  M('ancient_coin', 'Ancient Coin', 3, 180000, 0.02, ['#e9c46a', '#8a6a1f'], 'coin', 'sellBoost', 'Stamped with a forgotten king.'),
  M('moonstone', 'Moonstone', 3, 200000, 0.03, ['#e6f0ff', '#8fb0ff'], 'orb', 'luck', 'Glows with soft blue light.', { glow: true }),
  M('ashvein', 'Ashvein', 3, 222000, 0.04, ['#5b5b60', '#ff7a1a'], 'shard', 'digStrength', 'Ash-gray stone with molten veins.', { glow: true }),
  M('black_pearl', 'Black Pearl', 3, 240000, 0.02, ['#2b2f3a', '#7d6bb0'], 'sphere', 'sizeBoost', 'Rare as a calm sea.'),
  M('aurorite', 'Aurorite', 3, 250000, 0.03, ['#7dffb2', '#b46bff'], 'crystal', 'modifierBoost', 'Shimmers like the northern lights. Used for enchanting.', { glow: true }),
  M('cryolite', 'Cryolite', 3, 260000, 0.04, ['#e8fbff', '#7fd6ff'], 'crystal', 'shakeSpeed', 'Ice that never melts.', { glow: true }),
  M('diamond', 'Diamond', 3, 300000, 0.02, ['#f5fdff', '#a8e4ff'], 'gem', 'luck', 'Forever.', { glow: true }),
  M('luminum', 'Luminum', 3, 350000, 0.03, ['#fffbd1', '#ffd84a'], 'orb', 'shakeStrength', 'A metal that shines with its own light.', { glow: true }),

  // ---------- Legendary ----------
  M('aetherite', 'Aetherite', 4, 1000000, 0.025, ['#d9c2ff', '#7d5cff'], 'crystal', 'modifierBoost', 'It hums. Used for powerful enchantments.', { glow: true }),
  M('prismatic_pearl', 'Prismatic Pearl', 4, 1500000, 0.02, ['#ffffff', '#ff9de6'], 'sphere', 'sizeBoost', 'Every color at once.', { glow: true }),
  M('fire_opal', 'Fire Opal', 4, 1600000, 0.025, ['#ff5a1f', '#ffd166'], 'gem', 'sellBoost', 'Flickers like a captured flame.', { glow: true }),
  M('dragon_bone', 'Dragon Bone', 4, 1800000, 0.12, ['#efe6cf', '#9c8b66'], 'bone', 'digStrength', 'Too big to be from anything alive today.'),
  M('starshine', 'Starshine', 4, 2000000, 0.02, ['#fffbe0', '#ffe066'], 'orb', 'luck', 'Fell with the meteors. Still twinkles.', { glow: true }),
  M('scarab', "Pharaoh's Scarab", 4, 2200000, 0.03, ['#1fc9a8', '#d4a017'], 'coin', 'sellBoost', 'A jeweled beetle from the ruins.', { glow: true }),
  M('pink_diamond', 'Pink Diamond', 4, 2500000, 0.015, ['#ffc0e0', '#ff5fae'], 'gem', 'luck', 'The rarest blush in the world.', { glow: true }),
  M('glacial_heart', 'Glacial Heart', 4, 2800000, 0.04, ['#c9f3ff', '#3ba7ff'], 'orb', 'capacity', 'The frozen core of the peak.', { glow: true }),

  // ---------- Mythic ----------
  M('painite', 'Painite', 5, 6000000, 0.02, ['#c0392b', '#ff9472'], 'gem', 'luck', 'Once the rarest mineral known.', { glow: true }),
  M('celestine', 'Celestine Shard', 5, 8000000, 0.02, ['#a8d8ff', '#ffffff'], 'shard', 'sellBoost', 'A sliver of a falling star.', { glow: true }),
  M('flarebloom', 'Flarebloom', 5, 9000000, 0.02, ['#ffdd00', '#ff3d00'], 'crystal', 'shakeSpeed', 'Blooms where solar fire touches stone.', { glow: true }),
  M('aurora_crystal', 'Aurora Crystal', 5, 10000000, 0.02, ['#5cffb0', '#c06bff'], 'crystal', 'modifierBoost', 'The northern lights, solid.', { glow: true }),
  M('inferlume', 'Inferlume', 5, 12000000, 0.02, ['#ff7b00', '#ffef5c'], 'orb', 'digStrength', 'A heart of living flame.', { glow: true }),
  M('volcanic_core', 'Volcanic Core', 5, 15000000, 0.03, ['#ff3c00', '#2b0b00'], 'orb', 'capacity', 'Still beating.', { glow: true }),
  M('vortessence', 'Vortessence', 5, 20000000, 0.02, ['#7a2cff', '#00e5ff'], 'orb', 'modifierBoost', 'Swirls without wind.', { glow: true }),
  M('prismara', 'Prismara', 5, 25000000, 0.02, ['#ff7ad9', '#7af0ff'], 'crystal', 'luck', 'Splits light into colors no one has named.', { glow: true }),

  // ---------- Exotic ----------
  M('dinosaur_skull', 'Dinosaur Skull', 6, 50000000, 0.6, ['#e9dcc0', '#8b7a5a'], 'skull', 'sizeBoost', 'A T-Rex? Here? Unbelievable.', { min: 0.2, max: 6 }),
  M('krakens_eye', "Kraken's Eye", 6, 66666666, 0.05, ['#00ffd5', '#003d4f'], 'orb', 'sellBoost', 'It blinked. You swear it blinked.', { glow: true }),
  M('cryogenic_artifact', 'Cryogenic Artifact', 6, 100000000, 0.08, ['#bff7ff', '#2ec4ff'], 'orb', 'luck', 'Something is frozen inside...', { glow: true }),
  M('voidstone', 'Voidstone', 6, 111111111, 0.03, ['#14001f', '#b066ff'], 'orb', 'modifierBoost', 'A hole in the world you can hold.', { glow: true }),
];

export const MINERAL_BY_ID = Object.fromEntries(MINERALS.map((m) => [m.id, m]));

// ---------- Modifiers ----------
// chance is base 1-in-N per mineral. mult multiplies value. stat is museum stat.
export const MODIFIERS = [
  { id: 'shiny', name: 'Shiny', mult: 1.5, chance: 22, color: '#fff6a8', stat: 'shakeStrength' },
  { id: 'pure', name: 'Pure', mult: 1.6, chance: 30, color: '#e8fbff', stat: 'digSpeed' },
  { id: 'glowing', name: 'Glowing', mult: 2, chance: 50, color: '#a8ffb0', stat: 'shakeSpeed' },
  { id: 'frosted', name: 'Frosted', mult: 2.2, chance: 400, color: '#bfeaff', stat: 'capacity' },
  { id: 'scorching', name: 'Scorching', mult: 2.5, chance: 90, color: '#ff8a3c', stat: 'digStrength' },
  { id: 'iridescent', name: 'Iridescent', mult: 3, chance: 160, color: '#ff9cf3', stat: 'luck' },
  { id: 'electrified', name: 'Electrified', mult: 3.5, chance: 260, color: '#7ad7ff', stat: 'digSpeed' },
  { id: 'irradiated', name: 'Irradiated', mult: 5, chance: 450, color: '#9dff3c', stat: 'modifierBoost' },
  { id: 'voidtorn', name: 'Voidtorn', mult: 10, chance: 2500, color: '#c77dff', stat: 'luck' },
];
export const MODIFIER_BY_ID = Object.fromEntries(MODIFIERS.map((m) => [m.id, m]));

// ---------- Geodes ----------
export const GEODES = {
  creek_geode: { id: 'creek_geode', name: 'Creek Geode', site: 'rubble_sands', color: '#9c8f7a', rolls: [3, 5], luck: 3, price: 2500 },
  river_geode: { id: 'river_geode', name: 'River Geode', site: 'fortune_river', color: '#7d8a8f', rolls: [3, 6], luck: 3, price: 25000 },
  coastal_geode: { id: 'coastal_geode', name: 'Coastal Geode', site: 'sunset_beach', color: '#d8c3a5', rolls: [3, 6], luck: 3, price: 40000 },
  desert_geode: { id: 'desert_geode', name: 'Desert Geode', site: 'sunscorched_dunes', color: '#d9a066', rolls: [4, 6], luck: 3.5, price: 150000 },
  crystal_geode: { id: 'crystal_geode', name: 'Crystal Geode', site: 'crystal_caverns', color: '#8f6bd9', rolls: [4, 7], luck: 3.5, price: 250000 },
  frost_geode: { id: 'frost_geode', name: 'Frost Geode', site: 'frostbite_falls', color: '#a8d8f0', rolls: [4, 7], luck: 4, price: 600000 },
  magma_geode: { id: 'magma_geode', name: 'Magma Geode', site: 'magma_furnace', color: '#6b2a1a', rolls: [5, 8], luck: 4, price: 1500000 },
};
