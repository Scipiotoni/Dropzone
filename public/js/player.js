// Player: input, capsule movement, third/first-person camera, weapon handling (fire, recoil, spread, ADS, reload),
// health/armor, healing and interaction.
import * as THREE from 'three';
import { Operator } from './character.js';
import { buildGun } from './guns.js';
import { WEAPONS, ITEMS, weaponStats, DEFAULT_MODS, encumbrance, entryKg, BODY_KG } from './items.js';
import { WeaponAnimator } from './anim.js';
import { Ballistics, CARTRIDGE } from './ballistics.js';
import { audio } from './audio.js';

// Mouse capture: real pointer lock where the browser allows it; otherwise (embedded frames, some app views) a "soft"
// capture: the hidden cursor's movement steers the camera, the screen edges keep turning, and arrow keys look too.
export class Input {
  constructor(dom) {
    this.keys = new Set(); this.pressed = new Set(); this.mx = 0; this.my = 0; this.buttons = 0; this.clicked = 0; this.wheel = 0; this.locked = false; this.dom = dom;
    this.soft = false; this.softActive = false; this.cx = innerWidth / 2; this.cy = innerHeight / 2;
    addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; if (!this.keys.has(e.code)) this.pressed.add(e.code); this.keys.add(e.code); if (['Tab', 'Space'].includes(e.code) || (e.code.startsWith('Arrow'))) e.preventDefault(); if (e.code === 'Escape' && this.softActive) { this.softActive = false; this.update(); } });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; if (this.softActive) { this.softActive = false; this.update(); } });
    addEventListener('mousemove', (e) => { this.cx = e.clientX; this.cy = e.clientY; if (this.locked) { this.mx += e.movementX; this.my += e.movementY; } });
    addEventListener('mousedown', (e) => { if (!this.locked) return; this.buttons |= 1 << e.button; this.clicked |= 1 << e.button; });
    addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.update(); if (!this.locked) { this.buttons = 0; this.keys.clear(); } });
    document.addEventListener('pointerlockerror', () => this.enableSoft());
  }
  update() { this.locked = document.pointerLockElement === this.dom || (this.soft && this.softActive); document.body.classList.toggle('softlook', this.soft && this.softActive); }
  enableSoft() { this.soft = true; this.softActive = true; this.update(); }
  lock() {
    if (this.locked) return;
    if (this.soft) { this.softActive = true; this.update(); return; }
    try { const p = this.dom.requestPointerLock?.(); if (p && p.catch) p.catch(() => this.enableSoft()); if (!this.dom.requestPointerLock) this.enableSoft(); } catch (e) { this.enableSoft(); }
    clearTimeout(this.lockTO); this.lockTO = setTimeout(() => { if (document.pointerLockElement !== this.dom && !this.locked) this.enableSoft(); }, 500);
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); if (this.softActive) { this.softActive = false; this.update(); } }
  // extra look input for soft capture: screen-edge turning + arrow keys (pixels-equivalent per second)
  extraLook(dt) {
    let x = 0, y = 0;
    if (this.keys.has('ArrowLeft')) x -= 1; if (this.keys.has('ArrowRight')) x += 1; if (this.keys.has('ArrowUp')) y -= 1; if (this.keys.has('ArrowDown')) y += 1;
    if (this.soft && this.softActive) { const ex = 0.07 * innerWidth, ey = 0.08 * innerHeight; if (this.cx < ex) x -= 1 - this.cx / ex; if (this.cx > innerWidth - ex) x += 1 - (innerWidth - this.cx) / ex; if (this.cy < ey) y -= (1 - this.cy / ey) * 0.6; if (this.cy > innerHeight - ey) y += (1 - (innerHeight - this.cy) / ey) * 0.6; }
    return [x * 700 * dt, y * 450 * dt];
  }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.pressed.has(c); }
  endFrame() { this.pressed.clear(); this.mx = this.my = 0; this.clicked = 0; this.wheel = 0; }
}

