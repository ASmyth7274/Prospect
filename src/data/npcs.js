// NPCs and interactable objects. role decides which UI opens.
const W = -Math.PI / 2;
const E = Math.PI / 2;
const N = Math.PI;
const S = 0;

// look: shirt, pants, skin, hat ('cowboy'|'cap'|'miner'|'beanie'|'tophat'|'hood'|null), face 0-3, hatColor
export const NPCS = [
  { id: 'john', name: 'John', title: 'Prospector Guide', x: 72, z: 431, yaw: E, role: 'quest', quests: ['q_start1', 'q_start2', 'q_rubble_collection'], look: { shirt: '#c0392b', pants: '#2c3e50', skin: '#f2c49b', hat: 'cowboy', hatColor: '#8a5a2b', face: 0 }, greet: ["Howdy, greenhorn! Name's John.", 'The creek’s been good to folks who know how to work it.'] },
  { id: 'gus', name: 'Gus', title: 'Gear Shop', x: 97.5, z: 398, yaw: W, role: 'shop', shop: 'rubble', look: { shirt: '#e67e22', pants: '#4a3b2a', skin: '#d8a27a', hat: 'cap', hatColor: '#2d6aa8', face: 1 }, greet: ['Best pans this side of the river!'] },
  { id: 'marty', name: 'Marty', title: 'Mineral Merchant', x: 97.5, z: 456, yaw: W, role: 'merchant', look: { shirt: '#27ae60', pants: '#2c3e50', skin: '#f0c8a0', hat: 'tophat', hatColor: '#222222', face: 1 }, greet: ['Got rocks? I’ve got cash.'] },
  { id: 'tess', name: 'Trader Tess', title: 'Special Orders', x: 89, z: 462, yaw: W, role: 'quest', quests: ['q_tess_ruby', 'q_tess_emerald', 'q_tess_diamond'], look: { shirt: '#8e44ad', pants: '#34495e', skin: '#a8754f', hat: 'beanie', hatColor: '#f1c40f', face: 3 }, greet: ['I deal in the finer stones, darling.'] },
  { id: 'rosie', name: 'Rosie', title: 'Rubble Supplies', x: 122.5, z: 428, yaw: W, role: 'supplies', shop: 'rubble', look: { shirt: '#ff7aa8', pants: '#5a3a6a', skin: '#f6d0b0', hat: null, face: 3 }, greet: ['Potions, sluices, and good vibes!'] },
  { id: 'earl', name: 'Tired Earl', title: 'Tired Prospector', x: 89, z: 156, yaw: E, role: 'quest', sit: true, quests: ['q_earl_bet1', 'q_earl_bet2'], look: { shirt: '#7f8c8d', pants: '#5d4037', skin: '#e0b090', hat: 'cowboy', hatColor: '#5d4037', face: 2 }, greet: ['*yawn* Forty years I’ve been diggin’ these deposits...'] },
  { id: 'edna', name: 'Engineer Edna', title: 'Mine Engineer', x: 107, z: 178, yaw: W, role: 'quest', quests: ['q_edna_generator'], look: { shirt: '#f39c12', pants: '#2c3e50', skin: '#c68e63', hat: 'miner', hatColor: '#f1c40f', face: 2 }, greet: ['This blasted generator won’t start, and the cavern drill needs power!'] },
  { id: 'clara', name: 'Curator Clara', title: 'Museum Curator', x: -175, z: 54, yaw: W, role: 'museum', quests: ['q_museum1', 'q_museum2', 'q_museum3'], look: { shirt: '#2c3e50', pants: '#1a252f', skin: '#f2d2b6', hat: null, face: 0 }, greet: ['Welcome to the Fortune Museum of Natural Wonders!'] },
  { id: 'fiona', name: 'Fiona', title: 'Fortune Outfitters', x: -183, z: 112, yaw: W, role: 'shop', shop: 'fortune', look: { shirt: '#3498db', pants: '#2c3e50', skin: '#e8b48a', hat: 'cap', hatColor: '#e74c3c', face: 1 }, greet: ['Serious prospectors need serious gear.'] },
  { id: 'felix', name: 'Felix', title: 'Fortune Exchange', x: -184.5, z: 14, yaw: W, role: 'merchant', look: { shirt: '#f1c40f', pants: '#34495e', skin: '#8d5b3a', hat: 'tophat', hatColor: '#7a5a1a', face: 1 }, greet: ['Fortune favors the seller!'] },
  { id: 'bram', name: 'Bram', title: 'Blacksmith', x: -146, z: 2, yaw: W, role: 'anvil', quests: ['q_bram_ring'], look: { shirt: '#5d4037', pants: '#3e2723', skin: '#d39b72', hat: null, face: 2 }, greet: ['Bring me minerals and I’ll forge you a ring worth wearing.'] },
  { id: 'stella', name: 'Stella', title: 'Stargazer', x: -147, z: 126, yaw: W, role: 'shards', quests: ['q_stella_meteor'], look: { shirt: '#4b2a8a', pants: '#1f1440', skin: '#f6d6c0', hat: 'hood', hatColor: '#6c3fd1', face: 3 }, greet: ['The stars drop gifts for those who look up.'] },
  { id: 'sal', name: 'Sal', title: 'Sluice Dealer', x: -362, z: 368, yaw: W, role: 'sluice', look: { shirt: '#16a085', pants: '#2c3e50', skin: '#c68e63', hat: 'cap', hatColor: '#16a085', face: 1 }, greet: ['Let the river do the work for ya!'] },
  { id: 'della', name: 'Della', title: 'Delta Trader', x: -345, z: 352, yaw: W, role: 'merchant', quests: ['q_della_haul'], look: { shirt: '#2ecc71', pants: '#1e5c3a', skin: '#e0b090', hat: 'cowboy', hatColor: '#3d5e3a', face: 3 }, greet: ['The delta gives up its treasure slow... but it gives.'] },
  { id: 'shelly', name: 'Shelly', title: 'Beach Trader', x: 252, z: 506, yaw: S, role: 'merchant', quests: ['q_shelly_shells', 'q_shelly_pearl'], look: { shirt: '#ff9ff3', pants: '#48dbfb', skin: '#f2c49b', hat: 'cap', hatColor: '#ff6b6b', face: 3 }, greet: ['Sun, sand, and shells! What more could you want?'] },
  { id: 'lou', name: 'Lightkeeper Lou', title: 'Lighthouse Keeper', x: 604, z: -74, yaw: S, role: 'quest', quests: ['q_lou_light'], look: { shirt: '#1f3a93', pants: '#2c3e50', skin: '#e8c0a0', hat: 'cap', hatColor: '#1f3a93', face: 2 }, greet: ['The lamp went dark in the storm, and the old bridge washed out with it.'] },
  { id: 'bea', name: 'Botanist Bea', title: 'Desert Botanist', x: -436, z: -230, yaw: E, role: 'quest', quests: ['q_bea_roses', 'q_bea_azuralite'], look: { shirt: '#a3cb38', pants: '#6a4a2a', skin: '#c68e63', hat: 'cowboy', hatColor: '#d4b483', face: 0 }, greet: ['Even the desert blooms, if you know where to dig.'] },
  { id: 'omar', name: 'Omar', title: 'Oasis Bazaar', x: -414, z: -238, yaw: E, role: 'merchant', look: { shirt: '#e76f51', pants: '#264653', skin: '#a8754f', hat: 'hood', hatColor: '#f4a261', face: 1 }, greet: ['Water is free. Minerals are not!'] },
  { id: 'ada', name: 'Archaeologist Ada', title: 'Ruins Expert', x: -552, z: -32, yaw: W, role: 'quest', shop: 'ruins', quests: ['q_ada_coins', 'q_ada_scarab'], look: { shirt: '#c8a165', pants: '#5a4630', skin: '#f2d2b6', hat: 'cowboy', hatColor: '#a0784a', face: 2 }, greet: ['These ruins are older than any map...'] },
  { id: 'cole', name: 'Cave Diver Cole', title: 'Cave Diver', x: -60, z: -124, yaw: S, role: 'quest', quests: ['q_cole_dive'], look: { shirt: '#2d3436', pants: '#0984e3', skin: '#e0b090', hat: 'miner', hatColor: '#fdcb6e', face: 2 }, greet: ['A rockfall sealed the caverns. Edna’s drill could clear it, if she ever gets power.'] },
  { id: 'frost', name: 'Old Frost', title: 'Mountain Hermit', x: 64, z: -392, yaw: W, role: 'quest', quests: ['q_frost_quartz', 'q_frost_heart'], look: { shirt: '#dfe6e9', pants: '#636e72', skin: '#f6d6c0', hat: 'beanie', hatColor: '#d63031', face: 0 }, greet: ['Brrr. Stay by the fire, youngster, or the cold will get you.'] },
  { id: 'yuki', name: 'Yuki', title: 'Frostbite Outfitters', x: 56.5, z: -386, yaw: E, role: 'shop', shop: 'frozen', look: { shirt: '#74b9ff', pants: '#2d3436', skin: '#f6d6c0', hat: 'beanie', hatColor: '#0984e3', face: 1 }, greet: ['Elite gear for elite prospectors.'] },
  { id: 'pyra', name: 'Flame Priest Pyra', title: 'Flame Priest', x: 550, z: -312, yaw: E, role: 'quest', quests: ['q_pyra_opal', 'q_pyra_core'], look: { shirt: '#d63031', pants: '#2d3436', skin: '#c68e63', hat: 'hood', hatColor: '#e17055', face: 2 }, greet: ['The Heart of the mountain burns for the worthy.'] },
  { id: 'ignatius', name: 'Ignatius', title: 'Ember Outfitters', x: 565.5, z: -282, yaw: E, role: 'shop', shop: 'caldera', look: { shirt: '#2d3436', pants: '#d63031', skin: '#d39b72', hat: 'miner', hatColor: '#e17055', face: 1 }, greet: ['Gear forged in lava. Priced like it.'] },
  { id: 'cinder', name: 'Cinder', title: 'Ember Exchange', x: 573, z: -270, yaw: E, role: 'merchant', look: { shirt: '#ff7a1a', pants: '#2d3436', skin: '#f2c49b', hat: 'cap', hatColor: '#2d3436', face: 3 }, greet: ['Hot minerals, cold cash.'] },
];

