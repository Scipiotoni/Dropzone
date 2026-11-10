// Game data: resources, ammo, consumables, gear, weapons, attachments, crafting recipes and base pieces.

export const RARITY = { common: '#b8b8b0', uncommon: '#6fbf5a', rare: '#4a9ae0', epic: '#b06ae0', legendary: '#e8a832' };

export const ITEMS = {
  // ---- salvage resources (what you haul home)
  scrap:       { kg: 0.5, name: 'Scrap Metal', type: 'res', icon: '⚙', rarity: 'common', stack: 50, desc: 'Bent steel, rebar and sheet metal. The backbone of every build.' },
  polymer:     { kg: 0.2, name: 'Polymer', type: 'res', icon: '⬢', rarity: 'common', stack: 40, desc: 'Plastics and composite offcuts. Used for grips, stocks and housings.' },
  fabric:      { kg: 0.15, name: 'Fabric', type: 'res', icon: '▤', rarity: 'common', stack: 40, desc: 'Canvas, nylon webbing and kevlar scraps.' },
  wood:        { kg: 0.6, name: 'Timber', type: 'res', icon: '▥', rarity: 'common', stack: 50, desc: 'Salvaged beams and planks.' },
  electronics: { kg: 0.15, name: 'Electronics', type: 'res', icon: '⌁', rarity: 'uncommon', stack: 30, desc: 'Circuit boards, wiring looms and relays.' },
  chemicals:   { kg: 0.4, name: 'Chemicals', type: 'res', icon: '⚗', rarity: 'uncommon', stack: 30, desc: 'Solvents, propellant and reagents.' },
  glass:       { kg: 0.1, name: 'Optical Glass', type: 'res', icon: '◎', rarity: 'uncommon', stack: 20, desc: 'Ground lenses pulled from scopes and cameras.' },
  alloy:       { kg: 0.8, name: 'Hardened Alloy', type: 'res', icon: '⬣', rarity: 'rare', stack: 20, desc: 'High-grade machine plating. Needed for precision parts.' },
  servo:       { kg: 0.9, name: 'Servo Motor', type: 'res', icon: '⚙', rarity: 'rare', stack: 15, desc: 'Precision actuators salvaged from machines.' },
  cell:        { kg: 1.2, name: 'Power Cell', type: 'res', icon: '▮', rarity: 'rare', stack: 10, desc: 'Dense energy storage. Powers generators and turrets.' },
  core:        { kg: 2.5, name: 'Machine Core', type: 'res', icon: '◆', rarity: 'epic', stack: 5, desc: 'The pulsing brain of a machine. Extremely valuable.' },
  // ---- ammo
  a9:   { kg: 0.012, name: '9×19mm', type: 'ammo', icon: '⁞', rarity: 'common', stack: 120, desc: 'Pistol / SMG ammunition.' },
  a556: { kg: 0.012, name: '5.56×45mm', type: 'ammo', icon: '⁞', rarity: 'common', stack: 120, desc: 'Intermediate rifle cartridge.' },
  a762: { kg: 0.025, name: '7.62×51mm', type: 'ammo', icon: '⁞', rarity: 'uncommon', stack: 60, desc: 'Full-power rifle cartridge.' },
  a12:  { kg: 0.045, name: '12 Gauge Buck', type: 'ammo', icon: '⁞', rarity: 'common', stack: 40, desc: '00 buckshot shells.' },
  a76239: { kg: 0.016, name: '7.62×39mm', type: 'ammo', icon: '⁞', rarity: 'common', stack: 120, desc: 'Soviet intermediate cartridge (AKM).' },
  a545: { kg: 0.011, name: '5.45×39mm', type: 'ammo', icon: '⁞', rarity: 'common', stack: 120, desc: 'Small-calibre high-velocity cartridge (AK-74).' },
  a45:  { kg: 0.021, name: '.45 ACP', type: 'ammo', icon: '⁞', rarity: 'common', stack: 100, desc: 'Heavy subsonic pistol round (M1911, UMP-45).' },
  a50:  { kg: 0.03, name: '.50 AE', type: 'ammo', icon: '⁞', rarity: 'rare', stack: 40, desc: 'Magnum handgun cartridge (Desert Eagle).' },
  a762r: { kg: 0.022, name: '7.62×54mmR', type: 'ammo', icon: '⁞', rarity: 'uncommon', stack: 60, desc: 'Rimmed full-power cartridge (SVD).' },
  // ---- consumables
  bandage: { kg: 0.05, name: 'Bandage', type: 'med', icon: '✚', rarity: 'common', stack: 5, heal: 20, time: 2.2, desc: 'Restores 20 HP.' },
  medkit:  { kg: 0.6, name: 'Trauma Kit', type: 'med', icon: '✚', rarity: 'uncommon', stack: 3, heal: 65, time: 4.5, desc: 'Restores 65 HP.' },
  stim:    { kg: 0.1, name: 'Adrenal Stim', type: 'med', icon: '⚡', rarity: 'rare', stack: 3, heal: 35, time: 1.0, stamina: 12, desc: 'Restores 35 HP instantly and gives unlimited stamina for 12s.' },
  plate:   { kg: 2.5, name: 'Armor Plate', type: 'plate', icon: '▰', rarity: 'uncommon', stack: 4, time: 2.5, desc: 'Restores 50 armor to your vest.' },
  // ---- gear
  vest1: { kg: 3.0, name: 'Light Carrier', type: 'vest', icon: '⛨', rarity: 'common', armor: 50, desc: 'Soft armor carrier. 50 armor.' },
  vest2: { kg: 8.5, name: 'Plate Carrier', type: 'vest', icon: '⛨', rarity: 'uncommon', armor: 100, desc: 'Steel plates front and back. 100 armor.' },
  vest3: { kg: 11.0, name: 'Assault Rig', type: 'vest', icon: '⛨', rarity: 'rare', armor: 150, desc: 'Ceramic plates with side armor. 150 armor.' },
  pack1: { kg: 0.6, name: 'Sling Bag', type: 'pack', icon: '⛁', rarity: 'common', slots: 12, desc: '12 backpack slots.' },
  pack2: { kg: 1.4, name: 'Field Pack', type: 'pack', icon: '⛁', rarity: 'uncommon', slots: 18, desc: '18 backpack slots.' },
  pack3: { kg: 2.6, name: 'Hauler Frame', type: 'pack', icon: '⛁', rarity: 'rare', slots: 26, desc: '26 backpack slots.' },
};

