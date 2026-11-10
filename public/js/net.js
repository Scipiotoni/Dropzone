// Multiplayer. Transport: the claude.ai artifact `room` capability when the game runs as a published link, else a
// WebSocket relay (server.js /ws) when self-hosted, else offline. Everything travels in per-player presence objects
// (absolute state + a ring of recent events with sequence numbers), so it works for every viewer.
// Session model: everyone dropping into the hotzone joins a shared raid room. The earliest member is the host: it owns
// the session seed (loot + spawns), simulates all hostiles and publishes compact snapshots; others run them as
// puppets, forward their hits to the host, and hand off automatically if the host leaves.
import * as THREE from 'three';
import { Operator } from './character.js';
import { buildGun } from './guns.js';
import { WeaponAnimator } from './anim.js';
import { WEAPONS } from './items.js';
import { makeHeli } from './heli.js';

const NAME_KEY = 'dropzone.callsign';
const COLORS = ['#e8a832', '#4ad6f0', '#6fbf5a', '#e0503a', '#b06ae0', '#f0e060', '#ff8aa0', '#9ab0ff'];
const ADJ = ['Iron', 'Ghost', 'Rust', 'Viper', 'Ash', 'Nomad', 'Echo', 'Talon', 'Rook', 'Cobalt', 'Wolf', 'Static'];

// ---------------- transports with one interface: join(name) -> {presence, peers, onPeers, leave, connected}
class WSTransport {
  constructor(url) { this.url = url; this.rooms = new Map(); this.me = null; }
  connect() {
    return new Promise((res, rej) => {
      let done = false; const ws = this.ws = new WebSocket(this.url);
      const to = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch (e) { /* ignore */ } rej(new Error('timeout')); } }, 3000);
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'hello') { this.me = m.peer; if (!done) { done = true; clearTimeout(to); res(this); } }
        if (m.t === 'peers') { const r = this.rooms.get(m.room); if (r) r._set(m.peers.map((p) => ({ ...p, isMe: p.peer === this.me, sameTab: p.peer === this.me }))); } };
      ws.onerror = () => { if (!done) { done = true; clearTimeout(to); rej(new Error('ws')); } };
      ws.onclose = () => { for (const r of this.rooms.values()) r._set([]); };
    });
  }
  send(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }
  async join(name) {
    if (this.rooms.has(name)) return this.rooms.get(name);
    const self = this; let peers = Object.freeze([]); const subs = new Set(); let mine = {};
    const room = { name, presence(patch) { for (const [k, v] of Object.entries(patch)) { if (v === null) delete mine[k]; else mine[k] = v; } self.send({ t: 'presence', room: name, p: mine }); return Promise.resolve(); },
      peers: () => peers, onPeers(fn) { subs.add(fn); setTimeout(() => fn({ peers, joined: peers, left: [], updated: [] }), 0); return () => subs.delete(fn); },
      connected: () => self.ws?.readyState === 1, leave() { self.send({ t: 'leave', room: name }); self.rooms.delete(name); return Promise.resolve(); },
      _set(list) { peers = Object.freeze(list.map((p) => Object.freeze({ peer: p.peer, isMe: p.isMe, sameTab: p.sameTab, presence: Object.freeze(p.presence || {}), kind: 'viewer', guest: false, by: null, updatedAt: Date.now() }))); for (const fn of subs) fn({ peers, joined: [], left: [], updated: peers }); } };
    this.rooms.set(name, room); this.send({ t: 'join', room: name }); return room;
  }
}
class RoomTransport {
  constructor(room) { this.room = room; this.me = null; }
  async join(name) { if (name === 'lobby') return this.room; return this.room.join(name); }
}

