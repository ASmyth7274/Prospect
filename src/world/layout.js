// Hand-authored geography for the island world. Units are meters; x = east, z = south.
// World spans [-WORLD_HALF, WORLD_HALF] on both axes.

export const WORLD_HALF = 800;
export const CELL = 2; // heightmap resolution (m)
export const SEED = 1849;

// Rivers: points are [x, z, waterLevel, halfWidth]. slope = bank steepness.
export const RIVERS = [
  {
    id: 'frostbite',
    name: 'Frostbite River',
    slope: 0.9,
    depth: 1.6,
    flow: 1.4,
    pts: [
      [8, -505, 121, 5],
      [20, -478, 120.5, 5],
      [30, -452, 66, 6],
      [40, -432, 62, 9],
      [62, -400, 58, 6],
      [92, -352, 49, 7],
      [118, -300, 40, 7],
      [126, -240, 33, 8],
      [118, -170, 27, 4.5],
    ],
  },
  {
    id: 'rubble',
    name: 'Rubble Creek',
    slope: 0.45,
    depth: 1.6,
    flow: 1.0,
    meander: 24,
    pts: [
      [118, -170, 27, 4.5],
      [104, -90, 22, 5.0],
      [84, 0, 17.5, 5.0],
      [68, 90, 13.5, 5.4],
      [56, 170, 10.5, 5.4],
      [44, 250, 8, 5.8],
      [36, 330, 6, 6.3],
      [30, 410, 4.2, 6.3],
      [22, 490, 2.6, 6.8],
      [10, 570, 1.0, 7.2],
      [-4, 660, 0.0, 8.1],
    ],
  },
  {
    id: 'fortune',
    name: 'Fortune River',
    slope: 0.4,
    depth: 2.4,
    flow: 1.2,
    meander: 28,
    pts: [
      [-150, -300, 42, 9],
      [-170, -220, 34, 11],
      [-205, -130, 26, 13],
      [-238, -40, 19, 15],
      [-258, 50, 14, 17],
      [-280, 140, 10, 18],
      [-322, 225, 6.5, 19],
      [-360, 290, 4, 20],
      [-385, 345, 2.4, 20],
      [-405, 400, 1.4, 19],
      [-425, 455, 0.6, 18],
      [-452, 510, 0.0, 20],
    ],
  },
  {
    id: 'delta_east',
    name: 'Delta Channel',
    slope: 0.3,
    depth: 1.6,
    flow: 1.1,
    meander: 10,
    pts: [
      [-385, 345, 2.4, 9],
      [-352, 395, 1.6, 9],
      [-332, 450, 0.8, 10],
      [-318, 525, 0.0, 12],
    ],
  },
  {
    id: 'delta_west',
    name: 'Delta Channel',
    slope: 0.3,
    depth: 1.6,
    flow: 1.1,
    meander: 10,
    pts: [
      [-405, 400, 1.4, 8],
      [-450, 410, 0.9, 8],
      [-492, 425, 0.3, 9],
      [-540, 440, 0.0, 12],
    ],
  },
  {
    id: 'cavern_stream',
    name: 'Crystal Cavern River',
    slope: 1.2,
    depth: 1.4,
    flow: 0.6,
    cave: true,
    pts: [
      [-120, -268, 21.2, 5],
      [-90, -245, 21.0, 6],
      [-62, -262, 20.8, 6],
      [-30, -246, 20.6, 5],
    ],
  },
  {
    id: 'lava_flow',
    name: 'Lava Channel',
    slope: 1.0,
    depth: 1.2,
    flow: 0.25,
    lava: true,
    pts: [
      [702, -400, 80, 4],
      [725, -395, 56, 4.5],
      [750, -385, 36, 5],
      [775, -372, 9, 6],
      [800, -362, -1, 7],
    ],
  },
];

// Lakes/pools: [x, z, radius, level]
export const LAKES = [
  { id: 'peak_tarn', name: 'Summit Tarn', x: 4, z: -518, r: 16, level: 121, slope: 1.2, depth: 2.5 },
  { id: 'frost_pool', name: 'Frostbite Pool', x: 38, z: -428, r: 20, level: 62, slope: 1.1, depth: 3 },
  { id: 'oasis', name: 'Azuralite Oasis', x: -470, z: -255, r: 34, level: 13, slope: 0.35, depth: 3 },
  { id: 'ruins_spring', name: 'Ruins Spring', x: -575, z: -20, r: 11, level: 18.5, slope: 0.6, depth: 2 },
  { id: 'cavern_pool', name: 'Crystal Pool', x: -40, z: -228, r: 12, level: 20.6, slope: 1.2, depth: 2, cave: true },
  { id: 'hot_spring', name: 'Hot Spring', x: 738, z: -352, r: 10, level: 37, slope: 0.8, depth: 2, hot: true },
  { id: 'crater_pool', name: 'Crater Pool', x: 612, z: -392, r: 8, level: 58.5, slope: 1.2, depth: 2, hot: true },
  { id: 'delta_pond_a', name: 'Marsh Pond', x: -372, z: 478, r: 15, level: 0.9, slope: 0.3, depth: 1.5 },
  { id: 'delta_pond_b', name: 'Marsh Pond', x: -455, z: 360, r: 14, level: 2.0, slope: 0.3, depth: 1.5 },
];

