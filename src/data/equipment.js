// Pans, shovels, enchants, rings, potions, totems, sluices.
// shop: which town sells it. Shake speed / dig speed are multipliers (1 = 100%).

export const PANS = [
  { id: 'rusty_pan', name: 'Rusty Pan', price: 0, shop: null, luck: 1, capacity: 5, shakeStrength: 1, shakeSpeed: 1, color: '#8a5a3a', rim: '#5c3a22', desc: 'Dented, rusty and free.' },
  { id: 'plastic_pan', name: 'Plastic Pan', price: 500, shop: 'rubble', luck: 1.25, capacity: 10, shakeStrength: 1, shakeSpeed: 1, color: '#3aa0ff', rim: '#1e6fd0', desc: 'Light and cheap. Twice the room.' },
  { id: 'metal_pan', name: 'Metal Pan', price: 12000, shop: 'rubble', luck: 2, capacity: 20, shakeStrength: 1.5, shakeSpeed: 1, color: '#9aa4ae', rim: '#626b75', desc: 'A real prospector’s pan.' },
  { id: 'silver_pan', name: 'Silver Pan', price: 55000, shop: 'rubble', luck: 4, capacity: 30, shakeStrength: 1.5, shakeSpeed: 1.1, color: '#dfe6ee', rim: '#9fb0c2', desc: 'Polished silver. Ores seem to like it.' },
  { id: 'golden_pan', name: 'Golden Pan', price: 300000, shop: 'fortune', luck: 10, capacity: 35, shakeStrength: 2, shakeSpeed: 1.1, color: '#ffcc33', rim: '#c9971a', desc: 'Gold attracts gold.' },
  { id: 'magnetic_pan', name: 'Magnetic Pan', price: 900000, shop: 'fortune', luck: 15, capacity: 50, shakeStrength: 2, shakeSpeed: 1.2, sizeBoost: 0.25, color: '#d93a3a', rim: '#9aa4ae', passive: '+25% Size Boost', desc: 'Pulls heavier nuggets out of the silt.' },
  { id: 'meteoric_pan', name: 'Meteoric Pan', price: 2200000, shop: 'fortune', luck: 22, capacity: 70, shakeStrength: 2.5, shakeSpeed: 1.2, shardMult: 2, color: '#4b4652', rim: '#ff8a3c', passive: '2x Meteor Shard chance', desc: 'Forged from a fallen star.' },
  { id: 'diamond_pan', name: 'Diamond Pan', price: 6000000, shop: 'frozen', luck: 35, capacity: 100, shakeStrength: 3, shakeSpeed: 1.3, color: '#bff0ff', rim: '#6fd3ff', desc: 'Encrusted with tiny diamonds.' },
  { id: 'aurora_pan', name: 'Aurora Pan', price: 18000000, shop: 'frozen', luck: 50, capacity: 130, shakeStrength: 3.5, shakeSpeed: 1.3, modifierBoost: 0.25, color: '#5cffb0', rim: '#b46bff', passive: '+25% Modifier Boost', desc: 'Shimmers green and violet.' },
  { id: 'worldshaker', name: 'Worldshaker', price: 55000000, shop: 'caldera', luck: 70, capacity: 150, shakeStrength: 6, shakeSpeed: 1.4, color: '#5a4636', rim: '#ffb84a', passive: 'Huge Shake Strength', desc: 'Each shake rattles the riverbed.' },
  { id: 'dragonflame_pan', name: 'Dragonflame Pan', price: 140000000, shop: 'caldera', luck: 140, capacity: 220, shakeStrength: 6, shakeSpeed: 1.5, scorchMult: 3, color: '#ff4a1c', rim: '#2b0b00', passive: '3x Scorching chance', desc: 'Still warm from the dragon’s breath.' },
  { id: 'fossilized_pan', name: 'Fossilized Pan', price: 400000000, shop: 'ruins', luck: 200, capacity: 300, shakeStrength: 7, shakeSpeed: 1.6, sizeBoost: 0.5, color: '#d8c8a0', rim: '#7a6a48', passive: '+50% Size Boost', desc: 'Older than the island itself.' },
];

