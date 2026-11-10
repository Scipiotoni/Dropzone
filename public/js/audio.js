// Synthesised positional audio (no assets): layered gunshots with distance filtering, impacts, footsteps,
// machine hums, explosions, UI blips, wind ambience and the extraction alarm.
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.listener = { x: 0, y: 0, z: 0, yaw: 0 }; this.vol = 0.7; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = this.vol;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(C.destination);
    // shared noise buffer
    const len = C.sampleRate * 2; const b = C.createBuffer(1, len, C.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = b;
    // reverb impulse (outdoor slap / tail)
    const ir = C.createBuffer(2, C.sampleRate * 1.6, C.sampleRate); for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3.2) * (i < 1200 ? 0.2 : 1); }
    this.verb = C.createConvolver(); this.verb.buffer = ir; this.verbGain = C.createGain(); this.verbGain.gain.value = 0.35; this.verb.connect(this.verbGain).connect(this.master);
    this.ambience();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  // pan/attenuate by world position
  spatial(pos, ref = 8, maxD = 400) {
    const C = this.ctx; const g = C.createGain(); const p = C.createStereoPanner(); const f = C.createBiquadFilter(); f.type = 'lowpass';
    let gain = 1, pan = 0, cut = 18000;
    if (pos) { const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z; const d = Math.hypot(dx, dy, dz);
      gain = Math.min(1, ref / Math.max(ref, d)) * (d > maxD ? 0 : 1); cut = 18000 * Math.exp(-d / 140) + 600;
      const ang = Math.atan2(dx, -dz) + this.listener.yaw; pan = Math.max(-0.9, Math.min(0.9, Math.sin(ang) * Math.min(1, d / 4))); }
    g.gain.value = gain; p.pan.value = pan; f.frequency.value = cut;
    f.connect(p).connect(g); g.connect(this.master); const send = this.ctx.createGain(); send.gain.value = pos ? Math.min(0.6, 0.15 + (1 - gain) * 0.5) : 0.18; g.connect(send).connect(this.verb);
    return f;
  }
  noiseSrc(dur) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loopStart = Math.random(); s.start(this.ctx.currentTime, Math.random() * 1.5, dur + 0.1); return s; }
  env(node, t0, a, peak, decay) { node.gain.setValueAtTime(0.0001, t0); node.gain.exponentialRampToValueAtTime(peak, t0 + a); node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + decay); }
  gunshot(kind, pos, loud = 1) {
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime, out = this.spatial(pos, 10 * Math.max(0.3, loud));
    const P = { pistol: [1400, 0.16, 90, 0.9], smg: [1700, 0.12, 110, 0.8], rifle: [1100, 0.22, 70, 1.0], heavy: [800, 0.3, 55, 1.15], shotgun: [700, 0.35, 50, 1.2], drone: [2200, 0.08, 160, 0.5], cannon: [500, 0.5, 40, 1.4], laser: [3000, 0.12, 300, 0.4] }[kind] || [1200, 0.2, 80, 1];
    const [fc, dec, thump, vol] = P; const supp = loud < 0.5;
    // crack (filtered noise)
    const n = this.noiseSrc(dec + 0.2); const bp = C.createBiquadFilter(); bp.type = supp ? 'lowpass' : 'bandpass'; bp.frequency.value = supp ? 900 : fc; bp.Q.value = 0.7;
    const g = C.createGain(); this.env(g, t, 0.002, vol * (supp ? 0.35 : 1), dec); n.connect(bp).connect(g).connect(out);
    // body thump
    const o = C.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(thump * 2.2, t); o.frequency.exponentialRampToValueAtTime(thump * 0.6, t + 0.12);
    const og = C.createGain(); this.env(og, t, 0.002, vol * (supp ? 0.5 : 0.9), 0.14); o.connect(og).connect(out); o.start(t); o.stop(t + 0.3);
    if (kind === 'laser') { const o2 = C.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(1800, t); o2.frequency.exponentialRampToValueAtTime(300, t + 0.15); const g2 = C.createGain(); this.env(g2, t, 0.003, 0.25, 0.15); o2.connect(g2).connect(out); o2.start(t); o2.stop(t + 0.25); }
    // mechanical click for suppressed fire
    if (supp) { const c = this.noiseSrc(0.03); const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; const cg = C.createGain(); this.env(cg, t, 0.001, 0.3, 0.03); c.connect(hp).connect(cg).connect(out); }
  }
  hit(pos, kind = 'metal') {
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime, out = this.spatial(pos, 4);
    if (kind === 'machine' || kind === 'metal') { const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = 1800 + Math.random() * 1500; const g = C.createGain(); this.env(g, t, 0.001, 0.25, 0.12); o.connect(g).connect(out); o.start(t); o.stop(t + 0.2); }
    const n = this.noiseSrc(0.08); const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'flesh' ? 400 : 2500; const g = C.createGain(); this.env(g, t, 0.001, 0.3, 0.07); n.connect(f).connect(g).connect(out);
  }
  hitmarker() { if (!this.ctx) return; const C = this.ctx, t = C.currentTime; const o = C.createOscillator(); o.type = 'square'; o.frequency.value = 2400; const g = C.createGain(); this.env(g, t, 0.001, 0.05, 0.04); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.06); }
  explosion(pos, big = 1) {
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime, out = this.spatial(pos, 30 * big, 900);
    const n = this.noiseSrc(2.5); const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.8);
    const g = C.createGain(); this.env(g, t, 0.005, 1.4 * big, 2.0); n.connect(lp).connect(g).connect(out);
    const o = C.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(25, t + 0.8); const og = C.createGain(); this.env(og, t, 0.005, 1.2 * big, 0.9); o.connect(og).connect(out); o.start(t); o.stop(t + 1.2);
  }
  step(pos, surface = 'dirt', loud = 1) {
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime, out = this.spatial(pos, 3);
    const n = this.noiseSrc(0.12); const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = surface === 'metal' ? 1800 : surface === 'concrete' ? 900 : 500; f.Q.value = 1.2;
    const g = C.createGain(); this.env(g, t, 0.004, 0.12 * loud, 0.09); n.connect(f).connect(g).connect(out);
    if (surface === 'metal') { const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = 300 + Math.random() * 80; const g2 = C.createGain(); this.env(g2, t, 0.002, 0.05 * loud, 0.1); o.connect(g2).connect(out); o.start(t); o.stop(t + 0.15); }
  }
  click(freq = 900, vol = 0.12, dur = 0.05, type = 'square') { if (!this.ctx) return; const C = this.ctx, t = C.currentTime; const o = C.createOscillator(); o.type = type; o.frequency.value = freq; const g = C.createGain(); this.env(g, t, 0.002, vol, dur); o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05); }
  mech(pos, kind = 'reload') { // magazine / bolt sounds
    if (!this.ctx) return; const C = this.ctx, t = C.currentTime, out = this.spatial(pos, 2);
    const seq = kind === 'pump' ? [[0, 700], [0.18, 1100]] : kind === 'empty' ? [[0, 2600]] : [[0, 900], [0.25, 600], [0.55, 1500]];
    for (const [dt, f] of seq) { const n = this.noiseSrc(0.05); const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 3; const g = C.createGain(); this.env(g, t + dt, 0.001, 0.35, 0.05); n.connect(bp).connect(g).connect(out); }
  }
  // continuous loop (returns handle with set(pos, gain) / stop())
  loop(kind) {
    if (!this.ctx) return null; const C = this.ctx;
    const out = C.createGain(); out.gain.value = 0; const pan = C.createStereoPanner(); out.connect(pan).connect(this.master);
    const nodes = [];
    if (kind === 'drone') { for (const f of [180, 183.5, 362]) { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; o.connect(lp).connect(out); o.start(); nodes.push(o); } }
    else if (kind === 'servo') { const o = C.createOscillator(); o.type = 'square'; o.frequency.value = 55; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; o.connect(lp).connect(out); o.start(); nodes.push(o); }
    else if (kind === 'engine') { const n = C.createBufferSource(); n.buffer = this.noise; n.loop = true; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; n.connect(lp).connect(out); n.start(); nodes.push(n); const o = C.createOscillator(); o.frequency.value = 42; o.type = 'sawtooth'; const g = C.createGain(); g.gain.value = 0.3; o.connect(g).connect(out); o.start(); nodes.push(o); }
    else if (kind === 'alarm') { const o = C.createOscillator(); o.type = 'square'; const lfo = C.createOscillator(); lfo.frequency.value = 1.6; const lg = C.createGain(); lg.gain.value = 220; lfo.connect(lg).connect(o.frequency); o.frequency.value = 660; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; o.connect(lp).connect(out); o.start(); lfo.start(); nodes.push(o, lfo); }
    else if (kind === 'fire') { const n = C.createBufferSource(); n.buffer = this.noise; n.loop = true; const bp = C.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 700; n.connect(bp).connect(out); n.start(); nodes.push(n); }
    const self = this;
    return {
      set(pos, vol = 1) { if (!pos) { out.gain.value = vol; return; } const dx = pos.x - self.listener.x, dz = pos.z - self.listener.z, d = Math.hypot(dx, pos.y - self.listener.y, dz); out.gain.setTargetAtTime(vol * Math.min(1, 8 / Math.max(8, d)) * (d > 160 ? 0 : 1), C.currentTime, 0.05); pan.pan.value = Math.max(-0.9, Math.min(0.9, Math.sin(Math.atan2(dx, -dz) + self.listener.yaw) * Math.min(1, d / 4))); },
      stop() { out.gain.setTargetAtTime(0, C.currentTime, 0.05); setTimeout(() => { for (const n of nodes) try { n.stop(); } catch (e) { /* already stopped */ } out.disconnect(); }, 300); },
    };
  }
  ambience() { // wind bed
    const C = this.ctx; const n = C.createBufferSource(); n.buffer = this.noise; n.loop = true; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; const g = C.createGain(); g.gain.value = 0.05;
    const lfo = C.createOscillator(); lfo.frequency.value = 0.08; const lg = C.createGain(); lg.gain.value = 0.03; lfo.connect(lg).connect(g.gain); lfo.start();
    n.connect(lp).connect(g).connect(this.master); n.start();
  }
}
export const audio = new Audio();
