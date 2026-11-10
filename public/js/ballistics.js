// Projectile ballistics: every player shot is a simulated bullet with the cartridge's real muzzle velocity, gravity
// drop, aerodynamic drag and time of flight. Bullets penetrate thin wood / sheet metal depending on calibre, lose
// energy (and damage) with distance, and draw their tracer along the true flight path.
import * as THREE from 'three';

// muzzle velocity m/s, drag (1/s), penetration (m of wood-equivalent), tracer colour
export const CARTRIDGE = {
  a9: { v: 370, drag: 0.32, pen: 0.12 }, a45: { v: 260, drag: 0.3, pen: 0.1 }, a50: { v: 470, drag: 0.28, pen: 0.2 },
  a57: { v: 715, drag: 0.22, pen: 0.22 }, a46: { v: 735, drag: 0.22, pen: 0.24 },
  a556: { v: 900, drag: 0.15, pen: 0.35 }, a545: { v: 880, drag: 0.15, pen: 0.33 }, a76239: { v: 715, drag: 0.18, pen: 0.4 },
  a762: { v: 830, drag: 0.1, pen: 0.55 }, a762r: { v: 830, drag: 0.1, pen: 0.55 }, a12: { v: 400, drag: 1.1, pen: 0.05 }, a50bmg: { v: 860, drag: 0.05, pen: 1.6 },
};
const G = 9.81;
export class Ballistics {
  constructor(game) { this.game = game; this.list = []; }
  // angle (rad) the barrel must point up so the trajectory crosses the line of sight at `zero` metres
  static zeroAngle(ammo, zero) { const c = CARTRIDGE[ammo] || CARTRIDGE.a556; const t = zero / (c.v * (1 - c.drag * zero / c.v * 0.5)); return Math.atan2(0.5 * G * t * t, zero); }
  fire(o, dir, opts) {
    const c = CARTRIDGE[opts.ammo] || CARTRIDGE.a556;
    this.list.push({ pos: o.clone(), vel: dir.clone().multiplyScalar(c.v * (opts.vMul || 1)), v0: c.v, drag: c.drag, pen: c.pen, dmg: opts.damage, mine: opts.mine !== false, visual: !!opts.visual, t: 0, color: opts.color || 0xffd080, first: true, muzzle: opts.muzzle?.clone(), skip: opts.skip || 0, onHit: opts.onHit, mult: 1, travelled: 0, range: opts.range || 100 });
  }
  update(dt) {
    const G0 = this.game, col = G0.world?.col; if (!col) return;
    const targets = G0.hitTargets ? G0.hitTargets() : [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]; let rem = dt; let dead = false;
      while (rem > 0 && !dead) {
        const h = Math.min(rem, 1 / 120); rem -= h; b.t += h;
        b.vel.y -= G * h; b.vel.multiplyScalar(Math.exp(-b.drag * h));
        const step = b.vel.clone().multiplyScalar(h); const L = step.length(); if (L < 1e-4) { dead = true; break; }
        const d = step.clone().divideScalar(L);
        let best = L, kind = null, hitObj = null;
        const wh = col.ray(b.pos, d, L, { skipNonSolid: true }); if (wh) { best = wh.t; kind = 'world'; }
        if (!b.visual) {
          for (const e of targets) { if (!e.alive || e.pos.distanceToSquared(b.pos) > (L + 6) ** 2) continue; const eh = e.hitTest(b.pos, d, best); if (eh && eh.t < best) { best = eh.t; kind = 'enemy'; hitObj = eh; } }
          const vh = G0.vehicleRayHit?.(b.pos, d, best); if (vh && vh.t < best) { best = vh.t; kind = 'vehicle'; hitObj = vh; }
        }
        const end = b.pos.clone().addScaledVector(d, best);
        // draw this flight segment (starting at the muzzle on the first frame so the tracer leaves the barrel)
        G0.fx.streak(b.first && b.muzzle ? b.muzzle : b.pos, end, b.color, b.t < 0.02 ? 0.7 : 1); b.first = false;
        b.travelled += best;
        const energy = Math.max(0.35, (b.vel.length() / b.v0) ** 2) * b.mult;
        if (kind === 'enemy') { b.onHit?.(hitObj, end, b.dmg * energy, b.travelled); dead = true; }
        else if (kind === 'vehicle') { if (b.mine) hitObj.veh.damage(b.dmg * energy * 0.5, hitObj.point); G0.fx.impact(end, null, 'metal'); dead = true; }
        else if (kind === 'world') {
          G0.fx.impact(end, wh.normal, wh.mat); if (Math.random() < 0.4) G0.audio?.hit(end, wh.mat);
          if (b.mine) G0.noise(end, 10, null, true);
          // penetration: thin wood / metal / car bodies let the bullet through with reduced energy
          const c = wh.c; const thick = c ? Math.min(c.hw, c.hd, (c.y1 - c.y0) / 2) * 2 : 99;
          const resist = wh.mat === 'wood' ? 1 : wh.mat === 'metal' ? 2.5 : wh.mat === 'dirt' ? 6 : 8;
          if (c && thick * resist < b.pen) { b.mult *= 1 - thick * resist / b.pen * 0.8; b.vel.multiplyScalar(0.8); b.pos.copy(end).addScaledVector(d, thick + 0.05); G0.fx.impact(b.pos.clone(), d.clone(), wh.mat); continue; }
          dead = true;
        } else b.pos.copy(end);
        if (b.t > 4 || b.pos.y < -60) dead = true;
      }
      if (dead) this.list.splice(i, 1);
    }
  }
  clear() { this.list.length = 0; }
}
