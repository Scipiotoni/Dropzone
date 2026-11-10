// Hostiles: machine drones, crawlers, the giant Strider walker, sentinel turrets, and human raiders.
// Shared perception (sight + hearing), hitscan combat with weak points, loot drops on death.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { worldMats } from './props.js';
import { Operator } from './character.js';
import { buildGun } from './guns.js';
import { audio } from './audio.js';
import { WeaponAnimator } from './anim.js';
import { WEAPONS } from './items.js';
import { gunSound } from './player.js';

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V();
let EM = null;
function emats() {
  if (EM) return EM; const M = worldMats();
  EM = { hull: M.machine, dark: M.machineDark, steel: M.steel, rubber: M.rubber, eye: new THREE.MeshBasicMaterial({ color: 0xff2a10, toneMapped: false }), eyeAlert: new THREE.MeshBasicMaterial({ color: 0xffd020, toneMapped: false }),
    core: new THREE.MeshBasicMaterial({ color: 0x40e0ff, toneMapped: false }), rotor: new THREE.MeshBasicMaterial({ color: 0x202020, transparent: true, opacity: 0.35, depthWrite: false }), orange: M.orange,
    beam: new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }) };
  return EM;
}
const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
function mk(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
const cylZ = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

let NEXT_ID = 1;
export function resetEnemyIds(n = 1) { NEXT_ID = n; }
const TYPE_CODE = { drone: 0, crawler: 1, strider: 2, sentinel: 3, raider: 4 };
export const TYPE_BY_CODE = ['drone', 'crawler', 'strider', 'sentinel', 'raider'];
class Enemy {
  constructor(game, pos, cfg) {
    this.game = game; this.pos = pos.clone(); this.home = pos.clone(); this.vel = V(); this.yaw = Math.random() * 6.28; this.alive = true; this.hp = this.maxHp = cfg.hp;
    this.id = cfg.id ?? NEXT_ID++; if (this.id >= NEXT_ID) NEXT_ID = this.id + 1;
    this.state = 'idle'; this.alert = 0; this.lastSeen = null; this.fireCD = 1 + Math.random(); this.burst = 0; this.wanderT = 0; this.wander = pos.clone(); this.seeT = 0; this.stuck = 0;
    this.root = new THREE.Group(); this.root.position.copy(pos); game.scene.add(this.root);
    this.hitboxes = []; this.flashT = 0; this.puppet = false; this.netPos = pos.clone(); this.netYaw = this.yaw; this.netFlags = 1; this.netPitch = 0;
  }
  get player() { return this._t || this.game.player; }
  get D() { return this.game.ai.doctrineFor(this.player); }
  canSee(range, fov = 2.2) {
    const P = this.player; if (!P || P.dead || P.hidden) return false;
    const eye = this.eyePos(_a), tgt = _b.copy(P.pos); tgt.y += P.crouch ? 1.0 : 1.5;
    const d = eye.distanceTo(tgt); if (d > range * (P.crouch ? 0.7 : 1) * (P.inVehicle ? 1.4 : 1)) return false;
    const dir = _c.copy(tgt).sub(eye).normalize(); const fwd = _d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (d > 8 && Math.acos(THREE.MathUtils.clamp(dir.x * fwd.x + dir.z * fwd.z, -1, 1)) > fov / 2 && this.alert < 0.5) return false;
    if (this.game.ai.smokeBlocks(eye, tgt)) return false;
    return this.game.world.col.clear(eye, tgt);
  }
  hear(pos, radius, impact) {
    if (!this.alive) return; if (impact && this.D.investigateImpacts) radius *= 3; else if (impact) return;
    const d = this.pos.distanceTo(pos); if (d < radius) { this.alert = Math.max(this.alert, 0.6); this.lastSeen = pos.clone(); if (this.state === 'idle') this.state = 'search'; }
  }
  hitTest(o, d, maxT) {
    let best = null;
    for (const h of this.hitboxes) {
      const c = h.obj.getWorldPosition(_a); if (h.off) c.add(h.off);
      const oc = _b.copy(o).sub(c); const b = oc.dot(d); const cc = oc.lengthSq() - h.r * h.r; const disc = b * b - cc; if (disc < 0) continue;
      const t = -b - Math.sqrt(disc); if (t < 0 || t > maxT) continue;
      if (!best || t < best.t) best = { t, mult: h.mult, tag: h.tag, enemy: this };
    }
    return best;
  }
  damage(n, hit, from, byMe = false, byPeer = null) {
    if (!this.alive) return;
    if (this.puppet) { if (byMe) this.game.net?.event('eh', [this.id, Math.round(n), hit?.tag || '']); this.flashT = 0.08; this.hitFx(hit); return; }
    if (byMe) this.lastHitBy = 'me'; else if (byPeer) this.lastHitBy = byPeer;
    this.hp -= n; this.alert = 1; this.state = 'attack'; this.lastSeen = (from || this.player.pos).clone(); this.flashT = 0.08; this.hitFx(hit); this.onHurt?.(n, from);
    if (this.hp <= 0) { this.hp = 0; this.die(); this.game.net?.event('ek', [this.id, this.lastHitBy === 'me' ? this.game.net.me : this.lastHitBy || '']); if (this.lastHitBy === 'me') this.game.onKill(this); }
  }
  hitFx(hit) { this.game.fx.impact(hit?.point || this.pos.clone().setY(this.pos.y + 1), null, this.type === 'raider' ? 'flesh' : 'machine'); }
  tickEngage(dt, see) { this.engageT = see ? (this.engageT || 0) + dt : Math.max(0, (this.engageT || 0) - dt * 2); }
  turnTo(target, dt, rate = 4) { const want = Math.atan2(-(target.x - this.pos.x), -(target.z - this.pos.z)); let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += THREE.MathUtils.clamp(dy, -rate * dt, rate * dt); return Math.abs(dy); }
  // hitscan at the current target with distance-based spread; first shots of an engagement go wide
  shootAt(muzzlePos, dmg, spreadDeg, kind, color = 0xffa040, aimAt = null) {
    const P = this.player; const tgt = aimAt ? aimAt.clone() : _b.copy(P.pos).setY(P.pos.y + (P.crouch ? 0.9 : 1.3));
    const dir = tgt.clone().sub(muzzlePos); const dist = dir.length(); dir.normalize();
    const moveFactor = Math.min(1, P.vel.length() / 6) * 1.5;
    const settle = 1 + 2.5 * Math.max(0, 1 - (this.engageT || 0) / 3);
    const sp = THREE.MathUtils.degToRad(spreadDeg * (1 + moveFactor) * settle * (P.crouch ? 0.85 : 1) * (dist > 40 ? 1 + (dist - 40) / 40 : 1) / this.D.accuracy * (aimAt ? 2.2 : 1));
    dir.x += (Math.random() - 0.5) * sp * 2; dir.y += (Math.random() - 0.5) * sp * 2; dir.z += (Math.random() - 0.5) * sp * 2; dir.normalize();
    const wh = this.game.world.col.ray(muzzlePos, dir, dist + 5, { skipNonSolid: true });
    const toP = _c.copy(P.pos).setY(P.pos.y + (P.crouch ? 0.9 : 1.3)).sub(muzzlePos); const along = toP.dot(dir); const perp = toP.addScaledVector(dir, -along).length();
    const end = muzzlePos.clone().addScaledVector(dir, wh ? wh.t : dist + 30);
    if (perp < 0.45 && along > 0 && (!wh || wh.t > along - 0.5) && !this.game.ai.smokeBlocks(muzzlePos, P.pos)) { P.damage(dmg, muzzlePos, this.type); end.copy(muzzlePos).addScaledVector(dir, along); }
    else if (wh) this.game.fx.impact(wh.point, wh.normal, wh.mat);
    this.game.fx.tracer(muzzlePos, end, color, 260);
    audio.gunshot(kind, muzzlePos, 1);
    this.game.noise(muzzlePos, 60, this);
    this.game.net?.event('es', [+muzzlePos.x.toFixed(1), +muzzlePos.y.toFixed(1), +muzzlePos.z.toFixed(1), +end.x.toFixed(1), +end.y.toFixed(1), +end.z.toFixed(1), KIND.indexOf(kind), color]);
  }
  dropLoot(table) { if (!this.puppet) this.game.spawnBag(this.pos.clone(), table); }
  remove() { this.game.scene.remove(this.root); this.hum?.stop(); this.hum = null; if (this.col) this.game.world.col.remove(this.col); }
  eyePos(out) { return out.copy(this.pos).setY(this.pos.y + 1.5); }
  // ---- networking: compact state for host snapshots / puppets on clients
  netState() { return [this.id, TYPE_CODE[this.type], Math.round(this.pos.x * 10), Math.round(this.pos.y * 10), Math.round(this.pos.z * 10), Math.round(this.yaw * 100), Math.round(this.hp / this.maxHp * 100), (this.alive ? 1 : 0) | (this.state === 'attack' ? 2 : 0) | (this.crouch ? 4 : 0) | (this.reloading ? 8 : 0), Math.round((this.pitch || 0) * 100), this.tier || 0]; }
  applyNet(a) { this.netPos.set(a[2] / 10, a[3] / 10, a[4] / 10); this.netYaw = a[5] / 100; this.hp = a[6] / 100 * this.maxHp; this.netFlags = a[7]; this.netPitch = a[8] / 100; this.state = a[7] & 2 ? 'attack' : 'idle'; this.lastNet = performance.now(); if (!(a[7] & 1) && this.alive) { this.alive = false; this.die(true); } }
  puppetBase(dt) { const k = Math.min(1, dt * 10); const before = _d.copy(this.pos); this.pos.lerp(this.netPos, k); let dy = this.netYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * k; return before.distanceTo(this.pos); }
}
const KIND = ['pistol', 'smg', 'rifle', 'heavy', 'shotgun', 'drone', 'cannon', 'laser'];
export const SHOT_KINDS = KIND;

// ------------------------------------------------------------------ Gnat drone
export class Drone extends Enemy {
  constructor(game, pos) {
    super(game, pos, { hp: 70 }); this.type = 'drone'; this.name = 'Gnat Drone';
    const E = emats(), R = this.root; this.body = new THREE.Group(); R.add(this.body);
    mk(rbox(0.55, 0.22, 0.7, 0.07), E.hull, this.body);
    mk(rbox(0.4, 0.1, 0.5, 0.04), E.dark, this.body, 0, 0.14, 0.03);
    mk(rbox(0.22, 0.16, 0.18, 0.04), E.dark, this.body, 0, -0.12, -0.3);       // sensor housing
    this.eye = mk(new THREE.SphereGeometry(0.055, 12, 8), E.eye, this.body, 0, -0.12, -0.39);
    mk(cylZ(0.025, 0.3), E.steel, this.body, 0.08, -0.2, -0.3); mk(cylZ(0.025, 0.3), E.steel, this.body, -0.08, -0.2, -0.3); // twin barrels
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, -0.2, -0.47); this.body.add(this.muzzle);
    mk(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4), E.steel, this.body, 0.15, 0.3, 0.2);
    this.rotors = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const arm = mk(rbox(0.5, 0.05, 0.07, 0.02), E.dark, this.body, sx * 0.4, 0.02, sz * 0.36, 0, sx * sz * 0.7, 0);
      mk(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 12), E.hull, this.body, sx * 0.6, 0.06, sz * 0.52);
      const rot = new THREE.Group(); rot.position.set(sx * 0.6, 0.14, sz * 0.52); this.body.add(rot);
      mk(new THREE.CylinderGeometry(0.3, 0.3, 0.005, 24), E.rotor, rot); mk(rbox(0.6, 0.008, 0.05, 0.004), E.dark, rot);
      mk(new THREE.TorusGeometry(0.31, 0.012, 4, 24).rotateX(Math.PI / 2), E.dark, this.body, sx * 0.6, 0.14, sz * 0.52);
      this.rotors.push(rot);
    }
    this.hitboxes = [{ obj: this.body, r: 0.45, mult: 1, tag: 'body' }, { obj: this.eye, r: 0.12, mult: 2.2, tag: 'eye' }];
    this.alt = 5 + Math.random() * 4; this.pos.y = game.world.terrain.height(pos.x, pos.z) + this.alt;
    this.hum = audio.loop('drone');
  }
  eyePos(out) { return this.eye.getWorldPosition(out); }
  puppetUpdate(dt, t) { if (!this.alive) return this.update(dt, t); this.puppetBase(dt); this.root.position.copy(this.pos); this.body.rotation.set(0, this.yaw, 0, 'YXZ'); for (const r of this.rotors) r.rotation.y += dt * 60; this.eye.material = this.netFlags & 2 ? emats().eye : emats().eyeAlert; this.hum?.set(this.pos, 0.18); }
  update(dt, t) {
    if (!this.alive) { this.vel.y -= 14 * dt; this.pos.addScaledVector(this.vel, dt); this.body.rotation.x += dt * 4; this.body.rotation.z += dt * 3; const gy = this.game.world.terrain.height(this.pos.x, this.pos.z); if (this.pos.y < gy + 0.2) { if (!this.crashed) { this.crashed = true; this.game.fx.explosion(this.pos, 0.5); audio.explosion(this.pos, 0.5); this.dropLoot('m_drone'); } this.pos.y = gy + 0.2; this.vel.set(0, 0, 0); } this.root.position.copy(this.pos); return; }
    const P = this.player; const see = this.canSee(70); this.tickEngage(dt, see);
    if (see) { this.seeT += dt; this.alert = Math.min(1, this.alert + dt * 1.5); this.lastSeen = P.pos.clone(); if (this.seeT > 0.4 && this.state !== 'attack') { this.state = 'attack'; this.game.swarm(this, 90); } } else this.seeT = 0;
    let target;
    if (this.state === 'attack' && this.lastSeen) {
      const d = this.pos.distanceTo(this.lastSeen);
      // against long-range players drones try to get behind them; otherwise orbit
      const behind = this.D.machineFlank ? P.yaw + (this.id % 2 ? 0.6 : -0.6) : null;
      const orbit = behind !== null ? behind + Math.PI / 2 * 0 : t * 0.4 + this.home.x;
      target = behind !== null ? _a.copy(this.lastSeen).add(_b.set(Math.sin(behind) * 18, 0, Math.cos(behind) * 18)) : _a.copy(this.lastSeen).add(_b.set(Math.cos(orbit) * 16, 0, Math.sin(orbit) * 16));
      this.turnTo(this.lastSeen, dt, 3);
      this.fireCD -= dt;
      if (see && this.fireCD <= 0) { if (this.burst <= 0) this.burst = 4; this.shootAt(this.muzzle.getWorldPosition(_c), 5, 2.4, 'drone', 0xff6040); this.burst--; this.fireCD = this.burst > 0 ? 0.12 : 1.6 + Math.random(); }
      if (!see && d < 6) { this.state = 'search'; }
    } else if (this.state === 'search' && this.lastSeen) { target = this.lastSeen; this.turnTo(target, dt, 2); if (this.pos.distanceTo(target) < 8) { this.state = 'idle'; this.alert *= 0.5; } }
    else { this.wanderT -= dt; if (this.wanderT <= 0) { this.wanderT = 4 + Math.random() * 5; this.wander.set(this.home.x + (Math.random() - 0.5) * 50, 0, this.home.z + (Math.random() - 0.5) * 50); } target = this.wander; this.turnTo(target, dt, 1.2); }
    // fly toward target at altitude
    const gy = this.game.world.terrain.height(this.pos.x, this.pos.z);
    const want = _d.set(target.x - this.pos.x, 0, target.z - this.pos.z); const L = want.length(); const spd = this.state === 'attack' ? 7 : 3.5;
    if (L > 1) want.multiplyScalar(spd / L); else want.set(0, 0, 0);
    this.vel.x += (want.x - this.vel.x) * dt * 2; this.vel.z += (want.z - this.vel.z) * dt * 2;
    const ty = gy + this.alt + Math.sin(t * 1.3 + this.home.z) * 0.6; this.vel.y += ((ty - this.pos.y) * 1.5 - this.vel.y) * dt * 3;
    this.pos.addScaledVector(this.vel, dt);
    const [rx, rz] = this.game.world.col.resolve(this.pos.x, this.pos.z, 0.8, this.pos.y - 0.5, 1.0, 0); this.pos.x = rx; this.pos.z = rz;
    this.root.position.copy(this.pos); this.body.rotation.set(-this.vel.z * 0.03 * Math.cos(this.yaw) + this.vel.x * 0.03 * Math.sin(this.yaw), this.yaw, 0, 'YXZ');
    for (const r of this.rotors) r.rotation.y += dt * 60;
    this.eye.material = this.alert > 0.5 ? emats().eye : emats().eyeAlert;
    this.hum?.set(this.pos, 0.18);
  }
  die() { this.alive = false; this.vel.set((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3); this.hum?.stop(); this.hum = null; }
}

