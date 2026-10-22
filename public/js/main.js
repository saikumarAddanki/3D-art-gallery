import * as THREE from 'three';
import { Avatar, DEFAULTS, SKINS, HAIRS, OUTFITS, PANTS, SHOES } from './avatar.js';
import { buildWorld, SIZES, STYLES, DECOS } from './world.js';
import { Film } from './film.js';

/* ================= helpers ================= */
const $ = (s) => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT; const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); };

/* ================= three setup ================= */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#bfe5ff'); scene.fog = new THREE.Fog('#d6ecff', 70, 260);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
const world = buildWorld(scene);
const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize); resize();

/* ================= state ================= */
const S = { room: null, rs: null, ws: null, id: null, color: '#ffa73d', mode: 'landing', look: store.get('om_look', { ...DEFAULTS.kai }), name: store.get('om_name', '') };
const me = { id: null, pos: new THREE.Vector3(0, 0, 20), y: 0, yaw: Math.PI, vel: new THREE.Vector3(), speed: 0, avatar: new Avatar(S.look), act: null, isMe: true };
scene.add(me.avatar.group); me.avatar.group.visible = false;
const others = new Map();
const cam = { yaw: 0, pitch: 0.3, dist: 4.6, pos: new THREE.Vector3(0, 4, 30), look: new THREE.Vector3(0, 1.5, 20) };
const ent = (id) => (id === S.id ? me : others.get(id));

/* ================= effects: hearts ================= */
const heartTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(2, 30, 10, 6, 32, 20); g.bezierCurveTo(54, 6, 62, 30, 32, 54); g.fill(); return new THREE.CanvasTexture(c); })();
const hearts = [];
function spawnHeart(x, y, z, color) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, color, transparent: true, depthWrite: false }));
  s.scale.setScalar(rnd(0.16, 0.34)); s.position.set(x + rnd(-0.3, 0.3), y, z + rnd(-0.3, 0.3));
  s.userData = { vy: rnd(0.5, 0.95), vx: rnd(-0.15, 0.15), life: 0, max: rnd(1.6, 2.4) }; scene.add(s); hearts.push(s);
}

/* ================= networking ================= */
const send = (o) => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); };
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); S.ws = ws; let done = false;
    ws.onopen = () => send({ t: 'join', room: S.room, name: S.name, look: S.look });
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.t === 'welcome') { done = true; resolve(m); } else if (m.t === 'error' && !done) { done = true; reject(new Error(m.msg)); } else onMsg(m); };
    ws.onerror = () => { if (!done) { done = true; reject(new Error('Could not connect')); } };
    ws.onclose = () => { if (S.mode === 'play') { toast('Disconnected — reload to rejoin'); } };
  });
}
function onMsg(m) {
  switch (m.t) {
    case 'join': addRemote(m.p); log(`${m.p.name} joined`, true); toast(`${m.p.name} entered the museum`); break;
    case 'leave': { const o = others.get(m.id); if (o) { log(`${o.name} left`, true); removeRemote(m.id); } break; }
    case 'pos': { const o = others.get(m.id); if (o) { o.target.x = m.p[0]; o.target.z = m.p[1]; o.target.yaw = m.p[2]; } break; }
    case 'chat': chatIn(m); break;
    case 'emoji': showEmoji(m.id, m.e); break;
    case 'act': startAct(m.from, m.to, m.kind); break;
    case 'frame': { const d = { ...world.defaultFor(m.frame.slot), ...m.frame }; world.frameData[m.frame.slot] = d; world.setFrame(m.frame.slot, d); if (ed.slot === m.frame.slot) refreshEditor(); break; }
    case 'unframe': { const d = world.defaultFor(m.slot); world.frameData[m.slot] = d; world.setFrame(m.slot, d); if (ed.slot === m.slot) refreshEditor(); break; }
    case 'meta': S.rs.title = m.title; S.rs.message = m.message; S.rs.from = m.from; world.setPlaque(m.title, m.message, m.from); break;
    case 'video': S.rs.video = m.url; break;
    case 'film': m.on ? startFilm() : stopFilm(); break;
  }
}
function addRemote(p) {
  if (others.has(p.id)) return;
  const o = { id: p.id, name: p.name, color: p.color, look: p.look, avatar: new Avatar(p.look), pos: new THREE.Vector3(p.pos[0], 0, p.pos[1]), y: 0, yaw: p.pos[2] || 0, speed: 0, target: { x: p.pos[0], z: p.pos[1], yaw: p.pos[2] || 0 }, act: null };
  o.avatar.group.position.copy(o.pos); scene.add(o.avatar.group); o.tag = makeTag(o); others.set(p.id, o); refreshPresence();
}
function removeRemote(id) { const o = others.get(id); if (!o) return; scene.remove(o.avatar.group); o.tag.remove(); others.delete(id); refreshPresence(); }

