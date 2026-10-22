// Our Museum - server: static files, room persistence, photo/video upload, WebSocket relay
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
const MAX_PLAYERS = 4;
const MAX_FRAMES = 45;
if (!process.env.SUPABASE_URL) fs.mkdirSync(DATA, { recursive: true });

const app = express();
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(DATA, { maxAge: '7d' }));

const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const rid = (s) => /^[A-Z0-9]{6}$/.test(s || '');
const roomDir = (id) => path.join(DATA, id);
const roomFile = (id) => path.join(roomDir(id), 'room.json');

// ---- storage: local disk by default, Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_KEY are set (persistent) ----
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'museum';
const REMOTE = !!(SB_URL && SB_KEY);
const sbH = (extra = {}) => ({ Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, ...extra });
const store = {
  async put(rel, buf, type) { // returns public URL
    if (!REMOTE) { fs.mkdirSync(path.dirname(path.join(DATA, rel)), { recursive: true }); fs.writeFileSync(path.join(DATA, rel), buf); return `/data/${rel}`; }
    const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${rel}`, { method: 'POST', headers: sbH({ 'Content-Type': type, 'x-upsert': 'true' }), body: buf });
    if (!r.ok) throw new Error('storage: ' + (await r.text()));
    return `${SB_URL}/storage/v1/object/public/${BUCKET}/${rel}`;
  },
  async getJSON(rel) {
    if (!REMOTE) { try { return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8')); } catch { return null; } }
    const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${rel}`, { headers: sbH() });
    return r.ok ? r.json() : null;
  },
};
if (REMOTE) fetch(`${SB_URL}/storage/v1/bucket`, { method: 'POST', headers: sbH({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }) })
  .then(async (r) => console.log('Supabase bucket:', r.ok ? 'created' : (await r.text()).slice(0, 80))).catch((e) => console.log('Supabase unreachable', e.message));
console.log('Storage:', REMOTE ? 'Supabase (persistent)' : 'local disk ./data (NOT persistent on most free hosts)');

const rooms = new Map(); // id -> { state, clients:Set }

function defaultState(id, opts = {}) {
  return {
    id,
    title: opts.title || 'For You',
    message: opts.message || 'Our best days, framed.',
    from: opts.from || '',
    frames: [], // {id, slot, photo, style, size, deco, caption}
    video: null,
    centerpiece: null,
    created: Date.now(),
  };
}
async function load(id) {
  if (rooms.has(id)) return rooms.get(id);
  const state = await store.getJSON(`${id}/room.json`);
  if (!state) return null;
  if (rooms.has(id)) return rooms.get(id);
  const r = { state, clients: new Set() };
  rooms.set(id, r);
  return r;
}
const saveTimers = {};
function save(id) {
  clearTimeout(saveTimers[id]);
  saveTimers[id] = setTimeout(() => {
    const r = rooms.get(id); if (!r) return;
    store.put(`${id}/room.json`, Buffer.from(JSON.stringify(r.state)), 'application/json').catch((e) => console.error('save failed', e.message));
  }, 300);
}