// ---------- weapons
// recoil: degrees of muzzle climb per shot; spread: degrees hipfire; rpm; damage per bullet; range: metres of full damage
export const WEAPONS = {
  // id (kept stable for saves) -> real-world firearm. kg = unloaded weight.
  p9:  { name: 'Glock 17', short: 'G17', cls: 'Pistol', ammo: 'a9', mag: 17, rpm: 450, auto: false, damage: 24, pellets: 1, range: 40, recoil: 1.6, hrecoil: 0.5, spread: 1.6, ads: 0.14, reload: 1.7, speed: 1.0, rarity: 'common', kg: 0.71, anim: 'pistol',
    slots: ['optic', 'muzzle', 'magazine', 'tactical'], desc: 'Austrian polymer-framed, striker-fired 9mm service pistol. 17-round double-stack magazine.' },
  m1911: { name: 'Colt M1911A1', short: 'M1911', cls: 'Pistol', ammo: 'a45', mag: 7, rpm: 380, auto: false, damage: 34, pellets: 1, range: 35, recoil: 2.3, hrecoil: 0.6, spread: 1.8, ads: 0.15, reload: 1.8, speed: 1.0, rarity: 'common', kg: 1.1, anim: 'pistol',
    slots: ['muzzle', 'tactical'], desc: 'All-steel single-action .45 ACP. Over a century of service.' },
  deagle: { name: 'Desert Eagle Mk XIX', short: 'DEAGLE', cls: 'Pistol', ammo: 'a50', mag: 7, rpm: 220, auto: false, damage: 62, pellets: 1, range: 45, recoil: 5.5, hrecoil: 1.4, spread: 2.4, ads: 0.2, reload: 2.1, speed: 0.98, rarity: 'rare', kg: 2.0, anim: 'pistol',
    slots: ['optic', 'tactical'], desc: 'Gas-operated .50 AE magnum pistol with a rotating bolt. Brutal recoil.' },
  vx:  { name: 'SIG MPX', short: 'MPX', cls: 'SMG', ammo: 'a9', mag: 30, rpm: 850, auto: true, damage: 21, pellets: 1, range: 45, recoil: 0.85, hrecoil: 0.45, spread: 2.0, ads: 0.17, reload: 2.1, speed: 0.98, rarity: 'uncommon', kg: 2.7, anim: 'rifle',
    slots: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock', 'tactical'], desc: 'Closed, rotating-bolt 9mm SMG with an AR-style manual of arms.' },
  mp5: { name: 'H&K MP5A3', short: 'MP5', cls: 'SMG', ammo: 'a9', mag: 30, rpm: 800, auto: true, damage: 22, pellets: 1, range: 45, recoil: 0.7, hrecoil: 0.4, spread: 1.8, ads: 0.17, reload: 2.3, speed: 0.98, rarity: 'uncommon', kg: 2.5, anim: 'hk',
    slots: ['optic', 'muzzle', 'underbarrel', 'magazine', 'tactical'], desc: 'Roller-delayed blowback 9mm SMG with a collapsing stock. Famously smooth.' },
  ump: { name: 'H&K UMP45', short: 'UMP45', cls: 'SMG', ammo: 'a45', mag: 25, rpm: 600, auto: true, damage: 29, pellets: 1, range: 40, recoil: 1.0, hrecoil: 0.55, spread: 2.1, ads: 0.18, reload: 2.2, speed: 0.98, rarity: 'uncommon', kg: 2.3, anim: 'hk',
    slots: ['optic', 'muzzle', 'underbarrel', 'magazine', 'tactical'], desc: 'Polymer .45 ACP SMG with a slow, controllable cyclic rate.' },
  ar:  { name: 'Colt M4A1', short: 'M4A1', cls: 'Assault Rifle', ammo: 'a556', mag: 30, rpm: 800, auto: true, damage: 31, pellets: 1, range: 90, recoil: 1.15, hrecoil: 0.55, spread: 2.4, ads: 0.22, reload: 2.4, speed: 0.95, rarity: 'uncommon', kg: 2.9, anim: 'rifle',
    slots: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock', 'tactical'], desc: 'Direct-impingement 5.56 carbine, 14.5" barrel, free-float M-LOK rail.' },
  akm: { name: 'AKM', short: 'AKM', cls: 'Assault Rifle', ammo: 'a76239', mag: 30, rpm: 600, auto: true, damage: 36, pellets: 1, range: 80, recoil: 1.55, hrecoil: 0.75, spread: 2.6, ads: 0.24, reload: 2.6, speed: 0.95, rarity: 'uncommon', kg: 3.1, anim: 'ak',
    slots: ['optic', 'muzzle', 'underbarrel', 'magazine', 'tactical'], desc: 'Stamped-receiver long-stroke piston rifle in 7.62×39. Wood furniture, slant brake.' },
  ak74: { name: 'AK-74M', short: 'AK-74M', cls: 'Assault Rifle', ammo: 'a545', mag: 30, rpm: 650, auto: true, damage: 30, pellets: 1, range: 95, recoil: 0.95, hrecoil: 0.5, spread: 2.3, ads: 0.24, reload: 2.6, speed: 0.95, rarity: 'uncommon', kg: 3.4, anim: 'ak',
    slots: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock', 'tactical'], desc: '5.45×39 AK with plum polymer furniture, side-folding stock and a big muzzle brake.' },
  br:  { name: 'H&K HK417', short: 'HK417', cls: 'Battle Rifle', ammo: 'a762', mag: 20, rpm: 600, auto: true, damage: 46, pellets: 1, range: 120, recoil: 2.0, hrecoil: 0.8, spread: 2.8, ads: 0.26, reload: 2.7, speed: 0.92, rarity: 'rare', kg: 4.4, anim: 'rifle',
    slots: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock', 'tactical'], desc: 'Short-stroke piston 7.62×51 battle rifle. Hits hard, kicks hard.' },
  m249: { name: 'FN M249 SAW', short: 'M249', cls: 'LMG', ammo: 'a556', mag: 100, rpm: 750, auto: true, damage: 30, pellets: 1, range: 100, recoil: 0.95, hrecoil: 0.75, spread: 3.4, ads: 0.4, reload: 5.2, speed: 0.86, rarity: 'epic', kg: 7.5, anim: 'lmg',
    slots: ['optic', 'underbarrel', 'tactical'], desc: 'Open-bolt belt-fed light machine gun with a 100-round soft pouch.' },
  dmr: { name: 'M14 EBR', short: 'M14 EBR', cls: 'DMR', ammo: 'a762', mag: 10, rpm: 300, auto: false, damage: 72, pellets: 1, range: 200, recoil: 3.0, hrecoil: 0.6, spread: 3.5, ads: 0.3, reload: 2.9, speed: 0.9, rarity: 'rare', kg: 5.1, anim: 'rifle',
    slots: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock', 'tactical'], desc: 'M14 action in an aluminium Enhanced Battle Rifle chassis.' },
  svd: { name: 'SVD Dragunov', short: 'SVD', cls: 'DMR', ammo: 'a762r', mag: 10, rpm: 280, auto: false, damage: 78, pellets: 1, range: 220, recoil: 3.2, hrecoil: 0.7, spread: 3.6, ads: 0.32, reload: 3.0, speed: 0.9, rarity: 'rare', kg: 4.3, anim: 'ak',
    slots: ['optic', 'muzzle', 'tactical'], desc: 'Short-stroke piston 7.62×54R marksman rifle with a skeleton thumbhole stock.' },
  m24: { name: 'Remington M24 SWS', short: 'M24', cls: 'Sniper', ammo: 'a762', mag: 5, rpm: 50, auto: false, bolt: true, damage: 118, pellets: 1, range: 300, recoil: 4.2, hrecoil: 0.6, spread: 5, ads: 0.34, reload: 3.2, speed: 0.9, rarity: 'epic', kg: 5.4, anim: 'bolt',
    slots: ['optic', 'muzzle', 'tactical'], desc: 'Remington 700 long-action bolt rifle in a fibreglass stock. One shot, one kill.' },
  sg:  { name: 'Remington 870', short: '870', cls: 'Shotgun', ammo: 'a12', mag: 7, rpm: 75, auto: false, pump: true, damage: 14, pellets: 9, range: 18, recoil: 4.5, hrecoil: 1.0, spread: 4.5, pelletSpread: 3.6, ads: 0.22, reload: 0.55, perShell: true, speed: 0.94, rarity: 'uncommon', kg: 3.6, anim: 'pump',
    slots: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock', 'tactical'], desc: 'Pump-action 12 gauge with tube magazine and shell side-saddle.' },
};

// ---------- attachments. Multipliers apply to the weapon stats.
export const MODS = {
  // optics
  iron:     { slot: 'optic', name: 'Iron Sights', builtin: true, zoom: 1.1 },
  reddot: { kg: 0.12, slot: 'optic', name: 'MRS Red Dot', zoom: 1.25, ads: 0.95, rarity: 'common', desc: 'Low-profile reflex sight on a 1/3 co-witness riser.' },
  holo: { kg: 0.32, slot: 'optic', name: 'HX-2 Holographic', zoom: 1.3, ads: 1.0, rarity: 'uncommon', desc: 'Box-style holographic sight with 68 MOA ring.' },
  prism: { kg: 0.45, slot: 'optic', name: 'P4 Prism 4×', zoom: 3.0, ads: 1.15, scope: true, rarity: 'rare', desc: 'Compact 4× prism optic with etched chevron reticle.' },
  scope6: { kg: 0.95, slot: 'optic', name: 'LR 2.5-10× Scope', zoom: 6.0, ads: 1.3, scope: true, rarity: 'epic', desc: '34mm tube variable-power scope in a cantilever mount.', only: ['dmr', 'br', 'ar', 'svd', 'm24', 'ak74', 'akm', 'm249'] },
  // muzzle
  none_muz: { slot: 'muzzle', name: 'Bare Crown', builtin: true },
  comp: { kg: 0.15, slot: 'muzzle', name: 'Linear Compensator', recoil: 0.82, hrecoil: 0.8, loud: 1.2, rarity: 'common', desc: 'Ported compensator. Reduces climb.' },
  brake: { kg: 0.22, slot: 'muzzle', name: 'Tri-Port Muzzle Brake', recoil: 0.75, hrecoil: 0.75, loud: 1.4, rarity: 'uncommon', desc: 'Aggressive three-chamber brake. Big flash, little kick.' },
  supp: { kg: 0.55, slot: 'muzzle', name: 'Titan Suppressor', recoil: 0.9, damage: 0.95, range: 1.15, loud: 0.25, flash: 0.1, ads: 1.05, rarity: 'rare', desc: 'Baffled titanium can. Machines struggle to locate suppressed fire.' },
  // underbarrel
  none_ub:  { slot: 'underbarrel', name: 'None', builtin: true },
  vgrip: { kg: 0.12, slot: 'underbarrel', name: 'Vertical Foregrip', recoil: 0.85, rarity: 'common', desc: 'Reduces vertical recoil.' },
  agrip: { kg: 0.1, slot: 'underbarrel', name: 'Angled Grip', ads: 0.85, hrecoil: 0.85, rarity: 'uncommon', desc: 'Faster aim-down-sights, steadier sideways.' },
  stop: { kg: 0.05, slot: 'underbarrel', name: 'Hand Stop', hrecoil: 0.8, spread: 0.9, rarity: 'common', desc: 'Index point for a C-clamp grip.' },
  // magazine
  std_mag:  { slot: 'magazine', name: 'Standard Magazine', builtin: true },
  ext_mag: { kg: 0.16, slot: 'magazine', name: 'Extended Magazine', mag: 1.5, reload: 1.12, ads: 1.05, rarity: 'uncommon', desc: '+50% capacity.' },
  drum: { kg: 0.9, slot: 'magazine', name: 'Drum Magazine', mag: 2.5, reload: 1.4, ads: 1.15, speed: 0.95, rarity: 'rare', desc: '+150% capacity, heavy and slow to reload.', only: ['vx', 'ar', 'akm', 'ak74', 'mp5'] },
  fast_mag: { kg: 0.25, slot: 'magazine', name: 'Coupled Fast Mag', reload: 0.7, rarity: 'uncommon', desc: 'Reloads 30% faster.' },
  // stock
  std_stock:{ slot: 'stock', name: 'Standard Stock', builtin: true },
  heavy_stock: { kg: 0.6, slot: 'stock', name: 'Precision Stock', recoil: 0.8, ads: 1.1, speed: 0.97, rarity: 'uncommon', desc: 'Adjustable cheek riser and buttpad. Tames recoil.' },
  light_stock: { kg: 0.18, slot: 'stock', name: 'Skeleton Stock', recoil: 1.1, ads: 0.85, speed: 1.04, rarity: 'common', desc: 'Lightweight. Faster handling, more kick.' },
  // tactical
  none_tac: { slot: 'tactical', name: 'None', builtin: true },
  laser: { kg: 0.2, slot: 'tactical', name: 'PEQ Laser Module', spread: 0.65, rarity: 'uncommon', laser: true, desc: 'Visible laser tightens hipfire spread by 35%.' },
  light: { kg: 0.18, slot: 'tactical', name: 'Weapon Light 1000lm', spread: 0.9, rarity: 'common', light: true, desc: 'Press L to toggle. Lights dark interiors.' },
};
export const DEFAULT_MODS = { optic: 'iron', muzzle: 'none_muz', underbarrel: 'none_ub', magazine: 'std_mag', stock: 'std_stock', tactical: 'none_tac' };

export function weaponStats(w) {
  const base = WEAPONS[w.id]; const s = { ...base };
  for (const slot of base.slots) {
    const m = MODS[w.mods?.[slot] || DEFAULT_MODS[slot]]; if (!m) continue;
    for (const k of ['recoil', 'hrecoil', 'spread', 'ads', 'reload', 'damage', 'range', 'speed']) if (m[k]) s[k] *= m[k];
    if (m.mag) s.mag = Math.round(base.mag * m.mag);
    if (m.zoom) s.zoom = m.zoom;
    if (m.scope) s.scope = true;
    if (m.loud !== undefined) s.loud = m.loud;
    if (m.flash !== undefined) s.flash = m.flash;
    if (m.laser) s.laser = true;
    if (m.light) s.light = true;
  }
  s.zoom ??= 1.1; s.loud ??= 1; s.flash ??= 1;
  s.kg = base.kg; for (const slot of base.slots) s.kg += MODS[w.mods?.[slot] || DEFAULT_MODS[slot]]?.kg || 0;
  return s;
}
export function modFits(modId, weaponId) { const m = MODS[modId]; return m && WEAPONS[weaponId].slots.includes(m.slot) && (!m.only || m.only.includes(weaponId)); }

// ---------- crafting (at base benches). station + level gate
export const RECIPES = [
  // weapons (workbench)
  { out: { weapon: 'p9' }, cost: { scrap: 8, polymer: 4 }, station: 'workbench', lvl: 1 },
  { out: { weapon: 'vx' }, cost: { scrap: 18, polymer: 8, electronics: 2 }, station: 'workbench', lvl: 1 },
  { out: { weapon: 'sg' }, cost: { scrap: 20, wood: 6, polymer: 4 }, station: 'workbench', lvl: 1 },
  { out: { weapon: 'ar' }, cost: { scrap: 28, polymer: 10, alloy: 2, electronics: 2 }, station: 'workbench', lvl: 2 },
  { out: { weapon: 'br' }, cost: { scrap: 34, polymer: 8, alloy: 5, servo: 1 }, station: 'workbench', lvl: 2 },
  { out: { weapon: 'dmr' }, cost: { scrap: 30, polymer: 10, alloy: 6, glass: 2, servo: 2 }, station: 'workbench', lvl: 3 },
  { out: { weapon: 'm1911' }, cost: { scrap: 10, wood: 2 }, station: 'workbench', lvl: 1 },
  { out: { weapon: 'mp5' }, cost: { scrap: 20, polymer: 8, electronics: 1 }, station: 'workbench', lvl: 1 },
  { out: { weapon: 'akm' }, cost: { scrap: 24, wood: 8, polymer: 2 }, station: 'workbench', lvl: 1 },
  { out: { weapon: 'ump' }, cost: { scrap: 18, polymer: 12 }, station: 'workbench', lvl: 2 },
  { out: { weapon: 'ak74' }, cost: { scrap: 28, polymer: 10, alloy: 2 }, station: 'workbench', lvl: 2 },
  { out: { weapon: 'deagle' }, cost: { scrap: 18, alloy: 4, polymer: 2 }, station: 'workbench', lvl: 2 },
  { out: { weapon: 'svd' }, cost: { scrap: 30, wood: 6, alloy: 5, glass: 2 }, station: 'workbench', lvl: 3 },
  { out: { weapon: 'm24' }, cost: { scrap: 30, polymer: 10, alloy: 6, glass: 3, servo: 1 }, station: 'workbench', lvl: 3 },
  { out: { weapon: 'm249' }, cost: { scrap: 45, polymer: 12, alloy: 8, servo: 2 }, station: 'workbench', lvl: 3 },
  // ammo (workbench)
  { out: { item: 'a76239', n: 60 }, cost: { scrap: 4, chemicals: 3 }, station: 'workbench', lvl: 1 },
  { out: { item: 'a545', n: 60 }, cost: { scrap: 4, chemicals: 3 }, station: 'workbench', lvl: 1 },
  { out: { item: 'a45', n: 50 }, cost: { scrap: 4, chemicals: 2 }, station: 'workbench', lvl: 1 },
  { out: { item: 'a50', n: 21 }, cost: { scrap: 5, chemicals: 4 }, station: 'workbench', lvl: 2 },
  { out: { item: 'a762r', n: 30 }, cost: { scrap: 5, chemicals: 3 }, station: 'workbench', lvl: 2 },
  { out: { item: 'a9', n: 60 }, cost: { scrap: 3, chemicals: 2 }, station: 'workbench', lvl: 1 },
  { out: { item: 'a556', n: 60 }, cost: { scrap: 4, chemicals: 3 }, station: 'workbench', lvl: 1 },
  { out: { item: 'a762', n: 30 }, cost: { scrap: 5, chemicals: 3 }, station: 'workbench', lvl: 2 },
  { out: { item: 'a12', n: 20 }, cost: { scrap: 3, chemicals: 2, polymer: 1 }, station: 'workbench', lvl: 1 },
  // gear (workbench)
  { out: { item: 'vest1' }, cost: { fabric: 10, polymer: 4 }, station: 'workbench', lvl: 1 },
  { out: { item: 'vest2' }, cost: { fabric: 12, scrap: 16, alloy: 2 }, station: 'workbench', lvl: 2 },
  { out: { item: 'vest3' }, cost: { fabric: 14, alloy: 8, polymer: 8 }, station: 'workbench', lvl: 3 },
  { out: { item: 'pack2' }, cost: { fabric: 14, polymer: 4 }, station: 'workbench', lvl: 1 },
  { out: { item: 'pack3' }, cost: { fabric: 22, scrap: 10, alloy: 3 }, station: 'workbench', lvl: 2 },
  { out: { item: 'plate', n: 2 }, cost: { scrap: 6, fabric: 2 }, station: 'workbench', lvl: 1 },
  // meds (med station)
  { out: { item: 'bandage', n: 3 }, cost: { fabric: 3 }, station: 'medbay', lvl: 1 },
  { out: { item: 'medkit' }, cost: { fabric: 3, chemicals: 3 }, station: 'medbay', lvl: 1 },
  { out: { item: 'stim' }, cost: { chemicals: 5, electronics: 1 }, station: 'medbay', lvl: 1 },
  // attachments (gunsmith)
  { out: { mod: 'reddot' }, cost: { electronics: 2, glass: 1, scrap: 3 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'holo' }, cost: { electronics: 3, glass: 2, scrap: 4 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'prism' }, cost: { electronics: 3, glass: 4, alloy: 2 }, station: 'gunsmith', lvl: 2 },
  { out: { mod: 'scope6' }, cost: { electronics: 4, glass: 6, alloy: 4, servo: 1 }, station: 'gunsmith', lvl: 2 },
  { out: { mod: 'comp' }, cost: { scrap: 6 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'brake' }, cost: { scrap: 8, alloy: 1 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'supp' }, cost: { scrap: 10, alloy: 4, chemicals: 2 }, station: 'gunsmith', lvl: 2 },
  { out: { mod: 'vgrip' }, cost: { polymer: 4 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'agrip' }, cost: { polymer: 5 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'stop' }, cost: { polymer: 3 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'ext_mag' }, cost: { scrap: 6, polymer: 4 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'fast_mag' }, cost: { scrap: 6, polymer: 6 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'drum' }, cost: { scrap: 12, polymer: 6, servo: 1 }, station: 'gunsmith', lvl: 2 },
  { out: { mod: 'heavy_stock' }, cost: { polymer: 8, scrap: 4 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'light_stock' }, cost: { scrap: 6 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'laser' }, cost: { electronics: 3, glass: 1 }, station: 'gunsmith', lvl: 1 },
  { out: { mod: 'light' }, cost: { electronics: 2, glass: 1 }, station: 'gunsmith', lvl: 1 },
];

// ---------- base building pieces. grid = 4m cells, 3m storeys
export const PIECES = {
  foundation: { name: 'Concrete Foundation', cost: { scrap: 4 }, kind: 'foundation', desc: '4×4m slab. Everything else snaps to it.' },
  floor:      { name: 'Steel Floor', cost: { scrap: 6 }, kind: 'floor', desc: 'Upper storey floor / roof.' },
  wall:       { name: 'Reinforced Wall', cost: { scrap: 5, wood: 2 }, kind: 'wall', desc: 'Concrete block wall.' },
  window:     { name: 'Window Wall', cost: { scrap: 5, wood: 2 }, kind: 'wall', desc: 'Wall with an embrasure window.' },
  doorway:    { name: 'Doorway', cost: { scrap: 4, wood: 2 }, kind: 'wall', desc: 'Wall with an open doorway.' },
  ramp:       { name: 'Steel Stairs', cost: { scrap: 6, wood: 2 }, kind: 'ramp', desc: 'Stairs up one storey.' },
  sandbags:   { name: 'Sandbag Wall', cost: { fabric: 4 }, kind: 'prop', desc: 'Curved sandbag emplacement.' },
  crate:      { name: 'Storage Locker', cost: { scrap: 8, polymer: 2 }, kind: 'prop', desc: '+20 stash slots each.', stash: 20 },
  workbench:  { name: 'Workbench', cost: { scrap: 10, wood: 6 }, kind: 'station', station: 'workbench', desc: 'Craft weapons, ammo and gear. Build more to raise its level (max 3).' },
  gunsmith:   { name: 'Gunsmith Bench', cost: { scrap: 12, electronics: 4, glass: 2 }, kind: 'station', station: 'gunsmith', desc: 'Craft and fit weapon attachments. Build two for level 2.' },
  medbay:     { name: 'Med Station', cost: { scrap: 8, fabric: 6, chemicals: 4 }, kind: 'station', station: 'medbay', desc: 'Craft bandages, trauma kits and stims.' },
  generator:  { name: 'Generator', cost: { scrap: 14, electronics: 6, cell: 1 }, kind: 'prop', desc: 'Powers floodlights. Hums reassuringly.' },
  floodlight: { name: 'Floodlight Tower', cost: { scrap: 6, electronics: 2 }, kind: 'prop', desc: 'Bright lamp on a steel mast.' },
  turret:     { name: 'Sentry Turret', cost: { scrap: 16, electronics: 6, servo: 2, core: 1 }, kind: 'prop', desc: 'Trophy: a captured machine turret, rewired and repainted.' },
  flag:       { name: 'Crew Banner', cost: { fabric: 6, wood: 2 }, kind: 'prop', desc: 'Fly your colours.' },
  barrel:     { name: 'Fire Barrel', cost: { scrap: 3, wood: 3 }, kind: 'prop', desc: 'A warm glow for long nights.' },
};
export const PIECE_ORDER = ['foundation', 'wall', 'doorway', 'window', 'floor', 'ramp', 'workbench', 'gunsmith', 'medbay', 'crate', 'generator', 'floodlight', 'sandbags', 'barrel', 'flag', 'turret'];

// what a loot container / node can roll
export const LOOT_TABLES = {
  crate:   [['scrap', 4, 9, 10], ['polymer', 2, 5, 6], ['a556', 15, 40, 5], ['a9', 15, 40, 5], ['a76239', 15, 40, 4], ['a545', 15, 40, 3], ['a45', 10, 30, 3], ['a12', 6, 14, 3], ['a762', 8, 20, 3], ['plate', 1, 1, 3], ['electronics', 1, 3, 4], ['alloy', 1, 2, 2], ['mod', 1, 1, 2]],
  locker:  [['fabric', 3, 7, 8], ['bandage', 1, 2, 6], ['polymer', 2, 4, 5], ['a9', 15, 30, 5], ['medkit', 1, 1, 2], ['vest1', 1, 1, 1], ['pack2', 1, 1, 1], ['glass', 1, 2, 2]],
  toolbox: [['scrap', 3, 7, 8], ['electronics', 1, 3, 6], ['servo', 1, 1, 1], ['chemicals', 1, 3, 4], ['mod', 1, 1, 1]],
  medbox:  [['bandage', 1, 3, 8], ['medkit', 1, 2, 5], ['stim', 1, 1, 2], ['chemicals', 2, 4, 5]],
  car:     [['scrap', 5, 10, 8], ['polymer', 2, 6, 6], ['fabric', 2, 5, 5], ['electronics', 1, 2, 4], ['a9', 10, 25, 3], ['chemicals', 1, 3, 3]],
  safe:    [['core', 1, 1, 2], ['cell', 1, 2, 4], ['alloy', 2, 4, 5], ['mod', 1, 1, 5], ['stim', 1, 2, 3], ['vest3', 1, 1, 1], ['pack3', 1, 1, 1]],
  weapons: [['weapon', 1, 1, 6], ['mod', 1, 1, 6], ['a556', 30, 60, 4], ['a762', 20, 40, 3], ['a762r', 10, 30, 2], ['a50', 7, 14, 1], ['plate', 1, 2, 3]],
  // salvage nodes (hold E to strip)
  n_scrap: [['scrap', 6, 12, 10], ['alloy', 1, 1, 1]],
  n_elec:  [['electronics', 2, 5, 10], ['glass', 1, 2, 3], ['cell', 1, 1, 1]],
  n_chem:  [['chemicals', 3, 6, 10]],
  n_wood:  [['wood', 6, 12, 10]],
  n_fabric:[['fabric', 4, 9, 10], ['polymer', 2, 4, 4]],
  // machine drops
  m_drone:   [['scrap', 2, 4, 6], ['electronics', 1, 3, 6], ['glass', 1, 1, 2], ['cell', 1, 1, 1]],
  m_crawler: [['scrap', 3, 6, 6], ['servo', 1, 1, 3], ['electronics', 1, 2, 4], ['alloy', 1, 2, 3]],
  m_strider: [['alloy', 3, 6, 6], ['servo', 1, 3, 6], ['core', 1, 1, 5], ['cell', 1, 2, 4]],
  m_raider:  [['a556', 10, 30, 5], ['a9', 15, 30, 5], ['a76239', 10, 30, 4], ['bandage', 1, 2, 4], ['fabric', 1, 3, 3], ['plate', 1, 1, 2], ['scrap', 2, 5, 3]],
};

// ---------- weight (kg) of a single inventory entry
export const BODY_KG = 6.5; // helmet, boots, clothing, radio
export function entryKg(e) {
  if (!e) return 0;
  if (e.weapon) return weaponStats(e.weapon).kg;
  if (e.mod) return MODS[e.mod]?.kg || 0.1;
  return (ITEMS[e.id]?.kg || 0.1) * (e.n || 1);
}
// encumbrance bands drive speed, stamina, jump height and weapon sway
export function encumbrance(kg) {
  const over = Math.max(0, kg - 18);
  return { kg, speed: Math.max(0.55, 1 - over / 70), stamina: 1 + over / 28, jump: Math.max(0.6, 1 - over / 90), sway: 1 + over / 25, noSprint: kg > 48,
    band: kg < 18 ? 'Light' : kg < 30 ? 'Medium' : kg < 42 ? 'Heavy' : kg <= 48 ? 'Very heavy' : 'Overloaded' };
}