export class Player {
  constructor(game) {
    this.game = game; this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0;
    this.op = new Operator('player'); game.scene.add(this.op.root);
    this.hp = 100; this.maxHp = 100; this.armor = 0; this.maxArmor = 0; this.stamina = 100; this.dead = false; this.crouch = false; this.onGround = true;
    this.weapons = [null, null]; this.slot = 0; this.aimT = 0; this.fireCD = 0; this.reloadT = -1; this.kick = new THREE.Vector2(); this.spreadNow = 0;
    this.fp = false; this.shakeT = 0; this.healT = -1; this.healItem = null; this.lightOn = false; this.bob = 0; this.stepAcc = 0;
    this.anim = new WeaponAnimator(); this.enc = encumbrance(10); this.encT = 0; this.sway = new THREE.Vector2(); this.swayT = 0; this.landImpulse = 0;
    this.vm = new THREE.Group(); game.engine.camera.add(this.vm);
    this.hands = this.makeVmHands(); this.vm.add(this.hands.l, this.hands.r);
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 45, 0.42, 0.45, 1.4); this.flashlight.castShadow = false; game.engine.camera.add(this.flashlight, this.flashlight.target); this.flashlight.target.position.set(0, 0, -10);
    this.laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 4).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.laserBeam.visible = false; game.scene.add(this.laserBeam);
    this.laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false })); this.laserDot.visible = false; game.scene.add(this.laserDot);
    this.stats = { shotsDist: 0, hitsN: 0, heads: 0, crouchT: 0, adsT: 0, sprintT: 0, stillShootT: 0, fightT: 0, shots: 0 };
  }
  get weapon() { return this.weapons[this.slot]; }
  reattach(scene) { scene.add(this.op.root, this.laserBeam, this.laserDot); }
  setLoadout({ primary, secondary, vest, pack, armor }) {
    this.weapons = [primary ? this.makeWeapon(primary) : null, secondary ? this.makeWeapon(secondary) : null];
    if (!this.weapons[0] && this.weapons[1]) this.slot = 1; else this.slot = 0;
    this.vestId = vest || null; this.maxArmor = vest ? ITEMS[vest].armor : 0; this.armor = armor ?? this.maxArmor;
    this.packId = pack || 'pack1'; this.op.setPack(+this.packId.slice(-1)); this.op.setVest(vest ? +vest.slice(-1) : 0);
    this.equipCurrent(true);
  }
  makeWeapon(w) { const s = weaponStats(w); return { id: w.id, mods: { ...DEFAULT_MODS, ...(w.mods || {}) }, uid: w.uid, stats: s, mag: w.mag ?? s.mag, model: null, mode: s.modes[s.modes.length - 1], zero: s.scope ? 100 : 50, burstLeft: 0 }; }
  equipCurrent(instant) {
    const w = this.weapon; this.reloadT = -1; this.anim.stop();
    if (this.vmGun) { this.vm.remove(this.vmGun.group); this.vmGun = null; }
    if (!w) { this.op.attachGun(null); return; }
    w.model = buildGun(w.id, w.mods); this.op.attachGun(w.model);
    this.vmGun = buildGun(w.id, w.mods); this.vm.add(this.vmGun.group);
    this.vmGun.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    if (!instant) { this.anim.play('draw', 0.5); audio.mech(null, 'reload'); }
    this.game.net?.dirty();
  }
  // first-person gloved hands + sleeves; posed every frame from the animation's hand targets
  makeVmHands() {
    const M = this.op.M; const mk = (sx) => {
      const h = new THREE.Group();
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.085, 0.095), M.gloves); glove.position.set(sx * 0.012, -0.01, 0); h.add(glove);
      const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.03, 0.05), M.gloves); fingers.position.set(sx * 0.014, -0.045, -0.03); h.add(fingers);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.05), M.gloves); thumb.position.set(-sx * 0.022, 0.03, -0.025); h.add(thumb);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.5, 7).translate(0, 0.25, 0).rotateX(Math.PI / 2), M.uni); h.add(sleeve); h.userData.sleeve = sleeve;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 7).rotateX(Math.PI / 2).translate(0, 0, 0.03), M.gloves); h.add(cuff);
      h.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      return h;
    };
    return { l: mk(-1), r: mk(1) };
  }
  spawn(pos, yaw) { this.pos.copy(pos); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0; this.dead = false; this.op.dead = 0; this.op.rig.rotation.set(0, 0, 0); this.op.rig.position.set(0, 0, 0); }
  damage(n, from, by) {
    if (this.dead || this.game.godMode) return;
    if (this.vehicle) { const a = this.vehicle.def.armor; this.vehicle.damage(n * a * 2); n *= 1 - a; }
    let left = n;
    if (this.armor > 0) { const a = Math.min(this.armor, n * 0.7); this.armor -= a; left -= a; }
    this.hp -= left; this.game.ui.hurt(from, n); this.flinch = true;
    if (left >= 14 && Math.random() < 0.35 && !this.bleeding) { this.bleeding = true; this.game.ui.toast('You are bleeding — bandage up (Q)'); }
    this.healT = -1; audio.hit(this.pos, 'flesh');
    this.game.ai?.onPlayerHit(from);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.game.onPlayerDeath(by); }
  }
  // carried weight: weapons (+ loaded mag), backpack contents, vest, pack and base kit
  carriedKg() {
    let kg = BODY_KG; const G = this.game;
    for (const w of this.weapons) if (w) kg += w.stats.kg + w.mag * (ITEMS[w.stats.ammo].kg || 0.012);
    for (const e of G.pack?.items || []) kg += entryKg(e);
    if (this.vestId) kg += ITEMS[this.vestId].kg; kg += ITEMS[this.packId]?.kg || 0;
    return kg;
  }
  // ---- per-frame
  update(dt, input, opts = {}) {
    const G = this.game, W = G.world, cam = G.engine.camera;
    const canAct = !this.dead && input.locked && !opts.frozen;
    this.encT -= dt; if (this.encT <= 0) { this.encT = 0.4; this.enc = encumbrance(this.carriedKg()); }
    const E = this.enc;
    if (input.locked && !this.dead) {
      const zoomSens = this.aimT > 0.5 ? 1 / Math.max(1, (this.weapon?.stats.zoom || 1) * 0.8) : 1;
      const sens = 0.0022 * (G.settings.sens || 1) * zoomSens;
      this.yaw -= input.mx * sens; this.pitch -= input.my * sens; this.lastMx = input.mx / Math.max(dt, 1e-3) * 0.016; this.lastMy = input.my / Math.max(dt, 1e-3) * 0.016; this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    }
    const rec = Math.min(1, dt * 7); this.pitch += this.kick.y * rec; this.yaw += this.kick.x * rec; this.kick.multiplyScalar(1 - rec);
    if (canAct && input.hit('KeyV')) { this.fp = !this.fp; this.game.settings.view = this.fp ? 'first' : 'third'; this.game.saveSettings(); }
    if (canAct && input.hit('KeyC')) this.crouch = !this.crouch;
    const seated = !!opts.seated;
    const f = seated ? 0 : (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0), s = seated ? 0 : (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const reloading = this.reloadT >= 0;
    const aiming = canAct && (input.buttons & 4) && !opts.build && this.weapon && !reloading && this.healT < 0 && this.anim.name !== 'holster';
    let sprint = canAct && input.down('ShiftLeft') && f > 0 && !aiming && this.stamina > 1 && this.healT < 0 && !E.noSprint;
    if (sprint) this.crouch = false;
    const stimBoost = (this.stimT || 0) > 0;
    const holdBreath = aiming && input.down('ShiftLeft') && this.stamina > 5 && this.weapon?.stats.scope;
    if ((sprint || holdBreath) && !stimBoost) { this.stamina = Math.max(0, this.stamina - dt * (holdBreath ? 18 : 14) * E.stamina); this.stRegen = 1.2; } else { this.stRegen = (this.stRegen || 0) - dt; if (this.stRegen <= 0) this.stamina = Math.min(100, this.stamina + dt * 22 / Math.sqrt(E.stamina)); }
    this.stimT = Math.max(0, (this.stimT || 0) - dt);
    if (this.bleeding && !this.dead && G.mode === 'raid') { this.bleedT = (this.bleedT || 0) + dt; if (this.bleedT > 1.25) { this.bleedT = 0; this.hp -= 1; if (Math.random() < 0.5) G.fx.impact(this.pos.clone().setY(this.pos.y + 0.05), new THREE.Vector3(0, 1, 0), 'flesh'); if (this.hp <= 0) { this.hp = 0; this.dead = true; G.onPlayerDeath('bleeding'); } } }
    if (G.mode !== 'raid') this.bleeding = false;
    const wspd = this.weapon?.stats.speed || 1;
    let speed = (sprint ? 6.6 : this.crouch ? 2.2 : aiming ? 2.7 : 4.3) * wspd * (this.healT >= 0 ? 0.5 : 1) * E.speed;
    if (!canAct) speed = 0;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = fx * f + rx * s, mz = fz * f + rz * s; const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
    const accel = (this.onGround ? 14 : 3) / Math.sqrt(E.stamina);
    this.vel.x += (mx * speed - this.vel.x) * Math.min(1, dt * accel); this.vel.z += (mz * speed - this.vel.z) * Math.min(1, dt * accel);
    if (seated) { this.vel.set(0, 0, 0); }
    else {
    if (canAct && input.hit('Space') && this.onGround) { this.vel.y = 4.9 * E.jump; this.onGround = false; if (this.crouch) this.crouch = false; this.stamina = Math.max(0, this.stamina - 6 * E.stamina); }
    this.vel.y -= 20 * dt;
    const height = this.crouch ? 1.2 : 1.8;
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    [nx, nz] = W.col.resolve(nx, nz, 0.38, this.pos.y, height);
    let ny = this.pos.y + this.vel.y * dt;
    const g = W.col.groundAt(nx, nz, Math.max(this.pos.y, ny) + 0.5, 0.3);
    const ceil = W.col.ceilingAt(nx, nz, this.pos.y + 0.5); if (ny + height > ceil && this.vel.y > 0) { this.vel.y = 0; ny = Math.min(ny, ceil - height); }
    let landed = 0;
    if (ny <= g.y) { if (!this.onGround) { landed = Math.min(1, -this.vel.y / 9); if (this.vel.y < -13 + (E.kg - 20) * 0.05) this.damage((-this.vel.y - 13) * 9 * (E.kg / 25), null); if (this.vel.y < -4) audio.step(this.pos, g.c ? g.c.mat : 'dirt', 1.5); } ny = g.y; this.vel.y = 0; this.onGround = true; }
    else if (ny > g.y + 0.06) this.onGround = false;
    else if (this.onGround && this.vel.y <= 0) ny = g.y;
    if (!this.crouch && W.col.ceilingAt(nx, nz, ny + 0.6) < ny + 1.8) this.crouch = true;
    const moved = this.movedNow = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.pos.set(nx, ny, nz); this.surface = g.c ? g.c.mat : (W.terrain.splatAt?.(nx, nz)[3] > 0.5 ? 'concrete' : 'dirt');
    this.stepAcc += moved; if (this.onGround && this.stepAcc > (sprint ? 2.0 : 1.5)) { this.stepAcc = 0; audio.step(this.pos, this.surface, (this.crouch ? 0.4 : sprint ? 1.2 : 0.8) * (0.8 + E.kg / 60)); if (sprint) G.noise(this.pos, 18 + E.kg * 0.3, null); }
    this.sprinting = sprint && ml > 0;
    this.landedNow = landed; }
    const landed = this.landedNow || 0; this.landedNow = 0; const moved = seated ? 0 : this.movedNow || 0;
    this.aimT += ((aiming ? 1 : 0) - this.aimT) * Math.min(1, dt / Math.max(0.05, (this.weapon?.stats.ads || 0.2) * (0.8 + E.sway * 0.2)) * 2.2);
    this.aiming = aiming;
    // ADS sway: heavier loads and low stamina make the sights wander; hold breath (Shift) with magnified optics
    this.swayT += dt * (0.8 + (1 - this.stamina / 100) * 1.2);
    const swayA = this.aimT * 0.004 * E.sway * (1.4 - this.stamina / 100) * (holdBreath ? 0.15 : 1) * (this.crouch ? 0.6 : 1) * (this.weapon?.stats.scope ? 1.6 : 1);
    this.sway.set(Math.sin(this.swayT * 1.1) * swayA + Math.sin(this.swayT * 2.7) * swayA * 0.3, Math.sin(this.swayT * 1.7 + 1) * swayA * 0.7);
    // switching (holster -> draw)
    if (canAct && !opts.build) {
      let want = -1; if (input.hit('Digit1')) want = 0; if (input.hit('Digit2')) want = 1; if (input.wheel) want = 1 - this.slot;
      if (want >= 0 && want !== this.slot && this.weapons[want] && this.anim.name !== 'holster') { this.reloadT = -1; this.anim.play('holster', 0.28, () => { this.slot = want; this.equipCurrent(); }); }
      if (input.hit('KeyI') && !this.anim.busy && this.weapon) this.anim.play('inspect', 2.6);
    }
    if (canAct && input.hit('KeyL') && this.weapon?.stats.light) { this.lightOn = !this.lightOn; audio.click(1800, 0.06, 0.02); }
    this.flashlight.intensity = this.lightOn && this.weapon?.stats.light ? 60 : 0;
    if (canAct && input.hit('KeyQ') && this.healT < 0) this.startHeal('med');
    if (canAct && input.hit('KeyG') && this.healT < 0) this.startHeal('plate');
    if (this.healT >= 0) { this.healT += dt; if (sprint || (input.buttons & 1)) { this.healT = -1; G.ui.toast('Interrupted'); } else if (this.healT >= ITEMS[this.healItem].time) this.finishHeal(); }
    // weapon logic
    this.fireCD -= dt;
    const w = this.weapon;
    if (w && canAct && !opts.build) {
      const st = w.stats;
      if (input.hit('KeyR') && !reloading && w.mag < st.mag + (st.perShell || WEAPONS[w.id].openBolt ? 0 : 1) && G.pack.count(st.ammo) > 0 && !this.anim.busy) this.startReload();
      if (this.anim.name === 'pumpShell' && (input.buttons & 1) && w.mag > 0) { this.anim.stop(); this.reloadT = -1; this.anim.play('pumpRack', 0.4); }
      if (input.hit('KeyX') && st.modes.length > 1) { const i = st.modes.indexOf(w.mode); w.mode = st.modes[(i + 1) % st.modes.length]; audio.click(2200, 0.06, 0.02); G.ui.toast(`Fire mode: ${w.mode.toUpperCase()}`); }
      if (st.scope && (input.hit('PageUp') || input.hit('Equal'))) { w.zero = Math.min(800, w.zero + 100); G.ui.toast(`Zero ${w.zero} m`); }
      if (st.scope && (input.hit('PageDown') || input.hit('Minus'))) { w.zero = Math.max(100, w.zero - 100); G.ui.toast(`Zero ${w.zero} m`); }
      if (w.mode === 'burst' && (input.clicked & 1) && w.burstLeft <= 0) w.burstLeft = 3;
      if (!(input.buttons & 1) && w.mode === 'burst' && w.burstLeft < 3) w.burstLeft = Math.min(w.burstLeft, 0);
      const trig = w.mode === 'auto' ? (input.buttons & 1) : w.mode === 'burst' ? w.burstLeft > 0 : (input.clicked & 1);
      const busy = this.anim.busy && this.anim.name !== 'inspect';
      if (trig && this.fireCD <= 0 && !reloading && !busy && this.healT < 0 && !this.sprinting) {
        if (this.anim.name === 'inspect') this.anim.stop();
        if (w.mag > 0) { this.fire(); if (w.mode === 'burst') w.burstLeft--; } else { w.burstLeft = 0; audio.mech(this.pos, 'empty'); this.fireCD = 0.25; if (G.pack.count(st.ammo) > 0) this.startReload(); }
      }
    }
    this.anim.empty = !!(w && w.mag === 0 && w.stats.cls === 'Pistol');
    const pose = this.anim.update(dt);
    if (reloading && this.anim.busy) this.reloadT = this.anim.t;
    // spread
    const st = w?.stats; const moveF = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 4.3);
    const base = st ? st.spread * (1 - this.aimT * (st.cls === 'Shotgun' ? 0.4 : st.cls === 'Sniper' ? 0.97 : 0.85)) * (this.crouch ? 0.75 : 1) * (1 + moveF * (1 - this.aimT * 0.7)) * (this.onGround ? 1 : 2) : 0;
    this.spreadNow += (base - this.spreadNow) * Math.min(1, dt * 10); this.spreadBloom = Math.max(0, (this.spreadBloom || 0) - dt * 6);
    // playstyle tracking for the adaptive AI
    const S = this.stats; if (G.mode === 'raid') { if (this.crouch) S.crouchT += dt; if (this.aimT > 0.5) S.adsT += dt; if (this.sprinting) S.sprintT += dt; S.raidT = (S.raidT || 0) + dt; }
    if (seated) { if (w?.model) this.anim.apply(w.model); this.updateLaser(cam); return; }
    // character animation
    this.op.root.position.copy(this.pos); this.op.root.rotation.set(0, this.yaw, 0);
    const vrel = new THREE.Vector3(this.vel.x, 0, this.vel.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    const gm = w?.model;
    if (gm) this.anim.apply(gm);
    this.op.update(dt, { speed: moved / Math.max(dt, 1e-4), fwd: vrel.z <= 0.3 ? 1 : -1, side: THREE.MathUtils.clamp(vrel.x / 4, -1, 1), crouch: this.crouch, air: !this.onGround, sprint: this.sprinting, aim: this.aimT > 0.3 || this.fireCD > -0.4, pitch: this.pitch, dead: this.dead,
      land: landed, flinch: this.flinch, vx: this.vel.x, vz: this.vel.z, ground: this.groundFn || (this.groundFn = (x, z) => this.game.world.col.groundAt(x, z, this.pos.y + 0.6).y), gunPose: pose.gun, lh: gm ? this.anim.handTarget(gm, pose.lh, 'l', _lh) : null, rh: gm && pose.rh ? this.anim.handTarget(gm, pose.rh, 'r', _rh) : null, lowReady: this.healT >= 0 });
    this.flinch = false;
    this.updateCamera(dt, cam, landed);
    this.updateViewmodel(dt, cam, moved / Math.max(dt, 1e-4), pose);
    this.updateLaser(cam);
  }
  startReload() {
    const w = this.weapon; if (!w) return; const st = w.stats, G = this.game; const kind = WEAPONS[w.id].anim;
    this.aimT = Math.min(this.aimT, 0.3); this.reloadT = 0;
    if (st.perShell) {
      const one = () => { if (G.pack.take(st.ammo, 1)) { w.mag++; audio.mech(this.pos, 'empty'); } if (w.mag < st.mag && G.pack.count(st.ammo) > 0) this.anim.play('pumpShell', st.reload, one); else { this.reloadT = -1; this.anim.play('pumpRack', 0.45); audio.mech(this.pos, 'pump'); } };
      this.anim.play('pumpShell', st.reload, one); return;
    }
    const empty = w.mag === 0;
    const clip = kind === 'bolt' ? 'boltLoad' : kind;
    audio.mech(this.pos, 'reload');
    const plusOne = !empty && !WEAPONS[w.id].openBolt && kind !== 'bolt';
    this.anim.play(clip, st.reload * (empty ? 1.12 : 1), () => { const cap = st.mag + (plusOne ? 1 : 0); const need = cap - w.mag; w.mag += G.pack.take(st.ammo, need); this.reloadT = -1; audio.mech(this.pos, 'pump'); });
  }
  startHeal(kind) {
    const G = this.game; let id = null;
    if (kind === 'plate') { if (!this.vestId) return G.ui.toast('No armor vest equipped'); if (this.armor >= this.maxArmor) return G.ui.toast('Armor is full'); if (G.pack.count('plate') > 0) id = 'plate'; }
    else { if (this.hp >= this.maxHp && !this.bleeding) return G.ui.toast('Health is full'); const miss = this.maxHp - this.hp; const order = miss > 50 ? ['medkit', 'stim', 'bandage'] : miss > 25 ? ['stim', 'bandage', 'medkit'] : ['bandage', 'stim', 'medkit']; id = order.find((k) => G.pack.count(k) > 0); }
    if (!id) return G.ui.toast(kind === 'plate' ? 'No armor plates' : 'No medical supplies');
    this.healItem = id; this.healT = 0; this.reloadT = -1; this.anim.stop(); audio.click(500, 0.08, 0.15, 'sine');
  }
  finishHeal() {
    const G = this.game, it = ITEMS[this.healItem]; G.pack.take(this.healItem, 1);
    if (this.healItem !== 'plate') this.bleeding = false;
    if (this.healItem === 'plate') this.armor = Math.min(this.maxArmor, this.armor + 50); else { this.hp = Math.min(this.maxHp, this.hp + it.heal); if (it.stamina) { this.stimT = it.stamina; this.stamina = 100; } }
    G.ui.toast(`${it.name} used`); this.healT = -1; audio.click(800, 0.08, 0.2, 'sine');
  }
  aimRay(cam) { const o = cam.getWorldPosition(new THREE.Vector3()); const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())); return { o, d }; }
  fire() {
    const G = this.game, w = this.weapon, st = w.stats, cam = G.engine.camera;
    w.mag--; this.fireCD = 60 / st.rpm; this.anim.fire();
    if (st.pump && w.mag > 0) this.anim.play('pumpRack', Math.min(0.55, this.fireCD * 0.9));
    if (st.bolt && w.mag > 0) this.anim.play('boltCycle', this.fireCD * 0.92);
    const { o, d } = this.aimRay(cam);
    const head = this.pos.clone(); head.y += this.crouch ? 1.1 : 1.55; const skip = Math.max(0, head.clone().sub(o).dot(d)); o.addScaledVector(d, skip);
    const gun = this.fpNow ? this.vmGun : w.model;
    const muzzle = gun.muzzle.getWorldPosition(new THREE.Vector3());
    const spreadDeg = this.spreadNow + (this.spreadBloom || 0) * (1 - this.aimT * 0.6);
    // real ballistics: each pellet / bullet is a projectile with the cartridge's velocity, drop and drag; the barrel is
    // angled up by the zero so the round crosses the sight line at the zeroed distance
    const zeroA = Ballistics.zeroAngle(st.ammo, w.zero || 50);
    const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, d);
    for (let p = 0; p < st.pellets; p++) {
      const sp = THREE.MathUtils.degToRad(st.pellets > 1 ? st.pelletSpread + spreadDeg * 0.3 : spreadDeg) * 0.5;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sp;
      const dir = d.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r + zeroA).normalize();
      G.ballistics.fire(o, dir, { ammo: st.ammo, damage: st.damage, muzzle, range: st.range, color: 0xffd080, onHit: (eh, end, dmg, dist) => {
        eh.point = end; eh.enemy.damage(dmg * eh.mult, eh, this.pos, true); G.ui.hitmarker(eh.mult > 1.4, !eh.enemy.alive); audio.hitmarker();
        if (eh.enemy.type !== 'raider' && eh.enemy.type !== 'player') audio.hit(end, 'machine');
        this.stats.hitsN++; this.stats.shotsDist += dist; if (eh.mult > 1.4) this.stats.heads++; G.ai?.onPlayerHitEnemy(eh.enemy, dist);
      } });
      if (p === 0) G.net?.event('shot', [+muzzle.x.toFixed(2), +muzzle.y.toFixed(2), +muzzle.z.toFixed(2), +dir.x.toFixed(4), +dir.y.toFixed(4), +dir.z.toFixed(4), st.loud < 0.5 ? 1 : 0, st.ammo]);
    }
    this.stats.shots++; if (Math.hypot(this.vel.x, this.vel.z) < 0.5) this.stats.stillShootT += 60 / st.rpm;
    const rm = (this.crouch ? 0.82 : 1) * (this.aimT > 0.5 ? 0.85 : 1) * (0.85 + this.enc.sway * 0.1);
    this.kick.y += THREE.MathUtils.degToRad(st.recoil) * rm; this.kick.x += THREE.MathUtils.degToRad((Math.random() - 0.45) * st.hrecoil * 2) * rm;
    this.spreadBloom = Math.min(st.spread * 1.5, (this.spreadBloom || 0) + st.recoil * 0.35);
    this.op.kick = 1; this.vmKick = 1;
    G.fx.muzzle(gun.muzzle, d, st.cls === 'Shotgun' ? 1.6 : st.cls === 'Pistol' ? 0.8 : 1.1, st.flash);
    audio.gunshot(gunSound(st), null, st.loud);
    G.noise(this.pos, 140 * st.loud, null);
    if (!st.pump && !st.bolt) { const ej = gun.group.localToWorld(new THREE.Vector3(0.03, 0.01, 0.0)); const rv = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 2 + Math.random(), 0)); G.fx.casing(ej, rv, st.ammo); }
    G.shake(st.cls === 'Shotgun' || st.cls === 'Sniper' ? 0.25 : 0.08);
  }
  updateCamera(dt, cam, landed) {
    const head = new THREE.Vector3(this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.62), this.pos.z);
    this.landImpulse = Math.max(this.landImpulse * Math.exp(-dt * 6), landed || 0); head.y -= this.landImpulse * 0.12;
    const z = this.aimT; const st = this.weapon?.stats;
    const scoped = st?.scope && z > 0.85;
    const fp = this.fp || (this.dead === false && scoped);
    this.fpNow = !!fp;
    let fov = this.game.engine.baseFov;
    if (z > 0) fov = THREE.MathUtils.lerp(fov, fov / (fp ? (st?.zoom || 1.1) : Math.min(1.35, st?.zoom || 1.1)), z);
    if (this.sprinting) fov += 6;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 12); cam.updateProjectionMatrix();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch + this.sway.y, this.yaw + this.sway.x, 0, 'YXZ'));
    if (this.dead) { const p = this.pos.clone().add(new THREE.Vector3(Math.sin(this.game.time * 0.2) * 6, 4, Math.cos(this.game.time * 0.2) * 6)); cam.position.lerp(p, Math.min(1, dt * 2)); cam.lookAt(this.pos); this.op.root.visible = true; return; }
    if (fp) { cam.position.copy(head); cam.quaternion.copy(q); this.op.root.visible = false; }
    else {
      this.op.root.visible = true;
      const off = new THREE.Vector3(THREE.MathUtils.lerp(0.85, 0.55, z), THREE.MathUtils.lerp(0.18, 0.08, z), THREE.MathUtils.lerp(2.8, 1.3, z));
      const want = head.clone().add(off.clone().applyQuaternion(q));
      const dir = want.clone().sub(head); const L = dir.length(); dir.normalize();
      const h = this.game.world.col.ray(head, dir, L + 0.2); const dist = h ? Math.max(0.3, h.t - 0.25) : L;
      cam.position.copy(head).addScaledVector(dir, dist); cam.quaternion.copy(q);
    }
    if (this.shakeT > 0) { this.shakeT = Math.max(0, this.shakeT - dt * 2); const s = this.shakeT * 0.05; cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.rotateZ((Math.random() - 0.5) * s * 0.5); }
    cam.updateMatrixWorld();
  }
  updateViewmodel(dt, cam, speed, pose) {
    const vm = this.vmGun; const show = !!(this.fpNow && vm && !this.dead);
    this.vm.visible = show; if (!show) return;
    const st = this.weapon.stats; const z = this.aimT;
    this.bob += speed * dt * 1.9;
    const bobA = Math.min(1, speed / 4) * (1 - z * 0.9) * (0.8 + this.enc.sway * 0.2);
    this.vmKick = (this.vmKick || 0) * Math.exp(-dt * 16);
    const s = vm.sight; const hip = new THREE.Vector3(0.16, -0.155, -0.4);
    const ads = new THREE.Vector3(0, -s.y, -(s.z + s.eye));
    const p = hip.lerp(ads, z * (this.anim.busy && this.anim.name !== 'boltCycle' ? 0 : 1));
    p.x += Math.sin(this.bob) * 0.012 * bobA; p.y += Math.abs(Math.cos(this.bob)) * 0.012 * bobA - this.landImpulse * 0.03; p.z += this.vmKick * 0.045;
    if (this.sprinting) { p.x += 0.05; p.y -= 0.06; }
    if (this.healT >= 0) p.y -= 0.25;
    const g = pose.gun; p.x += g[3]; p.y += g[4]; p.z += g[5];
    // weapon inertia: the gun lags behind fast mouse turns (heavier guns lag more), springing back
    const inert = 0.00004 * (0.6 + (st.kg || 3) * 0.15) * (1 - z * 0.7); this.vmLag = this.vmLag || new THREE.Vector2();
    this.vmLag.x += (THREE.MathUtils.clamp(-(this.lastMx || 0) * inert, -0.03, 0.03) - this.vmLag.x) * Math.min(1, dt * 10); this.vmLag.y += (THREE.MathUtils.clamp((this.lastMy || 0) * inert, -0.03, 0.03) - this.vmLag.y) * Math.min(1, dt * 10);
    p.x += this.vmLag.x; p.y += this.vmLag.y;
    vm.group.position.lerp(p, Math.min(1, dt * 25));
    const rx = this.vmKick * 0.06 + (this.sprinting ? -0.5 : 0) + g[0] - this.vmLag.y * 2, ry = (this.sprinting ? 0.6 : 0) + (1 - z) * 0.03 + g[1] + this.vmLag.x * 3, rz = (this.sprinting ? 0.3 : 0) + g[2] + this.vmLag.x * 4;
    const k = Math.min(1, dt * 16); vm.group.rotation.x += (rx - vm.group.rotation.x) * k; vm.group.rotation.y += (ry - vm.group.rotation.y) * k; vm.group.rotation.z += (rz - vm.group.rotation.z) * k;
    this.anim.apply(vm);
    // hands follow the animation targets; sleeves point back toward the shoulders
    vm.group.updateMatrix();
    const place = (hand, target, elbow) => { hand.position.copy(target).applyMatrix4(vm.group.matrix); hand.quaternion.copy(vm.group.quaternion); const el = _e.copy(elbow); hand.userData.sleeve.lookAt(hand.localToWorld(_t.set(0, 0, 0)).add(el.applyQuaternion(cam.quaternion)).add(cam.position).sub(cam.position)); };
    this.hands.r.position.copy(this.anim.handTarget(vm, pose.rh, 'r', _rh)).applyMatrix4(vm.group.matrix); this.hands.r.quaternion.copy(vm.group.quaternion);
    this.hands.l.position.copy(this.anim.handTarget(vm, pose.lh, 'l', _lh)).applyMatrix4(vm.group.matrix); this.hands.l.quaternion.copy(vm.group.quaternion);
    aimSleeve(this.hands.r, _er.set(0.28, -0.5, 0.25)); aimSleeve(this.hands.l, _el.set(-0.3, -0.5, 0.15));
    if (st.scope && z > 0.85) this.vm.visible = false;
  }
  updateLaser(cam) {
    const w = this.weapon; const on = !!(w && w.stats.laser && !this.dead && !this.sprinting);
    this.laserBeam.visible = this.laserDot.visible = on; if (!on) return;
    const gun = this.fpNow ? this.vmGun : w.model; if (!gun?.laser) { this.laserBeam.visible = this.laserDot.visible = false; return; }
    const o = gun.laser.getWorldPosition(new THREE.Vector3()); const { o: co, d } = this.aimRay(cam);
    const h = this.game.world.col.ray(co, d, 120); const tgt = co.clone().addScaledVector(d, h ? h.t : 120);
    const L = tgt.distanceTo(o);
    this.laserBeam.position.copy(o); this.laserBeam.lookAt(tgt); this.laserBeam.scale.set(1, 1, L); this.laserDot.position.copy(tgt); this.laserBeam.visible = !this.fpNow || this.aimT < 0.5;
  }
}
// sleeve (child of a vm hand) aims from the wrist toward a fixed elbow point in viewmodel space
function aimSleeve(hand, elbowVm) {
  const local = _t.copy(elbowVm).sub(hand.position).applyQuaternion(_qq.copy(hand.quaternion).invert());
  const sl = hand.userData.sleeve; sl.quaternion.setFromUnitVectors(_fz, local.normalize());
}
export function gunSound(st) { return st.cls === 'Pistol' ? (st.damage > 50 ? 'heavy' : 'pistol') : st.cls === 'SMG' ? 'smg' : st.cls === 'Shotgun' ? 'shotgun' : ['Battle Rifle', 'DMR', 'Sniper'].includes(st.cls) ? 'heavy' : 'rifle'; }
const _lh = new THREE.Vector3(), _rh = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3(), _er = new THREE.Vector3(), _el = new THREE.Vector3(), _qq = new THREE.Quaternion(), _fz = new THREE.Vector3(0, 0, 1);