export const SHOVELS = [
  { id: 'rusty_shovel', name: 'Rusty Shovel', price: 0, shop: null, digStrength: 1, digSpeed: 0.8, toughness: 1, color: '#8a5a3a', desc: 'Bent, but it digs.' },
  { id: 'iron_shovel', name: 'Iron Shovel', price: 2000, shop: 'rubble', digStrength: 2, digSpeed: 0.85, toughness: 1, color: '#7d858d', desc: 'Twice the scoop.' },
  { id: 'steel_shovel', name: 'Steel Shovel', price: 20000, shop: 'rubble', digStrength: 3, digSpeed: 0.9, toughness: 2, color: '#a3adb7', desc: 'Cuts through the Deposits gravel.' },
  { id: 'silver_shovel', name: 'Silver Shovel', price: 75000, shop: 'rubble', digStrength: 5, digSpeed: 0.95, toughness: 2, color: '#dfe6ee', desc: 'Shiny and sharp.' },
  { id: 'reinforced_shovel', name: 'Reinforced Shovel', price: 200000, shop: 'fortune', digStrength: 8, digSpeed: 1, toughness: 3, color: '#556070', desc: 'Riveted for river clay and beach sand.' },
  { id: 'golden_shovel', name: 'Golden Shovel', price: 500000, shop: 'fortune', digStrength: 12, digSpeed: 1, toughness: 3, color: '#ffcc33', desc: 'Flashy AND functional.' },
  { id: 'meteoric_shovel', name: 'Meteoric Shovel', price: 1500000, shop: 'fortune', digStrength: 18, digSpeed: 1.05, toughness: 4, color: '#4b4652', desc: 'Sky-iron edge for the Delta and Windswept Beach.' },
  { id: 'diamond_shovel', name: 'Diamond Shovel', price: 4000000, shop: 'fortune', digStrength: 25, digSpeed: 1.1, toughness: 5, color: '#bff0ff', desc: 'Bites into desert crust and cavern floors.' },
  { id: 'glacial_shovel', name: 'Glacial Shovel', price: 12000000, shop: 'frozen', digStrength: 35, digSpeed: 1.1, toughness: 6, color: '#8fd8ff', desc: 'Breaks permafrost like butter.' },
  { id: 'galactic_shovel', name: 'Galactic Shovel', price: 35000000, shop: 'frozen', digStrength: 50, digSpeed: 1.2, toughness: 7, color: '#3b2a7a', desc: 'Stars swirl inside the blade.' },
  { id: 'dragon_shovel', name: 'Dragon Shovel', price: 90000000, shop: 'caldera', digStrength: 80, digSpeed: 1.2, toughness: 7, color: '#ff4a1c', desc: 'A dragon’s fang on a stick.' },
  { id: 'abyssal_shovel', name: 'Abyssal Shovel', price: 220000000, shop: 'caldera', digStrength: 125, digSpeed: 1.25, toughness: 8, color: '#1a0b2e', desc: 'Digs into the Infernal Heart itself.' },
];

export const PAN_BY_ID = Object.fromEntries(PANS.map((p) => [p.id, p]));
export const SHOVEL_BY_ID = Object.fromEntries(SHOVELS.map((s) => [s.id, s]));

