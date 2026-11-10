# Dropzone

A browser extraction shooter built with three.js. Drop into the 1 km² **Ashgrove hotzone** (12 districts, 6 extraction LZs) in a drop pod,
strip it for salvage, fight machines and raiders, then make it to an active landing zone and call
the lift before the storm hits. Everything you carry in is lost if you die. What you extract goes
into your stash at **Haven**, your base, where you build structures, craft weapons and fit attachments.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000. Click the game to capture the mouse.

## Teams and shared bases

Press T for the team panel. You can invite anyone who is online or join a friend's team code. Teammates share the team leader's Haven: you walk around it together, build on it (each builder pays from their own stash) and use its benches. You also drop into the same raid session. Teammates get green tags and compass markers. Friendly fire is on.

## Multiplayer

Everyone who drops into the hotzone at the same time shares it (up to 8 per session). It is PvPvE: other operators can shoot you, and they can loot your body.

- **Published link:** multiplayer runs on the claude.ai artifact's live room, so there is no server to host.
- **Self-hosted:** `npm start` also runs a WebSocket relay at `/ws`, which the client uses automatically.
- **Who simulates the enemies:** the first player in a session acts as host and simulates all hostiles. Everyone else sees synced copies. If the host leaves, another player takes over.
- **What is shared:** loot, dropped gear, vehicles, grenades and the extraction helicopter.

Set your callsign on the main menu.

## The loop

1. **Haven (base).** Press `Tab` to pack your backpack from the stash and equip weapons, armor and a pack.
   Press `B` to build. Use your benches (`E`) to craft.
2. **Deploy.** Use the *Flight Ops Console* (or walk up to the helicopter on the pad) and pick an
   insertion point. A utility helicopter flies you in from the map edge, flares into a hover, and you
   fast-rope down. Press Space to skip the flight.
3. **Scavenge.** Hold `E` to search crates, lockers, safes, weapon cases and car trunks. Salvage heaps,
   junction boxes, chemical drums, timber and tarps give you building resources.
4. **Survive.** Gnat drones, Skitter crawlers, Sentinel turrets, raider squads and a Juggernaut Strider
   (weak point: the glowing core on its back) all hunt by sight and sound. A suppressor helps.
5. **Extract.** Two of the four LZs are active each raid (◆ on the compass, `M` for the map). Call the
   helicopter at the console and hold the pad while it flies in. It lands and waits 40 seconds for you to board.

## Ballistics and realism

- Every shot is a simulated projectile with the cartridge's real muzzle velocity, gravity drop, drag and
  time of flight, from 260 m/s for .45 ACP to 900 m/s for 5.56. The tracer follows the real path.
- Scoped weapons can be zeroed from 100 to 800 m (PgUp/PgDn).
- Bullets penetrate thin wood and sheet metal depending on calibre (.50 BMG goes through a lot), and they lose damage as they lose energy.
- Fire selector (X) switches between semi, burst and auto where the real weapon has them.
- Tactical reloads keep a round in the chamber (+1). Empty reloads take longer and you charge the weapon.
- Heavy hits can make you bleed until you bandage up.
- The first-person weapon lags behind fast mouse turns, more for heavier guns.

## Your home

Haven has your own two-storey house. You can walk through the living room and kitchen, see your stash
weapons mounted on the armory wall, check the hotzone map board, and climb the stairs to the bunk room
and balcony. There is a Humvee in the carport you can drive around the base. You can play in first or
third person (menu setting, or V at any time). Where the browser frame refuses mouse capture, the game
falls back to soft mouse look: move the mouse to look, push against a screen edge to keep turning, or
use the arrow keys.

## Carry weight

Every item has a real weight in kg: weapons and their attachments, loaded magazines, ammo by the round,
armour, plates, meds and every resource. Your total sets your encumbrance band (Light to Overloaded).
Heavier loads slow you down, drain stamina faster, lower your jump, make your sights sway more, and
make your footsteps louder. Above 48 kg you can't sprint.

## Adaptive enemy AI

