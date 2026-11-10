// Dropzone — game orchestration: profile/stash, Haven base & construction, helicopter insertion, raids, vehicles,
// adaptive AI, multiplayer sessions and extraction.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Input, Player } from './player.js';
import { UI } from './ui.js';
import { Effects } from './effects.js';
import { audio } from './audio.js';
import { buildHotzone, DROP_ZONES, MAP_SIZE } from './hotzone.js';
import { buildBase, PLOT } from './base.js';
import { Director } from './ai.js';
import { Net } from './net.js';
import { makeHeli, HeliFlight } from './heli.js';
import { Ballistics } from './ballistics.js';
import { Vehicle, VEHICLES, ENTER_RANGE } from './vehicles.js';
import { resetEnemyIds, TYPE_BY_CODE, SHOT_KINDS } from './enemies.js';
import { LootContainer, Pack, rollLoot, entryName, CONTAINER_INFO } from './loot.js';
import { Drone, Crawler, Strider, Sentinel, Raider } from './enemies.js';
import { gunSound } from './player.js';
import { buildGun } from './guns.js';
import { ITEMS, WEAPONS, MODS, PIECES, PIECE_ORDER, DEFAULT_MODS, entryKg } from './items.js';
import { worldMats } from './props.js';
import { boxGeo, cylGeo } from './geom.js';
import { seeded } from './noise.js';

const SAVE_KEY = 'dropzone.save.v1', SET_KEY = 'dropzone.settings.v1';
const RAID_TIME = 25 * 60;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };

function newProfile() {
  return {
    v: 1, uid: 10,
    stash: { items: { scrap: 40, wood: 16, fabric: 10, polymer: 8, electronics: 2, chemicals: 4, a9: 120, a12: 20, bandage: 3 }, weapons: [{ uid: 1, id: 'vx', mods: {} }, { uid: 2, id: 'p9', mods: {} }, { uid: 3, id: 'sg', mods: {} }], mods: { reddot: 1, vgrip: 1 } },
    loadout: { primary: 1, secondary: 2, vest: 'vest1', pack: 'pack1', armor: 50 },
    backpack: [{ id: 'a9', n: 120 }, { id: 'bandage', n: 3 }, { id: 'plate', n: 1 }],
    base: [
      ...[[6, 3], [7, 3], [6, 4], [7, 4]].map(([cx, cz]) => ({ type: 'foundation', cx, cz, level: 0, edge: 0, rot: 0 })),
      { type: 'wall', cx: 6, cz: 3, level: 0, edge: 0, rot: 0 }, { type: 'window', cx: 7, cz: 3, level: 0, edge: 0, rot: 0 },
      { type: 'wall', cx: 7, cz: 3, level: 0, edge: 1, rot: 0 }, { type: 'doorway', cx: 7, cz: 4, level: 0, edge: 1, rot: 0 },
      { type: 'workbench', cx: 6, cz: 3, level: 0, edge: 0, rot: 2 }, { type: 'medbay', cx: 7, cz: 3, level: 0, edge: 0, rot: 2 }, { type: 'barrel', cx: 5, cz: 5, level: 0, edge: 0, rot: 0 },
    ],
    stats: { raids: 0, extracts: 0, deaths: 0, kills: 0 },
  };
}

