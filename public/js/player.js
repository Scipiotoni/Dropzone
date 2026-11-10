// Player: input, capsule movement, third/first-person camera, weapon handling (fire, recoil, spread, ADS, reload),
// health/armor, healing and interaction.
import * as THREE from 'three';
import { Operator } from './character.js';
import { buildGun } from './guns.js';
import { WEAPONS, ITEMS, weaponStats, DEFAULT_MODS } from './items.js';
import { audio } from './audio.js';

export class Input {
  constructor(dom) {
    this.keys = new Set(); this.pressed = new Set(); this.mx = 0; this.my = 0; this.buttons = 0; this.clicked = 0; this.wheel = 0; this.locked = false; this.dom = dom;
    addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; if (!this.keys.has(e.code)) this.pressed.add(e.code); this.keys.add(e.code); if (['Tab', 'Space'].includes(e.code) || (e.code.startsWith('Arrow'))) e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.mx += e.movementX; this.my += e.movementY; } });
    addEventListener('mousedown', (e) => { if (!this.locked) return; this.buttons |= 1 << e.button; this.clicked |= 1 << e.button; });
    addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; if (!this.locked) { this.buttons = 0; this.keys.clear(); } });
  }
  lock() { if (!this.locked) this.dom.requestPointerLock?.(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.pressed.has(c); }
  endFrame() { this.pressed.clear(); this.mx = this.my = 0; this.clicked = 0; this.wheel = 0; }
}

