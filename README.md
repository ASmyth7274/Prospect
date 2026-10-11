# Prospect!

A 3D prospecting game inspired by Roblox's *Prospecting!*, built as an installable PWA.
Dig sand, pan it in the river, find ores, gems and rare metals, sell them, upgrade your gear and
work your way out to harder sands with rarer minerals.

## Play

* Run locally: `npm install && npm run dev`, then open the printed URL.
* Production build: `npm run build` (outputs `dist/`, including the service worker), then `npm run preview`.
* The included GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys `dist/` to
  GitHub Pages. Enable it once in **Settings → Pages → Source: GitHub Actions**.
* On iPhone/iPad: open the site in Safari, then **Share → Add to Home Screen** for full-screen offline play.

### Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move / sprint | WASD or arrows, Shift | left-side joystick |
| Camera | right-drag, two-finger swipe, scroll/pinch to zoom | drag on the right side, pinch |
| Dig / pan | hold left mouse, release in the green zone | hold the big action button |
| Jump / interact | Space / E | jump and talk buttons |
| Panels | I bag, J quests, C index, M map, Q quick potion, Esc menu | buttons on the HUD |

## What's in it

* **Large island map** (1.6 km square) with 15 dig sites across 13 areas. Sand hardness runs from
  Toughness 1 to 8: Rubble Creek Sands and Deposits, Fortune River and its Delta, Sunset and
  Windswept Beach, Azuralite Oasis, the Sunscorched Dunes, Ancient Ruins, the Crystal Caverns (an
  underground dome), Frostbite Waterfall, Frozen Peak, and Caldera Island (Volcanic Sands, the Magma
  Furnace and the periodically awakening Infernal Heart). Harder sites have better loot tables and
  area-exclusive minerals.
* **65 minerals in 7 rarity tiers** (Common to Exotic), each with weights and value per kg, plus 9 value
  modifiers (Shiny … Voidtorn), and geodes for each region.
* **The prospecting loop**: a dig meter with a perfect-dig zone; pan fill tied to capacity; shaking
  in water, driven by shake strength and speed; and luck-weighted rolls.
* **Progression**: 12 pans and 12 shovels; a museum that gives permanent boosts for each displayed
  specimen; 17 craftable rings and ring slots; Aurorite and Aetherite enchanting at the Mysterious
  Altar; potions and placeable totems; sluices that keep collecting while you're offline; levels.
* **26 NPC quests**, including area-unlock chains (Edna's generator opens the caverns, Lou's lighthouse
  rebuilds the Caldera bridge, the Flame Priest opens the Infernal Heart), plus daily bounties.
* **World events**: Meteor Shower, Solar Flare, River Rapids, Mythic Rift and Lucky Breeze.
  **Location events**: Rainstorm, Sandstorm, Blizzard, Eruption, Aurora, Low Tide and the Infernal
  Heart cycle.
* **Status effects**: Freezing and Frozen (stand by a campfire), Burning (lava and lava bombs), Soaked,
  In the Zone, Sand-Blind, Energized, Voidtouched, Hot Spring, and totem auras.
* **A busy server**: about 30 prospector bots who dig, pan, walk to town, chat, celebrate big finds
  (announced in global chat) and drop totems you can stand in.
* **Saves**: 3 slots with autosave, plus export and import codes.

## Apple Metal / GPU notes

* The renderer is `three/webgpu` (`WebGPURenderer`). On Safari 26+ (iOS, iPadOS, macOS) it runs on
  **WebGPU, which is implemented directly on Metal**. Everywhere else it falls back to WebGL2
  automatically, and Safari's WebGL2 also runs on Metal through ANGLE. You can switch the API in Menu → Graphics.
* Tuned for tile-based deferred GPUs (Apple silicon):
  * One forward pass straight into the drawable. Colour management is off and tone mapping is off,
    so there is no half-float intermediate target and no output pass. MSAA resolves on-tile.
  * Opaque canvas, a single shadow-casting light whose shadow map follows the player with texel
    snapping and is re-rendered less often on lower presets, and shadow casting limited to nearby
    prop buckets.
  * Draw calls are kept low: terrain is split into 256 chunks with 3 LODs and a shared index buffer;
    all water bodies are one mesh; buildings are merged per region; every character part is
    instanced (about 10 draws for all avatars); props are bucketed instanced meshes.
  * Weather particles are animated entirely in the vertex shader (TSL), so they cost no CPU time each
    frame. The sky is drawn after opaque geometry so early depth testing rejects covered pixels.
  * Dynamic resolution, a 30, 60 or ProMotion frame-rate cap, and Low, Medium, High and Ultra presets
    that scale view distance, shadows, vegetation and particles.
* The generated world is cached in IndexedDB, so later launches skip world generation.
