# Dropzone

A browser extraction shooter built with three.js. Drop into the **Ashgrove hotzone** in a drop pod,
strip it for salvage, fight machines and raiders, then make it to an active landing zone and call
the lift before the storm hits. Everything you carry in is lost if you die. What you extract goes
into your stash at **Haven**, your base, where you build structures, craft weapons and fit attachments.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000. Click the game to capture the mouse.

## The loop

1. **Haven (base).** Press `Tab` to pack your backpack from the stash and equip weapons, armor and a pack.
   Press `B` to build. Use your benches (`E`) to craft.
2. **Deploy.** Use the *Drop Pod Console* in the hangar and pick an insertion point. Each one shows its
   threat level. The pod re-enters, brakes and lands.
3. **Scavenge.** Hold `E` to search crates, lockers, safes, weapon cases and car trunks. Salvage heaps,
   junction boxes, chemical drums, timber and tarps give you building resources.
4. **Survive.** Gnat drones, Skitter crawlers, Sentinel turrets, raider squads and a Juggernaut Strider
   (weak point: the glowing core on its back) all hunt by sight and sound. A suppressor helps.
5. **Extract.** Two of the four LZs are active each raid (◆ on the compass, `M` for the map). Call the lift
   at the console, hold the pad for 50 seconds, then get aboard.

## Base building

Everything sits on a 4 m grid. **Foundations** go on the plot. **Walls**, **doorways** and **windows** snap to
cell edges. **Floors** go on top of walls. **Stairs** climb one storey. Stations and props go on the plot
or on any floor.

| Piece | Effect |
| --- | --- |
| Workbench | Craft weapons, ammo, armor, backpacks and plates. Each extra bench raises its level (max 3). |
| Gunsmith Bench | Craft attachments and fit them to your weapons, with a live 3D preview. |
| Med Station | Craft bandages, trauma kits and stims. |
| Storage Locker | +20 stash capacity each. |
| Generator | Powers floodlights. |
| Floodlight, Sandbags, Fire Barrel, Banner, Sentry Turret | Fortification and decoration. |

Demolish with `F` for a 50% refund.

## Weapons and attachments

There are six weapons: P9 pistol, VX-9 SMG, Breacher 12 pump shotgun, K-15 carbine, B-308 battle rifle
and M14R marksman rifle. Each one is modelled part by part (receivers, rails, M-LOK slots, bolt
catches, ejection ports, charging handles, magazines) with PBR steel, anodised aluminium, polymer,
cerakote and wood materials.

| Slot | Options |
| --- | --- |
| Optic | Red dot (glowing reticle), holographic, 4× prism, 2.5–10× scope (full scope overlay) |
| Muzzle | Compensator, tri-port brake, suppressor (machines struggle to locate you) |
| Underbarrel | Vertical grip, angled grip, hand stop |
| Magazine | Extended, drum, coupled fast-mag |
| Stock | Precision or skeleton stock |
| Tactical | Visible laser (tighter hipfire), 1000 lm weapon light (`L`) |

Every attachment changes recoil, spread, ADS speed, reload, damage, range or capacity, and it also
shows up on the model.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / C / Space | Move / sprint / crouch / jump |
| LMB / RMB | Fire / aim down sights |
| R | Reload |
| 1, 2, wheel | Switch weapon |
| E (hold) | Interact, search, salvage |
| Q / G | Heal / insert armor plate |
| Tab / M | Inventory / map |
| V | Toggle first / third person |
| L | Weapon light |
| B | Build mode (Haven) |
| Esc | Pause and settings |

## Tech

There are no external assets. All textures (concrete, brick, rust, corrugated steel, parkerised gun
steel, polymer stippling, camo and more) are generated as tileable PBR albedo, normal and roughness
maps at load time. Audio is synthesised with WebAudio. The terrain uses a height-blended 4-layer
splat shader. Lighting is a physical sky with image-based lighting, soft shadows, bloom, ACES tone
mapping and colour grading. Characters are faceted low-poly with fabric and camo textures, and they
use two-bone arm IK on the weapon.

Progress is saved in `localStorage`.