/* ================= name tags / bubbles / emoji ================= */
const labels = $('#labels');
function makeTag(o) { const d = document.createElement('div'); d.className = 'tag'; d.innerHTML = `<div class="nm"><i style="background:${o.color}"></i>${esc(o.name)}</div>`; labels.appendChild(d); return d; }
const proj = new THREE.Vector3();
function screenOf(o, h = 2.0) { proj.set(o.pos.x, o.y + h, o.pos.z).project(camera); return { x: (proj.x + 1) / 2 * innerWidth, y: (1 - proj.y) / 2 * innerHeight, vis: proj.z < 1 && proj.z > -1 }; }
function bubble(o, text) { if (!o.tag) return; let b = o.tag.querySelector('.say'); if (b) b.remove(); b = document.createElement('div'); b.className = 'say'; b.textContent = text; o.tag.prepend(b); clearTimeout(o.bt); o.bt = setTimeout(() => b.remove(), 5000); }
function showEmoji(id, e) { const o = ent(id); if (!o) return; const p = screenOf(o, 2.1); if (!p.vis) return; const d = document.createElement('div'); d.className = 'emo'; d.textContent = e; d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; labels.appendChild(d); setTimeout(() => d.remove(), 2300); if (['❤️', '😍', '🥰', '💖', '💘', '😘'].includes(e) && o.pos) for (let i = 0; i < 3; i++) setTimeout(() => spawnHeart(o.pos.x, o.y + 2, o.pos.z, '#ff5d8f'), i * 120); }

/* ================= chat ================= */
function log(text, sys, who, color) { const l = $('#chat-log'); const d = document.createElement('div'); if (sys) { d.className = 'sys'; d.textContent = text; } else d.innerHTML = `<b style="color:${color}">${esc(who)}</b> ${esc(text)}`; l.appendChild(d); l.scrollTop = l.scrollHeight; if ($('#chat').hidden && !sys) $('#chat-badge').hidden = false; }
function chatIn(m) { log(m.text, false, m.name, m.color); const o = ent(m.id); if (o) bubble(o, m.text); }
$('#chat-form').onsubmit = (e) => { e.preventDefault(); const i = $('#chat-in'); const t = i.value.trim(); if (t) send({ t: 'chat', text: t }); i.value = ''; };
$('#b-chat').onclick = () => { const c = $('#chat'); c.hidden = !c.hidden; if (!c.hidden) { $('#chat-badge').hidden = true; $('#chat-in').focus(); } };
const EMOJIS = ['😀', '😂', '🥰', '😍', '😘', '😎', '🥹', '😢', '😮', '🤗', '😉', '🤩', '❤️', '💖', '💘', '🔥', '👏', '🙌', '👍', '🎉', '✨', '🌹', '💐', '🥂', '📸', '🖼️', '🐶', '😴'];
$('#emoji-tray').innerHTML = EMOJIS.map((e) => `<button>${e}</button>`).join('');
$('#emoji-tray').onclick = (ev) => { const b = ev.target.closest('button'); if (b) send({ t: 'emoji', e: b.textContent }); };
$('#b-emoji').onclick = () => { $('#emoji-tray').hidden = !$('#emoji-tray').hidden; };

/* ================= input ================= */
const keys = { up: 0, down: 0, left: 0, right: 0, shift: 0 };
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'shift', ShiftRight: 'shift' };
addEventListener('keydown', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) return; const k = KEYMAP[e.code]; if (k) { keys[k] = 1; e.preventDefault(); } if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); if (S.mode === 'play') interact(); } if (e.code === 'Enter' && S.mode === 'play') { $('#chat').hidden = false; $('#chat-badge').hidden = true; $('#chat-in').focus(); e.preventDefault(); } });
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = 0; });
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
const joy = { x: 0, y: 0, tx: 0, ty: 0, id: null };
const joyEl = $('#joy'), knob = $('#knob');
function moveJoy(e) { const r = joyEl.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const R = r.width / 2 - 10; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } joy.tx = dx / R; joy.ty = -dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; }
joyEl.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); });
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) moveJoy(e); });
const joyEnd = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.tx = joy.ty = 0; knob.style.transform = ''; knob.style.transition = 'transform .15s'; setTimeout(() => (knob.style.transition = ''), 160); } };
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
// camera drag / pinch / click
const ptrs = new Map(); let dragMoved = 0, pinch0 = 0;
canvas.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragMoved = 0; canvas.setPointerCapture(e.pointerId); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; dragMoved += Math.abs(dx) + Math.abs(dy);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); cam.dist = clamp(cam.dist * (pinch0 / d), 2, 9); pinch0 = d; return; }
  if (S.mode === 'custom') { me.yaw -= dx * 0.01; return; }
  cam.yaw -= dx * 0.0065; cam.pitch = clamp(cam.pitch + dy * 0.0045, 0.02, 1.25);
});
const ptrEnd = (e) => { ptrs.delete(e.pointerId); if (e.type === 'pointerup' && dragMoved < 7 && S.mode === 'play') clickWorld(e); };
canvas.addEventListener('pointerup', ptrEnd); canvas.addEventListener('pointercancel', ptrEnd);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + e.deltaY * 0.004, 2, 9); }, { passive: true });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function clickWorld(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(world.slotGroups, true)[0]; if (!hit) return;
  let o = hit.object; while (o && o.userData.slot === undefined) o = o.parent; if (!o) return;
  const s = world.slots[o.userData.slot]; if (Math.hypot(s.pos[0] - me.pos.x, s.pos[2] - me.pos.z) > 5) { toast('Walk closer to this frame to edit it'); return; }
  openEditor(o.userData.slot);
}