// ------------------------------------------------------------------ Skitter crawler (quadruped)
export class Crawler extends Enemy {
  constructor(game, pos) {
    super(game, pos, { hp: 160 }); this.type = 'crawler'; this.name = 'Skitter';
    const E = emats(), R = this.root; this.body = new THREE.Group(); this.body.position.y = 0.75; R.add(this.body);
    mk(rbox(0.8, 0.35, 1.1, 0.1), E.hull, this.body);
    mk(rbox(0.6, 0.15, 0.8, 0.05), E.dark, this.body, 0, 0.22, 0.05);
    for (const sx of [-1, 1]) mk(rbox(0.06, 0.2, 0.7, 0.02), E.orange, this.body, sx * 0.41, 0, 0);
    this.head = new THREE.Group(); this.head.position.set(0, 0.12, -0.6); this.body.add(this.head);
    mk(rbox(0.38, 0.24, 0.32, 0.06), E.dark, this.head);
    this.eye = mk(new THREE.SphereGeometry(0.06, 12, 8), E.eye, this.head, 0, 0.03, -0.17);
    for (const sx of [-1, 1]) mk(cylZ(0.03, 0.4), E.steel, this.head, sx * 0.12, -0.06, -0.25);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, -0.06, -0.47); this.head.add(this.muzzle);
    this.core = mk(new THREE.SphereGeometry(0.12, 12, 8), E.core, this.body, 0, 0.15, 0.5);
    this.legs = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.42, 0, sz * 0.4); this.body.add(hip);
      mk(new THREE.SphereGeometry(0.1, 10, 8), E.dark, hip);
      const up = new THREE.Group(); hip.add(up); mk(rbox(0.1, 0.1, 0.6, 0.03).translate(0, 0, -0.3), E.hull, up); up.rotation.set(0, sx * Math.PI / 2 - sx * sz * 0.5, 0);
      const kn = new THREE.Group(); kn.position.z = -0.6; up.add(kn); mk(new THREE.SphereGeometry(0.07, 8, 6), E.dark, kn);
      const lo = new THREE.Group(); kn.add(lo); mk(rbox(0.07, 0.07, 0.8, 0.02).translate(0, 0, -0.4), E.steel, lo); mk(new THREE.ConeGeometry(0.05, 0.15, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.85), E.dark, lo);
      this.legs.push({ hip, up, kn, lo, sx, sz, ph: (sx * sz > 0 ? 0 : Math.PI) });
    }
    this.hitboxes = [{ obj: this.body, r: 0.55, mult: 1, tag: 'body' }, { obj: this.head, r: 0.22, mult: 1.6, tag: 'head' }, { obj: this.core, r: 0.14, mult: 3, tag: 'core' }];
    this.gait = 0; this.hum = audio.loop('servo');
  }
  eyePos(out) { return this.eye.getWorldPosition(out); }
  puppetUpdate(dt, t) { if (!this.alive) return this.update(dt, t); const moved = this.puppetBase(dt); this.pos.y = this.game.world.col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6).y; this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; this.gaitAnim(moved, moved / Math.max(dt, 1e-3)); this.head.rotation.x = this.netPitch; this.eye.material = this.netFlags & 2 ? emats().eye : emats().eyeAlert; }
  gaitAnim(moved, spd) { this.gait += moved * 4; for (const L of this.legs) { const s = Math.sin(this.gait + L.ph); L.up.rotation.x = 0.55 + Math.max(0, s) * 0.35; L.kn.rotation.x = -1.6 - Math.max(0, s) * 0.3; L.hip.rotation.y = Math.cos(this.gait + L.ph) * 0.3 * Math.min(1, spd); } this.body.position.y = 0.75 + Math.abs(Math.sin(this.gait * 2)) * 0.04; }
  update(dt, t) {
    if (!this.alive) { this.deadT = (this.deadT || 0) + dt; this.body.position.y = Math.max(0.2, 0.75 - this.deadT * 2); this.body.rotation.z = Math.min(0.4, this.deadT); return; }
    const P = this.player, W = this.game.world; const see = this.canSee(55); this.tickEngage(dt, see);
    if (see) { this.seeT += dt; this.alert = 1; this.lastSeen = P.pos.clone(); if (this.seeT > 0.3) this.state = 'attack'; } else this.seeT = 0;
    let target = null, spd = 0;
    if (this.state === 'attack' && this.lastSeen) {
      const d = this.pos.distanceTo(this.lastSeen);
      // pack hunting: each crawler takes its own approach angle so they encircle; against rushers they kite at range
      const kite = this.D.band === 'close'; const ang = (this.id * 2.39) % 6.28; const ring = kite ? 16 : 6;
      target = _e.copy(this.lastSeen).add(_f.set(Math.sin(ang) * ring, 0, Math.cos(ang) * ring));
      const dt2 = this.pos.distanceTo(target); spd = dt2 > 10 ? 6.5 : dt2 > 3 ? 3 : 0; if (kite && d < 10) { spd = 4; target = _e.copy(this.pos).multiplyScalar(2).sub(this.lastSeen); }
      if (!see) spd = 5;
      this.turnTo(see ? this.lastSeen : target, dt, 5); this.moveYaw = Math.atan2(-(target.x - this.pos.x), -(target.z - this.pos.z));
      this.fireCD -= dt;
      if (see && this.fireCD <= 0) { if (this.burst <= 0) this.burst = 6; this.shootAt(this.muzzle.getWorldPosition(_c), 5, 2.0, 'laser', 0xff3020); this.burst--; this.fireCD = this.burst > 0 ? 0.1 : 1.9; }
      if (!see && d < 3) this.state = 'search';
    } else if (this.state === 'search' && this.lastSeen) { target = this.lastSeen; spd = 3.5; this.turnTo(target, dt, 3); if (this.pos.distanceTo(target) < 3) { this.state = 'idle'; } }
    else { this.wanderT -= dt; if (this.wanderT <= 0) { this.wanderT = 3 + Math.random() * 6; this.wander.set(this.home.x + (Math.random() - 0.5) * 30, 0, this.home.z + (Math.random() - 0.5) * 30); } target = this.wander; spd = this.pos.distanceTo(_a.set(target.x, this.pos.y, target.z)) > 2 ? 1.6 : 0; this.turnTo(target, dt, 2); }
    // move toward the chosen point (independent of where the turret faces)
    const my = this.state === 'attack' && this.moveYaw !== undefined ? this.moveYaw : this.yaw; this.moveYaw = undefined;
    const fx = -Math.sin(my), fz = -Math.cos(my);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += fx * spd * dt; this.pos.z += fz * spd * dt;
    const [rx, rz] = W.col.resolve(this.pos.x, this.pos.z, 0.7, this.pos.y, 1.2); this.pos.x = rx; this.pos.z = rz;
    const moved = Math.hypot(rx - ox, rz - oz); if (spd > 0 && moved < spd * dt * 0.3) { this.stuck += dt; if (this.stuck > 0.6) { this.yaw += (Math.random() < 0.5 ? 1 : -1) * 1.4; this.stuck = 0; } } else this.stuck = 0;
    this.pos.y = W.col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6).y;
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    this.gaitAnim(moved, spd);
    if (this.lastSeen && this.state === 'attack') { const want = Math.atan2(this.lastSeen.y + 1 - (this.pos.y + 0.9), Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z)); this.head.rotation.x = want; this.pitch = want; }
    this.eye.material = this.alert > 0.5 ? emats().eye : emats().eyeAlert;
    this.hum?.set(this.pos, spd > 0 ? 0.08 : 0.03);
  }
  die() { this.alive = false; this.hum?.stop(); this.hum = null; this.game.fx.explosion(this.pos.clone().setY(this.pos.y + 0.8), 0.6); audio.explosion(this.pos, 0.6); this.dropLoot('m_crawler'); }
}