export class Player {
  constructor(game) {
    this.game = game; this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0;
    this.op = new Operator('player'); game.scene.add(this.op.root);
    this.hp = 100; this.maxHp = 100; this.armor = 0; this.maxArmor = 0; this.stamina = 100; this.dead = false; this.crouch = false; this.onGround = true;
    this.weapons = [null, null]; this.slot = 0; this.aimT = 0; this.fireCD = 0; this.reloadT = -1; this.recoil = new THREE.Vector2(); this.kick = new THREE.Vector2(); this.spreadNow = 0;
    this.fp = false; this.shakeT = 0; this.healT = -1; this.healItem = null; this.lightOn = false; this.bob = 0; this.stepAcc = 0;
    this.camOff = new THREE.Vector3(); this.camDist = 2.6;
    // first person viewmodel
    this.vm = new THREE.Group(); game.engine.camera.add(this.vm);
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 45, 0.42, 0.45, 1.4); this.flashlight.castShadow = false; game.engine.camera.add(this.flashlight, this.flashlight.target); this.flashlight.target.position.set(0, 0, -10);
    this.laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 4).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.laserBeam.visible = false; game.scene.add(this.laserBeam);
    this.laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false })); this.laserDot.visible = false; game.scene.add(this.laserDot);
  }
  get weapon() { return this.weapons[this.slot]; }
  reattach(scene) { scene.add(this.op.root, this.laserBeam, this.laserDot); }
  setLoadout({ primary, secondary, vest, pack, armor }) {
    this.weapons = [primary ? this.makeWeapon(primary) : null, secondary ? this.makeWeapon(secondary) : null];
    if (!this.weapons[0] && this.weapons[1]) this.slot = 1; else this.slot = 0;
    this.vestId = vest || null; this.maxArmor = vest ? ITEMS[vest].armor : 0; this.armor = armor ?? this.maxArmor;
    this.packId = pack || 'pack1'; this.op.setPack(+this.packId.slice(-1)); this.op.setVest(vest ? +vest.slice(-1) : 0);
    this.equipCurrent();
  }
  makeWeapon(w) { const s = weaponStats(w); return { id: w.id, mods: { ...DEFAULT_MODS, ...(w.mods || {}) }, uid: w.uid, stats: s, mag: w.mag ?? s.mag, model: null, vmModel: null }; }
  equipCurrent() {
    const w = this.weapon; this.reloadT = -1;
    if (this.vmGun) { this.vm.remove(this.vmGun.group); this.vmGun = null; }
    if (!w) { this.op.attachGun(null); return; }
    w.model = buildGun(w.id, w.mods); this.op.attachGun(w.model);
    this.vmGun = buildGun(w.id, w.mods); this.vm.add(this.vmGun.group); this.vmGun.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    this.swapT = 0.45; audio.mech(null, 'reload');
  }
  spawn(pos, yaw) { this.pos.copy(pos); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0; this.dead = false; this.op.dead = 0; this.op.rig.rotation.set(0, 0, 0); this.op.rig.position.set(0, 0, 0); }
  damage(n, from) {
    if (this.dead || this.game.godMode) return;
    let left = n;
    if (this.armor > 0) { const a = Math.min(this.armor, n * 0.7); this.armor -= a; left -= a; }
    this.hp -= left; this.game.ui.hurt(from, n);
    this.healT = -1; audio.hit(this.pos, 'flesh');
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.game.onPlayerDeath(); }
  }
  // ---- per-frame
  update(dt, input, opts = {}) {
    const G = this.game, W = G.world, cam = G.engine.camera;
    const canAct = !this.dead && input.locked && !opts.frozen;
    // look
    if (input.locked && !this.dead) {
      const zoomSens = this.aimT > 0.5 ? 1 / Math.max(1, (this.weapon?.stats.zoom || 1) * 0.8) : 1;
      const sens = 0.0022 * (G.settings.sens || 1) * zoomSens;
      this.yaw -= input.mx * sens; this.pitch -= input.my * sens; this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    }
    // weapon recoil recovery
    const rec = Math.min(1, dt * 7); this.pitch += this.kick.y * rec; this.yaw += this.kick.x * rec; this.kick.multiplyScalar(1 - rec);
    if (canAct && input.hit('KeyV')) this.fp = !this.fp;
    if (canAct && input.hit('KeyC')) this.crouch = !this.crouch;
    // movement
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0), s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const aiming = canAct && (input.buttons & 4) && !opts.build && this.weapon && this.reloadT < 0 && this.healT < 0;
    let sprint = canAct && input.down('ShiftLeft') && f > 0 && !aiming && this.stamina > 1 && this.healT < 0;
    if (sprint) this.crouch = false;
    const stimBoost = (this.stimT || 0) > 0;
    if (sprint && !stimBoost) { this.stamina = Math.max(0, this.stamina - dt * 14); this.stRegen = 1.2; } else { this.stRegen = (this.stRegen || 0) - dt; if (this.stRegen <= 0) this.stamina = Math.min(100, this.stamina + dt * 22); }
    this.stimT = Math.max(0, (this.stimT || 0) - dt);
    const wspd = this.weapon?.stats.speed || 1;
    let speed = (sprint ? 6.6 : this.crouch ? 2.2 : aiming ? 2.7 : 4.3) * wspd * (this.healT >= 0 ? 0.5 : 1);
    if (!canAct) speed = 0;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = fx * f + rx * s, mz = fz * f + rz * s; const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
    const accel = this.onGround ? 14 : 3;
    this.vel.x += (mx * speed - this.vel.x) * Math.min(1, dt * accel); this.vel.z += (mz * speed - this.vel.z) * Math.min(1, dt * accel);
    if (canAct && input.hit('Space') && this.onGround) { this.vel.y = 4.9; this.onGround = false; if (this.crouch) this.crouch = false; }
    this.vel.y -= 20 * dt;
    const height = this.crouch ? 1.2 : 1.8;
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    [nx, nz] = W.col.resolve(nx, nz, 0.38, this.pos.y, height);
    let ny = this.pos.y + this.vel.y * dt;
    const g = W.col.groundAt(nx, nz, Math.max(this.pos.y, ny) + 0.5, 0.3);
    const ceil = W.col.ceilingAt(nx, nz, this.pos.y + 0.5); if (ny + height > ceil && this.vel.y > 0) { this.vel.y = 0; ny = Math.min(ny, ceil - height); }
    if (ny <= g.y) { if (!this.onGround && this.vel.y < -13) this.damage((-this.vel.y - 13) * 9, null); if (!this.onGround && this.vel.y < -4) audio.step(this.pos, g.c ? g.c.mat : 'dirt', 1.5); ny = g.y; this.vel.y = 0; this.onGround = true; }
    else if (ny > g.y + 0.06) this.onGround = false;
    else if (this.onGround && this.vel.y <= 0) ny = g.y;
    // stand-up check
    if (!this.crouch && W.col.ceilingAt(nx, nz, ny + 0.6) < ny + 1.8) this.crouch = true;
    const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.pos.set(nx, ny, nz); this.surface = g.c ? g.c.mat : (W.terrain.splatAt?.(nx, nz)[3] > 0.5 ? 'concrete' : 'dirt');
    this.stepAcc += moved; if (this.onGround && this.stepAcc > (sprint ? 2.0 : 1.5)) { this.stepAcc = 0; audio.step(this.pos, this.surface, this.crouch ? 0.4 : sprint ? 1.2 : 0.8); if (sprint) G.noise(this.pos, 18, null); }
    this.sprinting = sprint && ml > 0;
    // aim blend
    this.aimT += ((aiming ? 1 : 0) - this.aimT) * Math.min(1, dt / Math.max(0.05, (this.weapon?.stats.ads || 0.2)) * 2.2);
    this.aiming = aiming;
    // weapon switching
    if (canAct && !opts.build) {
      let want = -1; if (input.hit('Digit1')) want = 0; if (input.hit('Digit2')) want = 1; if (input.wheel) want = 1 - this.slot;
      if (want >= 0 && want !== this.slot && this.weapons[want]) { this.slot = want; this.equipCurrent(); }
    }
    this.swapT = Math.max(0, (this.swapT || 0) - dt);
    // weapon light
    if (canAct && input.hit('KeyL') && this.weapon?.stats.light) { this.lightOn = !this.lightOn; audio.click(1800, 0.06, 0.02); }
    this.flashlight.intensity = this.lightOn && this.weapon?.stats.light ? 60 : 0;
    // healing / plates
    if (canAct && input.hit('KeyQ') && this.healT < 0) this.startHeal('med');
    if (canAct && input.hit('KeyG') && this.healT < 0) this.startHeal('plate');
    if (this.healT >= 0) { this.healT += dt; if (sprint || (input.buttons & 1)) { this.healT = -1; G.ui.toast('Interrupted'); } else if (this.healT >= ITEMS[this.healItem].time) this.finishHeal(); }
    // weapon logic
    this.fireCD -= dt;
    const w = this.weapon;
    if (w && canAct && !opts.build) {
      const st = w.stats;
      if (input.hit('KeyR') && this.reloadT < 0 && w.mag < st.mag && G.pack.count(st.ammo) > 0) this.startReload();
      if (this.reloadT >= 0) {
        const dur = st.reload; this.reloadT += dt / dur;
        if (st.perShell) { if (this.reloadT >= 1) { if (G.pack.take(st.ammo, 1)) { w.mag++; audio.mech(this.pos, 'empty'); } this.reloadT = (w.mag < st.mag && G.pack.count(st.ammo) > 0 && !(input.buttons & 1)) ? 0 : -1; if (this.reloadT < 0) { this.op.pumpT = 1; audio.mech(this.pos, 'pump'); } } }
        else if (this.reloadT >= 1) { const need = st.mag - w.mag; w.mag += G.pack.take(st.ammo, need); this.reloadT = -1; }
      }
      const trig = st.auto ? (input.buttons & 1) : (input.clicked & 1);
      if (trig && this.fireCD <= 0 && this.reloadT < 0 && this.healT < 0 && !this.sprinting && this.swapT <= 0) {
        if (w.mag > 0) this.fire(); else { audio.mech(this.pos, 'empty'); this.fireCD = 0.25; if (G.pack.count(st.ammo) > 0) this.startReload(); }
      }
    }
    // spread
    const st = w?.stats; const moveF = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 4.3);
    const base = st ? st.spread * (1 - this.aimT * (st.cls === 'Shotgun' ? 0.4 : 0.85)) * (this.crouch ? 0.75 : 1) * (1 + moveF * (1 - this.aimT * 0.7)) * (this.onGround ? 1 : 2) : 0;
    this.spreadNow += (base - this.spreadNow) * Math.min(1, dt * 10); this.spreadBloom = Math.max(0, (this.spreadBloom || 0) - dt * 6);
    // animation & camera
    this.op.root.position.copy(this.pos); this.op.root.rotation.y = this.yaw;
    const vrel = new THREE.Vector3(this.vel.x, 0, this.vel.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    this.op.update(dt, { speed: moved / Math.max(dt, 1e-4), fwd: vrel.z <= 0.1 ? 1 : -1, side: THREE.MathUtils.clamp(vrel.x / 4, -1, 1), crouch: this.crouch, air: !this.onGround, sprint: this.sprinting, aim: this.aimT > 0.3 || this.fireCD > -0.4, pitch: this.pitch, reload: st?.perShell ? -1 : this.reloadT, dead: this.dead });
    this.updateCamera(dt, cam);
    this.updateViewmodel(dt, cam, moved / Math.max(dt, 1e-4));
    this.updateLaser(cam);
  }
  startReload() { const w = this.weapon; if (!w) return; this.reloadT = 0; audio.mech(this.pos, w.stats.perShell ? 'empty' : 'reload'); this.aimT = Math.min(this.aimT, 0.3); }
  startHeal(kind) {
    const G = this.game; let id = null;
    if (kind === 'plate') { if (!this.vestId) return G.ui.toast('No armor vest equipped'); if (this.armor >= this.maxArmor) return G.ui.toast('Armor is full'); if (G.pack.count('plate') > 0) id = 'plate'; }
    else { if (this.hp >= this.maxHp) return G.ui.toast('Health is full'); const miss = this.maxHp - this.hp; const order = miss > 50 ? ['medkit', 'stim', 'bandage'] : miss > 25 ? ['stim', 'bandage', 'medkit'] : ['bandage', 'stim', 'medkit']; id = order.find((k) => G.pack.count(k) > 0); }
    if (!id) return G.ui.toast(kind === 'plate' ? 'No armor plates' : 'No medical supplies');
    this.healItem = id; this.healT = 0; this.reloadT = -1; audio.click(500, 0.08, 0.15, 'sine');
  }
  finishHeal() {
    const G = this.game, it = ITEMS[this.healItem]; G.pack.take(this.healItem, 1);
    if (this.healItem === 'plate') this.armor = Math.min(this.maxArmor, this.armor + 50); else { this.hp = Math.min(this.maxHp, this.hp + it.heal); if (it.stamina) { this.stimT = it.stamina; this.stamina = 100; } }
    G.ui.toast(`${it.name} used`); this.healT = -1; audio.click(800, 0.08, 0.2, 'sine');
  }
  aimRay(cam) { const o = cam.getWorldPosition(new THREE.Vector3()); const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())); return { o, d }; }
  fire() {
    const G = this.game, w = this.weapon, st = w.stats, cam = G.engine.camera;
    w.mag--; this.fireCD = 60 / st.rpm; if (st.pump) this.op.pumpT = 1;
    const { o, d } = this.aimRay(cam);
    // start the ray at the player's shoulder plane so geometry behind the player (TPS) is ignored
    const head = this.pos.clone(); head.y += this.crouch ? 1.1 : 1.55; const skip = Math.max(0, head.clone().sub(o).dot(d)); o.addScaledVector(d, skip);
    const muzzle = (this.fp ? this.vmGun : w.model).muzzle.getWorldPosition(new THREE.Vector3());
    const spreadDeg = this.spreadNow + (this.spreadBloom || 0) * (1 - this.aimT * 0.6);
    for (let p = 0; p < st.pellets; p++) {
      const sp = THREE.MathUtils.degToRad(st.pellets > 1 ? st.pelletSpread + spreadDeg * 0.3 : spreadDeg) * 0.5;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sp;
      const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, d);
      const dir = d.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const maxT = 600; const wh = G.world.col.ray(o, dir, maxT, { skipNonSolid: true });
      let best = wh ? wh.t : maxT, eh = null;
      for (const e of G.enemies) { if (!e.alive || e.pos.distanceToSquared(o) > (best + 6) ** 2) continue; const h = e.hitTest(o, dir, best); if (h && h.t < best) { best = h.t; eh = h; } }
      const end = o.clone().addScaledVector(dir, best);
      if (eh) {
        const dist = best; const fall = dist <= st.range ? 1 : Math.max(0.45, 1 - (dist - st.range) / (st.range * 2.5));
        const dmg = st.damage * fall * eh.mult; eh.point = end; eh.enemy.damage(dmg, eh, this.pos); G.ui.hitmarker(eh.mult > 1.4, !eh.enemy.alive); audio.hitmarker();
        if (eh.enemy.type !== 'raider') audio.hit(end, 'machine');
      } else if (wh) { G.fx.impact(wh.point, wh.normal, wh.mat); if (Math.random() < 0.5) audio.hit(wh.point, wh.mat); }
      if (p === 0 || Math.random() < 0.4) G.fx.tracer(muzzle, end, 0xffd080, 420);
    }
    // recoil
    const rm = (this.crouch ? 0.82 : 1) * (this.aimT > 0.5 ? 0.85 : 1);
    this.kick.y += THREE.MathUtils.degToRad(st.recoil) * rm; this.kick.x += THREE.MathUtils.degToRad((Math.random() - 0.45) * st.hrecoil * 2) * rm;
    this.spreadBloom = Math.min(st.spread * 1.5, (this.spreadBloom || 0) + st.recoil * 0.35);
    this.op.kick = 1; this.vmKick = 1;
    G.fx.muzzle((this.fp ? this.vmGun : w.model).muzzle, d, st.cls === 'Shotgun' ? 1.6 : st.cls === 'Pistol' ? 0.8 : 1.1, st.flash);
    const kind = st.cls === 'Pistol' ? 'pistol' : st.cls === 'SMG' ? 'smg' : st.cls === 'Shotgun' ? 'shotgun' : st.cls === 'Battle Rifle' || st.cls === 'DMR' ? 'heavy' : 'rifle';
    audio.gunshot(kind, null, st.loud);
    G.noise(this.pos, 140 * st.loud, null);
    // brass
    const ej = (this.fp ? this.vmGun : w.model).group.localToWorld(new THREE.Vector3(0.03, 0.01, 0.0));
    const rv = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 2 + Math.random(), 0));
    if (!st.pump || true) G.fx.casing(ej, rv, st.ammo);
    G.shake(st.cls === 'Shotgun' ? 0.25 : 0.08);
  }
  updateCamera(dt, cam) {
    const head = new THREE.Vector3(this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.62), this.pos.z);
    const z = this.aimT; const st = this.weapon?.stats;
    const scoped = st?.scope && z > 0.85;
    const fp = this.fp || this.dead === false && scoped;
    this.fpNow = !!fp;
    let fov = this.game.engine.baseFov;
    if (z > 0) fov = THREE.MathUtils.lerp(fov, fov / (fp ? (st?.zoom || 1.1) : Math.min(1.35, st?.zoom || 1.1)), z);
    if (this.sprinting) fov += 6;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 12); cam.updateProjectionMatrix();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    if (this.dead) { const p = this.pos.clone().add(new THREE.Vector3(Math.sin(this.game.time * 0.2) * 6, 4, Math.cos(this.game.time * 0.2) * 6)); cam.position.lerp(p, Math.min(1, dt * 2)); cam.lookAt(this.pos); this.op.root.visible = true; return; }
    if (fp) { cam.position.copy(head); cam.quaternion.copy(q); this.op.root.visible = false; }
    else {
      this.op.root.visible = true;
      const off = new THREE.Vector3(THREE.MathUtils.lerp(0.85, 0.55, z), THREE.MathUtils.lerp(0.18, 0.08, z), THREE.MathUtils.lerp(2.8, 1.3, z));
      const want = head.clone().add(off.clone().applyQuaternion(q));
      // camera collision: pull in if geometry is between head and camera
      const dir = want.clone().sub(head); const L = dir.length(); dir.normalize();
      const h = this.game.world.col.ray(head, dir, L + 0.2); const dist = h ? Math.max(0.3, h.t - 0.25) : L;
      cam.position.copy(head).addScaledVector(dir, dist); cam.quaternion.copy(q);
    }
    // shake
    if (this.shakeT > 0) { this.shakeT = Math.max(0, this.shakeT - dt * 2); const s = this.shakeT * 0.05; cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.rotateZ((Math.random() - 0.5) * s * 0.5); }
    this.game.engine.camera.updateMatrixWorld();
  }
  updateViewmodel(dt, cam, speed) {
    const vm = this.vmGun; this.vm.visible = !!(this.fpNow && vm && !this.dead);
    if (!vm || !this.vm.visible) return;
    const st = this.weapon.stats; const z = this.aimT;
    this.bob += speed * dt * 1.9;
    const bobA = Math.min(1, speed / 4) * (1 - z * 0.9);
    this.vmKick = (this.vmKick || 0) * Math.exp(-dt * 16);
    // hip: offset right/down; ADS: sight on camera axis
    const s = vm.sight; const hip = new THREE.Vector3(0.17, -0.2, -0.38 - 0.0).sub(vm.grip.clone().multiplyScalar(0.0));
    const ads = new THREE.Vector3(0, -s.y, -(s.z + s.eye) + 0.0);
    const p = hip.lerp(ads, z);
    p.x += Math.sin(this.bob) * 0.012 * bobA; p.y += Math.abs(Math.cos(this.bob)) * 0.012 * bobA; p.z += this.vmKick * 0.045;
    if (this.sprinting) { p.x += 0.05; p.y -= 0.06; }
    if (this.reloadT >= 0 && !st.perShell) p.y -= Math.sin(this.reloadT * Math.PI) * 0.12;
    if (this.healT >= 0) p.y -= 0.25;
    if (this.swapT > 0) p.y -= this.swapT * 0.5;
    vm.group.position.lerp(p, Math.min(1, dt * 25));
    const rx = this.vmKick * 0.06 + (this.sprinting ? -0.5 : 0), ry = (this.sprinting ? 0.6 : 0) + (1 - z) * 0.03, rz = this.sprinting ? 0.3 : 0;
    vm.group.rotation.x += (rx - vm.group.rotation.x) * Math.min(1, dt * 14); vm.group.rotation.y += (ry - vm.group.rotation.y) * Math.min(1, dt * 14); vm.group.rotation.z += (rz - vm.group.rotation.z) * Math.min(1, dt * 14);
    if (vm.mag) { vm.mag.position.copy(vm.magRest); if (this.reloadT >= 0 && !st.perShell) { vm.mag.position.y -= Math.sin(Math.min(1, this.reloadT * 1.4) * Math.PI) * 0.2; } }
    if (vm.pump) { vm.pump.position.copy(vm.pumpRest); vm.pump.position.z += (this.op.pumpT || 0) * 0.08; }
    // hide viewmodel when looking through a magnified scope
    if (st.scope && z > 0.85) this.vm.visible = false;
  }
  updateLaser(cam) {
    const w = this.weapon; const on = !!(w && w.stats.laser && !this.dead && !this.sprinting);
    this.laserBeam.visible = this.laserDot.visible = on; if (!on) return;
    const gun = this.fpNow ? this.vmGun : w.model; if (!gun?.laser) { this.laserBeam.visible = this.laserDot.visible = false; return; }
    const o = gun.laser.getWorldPosition(new THREE.Vector3()); const { o: co, d } = this.aimRay(cam);
    const h = this.game.world.col.ray(co, d, 120); const tgt = co.clone().addScaledVector(d, h ? h.t : 120);
    const dir = tgt.clone().sub(o); const L = dir.length();
    this.laserBeam.position.copy(o); this.laserBeam.lookAt(tgt); this.laserBeam.scale.set(1, 1, L); this.laserDot.position.copy(tgt); this.laserBeam.visible = !this.fpNow || this.aimT < 0.5;
  }
}
