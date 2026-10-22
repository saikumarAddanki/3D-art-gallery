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
fs.mkdirSync(DATA, { recursive: true });

const app = express();
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(DATA, { maxAge: '7d' }));

const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const rid = (s) => /^[A-Z0-9]{6}$/.test(s || '');
const roomDir = (id) => path.join(DATA, id);
const roomFile = (id) => path.join(roomDir(id), 'room.json');

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
function load(id) {
  if (rooms.has(id)) return rooms.get(id);
  let state = null;
  try { state = JSON.parse(fs.readFileSync(roomFile(id), 'utf8')); } catch {}
  if (!state) return null;
  const r = { state, clients: new Set() };
  rooms.set(id, r);
  return r;
}
let saveTimers = {};
function save(id) {
  clearTimeout(saveTimers[id]);
  saveTimers[id] = setTimeout(() => {
    const r = rooms.get(id);
    if (!r) return;
    fs.mkdirSync(roomDir(id), { recursive: true });
    fs.writeFileSync(roomFile(id), JSON.stringify(r.state));
  }, 300);
}

app.post('/api/create', express.json(), (req, res) => {
  let id; do { id = code(); } while (fs.existsSync(roomDir(id)));
  fs.mkdirSync(roomDir(id), { recursive: true });
  const state = defaultState(id, req.body || {});
  rooms.set(id, { state, clients: new Set() });
  fs.writeFileSync(roomFile(id), JSON.stringify(state));
  res.json({ id });
});
app.get('/api/room/:id', (req, res) => {
  const id = (req.params.id || '').toUpperCase();
  const r = rid(id) && load(id);
  if (!r) return res.status(404).json({ error: 'Museum not found' });
  res.json({ state: r.state, online: r.clients.size });
});

// Uploads: raw binary body, ?kind=photo|video
app.post('/api/upload/:id', (req, res) => {
  const id = (req.params.id || '').toUpperCase();
  const r = rid(id) && load(id);
  if (!r) return res.status(404).json({ error: 'Museum not found' });
  const kind = req.query.kind === 'video' ? 'video' : 'photo';
  const ct = String(req.headers['content-type'] || '');
  const ext = kind === 'video' ? (ct.includes('webm') ? 'webm' : 'mp4') : (ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg');
  const limit = kind === 'video' ? 80e6 : 8e6;
  const chunks = []; let size = 0, dead = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) { dead = true; res.status(413).json({ error: 'File too large' }); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (dead) return;
    fs.mkdirSync(roomDir(id), { recursive: true });
    const name = `${kind}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(roomDir(id), name), Buffer.concat(chunks));
    res.json({ url: `/data/${id}/${name}` });
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
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      const id = clean(m.room, 6).toUpperCase();
      const r = rid(id) && load(id);
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