// ------------------------------------------------------------------ Strider (giant bipedal walker, boss)
export class Strider extends Enemy {
  constructor(game, pos) {
    super(game, pos, { hp: 1800 }); this.type = 'strider'; this.name = 'Juggernaut Strider';
    const E = emats(), R = this.root; R.scale.setScalar(1);
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 4.2; R.add(this.pelvis);
    mk(rbox(2.2, 1.0, 1.6, 0.2), E.dark, this.pelvis);
    this.torso = new THREE.Group(); this.torso.position.y = 0.6; this.pelvis.add(this.torso);
    mk(rbox(3.0, 1.8, 2.4, 0.3), E.hull, this.torso, 0, 0.9, 0);
    mk(rbox(2.6, 0.5, 2.6, 0.15), E.dark, this.torso, 0, 1.9, 0.1);
    for (const sx of [-1, 1]) mk(rbox(0.12, 1.2, 1.8, 0.04), E.orange, this.torso, sx * 1.52, 0.9, 0);
    this.eye = mk(new THREE.SphereGeometry(0.25, 16, 12), E.eye, this.torso, 0, 1.1, -1.25);
    mk(rbox(1.2, 0.5, 0.3, 0.08), E.dark, this.torso, 0, 1.1, -1.15);
    // weak point: exposed reactor core on the back
    this.core = mk(new THREE.SphereGeometry(0.42, 18, 12), E.core, this.torso, 0, 1.0, 1.3);
    mk(new THREE.TorusGeometry(0.5, 0.08, 8, 20), E.steel, this.torso, 0, 1.0, 1.25);
    // chaingun arm (right) + rocket pod (left)
    this.gunArm = new THREE.Group(); this.gunArm.position.set(1.9, 1.1, 0); this.torso.add(this.gunArm);
    mk(rbox(0.7, 0.7, 1.0, 0.12), E.dark, this.gunArm);
    this.barrels = new THREE.Group(); this.barrels.position.z = -1.2; this.gunArm.add(this.barrels);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; mk(cylZ(0.07, 1.6), E.steel, this.barrels, Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0); }
    mk(cylZ(0.3, 0.2, 16), E.steel, this.barrels, 0, 0, 0.5);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.z = -0.85; this.barrels.add(this.muzzle);
    this.pod = new THREE.Group(); this.pod.position.set(-1.9, 1.6, 0.2); this.torso.add(this.pod);
    mk(rbox(0.8, 0.8, 1.2, 0.1), E.hull, this.pod); for (let i = 0; i < 4; i++) mk(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10).rotateX(Math.PI / 2), E.dark, this.pod, (i % 2 - 0.5) * 0.36, (Math.floor(i / 2) - 0.5) * 0.36, -0.61);
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 1.2, 0, 0); this.pelvis.add(hip);
      mk(new THREE.SphereGeometry(0.45, 14, 10), E.dark, hip);
      const th = new THREE.Group(); hip.add(th); mk(rbox(0.6, 2.4, 0.7, 0.12).translate(0, -1.2, 0), E.hull, th);
      for (let i = 0; i < 3; i++) mk(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), E.rubber, th, sx * 0.35, -1.1, -0.2 + i * 0.2); // hydraulics
      const kn = new THREE.Group(); kn.position.y = -2.4; th.add(kn); mk(new THREE.SphereGeometry(0.35, 12, 10), E.dark, kn);
      const sh = new THREE.Group(); kn.add(sh); mk(rbox(0.45, 2.2, 0.5, 0.1).translate(0, -1.1, 0), E.hull, sh);
      const ft = new THREE.Group(); ft.position.y = -2.2; sh.add(ft); mk(rbox(1.0, 0.3, 1.6, 0.08), E.dark, ft, 0, -0.1, -0.2);
      for (const tz of [-0.9, 0.5]) mk(new THREE.ConeGeometry(0.15, 0.4, 6).rotateX(tz < 0 ? -Math.PI / 2 : Math.PI / 2), E.steel, ft, 0, -0.15, tz);
      this.legs.push({ hip, th, kn, sh, ft, sx });
    }
    this.hitboxes = [{ obj: this.torso, r: 1.6, mult: 0.6, tag: 'armor', off: new THREE.Vector3(0, 0.9, 0) }, { obj: this.eye, r: 0.35, mult: 1.5, tag: 'eye' }, { obj: this.core, r: 0.5, mult: 3.5, tag: 'core' }, { obj: this.pelvis, r: 1.1, mult: 0.5, tag: 'armor' }];
    this.gait = 0; this.spin = 0; this.rocketCD = 6; this.hum = audio.loop('engine'); this.stepSide = 0;
    this.col = game.world.col.box(pos.x, pos.z, 2.6, 2.4, pos.y, pos.y + 7.5, 0, 'metal', { walk: false, noRay: true });
  }
  eyePos(out) { return this.eye.getWorldPosition(out); }
  puppetUpdate(dt, t) { if (!this.alive) return this.update(dt, t); const moved = this.puppetBase(dt); this.pos.y = this.game.world.terrain.height(this.pos.x, this.pos.z); this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; this.gait += moved * 1.1; this.legAnim(1); if (this.netFlags & 2) { this.spin += dt * 18; this.barrels.rotation.z = this.spin; } this.gunArm.rotation.x += (this.netPitch - this.gunArm.rotation.x) * dt * 3; Object.assign(this.col, { x: this.pos.x, z: this.pos.z }); this.hum?.set(this.pos, 0.35); }
  legAnim(spd) { for (const L of this.legs) { const s = Math.sin(this.gait + (L.sx > 0 ? Math.PI : 0)); L.th.rotation.x = s * 0.35 * Math.min(1, spd) + 0.3; L.kn.rotation.x = -0.6 - Math.max(0, -s) * 0.4 * Math.min(1, spd); L.sh.rotation.x = 0; L.ft.rotation.x = 0.3 - L.th.rotation.x - L.kn.rotation.x; } this.pelvis.position.y = 4.2 + Math.abs(Math.cos(this.gait)) * 0.15; }
  update(dt, t) {
    if (!this.alive) { this.deadT = (this.deadT || 0) + dt; this.pelvis.rotation.x = Math.min(1.2, this.deadT * this.deadT * 0.8); this.pelvis.position.y = Math.max(1.4, 4.2 - this.deadT * 1.5); return; }
    const P = this.player, W = this.game.world; const see = this.canSee(110, 2.6); this.tickEngage(dt, see);
    if (see) { this.seeT += dt; this.alert = 1; this.lastSeen = P.pos.clone(); if (this.seeT > 0.5) this.state = 'attack'; } else this.seeT = 0;
    let spd = 0, target = null;
    if (this.state === 'attack' && this.lastSeen) {
      target = this.lastSeen; const d = this.pos.distanceTo(target); spd = d > 30 ? 2.4 : d > 15 ? 1.2 : 0; if (!see) spd = 2;
      this.turnTo(target, dt, 0.7);
      this.spin += dt * (see ? 18 : 2); this.barrels.rotation.z = this.spin;
      this.fireCD -= dt;
      if (see && this.fireCD <= 0) { if (this.burst <= 0) this.burst = 22; this.shootAt(this.muzzle.getWorldPosition(_c), 7, 3.4, 'heavy', 0xffb050); this.game.fx.muzzle(this.muzzle, _d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 4); this.burst--; this.fireCD = this.burst > 0 ? 0.07 : 2.5; }
      this.rocketCD -= dt;
      if (see && this.rocketCD <= 0 && d > 12) { this.rocketCD = (P.inVehicle ? 4 : 7) + Math.random() * 3; this.game.spawnRocket(this.pod.getWorldPosition(V()), P.pos.clone().add(V().set((Math.random() - 0.5) * 6, 0.5, (Math.random() - 0.5) * 6))); }
    } else if (this.state === 'search' && this.lastSeen) { target = this.lastSeen; spd = 1.5; this.turnTo(target, dt, 0.5); if (this.pos.distanceTo(target) < 6) this.state = 'idle'; }
    else { this.wanderT -= dt; if (this.wanderT <= 0) { this.wanderT = 8 + Math.random() * 8; this.wander.set(this.home.x + (Math.random() - 0.5) * 40, 0, this.home.z + (Math.random() - 0.5) * 40); } target = this.wander; spd = Math.hypot(target.x - this.pos.x, target.z - this.pos.z) > 4 ? 1.1 : 0; this.turnTo(target, dt, 0.4); }
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += -Math.sin(this.yaw) * spd * dt; this.pos.z += -Math.cos(this.yaw) * spd * dt;
    this.game.world.col.remove(this.col);
    const [rx, rz] = W.col.resolve(this.pos.x, this.pos.z, 1.6, this.pos.y + 1, 5); this.pos.x = rx; this.pos.z = rz;
    this.pos.y = W.terrain.height(this.pos.x, this.pos.z);
    Object.assign(this.col, { x: this.pos.x, z: this.pos.z, y0: this.pos.y, y1: this.pos.y + 7.5 }); W.col.add(this.col);
    const moved = Math.hypot(rx - ox, rz - oz);
    const prev = Math.sin(this.gait); this.gait += moved * 1.1;
    if (Math.sign(Math.sin(this.gait)) !== Math.sign(prev) && moved > 0) { audio.explosion(this.pos, 0.15); const dd = this.pos.distanceTo(P.pos); if (dd < 40) this.game.shake(0.5 * (1 - dd / 40)); this.game.fx.dust(this.pos, 6, 0.6); }
    this.legAnim(spd);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    if (this.lastSeen && this.state === 'attack') { const want = Math.atan2(this.lastSeen.y + 1 - (this.pos.y + 6), Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z)); this.gunArm.rotation.x += (want - this.gunArm.rotation.x) * dt * 3; this.pitch = this.gunArm.rotation.x; }
    this.hum?.set(this.pos, 0.35);
  }
  die() { this.alive = false; this.hum?.stop(); this.hum = null; const p = this.pos.clone().setY(this.pos.y + 5); this.game.fx.explosion(p, 2.2); audio.explosion(p, 2); this.game.shake(1.2); this.dropLoot('m_strider'); this.game.world.col.remove(this.col); }
}