// Lava lake inside the caldera crater (rendered as lava, not water)
export const LAVA_LAKES = [{ id: 'caldera_lava', x: 660, z: -388, r: 16, level: 59 }];

// Dry paths carved into terrain (tunnels/passes): pts [x, z, level, halfWidth]
export const PATHS = [
  // Crystal Caverns entrance tunnel from the south
  { id: 'cavern_tunnel', pts: [[-70, -110, 30, 6], [-72, -150, 26, 6], [-75, -185, 23.5, 6.5], [-78, -205, 22.5, 7]], slope: 1.6 },
  // Switchback trail up to the frost pool & peak
  { id: 'frost_trail', pts: [[120, -165, 29, 5], [150, -230, 36, 4], [140, -300, 46, 4], [104, -360, 56, 4], [70, -412, 63.5, 4], [20, -430, 66, 4], [-30, -450, 82, 3.5], [-40, -490, 100, 3.5], [-15, -525, 121.5, 3.5]], slope: 1.0, side: true },
  // Path up the volcano to the furnace
  { id: 'volcano_trail', pts: [[570, -292, 20, 4], [586, -318, 40, 4], [600, -340, 58, 4], [609, -355, 66, 4.5], [618, -368, 62, 4.5], [628, -380, 58.5, 4.5]], slope: 1.0, side: true },
];

// Biome anchors: blended by gaussian weight. type picks height/color function.
export const BIOMES = [
  { type: 'meadow', x: 60, z: 380, s: 200 },
  { type: 'meadow', x: 70, z: 160, s: 160 },
  { type: 'forest', x: 180, z: 260, s: 150 },
  { type: 'forest', x: -100, z: 140, s: 160 },
  { type: 'valley', x: -230, z: 60, s: 190 },
  { type: 'wetland', x: -400, z: 410, s: 120 },
  { type: 'beach', x: 290, z: 520, s: 140 },
  { type: 'cliffs', x: 540, z: 40, s: 140 },
  { type: 'beach', x: 600, z: 50, s: 55 },
  { type: 'cliffs', x: 420, z: 180, s: 140 },
  { type: 'desert', x: -430, z: -200, s: 210 },
  { type: 'desert', x: -330, z: -60, s: 150 },
  { type: 'mesa', x: -600, z: -40, s: 120 },
  { type: 'mountain', x: -60, z: -300, s: 180 },
  { type: 'mountain', x: 160, z: -330, s: 170 },
  { type: 'mountain', x: 300, z: -200, s: 170 },
  { type: 'snow', x: 0, z: -540, s: 150 },
  { type: 'forest', x: 260, z: -40, s: 140 },
];

// Island coast: radius as function of angle around (0,0)
export const MAIN_ISLAND = { x: -10, z: 10, r: 640 };
export const CALDERA = { x: 640, z: -400, r: 175, peak: 92, craterR: 52, craterFloor: 57 };

// Crystal Caverns dome
export const CAVERN = { x: -70, z: -250, r: 86, floor: 22, roof: 64 };