// Enchants: rolled at the Mysterious Altar using Aurorite (pan pool A), Aetherite (pan pool B)
// weight = relative roll weight. stats are additive (multipliers given as fractions).
export const PAN_ENCHANTS = [
  { id: 'lucky', name: 'Lucky', weight: 10, pool: 'aurorite', stats: { luck: 5 }, color: '#5fe36a' },
  { id: 'strong', name: 'Strong', weight: 10, pool: 'aurorite', stats: { shakeStrength: 1 }, color: '#d7dde6' },
  { id: 'swift', name: 'Swift', weight: 10, pool: 'aurorite', stats: { shakeSpeed: 0.15 }, color: '#7ad7ff' },
  { id: 'roomy', name: 'Roomy', weight: 9, pool: 'aurorite', stats: { capacity: 10 }, color: '#d7dde6' },
  { id: 'forceful', name: 'Forceful', weight: 7, pool: 'aurorite', stats: { shakeStrength: 2, shakeSpeed: 0.05 }, color: '#4aa8ff' },
  { id: 'greedy', name: 'Greedy', weight: 5, pool: 'aurorite', stats: { sellBoost: 0.2 }, color: '#ffd23f' },
  { id: 'gigantic', name: 'Gigantic', weight: 4, pool: 'aurorite', stats: { capacity: 40, sizeBoost: 0.1 }, color: '#b76bff' },
  { id: 'unstable', name: 'Unstable', weight: 3, pool: 'aurorite', stats: { modifierBoost: 0.25 }, color: '#9dff3c' },
  { id: 'destructive', name: 'Destructive', weight: 3, pool: 'aurorite', stats: { shakeStrength: 4 }, color: '#ff8a3c' },
  // Aetherite pool (stronger)
  { id: 'blessed', name: 'Blessed', weight: 10, pool: 'aetherite', stats: { luck: 12, capacity: 15 }, color: '#ffe48a' },
  { id: 'titanic', name: 'Titanic', weight: 6, pool: 'aetherite', stats: { sizeBoost: 0.2, capacity: 30 }, color: '#ffb22e' },
  { id: 'midas', name: 'Midas', weight: 5, pool: 'aetherite', stats: { sellBoost: 0.5 }, color: '#ffcc33' },
  { id: 'infernal', name: 'Infernal', weight: 4, pool: 'aetherite', stats: { luck: 50, shakeSpeed: -0.1 }, color: '#ff4f2b' },
  { id: 'divine', name: 'Divine', weight: 3, pool: 'aetherite', stats: { luck: 20, capacity: 40 }, color: '#ffffff' },
  { id: 'prismatic', name: 'Prismatic', weight: 1.5, pool: 'aetherite', stats: { luck: 10, capacity: 20, shakeStrength: 2, sizeBoost: 0.1, modifierBoost: 0.1, shakeSpeed: 0.1 }, color: '#ff7ad9', rainbow: true },
];

export const SHOVEL_ENCHANTS = [
  { id: 'sturdy', name: 'Sturdy', weight: 10, pool: 'aurorite', stats: { digStrength: 2 }, color: '#d7dde6' },
  { id: 'nimble', name: 'Nimble', weight: 10, pool: 'aurorite', stats: { digSpeed: 0.15 }, color: '#7ad7ff' },
  { id: 'prospectors', name: "Prospector's", weight: 6, pool: 'aurorite', stats: { luck: 3 }, color: '#5fe36a' },
  { id: 'well_balanced', name: 'Well Balanced', weight: 4, pool: 'aurorite', stats: { perfectZone: 2 }, color: '#4aa8ff', desc: 'Bigger perfect-dig zone' },
  { id: 'seismic', name: 'Seismic', weight: 6, pool: 'aetherite', stats: { digStrength: 8, digSpeed: 0.1 }, color: '#ffb22e' },
  { id: 'excavator', name: 'Excavator', weight: 4, pool: 'aetherite', stats: { digStrength: 15 }, color: '#ff8a3c' },
  { id: 'fortunate', name: 'Fortunate', weight: 3, pool: 'aetherite', stats: { luck: 15, modifierBoost: 0.1 }, color: '#ffcc33' },
  { id: 'starforged', name: 'Starforged', weight: 1.5, pool: 'aetherite', stats: { digStrength: 10, digSpeed: 0.2, luck: 10, perfectZone: 1.5 }, color: '#ff7ad9', rainbow: true },
];

export const ENCHANT_BY_ID = Object.fromEntries([...PAN_ENCHANTS, ...SHOVEL_ENCHANTS].map((e) => [e.id, e]));

