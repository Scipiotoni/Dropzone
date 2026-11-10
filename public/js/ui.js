// HUD and all menus: main menu, inventory/stash, looting, crafting, gunsmith (with live 3D preview), drop map, raid map,
// build bar, pause and raid results.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ITEMS, WEAPONS, MODS, RECIPES, PIECES, PIECE_ORDER, RARITY, weaponStats, modFits, DEFAULT_MODS, entryKg, encumbrance } from './items.js';
import { entryName, entryRarity, entryIcon } from './loot.js';
import { buildGun } from './guns.js';
import { DROP_ZONES, EXTRACTS } from './hotzone.js';
import { audio } from './audio.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAT_LABEL = { damage: 'Damage', rpm: 'Fire rate', recoil: 'Recoil', spread: 'Hip spread', ads: 'ADS time', reload: 'Reload', range: 'Range', mag: 'Magazine' };

export class UI {
  constructor(game) {
    this.g = game; this.open = null; this.tipEl = document.createElement('div'); this.tipEl.className = 'tip hidden'; document.body.appendChild(this.tipEl);
    addEventListener('mousemove', (e) => { this.tipEl.style.left = Math.min(innerWidth - 300, e.clientX + 16) + 'px'; this.tipEl.style.top = Math.min(innerHeight - 160, e.clientY + 16) + 'px'; });
    this.hurtT = 0; this.hmT = 0;
    this.buildCompass();
  }
  // ------------------------------------------------------------------ HUD
  show(on) { $('#hud').classList.toggle('hidden', !on); }
  toast(msg) { const d = document.createElement('div'); d.textContent = msg; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 2700); while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove(); }
  feed(msg, cls = '') { const d = document.createElement('div'); d.className = cls; d.textContent = msg; $('#feed').appendChild(d); setTimeout(() => d.remove(), 5000); while ($('#feed').children.length > 6) $('#feed').firstChild.remove(); }
  hitmarker(head, kill) { const h = $('#hitmarker'); h.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : ''); clearTimeout(this.hmTO); this.hmTO = setTimeout(() => (h.className = ''), kill ? 220 : 90); }
  hurt(from, n) {
    $('#hurt').style.opacity = Math.min(1, 0.35 + n / 30); clearTimeout(this.hurtTO); this.hurtTO = setTimeout(() => ($('#hurt').style.opacity = 0), 250);
    this.g.engine.grade.uniforms.hurt.value = Math.min(1, this.g.engine.grade.uniforms.hurt.value + n / 40);
    if (from) { const P = this.g.player; const b = Math.atan2(from.x - P.pos.x, -(from.z - P.pos.z)); const h = -P.yaw; const rel = b - h; const d = $('#hurtdir'); d.style.transform = `rotate(${rel}rad)`; d.style.opacity = 1; clearTimeout(this.hdTO); this.hdTO = setTimeout(() => (d.style.opacity = 0), 500); }
  }
  buildCompass() {
    const s = $('#compassStrip'); let h = '';
    const dirs = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let k = -1; k <= 1; k++) for (let d = 0; d < 360; d += 15) { const x = (d + k * 360) * 4; h += `<span class="${dirs[d] ? 'c' : ''}" style="left:${x}px">${dirs[d] || '·'}</span>`; }
    s.innerHTML = h + '<div id="cmarks"></div>';
  }
  update(dt) {
    const G = this.g, P = G.player; if (!P) return;
    const hp = P.hp / P.maxHp; $('#hpbar').style.transform = `scaleX(${hp})`; $('#hpbar').classList.toggle('low', hp < 0.3); $('#hpval').textContent = Math.ceil(P.hp);
    $('#arbar').style.transform = `scaleX(${P.maxArmor ? P.armor / P.maxArmor : 0})`; $('#arval').textContent = Math.ceil(P.armor);
    $('#stbar').style.transform = `scaleX(${P.stamina / 100})`;
    const heal = $('#heal'); if (P.healT >= 0) { heal.classList.remove('hidden'); $('#healbar').style.transform = `scaleX(${P.healT / ITEMS[P.healItem].time})`; $('#healtxt').textContent = `Using ${ITEMS[P.healItem].name}…`; } else heal.classList.add('hidden');
    const w = P.weapon;
    if (w) { $('#wname').textContent = WEAPONS[w.id].name + (w.stats.auto ? ' · AUTO' : ' · SEMI'); $('#mag').textContent = w.mag; $('#mag').classList.toggle('low', w.mag <= Math.ceil(w.stats.mag * 0.25)); $('#reserve').textContent = G.pack.count(w.stats.ammo); }
    else { $('#wname').textContent = 'Unarmed'; $('#mag').textContent = '–'; $('#reserve').textContent = '–'; }
    $('#wslots').innerHTML = P.weapons.map((x, i) => x ? `<div class="${i === P.slot ? 'on' : ''}">${i + 1} · ${WEAPONS[x.id].short}</div>` : '').join('');
    const E = P.enc; $('#packcap').innerHTML = `Backpack ${G.pack.used()}/${G.pack.slots} · <span style="color:${E.kg > 42 ? 'var(--red)' : E.kg > 30 ? 'var(--acc2)' : 'var(--dim)'}">${E.kg.toFixed(1)} kg ${E.band}</span>` + (P.reloadT >= 0 ? ' · RELOADING' : '');
    this.updateOnline();
    // crosshair spread
    const px = 6 + Math.tan(THREE.MathUtils.degToRad(P.spreadNow + (P.spreadBloom || 0))) * innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(G.engine.camera.fov / 2)));
    const ch = $('#crosshair'); for (const [k, x, y] of [['t', 0, -px - 8], ['b', 0, px], ['l', -px - 8, 0], ['r', px, 0]]) { const e = ch.querySelector('.' + k); e.style.transform = `translate(${x}px,${y}px)`; }
    ch.classList.toggle('ads', P.aimT > 0.6 && P.fpNow); ch.classList.toggle('hidden', G.mode === 'base' && G.build?.active === true ? false : false);
    $('#scope').classList.toggle('hidden', !(w?.stats.scope && P.aimT > 0.85 && !P.dead));
    // compass
    const head = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360; const cw = $('#compass').clientWidth;
    $('#compassStrip').style.transform = `translateX(${cw / 2 - (head + 360) * 4}px)`;
    let marks = ''; for (const m of G.compassMarks()) { const b = (Math.atan2(m.x - P.pos.x, -(m.z - P.pos.z)) * 180 / Math.PI + 360) % 360; for (const k of [0, 360, 720]) marks += `<span class="m" style="left:${(b + k) * 4}px;color:${m.color}">${m.icon}</span>`; }
    $('#cmarks').innerHTML = marks;
    // engine hurt fade
    const u = G.engine.grade.uniforms.hurt; u.value = Math.max(hp < 0.3 ? 0.35 : 0, u.value - dt * 0.8);
  }
  prompt(text, prog = 0) { const p = $('#prompt'); if (!text) { p.classList.add('hidden'); return; } p.classList.remove('hidden'); p.querySelector('span').textContent = text; p.querySelector('circle').style.strokeDashoffset = 94.2 * (1 - prog); }
  setHint(h) { $('#hint').innerHTML = h; }
  setRaidInfo(zone, t, objective) { $('#zone').textContent = zone || ''; const tm = $('#timer'); if (t === null) tm.textContent = ''; else { const s = Math.max(0, Math.ceil(t)); tm.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; tm.classList.toggle('low', s < 120); } $('#objective').textContent = objective || ''; }

  // ------------------------------------------------------------------ panels
  panel(html, onClose) {
    const p = $('#panel'); p.innerHTML = html; p.classList.remove('hidden'); this.open = onClose || true; this.g.input.unlock(); this.tip(null);
    p.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => this.close());
    return p;
  }
  close() { const p = $('#panel'); if (p.classList.contains('hidden')) return; p.classList.add('hidden'); p.innerHTML = ''; const cb = this.open; this.open = null; this.tip(null); if (this.preview) { this.preview.dispose(); this.preview = null; } if (typeof cb === 'function') cb(); this.g.onPanelClosed(); }
  isOpen() { return !!this.open; }
  tip(html) { if (!html) { this.tipEl.classList.add('hidden'); return; } this.tipEl.innerHTML = html; this.tipEl.classList.remove('hidden'); }
  entryTip(e) {
    if (e.weapon) { const s = weaponStats(e.weapon); const W = WEAPONS[e.weapon.id]; const mods = Object.entries(e.weapon.mods || {}).filter(([, m]) => m && !MODS[m]?.builtin).map(([, m]) => MODS[m].name);
      return `<h4 style="color:${RARITY[W.rarity]}">${W.name}</h4><p>${W.cls} · ${ITEMS[W.ammo].name} · ${s.kg.toFixed(2)} kg</p><div class="st">DMG ${Math.round(s.damage)}${s.pellets > 1 ? '×' + s.pellets : ''} · ${s.rpm} RPM · MAG ${s.mag}<br>Recoil ${s.recoil.toFixed(2)} · Spread ${s.spread.toFixed(1)}°</div>${mods.length ? `<p>${mods.join(', ')}</p>` : ''}<p>${W.desc}</p>`; }
    if (e.mod) { const m = MODS[e.mod]; const fx = ['recoil', 'hrecoil', 'spread', 'ads', 'reload', 'damage', 'range', 'speed', 'mag'].filter((k) => m[k]).map((k) => `${k} ×${m[k]}`).join(' · ');
      return `<h4 style="color:${RARITY[m.rarity || 'common']}">${m.name}</h4><p>${(m.kg || 0.1).toFixed(2)} kg · ${m.slot.toUpperCase()} attachment${m.only ? ' · ' + m.only.map((w) => WEAPONS[w].short).join('/') + ' only' : ''}</p><div class="st">${fx || (m.zoom ? 'Zoom ' + m.zoom + '×' : '')}</div><p>${m.desc || ''}</p>`; }
    const it = ITEMS[e.id]; return `<h4 style="color:${RARITY[it.rarity]}">${it.name}</h4><p>${it.desc}</p><div class="st">${(it.kg || 0.1) < 0.05 ? (it.kg * 1000).toFixed(0) + ' g each' : (it.kg || 0.1).toFixed(2) + ' kg each'}${e.n > 1 ? ` · ${entryKg(e).toFixed(2)} kg total` : ''}</div>`;
  }
  slotHTML(e, i, extra = '') { if (!e) return `<div class="slot empty"></div>`; return `<div class="slot" data-i="${i}" ${extra} style="--rc:${entryRarity(e)}"><div class="ic">${entryIcon(e)}</div><div class="n">${e.n && e.n > 1 ? e.n : ''}</div><div class="nm">${esc(e.weapon ? WEAPONS[e.weapon.id].short : entryName(e))}</div></div>`; }
  bindSlots(root, sel, list, onClick) {
    root.querySelectorAll(sel + ' .slot[data-i]').forEach((el) => {
      const e = list[+el.dataset.i];
      el.onmouseenter = () => this.tip(this.entryTip(e)); el.onmouseleave = () => this.tip(null);
      el.onclick = (ev) => { onClick(e, +el.dataset.i, ev); audio.click(700, 0.05, 0.03); };
      el.oncontextmenu = (ev) => { ev.preventDefault(); onClick(e, +el.dataset.i, ev, true); };
    });
  }
  // ------------------------------------------------------------------ inventory (base: stash <-> backpack, raid: backpack [+ container])
  inventory(container = null) {
    const G = this.g; const base = G.mode === 'base';
    const render = () => {
      const P = G.player; const pack = G.pack; const prof = G.profile;
      const packList = pack.items; const padded = [...packList]; while (padded.length < pack.slots) padded.push(null);
      let right = '';
      if (base) { const stash = G.stashEntries(); right = `<div class="col" style="flex:1.4"><h3>Stash <span>${G.stashUsed()}/${G.stashCap()} slots</span></h3><div class="grid" id="stashg">${stash.map((e, i) => this.slotHTML(e, i)).join('')}</div><small style="color:var(--dim)">Click: move to backpack · Right-click weapon: equip secondary · Shift-click: move all</small></div>`; }
      else if (container) { const list = container.contents || []; right = `<div class="col" style="flex:1"><h3>${esc(container.info.name)} <button class="ghost" id="takeall" style="padding:3px 10px;font-size:12px">Take all</button></h3><div class="grid" id="contg">${list.map((e, i) => this.slotHTML(e, i)).join('') || '<div style="color:var(--dim)">Empty</div>'}</div></div>`; }
      const eqW = (i) => { const w = P.weapons[i]; return `<div class="eq" data-eq="w${i}"><label>${i ? 'Secondary' : 'Primary'}</label><div class="v">${w ? `${WEAPONS[w.id].name}<small>${Object.values(w.mods).filter((m) => !MODS[m]?.builtin).map((m) => MODS[m].name).join(', ') || 'No attachments'}</small>` : '<small>Empty</small>'}</div></div>`; };
      const html = `<div class="win"><header><h2>${base ? 'Loadout & Stash' : 'Inventory'}</h2><span class="sub">${base ? 'Pack what you bring into the hotzone. Everything you carry is lost if you die.' : 'Backpack contents are lost on death — extract to keep them.'}</span><button class="ghost x" data-close>Close [Tab]</button></header>
        <div class="body"><div class="col" style="width:290px;flex-shrink:0"><h3>Equipment</h3><div class="equip">${eqW(0)}${eqW(1)}
          <div class="eq" data-eq="vest"><label>Armor</label><div class="v">${P.vestId ? `${ITEMS[P.vestId].name}<small>${Math.ceil(P.armor)}/${P.maxArmor} armor</small>` : '<small>None</small>'}</div></div>
          <div class="eq" data-eq="pack"><label>Backpack</label><div class="v">${ITEMS[P.packId].name}<small>${pack.slots} slots</small></div></div></div>
          <h3 style="margin-top:10px">Carry weight</h3>${(() => { const E = encumbrance(P.carriedKg()); const pct = Math.min(100, E.kg / 55 * 100); return `<div class="bar" style="height:8px;flex:none"><i style="transform:scaleX(${pct / 100});background:${E.kg > 42 ? 'var(--red)' : E.kg > 30 ? 'var(--acc)' : 'var(--green)'}"></i></div><div class="stats">${E.kg.toFixed(1)} kg · ${E.band}<br>Speed ×${E.speed.toFixed(2)} · Stamina drain ×${E.stamina.toFixed(2)}${E.noSprint ? '<br><span class="warn">Too heavy to sprint</span>' : ''}</div>`; })()}
          <h3 style="margin-top:10px">Vitals</h3><div class="stats">HP ${Math.ceil(P.hp)}/${P.maxHp}<br>Ammo: ${Object.keys(ITEMS).filter((a) => ITEMS[a].type === 'ammo' && pack.count(a)).map((a) => `${ITEMS[a].name} ${pack.count(a)}`).join('<br>') || 'none'}</div></div>
        <div class="col" style="flex:1"><h3>Backpack <span>${pack.used()}/${pack.slots}</span></h3><div class="grid" id="packg">${padded.map((e, i) => this.slotHTML(e, i)).join('')}</div><small style="color:var(--dim)">${base ? 'Click: return to stash' : 'Click weapon: equip · Click item: drop'}</small></div>${right}</div></div>`;
      const p = this.panel(html);
      p.querySelectorAll('.eq').forEach((el) => { el.onclick = () => { G.unequip(el.dataset.eq); render(); }; });
      this.bindSlots(p, '#packg', packList, (e, i) => {
        if (base) { G.packToStash(i); }
        else if (e.weapon) { G.equipFromPack(i); }
        else { pack.items.splice(i, 1); G.spawnBag(G.player.pos.clone().add(new THREE.Vector3(-Math.sin(G.player.yaw) * 0.8, 0, -Math.cos(G.player.yaw) * 0.8)), null, [e]); this.toast(`Dropped ${entryName(e)}`); }
        render();
      });
      if (base) this.bindSlots(p, '#stashg', G.stashEntries(), (e, i, ev, right) => { G.stashToPack(e, ev?.shiftKey, right); render(); });
      if (container) {
        this.bindSlots(p, '#contg', container.contents, (e, i) => { if (G.pack.add(e) === 0) { container.contents.splice(i, 1); G.takeFromContainer(container, e); this.feed(`+ ${entryName(e)}${e.n > 1 ? ' ×' + e.n : ''} (${entryKg(e).toFixed(1)} kg)`, 'loot'); } else this.toast('Backpack full'); render(); });
        const ta = p.querySelector('#takeall'); if (ta) ta.onclick = () => { for (let i = container.contents.length - 1; i >= 0; i--) { const e = container.contents[i]; const left = G.pack.add(e); if (left === 0) { container.contents.splice(i, 1); G.takeFromContainer(container, e); this.feed(`+ ${entryName(e)}${e.n > 1 ? ' ×' + e.n : ''}`, 'loot'); } else if (e.n) e.n = left; } if (container.contents.length) this.toast('Backpack full'); render(); };
      }
    };
    render();
  }
  // ------------------------------------------------------------------ crafting
  craft(station) {
    const G = this.g; const lvl = G.base.build.stationLevel(station); let tab = station === 'gunsmith' ? 'mods' : 'all';
    const render = () => {
      const list = RECIPES.filter((r) => r.station === station);
      const html = `<div class="win"><header><h2>${PIECES[station].name}</h2><span class="sub">Level ${lvl} · ${lvl < 3 && station !== 'medbay' ? 'Build another to upgrade' : ''}</span>${station === 'gunsmith' ? '<button id="tomods">Modify weapons</button>' : ''}<button class="ghost x" data-close>Close</button></header>
        <div class="body"><div class="col" style="flex:1"><div class="recipes">${list.map((r, i) => {
          const name = r.out.weapon ? WEAPONS[r.out.weapon].name : r.out.mod ? MODS[r.out.mod].name : ITEMS[r.out.item].name + (r.out.n > 1 ? ' ×' + r.out.n : '');
          const desc = r.out.weapon ? WEAPONS[r.out.weapon].desc : r.out.mod ? MODS[r.out.mod].desc : ITEMS[r.out.item].desc; const rar = r.out.weapon ? WEAPONS[r.out.weapon].rarity : r.out.mod ? MODS[r.out.mod].rarity : ITEMS[r.out.item].rarity;
          const locked = r.lvl > lvl; const can = !locked && Object.entries(r.cost).every(([k, n]) => G.stashCount(k) >= n);
          return `<div class="rec ${locked ? 'locked' : ''}" style="--rc:${RARITY[rar || 'common']}"><div class="ic">${r.out.weapon ? '⌐' : r.out.mod ? '⊕' : ITEMS[r.out.item].icon}</div><div class="info"><b>${esc(name)}</b><small>${esc(desc || '')}</small>
            <div class="cost">${Object.entries(r.cost).map(([k, n]) => `<span class="${G.stashCount(k) >= n ? '' : 'no'}">${ITEMS[k].name} ${G.stashCount(k)}/${n}</span>`).join('')}${locked ? `<span class="no">Requires level ${r.lvl}</span>` : ''}</div></div>
            <button data-r="${RECIPES.indexOf(r)}" ${can ? '' : 'disabled'}>Craft</button></div>`; }).join('')}</div></div>
          <div class="col" style="width:260px"><h3>Resources in stash</h3><div class="stats">${Object.keys(ITEMS).filter((k) => ITEMS[k].type === 'res').map((k) => `${ITEMS[k].name.padEnd(16, ' ')} ${G.stashCount(k)}`).join('<br>')}</div></div></div></div>`;
      const p = this.panel(html);
      p.querySelectorAll('button[data-r]').forEach((b) => b.onclick = () => { G.craft(RECIPES[+b.dataset.r]); audio.click(1200, 0.08, 0.08); render(); });
      const tm = p.querySelector('#tomods'); if (tm) tm.onclick = () => this.gunsmith();
    };
    render();
  }
  // ------------------------------------------------------------------ gunsmith
  gunsmith() {
    const G = this.g; let sel = G.profile.stash.weapons[0]?.uid;
    const render = () => {
      const ws = G.profile.stash.weapons; const w = ws.find((x) => x.uid === sel) || ws[0]; sel = w?.uid;
      const lo = G.profile.loadout;
      const html = `<div class="win"><header><h2>Gunsmith</h2><span class="sub">Fit attachments from your stash. Removed parts return to the stash.</span><button class="ghost x" data-close>Close</button></header>
        <div class="body"><div class="col" style="width:230px;flex-shrink:0"><h3>Weapons</h3>${ws.map((x) => `<div class="eq" data-w="${x.uid}" style="${x.uid === sel ? 'border-color:var(--acc)' : ''}"><div class="v">${WEAPONS[x.id].name}<small>${lo.primary === x.uid ? 'Primary' : lo.secondary === x.uid ? 'Secondary' : 'Stash'}</small></div></div>`).join('') || '<div style="color:var(--dim)">No weapons</div>'}</div>
        <div class="col" style="flex:1.3"><canvas id="gunview"></canvas>${w ? this.statsHTML(w) : ''}</div>
        <div class="col" style="flex:1">${w ? WEAPONS[w.id].slots.map((slot) => { const cur = w.mods?.[slot] || DEFAULT_MODS[slot];
          const opts = [DEFAULT_MODS[slot], ...Object.keys(MODS).filter((m) => MODS[m].slot === slot && !MODS[m].builtin && modFits(m, w.id) && (G.profile.stash.mods[m] > 0 || m === cur))];
          return `<div class="modslot"><h5>${slot}</h5><div class="modopts">${[...new Set(opts)].map((m) => `<button data-slot="${slot}" data-m="${m}" class="${m === cur ? 'on' : ''}">${MODS[m].name}${!MODS[m].builtin && m !== cur ? ` (${G.profile.stash.mods[m]})` : ''}</button>`).join('')}</div></div>`; }).join('') : ''}</div></div></div>`;
      const p = this.panel(html);
      p.querySelectorAll('[data-w]').forEach((el) => el.onclick = () => { sel = +el.dataset.w; render(); });
      p.querySelectorAll('[data-slot]').forEach((b) => { b.onmouseenter = () => !MODS[b.dataset.m].builtin && this.tip(this.entryTip({ mod: b.dataset.m })); b.onmouseleave = () => this.tip(null); b.onclick = () => { G.fitMod(w, b.dataset.slot, b.dataset.m); audio.click(1500, 0.06, 0.05); render(); }; });
      if (w) this.gunPreview(p.querySelector('#gunview'), w);
    };
    render();
  }
  statsHTML(w) {
    const s = weaponStats(w), b = WEAPONS[w.id]; const row = (k, v, max, inv) => { const t = Math.max(0.03, Math.min(1, inv ? 1 - v / max : v / max)); const base = b[k]; const better = inv ? v < base - 1e-6 : v > base + 1e-6, worse = inv ? v > base + 1e-6 : v < base - 1e-6;
      return `${STAT_LABEL[k].padEnd(11, ' ')}<span class="bar"><i style="transform:scaleX(${t})"></i></span> <span style="color:${better ? 'var(--green)' : worse ? 'var(--red)' : 'var(--txt)'}">${typeof v === 'number' ? (v % 1 ? v.toFixed(2) : v) : v}</span>`; };
    return `<div class="stats">${row('damage', s.damage * s.pellets, 130)}<br>${row('rpm', s.rpm, 900)}<br>${row('recoil', s.recoil, 5, true)}<br>${row('spread', s.spread, 5, true)}<br>${row('ads', s.ads, 0.45, true)}<br>${row('reload', s.reload, 3.5, true)}<br>${row('range', s.range, 220)}<br>${row('mag', s.mag, 75)}</div>`;
  }
  gunPreview(canvas, w) {
    if (this.preview) this.preview.dispose();
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(canvas.clientWidth, canvas.clientHeight, false);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene(); const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; sc.environmentIntensity = 0.9;
    const cam = new THREE.PerspectiveCamera(30, canvas.clientWidth / canvas.clientHeight, 0.01, 10);
    const gm = buildGun(w.id, w.mods); const box = new THREE.Box3().setFromObject(gm.group); const c = box.getCenter(new THREE.Vector3()); gm.group.position.sub(c);
    const holder = new THREE.Group(); holder.add(gm.group); sc.add(holder);
    const L = new THREE.DirectionalLight(0xffffff, 2.5); L.position.set(1, 2, 1.5); sc.add(L, new THREE.AmbientLight(0xffffff, 0.15));
    const size = box.getSize(new THREE.Vector3()).length(); cam.position.set(0, size * 0.18, size * 1.55); cam.lookAt(0, 0, 0);
    let yaw = -Math.PI / 2 + 0.35, drag = false, lx = 0, raf;
    canvas.onpointerdown = (e) => { drag = true; lx = e.clientX; canvas.setPointerCapture(e.pointerId); }; canvas.onpointerup = () => (drag = false);
    canvas.onpointermove = (e) => { if (drag) { yaw += (e.clientX - lx) * 0.01; lx = e.clientX; } };
    const loop = () => { if (!drag) yaw += 0.004; holder.rotation.y = yaw; holder.rotation.x = Math.sin(yaw * 0.7) * 0.12; r.render(sc, cam); raf = requestAnimationFrame(loop); }; loop();
    this.preview = { dispose: () => { cancelAnimationFrame(raf); r.dispose(); pm.dispose(); } };
  }
  // ------------------------------------------------------------------ maps
  mapHTML(markers) { return `<div class="map" id="map"><canvas width="640" height="640"></canvas>${markers.map((m) => `<div class="mk ${m.cls || ''}" data-id="${m.id || ''}" style="left:${(m.x + 320) / 640 * 100}%;top:${(m.z + 320) / 640 * 100}%"><i></i>${m.label || ''}</div>`).join('')}</div>`; }
  paintMap(canvas) { const src = this.g.mapImage; if (src) canvas.getContext('2d').drawImage(src, 0, 0); }
  launch() {
    const G = this.g; let sel = G.lastZone || 'quarter';
    const render = () => {
      const z = DROP_ZONES.find((d) => d.id === sel); const P = G.player; const lo = G.profile.loadout;
      const ammo = P.weapons.filter(Boolean).map((w) => `${WEAPONS[w.id].short}: ${G.pack.count(w.stats.ammo)} rds`).join(' · ');
      const warns = []; if (!P.weapons[0] && !P.weapons[1]) warns.push('No weapon equipped!'); if (P.weapons.some((w) => w && G.pack.count(w.stats.ammo) === 0)) warns.push('A weapon has no spare ammo in your backpack.'); if (!['bandage', 'medkit', 'stim'].some((k) => G.pack.count(k))) warns.push('No medical supplies packed.');
      const html = `<div class="win"><header><h2>Flight Ops · Ashgrove Hotzone</h2><span class="sub">Pick an insertion point. You fly in by helicopter and fast-rope down. Two extraction LZs will be active.</span><button class="ghost x" data-close>Cancel</button></header>
        <div class="body">${this.mapHTML([...DROP_ZONES.map((d) => ({ id: d.id, x: d.pos[0], z: d.pos[1], cls: d.id === sel ? 'sel' : '', label: `${d.name}<br><span class="dn">${'▲'.repeat(d.danger)}</span>` })), ...EXTRACTS.map((e) => ({ x: e.pos[0], z: e.pos[1], cls: 'ex', label: e.name }))])}
        <div class="zoneinfo"><div class="card"><h4>${z.name}</h4><div class="dn" style="color:var(--red)">${'▲'.repeat(z.danger)}<span style="color:var(--dim)">${'▲'.repeat(4 - z.danger)}</span> Threat</div><p>${z.desc}</p></div>
          <div class="card"><b>Loadout</b><div class="stats">${P.weapons.map((w, i) => w ? `${i ? 'Secondary' : 'Primary'}: ${WEAPONS[w.id].name}` : '').filter(Boolean).join('<br>') || 'Unarmed'}<br>Armor: ${P.vestId ? ITEMS[P.vestId].name : 'none'} · Pack: ${ITEMS[P.packId].name}<br>${ammo}<br>Backpack ${G.pack.used()}/${G.pack.slots} · Carry weight ${P.carriedKg().toFixed(1)} kg (${encumbrance(P.carriedKg()).band})</div>
          ${warns.map((w) => `<div class="warn">⚠ ${w}</div>`).join('')}</div>
          <div class="card" style="color:var(--dim);font-size:14px">Raid time 25:00. ${G.net.online ? `<b style="color:var(--green)">Multiplayer:</b> you share the hotzone with other operators (${G.net.playersOnline().length} online). Other players can shoot you and loot your body.` : 'Offline: solo session.'} Reach an active LZ, call the helicopter at the console and survive until it lands. Dying loses everything you carried in.</div>
          <div style="display:flex;gap:8px"><button id="loadout" class="ghost">Edit loadout</button><button id="go" style="flex:1">Board helicopter</button></div></div></div></div>`;
      const p = this.panel(html); this.paintMap(p.querySelector('#map canvas'));
      p.querySelectorAll('.mk[data-id]').forEach((el) => { if (el.dataset.id) el.onclick = () => { sel = el.dataset.id; audio.click(900, 0.06, 0.04); render(); }; });
      p.querySelector('#go').onclick = () => { G.lastZone = sel; this.open = null; $('#panel').classList.add('hidden'); this.tip(null); G.startRaid(sel); };
      p.querySelector('#loadout').onclick = () => this.inventory();
    };
    render();
  }
  raidMap() {
    const G = this.g, P = G.player;
    const marks = [...G.world.extracts.map((e) => ({ x: e.pos[0], z: e.pos[1], cls: 'ex' + (e.active ? '' : ' off'), label: e.name + (e.active ? '' : ' (offline)') })), ...DROP_ZONES.map((d) => ({ x: d.pos[0], z: d.pos[1], label: `<span style="color:var(--dim)">${d.name}</span>`, cls: 'zn' })), { x: P.pos.x, z: P.pos.z, cls: 'me', label: 'YOU' }];
    const p = this.panel(`<div class="win" style="width:auto"><header><h2>Map</h2><span class="sub">Active LZs shown in cyan.</span><button class="ghost x" data-close>Close [M]</button></header><div class="body">${this.mapHTML(marks)}</div></div>`);
    this.paintMap(p.querySelector('#map canvas'));
  }
  // ------------------------------------------------------------------ results / pause / menu
  results(r) {
    const list = r.items.map((e) => `<div class="eq"><div class="v" style="color:${entryRarity(e)}">${entryIcon(e)} ${esc(entryName(e))}${e.n > 1 ? ' ×' + e.n : ''}</div></div>`).join('');
    const p = this.panel(`<div class="win" style="width:min(760px,94vw)"><div class="result"><h1 class="${r.ok ? 'ok' : 'ko'}">${r.ok ? 'EXTRACTED' : 'KILLED IN ACTION'}</h1><p style="color:var(--dim)">${r.ok ? 'You made it out. Everything you carried is now in your stash.' : 'Your gear is lost in the hotzone.'}</p></div>
      <div class="body" style="flex-direction:column"><div class="summary"><div class="eq"><label>Time</label><div class="v">${Math.floor(r.time / 60)}m ${Math.floor(r.time % 60)}s</div></div><div class="eq"><label>Kills</label><div class="v">${r.kills}</div></div><div class="eq"><label>Containers</label><div class="v">${r.looted}</div></div></div>
      <h3 style="margin:8px 0 0;color:var(--dim);letter-spacing:.14em;font-size:14px">${r.ok ? 'SECURED LOOT' : 'LOST'}</h3><div class="summary">${list || '<div style="color:var(--dim)">Nothing</div>'}</div>
      <button id="cont" style="align-self:center;margin-top:10px">Return to Haven</button></div></div>`, () => this.g.toBase());
    p.querySelector('#cont').onclick = () => this.close();
  }
  pause() {
    const G = this.g;
    const p = this.panel(`<div class="win" style="width:min(560px,94vw)"><header><h2>Paused</h2><button class="ghost x" data-close>Resume [Esc]</button></header><div class="body" style="flex-direction:column">${this.settingsHTML()}
      <div class="keys">${this.keysHTML()}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${G.mode === 'raid' ? '<button id="abandon" class="ghost">Abandon raid (lose gear)</button>' : ''}<button id="tomenu" class="ghost">Main menu</button></div></div></div>`);
    this.bindSettings(p);
    p.querySelector('#abandon')?.addEventListener('click', () => { this.close(); G.player.damage(9999, null); });
    p.querySelector('#tomenu').onclick = () => { this.open = null; $('#panel').classList.add('hidden'); G.save(); G.showMenu(); };
  }
  settingsHTML() { const s = this.g.settings; return `<div class="settings"><label>Mouse sensitivity</label><input type="range" id="sens" min="0.3" max="3" step="0.05" value="${s.sens}"><label>Volume</label><input type="range" id="vol" min="0" max="1" step="0.05" value="${s.vol}"><label>Graphics</label><select id="qual"><option value="ultra" ${s.quality === 'ultra' ? 'selected' : ''}>Ultra (AO, 2× res)</option><option value="high" ${s.quality === 'high' ? 'selected' : ''}>High (ambient occlusion)</option><option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Medium</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Performance</option></select><label>Field of view</label><input type="range" id="fov" min="60" max="95" step="1" value="${s.fov}"><label>Camera</label><select id="view"><option value="third" ${s.view !== 'first' ? 'selected' : ''}>Third person (over the shoulder)</option><option value="first" ${s.view === 'first' ? 'selected' : ''}>First person</option></select></div>`; }
  bindSettings(p) { const G = this.g; p.querySelector('#sens').oninput = (e) => { G.settings.sens = +e.target.value; G.saveSettings(); }; p.querySelector('#vol').oninput = (e) => { G.settings.vol = +e.target.value; audio.setVolume(G.settings.vol); G.saveSettings(); }; p.querySelector('#qual').onchange = (e) => { G.settings.quality = e.target.value; G.engine.setQuality(G.settings.quality); G.saveSettings(); }; p.querySelector('#fov').oninput = (e) => { G.settings.fov = +e.target.value; G.engine.baseFov = G.settings.fov; G.saveSettings(); }; p.querySelector('#view').onchange = (e) => { G.settings.view = e.target.value; if (G.player) G.player.fp = e.target.value === 'first'; G.saveSettings(); }; }
  keysHTML() { return [['WASD', 'Move'], ['Shift', 'Sprint'], ['C', 'Crouch'], ['Space', 'Jump'], ['LMB / RMB', 'Fire / Aim'], ['R', 'Reload'], ['1 / 2 · Wheel', 'Switch weapon'], ['E (hold)', 'Interact / loot / salvage'], ['Q', 'Heal'], ['G', 'Insert armor plate'], ['Tab', 'Inventory'], ['M', 'Map'], ['V', 'First / third person'], ['L', 'Weapon light'], ['I', 'Inspect weapon'], ['Shift (aiming)', 'Hold breath (scopes)'], ['E near vehicle', 'Drive / ride · W/S/A/D, Space handbrake, R flip'], ['B', 'Build mode (base)']].map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join(''); }
  menu(hasSave) {
    const m = $('#menu'); m.classList.remove('hidden');
    m.innerHTML = `<div class="mm"><div class="logo">DROP<span>ZONE</span></div><div class="tag">Drop into the Ashgrove hotzone. Strip it for salvage. Fight off machines and raiders. Extract alive and build up Haven.</div>
      <div class="callsign"><label>Callsign</label><input id="cs" maxlength="16" value="${esc(this.g.net.name)}"><small>${this.g.net.online ? '<span class="ok">● Multiplayer online</span>' : 'Offline · solo'}</small></div>
      <div class="callsign"><label>Camera</label><select id="mview"><option value="third" ${this.g.settings.view !== 'first' ? 'selected' : ''}>Third person</option><option value="first" ${this.g.settings.view === 'first' ? 'selected' : ''}>First person</option></select><small>Switch any time with V</small></div>
      ${hasSave ? '<button id="cont">Continue</button>' : ''}<button id="new" class="${hasSave ? 'ghost' : ''}">${hasSave ? 'New game (wipe save)' : 'Start'}</button><button id="opts" class="ghost">Settings & controls</button>
      <div class="ver">Best with mouse & keyboard. Click the game to capture the mouse.<br>Progress saves automatically in this browser.</div></div>`;
    m.querySelector('#cs').onchange = (e) => this.g.net.setName(e.target.value);
    m.querySelector('#mview').onchange = (e) => { this.g.settings.view = e.target.value; this.g.saveSettings(); };
    m.querySelector('#cont')?.addEventListener('click', () => { audio.init(); m.classList.add('hidden'); this.g.continueGame(); });
    m.querySelector('#new').onclick = (ev) => { const b = ev.currentTarget; if (hasSave && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Click again to wipe your stash and base'; return; } audio.init(); m.classList.add('hidden'); this.g.newGame(); };
    m.querySelector('#opts').onclick = () => { const p = this.panel(`<div class="win" style="width:min(560px,94vw)"><header><h2>Settings</h2><button class="ghost x" data-close>Back</button></header><div class="body" style="flex-direction:column">${this.settingsHTML()}<div class="keys">${this.keysHTML()}</div></div></div>`); this.bindSettings(p); };
  }
  hideMenu() { $('#menu').classList.add('hidden'); }
  buildBar(sel, spec, ok, canAfford) {
    const bb = $('#buildbar'); if (sel === null) { bb.classList.add('hidden'); return; } bb.classList.remove('hidden');
    const lo = Math.max(0, Math.min(PIECE_ORDER.length - 9, sel - 4));
    bb.innerHTML = PIECE_ORDER.map((k, i) => { if (i < lo || i >= lo + 9) return ''; const P = PIECES[k]; const aff = Object.entries(P.cost).every(([r, n]) => this.g.stashCount(r) >= n); return `<div class="bp ${i === sel ? 'on' : ''} ${aff ? '' : 'no'}"><b>${i < 9 ? i + 1 : i === 9 ? 0 : ''}</b> ${P.name}<small>${Object.entries(P.cost).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${ITEMS[r].name.split(' ')[0]}`).join(' · ')}</small></div>`; }).join('');
  }
  intel(lines) {
    const G = this.g; const p = G.ai.profile;
    this.panel(`<div class="win" style="width:min(760px,94vw)"><header><h2>Threat Intel</h2><span class="sub">What Ashgrove's hostiles have learned about how you fight.</span><button class="ghost x" data-close>Close</button></header>
      <div class="body" style="flex-direction:column"><div class="summary">${[['Engagement range', Math.round(p.engageDist) + ' m'], ['Aggression', Math.round(p.aggression * 100) + '%'], ['Time crouched', Math.round(p.crouch * 100) + '%'], ['Static shooting', Math.round(p.camping * 100) + '%'], ['Headshot rate', Math.round(p.headshot * 100) + '%'], ['Suppressed fire', Math.round(p.suppressed * 100) + '%'], ['Vehicle use', Math.round(p.vehicle * 100) + '%'], ['Raids observed', p.raids]].map(([k, v]) => `<div class="eq"><label>${k}</label><div class="v">${v}</div></div>`).join('')}</div>
      <h3 style="margin:6px 0 0;color:var(--dim);letter-spacing:.14em;font-size:14px">ENEMY ADAPTATIONS</h3>${lines.map((l) => `<div class="eq"><div class="v" style="font-weight:500">${esc(l)}</div></div>`).join('')}</div></div>`);
  }
  vehicleHud(v) {
    let el = $('#vehhud'); if (!el) { el = document.createElement('div'); el.id = 'vehhud'; $('#hud').appendChild(el); }
    if (!v) { el.classList.add('hidden'); $('#weaponhud').classList.remove('hidden'); return; }
    el.classList.remove('hidden'); if (v.seat === 0) $('#weaponhud').classList.add('hidden');
    el.innerHTML = `<div class="vname">${esc(v.name)}${v.seat ? ' · passenger' : ''}</div><div class="spd">${Math.round(v.speed * 3.6)}<small>km/h</small></div><div class="row"><label>HULL</label><div class="bar"><i class="hp" style="transform:scaleX(${Math.max(0, v.hp / v.maxHp)})"></i></div></div><div class="row"><label>FUEL</label><div class="bar"><i class="st" style="transform:scaleX(${v.fuel})"></i></div></div><div class="vk">W/S throttle · A/D steer · Space handbrake · V camera · E exit</div>`;
  }
  updateOnline() {
    const G = this.g; let el = $('#online'); if (!el) { el = document.createElement('div'); el.id = 'online'; document.body.appendChild(el); }
    if (!G.net.online) { el.innerHTML = '<i class="off"></i>Offline'; return; }
    const list = G.net.playersOnline(); const raid = G.net.raidRoom ? G.net.remotes.size : null;
    el.innerHTML = `<i></i>${list.length} online${raid !== null ? ` · ${raid} in your raid` : ''}<div class="who">${list.slice(0, 8).map((p) => `<span style="color:${p.color}">${esc(p.name)}${p.me ? ' (you)' : ''}</span> <small>${p.mode === 'raid' || p.mode === 'heli' ? 'in raid' : p.mode === 'base' ? 'at Haven' : ''}</small>`).join('<br>')}</div>`;
  }
  fade(on) { $('#fade').classList.toggle('on', on); }
  loading(pct, txt) { const l = $('#loading'); if (pct === null) { l.classList.add('hidden'); return; } l.classList.remove('hidden'); $('#loadbar').style.width = pct + '%'; if (txt) $('#loadtxt').textContent = txt; }
}