/* ================= hug / kiss ================= */
function startAct(fromId, toId, kind) {
  const A = ent(fromId), B = ent(toId); if (!A || !B || A.act || B.act) return;
  const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z; const d = Math.hypot(dx, dz) || 1; const dir = { x: dx / d, z: dz / d };
  const gap = kind === 'kiss' ? 0.46 : 0.54; const mx = (A.pos.x + B.pos.x) / 2, mz = (A.pos.z + B.pos.z) / 2;
  const mk = (sg) => ({ kind, t: 0, tx: mx + dir.x * (gap / 2) * sg, tz: mz + dir.z * (gap / 2) * sg, yaw: Math.atan2(dir.x * sg, dir.z * sg), posed: false, hb: 0, mx, mz, dur: kind === 'kiss' ? 5.2 : 4.6 });
  A.act = mk(-1); B.act = mk(1); A.act.yaw = Math.atan2(dir.x, dir.z); B.act.yaw = Math.atan2(-dir.x, -dir.z);
  A.act.tx = mx - dir.x * gap / 2; A.act.tz = mz - dir.z * gap / 2; B.act.tx = mx + dir.x * gap / 2; B.act.tz = mz + dir.z * gap / 2;
  if (A === me || B === me) { joy.tx = joy.ty = 0; }
}
function stepAct(o, dt) {
  const a = o.act; a.t += dt;
  o.pos.x = damp(o.pos.x, a.tx, 5, dt); o.pos.z = damp(o.pos.z, a.tz, 5, dt);
  o.yaw += angDiff(o.yaw, a.yaw) * (1 - Math.exp(-dt * 9)); o.vel && o.vel.set(0, 0, 0); o.speed = 0;
  if (!a.posed && a.t > 0.9) { a.posed = true; o.avatar.setPose(a.kind, 1); }
  if (a.posed) { a.hb -= dt; if (a.hb <= 0) { a.hb = 0.3; spawnHeart(a.mx, o.y + 2.0, a.mz, a.kind === 'kiss' ? '#ff4d7e' : '#ffb347'); } }
  const wants = o === me && Math.hypot(keys.right - keys.left, keys.up - keys.down) + Math.hypot(joy.x, joy.y) > 0.6;
  if (a.t > a.dur || (wants && a.t > 1.6)) { o.avatar.setPose(null); o.act = null; }
}