// Non-character interactables
export const OBJECTS = [
  { id: 'altar', name: 'Mysterious Altar', x: -66, z: -228, role: 'altar', radius: 4 },
  { id: 'board_rubble', name: 'Notice Board', x: 72, z: 452, role: 'board', radius: 3 },
  { id: 'board_fortune', name: 'Notice Board', x: -196, z: 44, role: 'board', radius: 3 },
  { id: 'museum_hall', name: 'Museum Displays', x: -156, z: 62, role: 'museum', radius: 7 },
];

export const SHOP_STOCK = {
  rubble: { title: "Gus's Gear", pans: ['plastic_pan', 'metal_pan', 'silver_pan'], shovels: ['iron_shovel', 'steel_shovel', 'silver_shovel'] },
  fortune: { title: 'Fortune Outfitters', pans: ['golden_pan', 'magnetic_pan', 'meteoric_pan'], shovels: ['reinforced_shovel', 'golden_shovel', 'meteoric_shovel', 'diamond_shovel'] },
  frozen: { title: 'Frostbite Outfitters', pans: ['diamond_pan', 'aurora_pan'], shovels: ['glacial_shovel', 'galactic_shovel'], consumables: ['warmth_potion'] },
  caldera: { title: 'Ember Outfitters', pans: ['worldshaker', 'dragonflame_pan'], shovels: ['dragon_shovel', 'abyssal_shovel'], consumables: ['fireproof_potion'] },
  ruins: { title: "Ada's Relics", pans: ['fossilized_pan'], shovels: [], requiresFlag: 'ruins_shop' },
};
