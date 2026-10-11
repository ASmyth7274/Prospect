// Towns, buildings, decorations and interactable objects placed in the world.
// yaw follows three.js rotation.y; a building's door/front faces local +Z.
// Facing west (toward -X) => yaw = -PI/2. Facing east => PI/2. Facing north (-Z) => PI.
const W = -Math.PI / 2;
const E = Math.PI / 2;
const N = Math.PI;
const S = 0;

export const TOWNS = [
  { id: 'rubble', name: 'Rubble Creek', x: 92, z: 428, travel: [82, 432] },
  { id: 'deposits', name: 'Deposits Camp', x: 96, z: 150, travel: [92, 138] },
  { id: 'fortune', name: 'Fortune Town', x: -168, z: 62, travel: [-190, 60] },
  { id: 'delta', name: 'Delta Landing', x: -360, z: 365, travel: [-356, 352] },
  { id: 'sunset', name: 'Sunset Beach', x: 250, z: 512, travel: [256, 506] },
  { id: 'lighthouse', name: 'Lighthouse Point', x: 606, z: -80, travel: [596, -66] },
  { id: 'oasis', name: 'Oasis Camp', x: -432, z: -228, travel: [-428, -214] },
  { id: 'ruins', name: 'Ancient Ruins', x: -560, z: -30, travel: [-552, -22] },
  { id: 'caverns', name: 'Cavern Entrance', x: -70, z: -128, travel: [-66, -120] },
  { id: 'frostbite', name: 'Frostbite Camp', x: 56, z: -388, travel: [58, -380] },
  { id: 'caldera', name: 'Ember Outpost', x: 566, z: -292, travel: [570, -282] },
];