// ------------------------------------------------------------------ Sentinel turret (static, scanning laser)
export class Sentinel extends Enemy {
  constructor(game, pos) {
    super(game, pos, { hp: 260 }); this.type = 'sentinel'; this.name = 'Sentinel Turret';
    const E = emats(), R = this.root;
    for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28; mk(rbox(0.12, 1.6, 0.12, 0.03), E.dark, R, Math.cos(a) * 0.5, 0.7, Math.sin(a) * 0.5, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); }
    mk(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 14), E.hull, R, 0, 1.55, 0);
    this.head = new THREE.Group(); this.head.position.y = 2.0; R.add(this.head);
    mk(rbox(0.7, 0.5, 0.8, 0.1), E.hull, this.head);
    mk(rbox(0.5, 0.2, 0.6, 0.05), E.orange, this.head, 0, 0.3, 0.05);
    this.eye = mk(new THREE.SphereGeometry(0.1, 12, 8), E.eye, this.head, 0, 0.05, -0.42);
    mk(cylZ(0.05, 0.7), E.steel, this.head, 0.22, -0.1, -0.5);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0.22, -0.1, -0.85); this.head.add(this.muzzle);
    this.beam = mk(new THREE.CylinderGeometry(0.012, 0.012, 1, 6).rotateX(Math.PI / 2).translate(0, 0, -0.5), E.beam, this.head, 0, 0.05, -0.45); this.beam.castShadow = false;
    this.hitboxes = [{ obj: this.head, r: 0.5, mult: 1, tag: 'head' }, { obj: this.eye, r: 0.13, mult: 2.5, tag: 'eye' }];
    this.scan = Math.random() * 6; this.yaw = Math.random() * 6.28; this.col = game.world.col.box(pos.x, pos.z, 1.0, 1.0, pos.y, pos.y + 2.3, 0, 'metal', { noRay: true });
  }
  eyePos(out) { return this.eye.getWorldPosition(out); }
  puppetUpdate(dt, t) { if (!this.alive) return this.update(dt, t); let dy = this.netYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * Math.min(1, dt * 10); this.head.rotation.y = this.yaw; this.beam.material.opacity = 0.35 + Math.sin(t * 20) * 0.1; }
  update(dt, t) {
    if (!this.alive) { this.head.rotation.x = Math.min(0.8, (this.head.rotation.x || 0) + dt); this.beam.visible = false; return; }
    const P = this.player; const see = this.canSee(60, 1.0); this.tickEngage(dt, see);
    if (see) { this.seeT += dt; this.lastSeen = P.pos.clone(); if (this.seeT > 0.6 && this.state !== 'attack') { this.state = 'attack'; this.alert = 1; this.game.noise(this.pos, 90, this); this.game.swarm(this, 110); audio.click(1400, 0.15, 0.3, 'sawtooth'); } } else { this.seeT = Math.max(0, this.seeT - dt); if (this.seeT === 0 && this.state === 'attack') this.state = 'idle'; }
    if (this.state === 'attack' && this.lastSeen) { this.turnTo(this.lastSeen, dt, 2.5); this.fireCD -= dt; if (see && this.fireCD <= 0) { this.shootAt(this.muzzle.getWorldPosition(_c), 7, 1.6, 'rifle', 0xff4020); this.fireCD = 0.4; } }
    else { this.scan += dt * 0.5; this.yaw += Math.sin(this.scan) * dt * 0.6; }
    this.root.position.copy(this.pos); this.head.rotation.y = this.yaw;
    // beam length to first obstacle
    const o = this.eye.getWorldPosition(_a), d = _b.set(-Math.sin(this.yaw), -0.05, -Math.cos(this.yaw)).normalize(); const h = this.game.world.col.ray(o, d, 60); this.beam.scale.z = h ? h.t : 60;
    this.beam.material.opacity = 0.35 + Math.sin(t * 20) * 0.1;
  }
  die() { this.alive = false; this.game.fx.explosion(this.head.getWorldPosition(V()), 0.6); audio.explosion(this.pos, 0.5); this.dropLoot('m_drone'); }
}

