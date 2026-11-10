// Dropzone — game orchestration: profile/stash, Haven base & construction, drop-pod insertion, raids, extraction.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Input, Player } from './player.js';
import { UI } from './ui.js';
import { Effects } from './effects.js';
import { audio } from './audio.js';
import { buildHotzone, DROP_ZONES, MAP_SIZE } from './hotzone.js';
import { buildBase, makePod, PLOT } from './base.js';
import { LootContainer, Pack, rollLoot, entryName, CONTAINER_INFO } from './loot.js';
import { Drone, Crawler, Strider, Sentinel, Raider } from './enemies.js';
import { ITEMS, WEAPONS, MODS, PIECES, PIECE_ORDER, DEFAULT_MODS } from './items.js';
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
    this.settings = { sens: 1, vol: 0.7, quality: 'high', fov: 72, ...(store.get(SET_KEY) || {}) };
    this.engine.baseFov = this.settings.fov; audio.setVolume(this.settings.vol); if (this.settings.quality !== 'high') this.engine.setQuality(this.settings.quality);
    this.mode = 'menu'; this.time = 0; this.enemies = []; this.rockets = []; this.raidLoot = []; this.shakeAmt = 0;
    this.scene.add(this.engine.camera);
    this.engine.renderer.domElement.addEventListener('click', () => { if (!this.ui.isOpen() && this.mode !== 'menu') { audio.init(); this.input.lock(); } });
  }
  async boot() {
    const step = (p, t) => new Promise((r) => { this.ui.loading(p, t); setTimeout(r, 30); });
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
    this.lift = this.makeLift(); this.lift.visible = false; this.scene.add(this.lift);
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
    this.world = W; this.fx && (this.fx.world = W); this.fx?.clear();
    if (kind === 'hot') this.engine.setAtmosphere({ elevation: 24, azimuth: 235, fog: 0xa8aea8, fogDensity: 0.0036, exposure: 0.85, turbidity: 7 });
    else this.engine.setAtmosphere({ elevation: 9, azimuth: 250, fog: 0xc0a088, fogDensity: 0.004, exposure: 0.95, turbidity: 9 });
  }
  toBase() {
    this.cleanupRaid(); this.mode = 'base'; this.setWorld(this.base, 'base'); this.ui.hideMenu(); this.ui.show(true);
    this.base.build.load(this.profile.base); this.syncPlayerFromProfile();
    const P = this.player; P.hp = P.maxHp; P.spawn(this.base.spawn, this.base.spawnYaw); P.op.root.visible = true; P.reattach(this.scene);
    this.build = { active: false, sel: 0, rot: 0 }; document.getElementById('hud').classList.remove('building'); this.ui.buildBar(null); this.base.build.showGhost(null); this.ui.setRaidInfo('Haven', null, '');
    this.ui.setHint('<b>HAVEN</b> · Tab: loadout & stash · B: build mode · E: use consoles & benches<br>Walk into the hangar and use the <b>Drop Pod Console</b> to deploy.');
    this.base.pod.visible = true; this.save();
  }
  makeLift() {
    const M = worldMats(); const g = new THREE.Group(); const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
    add(boxGeo(3.2, 2.6, 9, 2), M.machine, 0, 2.2, 0); add(boxGeo(2.6, 1.4, 3, 2), M.machine, 0, 2.6, -5.5, 0.25); add(boxGeo(2.4, 0.9, 1.6), M.glass, 0, 3.2, -5.6, 0.4);
    add(boxGeo(1.4, 1.6, 4, 2), M.machineDark, 0, 3.0, 5.6, -0.2); add(boxGeo(0.2, 2.2, 1.6), M.machine, 0, 4.4, 7.2, -0.3);
    add(boxGeo(10, 0.3, 1.6, 2), M.machineDark, 0, 3.4, 0.5);
    g.userData.rotors = [];
    for (const sx of [-1, 1]) { add(cylGeo(0.9, 0.9, 2.2, 14), M.machine, sx * 5.2, 3.4, 0.5, 0, 0, 0); const r = new THREE.Group(); r.position.set(sx * 5.2, 4.6, 0.5); g.add(r); const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.03, 32), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.3, depthWrite: false })); r.add(disc); for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(boxGeo(6.2, 0.04, 0.3), M.machineDark); b.rotation.y = i * 2.09; r.add(b); } g.userData.rotors.push(r); }
    for (const sx of [-1, 1]) add(boxGeo(0.2, 1.4, 0.2), M.steel, sx * 1.2, 0.6, 2.5); add(boxGeo(0.2, 1.2, 0.2), M.steel, 0, 0.6, -4);
    const ramp = add(boxGeo(2.6, 0.15, 3), M.plate, 0, 0.8, 5.6, -0.3); g.userData.ramp = ramp;
    for (const [x, z, c] of [[-5.2, 0.5, M.emRed], [5.2, 0.5, M.emCyan], [0, -7, M.emWarm]]) add(new THREE.SphereGeometry(0.15, 8, 6), c, x, 3.0, z);
    const L = new THREE.SpotLight(0xfff0d0, 0, 60, 0.6, 0.5, 1.2); L.position.set(0, 1, -6); L.target.position.set(0, -10, -6); g.add(L, L.target); g.userData.light = L;
    return g;
  }
  makeMapImage(W) {
    const N = 640, C = document.createElement('canvas'); C.width = C.height = N; const x = C.getContext('2d'); const img = x.createImageData(N, N); const T = W.terrain;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = (i + 0.5) / N * MAP_SIZE - MAP_SIZE / 2, wz = (j + 0.5) / N * MAP_SIZE - MAP_SIZE / 2;
      const h = T.height(wx, wz), s = T.splatAt(wx, wz); const nx = T.height(wx - 1, wz) - T.height(wx + 1, wz), nz = T.height(wx, wz - 1) - T.height(wx, wz + 1);
      const shade = Math.max(0.35, Math.min(1.3, 0.85 + (nx * 0.6 + nz * 0.4) * 0.25));
      let r = 74 * s[0] + 120 * s[1] + 128 * s[2] + 46 * s[3], g = 88 * s[0] + 100 * s[1] + 124 * s[2] + 46 * s[3], b = 50 * s[0] + 76 * s[1] + 116 * s[2] + 48 * s[3];
      const k = (j * N + i) * 4; const cont = Math.abs(((h / 6) % 1 + 1) % 1 - 0.5) > 0.47 ? 0.85 : 1;
      img.data[k] = r * shade * cont; img.data[k + 1] = g * shade * cont; img.data[k + 2] = b * shade * cont; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // buildings from colliders
    x.fillStyle = 'rgba(30,30,30,0.85)';
    for (const c of W.col.all) { if (c.noRay || c.hw > 40) continue; if (c.y1 - c.y0 < 1.5) continue; x.save(); x.translate((c.x + 320) / 640 * N, (c.z + 320) / 640 * N); x.rotate(-c.yaw); x.fillRect(-c.hw / 640 * N, -c.hd / 640 * N, c.hw * 2 / 640 * N, c.hd * 2 / 640 * N); x.restore(); }
    x.strokeStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * N / 8, 0); x.lineTo(i * N / 8, N); x.moveTo(0, i * N / 8); x.lineTo(N, i * N / 8); x.stroke(); }
    return C;
  }
  // ------------------------------------------------------------------ raid lifecycle
  startRaid(zoneId) {
    const z = DROP_ZONES.find((d) => d.id === zoneId);
    this.ui.fade(true); this.input.unlock();
    setTimeout(() => {
      this.mode = 'drop'; this.zone = z; this.setWorld(this.hot, 'hot'); this.profile.stats.raids++;
      // the gear you carry is "in the field" from now on
      const lo = this.profile.loadout; this.profile.stash.weapons = this.profile.stash.weapons.filter((w) => w.uid !== lo.primary && w.uid !== lo.secondary);
      this.raidStart = { items: structuredClone(this.pack.items) };
      this.raid = { t: RAID_TIME, kills: 0, looted: 0, elapsed: 0, extract: null, storm: false };
      const r = seeded((Math.random() * 1e9) | 0);
      const tx = z.pos[0] + (r() - 0.5) * 30, tz = z.pos[1] + (r() - 0.5) * 30;
      this.spawnRaidContent(new THREE.Vector3(tx, 0, tz));
      let gy = this.hot.col.groundAt(tx, tz, 999).y;
      this.dropPod = { pod: makePod(), target: new THREE.Vector3(tx, gy, tz), t: 0, y: gy + (location.search.includes('skipdrop') ? 0.5 : 420), v: 90, landed: false };
      this.dropPod.pod.position.set(tx, this.dropPod.y, tz); this.hot.root.add(this.dropPod.pod);
      this.player.spawn(new THREE.Vector3(tx, gy, tz + 2.2), 0); this.player.hp = this.player.maxHp; this.player.hidden = true; this.player.op.root.visible = false;
      this.ui.show(false); this.ui.setHint('');
      this.podLoop = audio.loop('fire'); this.ui.fade(false);
    }, 650);
  }
  spawnRaidContent(safe) {
    const W = this.hot, r = seeded((Math.random() * 1e9) | 0);
    this.containers = [];
    for (const l of W.loot) { if (r() < 0.12) continue; const c = new LootContainer(l.type, l.pos, l.yaw, r); W.root.add(c.mesh); this.containers.push(c); }
    this.enemies = [];
    for (const s of W.spawns) {
      if (s.type !== 'strider' && s.type !== 'sentinel' && r() < 0.15) continue;
      if (safe && s.type !== 'strider' && Math.hypot(s.pos.x - safe.x, s.pos.z - safe.z) < 55) continue; // nobody camps the landing spot
      const E = { drone: Drone, crawler: Crawler, strider: Strider, sentinel: Sentinel, raider: Raider }[s.type];
      const p = s.pos.clone(); p.y = W.col.groundAt(p.x, p.z, 999).y;
      this.enemies.push(new E(this, p, s.tier));
    }
    // two random active extracts
    const ex = [...W.extracts].sort(() => r() - 0.5); for (const e of W.extracts) e.active = false; ex[0].active = ex[1].active = true;
  }
  cleanupRaid() {
    for (const e of this.enemies) { e.remove(); if (e.col) this.hot.col.remove(e.col); } this.enemies = [];
    for (const c of this.containers || []) this.hot.root.remove(c.mesh); this.containers = [];
    for (const r of this.rockets) this.scene.remove(r.mesh); this.rockets = [];
    if (this.dropPod) { this.hot.root.remove(this.dropPod.pod); if (this.dropPod.col) this.hot.col.remove(this.dropPod.col); this.dropPod = null; }
    this.liftLoop?.stop(); this.liftLoop = null; this.alarm?.stop(); this.alarm = null; this.podLoop?.stop(); this.podLoop = null;
    this.lift.visible = false; this.raid = null;
  }
  spawnBag(pos, table, contents) {
    const c = new LootContainer('bag', pos.setY(this.world.col.groundAt(pos.x, pos.z, pos.y + 2).y), Math.random() * 6, Math.random, contents ? structuredClone(contents) : rollLoot(table, Math.random));
    if (!c.contents.length) return; this.world.root.add(c.mesh); (this.containers ||= []).push(c);
  }
  spawnRocket(from, to) {
    const M = worldMats(); const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8).rotateX(Math.PI / 2), M.steel); mesh.position.copy(from); this.scene.add(mesh);
    const v = to.clone().sub(from); const d = v.length(); v.normalize().multiplyScalar(32); v.y += d * 0.12;
    this.rockets.push({ mesh, v, t: 0 }); audio.gunshot('cannon', from, 1);
  }
  noise(pos, radius, src) { for (const e of this.enemies) if (e !== src && e.alive) e.hear(pos, radius); }
  onKill(e) { if (this.raid) this.raid.kills++; this.profile.stats.kills++; this.ui.feed(`Destroyed ${e.name}`); }
  shake(a) { this.player.shakeT = Math.min(1.5, this.player.shakeT + a); }
  compassMarks() {
    const out = [];
    if (this.mode === 'raid') { for (const e of this.hot.extracts) if (e.active) out.push({ x: e.pos[0], z: e.pos[1], icon: '◆', color: '#4ad6f0' }); if (this.dropPod) out.push({ x: this.dropPod.target.x, z: this.dropPod.target.z, icon: '▼', color: '#e8a832' }); }
    if (this.mode === 'base') { const c = this.base.interact[0]; out.push({ x: c.pos.x, z: c.pos.z, icon: '▼', color: '#e8a832' }); }
    return out;
  }
  onPlayerDeath() {
    if (this.mode !== 'raid') { this.player.hp = this.player.maxHp; this.player.dead = false; return; }
    this.mode = 'dead'; this.profile.stats.deaths++; this.ui.toast('You are down'); this.ui.prompt(null);
    const lost = [...this.player.weapons.filter(Boolean).map((w) => ({ weapon: { id: w.id, mods: w.mods } })), ...this.pack.items];
    const lo = this.profile.loadout; lo.primary = lo.secondary = null; lo.vest = null; lo.armor = 0; lo.pack = 'pack1'; this.profile.backpack = [];
    if (!this.profile.stash.weapons.length) { this.profile.stash.weapons.push({ uid: this.nextUid(), id: 'p9', mods: {} }); this.stashAddItem('a9', 45); this.stashAddItem('bandage', 1); this.loaner = true; }
    store.set(SAVE_KEY, { ...this.profile, base: this.base.build.serialize() });
    setTimeout(() => { this.input.unlock(); this.ui.show(false); this.ui.results({ ok: false, items: lost, time: RAID_TIME - this.raid.t, kills: this.raid.kills, looted: this.raid.looted }); if (this.loaner) { this.ui.toast('Quartermaster issued you a loaner P9'); this.loaner = false; } }, 3500);
  }
  extracted() {
    this.mode = 'extracted'; this.profile.stats.extracts++; const P = this.player; const lo = this.profile.loadout;
    const items = [...this.pack.items];
    // equipped weapons come home and stay equipped
    const keep = P.weapons.map((w) => { if (!w) return null; const uid = this.nextUid(); this.profile.stash.weapons.push({ uid, id: w.id, mods: { ...w.mods } }); return uid; });
    lo.primary = keep[0]; lo.secondary = keep[1]; lo.vest = P.vestId; lo.armor = P.armor;
    // backpack: ammo & meds of the kit stay packed; everything else goes to the stash
    const keepIds = new Set(['a9', 'a556', 'a762', 'a12', 'bandage', 'medkit', 'stim', 'plate']); const back = [];
    for (const e of this.pack.items) { if (e.id && keepIds.has(e.id)) back.push(e); else this.stashAdd(e); }
    this.profile.backpack = back;
    this.ui.fade(true); this.input.unlock();
    const gained = items.filter((e) => !(e.id && keepIds.has(e.id)) || !this.raidStart.items.some((s) => s.id === e.id));
    setTimeout(() => { this.ui.fade(false); this.ui.show(false); store.set(SAVE_KEY, { ...this.profile, base: this.base.build.serialize() }); this.ui.results({ ok: true, items: gained, time: RAID_TIME - this.raid.t, kills: this.raid.kills, looted: this.raid.looted }); }, 800);
  }
  onPanelClosed() { if (this.mode !== 'menu' && !this.ui.isOpen()) setTimeout(() => this.input.lock(), 0); }
  // ------------------------------------------------------------------ interaction
  findInteract() {
    const P = this.player, cam = this.engine.camera; const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); const eye = P.pos.clone(); eye.y += 1.4;
    let best = null, bs = -1;
    const consider = (pos, range, obj) => { const d = pos.distanceTo(eye); if (d > range) return; const dir = pos.clone().sub(eye).normalize(); const dot = dir.dot(fwd); if (dot < 0.55 && d > 1.2) return; const s = dot - d * 0.05; if (s > bs) { bs = s; best = obj; } };
    if (this.mode === 'raid') {
      for (const c of this.containers) { if (c.depleted || (c.opened && !c.contents?.length && c.info.node)) continue; if (c.opened && !c.contents?.length) continue; consider(c.pos.clone().setY(c.pos.y + 0.5), 2.6, { kind: 'loot', c, label: (c.opened ? 'Loot ' : c.info.node ? 'Salvage ' : 'Search ') + c.info.name, time: c.opened ? 0 : c.info.search }); }
      for (const e of this.hot.extracts) if (e.active && !this.raid.extract) consider(e.console.clone().setY(e.console.y + 1), 3, { kind: 'extract', e, label: `Call lift · ${e.name}`, time: 1.0 });
    } else if (this.mode === 'base') {
      for (const i of this.base.interact) consider(i.pos, 3, { kind: i.kind, label: i.label, time: 0 });
      for (const p of this.base.build.pieces) { const st = PIECES[p.type].station; if (!st || !p.obj) continue; consider(p.obj.position.clone().setY(p.obj.position.y + 1), 3, { kind: 'station', st, label: `Use ${PIECES[p.type].name}`, time: 0 }); }
    }
    return best;
  }
  doInteract(it) {
    if (it.kind === 'loot') {
      const c = it.c; const wasOpen = c.opened; const contents = c.open(0); if (!wasOpen) this.raid.looted++;
      if (c.info.node) { const got = []; for (const e of [...contents]) { const left = this.pack.add(e); if (left === 0) { got.push(e); contents.splice(contents.indexOf(e), 1); } else if (e.n) e.n = left; } for (const e of got) this.ui.feed(`+ ${entryName(e)}${e.n > 1 ? ' ×' + e.n : ''}`, 'loot'); if (contents.length) this.ui.toast('Backpack full'); else c.deplete(); audio.mech(c.pos, 'reload'); this.noise(c.pos, 25, null); }
      else { audio.mech(c.pos, 'empty'); this.ui.inventory(c); }
    } else if (it.kind === 'extract') { this.callLift(it.e); }
    else if (it.kind === 'launch') this.ui.launch();
    else if (it.kind === 'stash') this.ui.inventory();
    else if (it.kind === 'station') it.st === 'gunsmith' ? this.ui.gunsmith() : this.ui.craft(it.st);
  }
  callLift(e) {
    this.raid.extract = { e, t: 50, landed: false, wait: 40 }; this.ui.toast('Lift inbound — hold the LZ!'); this.alarm = audio.loop('alarm');
    this.noise(e.center, 160, null);
    // reinforcements converge
    const r = Math.random; for (let i = 0; i < 4; i++) { const a = r() * 6.28, d = 60 + r() * 30; const p = new THREE.Vector3(e.center.x + Math.cos(a) * d, 0, e.center.z + Math.sin(a) * d); p.y = this.hot.col.groundAt(p.x, p.z, 999).y; const E = i < 2 ? Drone : r() < 0.5 ? Raider : Crawler; const en = new E(this, p, 1); en.state = 'search'; en.lastSeen = e.center.clone(); this.enemies.push(en); }
  }
  // ------------------------------------------------------------------ per-frame
  frame(dt) {
    this.time += dt; const I = this.input, P = this.player, ui = this.ui;
    if (this.mode === 'menu') { const t = this.time * 0.05; this.engine.camera.position.set(Math.sin(t) * 40, 14, -10 + Math.cos(t) * 40); this.engine.camera.lookAt(0, 3, -30); this.engine.followSun(new THREE.Vector3(0, 0, -20)); this.base.build.update(dt, this.time); this.engine.render(dt, this.time); I.endFrame(); return; }
    // global keys
    if (I.hit('Escape') || (!I.locked && this.escPending)) {}
    if (!ui.isOpen()) {
      if (I.hit('Tab') && (this.mode === 'base' || this.mode === 'raid')) { ui.inventory(); }
      else if (I.hit('KeyM') && this.mode === 'raid') ui.raidMap();
    } else if (I.hit('Tab') || I.hit('KeyM')) ui.close();
    if (!I.locked && !ui.isOpen() && (this.mode === 'base' || this.mode === 'raid') && this.wasLocked) ui.pause();
    this.wasLocked = I.locked;
    // drop-pod descent cinematic
    if (this.mode === 'drop') this.updateDrop(dt);
    const frozen = ui.isOpen() || this.mode === 'drop' || this.mode === 'extracted';
    if (this.mode === 'base' || this.mode === 'raid' || this.mode === 'dead') {
      // build mode
      if (this.mode === 'base' && !frozen) this.updateBuild(dt);
      P.update(dt, I, { frozen, build: this.build?.active });
      // interaction
      if (!frozen && !P.dead && !(this.build?.active)) {
        const it = this.findInteract();
        if (it) { if (I.down('KeyE')) { this.holdT = (this.holdKey === it.label ? this.holdT : 0) + dt; this.holdKey = it.label; if (this.holdT >= it.time) { this.holdT = 0; this.holdKey = null; this.doInteract(it); I.keys.delete('KeyE'); } } else this.holdT = 0; ui.prompt(it.label, it.time ? Math.min(1, this.holdT / it.time) : 0); }
        else { ui.prompt(null); this.holdT = 0; }
      } else ui.prompt(null);
    }
    if (this.mode === 'raid' || this.mode === 'dead' || this.mode === 'extracted') this.updateRaid(dt);
    if (this.mode === 'base') this.base.build.update(dt, this.time);
    // listener + fx
    const cam = this.engine.camera; audio.listener.x = cam.position.x; audio.listener.y = cam.position.y; audio.listener.z = cam.position.z; audio.listener.yaw = this.mode === 'drop' ? 0 : P.yaw;
    this.fx.update(dt, this.scene.fog);
    if (this.world.terrain.grassTime) this.world.terrain.grassTime.value = this.time;
    this.engine.followSun(this.mode === 'drop' ? this.dropPod.pod.position : P.pos);
    if (this.mode !== 'drop') ui.update(dt);
    if (!this.noRender) this.engine.render(dt, this.time);
    I.endFrame();
  }
  updateDrop(dt) {
    const D = this.dropPod, cam = this.engine.camera; D.t += dt;
    const alt = D.y - D.target.y;
    if (!D.landed) {
      const brake = alt < 70; D.v += ((brake ? 14 : 95) - D.v) * Math.min(1, dt * (brake ? 2.2 : 0.5));
      D.y -= D.v * dt; D.pod.position.set(D.target.x, D.y, D.target.z); D.pod.rotation.y += dt * 0.6;
      this.fx.trail(D.pod.position.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3(0, -D.v, 0));
      if (brake) for (let i = 0; i < 3; i++) this.fx.add.emit({ p: D.pod.position.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 3, -25, (Math.random() - 0.5) * 3), life: 0.25, s0: 0.8, s1: 0.2, c: new THREE.Color(0x9ad8ff), a0: 1, a1: 0 });
      this.podLoop?.set(null, Math.min(0.5, D.v / 200));
      const a = D.t * 0.25; const dist = 14 + Math.min(1, alt / 300) * 10;
      cam.position.set(D.target.x + Math.sin(a) * dist, D.y + 6 + Math.min(1, alt / 300) * 8, D.target.z + Math.cos(a) * dist); cam.lookAt(D.pod.position.x, D.y - 6, D.pod.position.z);
      this.player.shakeT = 0.3;
      if (D.y <= D.target.y) {
        D.landed = true; D.y = D.target.y; D.pod.position.y = D.target.y; this.fx.dust(D.target, 40, 1.2); this.fx.explosion(D.target.clone().setY(D.target.y + 0.5), 0.4); audio.explosion(D.target, 0.8); this.podLoop?.stop(); this.podLoop = null;
        D.col = this.hot.col.box(D.target.x, D.target.z, 2.4, 2.4, D.target.y, D.target.y + 4.5, 0, 'metal'); D.landT = 0;
        this.noise(D.target, 45, null);
      }
    } else {
      D.landT += dt; const door = D.pod.userData.door; if (D.landT > 0.7 && door.parent === D.pod) { D.pod.remove(door); door.position.copy(D.pod.localToWorld(new THREE.Vector3(0, 1.6, -1.6))); this.hot.root.add(door); D.door = door; D.doorV = new THREE.Vector3(Math.sin(D.pod.rotation.y + Math.PI) * -6, 4, Math.cos(D.pod.rotation.y + Math.PI) * -6); audio.mech(D.target, 'pump'); }
      if (D.door && D.doorV) { D.doorV.y -= 20 * dt; D.door.position.addScaledVector(D.doorV, dt); D.door.rotation.x += dt * 5; const gy = this.hot.terrain.height(D.door.position.x, D.door.position.z); if (D.door.position.y < gy + 0.1) { D.door.position.y = gy + 0.1; D.doorV = null; D.door.rotation.x = Math.PI / 2; } }
      if (D.landT > 1.4) {
        this.mode = 'raid'; const P = this.player; const fwd = D.pod.localToWorld(new THREE.Vector3(0, 0, -4.6)); P.spawn(new THREE.Vector3(fwd.x, D.target.y, fwd.z), D.pod.rotation.y); P.hidden = false; P.op.root.visible = true; P.reattach(this.scene);
        this.ui.show(true); this.input.lock(); this.ui.toast(`Deployed: ${this.zone.name}`);
        this.ui.setHint('Loot containers (hold <b>E</b>) and salvage resources. Find an active <b>LZ</b> (◆ on compass, <b>M</b> for map) to extract.');
        setTimeout(() => this.ui.setHint(''), 15000);
      }
    }
  }
  updateRaid(dt) {
    const R = this.raid; if (!R) return; const P = this.player;
    if (this.mode === 'raid') { R.t -= dt; if (R.t <= 0 && !R.storm) { R.storm = true; this.ui.toast('Storm surge! Extract immediately'); } if (R.storm) { this.stormTick = (this.stormTick || 0) + dt; if (this.stormTick > 1) { this.stormTick = 0; P.damage(6, null); } } }
    const ex = R.extract; let obj = '';
    if (ex) {
      const d = P.pos.distanceTo(ex.e.center);
      if (!ex.landed) { ex.t -= dt; obj = `Lift arriving in ${Math.ceil(ex.t)}s — defend ${ex.e.name}`; if (Math.random() < dt * 8) this.fx.flare(ex.e.console.clone().setY(ex.e.console.y + 6.2));
        if (ex.t < 12) { this.lift.visible = true; const k = ex.t / 12; this.lift.position.set(ex.e.center.x + k * 60, ex.e.center.y + 1 + k * k * 80, ex.e.center.z - k * 40); this.lift.rotation.y = 0.6 * k; if (!this.liftLoop) this.liftLoop = audio.loop('engine'); this.liftLoop?.set(this.lift.position, 1.4); this.lift.userData.light.intensity = 80; }
        if (ex.t <= 0) { ex.landed = true; this.alarm?.stop(); this.alarm = null; this.ui.toast('Lift is on the pad — get aboard!'); this.fx.dust(ex.e.center, 30, 1); } }
      else { ex.wait -= dt; obj = `Board the lift! (${Math.ceil(ex.wait)}s)`; this.lift.position.set(ex.e.center.x, ex.e.center.y + 1 + Math.sin(this.time * 2) * 0.05, ex.e.center.z); this.liftLoop?.set(this.lift.position, 1.4);
        if (d < 6 && this.mode === 'raid') { this.ui.toast('Extracting…'); this.extracted(); }
        if (ex.wait <= 0 && this.mode === 'raid') { this.ui.toast('The lift left without you. Call another.'); R.extract = null; this.lift.visible = false; this.liftLoop?.stop(); this.liftLoop = null; } }
      for (const r of this.lift.userData.rotors) r.rotation.y += dt * 30;
    } else if (this.mode === 'raid') obj = R.t < 300 ? 'Head to an active LZ' : '';
    if (this.mode === 'raid') this.ui.setRaidInfo(this.zone.name, R.t, obj);
    // enemies (simulate those near the player)
    for (const e of this.enemies) { const d2 = e.pos.distanceToSquared(P.pos); if (d2 < 240 * 240 || e.state === 'attack' || e.type === 'strider') e.update(dt, this.time); }
    // loot glints
    const cp = this.engine.camera.position; for (const c of this.containers) c.update(this.time, cp);
    // rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]; r.t += dt; r.v.y -= 6 * dt; const step = r.v.clone().multiplyScalar(dt); const L = step.length();
      const h = this.hot.col.ray(r.mesh.position, step.clone().divideScalar(L), L); r.mesh.position.add(step); r.mesh.lookAt(r.mesh.position.clone().add(r.v));
      this.fx.trail(r.mesh.position.clone(), r.v.clone().multiplyScalar(0.1));
      const hitP = h || P.pos.distanceTo(r.mesh.position) < 1.2 || r.t > 6;
      if (hitP) { const p = h ? h.point : r.mesh.position.clone(); this.fx.explosion(p, 1); audio.explosion(p, 1); this.scene.remove(r.mesh); this.rockets.splice(i, 1); const d = P.pos.distanceTo(p); if (d < 7) P.damage(70 * (1 - d / 7), p); this.shake(Math.max(0, 1 - d / 30)); }
    }
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

const game = new Game();
window.game = game;
game.boot().catch((e) => { console.error(e); document.getElementById('loadtxt').textContent = 'Error: ' + e.message; });