export class Net {
  constructor(game) {
    this.game = game; this.mode = 'offline'; this.me = 'local'; this.seq = 0; this.events = []; this.seen = new Map(); this.remotes = new Map();
    this.sendT = 0; this.isHost = true; this.raidRoom = null; this.lobby = null; this.lobbyPeers = []; this._dirty = true; this.joinedAt = Date.now();
    let n = null; try { n = localStorage.getItem(NAME_KEY); } catch (e) { /* storage blocked */ }
    this.name = n || `${ADJ[Math.floor(Math.random() * ADJ.length)]}-${Math.floor(Math.random() * 90 + 10)}`;
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
  }
  setName(n) { this.name = String(n).replace(/[^\w\- ]/g, '').slice(0, 16) || this.name; try { localStorage.setItem(NAME_KEY, this.name); } catch (e) { /* storage blocked */ } this.pushLobby(); }
  async init() {
    // 1) published artifact: the platform's live room
    try {
      if (window.claude?.use) {
        const room = await Promise.race([window.claude.use('room'), new Promise((r) => setTimeout(() => r(null), 6000))]);
        if (room) { this.t = new RoomTransport(room); this.mode = 'room'; }
      }
    } catch (e) { /* not in an artifact */ }
    // 2) self-hosted server relay
    if (!this.t && /^https?:/.test(location.protocol)) {
      try { const ws = new WSTransport((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); await ws.connect(); this.t = ws; this.mode = 'ws'; this.me = ws.me; } catch (e) { /* no relay */ }
    }
    if (!this.t) { this.mode = 'offline'; return; }
    this.lobby = await this.t.join('lobby');
    this.lobby.onPeers((c) => { this.lobbyPeers = c.peers; const mine = c.peers.find((p) => p.isMe && p.sameTab); if (mine) this.me = mine.peer; });
    this.pushLobby();
  }
  get online() { return this.mode !== 'offline'; }
  pushLobby() { if (!this.lobby) return; this.lobby.presence({ n: this.name, c: this.color, m: this.game.mode, r: this.raidRoom?.name || null, j: this.joinedAt }).catch(() => {}); }
  playersOnline() { return this.lobbyPeers.filter((p) => p.kind !== 'agent' && p.presence?.n).map((p) => ({ name: p.presence.n, color: p.presence.c, mode: p.presence.m, me: p.isMe && p.sameTab })); }
  dirty() { this._dirty = true; }
  event(type, data) { if (!this.raidRoom) return; this.events.push([++this.seq, type, data]); if (this.events.length > 14) this.events.shift(); }
  // ---------------- raid session
  async joinRaid() {
    if (!this.t) { this.isHost = true; return { seed: (Math.random() * 1e9) | 0, start: Date.now() }; }
    // pick a raid room that is not full
    const counts = {}; for (const p of this.lobbyPeers) if (p.presence?.r && !(p.isMe && p.sameTab)) counts[p.presence.r] = (counts[p.presence.r] || 0) + 1;
    let k = 1; while ((counts['dz-raid-' + k] || 0) >= 8) k++;
    try { this.raidRoom = await this.t.join('dz-raid-' + k); } catch (e) { this.raidRoom = null; this.isHost = true; return { seed: (Math.random() * 1e9) | 0, start: Date.now() }; }
    this.raidJoinedAt = Date.now(); this.events = []; this.seen.clear();
    this.raidRoom.onPeers(() => {});
    await new Promise((r) => setTimeout(r, 1500)); // let existing members answer
    const others = this.raidRoom.peers().filter((p) => !(p.isMe && p.sameTab) && p.presence?.sd);
    const host = others.sort((a, b) => (a.presence.j || 0) - (b.presence.j || 0))[0];
    this.session = host ? { seed: host.presence.sd, start: host.presence.st } : { seed: (Math.random() * 1e9) | 0, start: Date.now() };
    this.pushLobby();
    return this.session;
  }
  leaveRaid() { this.raidRoom?.leave().catch(() => {}); this.raidRoom = null; for (const r of this.remotes.values()) r.dispose(); this.remotes.clear(); this.isHost = true; this.pushLobby(); }
  electHost() {
    if (!this.raidRoom) { this.isHost = true; return; }
    const members = this.raidRoom.peers().filter((p) => p.presence?.sd !== undefined || (p.isMe && p.sameTab));
    let best = null; for (const p of members) { const j = p.isMe && p.sameTab ? this.raidJoinedAt : p.presence.j; if (!best || j < best.j || (j === best.j && p.peer < best.peer)) best = { peer: p.peer, j, me: p.isMe && p.sameTab }; }
    const was = this.isHost; this.isHost = !best || best.me; this.hostPeer = best?.peer;
    if (this.isHost !== was) this.game.onHostChange(this.isHost);
  }
  // ---------------- per-frame sync
  update(dt) {
    if (!this.raidRoom) { this.lobbyT = (this.lobbyT || 0) - dt; if (this.lobbyT <= 0) { this.lobbyT = 2; this.pushLobby(); } return; }
    const G = this.game; this.electHost();
    // incoming
    for (const p of this.raidRoom.peers()) {
      if (p.isMe && p.sameTab) continue; const pr = p.presence; if (!pr || !pr.p) continue;
      let R = this.remotes.get(p.peer); if (!R) { R = new RemotePlayer(G, p.peer); this.remotes.set(p.peer, R); }
      R.apply(pr);
      if (pr.ds) G.ai.fromSummary(p.peer, pr.ds);
      const last = this.seen.get(p.peer) || 0; let max = last;
      for (const [seq, type, data] of pr.ev || []) if (seq > last) { max = Math.max(max, seq); try { G.onNetEvent(type, data, p.peer, R); } catch (e) { console.warn(e); } }
      this.seen.set(p.peer, max);
      if (p.peer === this.hostPeer && !this.isHost) { if (pr.en) G.applyEnemySnapshot(pr.en); if (pr.lz) G.applyLootState(pr.lz); }
      if (pr.vd) G.applyVehicleNet(pr.vd, p.peer, true); if (pr.vp) for (const v of pr.vp) G.applyVehicleNet(v, p.peer, false);
    }
    for (const [id, R] of this.remotes) if (!this.raidRoom.peers().some((p) => p.peer === id)) { R.dispose(); this.remotes.delete(id); }
    for (const R of this.remotes.values()) R.update(dt);
    // outgoing (presence is coalesced by the platform; ~15 Hz is plenty)
    this.sendT -= dt; if (this.sendT > 0) return; this.sendT = 1 / 15;
    const P = G.player; const w = P.weapon;
    const flags = (P.crouch ? 1 : 0) | (P.aimT > 0.4 ? 2 : 0) | (P.sprinting ? 4 : 0) | (P.dead ? 8 : 0) | (!P.onGround ? 16 : 0) | (P.vehicle ? 32 : 0) | (G.heliRide ? 64 : 0) | (P.reloadT >= 0 ? 128 : 0);
    const patch = { n: this.name, c: this.color, j: this.raidJoinedAt, sd: this.session?.seed, st: this.session?.start,
      p: [Math.round(P.pos.x * 100), Math.round(P.pos.y * 100), Math.round(P.pos.z * 100), Math.round(P.yaw * 100), Math.round(P.pitch * 100), flags, Math.round(Math.hypot(P.vel.x, P.vel.z) * 10), Math.round(P.hp), P.vehicle ? P.vehicle.id : 0, P.seat ?? -1],
      w: w ? [w.id, w.mods.optic, w.mods.muzzle, w.mods.underbarrel, w.mods.magazine, w.mods.stock, w.mods.tactical] : null,
      ev: this.events, ds: G.ai.summary(),
      h: G.heliRide ? [Math.round(G.heliRide.pos.x * 10), Math.round(G.heliRide.pos.y * 10), Math.round(G.heliRide.pos.z * 10), +G.heliRide.yaw.toFixed(2), +G.heliRide.pitch.toFixed(2), +G.heliRide.roll.toFixed(2)] : null,
      vd: P.vehicle && P.seat === 0 ? P.vehicle.netState() : null, vp: G.parkedStates(),
      en: this.isHost ? G.enemySnapshot() : null, lz: this.isHost ? G.lootState() : null };
    this.raidRoom.presence(patch).catch((e) => { if (e?.code === 'invalid_argument') { this.events = this.events.slice(-4); } });
  }
}

// ---------------- other players
export class RemotePlayer {
  constructor(game, peer) {
    this.game = game; this.peer = peer; this.type = 'player'; this.name = 'Operator'; this.alive = true; this.dead = false;
    this.op = new Operator('player'); game.scene.add(this.op.root); this.pos = new THREE.Vector3(); this.netPos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.netYaw = 0;
    this.anim = new WeaponAnimator(); this.gun = null; this.wkey = ''; this.crouch = false; this.hidden = false; this.first = true;
    this.hitboxes = [{ obj: this.op.head, r: 0.15, mult: 2.4, tag: 'head', off: new THREE.Vector3(0, 0.12, 0) }, { obj: this.op.chest, r: 0.27, mult: 1, tag: 'torso', off: new THREE.Vector3(0, 0.1, 0) }, { obj: this.op.hips, r: 0.24, mult: 0.85, tag: 'legs', off: new THREE.Vector3(0, -0.25, 0) }];
    this.tag = makeTag(); this.op.root.add(this.tag); this.tag.position.y = 2.25;
    this.reloadT = -1; this.hp = 100;
  }
  apply(pr) {
    const p = pr.p; this.netPos.set(p[0] / 100, p[1] / 100, p[2] / 100); this.netYaw = p[3] / 100; this.pitch = p[4] / 100; this.flags = p[5]; this.speed = p[6] / 10; this.hp = p[7]; this.vid = p[8]; this.seatIdx = p[9];
    this.crouch = !!(this.flags & 1); this.dead = !!(this.flags & 8); this.alive = !this.dead; this.hidden = !!(this.flags & 64); this.inVehicle = !!(this.flags & 32); this.reloadT = this.flags & 128 ? 0.5 : -1;
    if (pr.n && pr.n !== this.name) { this.name = pr.n; drawTag(this.tag, pr.n, pr.c); }
    const wk = JSON.stringify(pr.w); if (wk !== this.wkey) { this.wkey = wk; if (this.gun) this.op.attachGun(null); this.gun = null; if (pr.w && WEAPONS[pr.w[0]]) { const [id, optic, muzzle, underbarrel, magazine, stock, tactical] = pr.w; this.gun = buildGun(id, { optic, muzzle, underbarrel, magazine, stock, tactical }); this.op.attachGun(this.gun); this.ws = WEAPONS[id]; } }
    if (pr.h) { if (!this.heli) { this.heli = makeHeli(); this.game.scene.add(this.heli); } const h = pr.h; this.heli.position.set(h[0] / 10, h[1] / 10, h[2] / 10); this.heli.rotation.set(0, h[3], 0, 'YXZ'); this.heli.userData.body.rotation.set(h[4], 0, h[5]); }
    else if (this.heli) { this.game.scene.remove(this.heli); this.heli = null; }
    if (this.first) { this.pos.copy(this.netPos); this.yaw = this.netYaw; this.first = false; }
  }
  update(dt) {
    const k = Math.min(1, dt * 12); const before = this.pos.clone(); this.pos.lerp(this.netPos, k); this.vel.copy(this.pos).sub(before).divideScalar(Math.max(dt, 1e-3));
    let dy = this.netYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * k;
    if (this.heli) { this.heli.userData.rotor.rotation.y += dt * 28; this.heli.userData.tailR.rotation.x += dt * 70; }
    this.op.root.visible = !this.hidden || this.heli; this.op.root.position.copy(this.pos); this.op.root.rotation.y = this.yaw;
    if (this.reloadT >= 0 && !this.anim.busy && this.ws) this.anim.play(this.ws.anim === 'bolt' ? 'boltLoad' : this.ws.anim === 'pump' ? 'pumpShell' : this.ws.anim, this.ws.reload);
    const pose = this.anim.update(dt); if (this.gun) this.anim.apply(this.gun);
    this.op.update(dt, { speed: this.inVehicle || this.hidden ? 0 : this.speed, crouch: this.crouch, aim: !!(this.flags & 2), sprint: !!(this.flags & 4), air: !!(this.flags & 16), pitch: this.pitch, dead: this.dead, seated: this.inVehicle || this.hidden,
      gunPose: pose.gun, lh: this.gun ? this.anim.handTarget(this.gun, pose.lh, 'l', _lh) : null, rh: this.gun && pose.rh ? this.anim.handTarget(this.gun, pose.rh, 'r', _rh) : null, flinch: this.flinch });
    this.flinch = false;
    this.tag.visible = !this.dead && this.pos.distanceTo(this.game.engine.camera.position) < 120;
  }
  hitTest(o, d, maxT) {
    if (this.dead || this.hidden) return null; let best = null;
    for (const h of this.hitboxes) { const c = h.obj.getWorldPosition(_a); if (h.off) c.add(h.off); const oc = _b.copy(o).sub(c); const b = oc.dot(d); const cc = oc.lengthSq() - h.r * h.r; const disc = b * b - cc; if (disc < 0) continue; const t = -b - Math.sqrt(disc); if (t < 0 || t > maxT) continue; if (!best || t < best.t) best = { t, mult: h.mult, tag: h.tag, enemy: this }; }
    return best;
  }
  // a local shot (or a host-simulated hostile) hit this remote player: tell their client
  damage(n, hit, from, byMe) { if (this.dead) return; this.flinch = true; this.game.fx.impact(hit?.point || this.pos.clone().setY(this.pos.y + 1.2), null, 'flesh'); const f = from || this.pos; this.game.net.event('pd', [this.peer, Math.round(n), Math.round(f.x), Math.round(f.y), Math.round(f.z), byMe ? 1 : 0]); }
  get state() { return 'idle'; }
  dispose() { this.game.scene.remove(this.op.root); if (this.heli) this.game.scene.remove(this.heli); }
}
function makeTag() { const C = document.createElement('canvas'); C.width = 256; C.height = 64; const t = new THREE.CanvasTexture(C); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true })); s.scale.set(1.6, 0.4, 1); s.userData.C = C; return s; }
function drawTag(s, name, color = '#e8a832') { const C = s.userData.C, x = C.getContext('2d'); x.clearRect(0, 0, 256, 64); x.font = '600 30px Rajdhani, sans-serif'; x.textAlign = 'center'; x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(28, 12, 200, 40); x.fillStyle = color; x.fillText(name, 128, 42); s.material.map.needsUpdate = true; }
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _lh = new THREE.Vector3(), _rh = new THREE.Vector3();