/* ================= local movement ================= */
function groundY(x, z) { if (z > 8.6 && z < 12.2 && Math.abs(x) < 6) { if (z < 10.6 && Math.abs(x) < 4.8) return 0.54; if (z < 11.4 && Math.abs(x) < 5.4) return 0.36; return 0.18; } return 0; }
let lastSend = 0, lastPos = [0, 0, 0, 0];
function stepMe(dt) {
  if (me.act) { stepAct(me, dt); me.avatar.update(dt, 0, 0); return; }
  joy.x = damp(joy.x, joy.tx, 16, dt); joy.y = damp(joy.y, joy.ty, 16, dt);
  let ix = keys.right - keys.left, iy = keys.up - keys.down, target = 0; const km = Math.hypot(ix, iy);
  if (km > 0) { ix /= km; iy /= km; target = keys.shift ? 4.2 : 2.1; }
  else { const jm = Math.min(1, Math.hypot(joy.x, joy.y)); if (jm > 0.06) { ix = joy.x / jm; iy = joy.y / jm; target = jm < 0.6 ? (jm / 0.6) * 2.1 : 2.1 + ((jm - 0.6) / 0.4) * 2.1; } }
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;
  const dx = fx * iy + rx * ix, dz = fz * iy + rz * ix;
  const k = target > me.speed ? 8 : 11; const pv = me.speed;
  me.vel.x = damp(me.vel.x, dx * target, k, dt); me.vel.z = damp(me.vel.z, dz * target, k, dt);
  me.pos.x += me.vel.x * dt; me.pos.z += me.vel.z * dt; world.collide(me.pos);
  me.speed = Math.hypot(me.vel.x, me.vel.z);
  if (me.speed > 0.3) me.yaw += angDiff(me.yaw, Math.atan2(me.vel.x, me.vel.z)) * (1 - Math.exp(-dt * 11));
  me.avatar.update(dt, me.speed, (me.speed - pv) / Math.max(dt, 0.001));
  const now = performance.now();
  if (S.mode === 'play' && now - lastSend > 80) {
    const p = [+me.pos.x.toFixed(2), +me.pos.z.toFixed(2), +me.yaw.toFixed(2), +me.speed.toFixed(1)];
    if (p[0] !== lastPos[0] || p[1] !== lastPos[1] || p[2] !== lastPos[2] || now - lastSend > 1000) { send({ t: 'pos', p }); lastPos = p; lastSend = now; }
  }
}
function stepRemote(o, dt) {
  if (o.act) { stepAct(o, dt); o.avatar.update(dt, 0, 0); return; }
  const px = o.pos.x, pz = o.pos.z; o.pos.x = damp(o.pos.x, o.target.x, 9, dt); o.pos.z = damp(o.pos.z, o.target.z, 9, dt);
  const sp = Math.hypot(o.pos.x - px, o.pos.z - pz) / Math.max(dt, 0.001); o.speed = damp(o.speed, sp < 0.15 ? 0 : sp, 12, dt);
  o.yaw += angDiff(o.yaw, o.target.yaw) * (1 - Math.exp(-dt * 10)); o.avatar.update(dt, o.speed, 0);
}
function place(o, dt) { o.y = damp(o.y, groundY(o.pos.x, o.pos.z), 14, dt); o.avatar.group.position.set(o.pos.x, o.y, o.pos.z); o.avatar.group.rotation.y = o.yaw; }

/* ================= camera + lighting ================= */
const ZL = { garden: { sun: 2.4, hemi: 1.1, pts: 0, cine: 0, exp: 1.05 }, gallery: { sun: 0.1, hemi: 0.55, pts: 38, cine: 0, exp: 1.0 }, cinema: { sun: 0.04, hemi: 0.5, pts: 0, cine: 110, exp: 1.15 } };
const ZNAME = { garden: 'The Garden', gallery: 'The Gallery', cinema: 'The Screening Room' };
let zone = 'garden', zoneShown = '';
const dirv = new THREE.Vector3(), tgt = new THREE.Vector3();
function stepCamera(dt, t) {
  if (S.mode === 'landing') {
    const a = Math.sin(t * 0.12) * 0.5; camera.fov = 55; camera.updateProjectionMatrix();
    camera.position.set(Math.sin(a) * 14, 3.2 + Math.sin(t * 0.2), 36); camera.lookAt(Math.sin(a) * 3, 3.4, 8); return;
  }
  if (S.mode === 'custom') {
    camera.fov = 36; camera.updateProjectionMatrix(); camera.position.set(0, 1.3, 17.2); camera.lookAt(0, 1.08, 14.2); return;
  }
  if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
  tgt.set(me.pos.x, me.y + 1.45, me.pos.z);
  const cp = Math.cos(cam.pitch); dirv.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  const flat = { x: dirv.x, z: dirv.z }; const fl = Math.hypot(flat.x, flat.z) || 1;
  let d = cam.dist; const clip = world.rayClip({ x: tgt.x, z: tgt.z }, { x: flat.x / fl, z: flat.z / fl }, d * fl) / fl; d = Math.min(d, Math.max(0.9, clip - 0.35));
  const want = tgt.clone().addScaledVector(dirv, d); want.y = Math.max(want.y, 0.35);
  cam.pos.x = damp(cam.pos.x, want.x, 14, dt); cam.pos.y = damp(cam.pos.y, want.y, 14, dt); cam.pos.z = damp(cam.pos.z, want.z, 14, dt);
  cam.look.x = damp(cam.look.x, tgt.x, 18, dt); cam.look.y = damp(cam.look.y, tgt.y, 18, dt); cam.look.z = damp(cam.look.z, tgt.z, 18, dt);
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  me.avatar.group.visible = camera.position.distanceTo(tgt) > 1.1;
}
function stepLights(dt) {
  const z = ZL[zone], L = world.lights;
  L.sun.intensity = damp(L.sun.intensity, z.sun, 3, dt); L.hemi.intensity = damp(L.hemi.intensity, z.hemi, 3, dt);
  L.points.forEach((p) => (p.intensity = damp(p.intensity, z.pts, 3, dt))); L.cinema.intensity = damp(L.cinema.intensity, z.cine, 3, dt);
  renderer.toneMappingExposure = damp(renderer.toneMappingExposure, z.exp, 3, dt);
}