class Game {
  constructor() {
    this.engine = new Engine(document.getElementById('game'));
    this.scene = this.engine.scene; this.engine.attach();
    this.input = new Input(this.engine.renderer.domElement);
    this.ui = new UI(this);
    this.settings = { sens: 1, vol: 0.7, quality: 'high', fov: 72, view: 'third', ...(store.get(SET_KEY) || {}) };
    this.engine.baseFov = this.settings.fov; audio.setVolume(this.settings.vol); if (this.settings.quality !== 'high') this.engine.setQuality(this.settings.quality);
    this.mode = 'menu'; this.time = 0; this.enemies = []; this.rockets = []; this.raidLoot = []; this.shakeAmt = 0; this.vehicles = []; this.containers = []; this.myParked = new Set();
    this.ai = new Director(this); this.net = new Net(this); this.audio = audio; this.ballistics = new Ballistics(this);
    this.scene.add(this.engine.camera);
    this.engine.renderer.domElement.addEventListener('click', () => { if (!this.ui.isOpen() && this.mode !== 'menu') { audio.init(); this.input.lock(); } });
  }
  async boot() {
    const step = (p, t) => new Promise((r) => { this.ui.loading(p, t); setTimeout(r, 30); });
    const netReady = this.net.init().catch((e) => console.warn('net', e));
    await step(5, 'Generating materials');
    worldMats();
    await step(25, 'Building Haven');
    this.base = buildBase(this.scene); this.base.root.visible = false;
    await step(50, 'Building the Ashgrove hotzone');
    this.hot = buildHotzone(this.scene); this.hot.root.visible = false;
    await step(85, 'Surveying the map');
    this.mapImage = this.makeMapImage(this.hot);
    this.fx = new Effects(this.scene, null);
    this.player = new Player(this); this.player.op.root.visible = false;
    this.heliModel = makeHeli(); this.heliModel.visible = false; this.scene.add(this.heliModel);
    this.baseHeli = makeHeli(); this.base.root.add(this.baseHeli); this.baseHeli.position.set(24, 0, -24); this.baseHeli.rotation.y = -2.4;
    this.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]), new THREE.LineBasicMaterial({ color: 0x2a2620 })); this.rope.visible = false; this.scene.add(this.rope);
    await step(95, 'Connecting');
    await Promise.race([netReady, new Promise((r) => setTimeout(r, 4000))]);
    await step(100, 'Ready');
    // warm up shaders by rendering both levels once
    for (const w of [this.base, this.hot]) { w.root.visible = true; this.world = w; this.engine.camera.position.set(0, 20, 30); this.engine.camera.lookAt(0, 0, 0); this.engine.render(0.016, 0); w.root.visible = false; }
    this.ui.loading(null);
    this.showMenu();
    const q = new URLSearchParams(location.search);
    if (q.get('auto')) { this.ui.hideMenu(); this.profile = store.get(SAVE_KEY) || newProfile(); this.toBase(); if (q.get('auto') !== 'base') this.startRaid(q.get('auto')); }
    let last = performance.now();
    const loop = () => { const now = performance.now(); const dt = Math.max(0.0001, Math.min(0.05, (now - last) / 1000)); last = now; try { this.frame(dt); } catch (e) { console.error(e); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  // ------------------------------------------------------------------ profile
  showMenu() { this.mode = 'menu'; this.ui.show(false); this.ui.close(); this.input.unlock(); this.setWorld(this.base, 'menu'); this.ui.menu(!!store.get(SAVE_KEY)); }
  newGame() { this.profile = newProfile(); this.save(); this.toBase(); }
  continueGame() { this.profile = store.get(SAVE_KEY) || newProfile(); this.toBase(); }
  save() { if (this.profile && this.mode !== 'raid') { this.profile.base = this.base.build.serialize(); store.set(SAVE_KEY, this.profile); } }
  saveSettings() { store.set(SET_KEY, this.settings); }
  nextUid() { return ++this.profile.uid; }
  stashCount(id) { return this.profile.stash.items[id] || 0; }
  stashAddItem(id, n) { const s = this.profile.stash.items; s[id] = (s[id] || 0) + n; if (s[id] <= 0) delete s[id]; }
  stashAdd(e) { if (e.weapon) this.profile.stash.weapons.push({ uid: this.nextUid(), id: e.weapon.id, mods: { ...(e.weapon.mods || {}) } }); else if (e.mod) this.profile.stash.mods[e.mod] = (this.profile.stash.mods[e.mod] || 0) + 1; else this.stashAddItem(e.id, e.n); }
  stashEntries() {
    const S = this.profile.stash, lo = this.profile.loadout; const out = [];
    for (const w of S.weapons) if (w.uid !== lo.primary && w.uid !== lo.secondary) out.push({ weapon: w });
    for (const [m, n] of Object.entries(S.mods)) for (let i = 0; i < n; i++) out.push({ mod: m });
    const order = Object.keys(ITEMS);
    for (const id of order) if (S.items[id] > 0) out.push({ id, n: S.items[id] });
    return out;
  }
  stashCap() { return 120 + 20 * (this.base?.build.count('crate') || 0); }
  stashUsed() { const S = this.profile.stash; let n = S.weapons.length; for (const k in S.mods) n += S.mods[k]; for (const [id, c] of Object.entries(S.items)) n += Math.ceil(c / ((ITEMS[id].stack || 1) * 5)); return n; }
  get pack() { return this._pack; }
  syncPlayerFromProfile() {
    const lo = this.profile.loadout, ws = this.profile.stash.weapons;
    const W = (uid) => { const w = ws.find((x) => x.uid === uid); return w ? { ...w } : null; };
    this._pack = new Pack(ITEMS[lo.pack || 'pack1'].slots, this.profile.backpack);
    this.player.setLoadout({ primary: W(lo.primary), secondary: W(lo.secondary), vest: lo.vest, pack: lo.pack, armor: lo.armor });
  }
  stashToPack(e, all, right) {
    const lo = this.profile.loadout;
    if (e.weapon) { if (right) { if (lo.secondary) {} lo.secondary = e.weapon.uid; } else if (!lo.primary) lo.primary = e.weapon.uid; else if (!lo.secondary) lo.secondary = e.weapon.uid; else lo.primary = e.weapon.uid; this.syncPlayerFromProfile(); this.save(); return; }
    if (e.id && ITEMS[e.id].type === 'vest') { if (lo.vest) this.stashAddItem(lo.vest, 1); lo.vest = e.id; lo.armor = ITEMS[e.id].armor; this.stashAddItem(e.id, -1); this.syncPlayerFromProfile(); this.save(); return; }
    if (e.id && ITEMS[e.id].type === 'pack') { if (this.pack.used() > ITEMS[e.id].slots) return this.ui.toast('Too many items for that pack'); if (lo.pack && lo.pack !== 'pack1') this.stashAddItem(lo.pack, 1); lo.pack = e.id; this.stashAddItem(e.id, -1); this.syncPlayerFromProfile(); this.save(); return; }
    if (e.mod) { if (this.pack.add({ mod: e.mod })) return this.ui.toast('Backpack full'); this.profile.stash.mods[e.mod]--; if (!this.profile.stash.mods[e.mod]) delete this.profile.stash.mods[e.mod]; this.save(); return; }
    const n = all ? e.n : Math.min(e.n, ITEMS[e.id].stack || 1); const left = this.pack.add({ id: e.id, n }); this.stashAddItem(e.id, -(n - left)); if (left) this.ui.toast('Backpack full'); this.save();
  }
  packToStash(i) { const e = this.pack.items.splice(i, 1)[0]; if (e) this.stashAdd(e); this.save(); }
  unequip(slot) {
    const lo = this.profile.loadout, P = this.player;
    if (this.mode === 'base') {
      if (slot === 'w0') lo.primary = null; else if (slot === 'w1') lo.secondary = null; else if (slot === 'vest' && lo.vest) { this.stashAddItem(lo.vest, 1); lo.vest = null; lo.armor = 0; } else if (slot === 'pack' && lo.pack !== 'pack1') { if (this.pack.used() > 12) return this.ui.toast('Empty the backpack first'); this.stashAddItem(lo.pack, 1); lo.pack = 'pack1'; }
      this.syncPlayerFromProfile(); this.save();
    } else if (slot[0] === 'w') { const i = +slot[1]; const w = P.weapons[i]; if (!w) return; if (this.pack.add({ weapon: { id: w.id, mods: w.mods, uid: w.uid } })) return this.ui.toast('Backpack full'); P.weapons[i] = null; if (P.slot === i) { P.slot = 1 - i; } P.equipCurrent(); }
  }
  equipFromPack(i) {
    const P = this.player, e = this.pack.items[i]; const slot = !P.weapons[0] ? 0 : !P.weapons[1] ? 1 : P.slot;
    const old = P.weapons[slot]; this.pack.items.splice(i, 1);
    if (old) this.pack.items.push({ weapon: { id: old.id, mods: old.mods, uid: old.uid } });
    P.weapons[slot] = P.makeWeapon({ ...e.weapon, mag: 0 }); P.slot = slot; P.equipCurrent();
  }
  craft(r) {
    for (const [k, n] of Object.entries(r.cost)) if (this.stashCount(k) < n) return;
    for (const [k, n] of Object.entries(r.cost)) this.stashAddItem(k, -n);
    if (r.out.weapon) this.profile.stash.weapons.push({ uid: this.nextUid(), id: r.out.weapon, mods: {} });
    else if (r.out.mod) this.stashAdd({ mod: r.out.mod }); else this.stashAddItem(r.out.item, r.out.n || 1);
    this.ui.toast('Crafted ' + (r.out.weapon ? WEAPONS[r.out.weapon].name : r.out.mod ? MODS[r.out.mod].name : ITEMS[r.out.item].name)); this.save();
  }
  fitMod(w, slot, m) {
    const cur = w.mods?.[slot] || DEFAULT_MODS[slot]; if (cur === m) return; const S = this.profile.stash.mods;
    if (!MODS[m].builtin) { if (!(S[m] > 0)) return; S[m]--; if (!S[m]) delete S[m]; }
    if (!MODS[cur].builtin) S[cur] = (S[cur] || 0) + 1;
    w.mods = { ...(w.mods || {}), [slot]: m }; this.syncPlayerFromProfile(); this.save();
  }
  // ------------------------------------------------------------------ worlds
  setWorld(W, kind) {
    for (const w of [this.base, this.hot]) w.root.visible = w === W;
    this.world = W; this.fx && (this.fx.world = W); this.fx?.clear(); this.ballistics?.clear();
    if (kind === 'hot') this.engine.setAtmosphere({ elevation: 24, azimuth: 235, fog: 0xa8aea8, fogDensity: 0.0034, exposure: 0.85, turbidity: 7 });
    else this.engine.setAtmosphere({ elevation: 9, azimuth: 250, fog: 0xc0a088, fogDensity: 0.004, exposure: 0.95, turbidity: 9 });
  }
  toBase() {
    this.cleanupRaid(); this.mode = 'base'; this.setWorld(this.base, 'base'); this.ui.hideMenu(); this.ui.show(true);
    this.base.build.load(this.profile.base); this.syncPlayerFromProfile();
    const P = this.player; P.hp = P.maxHp; P.spawn(this.base.spawn, this.base.spawnYaw); P.fp = this.settings.view === 'first'; P.op.root.visible = true; P.reattach(this.scene); P.vehicle = null; P.seat = null; P.hidden = false;
    this.build = { active: false, sel: 0, rot: 0 }; document.getElementById('hud').classList.remove('building'); this.ui.buildBar(null); this.base.build.showGhost(null); this.ui.setRaidInfo('Haven', null, '');
    this.ui.setHint('<b>HAVEN</b> · Your house is right in front of you: walk in, go upstairs, check the armory wall. The Humvee in the carport drives (E).<br>Tab: loadout & stash · B: build · V: first/third person · E: interact. Use the <b>Flight Ops Console</b> in the hangar to fly into the hotzone. Check the <b>Threat Intel</b> terminal to see what the enemy has learned about you.');
    this.setupHome(); this.save(); this.net.pushLobby();
  }
  // your home: a drivable Humvee in the carport, your stash weapons on the armory wall, the hotzone map on the board
  setupHome() {
    const H = this.base.home; if (!H) return;
    for (const v of this.vehicles) v.remove(); this.vehicles = [new Vehicle(this, 900, 'ltv', H.garage.clone(), H.garageYaw, 0)];
    if (this.homeDeco) this.base.root.remove(this.homeDeco); const g = this.homeDeco = new THREE.Group(); this.base.root.add(g);
    this.profile.stash.weapons.slice(0, H.rackSlots.length).forEach((w, i) => { const gm = buildGun(w.id, w.mods); const s = H.rackSlots[i]; gm.group.position.copy(s.pos); gm.group.rotation.set(0, s.yaw + Math.PI / 2, 0); gm.group.scale.setScalar(0.9); g.add(gm.group); });
    if (this.mapImage) { const t = new THREE.CanvasTexture(this.mapImage); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 })); m.position.copy(H.mapBoard.pos); m.rotation.y = H.mapBoard.yaw; g.add(m); }
  }
  makeMapImage(W) {
    const N = 640, C = document.createElement('canvas'); C.width = C.height = N; const x = C.getContext('2d'); const img = x.createImageData(N, N); const T = W.terrain;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = (i + 0.5) / N * MAP_SIZE - MAP_SIZE / 2, wz = (j + 0.5) / N * MAP_SIZE - MAP_SIZE / 2;
      const h = T.height(wx, wz), s = T.splatAt(wx, wz); const nx = T.height(wx - 1, wz) - T.height(wx + 1, wz), nz = T.height(wx, wz - 1) - T.height(wx, wz + 1);
      const shade = Math.max(0.35, Math.min(1.3, 0.85 + (nx * 0.6 + nz * 0.4) * 0.25));
      const r = 74 * s[0] + 120 * s[1] + 128 * s[2] + 46 * s[3], g = 88 * s[0] + 100 * s[1] + 124 * s[2] + 46 * s[3], b = 50 * s[0] + 76 * s[1] + 116 * s[2] + 48 * s[3];
      const k = (j * N + i) * 4; const cont = Math.abs(((h / 6) % 1 + 1) % 1 - 0.5) > 0.47 ? 0.85 : 1;
      img.data[k] = r * shade * cont; img.data[k + 1] = g * shade * cont; img.data[k + 2] = b * shade * cont; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0); x.fillStyle = 'rgba(30,30,30,0.85)';
    for (const c of W.col.all) { if (c.noRay || c.hw > 40 || c.y1 - c.y0 < 1.5) continue; x.save(); x.translate((c.x + 320) / 640 * N, (c.z + 320) / 640 * N); x.rotate(-c.yaw); x.fillRect(-c.hw / 640 * N, -c.hd / 640 * N, c.hw * 2 / 640 * N, c.hd * 2 / 640 * N); x.restore(); }
    x.strokeStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * N / 8, 0); x.lineTo(i * N / 8, N); x.moveTo(0, i * N / 8); x.lineTo(N, i * N / 8); x.stroke(); }
    return C;
  }
  // ------------------------------------------------------------------ raid lifecycle
  async startRaid(zoneId) {
    const z = DROP_ZONES.find((d) => d.id === zoneId); if (this.player.vehicle) this.exitVehicle(true);
    this.ui.fade(true); this.input.unlock(); this.mode = 'loading';
    const session = await this.net.joinRaid();
    await new Promise((r) => setTimeout(r, 500));
    this.mode = 'heli'; this.zone = z; this.setWorld(this.hot, 'hot'); this.profile.stats.raids++;
    const lo = this.profile.loadout; this.profile.stash.weapons = this.profile.stash.weapons.filter((w) => w.uid !== lo.primary && w.uid !== lo.secondary);
    this.raidStart = { items: structuredClone(this.pack.items) };
    this.raid = { t: RAID_TIME, kills: 0, looted: 0, extract: null, storm: false, seed: session.seed };
    this.ai.startRaid(zoneId);
    const target = this.findLandingSpot(new THREE.Vector3(z.pos[0], 0, z.pos[1]));
    this.spawnRaidContent(session.seed, target);
    // insertion: fly in from the map edge, flare into a hover, fast-rope down
    const a = Math.atan2(target.x, target.z) + (Math.random() - 0.5) * 0.6; const start = new THREE.Vector3(THREE.MathUtils.clamp(target.x + Math.sin(a) * 340, -315, 315), 140, THREE.MathUtils.clamp(target.z + Math.cos(a) * 340, -315, 315));
    const H = this.heliModel; H.visible = true;
    const flight = new HeliFlight(H, start, Math.atan2(target.x - start.x, target.z - start.z));
    const hoverY = target.y + 6;
    flight.go([{ to: new THREE.Vector3(target.x, target.y + 70, target.z), speed: 60 }, { to: new THREE.Vector3(target.x, hoverY, target.z), speed: 24, hover: true, wait: 0.5, until: () => flight.ropeDone }, { to: new THREE.Vector3(target.x - Math.sin(a) * 400, 180, target.z - Math.cos(a) * 400), speed: 70 }]);
    this.heliRide = flight; flight.target = target; flight.kind = 'insert'; flight.dropped = false; flight.lookYaw = 0; flight.lookPitch = -0.2;
    this.heliLoop = audio.loop('heli');
    const P = this.player; P.hp = P.maxHp; P.hidden = true; P.vehicle = null; P.op.root.visible = true; P.reattach(this.scene);
    this.ui.show(true); this.ui.setHint('<b>INSERTION</b> · Mouse: look around · <b>Space</b>: skip the flight · <b>E</b>: fast-rope down once the helicopter hovers');
    this.ui.fade(false); this.input.lock(); this.net.pushLobby();
  }
  findLandingSpot(p) {
    const W = this.hot; let best = null, bs = 1e9;
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r = i === 0 ? 0 : 8 + Math.random() * 30; const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const n = W.terrain.normal(x, z); const near = W.col.near(x, z, 7).filter((c) => !c.noRay && c.y1 - W.terrain.height(c.x, c.z) > 1 && Math.hypot(c.x - x, c.z - z) < c.r + 6).length;
      const s = (1 - n.y) * 40 + near * 5 + r * 0.02; if (s < bs) { bs = s; best = new THREE.Vector3(x, W.col.groundAt(x, z, 999).y, z); } }
    return best;
  }
  spawnRaidContent(seed, safe) {
    const W = this.hot, r = seeded(seed >>> 0 || 7);
    this.containers = []; resetEnemyIds(1);
    W.loot.forEach((l, i) => { const roll = r(); if (roll < 0.12) return; const c = new LootContainer(l.type, l.pos, l.yaw, seeded((seed + i * 7919) >>> 0)); c.cid = 'c' + i; W.root.add(c.mesh); this.containers.push(c); });
    this.enemies = []; const host = this.net.isHost; const D = this.ai.doctrine;
    const mk = (type, p, tier) => { const E = { drone: Drone, crawler: Crawler, strider: Strider, sentinel: Sentinel, raider: Raider }[type]; p.y = W.col.groundAt(p.x, p.z, 999).y; const e = new E(this, p, tier, { rand: r }); e.puppet = !host; this.enemies.push(e); return e; };
    for (const s of W.spawns) {
      const roll = r(); if (s.type !== 'strider' && s.type !== 'sentinel' && roll < 0.15) continue;
      if (safe && s.type !== 'strider' && Math.hypot(s.pos.x - safe.x, s.pos.z - safe.z) < 55) continue;
      const type = s.type === 'raider' && r() < D.droneShare * 0.3 ? 'drone' : s.type;
      mk(type, s.pos.clone(), s.tier);
    }
    // doctrine-driven pressure (host only; clients receive these through snapshots)
    if (host) {
      if (D.ambushLZ) { const ex = W.extracts.find((e) => e.id === D.ambushLZ); if (ex) for (let i = 0; i < 3; i++) mk('raider', ex.center.clone().add(new THREE.Vector3((r() - 0.5) * 30, 0, (r() - 0.5) * 30)), 1); }
      if (D.hotZone) { const zz = DROP_ZONES.find((d) => d.id === D.hotZone); if (zz) for (let i = 0; i < 3; i++) mk(i ? 'raider' : 'crawler', new THREE.Vector3(zz.pos[0] + (r() - 0.5) * 50, 0, zz.pos[1] + (r() - 0.5) * 50), 1); }
    }
    this.ai.formSquads(this.enemies);
    const ex = [...W.extracts].sort(() => r() - 0.5); for (const e of W.extracts) e.active = false; ex[0].active = ex[1].active = true;
    this.spawnVehicles(r); this.waveT = 150;
  }
  spawnVehicles(r) {
    for (const v of this.vehicles) v.remove(); this.vehicles = []; this.myParked.clear();
    const spots = [[-48, 60, 0, 'ltv'], [70, 30, 1.57, 'ltv'], [-60, 130, 0.2, 'utv'], [160, -110, 0.6, 'm35'], [-150, -150, 1.2, 'mrap'], [-165, 165, 2.4, 'utv'], [150, 60, 1.0, 'ltv'], [20, -40, 1.57, 'mrap'], [-40, -100, 0.1, 'm35'], [210, 40, 2.0, 'utv']];
    spots.forEach(([x, z, yaw, type], i) => { const p = new THREE.Vector3(x + (r() - 0.5) * 4, 0, z + (r() - 0.5) * 4); this.vehicles.push(new Vehicle(this, i + 1, type, p, yaw + (r() - 0.5) * 0.3, i)); });
  }
  cleanupRaid() {
    for (const e of this.enemies) e.remove(); this.enemies = [];
    for (const c of this.containers || []) c.mesh.parent?.remove(c.mesh); this.containers = [];
    for (const r of this.rockets) this.scene.remove(r.mesh); this.rockets = [];
    for (const v of this.vehicles) v.remove(); this.vehicles = [];
    this.ai.clear(); this.heliLoop?.stop(); this.heliLoop = null; this.alarm?.stop(); this.alarm = null; this.engineLoop?.stop(); this.engineLoop = null;
    if (this.heliModel) this.heliModel.visible = false; this.heliRide = null; if (this.rope) this.rope.visible = false; this.raid = null;
    this.net.leaveRaid();
  }
  spawnBag(pos, table, contents, remoteId) {
    const c = new LootContainer('bag', pos.setY(this.world.col.groundAt(pos.x, pos.z, pos.y + 2).y), Math.random() * 6, Math.random, contents ? structuredClone(contents) : rollLoot(table, Math.random));
    if (!c.contents.length) return; c.cid = remoteId || ('b' + this.net.me + '-' + (this.bagN = (this.bagN || 0) + 1)); this.world.root.add(c.mesh); (this.containers ||= []).push(c);
    if (!remoteId) this.net.event('bag', [c.cid, +pos.x.toFixed(1), +pos.y.toFixed(1), +pos.z.toFixed(1), c.contents.slice(0, 8)]);
    return c;
  }
  spawnRocket(from, to) {
    const M = worldMats(); const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8).rotateX(Math.PI / 2), M.steel); mesh.position.copy(from); this.scene.add(mesh);
    const v = to.clone().sub(from); const d = v.length(); v.normalize().multiplyScalar(32); v.y += d * 0.12;
    this.rockets.push({ mesh, v, t: 0 }); audio.gunshot('cannon', from, 1); this.net.event('rk', [+from.x.toFixed(1), +from.y.toFixed(1), +from.z.toFixed(1), +v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)]);
  }
  // explosions damage everyone nearby (grenades, rockets, vehicles). visualOnly for replicated events.
  explode(p, radius, dmg, by, visualOnly) {
    this.fx.explosion(p, radius / 6); audio.explosion(p, radius / 6); const P = this.player;
    const d = P.pos.distanceTo(p); this.shake(Math.max(0, 1.2 - d / 30));
    if (visualOnly) return;
    if (d < radius && !P.hidden) P.damage(dmg * (1 - d / radius), p, typeof by === 'number' ? 'raider' : 'explosion');
    if (this.net.isHost || !this.net.raidRoom) for (const e of this.enemies) { if (!e.alive || e.puppet) continue; const de = e.pos.distanceTo(p); if (de < radius) e.damage(dmg * (1 - de / radius) * (e.type === 'strider' ? 0.4 : 1), { tag: 'torso', point: e.pos.clone().setY(e.pos.y + 1) }, p, by === 'me'); }
    for (const R of this.net.remotes.values()) { const dr = R.pos.distanceTo(p); if (dr < radius && this.net.isHost) R.damage(dmg * (1 - dr / radius), null, p, by === 'me'); }
    for (const v of this.vehicles) { const dv = v.pos.distanceTo(p); if (dv < radius + 2) v.damage(dmg * 3 * (1 - dv / (radius + 2))); }
  }
  noise(pos, radius, src, impact) { for (const e of this.enemies) if (e !== src && e.alive && !e.puppet) e.hear(pos, radius, impact); }
  swarm(src, radius) { for (const e of this.enemies) if (e !== src && e.alive && !e.puppet && (e.type === 'drone' || e.type === 'crawler') && e.pos.distanceTo(src.pos) < radius) { e.alert = 1; e.state = 'attack'; e.lastSeen = (src.lastSeen || src.pos).clone(); } }
  hitTargets() { const out = this.enemies.filter((e) => e.alive); for (const R of this.net.remotes.values()) if (R.alive && !R.hidden) out.push(R); return out; }
  // who should a hostile go after? the nearest living player it could plausibly engage
  pickTarget(e) {
    let best = null, bd = 1e9; const consider = (p, w = 1) => { if (!p || p.dead || p.hidden) return; const d = p.pos.distanceTo(e.pos) * w; if (d < bd) { bd = d; best = p; } };
    if (this.mode === 'raid') consider(this.player, this.player.inVehicle && this.ai.doctrine.antiVehicle && (e.type === 'strider' || e.type === 'raider') ? 0.6 : 1);
    for (const R of this.net.remotes.values()) consider(R, R.inVehicle && e.type === 'strider' ? 0.6 : 1);
    return best || this.player;
  }
  onKill(e) { if (this.raid) this.raid.kills++; this.profile.stats.kills++; this.ai.onKill(e); this.ui.feed(`Destroyed ${e.name}`); }
  shake(a) { this.player.shakeT = Math.min(1.5, this.player.shakeT + a); }
  compassMarks() {
    const out = [];
    if (this.mode === 'raid') { for (const e of this.hot.extracts) if (e.active) out.push({ x: e.pos[0], z: e.pos[1], icon: '◆', color: '#4ad6f0' }); for (const R of this.net.remotes.values()) if (!R.dead) out.push({ x: R.pos.x, z: R.pos.z, icon: '●', color: '#e8e2d2' }); }
    if (this.mode === 'base') { const c = this.base.interact[0]; out.push({ x: c.pos.x, z: c.pos.z, icon: '▼', color: '#e8a832' }); }
    return out;
  }
  onPlayerDeath(by) {
    if (this.mode !== 'raid') { this.player.hp = this.player.maxHp; this.player.dead = false; return; }
    if (this.player.vehicle) this.exitVehicle(true);
    this.mode = 'dead'; this.profile.stats.deaths++; this.ui.toast('You are down'); this.ui.prompt(null);
    const lost = [...this.player.weapons.filter(Boolean).map((w) => ({ weapon: { id: w.id, mods: w.mods } })), ...this.pack.items];
    // your gear stays in the hotzone for others to loot
    this.spawnBag(this.player.pos.clone(), null, lost);
    this.net.event('die', [String(by || ''), this.lastHitPeer || '']);
    this.ai.onDeath(by);
    const lo = this.profile.loadout; lo.primary = lo.secondary = null; lo.vest = null; lo.armor = 0; lo.pack = 'pack1'; this.profile.backpack = [];
    if (!this.profile.stash.weapons.length) { this.profile.stash.weapons.push({ uid: this.nextUid(), id: 'p9', mods: {} }); this.stashAddItem('a9', 45); this.stashAddItem('bandage', 1); this.loaner = true; }
    store.set(SAVE_KEY, { ...this.profile, base: this.base.build.serialize() });
    setTimeout(() => { this.input.unlock(); this.ui.show(false); this.ui.results({ ok: false, items: lost, time: RAID_TIME - this.raid.t, kills: this.raid.kills, looted: this.raid.looted }); if (this.loaner) { this.ui.toast('Quartermaster issued you a loaner Glock 17'); this.loaner = false; } }, 3500);
  }
  extracted() {
    this.mode = 'extracted'; this.profile.stats.extracts++; const P = this.player; const lo = this.profile.loadout;
    this.ai.endRaid(this.raid.extract?.e.id);
    const items = [...this.pack.items];
    const keep = P.weapons.map((w) => { if (!w) return null; const uid = this.nextUid(); this.profile.stash.weapons.push({ uid, id: w.id, mods: { ...w.mods } }); return uid; });
    lo.primary = keep[0]; lo.secondary = keep[1]; lo.vest = P.vestId; lo.armor = P.armor;
    const keepIds = new Set(Object.keys(ITEMS).filter((k) => ['ammo', 'med', 'plate'].includes(ITEMS[k].type))); const back = [];
    for (const e of this.pack.items) { if (e.id && keepIds.has(e.id)) back.push(e); else this.stashAdd(e); }
    this.profile.backpack = back;
    this.ui.fade(true); this.input.unlock();
    const gained = items.filter((e) => !(e.id && keepIds.has(e.id)) || !this.raidStart.items.some((s) => s.id === e.id));
    setTimeout(() => { this.ui.fade(false); this.ui.show(false); store.set(SAVE_KEY, { ...this.profile, base: this.base.build.serialize() }); this.ui.results({ ok: true, items: gained, time: RAID_TIME - this.raid.t, kills: this.raid.kills, looted: this.raid.looted }); }, 800);
  }
  onPanelClosed() { if (this.mode !== 'menu' && !this.ui.isOpen()) setTimeout(() => this.input.lock(), 0); }
  // ------------------------------------------------------------------ multiplayer glue
  onHostChange(isHost) { for (const e of this.enemies) { e.puppet = !isHost; if (isHost) { e.lastSeen = null; e.state = 'idle'; } } if (isHost) { this.ai.formSquads(this.enemies.filter((e) => e.alive)); this.ui.feed('You are now hosting the hotzone'); } }
  enemySnapshot() {
    const P = this.player; const players = [P.pos, ...[...this.net.remotes.values()].map((r) => r.pos)]; const now = this.time; const out = [];
    for (const e of this.enemies) { if (!e.alive && now - (e.diedAt ??= now) > 15) continue; let d = 1e9; for (const p of players) d = Math.min(d, p.distanceTo(e.pos)); if (d < 340) out.push([d, e]); }
    out.sort((a, b) => a[0] - b[0]); return out.slice(0, 34).map((x) => x[1].netState());
  }
  applyEnemySnapshot(list) {
    const now = this.time; const byId = new Map(this.enemies.map((e) => [e.id, e]));
    for (const a of list) {
      let e = byId.get(a[0]);
      if (!e) { const type = TYPE_BY_CODE[a[1]]; const E = { drone: Drone, crawler: Crawler, strider: Strider, sentinel: Sentinel, raider: Raider }[type]; if (!E) continue; e = new E(this, new THREE.Vector3(a[2] / 10, a[3] / 10, a[4] / 10), a[9] || 0, { id: a[0] }); e.id = a[0]; e.puppet = true; this.enemies.push(e); byId.set(e.id, e); }
      e.applyNet(a); e.seenNet = now;
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) { const e = this.enemies[i]; if (e.puppet && e.alive && e.seenNet !== undefined && now - e.seenNet > 6 && e.pos.distanceTo(this.player.pos) < 300) { e.remove(); this.enemies.splice(i, 1); } }
  }
  lootState() { return this.containers.filter((c) => c.cid?.[0] === 'c' && (c.depleted || (c.opened && !c.contents?.length))).map((c) => c.cid).slice(-120); }
  applyLootState(ids) { const set = new Set(ids); for (const c of this.containers) if (set.has(c.cid) && !c.depleted) { if (c.info.node) c.deplete(); else { c.opened = true; c.contents = []; } } }
  parkedStates() { const out = []; for (const id of this.myParked) { const v = this.vehicles.find((x) => x.id === id); if (v && !v.driverIsMe()) out.push(v.netState()); } return out.slice(0, 4); }
  applyVehicleNet(a, peer, driving) {
    const v = this.vehicles.find((x) => x.id === a[0]); if (!v || v.driverIsMe()) return;
    if (driving) { v.driverRemote = peer; v.driverSeen = this.time; this.myParked.delete(v.id); v.applyNet(a); }
    else if (!v.driverRemote) v.applyNet(a);
  }
  vehicleRayHit(o, d, maxT) { let best = null; for (const v of this.vehicles) { if (v === this.player.vehicle || v.pos.distanceTo(o) > maxT + 8) continue; const h = this.world.col.rayBox(v.col, o, d, maxT); if (h && (!best || h.t < best.t)) best = { t: h.t, point: o.clone().addScaledVector(d, h.t), veh: v }; } return best; }
  onVehicleDestroyed(v) { if (this.player.vehicle === v) { this.exitVehicle(true); this.player.damage(60, v.pos, 'explosion'); } this.explode(v.pos.clone(), 8, 80, null, false); }
  onNetEvent(type, d, peer, R) {
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    if (type === 'shot') { const a = V3(d[0], d[1], d[2]); this.ballistics.fire(a, V3(d[3], d[4], d[5]), { ammo: d[7] || 'a556', visual: true, mine: false, muzzle: a }); audio.gunshot(R?.ws ? gunSound(R.ws) : 'rifle', a, d[6] ? 0.25 : 1); if (R?.op) R.op.kick = 1; if (R?.anim) R.anim.fire(); }
    else if (type === 'es' && !this.net.isHost) { const a = V3(d[0], d[1], d[2]), b = V3(d[3], d[4], d[5]); this.fx.tracer(a, b, d[7] || 0xffa040, 260); audio.gunshot(SHOT_KINDS[d[6]] || 'rifle', a, 1); }
    else if (type === 'pd') { if (d[0] === this.net.me && this.mode === 'raid') { if (d[5]) this.lastHitPeer = peer; this.player.damage(d[1], V3(d[2], d[3], d[4]), d[5] ? 'player' : 'enemy'); } }
    else if (type === 'eh' && this.net.isHost) { const e = this.enemies.find((x) => x.id === d[0]); if (e && e.alive && !e.puppet) e.damage(d[1], { tag: d[2] }, R?.pos, false, peer); }
    else if (type === 'ek') { if (d[1] === this.net.me) { const e = this.enemies.find((x) => x.id === d[0]); if (e) this.onKill(e); } }
    else if (type === 'lt') { const c = this.containers.find((x) => x.cid === d[0]); if (c) { if (d[1] === '*') { c.opened = true; if (c.info.node) c.deplete(); else c.contents = []; } else { if (!c.contents) c.open(0); const i = c.contents.findIndex((e) => sig(e) === d[1]); if (i >= 0) c.contents.splice(i, 1); c.opened = true; } } }
    else if (type === 'bag') { if (!this.containers.some((c) => c.cid === d[0])) this.spawnBag(V3(d[1], d[2], d[3]), null, d[4], d[0]); }
    else if (type === 'gren') { this.ai.throwGrenade(V3(d[1], d[2], d[3]), V3(d[1] + d[4], d[2] + d[5], d[3] + d[6]), d[0] ? 'smoke' : 'frag', 'net'); const g = this.ai.grenades[this.ai.grenades.length - 1]; if (g) g.v.set(d[4], d[5], d[6]); }
    else if (type === 'rk' && !this.net.isHost) { const M = worldMats(); const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8).rotateX(Math.PI / 2), M.steel); mesh.position.set(d[0], d[1], d[2]); this.scene.add(mesh); this.rockets.push({ mesh, v: V3(d[3], d[4], d[5]), t: 0, visual: true }); }
    else if (type === 'vh') { const v = this.vehicles.find((x) => x.id === d[0]); if (v && v.driverIsMe()) v.damage(d[1]); }
    else if (type === 'die') { this.ui.feed(`${R?.name || 'An operator'} was killed${d[1] === this.net.me ? ' by you' : ''}`); if (d[1] === this.net.me && this.raid) { this.raid.kills++; this.ai.onKill({ type: 'player' }); } }
  }
  // ------------------------------------------------------------------ interaction
  findInteract() {
    const P = this.player, cam = this.engine.camera; const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); const eye = P.pos.clone(); eye.y += 1.4;
    let best = null, bs = -1;
    const consider = (pos, range, obj) => { const d = pos.distanceTo(eye); if (d > range) return; const dir = pos.clone().sub(eye).normalize(); const dot = dir.dot(fwd); if (dot < 0.55 && d > 1.2) return; const s = dot - d * 0.05; if (s > bs) { bs = s; best = obj; } };
    if (this.mode === 'raid') {
      for (const c of this.containers) { if (c.depleted || (c.opened && !c.contents?.length)) continue; consider(c.pos.clone().setY(c.pos.y + 0.5), 2.6, { kind: 'loot', c, label: (c.opened ? 'Loot ' : c.info.node ? 'Salvage ' : 'Search ') + c.info.name, time: c.opened ? 0 : c.info.search }); }
      for (const e of this.hot.extracts) if (e.active && !this.raid.extract) consider(e.console.clone().setY(e.console.y + 1), 3, { kind: 'extract', e, label: `Call extraction helicopter · ${e.name}`, time: 1.0 });
      for (const v of this.vehicles) { if (!v.alive) continue; const seat = v.freeSeat(); if (seat < 0) continue; consider(v.pos.clone(), ENTER_RANGE + v.def.half[2] * 0.6, { kind: 'vehicle', v, seat, label: `${seat === 0 ? 'Drive' : 'Ride in'} ${v.def.name}`, time: 0 }); }
      if (this.raid.extract?.landed) consider(this.heliModel.position.clone().setY(this.heliModel.position.y + 1.5), 7, { kind: 'board', label: 'Board helicopter', time: 0.4 });
    } else if (this.mode === 'base') {
      for (const i of this.base.interact) consider(i.pos, 3, { kind: i.kind, label: i.label, time: 0 });
      for (const v of this.vehicles) { if (!v.alive) continue; const seat = v.freeSeat(); if (seat >= 0) consider(v.pos.clone(), ENTER_RANGE + v.def.half[2] * 0.6, { kind: 'vehicle', v, seat, label: `${seat === 0 ? 'Drive' : 'Ride in'} ${v.def.name}`, time: 0 }); }
      consider(this.baseHeli.position.clone().setY(1.5), 6, { kind: 'launch', label: 'Board helicopter (Flight Ops)', time: 0 });
      for (const p of this.base.build.pieces) { const st = PIECES[p.type].station; if (!st || !p.obj) continue; consider(p.obj.position.clone().setY(p.obj.position.y + 1), 3, { kind: 'station', st, label: `Use ${PIECES[p.type].name}`, time: 0 }); }
    }
    return best;
  }
  doInteract(it) {
    if (it.kind === 'loot') {
      const c = it.c; const wasOpen = c.opened; const contents = c.open(0); if (!wasOpen) this.raid.looted++;
      if (c.info.node) { const got = []; for (const e of [...contents]) { const left = this.pack.add(e); if (left === 0) { got.push(e); contents.splice(contents.indexOf(e), 1); } else if (e.n) e.n = left; } for (const e of got) this.ui.feed(`+ ${entryName(e)}${e.n > 1 ? ' ×' + e.n : ''} (${entryKg(e).toFixed(1)} kg)`, 'loot'); if (contents.length) this.ui.toast('Backpack full'); else { c.deplete(); this.net.event('lt', [c.cid, '*']); } audio.mech(c.pos, 'reload'); this.noise(c.pos, 25, null); }
      else { audio.mech(c.pos, 'empty'); this.ui.inventory(c); }
    } else if (it.kind === 'extract') this.callLift(it.e);
    else if (it.kind === 'board') { this.ui.toast('Extracting…'); this.extracted(); }
    else if (it.kind === 'vehicle') this.enterVehicle(it.v, it.seat);
    else if (it.kind === 'launch') this.ui.launch();
    else if (it.kind === 'stash') this.ui.inventory();
    else if (it.kind === 'intel') this.ui.intel(this.ai.intel());
    else if (it.kind === 'station') it.st === 'gunsmith' ? this.ui.gunsmith() : this.ui.craft(it.st);
  }
  takeFromContainer(c, e) { this.net.event('lt', [c.cid, sig(e)]); if (!c.contents.length) this.net.event('lt', [c.cid, '*']); }
  callLift(e) {
    this.raid.extract = { e, landed: false, wait: 40, t: 0 }; this.ui.toast('Extraction helicopter inbound — hold the LZ!'); this.alarm = audio.loop('alarm'); this.noise(e.center, 160, null);
    const H = this.heliModel; H.visible = true; const a = Math.random() * 6.28; const start = new THREE.Vector3(e.center.x + Math.sin(a) * 420, 160, e.center.z + Math.cos(a) * 420);
    const fl = new HeliFlight(H, start, Math.atan2(e.center.x - start.x, e.center.z - start.z)); fl.kind = 'extract';
    fl.go([{ to: e.center.clone().setY(e.center.y + 60), speed: 55 }, { to: e.center.clone().setY(e.center.y + 0.05), speed: 14, land: true, idle: true, wait: 40 }, { to: new THREE.Vector3(e.center.x - Math.sin(a) * 500, 200, e.center.z - Math.cos(a) * 500), speed: 60 }]);
    this.extractFlight = fl; if (!this.heliLoop) this.heliLoop = audio.loop('heli');
    if (this.net.isHost) { const r = Math.random; for (let i = 0; i < 4; i++) { const ang = r() * 6.28, d = 60 + r() * 30; const p = new THREE.Vector3(e.center.x + Math.cos(ang) * d, 0, e.center.z + Math.sin(ang) * d); p.y = this.hot.col.groundAt(p.x, p.z, 999).y; const E = i < 2 ? Drone : r() < 0.5 ? Raider : Crawler; const en = new E(this, p, 1); en.state = 'search'; en.lastSeen = e.center.clone(); this.enemies.push(en); } this.ai.formSquads(this.enemies.filter((x) => x.alive && !x.squad)); }
  }
  // ------------------------------------------------------------------ vehicles
  enterVehicle(v, seat) {
    const P = this.player; P.vehicle = v; P.seat = seat; P.inVehicle = true; v.seats[seat] = 'me'; if (seat === 0) { v.settleT = 0; this.myParked.add(v.id); }
    P.vcam = { yaw: 0, pitch: 0.15, mode: 'third' }; this.engineLoop = audio.loop('engine'); this.ui.toast(`${seat === 0 ? 'Driving' : 'Riding in'} ${v.def.name} · E exit · V camera${seat === 0 ? ' · Space handbrake · R flip' : ' · you can shoot'}`);
  }
  exitVehicle(force) {
    const P = this.player, v = P.vehicle; if (!v) return;
    v.seats[P.seat] = null; const side = new THREE.Vector3(P.seat % 2 === 0 ? -1 : 1, 0, 0).applyQuaternion(v.q).multiplyScalar(v.def.half[0] + 0.9);
    const p = v.pos.clone().add(side); p.y = this.world.col.groundAt(p.x, p.z, v.pos.y + 2).y; P.pos.copy(p); P.vel.set(0, 0, 0); P.yaw = v.yaw + Math.PI;
    P.op.root.rotation.set(0, P.yaw, 0); P.vehicle = null; P.seat = null; P.inVehicle = false; this.engineLoop?.stop(); this.engineLoop = null; this.ui.vehicleHud(null);
  }
  updateInVehicle(dt) {
    const P = this.player, v = P.vehicle, I = this.input, cam = this.engine.camera; const def = v.def;
    if (I.locked && !this.ui.isOpen()) { const s = 0.0022 * (this.settings.sens || 1); P.vcam.yaw -= I.mx * s; P.vcam.pitch = THREE.MathUtils.clamp(P.vcam.pitch + I.my * s, -0.6, 1.2); }
    if (I.hit('KeyV')) P.vcam.mode = P.vcam.mode === 'third' ? 'first' : 'third';
    if (I.hit('KeyE')) { this.exitVehicle(); return; }
    if (P.seat === 0 && I.hit('KeyR') && Math.abs(v.sim.speed) < 3) v.sim.flip();
    const seatW = v.seatWorld(P.seat); P.pos.copy(seatW).setY(seatW.y - 0.5);
    P.op.root.position.copy(seatW).add(new THREE.Vector3(0, -0.9, 0)); P.op.root.quaternion.copy(v.q); P.op.root.rotateY(Math.PI);
    const heading = v.yaw;
    if (P.vcam.mode === 'first') { cam.position.copy(seatW).add(new THREE.Vector3(0, 0.75, 0)); const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(-P.vcam.pitch * 0.8, Math.PI + P.vcam.yaw, 0, 'YXZ')); cam.quaternion.copy(v.q).multiply(look); P.op.root.visible = false; }
    else { const dist = 4 + def.half[2] * 1.6; const yaw = heading + Math.PI + P.vcam.yaw; const tgt = v.pos.clone().add(new THREE.Vector3(0, def.half[1] + 1.2, 0)); const want = tgt.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(P.vcam.pitch) * dist, Math.sin(P.vcam.pitch) * dist, Math.cos(yaw) * Math.cos(P.vcam.pitch) * dist)); want.y = Math.max(want.y, this.world.terrain.height(want.x, want.z) + 0.6); if (!this.vcamPos || this.vcamPos.distanceTo(want) > 30) this.vcamPos = want.clone(); this.vcamPos.lerp(want, 1 - Math.exp(-dt * 10)); cam.position.copy(this.vcamPos); cam.lookAt(tgt); P.op.root.visible = true; }
    cam.fov += (this.engine.baseFov + Math.min(10, Math.abs(v.sim.speed) * 0.3) - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // passengers can shoot: aim follows the camera
    if (P.seat > 0) { const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ'); P.yaw = e.y; P.pitch = e.x; }
    P.op.update(dt, { speed: 0, seated: true, wheel: P.seat === 0 ? { turn: v.sim.steer * 2 } : null, noGun: P.seat === 0, pitch: P.seat > 0 ? P.pitch : 0, aim: P.seat > 0 });
    P.vm.visible = false;
    this.ui.vehicleHud({ name: def.name, speed: Math.abs(v.sim.speed || v.netSpeed || 0), hp: v.hp, maxHp: def.hp, fuel: v.sim.fuel, seat: P.seat });
    this.engineLoop?.set(null, 0.15 + Math.min(0.5, v.sim.rpm * 0.35));
    if (this.player.stats) this.player.stats.vehicleT = (this.player.stats.vehicleT || 0) + dt;
  }
  // ------------------------------------------------------------------ per-frame
  frame(dt) {
    this.time += dt; const I = this.input, P = this.player, ui = this.ui;
    if (I.locked) { const [ex, ey] = I.extraLook(dt); I.mx += ex; I.my += ey; }
    this.softHint();
    this.net.update(dt);
    if (this.mode === 'menu' || this.mode === 'loading') { const t = this.time * 0.05; this.engine.camera.position.set(Math.sin(t) * 40, 14, -10 + Math.cos(t) * 40); this.engine.camera.lookAt(0, 3, -30); this.engine.followSun(new THREE.Vector3(0, 0, -20)); this.base.build.update(dt, this.time); this.idleHeli(dt); if (!this.noRender) this.engine.render(dt, this.time); ui.updateOnline?.(); I.endFrame(); return; }
    if (!ui.isOpen()) {
      if (I.hit('Tab') && (this.mode === 'base' || this.mode === 'raid')) ui.inventory();
      else if (I.hit('KeyM') && this.mode === 'raid') ui.raidMap();
    } else if (I.hit('Tab') || I.hit('KeyM')) ui.close();
    if (!I.locked && !ui.isOpen() && (this.mode === 'base' || this.mode === 'raid') && this.wasLocked) ui.pause();
    this.wasLocked = I.locked;
    const frozen = ui.isOpen() || this.mode === 'extracted';
    if (this.mode === 'heli') this.updateHeliRide(dt);
    else if (P.vehicle && (this.mode === 'raid' || this.mode === 'base')) { if (!frozen) this.updateInVehicle(dt); if (P.seat > 0 && !frozen) P.update(dt, I, { frozen: false, seated: true }); }
    else if (this.mode === 'base' || this.mode === 'raid' || this.mode === 'dead') {
      if (this.mode === 'base' && !frozen) this.updateBuild(dt);
      P.update(dt, I, { frozen, build: this.build?.active });
    }
    if ((this.mode === 'base' || this.mode === 'raid') && !frozen && !P.dead && !this.build?.active && !(P.vehicle)) {
      const it = this.findInteract();
      if (it) { if (I.down('KeyE')) { this.holdT = (this.holdKey === it.label ? this.holdT : 0) + dt; this.holdKey = it.label; if (this.holdT >= it.time) { this.holdT = 0; this.holdKey = null; this.doInteract(it); I.keys.delete('KeyE'); } } else this.holdT = 0; ui.prompt(it.label, it.time ? Math.min(1, this.holdT / it.time) : 0); }
      else { ui.prompt(null); this.holdT = 0; }
    } else ui.prompt(null);
    if (this.raid) this.updateRaid(dt);
    if (this.mode === 'base') { this.base.build.update(dt, this.time); this.idleHeli(dt); for (const v of this.vehicles) v.update(dt, P.vehicle === v && P.seat === 0 ? this.input : null); }
    const cam = this.engine.camera; audio.listener.x = cam.position.x; audio.listener.y = cam.position.y; audio.listener.z = cam.position.z; audio.listener.yaw = -new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ').y * -1;
    this.ai.update(dt);
    if (this.mode !== 'menu') this.ballistics.update(dt);
    this.fx.update(dt, this.scene.fog);
    if (this.world.terrain.grassTime) this.world.terrain.grassTime.value = this.time;
    this.engine.followSun(this.mode === 'heli' && this.heliRide ? this.heliRide.pos : P.pos);
    ui.update(dt);
    if (!this.noRender) this.engine.render(dt, this.time);
    I.endFrame();
  }
  softHint() {
    let el = document.getElementById('softhint'); const on = this.input.soft && this.input.softActive && this.mode !== 'menu';
    if (!el) { el = document.createElement('div'); el.id = 'softhint'; el.textContent = 'Mouse capture is not available in this frame: move the mouse to look, push against a screen edge to keep turning (or use the arrow keys). Esc releases the mouse.'; document.body.appendChild(el); }
    el.hidden = !on || this.time - (this.softShown ??= this.time) > 20;
  }
  idleHeli(dt) { const u = this.baseHeli?.userData; if (u) { u.rotor.rotation.y += dt * 1.2; u.tailR.rotation.x += dt * 3; } }
  updateHeliRide(dt) {
    const F = this.heliRide, P = this.player, I = this.input, cam = this.engine.camera; if (!F) return;
    if (I.hit('Space') && F.leg === 0) { const to = F.legs[0].to; F.pos.set(to.x + (F.pos.x - to.x) * 0.15, to.y + 15, to.z + (F.pos.z - to.z) * 0.15); F.leg = 1; }
    F.update(dt, (x, z) => this.hot.terrain.height(x, z) + 1);
    this.heliLoop?.set(null, 0.55);
    if (I.locked) { const s = 0.0022 * (this.settings.sens || 1); F.lookYaw = THREE.MathUtils.clamp(F.lookYaw - I.mx * s, -1.6, 1.6); F.lookPitch = THREE.MathUtils.clamp(F.lookPitch - I.my * s, -1.1, 0.6); }
    const seat = F.seatWorld(new THREE.Vector3());
    if (!F.dropped) {
      P.op.root.visible = true; P.op.root.position.copy(seat).add(new THREE.Vector3(0, -0.95, 0)); P.op.root.rotation.set(0, F.yaw + Math.PI / 2 + Math.PI, 0); P.op.update(dt, { speed: 0, seated: true, pitch: 0, lowReady: true }); P.pos.copy(seat);
      // chase camera orbiting the helicopter (mouse to look around)
      const oy = F.yaw + Math.PI + 0.5 + F.lookYaw, op = 0.25 - F.lookPitch * 0.8, dist = 17;
      const want = F.pos.clone().add(new THREE.Vector3(Math.sin(oy) * Math.cos(op) * dist, 2.5 + Math.sin(op) * dist, Math.cos(oy) * Math.cos(op) * dist));
      if (!this.hcam || this.hcam.distanceTo(want) > 40) this.hcam = want.clone(); this.hcam.lerp(want, 1 - Math.exp(-dt * 6)); cam.position.copy(this.hcam); cam.lookAt(F.pos.clone().setY(F.pos.y + 1.5)); cam.updateMatrixWorld();
      const hovering = F.phase === 'hover';
      this.ui.setRaidInfo(this.zone.name, null, hovering ? 'Press E to fast-rope down' : F.leg === 0 ? `Inbound to ${this.zone.name} · Space to skip` : 'Flaring over the drop point…');
      if (hovering && (I.hit('KeyE') || (F.hoverT = (F.hoverT || 0) + dt) > 8)) { const door = F.doorWorld(new THREE.Vector3()); F.dropped = true; F.ropeT = 0; P.pos.copy(door); P.vel.set(0, 0, 0); audio.mech(P.pos, 'pump'); }
    } else {
      // fast-rope: slide down the rope from the door to the ground, then take control
      const door = F.doorWorld(new THREE.Vector3()); F.ropeT += dt; const gy = this.hot.col.groundAt(door.x, door.z, door.y).y;
      const y = Math.max(gy, door.y - F.ropeT * 4.5); P.pos.set(door.x, y, door.z); P.op.root.visible = true; P.op.root.position.copy(P.pos); P.op.update(dt, { speed: 0, air: true, pitch: 0 });
      this.rope.visible = true; this.rope.geometry.setFromPoints([door, new THREE.Vector3(door.x, gy, door.z)]); this.ui.setRaidInfo(this.zone.name, null, 'Fast-roping…');
      cam.position.lerp(P.pos.clone().add(new THREE.Vector3(Math.sin(F.yaw) * 4, 3, Math.cos(F.yaw) * 4)), Math.min(1, dt * 3)); cam.lookAt(P.pos.clone().setY(P.pos.y + 1)); cam.updateMatrixWorld();
      if (y <= gy + 0.01) {
        F.ropeDone = true; this.mode = 'raid'; this.rope.visible = false; P.spawn(P.pos.clone(), F.yaw + Math.PI); P.hidden = false; this.heliRide = null; this.departFlight = F; audio.step(P.pos, 'dirt', 1.5);
        this.ui.toast(`Deployed: ${this.zone.name}`); this.ui.setHint('Loot containers (hold <b>E</b>) and salvage resources. Watch your carry weight. Vehicles: <b>E</b> to enter. Find an active <b>LZ</b> (◆, <b>M</b> map) to extract.'); setTimeout(() => this.ui.setHint(''), 15000);
        this.noise(P.pos, 40, null);
      }
    }
  }
  updateRaid(dt) {
    const R = this.raid; if (!R) return; const P = this.player;
    if (this.mode === 'raid') { R.t -= dt; if (R.t <= 0 && !R.storm) { R.storm = true; this.ui.toast('Storm surge! Extract immediately'); } if (R.storm) { this.stormTick = (this.stormTick || 0) + dt; if (this.stormTick > 1) { this.stormTick = 0; P.damage(6, null, 'storm'); } } }
    // departing insertion helicopter
    if (this.departFlight) { this.departFlight.update(dt); this.heliLoop?.set(this.departFlight.pos, 1.2); if (this.departFlight.done || this.departFlight.pos.distanceTo(P.pos) > 450) { this.departFlight = null; if (!R.extract) { this.heliModel.visible = false; this.heliLoop?.stop(); this.heliLoop = null; } } }
    const ex = R.extract; let obj = '';
    if (ex) {
      const F = this.extractFlight; F.update(dt, (x, z) => this.hot.col.groundAt(x, z, 999).y); this.heliLoop?.set(F.pos, 1.4); this.heliModel.userData.light.intensity = F.phase === 'cruise' ? 0 : 60;
      if (Math.random() < dt * 8 && !ex.landed) this.fx.flare(ex.e.console.clone().setY(ex.e.console.y + 6.2));
      if (!ex.landed) { obj = `Helicopter inbound — hold ${ex.e.name}`; if (F.phase === 'landed') { ex.landed = true; this.alarm?.stop(); this.alarm = null; this.ui.toast('Helicopter is down — get aboard! (E)'); this.fx.dust(ex.e.center, 30, 1); } }
      else { ex.wait -= dt; obj = `Board the helicopter (${Math.ceil(Math.max(0, ex.wait))}s)`; if (P.pos.distanceTo(F.pos) < 4.5 && this.mode === 'raid') { this.ui.toast('Extracting…'); this.extracted(); }
        if (ex.wait <= 0 && this.mode === 'raid') { this.ui.toast('The helicopter left without you. Call another.'); R.extract = null; ex.landed = false; this.departFlight = F; } }
    } else if (this.mode === 'raid') obj = R.t < 300 ? 'Head to an active LZ' : '';
    if (this.mode === 'raid') this.ui.setRaidInfo(this.zone.name, R.t, obj);
    // hostiles: host simulates, clients run puppets
    for (const e of this.enemies) {
      if (e.puppet) { if (e.pos.distanceToSquared(P.pos) < 400 * 400) e.puppetUpdate(dt, this.time); continue; }
      e._t = this.pickTarget(e); const d2 = e.pos.distanceToSquared(e._t.pos);
      if (d2 < 240 * 240 || e.state === 'attack' || e.type === 'strider') e.update(dt, this.time);
    }
    // reinforcement waves keep long shared sessions alive (host only)
    if (this.net.isHost && this.mode === 'raid') { this.waveT -= dt; if (this.waveT <= 0) { this.waveT = 150 + Math.random() * 90; this.spawnWave(); } }
    for (const v of this.vehicles) { if (v.driverRemote && this.time - (v.driverSeen || 0) > 1.5) v.driverRemote = null; if (v.pos.distanceToSquared(P.pos) < 500 * 500) v.update(dt, P.vehicle === v && P.seat === 0 ? this.input : null); }
    const cp = this.engine.camera.position; for (const c of this.containers) c.update(this.time, cp);
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]; r.t += dt; r.v.y -= 6 * dt; const step = r.v.clone().multiplyScalar(dt); const L = step.length();
      const h = this.hot.col.ray(r.mesh.position, step.clone().divideScalar(L), L); r.mesh.position.add(step); r.mesh.lookAt(r.mesh.position.clone().add(r.v));
      this.fx.trail(r.mesh.position.clone(), r.v.clone().multiplyScalar(0.1));
      if (h || P.pos.distanceTo(r.mesh.position) < 1.2 || r.t > 6) { const p = h ? h.point : r.mesh.position.clone(); this.scene.remove(r.mesh); this.rockets.splice(i, 1); this.explode(p, 7, 70, 'strider', r.visual); }
    }
  }
  spawnWave() {
    const players = [this.player, ...this.net.remotes.values()].filter((p) => !p.dead && !p.hidden); if (!players.length) return;
    const tgt = players[Math.floor(Math.random() * players.length)]; const a = Math.random() * 6.28, d = 110 + Math.random() * 60;
    const c = new THREE.Vector3(THREE.MathUtils.clamp(tgt.pos.x + Math.cos(a) * d, -280, 280), 0, THREE.MathUtils.clamp(tgt.pos.z + Math.sin(a) * d, -280, 280));
    const list = []; const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { const p = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16)); p.y = this.hot.col.groundAt(p.x, p.z, 999).y; const E = Math.random() < 0.6 ? Raider : Math.random() < 0.5 ? Drone : Crawler; const e = new E(this, p, 1); e.state = 'search'; e.lastSeen = tgt.pos.clone(); this.enemies.push(e); list.push(e); }
    this.ai.formSquads(list); this.ui.feed('Hostile reinforcements spotted');
  }
  updateBuild(dt) {
    const I = this.input, B = this.build, BS = this.base.build;
    if (I.hit('KeyB')) { B.active = !B.active; document.getElementById('hud').classList.toggle('building', B.active); if (!B.active) { BS.showGhost(null); this.ui.buildBar(null); } this.ui.setHint(B.active ? '<b>BUILD MODE</b> · Wheel / 1-9: select piece · R: rotate · LMB: place · F: demolish (50% refund) · B: exit' : '<b>HAVEN</b> · Tab: loadout & stash · B: build mode · E: use consoles & benches'); }
    if (!B.active) return;
    if (I.wheel) B.sel = (B.sel + I.wheel + PIECE_ORDER.length) % PIECE_ORDER.length;
    for (let i = 1; i <= 9; i++) if (I.hit('Digit' + i)) B.sel = i - 1;
    if (I.hit('Digit0')) B.sel = 9;
    if (I.hit('KeyR')) B.rot = (B.rot + 1) % 4;
    const type = PIECE_ORDER[B.sel]; const cam = this.engine.camera; const o = cam.position.clone(); const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const head = this.player.pos.clone().setY(this.player.pos.y + 1.5); o.addScaledVector(d, Math.max(0, head.clone().sub(o).dot(d)));
    const hit = this.base.col.ray(o, d, 16);
    const afford = Object.entries(PIECES[type].cost).every(([k, n]) => this.stashCount(k) >= n);
    let spec = null, ok = false;
    if (hit) { spec = BS.specFromHit(type, hit, B.rot); ok = BS.supported(spec) && afford; }
    BS.showGhost(spec, ok); this.ui.buildBar(B.sel, spec, ok, afford);
    if (I.clicked & 1) {
      if (spec && ok) { for (const [k, n] of Object.entries(PIECES[type].cost)) this.stashAddItem(k, -n); BS.place(spec); audio.mech(this.player.pos, 'pump'); this.fx.dust(BS.ghost.position.clone(), 6, 0.3); this.save(); }
      else { audio.click(200, 0.1, 0.1, 'sawtooth'); this.ui.toast(!afford ? 'Not enough resources in stash' : 'Needs support (foundation / floor / wall below)'); }
    }
    if (I.hit('KeyF') && hit?.c?.build) {
      const p = hit.c.build; const deps = BS.dependents(p);
      for (const q of [p, ...deps]) { for (const [k, n] of Object.entries(PIECES[q.type].cost)) this.stashAddItem(k, Math.floor(n / 2)); BS.remove(q); }
      audio.explosion(this.player.pos, 0.1); this.ui.toast(`Demolished ${PIECES[p.type].name}`); this.save();
    }
  }
}
function sig(e) { return e.weapon ? 'w:' + e.weapon.id : e.mod ? 'm:' + e.mod : e.id + ':' + e.n; }

const game = new Game();
window.game = game;
game.boot().catch((e) => { console.error(e); document.getElementById('loadtxt').textContent = 'Error: ' + e.message; });