// Areas for naming / gating. Most specific (smallest r) wins.
export const AREAS = [
  { id: 'wilds', name: 'The Wilds', x: 0, z: 0, r: 99999, color: '#9fd27a' },
  { id: 'ocean', name: 'Open Sea', x: 0, z: 0, r: 99998, color: '#5fb6ff' },
  { id: 'rubble', name: 'Rubble Creek', x: 50, z: 400, r: 140, color: '#ffd166', ambience: 'creek' },
  { id: 'deposits', name: 'Rubble Creek Deposits', x: 75, z: 150, r: 110, color: '#c9b89a', ambience: 'creek' },
  { id: 'fortune', name: 'Fortune River', x: -230, z: 60, r: 150, color: '#7fd1ff', ambience: 'river' },
  { id: 'delta', name: 'Fortune River Delta', x: -400, z: 420, r: 125, color: '#7bc47f', ambience: 'marsh' },
  { id: 'sunset', name: 'Sunset Beach', x: 280, z: 530, r: 120, color: '#ffa86b', ambience: 'beach' },
  { id: 'windswept', name: 'Windswept Beach', x: 560, z: 40, r: 120, color: '#a8d8ff', ambience: 'wind' },
  { id: 'lighthouse', name: 'Lighthouse Point', x: 600, z: -90, r: 55, color: '#ffffff', ambience: 'wind' },
  { id: 'desert', name: 'Sunscorched Desert', x: -400, z: -150, r: 210, color: '#ffb36b', ambience: 'desert' },
  { id: 'oasis', name: 'Azuralite Oasis', x: -470, z: -255, r: 75, color: '#22d3ff', ambience: 'desert' },
  { id: 'ruins', name: 'Ancient Ruins', x: -585, z: -35, r: 75, color: '#e9c46a', ambience: 'desert' },
  { id: 'caverns', name: 'Crystal Caverns', x: -70, z: -250, r: 88, color: '#b46bff', ambience: 'cave', flag: 'cave_open' },
  { id: 'mountains', name: 'Granite Mountains', x: 100, z: -280, r: 200, color: '#b8b8c8', ambience: 'wind' },
  { id: 'frostbite', name: 'Frostbite Waterfall', x: 40, z: -430, r: 65, color: '#bfeaff', ambience: 'falls' },
  { id: 'peak', name: 'Frozen Peak', x: 0, z: -540, r: 95, color: '#ffffff', ambience: 'wind' },
  { id: 'caldera', name: 'Caldera Island', x: 640, z: -400, r: 190, color: '#ff7a4a', ambience: 'volcano', flag: 'bridge_repaired' },
  { id: 'furnace', name: 'Magma Furnace', x: 738, z: -400, r: 45, color: '#ff4a1c', ambience: 'volcano', flag: 'bridge_repaired' },
  { id: 'infernal', name: 'Infernal Heart', x: 640, z: -405, r: 50, color: '#ff2200', ambience: 'volcano', flag: 'infernal_access' },
];

// Dig site shapes (capsules): a->b with radius r. Site data lives in data/sites.js
export const DIG_SITES = [
  { id: 'rubble_sands', a: [38, 300], b: [26, 382], r: 16 },
  { id: 'rubble_sands', a: [22, 445], b: [18, 470], r: 11 },
  { id: 'rubble_deposits', a: [80, 110], b: [64, 190], r: 15 },
  { id: 'fortune_river', a: [-214, -10], b: [-226, 80], r: 14 },
  { id: 'fortune_river', a: [-350, 168], b: [-352, 205], r: 12 },
  { id: 'sunset_beach', a: [220, 548], b: [300, 525], r: 14 },
  { id: 'fortune_delta', a: [-420, 375], b: [-440, 430], r: 16 },
  { id: 'windswept_beach', a: [590, 15], b: [600, 80], r: 12 },
  { id: 'azuralite_oasis', a: [-470, -305], b: [-470, -305], r: 18 },
  { id: 'azuralite_oasis', a: [-425, -240], b: [-425, -240], r: 14 },
  { id: 'sunscorched_dunes', a: [-360, -130], b: [-410, -100], r: 22 },
  { id: 'crystal_caverns', a: [-100, -260], b: [-50, -278], r: 22 },
  { id: 'ancient_ruins', a: [-590, -50], b: [-565, -58], r: 13 },
  { id: 'frostbite_falls', a: [56, -420], b: [64, -440], r: 11 },
  { id: 'frozen_peak', a: [-18, -540], b: [12, -548], r: 13 },
  { id: 'volcanic_sands', a: [535, -330], b: [520, -400], r: 13 },
  { id: 'magma_furnace', a: [735, -418], b: [748, -412], r: 9 },
  { id: 'infernal_heart', a: [628, -418], b: [642, -426], r: 9 },
];

// Walkable decks (bridges/docks): center, size (along, across), yaw, deck height
export const DECKS = [
  // River bridges are auto-placed across the (meandered) river nearest to `z`
  { id: 'rubble_bridge', river: 'rubble', z: 420, wid: 5, rail: true },
  { id: 'deposits_bridge', river: 'rubble', z: 92, wid: 4, rail: true },
  { id: 'fortune_bridge', river: 'fortune', z: 72, wid: 6, rail: true },
  { id: 'delta_bridge', river: 'fortune', z: 330, wid: 4, rail: true },
  { id: 'caldera_bridge', x: 612, z: -172, len: 140, wid: 6, yaw: 1.38, h: 7, rail: true, gated: 'bridge_repaired' },
  { id: 'sunset_pier', x: 262, z: 585, len: 46, wid: 4, yaw: Math.PI / 2 + 0.25, h: 2.2, rail: true },
]

export const SPAWN = { x: 88, z: 438, yaw: -Math.PI * 0.62 };