/* ================= prompts (context chips) ================= */
let chipKey = '', nearSlot = null, partner = null;
function updateContext() {
  nearSlot = world.nearestSlot(me.pos.x, me.pos.z); partner = null; let bd = 2.6;
  if (!me.act) others.forEach((o) => { const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z); if (d < bd && !o.act) { bd = d; partner = o; } });
  const items = [];
  if (partner && !me.act) items.push({ k: 'hug', label: '🤗 Hug', cls: 'love' }, { k: 'kiss', label: '💋 Kiss', cls: 'love' });
  if (nearSlot !== null && !me.act) { const has = world.frameData[nearSlot].photo; items.push({ k: 'edit', label: has ? '✏️ Edit frame' : '＋ Add photo' }); }
  const key = items.map((i) => i.k).join(',') + (partner ? partner.id : '');
  if (key !== chipKey) { chipKey = key; const c = $('#chips'); c.innerHTML = ''; items.forEach((i) => { const b = document.createElement('button'); b.textContent = i.label; if (i.cls) b.className = i.cls; b.onclick = () => chipAction(i.k); c.appendChild(b); }); $('#act-btn').classList.toggle('glow', items.length > 0); }
}
function chipAction(k) { if (k === 'hug' || k === 'kiss') { if (partner) send({ t: 'act', to: partner.id, kind: k }); } else if (k === 'edit' && nearSlot !== null) openEditor(nearSlot); }
function interact() { if (partner) return chipAction('hug'); if (nearSlot !== null) return chipAction('edit'); toast('Walk up to a frame to add photos, or to a friend to hug'); }
$('#act-btn').onclick = interact;