app.post('/api/create', express.json(), async (req, res) => {
  try {
    const id = code();
    const state = defaultState(id, req.body || {});
    await store.put(`${id}/room.json`, Buffer.from(JSON.stringify(state)), 'application/json');
    rooms.set(id, { state, clients: new Set() });
    res.json({ id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not create museum' }); }
});
app.get('/api/room/:id', async (req, res) => {
  const id = (req.params.id || '').toUpperCase();
  const r = rid(id) && await load(id);
  if (!r) return res.status(404).json({ error: 'Museum not found' });
  res.json({ state: r.state, online: r.clients.size });
});

// Uploads: raw binary body, ?kind=photo|video
app.post('/api/upload/:id', async (req, res) => {
  const id = (req.params.id || '').toUpperCase();
  const r = rid(id) && await load(id);
  if (!r) return res.status(404).json({ error: 'Museum not found' });
  const kind = req.query.kind === 'video' ? 'video' : 'photo';
  const ct = String(req.headers['content-type'] || '');
  const ext = kind === 'video' ? (ct.includes('webm') ? 'webm' : 'mp4') : (ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg');
  const limit = kind === 'video' ? (REMOTE ? 48e6 : 80e6) : 8e6; // Supabase free plan caps files at 50 MB
  const chunks = []; let size = 0, dead = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) { dead = true; res.status(413).json({ error: `File too large (max ${Math.round(limit / 1e6)} MB)` }); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', async () => {
    if (dead) return;
    try {
      const name = `${kind}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
      const url = await store.put(`${id}/${name}`, Buffer.concat(chunks), ct || (kind === 'video' ? 'video/mp4' : 'image/jpeg'));
      res.json({ url });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Upload failed' }); }
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1e6 });
const COLORS = ['#ff7a59', '#ffd23f', '#5bc0eb', '#9bc53d'];

function broadcast(room, msg, except) {
  const s = JSON.stringify(msg);
  for (const c of room.clients) if (c !== except && c.readyState === 1) c.send(s);
}
const clean = (s, n) => String(s == null ? '' : s).slice(0, n);

wss.on('connection', (ws) => {
  let room = null;
  ws.pid = crypto.randomBytes(3).toString('hex');
  ws.on('message', async (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      const id = clean(m.room, 6).toUpperCase();
      const r = rid(id) && await load(id);
      if (!r) return ws.send(JSON.stringify({ t: 'error', msg: 'Museum not found' }));
      if (r.clients.size >= MAX_PLAYERS) return ws.send(JSON.stringify({ t: 'error', msg: 'Museum is full (4 max)' }));
      room = r;
      const used = new Set([...r.clients].map((c) => c.color));
      ws.color = COLORS.find((c) => !used.has(c)) || COLORS[0];
      ws.name = clean(m.name, 14) || 'Guest';
      ws.look = m.look || {};
      ws.pos = [0, 0, 18, 0];
      r.clients.add(ws);
      ws.send(JSON.stringify({
        t: 'welcome', id: ws.pid, color: ws.color, state: r.state,
        players: [...r.clients].filter((c) => c !== ws).map((c) => ({ id: c.pid, name: c.name, look: c.look, color: c.color, pos: c.pos })),
      }));
      broadcast(r, { t: 'join', p: { id: ws.pid, name: ws.name, look: ws.look, color: ws.color, pos: ws.pos } }, ws);
      return;
    }
    if (!room) return;
    const st = room.state;
    switch (m.t) {
      case 'pos': // [x,z,yaw,speed]
        if (Array.isArray(m.p)) { ws.pos = m.p.slice(0, 5).map(Number); broadcast(room, { t: 'pos', id: ws.pid, p: ws.pos, a: m.a }, ws); }
        break;
      case 'chat': broadcast(room, { t: 'chat', id: ws.pid, name: ws.name, color: ws.color, text: clean(m.text, 300) }); break;
      case 'emoji': broadcast(room, { t: 'emoji', id: ws.pid, e: clean(m.e, 8) }); break;
      case 'act': // hug / kiss between two players
        broadcast(room, { t: 'act', from: ws.pid, to: clean(m.to, 8), kind: m.kind === 'kiss' ? 'kiss' : 'hug' });
        break;
      case 'frame': { // upsert frame
        const f = m.frame || {};
        const slot = parseInt(f.slot, 10);
        if (!(slot >= 0 && slot < MAX_FRAMES)) break;
        let cur = st.frames.find((x) => x.slot === slot);
        if (!cur) { cur = { id: crypto.randomBytes(3).toString('hex'), slot }; st.frames.push(cur); }
        cur.photo = f.photo ? clean(f.photo, 200) : null;
        cur.style = clean(f.style || 'classic', 16);
        cur.size = clean(f.size || 'm', 4);
        cur.deco = clean(f.deco || 'none', 16);
        cur.caption = clean(f.caption, 80);
        save(st.id);
        broadcast(room, { t: 'frame', frame: cur });
        break;
      }
      case 'unframe': {
        const slot = parseInt(m.slot, 10);
        const i = st.frames.findIndex((x) => x.slot === slot);
        if (i >= 0) { st.frames.splice(i, 1); save(st.id); }
        broadcast(room, { t: 'unframe', slot });
        break;
      }
      case 'meta':
        st.title = clean(m.title, 40) || st.title;
        st.message = clean(m.message, 160);
        st.from = clean(m.from, 30);
        save(st.id);
        broadcast(room, { t: 'meta', title: st.title, message: st.message, from: st.from });
        break;
      case 'video':
        st.video = m.url ? clean(m.url, 200) : null; save(st.id);
        broadcast(room, { t: 'video', url: st.video });
        break;
      case 'film': // synchronised film start/stop
        broadcast(room, { t: 'film', on: !!m.on, at: Date.now() });
        break;
    }
  });
  ws.on('close', () => {
    if (!room) return;
    room.clients.delete(ws);
    broadcast(room, { t: 'leave', id: ws.pid });
  });
});

server.listen(PORT, () => console.log(`Our Museum running → http://localhost:${PORT}`));