// type, x, z, yaw, opts
export const STRUCTURES = [
  // ---------------- Rubble Creek ----------------
  { type: 'shop', x: 104, z: 398, yaw: W, w: 12, d: 9, h: 5, wall: '#c98d55', roof: '#a33b2a', sign: ["Gus's Gear", 'Pans & Shovels'], awning: '#e8c547' },
  { type: 'shop', x: 104, z: 456, yaw: W, w: 12, d: 9, h: 5, wall: '#b8c4a0', roof: '#3a6ea8', sign: ["Marty's Exchange", 'We buy minerals!'], awning: '#3fae5a' },
  { type: 'shop', x: 128, z: 428, yaw: W, w: 10, d: 8, h: 4.5, wall: '#d8c09a', roof: '#6d4aa8', sign: ['Rubble Supplies', 'Potions • Sluices'], awning: '#a868e8' },
  { type: 'statue', x: 78, z: 426, yaw: W },
  { type: 'house', x: 132, z: 392, yaw: W, w: 8, d: 7, h: 4, wall: '#e0d2b0', roof: '#7a3b2a' },
  { type: 'house', x: 138, z: 466, yaw: W, w: 9, d: 7, h: 4, wall: '#c4b49a', roof: '#3d5e3a' },
  { type: 'house', x: 120, z: 490, yaw: N, w: 8, d: 8, h: 4.5, wall: '#d9a982', roof: '#40506e' },
  { type: 'campfire', x: 88, z: 446 },
  { type: 'crate', x: 86, z: 457 },
  { type: 'crate', x: 85, z: 459, s: 0.8 },
  { type: 'barrel', x: 93, z: 409 },
  { type: 'barrel', x: 94, z: 411 },
  { type: 'lamp', x: 70, z: 414 },
  { type: 'lamp', x: 70, z: 440 },
  { type: 'lamp', x: 112, z: 427 },
  { type: 'bench', x: 82, z: 412, yaw: S },
  { type: 'fence', x: 60, z: 380, x2: 60, z2: 476 },
  { type: 'travel', x: 82, z: 436, town: 'rubble' },
  { type: 'board', x: 72, z: 452, yaw: W, sign: ['Notice Board', 'Bounties'] },
  { type: 'signpost', x: 52, z: 402, yaw: W, sign: ['Rubble Creek Sands', 'Toughness 1'] },

  // ---------------- Deposits Camp ----------------
  { type: 'tent', x: 100, z: 140, yaw: W, color: '#c25b3a' },
  { type: 'tent', x: 104, z: 160, yaw: W, color: '#4a7ab8' },
  { type: 'campfire', x: 92, z: 150 },
  { type: 'mine', x: 128, z: 128, yaw: W },
  { type: 'generator', x: 112, z: 176, yaw: W },
  { type: 'cart', x: 116, z: 136, yaw: 0.4 },
  { type: 'crate', x: 106, z: 172 },
  { type: 'signpost', x: 76, z: 100, yaw: W, sign: ['Rubble Creek Deposits', 'Toughness 2'] },
  { type: 'travel', x: 92, z: 132, town: 'deposits' },

  // ---------------- Fortune Town ----------------
  { type: 'museum', x: -160, z: 62, yaw: W },
  { type: 'shop', x: -176, z: 112, yaw: W, w: 13, d: 10, h: 5.5, wall: '#a0b4c8', roof: '#2d4a6e', sign: ['Fortune Outfitters', 'Pro Gear'], awning: '#4aa8ff' },
  { type: 'shop', x: -178, z: 14, yaw: W, w: 12, d: 9, h: 5, wall: '#c9b98a', roof: '#7a5a1a', sign: ['Fortune Exchange', 'Top prices!'], awning: '#ffd23f' },
  { type: 'forge', x: -140, z: 8, yaw: W, sign: ["Bram's Forge", 'Ring Crafting'] },
  { type: 'startent', x: -140, z: 120, yaw: W, sign: ["Stella's Stargazing", 'Shard Shop'] },
  { type: 'board', x: -196, z: 44, yaw: W, sign: ['Notice Board', 'Bounties'] },
  { type: 'house', x: -128, z: 40, yaw: W, w: 8, d: 8, h: 4.5, wall: '#e3d7c0', roof: '#8a3b2a' },
  { type: 'house', x: -126, z: 88, yaw: W, w: 8, d: 7, h: 4.5, wall: '#cbb79a', roof: '#40506e' },
  { type: 'house', x: -150, z: 148, yaw: N, w: 9, d: 8, h: 4.5, wall: '#d9c2a0', roof: '#3d5e3a' },
  { type: 'well', x: -186, z: 62 },
  { type: 'lamp', x: -196, z: 80 },
  { type: 'lamp', x: -196, z: 30 },
  { type: 'lamp', x: -170, z: 132 },
  { type: 'travel', x: -192, z: 70, town: 'fortune' },
  { type: 'signpost', x: -206, z: 90, yaw: W, sign: ['Fortune River', 'Toughness 3'] },

  // ---------------- Delta Landing ----------------
  { type: 'stilthouse', x: -356, z: 372, yaw: W, sign: ["Sal's Sluices", 'Passive profits'] },
  { type: 'stall', x: -340, z: 352, yaw: W, color: '#3fae5a', sign: ['Delta Trading', 'Sell here'] },
  { type: 'boat', x: -372, z: 392, yaw: 0.6 },
  { type: 'travel', x: -350, z: 345, town: 'delta' },
  { type: 'signpost', x: -405, z: 368, yaw: E, sign: ['Fortune River Delta', 'Toughness 4'] },

  // ---------------- Sunset Beach ----------------
  { type: 'beachshack', x: 252, z: 500, yaw: S, sign: ['Shelly’s Shack', 'Buy • Sell'] },
  { type: 'umbrella', x: 236, z: 530, color: '#ff5a5a' },
  { type: 'umbrella', x: 278, z: 524, color: '#4aa8ff' },
  { type: 'umbrella', x: 300, z: 512, color: '#ffd23f' },
  { type: 'travel', x: 262, z: 498, town: 'sunset' },
  { type: 'signpost', x: 210, z: 532, yaw: S, sign: ['Sunset Beach', 'Toughness 3'] },

  // ---------------- Lighthouse Point / Windswept ----------------
  { type: 'lighthouse', x: 612, z: -84 },
  { type: 'house', x: 594, z: -70, yaw: S, w: 7, d: 6, h: 3.8, wall: '#e8eef5', roof: '#c23a3a' },
  { type: 'travel', x: 598, z: -60, town: 'lighthouse' },
  { type: 'signpost', x: 588, z: 8, yaw: E, sign: ['Windswept Beach', 'Toughness 4'] },
  { type: 'bridgegate', x: 603, z: -118 },

  // ---------------- Oasis Camp / Desert ----------------
  { type: 'tent', x: -428, z: -222, yaw: E, color: '#e9c46a', big: true },
  { type: 'tent', x: -440, z: -205, yaw: E, color: '#d06a3a' },
  { type: 'stall', x: -418, z: -238, yaw: E, color: '#e76f51', sign: ['Oasis Bazaar', 'Buy • Sell'] },
  { type: 'campfire', x: -432, z: -236 },
  { type: 'travel', x: -424, z: -210, town: 'oasis' },
  { type: 'signpost', x: -445, z: -268, yaw: E, sign: ['Azuralite Oasis', 'Toughness 5'] },
  { type: 'signpost', x: -372, z: -150, yaw: E, sign: ['Sunscorched Dunes', 'Toughness 5'] },

  // ---------------- Ancient Ruins ----------------
  { type: 'ruins', x: -585, z: -40 },
  { type: 'tent', x: -556, z: -26, yaw: W, color: '#8a9a5b' },
  { type: 'travel', x: -550, z: -18, town: 'ruins' },
  { type: 'signpost', x: -556, z: -62, yaw: W, sign: ['Ancient Ruins', 'Toughness 6'] },

  // ---------------- Crystal Caverns ----------------
  { type: 'dome' },
  { type: 'rockfall', x: -75, z: -186 },
  { type: 'cavemouth', x: -71, z: -150, yaw: S },
  { type: 'altar', x: -66, z: -228 },
  { type: 'tent', x: -58, z: -118, yaw: W, color: '#3a8a9a' },
  { type: 'travel', x: -64, z: -112, town: 'caverns' },
  { type: 'signpost', x: -82, z: -122, yaw: S, sign: ['Crystal Caverns', 'Toughness 5'] },

  // ---------------- Frostbite Camp ----------------
  { type: 'cabin', x: 50, z: -386, yaw: E, sign: ['Frostbite Outfitters', 'Elite Gear'] },
  { type: 'campfire', x: 61, z: -395 },
  { type: 'tent', x: 46, z: -399, yaw: E, color: '#e9eef5' },
  { type: 'travel', x: 58, z: -377, town: 'frostbite' },
  { type: 'signpost', x: 50, z: -412, yaw: E, sign: ['Frostbite Waterfall', 'Toughness 6'] },
  { type: 'signpost', x: -20, z: -528, yaw: S, sign: ['Frozen Peak', 'Toughness 7'] },
  { type: 'flag', x: 2, z: -552 },

  // ---------------- Caldera Island ----------------
  { type: 'cabin', x: 560, z: -282, yaw: E, sign: ['Ember Outfitters', 'Legendary Gear'], hot: true },
  { type: 'stall', x: 578, z: -270, yaw: E, color: '#ff7a1a', sign: ['Ember Exchange', 'Buy • Sell'] },
  { type: 'temple', x: 540, z: -312, yaw: E },
  { type: 'lavagate', x: 610, z: -357, yaw: 0.6 },
  { type: 'travel', x: 572, z: -280, town: 'caldera' },
  { type: 'signpost', x: 540, z: -318, yaw: E, sign: ['Volcanic Sands', 'Toughness 6'] },
  { type: 'signpost', x: 724, z: -404, yaw: W, sign: ['Magma Furnace', 'Toughness 7'] },
];