// ------------------------------------------------------------------ Raider (hostile human, low-poly operator) with squad tactics
// [weapon id, mods, damage, fire interval, burst] — sound and mag size come from the weapon data
const RAIDER_GUNS = { rifle: [['akm', {}], ['ak74', { optic: 'reddot' }], ['ar', { optic: 'reddot' }], ['br', { optic: 'holo', muzzle: 'brake' }]], smg: [['mp5', {}], ['ump', {}], ['vx', {}]], shotgun: [['sg', {}]], marksman: [['svd', { optic: 'prism' }], ['dmr', { optic: 'prism' }]], pistol: [['m1911', {}], ['p9', {}]] };
const AMMO_OF = (id) => WEAPONS[id].ammo;
export class Raider extends Enemy {
  constructor(game, pos, tier = 0, opts = {}) {
    super(game, pos, { hp: 110 + tier * 30, id: opts.id }); this.type = 'raider'; this.name = 'Raider'; this.tier = tier;
    const r = opts.rand || Math.random; const D = game.ai.doctrine;
    this.op = new Operator(r() < 0.5 ? 'raider' : 'raiderB', { pack: 1 + Math.floor(r() * 2) }); this.root.add(this.op.root);
    // loadout biased by doctrine: more shotguns vs rushers, marksmen vs campers / long-range players
    let cls = 'rifle'; const x = r();
    if (opts.cls) cls = opts.cls; else if (x < 0.15 + D.holdAngles * 0.25) cls = 'shotgun'; else if (x < 0.35 + D.holdAngles * 0.2) cls = 'smg'; else if (x < 0.45 + (D.band === 'long' ? 0.1 : 0) && tier > 0) cls = 'marksman'; else if (x > 0.95) cls = 'pistol';
    const pick = RAIDER_GUNS[cls][Math.floor(r() * RAIDER_GUNS[cls].length)];
    this.gun = buildGun(pick[0], pick[1]); this.op.attachGun(this.gun); this.wid = pick[0]; this.ws = WEAPONS[pick[0]]; this.cls = cls;
    this.mag = this.ws.mag; this.anim = new WeaponAnimator(); this.crouch = false; this.armor = tier * 40;
    this.helmet = r() < D.helmets; if (this.helmet) { this.armor += 25; this.op.head.scale.setScalar(1.08); }
    this.grenades = r() < D.grenades ? 2 : 1; this.smokes = r() < D.useSmoke ? 1 : 0;
    this.hitboxes = [{ obj: this.op.head, r: 0.15, mult: this.helmet ? 1.5 : 2.4, tag: 'head', off: new THREE.Vector3(0, 0.12, 0) }, { obj: this.op.chest, r: 0.27, mult: 1, tag: 'torso', off: new THREE.Vector3(0, 0.1, 0) }, { obj: this.op.hips, r: 0.24, mult: 0.85, tag: 'legs', off: new THREE.Vector3(0, -0.25, 0) }];
    this.speed = 0; this.pitch = 0; this.mode = 'patrol'; this.thinkT = r(); this.moveTo = null; this.peekT = 0; this.peeking = true; this.healed = false; this.waitT = 0; this.callT = 0;
  }
  eyePos(out) { return this.op.head.getWorldPosition(out).add(_d.set(0, 0.12, 0)); }
  get reloading() { return this.anim.busy; }
  onHurt(n, from) { this.flinch = true; if (this.mode === 'cover' || this.mode === 'hold') { this.peekT = 0; this.peeking = false; } this.thinkT = Math.min(this.thinkT, 0.2); }
  decide() {
    const P = this.player, D = this.D, ai = this.game.ai; const threat = this.lastSeen || this.squad?.lastSeen;
    if (!threat) { this.mode = 'patrol'; return; }
    const d = this.pos.distanceTo(threat); const hpPct = this.hp / this.maxHp;
    if (hpPct < 0.35 && !this.healed) { this.mode = 'retreat'; this.moveTo = ai.findCover(this.pos, threat, { prefDist: 35, away: true }); this.waitT = 0; return; }
    // push when the target is vulnerable (reloading / hurt) and we are close enough
    if ((P.reloadT >= 0 || P.hp < 40) && d < 30 && (this.role === 'assault' || this.role === 'leader' || this.cls === 'shotgun') && Math.random() < 0.6) { this.mode = 'push'; this.moveTo = threat.clone(); return; }
    if (this.role === 'flanker' && Math.random() < D.flank) { const side = D.flankSide || (this.id % 2 ? 1 : -1); this.mode = 'flank'; this.moveTo = ai.findCover(_g.copy(this.pos).lerp(threat, 0.4), threat, { prefDist: 16, flank: side * 1.4 }); return; }
    if (this.role === 'support' && !this.see && this.squad && performance.now() / 1000 - this.squad.seenT < 6) { this.mode = 'suppress'; this.moveTo = null; return; }
    if (D.band === 'long' && d > D.raiderRange + 8) { this.mode = 'advance'; const fwd = _g.copy(threat).sub(this.pos).setY(0).normalize(); this.moveTo = ai.findCover(_h.copy(this.pos).addScaledVector(fwd, 12), threat, { prefDist: D.raiderRange }); if (this.smokes > 0 && d > 30 && Math.random() < 0.5) { this.smokes--; ai.throwGrenade(this.eyePos(V()), _h.copy(this.pos).lerp(threat, 0.45), 'smoke'); } return; }
    if (Math.random() < D.holdAngles && d < 42 && this.coverPos && this.pos.distanceTo(this.coverPos) < 2) { this.mode = 'hold'; this.moveTo = null; return; }
    this.mode = 'cover'; this.moveTo = ai.findCover(this.pos, threat, { prefDist: this.cls === 'shotgun' ? 8 : this.cls === 'marksman' ? 45 : D.raiderRange }); if (this.moveTo) this.coverPos = this.moveTo.clone();
  }
  puppetUpdate(dt, t) {
    if (!this.alive) { this.op.update(dt, { dead: true, speed: 0 }); return; }
    const moved = this.puppetBase(dt); this.pos.y = this.game.world.col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5).y;
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; this.pitch += (this.netPitch - this.pitch) * Math.min(1, dt * 8);
    if ((this.netFlags & 8) && !this.anim.busy) this.anim.play(this.ws.anim === 'bolt' ? 'boltLoad' : this.ws.anim === 'pump' ? 'pumpShell' : this.ws.anim, 2.2);
    this.animate(dt, moved / Math.max(dt, 1e-3), !!(this.netFlags & 4), !!(this.netFlags & 2));
  }
  animate(dt, spd, crouch, aim) {
    const pose = this.anim.update(dt); this.anim.apply(this.gun);
    this.op.update(dt, { speed: spd, fwd: 1, side: 0, crouch, aim, pitch: this.pitch, gunPose: pose.gun, lh: this.anim.handTarget(this.gun, pose.lh, 'l', _lh), rh: pose.rh ? this.anim.handTarget(this.gun, pose.rh, 'r', _rh) : null, flinch: this.flinch, sprint: spd > 4 && !aim });
    this.flinch = false;
  }
  update(dt, t) {
    const W = this.game.world, P = this.player, ai = this.game.ai;
    if (!this.alive) { this.op.update(dt, { dead: true, speed: 0 }); return; }
    const see = this.canSee(85); this.see = see; this.tickEngage(dt, see);
    if (see) { this.seeT += dt; this.alert = 1; this.lastSeen = P.pos.clone(); if (this.seeT > 0.35) this.state = 'attack'; this.callT -= dt; if (this.callT <= 0) { this.callT = 1; ai.callout(this.squad, P.pos, t); } }
    else { this.seeT = Math.max(0, this.seeT - dt * 0.5); if (!this.lastSeen && this.squad?.lastSeen && t - this.squad.seenT < 10) { this.lastSeen = this.squad.lastSeen.clone(); this.state = 'attack'; } }
    this.thinkT -= dt; if (this.thinkT <= 0 && this.state === 'attack') { this.thinkT = 0.8 + Math.random() * 0.8; this.decide(); }
    let spd = 0, dest = null, wantCrouch = false, faceTo = null;
    const threat = this.lastSeen;
    if (this.state !== 'attack' || !threat) {
      // patrol around the squad leader / home
      this.wanderT -= dt; const anchor = this.squad && this.role !== 'leader' ? this.squad.members[0].pos : this.home;
      if (this.wanderT <= 0) { this.wanderT = 5 + Math.random() * 8; this.wander.set(anchor.x + (Math.random() - 0.5) * 24, 0, anchor.z + (Math.random() - 0.5) * 24); }
      if (Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) > 1.5) { dest = this.wander; spd = 1.4; }
      if (this.state === 'search' && this.lastSeen) { dest = this.lastSeen; spd = 2.6; if (this.pos.distanceTo(this.lastSeen) < 2.5) { this.state = 'idle'; this.lastSeen = null; } }
    } else {
      const d = this.pos.distanceTo(threat); faceTo = threat;
      if (this.mode === 'retreat') { dest = this.moveTo; spd = 4.2; if (!dest || this.pos.distanceTo(dest) < 1.2) { dest = null; wantCrouch = true; this.waitT += dt; if (this.waitT > 3) { this.hp = Math.min(this.maxHp, this.hp + 45); this.healed = true; this.mode = 'cover'; this.thinkT = 0; } } }
      else if (this.mode === 'push') { dest = threat; spd = 4.6; if (d < 6) this.mode = 'cover'; }
      else if (this.mode === 'suppress') { wantCrouch = false; }
      else if (this.mode === 'hold') { wantCrouch = !see; }
      else if (this.moveTo) { dest = this.moveTo; spd = this.mode === 'flank' || this.mode === 'advance' ? 4.4 : 3.4; if (this.pos.distanceTo(this.moveTo) < 1.2) { this.moveTo = null; this.peekT = 0; } }
      else { // in cover: peek-and-shoot cycle
        this.peekT -= dt; if (this.peekT <= 0) { this.peeking = !this.peeking; this.peekT = this.peeking ? 1.2 + Math.random() * 1.2 : 0.9 + Math.random() * 1.5; if (!this.peeking && this.mag < this.ws.mag * 0.5 && !this.anim.busy) this.startReload(); }
        wantCrouch = !this.peeking;
      }
      // grenades: flush targets that stay put behind cover
      this.stillT = P.vel.length() < 0.6 ? (this.stillT || 0) + dt : 0;
      if (this.grenades > 0 && !see && this.stillT > 3 && d > 9 && d < 34 && t - (this.squad?.lastGren || -99) > 6 && Math.random() < dt * 0.6) { this.grenades--; if (this.squad) this.squad.lastGren = t; ai.throwGrenade(this.eyePos(V()), threat.clone(), 'frag', this.id); this.game.ui?.feed('⚠ Grenade!'); }
      // shooting
      if (!this.anim.busy) { this.fireCD -= dt;
        const canShoot = see && this.seeT > 0.35 + (1 - this.D.experience) * 0.25 && !wantCrouch;
        const suppress = !see && this.mode === 'suppress' && this.squad?.lastSeen;
        if ((canShoot || suppress) && this.fireCD <= 0) {
          if (this.mag <= 0) this.startReload();
          else { const m = this.gun.muzzle.getWorldPosition(_c); const st = this.ws; const pellets = st.pellets > 1 ? 6 : 1; const dmg = st.damage * (st.pellets > 1 ? 9 : 1) * 0.3;
            for (let i = 0; i < pellets; i++) this.shootAt(m.clone(), dmg / pellets, (st.pellets > 1 ? 4 : 1.8) * (this.crouch ? 0.8 : 1), gunSound(st), 0xffc070, suppress ? this.squad.lastSeen.clone().setY(this.squad.lastSeen.y + 1) : null);
            this.game.fx.muzzle(this.gun.muzzle, _d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 1); this.op.kick = 1; this.anim.fire(); this.mag--;
            const interval = 60 / st.rpm; this.burstN = (this.burstN || 0) + 1;
            if (st.auto && this.burstN >= 3 + Math.floor(Math.random() * 3)) { this.burstN = 0; this.fireCD = 0.7 + Math.random() * 0.8; } else this.fireCD = interval * (st.auto ? 1.25 : 1.6) + (st.pellets > 1 ? 0.4 : 0) + (st.bolt ? 0.8 : 0);
          } } }
      if (this.mag <= 0 && !this.anim.busy) this.startReload();
    }
    // locomotion toward dest with sliding collision; crouch-walk when advancing under fire
    this.crouch = wantCrouch;
    if (dest) { if (!faceTo || this.mode === 'retreat' || spd > 4) this.turnTo(dest, dt, 5); }
    if (faceTo && !(dest && spd > 4)) this.turnTo(faceTo, dt, 6);
    let mx = 0, mz = 0; if (dest && spd > 0) { mx = dest.x - this.pos.x; mz = dest.z - this.pos.z; const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L; if (this.crouch) spd = Math.min(spd, 1.6); }
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += mx * spd * dt; this.pos.z += mz * spd * dt;
    const [rx, rz, blk] = W.col.resolve(this.pos.x, this.pos.z, 0.35, this.pos.y, 1.7); this.pos.x = rx; this.pos.z = rz;
    const moved = Math.hypot(rx - ox, rz - oz);
    if (blk && spd > 0 && moved < spd * dt * 0.3) { this.stuck += dt; if (this.stuck > 0.7) { this.moveTo = null; this.thinkT = 0; this.wander.set(this.pos.x + (Math.random() - 0.5) * 16, 0, this.pos.z + (Math.random() - 0.5) * 16); this.wanderT = 3; this.stuck = 0; } } else this.stuck = 0;
    this.pos.y = W.col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5).y;
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    if (threat && this.state === 'attack') { const want = Math.atan2(threat.y + 1.2 - (this.pos.y + 1.5), Math.hypot(threat.x - this.pos.x, threat.z - this.pos.z)); this.pitch += (want - this.pitch) * dt * 5; }
    this.animate(dt, moved / Math.max(dt, 1e-4), this.crouch, this.state === 'attack');
    if ((this.stepT = (this.stepT || 0) + moved) > 1.6) { this.stepT = 0; audio.step(this.pos, 'dirt', 0.8); }
  }
  startReload() { const a = this.ws.anim; const clip = a === 'bolt' ? 'boltLoad' : a === 'pump' ? 'pumpShell' : a; audio.mech(this.pos, 'reload'); this.anim.play(clip, this.ws.perShell ? 2.4 : this.ws.reload * 1.1, () => { this.mag = this.ws.mag; }); }
  damage(n, hit, from, byMe, byPeer) {
    if (this.puppet) return super.damage(n, hit, from, byMe, byPeer);
    if (this.armor > 0 && hit?.tag !== 'head') { const a = Math.min(this.armor, n * 0.6); this.armor -= a; n -= a; }
    if (hit?.tag === 'head' && this.helmet && this.armor > 0) { const a = Math.min(this.armor, n * 0.4); this.armor -= a; n -= a; }
    super.damage(n, hit, from, byMe, byPeer);
  }
  hitFx(hit) { this.game.fx.impact(hit?.point || this.pos.clone().setY(this.pos.y + 1.2), null, hit?.tag === 'head' && this.helmet ? 'metal' : 'flesh'); this.flinch = true; }
  die() { this.alive = false; if (this.puppet) return; this.dropLoot('m_raider'); this.game.spawnBag(this.pos.clone().add(V().set(0.6, 0, 0.3)), null, [{ weapon: { id: this.wid, mods: this.gun.mods } }, { id: AMMO_OF(this.wid), n: 10 + Math.floor(Math.random() * 20) }]); }
}
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _h = new THREE.Vector3(), _lh = new THREE.Vector3(), _rh = new THREE.Vector3();
