// Adaptive AI director. It watches how you fight (range, crouching, camping, headshots, suppressors, favourite drop
// zones and LZs, vehicles, which enemies you kill) and persists that profile across raids. From it it derives a
// doctrine the hostiles use: raider squads pick counter-tactics (bounding through cover with smoke against snipers,
// holding angles against rushers, grenades and flanks against campers), wear helmets against headshot players,
// investigate bullet impacts against suppressed play, and ambush the LZs you favour.
import * as THREE from 'three';

const KEY = 'dropzone.ai.v1';
const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ } } };
const ema = (a, b, k) => a + (b - a) * k;

export function defaultProfile() {
  return { raids: 0, engageDist: 35, aggression: 0.4, crouch: 0.2, ads: 0.4, camping: 0.3, headshot: 0.15, suppressed: 0, vehicle: 0,
    zones: {}, lzs: {}, kills: { drone: 0, crawler: 0, strider: 0, sentinel: 0, raider: 0, player: 0 }, killedBy: {}, flank: 0 };
}

export class Director {
  constructor(game) {
    this.game = game; this.profile = { ...defaultProfile(), ...(store.get() || {}) };
    this.raid = null; this.smokes = []; this.grenades = []; this.squads = [];
    this.remoteDoctrines = new Map();
    this.doctrine = this.compute(this.profile);
  }
  // ---------- learning
  startRaid(zoneId) { this.raid = { zone: zoneId, hits: 0, dist: 0, heads: 0, t0: performance.now(), firstContact: null, closeHits: 0, suppressedShots: 0, shots: 0, vehicleT: 0 }; this.profile.zones[zoneId] = (this.profile.zones[zoneId] || 0) + 1; this.doctrine = this.compute(this.profile); }
  onPlayerHitEnemy(e, dist) { const R = this.raid; if (!R) return; R.hits++; R.dist += dist; if (dist < 15) R.closeHits++; if (R.firstContact === null) R.firstContact = (performance.now() - R.t0) / 1000; }
  onPlayerHit(from) { /* used for flank learning: where are you usually hit from relative to your facing? */
    const P = this.game.player; if (!from || !P) return; const ang = Math.atan2(from.x - P.pos.x, -(from.z - P.pos.z)) + P.yaw; this.profile.flank = ema(this.profile.flank, Math.sin(ang), 0.05);
  }
  onKill(e) { if (e?.type && this.profile.kills[e.type] !== undefined) this.profile.kills[e.type]++; }
  onDeath(by) { if (by) this.profile.killedBy[by] = (this.profile.killedBy[by] || 0) + 1; this.endRaid(null); }
  endRaid(lzId) {
    const R = this.raid; const P = this.game.player; if (!R) return; const S = P.stats; const T = Math.max(1, S.raidT || 1);
    const Pf = this.profile; const k = 0.35;
    if (R.hits >= 3) { Pf.engageDist = ema(Pf.engageDist, R.dist / R.hits, k); Pf.headshot = ema(Pf.headshot, S.heads / Math.max(1, S.hitsN), k); }
    Pf.crouch = ema(Pf.crouch, S.crouchT / T, k); Pf.ads = ema(Pf.ads, S.adsT / T, k);
    Pf.aggression = ema(Pf.aggression, Math.min(1, S.sprintT / T * 3 + (R.closeHits / Math.max(1, R.hits)) * 0.6), k);
    Pf.camping = ema(Pf.camping, Math.min(1, S.stillShootT / Math.max(1, S.shots * 0.12)), k);
    const w = P.weapon; Pf.suppressed = ema(Pf.suppressed, w && w.stats.loud < 0.5 ? 1 : 0, k);
    Pf.vehicle = ema(Pf.vehicle, Math.min(1, (S.vehicleT || 0) / T * 2), k);
    if (lzId) Pf.lzs[lzId] = (Pf.lzs[lzId] || 0) + 1;
    Pf.raids++; this.raid = null; store.set(Pf); this.doctrine = this.compute(Pf);
    for (const key of Object.keys(S)) S[key] = 0;
  }
  // ---------- doctrine
  compute(p) {
    const band = p.engageDist > 55 ? 'long' : p.engageDist < 18 ? 'close' : 'mid';
    const topLZ = Object.entries(p.lzs).sort((a, b) => b[1] - a[1])[0];
    const topZone = Object.entries(p.zones).sort((a, b) => b[1] - a[1])[0];
    const k = p.kills, totalK = Object.values(k).reduce((a, b) => a + b, 0) || 1;
    const D = {
      band, experience: Math.min(1, p.raids / 8),
      raiderRange: band === 'long' ? 14 : band === 'close' ? 32 : 22,  // counter: close the gap on snipers, keep distance from rushers
      useSmoke: band === 'long' ? 0.7 : 0.15, holdAngles: band === 'close' ? 0.7 : 0.2,
      flank: 0.25 + p.camping * 0.45 + (p.raids > 2 ? 0.1 : 0), grenades: 0.2 + p.camping * 0.6,
      helmets: p.headshot > 0.28 ? 0.7 : 0.2, investigateImpacts: p.suppressed > 0.4, accuracy: 1 + Math.min(0.35, p.raids * 0.04),
      ambushLZ: topLZ && topLZ[1] >= 2 ? topLZ[0] : null, hotZone: topZone && topZone[1] >= 2 ? topZone[0] : null,
      antiVehicle: p.vehicle > 0.25, droneShare: Math.min(0.5, 0.2 + (k.raider / totalK) * 0.3), machineFlank: band === 'long',
      flankSide: p.flank > 0.15 ? 1 : p.flank < -0.15 ? -1 : 0,
    };
    return D;
  }
  // doctrine for a specific target (remote players publish their own summary)
  doctrineFor(target) { if (!target || target === this.game.player) return this.doctrine; return this.remoteDoctrines.get(target.peer) || this.doctrine; }
  summary() { const d = this.doctrine; return [d.band, +d.flank.toFixed(2), +d.grenades.toFixed(2), +d.helmets.toFixed(2), d.investigateImpacts ? 1 : 0, d.antiVehicle ? 1 : 0, +d.accuracy.toFixed(2)]; }
  fromSummary(peer, s) { if (!Array.isArray(s)) return; const base = this.compute(defaultProfile()); this.remoteDoctrines.set(peer, { ...base, band: s[0], raiderRange: s[0] === 'long' ? 14 : s[0] === 'close' ? 32 : 22, useSmoke: s[0] === 'long' ? 0.7 : 0.15, holdAngles: s[0] === 'close' ? 0.7 : 0.2, flank: s[1], grenades: s[2], helmets: s[3], investigateImpacts: !!s[4], antiVehicle: !!s[5], accuracy: s[6] }); }
  intel() {
    const p = this.profile, d = this.doctrine, out = [];
    if (p.raids === 0) return ['No combat data yet. The hostiles in Ashgrove will start adapting once they have seen you fight.'];
    out.push(`Raids observed: ${p.raids}. Your typical engagement range is ~${Math.round(p.engageDist)} m (${d.band} range).`);
    if (d.band === 'long') out.push('Raider squads now close distance by bounding between cover and screening their advance with smoke. Drones try to come at you from behind.');
    if (d.band === 'close') out.push('Raiders have learned you rush: they hold angles from cover, keep their distance and carry more shotguns. Crawlers kite instead of charging.');
    if (d.band === 'mid') out.push('Raiders fight you at medium range with peek-and-shoot cover cycles.');
    if (d.flank > 0.45) out.push('You tend to stay put while shooting. Expect flanking teams and grenades to flush you out.');
    if (d.helmets > 0.5) out.push('You land a lot of headshots: more raiders now wear ballistic helmets.');
    if (d.investigateImpacts) out.push('You favour suppressed weapons: hostiles now investigate bullet impacts to trace where you are shooting from.');
    if (d.ambushLZ) out.push(`You often extract at ${d.ambushLZ.toUpperCase()} LZ. Raiders have started staking it out.`);
    if (d.hotZone) out.push(`You drop into ${d.hotZone} a lot. Expect a heavier presence there.`);
    if (d.antiVehicle) out.push('You rely on vehicles: Striders and raiders prioritise vehicles and set roadblocks.');
    if (p.flank > 0.15 || p.flank < -0.15) out.push(`You get hit from your ${p.flank > 0 ? 'right' : 'left'} most: flankers now favour that side.`);
    out.push(`Hostile accuracy multiplier: ×${d.accuracy.toFixed(2)} (grows as they gain experience with you).`);
    return out;
  }
  // ---------- squads
  formSquads(enemies) {
    this.squads = [];
    const raiders = enemies.filter((e) => e.type === 'raider');
    for (const r of raiders) {
      if (r.squad) continue;
      const sq = { id: this.squads.length, members: [r], lastSeen: null, seenT: -99, alert: 0 };
      for (const o of raiders) if (!o.squad && o !== r && o.pos.distanceTo(r.pos) < 40 && sq.members.length < 4) sq.members.push(o);
      sq.members.forEach((m, i) => { m.squad = sq; m.role = i === 0 ? 'leader' : i === 1 ? 'support' : i === 2 ? 'flanker' : 'assault'; });
      this.squads.push(sq);
    }
  }
  callout(squad, pos, t) { if (!squad) return; squad.lastSeen = pos.clone(); squad.seenT = t; squad.alert = 1; for (const m of squad.members) if (m.alive && m.state === 'idle') { m.state = 'search'; m.lastSeen = pos.clone(); } }
  // ---------- cover search: points near `from` that block the threat's view when crouched but can peek when standing
  findCover(from, threat, opts = {}) {
    const col = this.game.world.col; let best = null, bs = -1e9;
    const pref = opts.prefDist ?? 22, flankAng = opts.flank || 0;
    const tdir = Math.atan2(from.x - threat.x, from.z - threat.z);
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + ring * 0.3, r = 4 + ring * 5;
      const x = from.x + Math.sin(a) * r, z = from.z + Math.cos(a) * r;
      const g = col.groundAt(x, z, from.y + 3); if (Math.abs(g.y - from.y) > 2.5) continue;
      const [rx, rz, blocked] = col.resolve(x, z, 0.4, g.y, 1.7); if (blocked && Math.hypot(rx - x, rz - z) > 0.3) continue;
      const low = _a.set(rx, g.y + 0.9, rz), high = _b.set(rx, g.y + 1.6, rz), t = _c.set(threat.x, threat.y + 1.4, threat.z);
      const covered = !col.clear(low, t), peek = col.clear(high, t);
      const d = Math.hypot(rx - threat.x, rz - threat.z);
      let s = (covered ? 3 : 0) + (peek ? 1.5 : 0) - Math.abs(d - pref) * 0.08 - r * 0.05;
      if (flankAng) { const ang = Math.atan2(rx - threat.x, rz - threat.z); let da = ang - (tdir + flankAng); da = Math.atan2(Math.sin(da), Math.cos(da)); s -= Math.abs(da) * 1.2; }
      if (opts.away) s += (d - Math.hypot(from.x - threat.x, from.z - threat.z)) * 0.2;
      if (s > bs) { bs = s; best = new THREE.Vector3(rx, g.y, rz); best.covered = covered; best.peek = peek; }
    }
    return best;
  }
  // ---------- grenades & smoke
  throwGrenade(from, target, kind = 'frag', by = null) {
    const d = target.clone().sub(from); const flat = Math.hypot(d.x, d.z); const T = Math.max(0.8, flat / 14);
    const v = new THREE.Vector3(d.x / T, (d.y + 0.5 * 9.8 * T * T) / T, d.z / T);
    const M = this.grenadeMesh(kind); M.position.copy(from); this.game.scene.add(M);
    this.grenades.push({ kind, pos: from.clone(), v, t: 0, fuse: kind === 'frag' ? 2.6 : 1.4, mesh: M, by });
    this.game.net?.event('gren', [kind === 'frag' ? 0 : 1, from.x, from.y, from.z, v.x, v.y, v.z]);
  }
  grenadeMesh(kind) { const m = new THREE.Mesh(kind === 'frag' ? new THREE.SphereGeometry(0.045, 10, 8) : new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10), new THREE.MeshStandardMaterial({ color: kind === 'frag' ? 0x3a4a2a : 0x8a8a8a, roughness: 0.6, metalness: 0.3 })); m.castShadow = true; return m; }
  smokeBlocks(a, b) { // segment vs smoke spheres
    for (const s of this.smokes) { const ab = _a.copy(b).sub(a); const L = ab.length(); ab.divideScalar(L); const t = THREE.MathUtils.clamp(_b.copy(s.pos).sub(a).dot(ab), 0, L); const p = _c.copy(a).addScaledVector(ab, t); if (p.distanceTo(s.pos) < s.r) return true; }
    return false;
  }
  update(dt) {
    const G = this.game, col = G.world?.col; if (!col) return;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.t += dt; g.v.y -= 9.8 * dt;
      const step = g.v.clone().multiplyScalar(dt); const L = step.length();
      const h = L > 0 ? col.ray(g.pos, step.clone().divideScalar(L), L + 0.05) : null;
      if (h) { g.pos.copy(h.point).addScaledVector(h.normal, 0.05); const n = h.normal; g.v.addScaledVector(n, -1.6 * g.v.dot(n)).multiplyScalar(0.45); if (g.v.length() > 2) G.audio?.click(400, 0.05, 0.03); }
      else g.pos.add(step);
      g.mesh.position.copy(g.pos); g.mesh.rotation.x += dt * 8;
      if (g.t >= g.fuse) {
        G.scene.remove(g.mesh); this.grenades.splice(i, 1);
        if (g.kind === 'frag') G.explode(g.pos, 7, 95, g.by);
        else { this.smokes.push({ pos: g.pos.clone().setY(g.pos.y + 1.5), r: 0.5, t: 0 }); }
      }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i]; s.t += dt; s.r = Math.min(6.5, 0.5 + s.t * 2.4);
      if (Math.random() < dt * 30 && s.t < 13) G.fx.norm.emit({ p: s.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * s.r, (Math.random() - 0.6) * s.r * 0.6, (Math.random() - 0.5) * s.r)), v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.15, (Math.random() - 0.5) * 0.6), life: 4, s0: 2.5, s1: 5.5, c: new THREE.Color(0xc8c8c0), a0: 0.55, a1: 0, drag: 0.4 });
      if (s.t > 16) this.smokes.splice(i, 1);
    }
  }
  clear() { for (const g of this.grenades) this.game.scene.remove(g.mesh); this.grenades = []; this.smokes = []; this.squads = []; }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