// Prop scatter regions: density per 1000 m^2 of each prop kind (by biome)
export const SCATTER = {
  meadow: { tree: 0.35, pine: 0.05, bush: 0.9, rock: 0.25, grass: 7, flower: 2.0 },
  forest: { tree: 1.4, pine: 0.8, bush: 1.2, rock: 0.3, grass: 5, flower: 0.8 },
  valley: { tree: 0.5, pine: 0.2, bush: 0.8, rock: 0.3, grass: 6, flower: 1.5 },
  wetland: { tree: 0.3, reed: 4, bush: 0.6, rock: 0.1, grass: 6, flower: 0.6 },
  beach: { palm: 0.35, rock: 0.15, grass: 1.2, shell: 0.6 },
  cliffs: { pine: 0.5, tree: 0.2, bush: 0.6, rock: 0.6, grass: 5, flower: 0.6 },
  desert: { cactus: 0.35, deadtree: 0.08, rock: 0.35, grass: 0.4, palm: 0.0 },
  mesa: { cactus: 0.2, rock: 0.6, deadtree: 0.08 },
  mountain: { pine: 1.0, rock: 0.9, bush: 0.3, grass: 2.5 },
  snow: { snowpine: 0.6, rock: 0.6 },
  volcano: { deadtree: 0.12, rock: 1.0, ember: 0.15 },
};