A director learns how you play and saves it across raids: engagement range, aggression, crouching,
shooting from one spot, headshot rate, suppressor use, vehicle use, favourite drop zones and LZs, and
the side you get flanked from. The hostiles adapt to it:

- **Raider squads:** each member has a role (leader, support, flanker, assault). They find real cover by sampling sightlines, peek and shoot, lay suppressing fire on your last known position, flank, retreat and patch up, push when you reload, throw frags to flush you out and smoke to cross open ground.
- **Counter-tactics:** against long-range players they close in by bounding between cover. Against rushers they hold angles and carry more shotguns.
- **Gear and hearing:** if you land a lot of headshots, more raiders wear helmets. If you use suppressors, they investigate bullet impacts.
- **Ambushes:** your favourite LZ gets staked out.
- **Machines:** they swarm on alerts, crawlers surround you (or kite you if you rush), and drones circle behind snipers.

The **Threat Intel** terminal at Haven shows what they have learned.

## Vehicles

There are 30 vehicles of eight types across the hotzone: the M1151 HMMWV, Stryker ICV 8×8, MRAP 4×4, M35 cargo truck, a technical with a mounted M2 .50 cal, a military UTV, an ATV quad and civilian SUVs.
The Humvee turret, the technical's bed gun and the Stryker's remote weapon station are usable: switch seats with 1–6. They fire .50 BMG through the ballistics model, and the barrel overheats if you hold the trigger too long.
They use the Odyssey Rush driving model, with the same controls (W/S, A/D, Space handbrake, V camera,
E enter/exit, R flip). Passengers can shoot. Armour soaks up incoming fire, vehicles take crash
damage and explode, and you can run hostiles down.

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

There are 24 real-world firearms: Glock 17, Beretta M9A1, Colt M1911A1, Desert Eagle Mk XIX, SIG MPX,
H&K MP5A3, H&K UMP45, H&K MP7A1, KRISS Vector, FN P90, Colt M4A1, FN SCAR-L, Steyr AUG A3, AKM, AK-74M,
H&K HK417, FN M249 SAW, M14 EBR, SVD Dragunov, Remington M24 SWS, Mosin-Nagant M91/30, Barrett M82A1,
Remington 870 and Benelli M4. Each is built part by part with real proportions and real calibers (9×19, .45 ACP,
.50 AE, 5.56, 5.45, 7.62×39, 7.62×51, 7.62×54R, 12 ga).

Every weapon has full animations, in first and third person:

- **Reloads:** box-mag reloads that tilt the gun, drop the mag and seat a new one from the pouch. AK reloads rock the new mag in and rack the side charging handle overhand. H&K reloads lock the cocking lever back and finish with the slap. Pistols drop the mag and release the slide. On the M249 you open the feed cover, swap the pouch, lay the belt and close the cover.
- **Action cycling:** shell-by-shell tube loading and pump racking, bolt-action cycling after every shot, slide and bolt blowback, and slide lock on empty.
- **Handling:** draw and holster, and an inspect animation (`I`).

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
| I | Inspect weapon |
| Shift while aiming | Hold breath (magnified optics) |
| E near a vehicle | Drive or ride |
| B | Build mode (Haven) |
| Esc | Pause and settings |

## Tech

There are no external assets. All textures (concrete, brick, rust, corrugated steel, parkerised gun
steel, polymer stippling, camo and more) are generated as tileable PBR albedo, normal and roughness
maps at load time. Audio is synthesised with WebAudio. The terrain uses a height-blended 4-layer
splat shader. Lighting is a physical sky with image-based lighting, soft shadows, bloom, ACES tone
mapping and colour grading, ground-truth ambient occlusion (GTAO), height fog and a procedural cloud
layer. Surfaces use height maps for parallax occlusion mapping, plus cavity ambient occlusion and
roughness/metalness maps. Characters are faceted low-poly with fabric and camo textures, and they
use two-bone arm IK on the weapon and planted-foot leg IK: feet lock to the ground and step to new footholds instead of sliding when you strafe, walk diagonally or turn.

Progress and the AI's profile of you are saved in `localStorage`.

`node tools/build-artifact.mjs <dir>` builds the client as a claude.ai artifact (three.js from jsDelivr).