// Rings crafted at an anvil. ingredients: [mineralId, count]
export const RINGS = [
  { id: 'gold_ring', name: 'Gold Ring', cost: 2000, ingredients: [['gold', 5]], stats: { sellBoost: 0.08 }, color: '#ffd23f', gem: '#ffd23f' },
  { id: 'copper_band', name: 'Copper Band', cost: 1500, ingredients: [['copper', 6], ['pyrite', 4]], stats: { digSpeed: 0.06 }, color: '#d07a3c', gem: '#d07a3c' },
  { id: 'amethyst_ring', name: 'Amethyst Ring', cost: 8000, ingredients: [['silver', 4], ['amethyst', 3]], stats: { luck: 1.5 }, color: '#c0c6cc', gem: '#a868e8' },
  { id: 'shell_ring', name: 'Shell Ring', cost: 20000, ingredients: [['seashell', 6], ['pearl', 1]], stats: { sizeBoost: 0.08 }, color: '#ffe9d6', gem: '#fbf7f0' },
  { id: 'ruby_ring', name: 'Ruby Ring', cost: 45000, ingredients: [['platinum', 5], ['ruby', 1]], stats: { luck: 4 }, color: '#e5e4e2', gem: '#ff2a4f' },
  { id: 'titan_ring', name: 'Titan Ring', cost: 60000, ingredients: [['titanium', 5], ['neodymium', 2]], stats: { digStrength: 2, shakeStrength: 1 }, color: '#a9b4bf', gem: '#3c434b' },
  { id: 'sapphire_ring', name: 'Sapphire Ring', cost: 90000, ingredients: [['silver', 8], ['sapphire', 2]], stats: { shakeSpeed: 0.1, capacity: 5 }, color: '#d5dbe0', gem: '#2f6bff' },
  { id: 'jade_ring', name: 'Jade Ring', cost: 250000, ingredients: [['gold', 10], ['jade', 2]], stats: { sellBoost: 0.15 }, color: '#ffd23f', gem: '#4fc58a' },
  { id: 'emerald_ring', name: 'Emerald Ring', cost: 600000, ingredients: [['platinum', 10], ['emerald', 2], ['malachite', 3]], stats: { luck: 8, modifierBoost: 0.05 }, color: '#eef0f2', gem: '#18c96b' },
  { id: 'azure_ring', name: 'Azure Ring', cost: 1500000, ingredients: [['azuralite', 3], ['zircon', 4]], stats: { luck: 10, capacity: 10 }, color: '#c7f0ff', gem: '#22d3ff' },
  { id: 'moon_ring', name: 'Moon Ring', cost: 500000, ingredients: [['moonstone', 1], ['iridium', 1]], stats: { luck: 12, shakeSpeed: 0.05 }, color: '#e3e8ef', gem: '#e6f0ff' },
  { id: 'frost_ring', name: 'Frostbound Ring', cost: 4000000, ingredients: [['glacial_quartz', 4], ['cryolite', 1], ['cobalt', 5]], stats: { shakeStrength: 3, coldResist: 1 }, color: '#bfeaff', gem: '#7fd6ff' },
  { id: 'ember_ring', name: 'Ember Ring', cost: 6000000, ingredients: [['pyrelith', 4], ['ashvein', 1], ['sulfur', 6]], stats: { digStrength: 10, heatResist: 1 }, color: '#5b5b60', gem: '#ff7a1a' },
  { id: 'diamond_ring', name: 'Diamond Ring', cost: 12000000, ingredients: [['platinum', 20], ['diamond', 2]], stats: { luck: 25, sizeBoost: 0.05 }, color: '#f5fdff', gem: '#a8e4ff' },
  { id: 'opal_ring', name: 'Fire Opal Ring', cost: 40000000, ingredients: [['fire_opal', 1], ['gold', 25], ['obsidian', 10]], stats: { sellBoost: 0.35, digStrength: 10 }, color: '#ffd23f', gem: '#ff5a1f' },
  { id: 'starshine_ring', name: 'Starshine Ring', cost: 60000000, ingredients: [['starshine', 1], ['meteoric_iron', 6]], stats: { luck: 45, modifierBoost: 0.1 }, color: '#6d6a73', gem: '#fffbe0' },
  { id: 'prismatic_ring', name: 'Prismatic Star', cost: 250000000, ingredients: [['prismara', 1], ['starshine', 1], ['pink_diamond', 1]], stats: { luck: 90, capacity: 40, sizeBoost: 0.15, modifierBoost: 0.15 }, color: '#ffffff', gem: '#ff7ad9', rainbow: true },
];
export const RING_BY_ID = Object.fromEntries(RINGS.map((r) => [r.id, r]));
export const RING_SLOT_COSTS = [0, 0, 150, 400, 900, 2000]; // shards; first 2 free, max 6