/* ================= frame editor ================= */
const ed = { slot: null, timer: null };
const LBL = { classic: 'Classic', print: 'Print', gold: 'Gold', wood: 'Wood', white: 'Gallery', polaroid: 'Polaroid', neon: 'Neon', none: 'None', lights: 'Fairy lights', flowers: 'Flowers', hearts: 'Hearts', ribbon: 'Ribbon', vines: 'Vines', s: 'Small', p: 'Portrait', sq: 'Square', l: 'Landscape', w: 'Wide', t: 'Tall', g: 'Grand' };
const chips = (el, list, cur, fn) => { el.innerHTML = list.map((v) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${LBL[v]}</button>`).join(''); el.onclick = (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }; };
function openEditor(slot) { ed.slot = slot; $('#settings').hidden = true; $('#custom').hidden = true; $('#editor').hidden = false; refreshEditor(); }
function refreshEditor() {
  const d = world.frameData[ed.slot]; $('#ed-title').textContent = ed.slot === 0 ? 'Centrepiece' : `Frame ${ed.slot}`;
  const th = $('#ed-thumb'); th.style.backgroundImage = d.photo ? `url(${d.photo})` : ''; th.textContent = d.photo ? '' : 'Empty frame';
  $('#ed-upload').textContent = d.photo ? '↻ Replace photo' : '＋ Add photo';
  chips($('#ed-style'), STYLES, d.style, (v) => patch({ style: v })); chips($('#ed-size'), Object.keys(SIZES), d.size, (v) => patch({ size: v })); chips($('#ed-deco'), DECOS, d.deco, (v) => patch({ deco: v }));
  if (document.activeElement !== $('#ed-cap')) $('#ed-cap').value = d.caption || '';
}
function patch(p, slot = ed.slot) { const d = { ...world.frameData[slot], ...p, slot }; world.frameData[slot] = d; world.setFrame(slot, d); if (slot === ed.slot) refreshEditor(); clearTimeout(ed['t' + slot]); ed['t' + slot] = setTimeout(() => send({ t: 'frame', frame: d }), 180); }
$('#ed-cap').oninput = (e) => patch({ caption: e.target.value });
$('#ed-close').onclick = () => { $('#editor').hidden = true; ed.slot = null; };
$('#ed-remove').onclick = () => patch({ photo: null });
$('#ed-reset').onclick = () => { const slot = ed.slot; const d = world.defaultFor(slot); world.frameData[slot] = d; world.setFrame(slot, d); send({ t: 'unframe', slot }); refreshEditor(); };
$('#ed-upload').onclick = () => $('#ed-file').click();
$('#ed-file').onchange = async (e) => { const files = [...e.target.files]; e.target.value = ''; await addPhotos(files); };
const dz = $('#ed-drop'); ['dragover', 'dragenter'].forEach((n) => dz.addEventListener(n, (e) => { e.preventDefault(); dz.classList.add('over'); })); ['dragleave', 'drop'].forEach((n) => dz.addEventListener(n, () => dz.classList.remove('over')));
dz.addEventListener('drop', (e) => { e.preventDefault(); addPhotos([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); });
async function addPhotos(files) {
  if (!files.length || ed.slot === null) return; let slot = ed.slot; toast(`Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`);
  for (let i = 0; i < files.length; i++) {
    if (i > 0) { do { slot++; } while (slot < world.slots.length && world.frameData[slot].photo); if (slot >= world.slots.length) { toast('Museum is full (45 frames)'); break; } }
    try { const url = await uploadPhoto(files[i]); patch({ photo: url }, slot); } catch (err) { toast('Upload failed: ' + err.message); }
  }
  toast('Photos added ✨');
}
async function uploadPhoto(file) {
  let src; try { src = await createImageBitmap(file); } catch { src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Unreadable image')); im.src = URL.createObjectURL(file); }); }
  const w = src.width, h = src.height, sc = Math.min(1, 1600 / Math.max(w, h)); const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  const res = await fetch(`/api/upload/${S.room}?kind=photo`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob }); const j = await res.json(); if (!res.ok) throw new Error(j.error || 'failed'); return j.url;
}

/* ================= settings ================= */
$('#b-set').onclick = () => { const p = $('#settings'); p.hidden = !p.hidden; $('#editor').hidden = true; if (!p.hidden) { $('#s-title').value = S.rs.title; $('#s-msg').value = S.rs.message; $('#s-from').value = S.rs.from; $('#s-code').textContent = `Museum code: ${S.room}`; } };
$('#st-close').onclick = () => ($('#settings').hidden = true);
$('#s-save').onclick = () => { send({ t: 'meta', title: $('#s-title').value, message: $('#s-msg').value, from: $('#s-from').value }); toast('Dedication saved'); };
$('#s-look').onclick = () => { $('#settings').hidden = true; enterCustom(true); };
$('#s-names').onchange = (e) => (labels.style.display = e.target.checked ? '' : 'none');
$('#b-share').onclick = async () => { const url = `${location.origin}/?room=${S.room}`; try { if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ title: 'Our Museum', url }); else { await navigator.clipboard.writeText(url); toast('Invite link copied — send it to someone special'); } } catch { prompt('Copy this invite link', url); } };
$('#b-fs').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
let ambient = false; $('#b-music').onclick = () => { ambient = !ambient; $('#b-music').textContent = ambient ? '🔊' : '🔈'; if (ambient) film.music.start(0.16); else film.music.stop(); };

/* ================= film / cinema ================= */
const film = new Film(world.screenCanvas, () => { world.screenTex.needsUpdate = true; });
let vid = null, vtex = null, recording = false;
const showCanvas = () => { world.screen.material.map = world.screenTex; world.screen.material.needsUpdate = true; };
async function startFilm() {
  if (S.rs.video) {
    if (!vid) { vid = document.createElement('video'); vid.crossOrigin = 'anonymous'; vid.playsInline = true; vid.onended = () => { $('#f-status').textContent = ''; }; }
    vid.src = S.rs.video; vtex = new THREE.VideoTexture(vid); vtex.colorSpace = THREE.SRGBColorSpace; world.screen.material.map = vtex; world.screen.material.needsUpdate = true;
    vid.play().catch(() => toast('Tap “Play film” to start the video')); return;
  }
  const items = world.frameData.filter((d) => d.photo).map((d) => ({ url: d.photo, caption: d.caption }));
  if (!items.length) { toast('Add some photos to frames first 🖼️'); return; }
  $('#f-status').textContent = 'Preparing film…'; await film.load(items, S.rs.title, S.rs.message, S.rs.from); showCanvas(); film.onEnd = () => { $('#f-status').textContent = ''; if (!ambient) film.music.stop(); else film.music.setLevel(0.16); };
  film.play(0, true);
}
function stopFilm() { film.stop(); if (!ambient) film.music.stop(); if (vid) vid.pause(); $('#f-status').textContent = ''; }
$('#f-play').onclick = () => { if (recording) return; send({ t: 'film', on: true }); };
$('#f-stop').onclick = () => send({ t: 'film', on: false });
$('#f-slides').onclick = () => { send({ t: 'video', url: null }); showCanvas(); $('#f-slides').hidden = true; toast('Back to the photo film'); };
$('#f-video').onclick = () => $('#f-file').click();
$('#f-file').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return; $('#f-status').textContent = 'Uploading video…';
  try { const res = await fetch(`/api/upload/${S.room}?kind=video`, { method: 'POST', headers: { 'content-type': f.type || 'video/mp4' }, body: f }); const j = await res.json(); if (!res.ok) throw new Error(j.error); S.rs.video = j.url; send({ t: 'video', url: j.url }); $('#f-slides').hidden = false; $('#f-status').textContent = ''; toast('Video ready — press Play film'); } catch (err) { $('#f-status').textContent = ''; toast('Video upload failed: ' + err.message); }
};
$('#f-save').onclick = async () => {
  const items = world.frameData.filter((d) => d.photo).map((d) => ({ url: d.photo, caption: d.caption })); if (!items.length) return toast('Add some photos first 🖼️');
  recording = true; await film.load(items, S.rs.title, S.rs.message, S.rs.from); showCanvas();
  const timer = setInterval(() => { $('#f-status').textContent = `Recording ${Math.round((performance.now() - film.t0) / 1000)}s / ${Math.round(film.duration)}s…`; }, 500);
  try { const blob = await film.record(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `our-film-${S.room}.webm`; a.click(); toast('Your film was saved 🎬'); } catch (e) { toast(e.message || 'Recording failed'); }
  clearInterval(timer); recording = false; $('#f-status').textContent = '';
};

/* ================= presence ================= */
function refreshPresence() { const all = [{ color: S.color }, ...[...others.values()]]; $('#pdots').innerHTML = all.map((p) => `<i style="background:${p.color}"></i>`).join(''); $('#pcount').textContent = `${all.length} here`; }

/* ================= landing / lobby flow ================= */
const lerr = $('#landing-err');
document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b)); $('#tab-create').hidden = b.dataset.tab !== 'create'; $('#tab-join').hidden = b.dataset.tab !== 'join'; lerr.textContent = ''; }));
const recent = store.get('om_recent', []); $('#recent').innerHTML = recent.length ? '<label>Recent</label>' + recent.map((r) => `<button data-c="${r.id}">${esc(r.title)} · ${r.id}</button>`).join('') : '';
$('#recent').onclick = (e) => { const b = e.target.closest('button'); if (b) { $('#j-code').value = b.dataset.c; $('#btn-join').click(); } };
$('#btn-create').onclick = async () => {
  lerr.textContent = ''; const b = $('#btn-create'); b.disabled = true;
  try { const r = await fetch('/api/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: $('#c-title').value, message: $('#c-msg').value, from: $('#c-from').value }) }); const j = await r.json(); await openRoom(j.id); } catch (e) { lerr.textContent = e.message; } b.disabled = false;
};
$('#btn-join').onclick = async () => { lerr.textContent = ''; try { await openRoom($('#j-code').value.trim().toUpperCase()); } catch (e) { lerr.textContent = e.message; } };
async function openRoom(id) {
  const r = await fetch(`/api/room/${id}`); if (!r.ok) throw new Error('Museum not found — check the code');
  const j = await r.json(); S.room = id; S.rs = j.state; history.replaceState(null, '', `?room=${id}`);
  const list = [{ id, title: j.state.title }, ...recent.filter((x) => x.id !== id)].slice(0, 4); store.set('om_recent', list);
  world.setPlaque(j.state.title, j.state.message, j.state.from); applyFrames(j.state);
  $('#room-title').textContent = `${j.state.title} · ${id}`; enterCustom(false);
}
function applyFrames(st) { (st.frames || []).forEach((f) => { const d = { ...world.defaultFor(f.slot), ...f }; world.frameData[f.slot] = d; world.setFrame(f.slot, d); }); }
const LOOK_TABS = () => [['skin', 'Skin', Object.keys(SKINS)], ['hair', 'Hair', HAIRS], ['hairStyle', 'Style', ['short', 'long', 'bun']], ['shirt', 'Top', OUTFITS], ...(S.look.char === 'kai' ? [['vest', 'Waistcoat', ['#8c836f', '#3a3a40', '#2f4a3a', '#6b2f3a', '#c9bfa8']]] : []), ['pants', 'Trousers', PANTS], ['shoes', 'Shoes', SHOES]];
let lookTab = 'skin', inGame = false;
function renderLook() {
  const tabs = LOOK_TABS(); if (!tabs.find((t) => t[0] === lookTab)) lookTab = 'skin';
  $('#look-tabs').innerHTML = tabs.map(([k, l]) => `<button data-k="${k}" class="${k === lookTab ? 'on' : ''}">${l}</button>`).join('');
  const [k, , opts] = tabs.find((t) => t[0] === lookTab);
  $('#swatches').innerHTML = opts.map((o) => k === 'hairStyle' ? `<button class="ghost ${S.look[k] === o ? 'on' : ''}" data-v="${o}" style="${S.look[k] === o ? 'background:#2a2420;color:#fff' : ''}">${o}</button>` : `<button class="sw ${(S.look[k] === o) ? 'on' : ''}" data-v="${o}" style="background:${k === 'skin' ? SKINS[o] : o}"></button>`).join('');
  document.querySelectorAll('#seg-char button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.look.char)); document.querySelectorAll('#seg-height button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.look.height));
}
$('#look-tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { lookTab = b.dataset.k; renderLook(); } };
$('#swatches').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.look[lookTab] = b.dataset.v; me.avatar.setLook(S.look); renderLook(); };
$('#seg-char').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.look = { ...DEFAULTS[b.dataset.v], skin: S.look.skin, height: S.look.height }; me.avatar.setLook(S.look); renderLook(); };
$('#seg-height').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.look.height = b.dataset.v; me.avatar.setLook(S.look); renderLook(); };
function enterCustom(fromGame) {
  S.mode = 'custom'; inGame = fromGame; $('#landing').hidden = true; $('#custom').hidden = false; $('#choose').hidden = false; $('#hud').hidden = true; $('#film').hidden = true;
  me.avatar.setLook(S.look); me.avatar.group.visible = true; me.avatar.group.position.set(0, 0, 14.2); me.yaw = 0.2; me.avatar.group.rotation.y = me.yaw; $('#my-name').value = S.name; $('#btn-enter').textContent = fromGame ? 'Save look' : 'Enter'; $('#btn-back').hidden = fromGame; renderLook();
  if (fromGame) { me.pos.set(me.pos.x, 0, me.pos.z); }
}
$('#btn-back').onclick = () => { S.mode = 'landing'; $('#custom').hidden = true; $('#choose').hidden = true; $('#landing').hidden = false; me.avatar.group.visible = false; };
$('#btn-enter').onclick = async () => {
  const err = $('#custom-err'); err.textContent = ''; S.name = $('#my-name').value.trim() || 'Guest'; store.set('om_name', S.name); store.set('om_look', S.look);
  if (inGame) { // just apply new look (reconnect-free): tell others by rejoining is overkill; update locally + notify via chat
    S.mode = 'play'; $('#custom').hidden = true; $('#choose').hidden = true; $('#hud').hidden = false; send({ t: 'chat', text: '✨ changed outfit (others see it next visit)' }); return;
  }
  const b = $('#btn-enter'); b.disabled = true;
  try {
    const w = await connect(); S.id = w.id; me.id = w.id; S.color = w.color; S.rs = w.state; applyFrames(w.state); world.setPlaque(w.state.title, w.state.message, w.state.from);
    w.players.forEach(addRemote); me.pos.set(((others.size % 4) - 1.5) * 1.4, 0, 20); me.y = 0; me.yaw = Math.PI; cam.yaw = 0; cam.pos.set(me.pos.x, 4, 25); cam.look.set(me.pos.x, 1.5, me.pos.z);
    S.mode = 'play'; $('#custom').hidden = true; $('#choose').hidden = true; $('#hud').hidden = false; refreshPresence(); log(`Welcome to “${w.state.title}” — share code ${S.room} with someone special`, true);
    if (w.state.video) $('#f-slides').hidden = false; film.music.init();
  } catch (e) { err.textContent = e.message; }
  b.disabled = false;
};

/* ================= main loop ================= */
let last = performance.now(), tAcc = 0, ctxT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; tAcc += dt;
  if (S.mode === 'play') {
    stepMe(dt); place(me, dt); others.forEach((o) => { stepRemote(o, dt); place(o, dt); });
    const z = world.zoneAt(me.pos.x, me.pos.z);
    if (z !== zone) { zone = z; }
    if (zone !== zoneShown) { zoneShown = zone; const zt = $('#zone'); zt.textContent = ZNAME[zone]; zt.classList.add('on'); setTimeout(() => zt.classList.remove('on'), 2600); $('#film').hidden = zone !== 'cinema'; if (zone === 'cinema' && !film.scenes.length) {} }
    ctxT -= dt; if (ctxT <= 0) { ctxT = 0.12; updateContext(); }
    others.forEach((o) => { const p = screenOf(o); o.tag.style.display = p.vis ? '' : 'none'; o.tag.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`; });
  } else if (S.mode === 'custom') { me.avatar.update(dt, 0, 0); me.yaw += 0.0; me.avatar.group.rotation.y = damp(me.avatar.group.rotation.y, me.yaw, 12, dt); me.avatar.group.position.y = 0; }
  for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i], u = h.userData; u.life += dt; h.position.y += u.vy * dt; h.position.x += u.vx * dt; const k = u.life / u.max; h.material.opacity = Math.max(0, 1 - k * k); h.scale.multiplyScalar(1 + dt * 0.25); if (u.life > u.max) { scene.remove(h); h.material.dispose(); hearts.splice(i, 1); } }
  world.update(dt, tAcc, me.pos); stepLights(dt); stepCamera(dt, tAcc); film.tick(now);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* ================= boot ================= */
const q = new URLSearchParams(location.search).get('room');
if (q) openRoom(q.toUpperCase()).catch(() => { history.replaceState(null, '', '/'); });
window.__om = { S, me, world, others, cam, film }; // handy for debugging in the console