// Potions & totems. dur in seconds. Bought with money ($) or shards.
export const CONSUMABLES = [
  { id: 'basic_luck', name: 'Basic Luck Potion', kind: 'potion', cur: '$', price: 4000, dur: 600, effect: { luckMult: 1.25 }, color: '#5fe36a', desc: 'x1.25 Luck for 10 min', shop: 'rubble' },
  { id: 'speed_potion', name: 'Swiftfoot Tonic', kind: 'potion', cur: '$', price: 2500, dur: 600, effect: { walkMult: 1.3 }, color: '#7ad7ff', desc: '+30% walk speed for 10 min', shop: 'rubble' },
  { id: 'greater_luck', name: 'Greater Luck Potion', kind: 'potion', cur: 'shards', price: 30, dur: 1200, effect: { luckMult: 1.6 }, color: '#2fbf71', desc: 'x1.6 Luck for 20 min', shop: 'shards' },
  { id: 'greater_capacity', name: 'Greater Capacity Potion', kind: 'potion', cur: 'shards', price: 20, dur: 1200, effect: { capacityMult: 1.5 }, color: '#4aa8ff', desc: 'x1.5 Capacity for 20 min', shop: 'shards' },
  { id: 'merchants_potion', name: "Merchant's Potion", kind: 'potion', cur: 'shards', price: 200, dur: 1200, effect: { sellMult: 2 }, color: '#ffd23f', desc: 'x2 Sell value for 20 min', shop: 'shards' },
  { id: 'warmth_potion', name: 'Warmth Brew', kind: 'potion', cur: '$', price: 250000, dur: 900, effect: { coldResist: 1 }, color: '#ff9a3c', desc: 'Immune to Freezing for 15 min', shop: 'frozen' },
  { id: 'fireproof_potion', name: 'Fireproof Salve', kind: 'potion', cur: '$', price: 2000000, dur: 900, effect: { heatResist: 1 }, color: '#ff4f2b', desc: 'Immune to Burning for 15 min', shop: 'caldera' },
  { id: 'luck_totem', name: 'Luck Totem', kind: 'totem', cur: 'shards', price: 300, dur: 1800, effect: { luckMult: 2 }, radius: 28, color: '#5fe36a', desc: 'Place it: x2 Luck within 28m for 30 min', shop: 'shards' },
  { id: 'strength_totem', name: 'Strength Totem', kind: 'totem', cur: 'shards', price: 180, dur: 1800, effect: { digMult: 1.5, shakeMult: 1.5 }, radius: 28, color: '#ff8a3c', desc: 'Place it: x1.5 Dig & Shake Strength within 28m for 30 min', shop: 'shards' },
  { id: 'meteor_totem', name: 'Meteor Totem', kind: 'totem', cur: 'shards', price: 600, dur: 900, effect: { shardMult: 3, modMult: 1.5 }, radius: 28, color: '#b76bff', desc: 'Place it: x3 shards & x1.5 modifiers for 15 min', shop: 'shards' },
];
export const CONSUMABLE_BY_ID = Object.fromEntries(CONSUMABLES.map((c) => [c.id, c]));

// Sluices: placed in water, passively roll minerals from the nearest dig site.
export const SLUICES = [
  { id: 'wood_sluice', name: 'Wooden Sluice', price: 5000, interval: 40, capacity: 25, luck: 1, color: '#8a5a3a', desc: 'Rolls a mineral every 40s. Holds 25.' },
  { id: 'iron_sluice', name: 'Iron Sluice', price: 150000, interval: 30, capacity: 50, luck: 3, color: '#7d858d', desc: 'Every 30s, x3 luck. Holds 50.' },
  { id: 'gold_sluice', name: 'Golden Sluice', price: 1500000, interval: 22, capacity: 80, luck: 8, color: '#ffcc33', desc: 'Every 22s, x8 luck. Holds 80.' },
  { id: 'obsidian_sluice', name: 'Obsidian Sluice', price: 5000000, interval: 15, capacity: 120, luck: 15, color: '#2a2433', desc: 'Every 15s, x15 luck. Holds 120.' },
];
export const SLUICE_BY_ID = Object.fromEntries(SLUICES.map((s) => [s.id, s]));
export const MAX_SLUICES = 3;
