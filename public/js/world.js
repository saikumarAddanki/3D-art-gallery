// World: colourful garden, museum building, gallery with frame slots, cinema hall, collisions.
import * as THREE from 'three';

export const SIZES = { s: [0.9, 0.9], p: [1.2, 1.6], sq: [1.5, 1.5], l: [2.0, 1.4], w: [2.8, 1.5], t: [1.2, 2.2], g: [1.9, 2.4] };
export const STYLES = ['classic', 'print', 'gold', 'wood', 'white', 'polaroid', 'neon'];
export const DECOS = ['none', 'lights', 'flowers', 'hearts', 'ribbon', 'vines'];
export const GALLERY = { x0: -12, x1: 12, z0: -26, z1: 8, h: 5.2 };
export const CINEMA = { x0: -10, x1: 10, z0: -50, z1: -26.8, h: 5.6 };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const std = (c, r = 0.8, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  return t;
}

export function buildWorld(scene) {
  const W = { colliders: [], slots: [], frames: new Map(), updaters: [], bulbMats: [], doors: [] };
  const root = new THREE.Group(); scene.add(root);
  const box = (x0, x1, y0, y1, z0, z1, mat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); root.add(m);
    if (collide) W.colliders.push({ x0, x1, z0, z1 });
    return m;
  };

  /* ---------- lights ---------- */
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4); sun.position.set(30, 60, 40); scene.add(sun);
  const hemi = new THREE.HemisphereLight('#bfe3ff', '#8fbf7a', 1.1); scene.add(hemi);
  W.lights = { sun, hemi, points: [] };
  const lampPos = [[-8, 4.6, 2], [8, 4.6, 2], [-8, 4.6, -12], [8, 4.6, -12], [0, 4.6, -4], [-6, 4.6, -22], [6, 4.6, -22]];
  lampPos.forEach((p) => { const l = new THREE.PointLight('#fff0dc', 0, 0, 2); l.position.set(...p); scene.add(l); W.lights.points.push(l); });
  const cineLight = new THREE.PointLight('#8fb4ff', 0, 0, 2); cineLight.position.set(0, 3.5, -46); scene.add(cineLight); W.lights.cinema = cineLight;

  /* ---------- sky ---------- */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#5aa9ee') }, mid: { value: new THREE.Color('#bfe5ff') }, bot: { value: new THREE.Color('#fff3df') }, dim: { value: 1 } },
    vertexShader: 'varying vec3 p; void main(){ p=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 p; uniform vec3 top,mid,bot; uniform float dim; void main(){ float h=clamp(p.y,0.,1.); vec3 c=mix(bot,mid,smoothstep(0.,.25,h)); c=mix(c,top,smoothstep(.2,.9,h)); gl_FragColor=vec4(c*dim,1.); }',
  }));
  scene.add(sky); W.sky = sky;
  const cloudTex = canvasTex(128, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  W.clouds = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    s.scale.set(rnd(60, 110), rnd(18, 34), 1); s.position.set(rnd(-250, 250), rnd(70, 130), rnd(-250, 150)); scene.add(s); W.clouds.push(s);
  }

  /* ---------- garden ground ---------- */
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6cbf4d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `hsla(${rnd(85, 125)},${rnd(45, 65)}%,${rnd(32, 55)}%,.55)`; g.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(2, 6)); }
  }, { repeat: [60, 60] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; root.add(ground);
  const pathTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9cdb6'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = `hsl(${rnd(30, 42)},${rnd(25, 38)}%,${rnd(70, 82)}%)`; g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58); }
  }, { repeat: [1, 14] });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 40), new THREE.MeshStandardMaterial({ map: pathTex, roughness: 0.9 }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, 28); root.add(path);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ map: pathTex.clone(), roughness: 0.9 }));
  plaza.material.map.repeat.set(4, 4); plaza.material.map.needsUpdate = true;
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.025, 28); root.add(plaza);

  /* ---------- flowers (instanced) ---------- */
  const FL = 900; const palette = ['#ff5d8f', '#ffb703', '#fb6f92', '#9b5de5', '#f15bb5', '#00bbf9', '#ff7b00', '#ffffff', '#ef233c', '#ffd6a5'];
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 1), std('#fff', 0.6), FL);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), std('#3d9a3f', 0.9), FL);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), std('#3f9d46', 0.9), FL);
  const d = new THREE.Object3D(); const col = new THREE.Color();
  for (let i = 0; i < FL; i++) {
    let x, z, ok = false;
    while (!ok) { x = rnd(-34, 34); z = rnd(10.5, 56); ok = Math.abs(x) > 2.9 && Math.hypot(x, z - 28) > 10.5 && !(Math.abs(x) < 12.5 && z < 12); }
    const h = rnd(0.25, 0.6);
    d.position.set(x, h / 2, z); d.scale.set(1, h, 1); d.rotation.set(0, 0, 0); d.updateMatrix(); stems.setMatrixAt(i, d.matrix);
    d.position.set(x, h, z); d.scale.setScalar(rnd(0.7, 1.4)); d.updateMatrix(); heads.setMatrixAt(i, d.matrix); heads.setColorAt(i, col.set(pick(palette)));
    d.position.set(x, 0.07, z); d.scale.set(1.2, 0.5, 1.2); d.updateMatrix(); leaves.setMatrixAt(i, d.matrix);
  }
  root.add(stems, heads, leaves);

  /* ---------- trees ---------- */
  const trunkMat = std('#7b5233', 1);
  const mkTree = (x, z, s, kind) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 3, 8), trunkMat); t.position.y = 1.5; g.add(t);
    const cols = kind === 'blossom' ? ['#ffb7d0', '#ff9fc0', '#ffc9dd'] : kind === 'gold' ? ['#f5c542', '#ee9b1d', '#ffd966'] : ['#3f9a4a', '#4fb55a', '#2f8040'];
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(1.2, 1.9), 1), std(pick(cols), 0.85)); f.position.set(rnd(-1, 1), rnd(3, 4.6), rnd(-1, 1)); g.add(f); }
    root.add(g); W.colliders.push({ x0: x - 0.4 * s, x1: x + 0.4 * s, z0: z - 0.4 * s, z1: z + 0.4 * s });
  };
  const treeSpots = [[-16, 14, 'blossom'], [16, 14, 'blossom'], [-22, 24, 'green'], [22, 25, 'gold'], [-26, 38, 'blossom'], [25, 40, 'green'], [-14, 46, 'gold'], [15, 50, 'blossom'], [-32, 14, 'green'], [32, 18, 'blossom'], [-6, 56, 'green'], [8, 58, 'gold'], [-30, 54, 'blossom'], [30, 52, 'green']];
  treeSpots.forEach(([x, z, k]) => mkTree(x, z, rnd(1.0, 1.4), k));

  /* ---------- hedges / topiary / fence ---------- */
  const hedgeMat = std('#2f8a3e', 0.95);
  const hedge = (x0, x1, z0, z1) => { box(x0, x1, 0, 0.9, z0, z1, hedgeMat); for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), std(pick(['#ff6fa5', '#ffd166', '#ff8fab']), 0.7)); m.position.set(rnd(x0, x1), rnd(0.55, 0.95), rnd(z0, z1)); root.add(m); } };
  hedge(-40, -3.4, 57.5, 59); hedge(3.4, 40, 57.5, 59); hedge(-40, -38.5, 10, 59); hedge(38.5, 40, 10, 59);
  hedge(-6.2, -3.4, 12, 12.8); hedge(3.4, 6.2, 12, 12.8);
  [[-3.2, 13], [3.2, 13], [-3.2, 36], [3.2, 36]].forEach(([x, z]) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), std('#2d8f45', 0.9)); s.position.set(x, 1.3, z); root.add(s); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 12), std('#d8c9b0', 0.8)); p.position.set(x, 0.3, z); root.add(p); });

  /* ---------- rose arch ---------- */
  const arch = new THREE.Group(); arch.position.set(0, 0, 17);
  [-2.7, 2.7].forEach((x) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8), std('#f4efe6', 0.6)); p.position.set(x, 1.6, 0); arch.add(p); });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.09, 8, 36, Math.PI), std('#f4efe6', 0.6)); torus.position.y = 3.2; arch.add(torus);
  for (let i = 0; i < 70; i++) { const a = Math.PI * Math.random(); const isRose = Math.random() > 0.4; const m = new THREE.Mesh(isRose ? new THREE.IcosahedronGeometry(rnd(0.08, 0.15), 1) : new THREE.SphereGeometry(rnd(0.1, 0.2), 6, 5), std(isRose ? pick(['#ff4d6d', '#ff85a1', '#ffd166', '#ffffff']) : '#3a9a45', 0.8)); m.position.set(Math.cos(a) * 2.7 + rnd(-0.15, 0.15), 3.2 + Math.sin(a) * 2.7 + rnd(-0.15, 0.15), rnd(-0.15, 0.15)); arch.add(m); }
  for (let i = 0; i < 40; i++) { const sx = i % 2 ? 2.7 : -2.7; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.08, 0.16), 1), std(Math.random() > 0.5 ? '#3a9a45' : pick(['#ff4d6d', '#ff85a1', '#fff']), 0.8)); m.position.set(sx + rnd(-0.15, 0.15), rnd(0.2, 3.1), rnd(-0.15, 0.15)); arch.add(m); }
  root.add(arch);

  /* ---------- fountain ---------- */
  const fo = new THREE.Group(); fo.position.set(0, 0, 28);
  const stone = std('#e7dfd0', 0.7);
  { const m = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.7, 40), stone); m.position.set(0, 0.35, 0); fo.add(m); }
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.05, 40), new THREE.MeshStandardMaterial({ color: '#59c3f0', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 })); water.position.y = 0.62; fo.add(water);
  { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 16), stone); m.position.set(0, 1.2, 0); fo.add(m); }
  { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.5, 0.25, 24), stone); m.position.set(0, 2.0, 0); fo.add(m); }
  const dropN = 160; const dg = new THREE.BufferGeometry(); const dpos = new Float32Array(dropN * 3); const dvel = [];
  for (let i = 0; i < dropN; i++) dvel.push({ a: Math.random() * 6.28, v: rnd(2.6, 4.2), r: rnd(0.2, 1.6), t: Math.random() * 2 });
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const drops = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#c8f0ff', size: 0.09, transparent: true, opacity: 0.9 })); drops.frustumCulled = false; fo.add(drops);
  root.add(fo); W.colliders.push({ x0: -3.2, x1: 3.2, z0: 24.8, z1: 31.2 });
  W.updaters.push((dt, t) => {
    for (let i = 0; i < dropN; i++) { const q = dvel[i]; q.t = (q.t + dt) % 1.6; const tt = q.t; const r = q.r * (tt / 1.6) * 1.6; dpos[i * 3] = Math.cos(q.a) * r; dpos[i * 3 + 1] = 2.15 + q.v * tt - 4.9 * tt * tt; dpos[i * 3 + 2] = Math.sin(q.a) * r; if (dpos[i * 3 + 1] < 0.65) dpos[i * 3 + 1] = 0.65; }
    dg.attributes.position.needsUpdate = true;
  });

  /* ---------- lanterns & benches ---------- */
  const lanternMat = std('#fff3c4', 0.3, 0, { emissive: '#ffcf6b', emissiveIntensity: 1.2 });
  for (let z = 14; z < 50; z += 6) [-3.4, 3.4].forEach((x) => { if (Math.hypot(x, z - 28) < 10) return; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), std('#3b3b42', 0.5, 0.6)); p.position.set(x, 1.1, z); root.add(p); const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), lanternMat); l.position.set(x, 2.3, z); root.add(l); });
  [[-6.5, 20, Math.PI / 2], [6.5, 20, -Math.PI / 2], [-6.5, 36, Math.PI / 2], [6.5, 36, -Math.PI / 2]].forEach(([x, z, r]) => { const b = bench(); b.position.set(x, 0, z); b.rotation.y = r; root.add(b); W.colliders.push({ x0: x - 0.5, x1: x + 0.5, z0: z - 1, z1: z + 1 }); });
  function bench(len = 2) { const g = new THREE.Group(); const wood = std('#9a6b43', 0.8), dark = std('#2b2b30', 0.5, 0.5); const seat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.5), wood); seat.position.y = 0.46; g.add(seat); const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 0.06), wood); back.position.set(0, 0.8, -0.23); back.rotation.x = -0.12; g.add(back); [-1, 1].forEach((s) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.5), dark); l.position.set(s * (len / 2 - 0.1), 0.23, 0); g.add(l); }); return g; }

  /* ---------- butterflies & petals ---------- */
  const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.22, 0.12, 0.05, 0.2, -0.14, 0.02]), 3)); wingGeo.computeVertexNormals();
  const flies = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group(); const c = std(pick(['#ff9ecb', '#ffd166', '#8ecae6', '#c77dff', '#ff7b54']), 0.6, 0, { side: THREE.DoubleSide });
    const a = new THREE.Mesh(wingGeo, c), b = new THREE.Mesh(wingGeo, c); b.scale.x = -1; g.add(a, b);
    g.userData = { cx: rnd(-22, 22), cz: rnd(14, 52), ph: Math.random() * 9, sp: rnd(0.3, 0.7), r: rnd(2, 6), a, b }; root.add(g); flies.push(g);
  }
  const petalN = 260, pgeo = new THREE.BufferGeometry(), ppos = new Float32Array(petalN * 3), pph = [];
  for (let i = 0; i < petalN; i++) { ppos[i * 3] = rnd(-35, 35); ppos[i * 3 + 1] = rnd(0, 14); ppos[i * 3 + 2] = rnd(8, 58); pph.push(Math.random() * 6); }
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  const petals = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: '#ffb6cf', size: 0.14, transparent: true, opacity: 0.9, depthWrite: false })); petals.frustumCulled = false; root.add(petals);
  W.updaters.push((dt, t) => {
    flies.forEach((f) => { const u = f.userData; const a = t * u.sp + u.ph; f.position.set(u.cx + Math.cos(a) * u.r, 1.2 + Math.sin(a * 1.7) * 0.5 + 0.4, u.cz + Math.sin(a * 0.8) * u.r); f.rotation.y = -a + Math.PI; const fl = Math.sin(t * 16 + u.ph) * 0.9; u.a.rotation.z = fl; u.b.rotation.z = -fl; });
    for (let i = 0; i < petalN; i++) { ppos[i * 3 + 1] -= dt * 0.55; ppos[i * 3] += Math.sin(t * 0.7 + pph[i]) * dt * 0.5; if (ppos[i * 3 + 1] < 0) { ppos[i * 3 + 1] = 14; ppos[i * 3] = rnd(-35, 35); ppos[i * 3 + 2] = rnd(8, 58); } }
    pgeo.attributes.position.needsUpdate = true;
    W.clouds.forEach((c, i) => { c.position.x += dt * (0.6 + (i % 3) * 0.3); if (c.position.x > 280) c.position.x = -280; });
  });

  /* ---------- museum shell ---------- */
  const stoneMat = std('#e4dac8', 0.85), innerMat = std('#c9c6bd', 0.95), trim = std('#cfc3ad', 0.8), darkMat = std('#26262b', 0.9);
  const wall = (x0, x1, z0, z1, y0, y1, inner, collide = true) => {
    const mats = [0, 1, 2, 3, 4, 5].map(() => stoneMat); // +x -x +y -y +z -z
    if (inner) mats[{ px: 0, nx: 1, pz: 4, nz: 5 }[inner]] = innerMat;
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mats);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); root.add(m); if (collide) W.colliders.push({ x0, x1, z0, z1 }); return m;
  };
  const Hh = GALLERY.h;
  wall(-12.8, -12, -26.8, 8.8, 0, 6.6, 'px'); wall(12, 12.8, -26.8, 8.8, 0, 6.6, 'nx'); // sides
  wall(-12.8, -2, 8, 8.8, 0, 6.6, 'nz'); wall(2, 12.8, 8, 8.8, 0, 6.6, 'nz'); wall(-2, 2, 8, 8.8, 4.0, 6.6, 'nz', false); // front + lintel
  wall(-12.8, -2, -26.8, -26, 0, 6.6, 'pz'); wall(2, 12.8, -26.8, -26, 0, 6.6, 'pz'); wall(-2, 2, -26.8, -26, 4.0, 6.6, 'pz', false); // back (door to cinema)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(25.6, 0.5, 35.6), [stoneMat, stoneMat, trim, darkMat, stoneMat, stoneMat]); slab.position.set(0, Hh + 0.25, -9); root.add(slab);
  // parapet + cornice
  box(-13, 13, 6.6, 7.0, -27, 9.2, trim, false);
  // floor
  const floorTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#a8a294'; g.fillRect(0, 0, w, h); for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = `hsl(40,${rnd(8, 14)}%,${rnd(62, 68)}%)`; g.fillRect(x * 128 + 2, y * 128 + 2, 124, 124); } }, { repeat: [12, 17] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 34), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.05 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.01, -9); root.add(floor);
  // ceiling rails + spot fixtures
  const railMat = std('#101014', 0.5, 0.5), spotMat = std('#fff6d8', 0.4, 0, { emissive: '#ffe9b0', emissiveIntensity: 1.5 });
  for (let z = 4; z > -26; z -= 6) { const r = new THREE.Mesh(new THREE.BoxGeometry(24, 0.06, 0.08), railMat); r.position.set(0, Hh - 0.04, z); root.add(r); }
  for (let x = -9; x <= 9; x += 6) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 34), railMat); r.position.set(x, Hh - 0.04, -9); root.add(r); }
  // entrance facade: steps, columns, pediment, sign, doors
  box(-6, 6, 0, 0.18, 8.8, 12.2, trim, false); box(-5.4, 5.4, 0.18, 0.36, 8.8, 11.4, trim, false); box(-4.8, 4.8, 0.36, 0.54, 8.8, 10.6, trim, false);
  for (let i = 0; i < 6; i++) { const x = -4.2 + i * 1.68; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 6, 18), std('#f1ebdd', 0.7)); c.position.set(x, 3.54, 10.0); root.add(c); const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.9), trim); base.position.set(x, 0.64, 10.0); root.add(base); W.colliders.push({ x0: x - 0.34, x1: x + 0.34, z0: 9.66, z1: 10.34 }); }
  box(-5.2, 5.2, 6.5, 7.3, 8.8, 10.6, trim, false);
  const ped = new THREE.Shape(); ped.moveTo(-5.2, 0); ped.lineTo(5.2, 0); ped.lineTo(0, 1.9); ped.lineTo(-5.2, 0);
  const pm = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: 1.8, bevelEnabled: false }), stoneMat); pm.position.set(0, 7.3, 8.8); root.add(pm);
  const signTex = canvasTex(1024, 160, (g, w, h) => { g.fillStyle = '#efe7d6'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b2622'; g.font = '600 86px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Our Museum', w / 2, h / 2 + 4); g.strokeStyle = '#b79b62'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.94), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 })); sign.position.set(0, 6.9, 10.62); root.add(sign);
  const doorTex = canvasTex(256, 512, (g, w, h) => { g.fillStyle = '#7a4a2b'; g.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${rnd(40, 90)},${rnd(20, 40)},10,.12)`; g.fillRect(Math.random() * w, 0, rnd(1, 3), h); } g.strokeStyle = '#4e2e19'; g.lineWidth = 8; [[20, 20, w - 40, 210], [20, 250, w - 40, 242]].forEach((r) => g.strokeRect(...r)); });
  [-1, 1].forEach((s) => {
    const pivotG = new THREE.Group(); pivotG.position.set(s * 2, 0, 8.4); root.add(pivotG);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 0.14), new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.7 })); leaf.position.set(-s * 1, 2, 0); pivotG.add(leaf);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 20), std('#3a3a3d', 0.4, 0.8)); ring.position.set(-s * 1.75, 1.9, 0.1); pivotG.add(ring);
    W.doors.push({ pivot: pivotG, s });
  });
  const arc = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.14, 8, 30, Math.PI), trim); arc.position.set(0, 4.0, 8.4); root.add(arc);
  // side windows (decor)
  [-1, 1].forEach((s) => { for (let z = 2; z > -24; z -= 6) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), new THREE.MeshStandardMaterial({ color: '#ffe3a8', emissive: '#ffd27a', emissiveIntensity: 0.5 })); w.position.set(s * 12.82, 3.2, z); w.rotation.y = s * Math.PI / 2; root.add(w); } });

  /* ---------- centrepiece wall, plinth, plaque, benches, display case ---------- */
  const blackMat = std('#0d0d10', 0.9), white = std('#f2f0ea', 0.6);
  box(-4.2, 4.2, 0, 4.4, -12.4, -12.0, blackMat);
  box(-6, 6, 0, 0.3, -12, -6.4, white, false); // stage
  box(-1.9, 1.9, 0, 0.9, -9.3, -8.2, white);   // plaque block
  W.plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.75), new THREE.MeshBasicMaterial({ transparent: true }));
  W.plaque.position.set(0, 0.95, -8.2 + 0.02); W.plaque.rotation.x = -0.45; W.plaque.position.z = -8.19; root.add(W.plaque);
  const ptop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 1.3), white); ptop.position.set(0, 0.92, -8.75); root.add(ptop);
  W.setPlaque = (title, msg, from) => {
    const tex = canvasTex(1024, 450, (g, w, h) => {
      g.fillStyle = '#1c1c1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#9a9a92'; g.textAlign = 'center';
      g.font = '500 26px system-ui, sans-serif'; g.fillText('A  P E R M A N E N T   C O L L E C T I O N', w / 2, 70);
      g.fillStyle = '#f0ede6'; g.font = '500 86px Georgia, serif'; g.fillText(title, w / 2, 170);
      g.fillStyle = '#4a4a46'; g.fillRect(w / 2 - 120, 195, 240, 2);
      g.fillStyle = '#d7d4cc'; g.font = '30px system-ui, sans-serif';
      const words = msg.split(' '); let line = '', y = 255; const lines = [];
      words.forEach((wd) => { const t = line + wd + ' '; if (g.measureText(t).width > 800) { lines.push(line); line = wd + ' '; } else line = t; }); lines.push(line);
      lines.slice(0, 3).forEach((l) => { g.fillText(l.trim(), w / 2, y); y += 40; });
      if (from) { g.fillStyle = '#8d8a82'; g.font = 'italic 34px Georgia, serif'; g.fillText('Always yours, ' + from, w / 2, 400); }
    });
    W.plaque.material.map = tex; W.plaque.material.needsUpdate = true;
  };
  W.setPlaque('For You', 'Our best days, framed.', '');
  [[-6.5, -4.6], [6.5, -4.6]].forEach(([x, z]) => { const b = bench(2.4); b.position.set(x, 0, z); b.rotation.y = 0; root.add(b); W.colliders.push({ x0: x - 1.2, x1: x + 1.2, z0: z - 0.3, z1: z + 0.3 }); });
  const ped2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.8), white); ped2.position.set(-8, 0.55, 5); root.add(ped2); W.colliders.push({ x0: -8.45, x1: -7.55, z0: 4.55, z1: 5.45 });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshPhysicalMaterial({ color: '#dff4ff', transparent: true, opacity: 0.25, roughness: 0.05 })); glass.position.set(-8, 1.41, 5); root.add(glass);
  const sprig = new THREE.Group(); for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.3, 4, 6), std('#4b8f4a', 0.8)); l.position.set(0, 1.3 + 0.15, 0); l.rotation.z = (i - 3) * 0.22; l.position.x = -8 + (i - 3) * 0.015; l.position.z = 5; sprig.add(l); } root.add(sprig);
  // dividers (two-sided panels)
  const panelMat = std('#e3e0d8', 0.9);
  box(-6.15, -5.85, 0, 4.4, -20.5, -4.8, panelMat); box(5.85, 6.15, 0, 4.4, -20.5, -4.8, panelMat);

  /* ---------- gallery spots (visual) ---------- */
  for (let i = 0; i < W.lights.points.length; i++) { const p = W.lights.points[i].position; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.2, 10), spotMat); s.position.set(p.x, Hh - 0.15, p.z); root.add(s); }

  /* ---------- slots ---------- */
  const mk = (x, y, z, rotY, nx, nz) => W.slots.push({ i: W.slots.length, pos: [x + nx * 0.03, y, z + nz * 0.03], rotY, n: [nx, nz] });
  mk(0, 2.2, -12.0, 0, 0, 1); // 0 = centrepiece (front of black wall)
  for (let z = 5; z > -24; z -= 3.5) mk(-12, 1.7, z, Math.PI / 2, 1, 0);
  for (let z = 5; z > -24; z -= 3.5) mk(12, 1.7, z, -Math.PI / 2, -1, 0);
  [-10.5, -7.5, -4.5, 4.5, 7.5, 10.5].forEach((x) => mk(x, 1.7, -26, 0, 0, 1));
  [-10.5, -7.5, -4.5, 4.5, 7.5, 10.5].forEach((x) => mk(x, 1.7, 8, Math.PI, 0, -1));
  for (let z = -7; z > -20; z -= 3.5) mk(-5.85, 1.7, z, Math.PI / 2, 1, 0);
  for (let z = -7; z > -20; z -= 3.5) mk(-6.15, 1.7, z, -Math.PI / 2, -1, 0);
  for (let z = -7; z > -20; z -= 3.5) mk(5.85, 1.7, z, -Math.PI / 2, -1, 0);
  for (let z = -7; z > -20; z -= 3.5) mk(6.15, 1.7, z, Math.PI / 2, 1, 0);
  W.slots.length = Math.min(W.slots.length, 45);
  // fix divider orientation: left panel faces -x (west side) & +x (east side)
  W.slots.forEach((s) => { s.n = [Math.round(Math.sin(s.rotY)), Math.round(Math.cos(s.rotY))]; });

  const glowTex = canvasTex(128, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h * 0.3, 4, w / 2, h * 0.3, h * 0.6); gr.addColorStop(0, 'rgba(255,244,214,.55)'); gr.addColorStop(1, 'rgba(255,244,214,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
  W.slotGroups = W.slots.map((s) => {
    const g = new THREE.Group(); g.position.set(...s.pos); g.rotation.y = s.rotY; g.userData.slot = s.i; root.add(g);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.6), glowMat); glow.position.set(0, s.i === 0 ? 0.6 : 0.5, -0.005); g.add(glow);
    return g;
  });

  /* ---------- cinema ---------- */
  const C = CINEMA; const cStone = std('#2a1b22', 0.9), carpet = std('#3a1c26', 1);
  const cwall = (x0, x1, z0, z1, inner) => { const mats = [0, 1, 2, 3, 4, 5].map(() => stoneMat); mats[{ px: 0, nx: 1, pz: 4, nz: 5 }[inner]] = cStone; const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 6.6, z1 - z0), mats); m.position.set((x0 + x1) / 2, 3.3, (z0 + z1) / 2); root.add(m); W.colliders.push({ x0, x1, z0, z1 }); };
  cwall(-10.8, -10, -50.8, -26.8, 'px'); cwall(10, 10.8, -50.8, -26.8, 'nx'); cwall(-10.8, 10.8, -50.8, -50, 'pz');
  const cfloor = new THREE.Mesh(new THREE.PlaneGeometry(20, 24), new THREE.MeshStandardMaterial({ color: '#3a1c26', roughness: 1 })); cfloor.rotation.x = -Math.PI / 2; cfloor.position.set(0, 0.01, -38.8); root.add(cfloor);
  const cslab = new THREE.Mesh(new THREE.BoxGeometry(21.6, 0.5, 24.8), [stoneMat, stoneMat, trim, std('#14101a', 1), stoneMat, stoneMat]); cslab.position.set(0, C.h + 0.25, -38.8); root.add(cslab);
  // aisle runner + stage + curtains
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 20), std('#8e2a3a', 1)); runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.02, -37); root.add(runner);
  box(-7.5, 7.5, 0, 0.35, -50, -47.2, std('#25181d', 0.8), false);
  const curtainMat = std('#7a1f2e', 0.95);
  [-1, 1].forEach((s) => { for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5.4, 10), curtainMat); c.position.set(s * (7.3 + i * 0.33), 2.7, -49.5); root.add(c); } });
  const topC = new THREE.Mesh(new THREE.BoxGeometry(18, 0.9, 0.6), curtainMat); topC.position.set(0, 5.1, -49.5); root.add(topC);
  // screen
  W.screenCanvas = document.createElement('canvas'); W.screenCanvas.width = 1280; W.screenCanvas.height = 720;
  const sg = W.screenCanvas.getContext('2d'); sg.fillStyle = '#0a0a0e'; sg.fillRect(0, 0, 1280, 720);
  sg.fillStyle = '#e8e4d8'; sg.font = '600 64px Georgia, serif'; sg.textAlign = 'center'; sg.fillText('Our Film', 640, 340); sg.font = '28px system-ui, sans-serif'; sg.fillStyle = '#9a968c'; sg.fillText('Press Play Film to begin', 640, 400);
  W.screenTex = new THREE.CanvasTexture(W.screenCanvas); W.screenTex.colorSpace = THREE.SRGBColorSpace;
  W.screen = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 7.2), new THREE.MeshBasicMaterial({ map: W.screenTex, toneMapped: false })); W.screen.position.set(0, 3.9, -49.7); root.add(W.screen);
  const sfr = new THREE.Mesh(new THREE.BoxGeometry(13.2, 7.6, 0.12), std('#0b0b0d', 0.6)); sfr.position.set(0, 3.9, -49.78); root.add(sfr);
  // seats: rows of benches + little cushions
  for (let r = 0; r < 4; r++) for (const sx of [-5.2, 5.2]) { const b = bench(3.6); b.position.set(sx, 0, -30.5 - r * 3.2); b.rotation.y = Math.PI; root.add(b); const cush = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.46), std('#8e2a3a', 0.9)); cush.position.set(sx, 0.55, -30.5 - r * 3.2); root.add(cush); W.colliders.push({ x0: sx - 1.8, x1: sx + 1.8, z0: -30.5 - r * 3.2 - 0.3, z1: -30.5 - r * 3.2 + 0.3 }); }
  [-9.5, 9.5].forEach((x) => { for (let z = -32; z > -48; z -= 5) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), std('#ffd9a0', 0.4, 0, { emissive: '#ffb860', emissiveIntensity: 1.2 })); l.position.set(x, 3.4, z); root.add(l); } });
  const cinemaSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(512, 80, (g, w, h) => { g.fillStyle = '#17120f'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2d28a'; g.font = '600 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('The Screening Room', w / 2, h / 2); }) }));
  cinemaSign.position.set(0, 4.4, -25.95); root.add(cinemaSign);

  /* ---------- frames ---------- */
  const texLoader = new THREE.TextureLoader();
  const plusTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#ece8df'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c8b98f'; g.lineWidth = 6; g.setLineDash([14, 10]); g.strokeRect(26, 26, w - 52, h - 52); g.setLineDash([]); g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(w / 2, h / 2 - 34); g.lineTo(w / 2, h / 2 + 34); g.moveTo(w / 2 - 34, h / 2); g.lineTo(w / 2 + 34, h / 2); g.stroke(); g.fillStyle = '#b3a67f'; g.font = '600 20px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('ADD PHOTO', w / 2, h / 2 + 78); });
  const heartShape = new THREE.Shape(); heartShape.moveTo(0, -0.5); heartShape.bezierCurveTo(-0.9, 0.1, -0.5, 0.7, 0, 0.35); heartShape.bezierCurveTo(0.5, 0.7, 0.9, 0.1, 0, -0.5);
  const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }); heartGeo.scale(0.07, 0.07, 0.07);
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff0c2', emissive: '#ffcf70', emissiveIntensity: 1.6 }); W.bulbMats.push(bulbMat);
  const cache = {}; const mat = (k, f) => (cache[k] || (cache[k] = f()));

  function buildFrame(slotIdx, data) {
    const group = W.slotGroups[slotIdx];
    if (group.userData.frame) { group.remove(group.userData.frame); group.userData.frame.traverse((o) => { if (o.userData.ownTex) o.material.map.dispose(); }); }
    const f = new THREE.Group(); group.userData.frame = f; group.add(f);
    const style = data.style || 'classic', size = SIZES[data.size] || SIZES.l; const [w, h] = size;
    let bt = 0.05, mt = 0.09, depth = 0.05, frameMat = mat('fk', () => std('#0e0e10', 0.5, 0.2)), matMat = mat('mw', () => std('#f6f4ee', 0.9));
    if (style === 'print') { bt = 0; mt = 0.09; depth = 0.02; matMat = mat('pw', () => std('#fbfaf6', 0.95)); }
    if (style === 'gold') { bt = 0.12; mt = 0.07; depth = 0.08; frameMat = mat('fg', () => std('#c9a24a', 0.35, 0.9)); matMat = mat('mc', () => std('#efe6cf', 0.9)); }
    if (style === 'wood') { bt = 0.09; mt = 0.1; depth = 0.06; frameMat = mat('fw', () => std('#7a5232', 0.8)); matMat = mat('mo', () => std('#f1ece0', 0.9)); }
    if (style === 'white') { bt = 0.04; mt = 0.2; depth = 0.05; frameMat = mat('fwh', () => std('#fafafa', 0.5)); }
    if (style === 'polaroid') { bt = 0; mt = 0.09; depth = 0.015; matMat = mat('pp', () => std('#fdfcf8', 0.95)); }
    if (style === 'neon') { bt = 0.035; mt = 0.05; depth = 0.05; frameMat = mat('fn', () => new THREE.MeshStandardMaterial({ color: '#ff5fa8', emissive: '#ff3d98', emissiveIntensity: 2.2 })); matMat = mat('mb', () => std('#121214', 0.8)); }
    const bottomExtra = style === 'polaroid' ? 0.2 : 0;
    const ow = w, oh = h;
    // outer frame (four bars)
    if (bt > 0) {
      const bars = [[ow, bt, 0, oh / 2 - bt / 2], [ow, bt, 0, -oh / 2 + bt / 2], [bt, oh - 2 * bt, -ow / 2 + bt / 2, 0], [bt, oh - 2 * bt, ow / 2 - bt / 2, 0]];
      bars.forEach(([bw, bh, x, y]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth), frameMat); m.position.set(x, y, depth / 2); f.add(m); });
      if (style === 'gold') { const inner = [[ow - 2 * bt, 0.03, 0, oh / 2 - bt - 0.015], [ow - 2 * bt, 0.03, 0, -oh / 2 + bt + 0.015], [0.03, oh - 2 * bt, -ow / 2 + bt + 0.015, 0], [0.03, oh - 2 * bt, ow / 2 - bt - 0.015, 0]]; inner.forEach(([bw, bh, x, y]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth + 0.03), mat('fg2', () => std('#8f6b25', 0.4, 0.9))); m.position.set(x, y, depth / 2); f.add(m); }); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), frameMat); m.position.set(sx * (ow / 2 - 0.03), sy * (oh / 2 - 0.03), depth + 0.02); f.add(m); }); }
    }
    // mat (paper)
    const matW = ow - 2 * bt, matH = oh - 2 * bt;
    const matMesh = new THREE.Mesh(new THREE.BoxGeometry(matW, matH, 0.012), matMat); matMesh.position.set(0, 0, depth * 0.45); f.add(matMesh);
    // picture area
    const pw = matW - 2 * mt, ph = matH - 2 * mt - bottomExtra; const py = bottomExtra / 2;
    const picMat = new THREE.MeshBasicMaterial({ color: data.photo ? '#ffffff' : '#ffffff', map: data.photo ? null : plusTex });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), picMat); pic.position.set(0, py, depth * 0.45 + 0.008); pic.userData.pic = true; f.add(pic);
    if (data.photo) {
      texLoader.load(data.photo, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
        const ia = t.image.width / t.image.height, fa = pw / ph; // cover crop
        if (ia > fa) { t.repeat.set(fa / ia, 1); t.offset.set((1 - fa / ia) / 2, 0); } else { t.repeat.set(1, ia / fa); t.offset.set(0, (1 - ia / fa) / 2); }
        picMat.map = t; picMat.needsUpdate = true;
      });
    }
    if (style === 'polaroid') { f.rotation.z = ((slotIdx * 37) % 7 - 3) * 0.006; [-1, 1].forEach((s) => { const tape = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.01), new THREE.MeshStandardMaterial({ color: '#e9d9a8', transparent: true, opacity: 0.8 })); tape.position.set(s * ow * 0.38, oh / 2 - 0.02, depth + 0.01); tape.rotation.z = s * 0.5; f.add(tape); }); }
    // soft shadow behind
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(ow + 0.25, oh + 0.25), new THREE.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false })); shadow.position.z = -0.002; f.add(shadow);
    decorate(f, data.deco || 'none', ow, oh, depth);
    f.userData.size = { w: ow, h: oh };
    group.userData.data = data;
  }
  let _bs; function blobShadow() { return _bs || (_bs = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 32); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); })); }

  function decorate(f, deco, w, h, d) {
    const z = d + 0.03;
    if (deco === 'lights') {
      const n = Math.max(8, Math.round(w * 6)); const pts = [];
      for (let i = 0; i <= n; i++) { const u = i / n; const x = -w / 2 - 0.05 + u * (w + 0.1); const y = h / 2 + 0.04 - Math.sin(u * Math.PI) * 0.09 * -1 - 0.0; pts.push(new THREE.Vector3(x, h / 2 + 0.05 - Math.sin(u * Math.PI) * 0.12, z)); }
      f.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#403a30' })));
      pts.forEach((p, i) => { if (i % 2) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), bulbMat); b.position.copy(p); b.position.y -= 0.03; f.add(b); } });
    } else if (deco === 'flowers') {
      [[-1, -1], [1, 1]].forEach(([sx, sy], k) => { const g = new THREE.Group(); g.position.set(sx * (w / 2 - 0.05), sy * (h / 2 - 0.05), z); for (let i = 0; i < 7; i++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std('#3f9d46', 0.9)); lf.scale.set(1.5, 0.6, 0.5); lf.position.set(rnd(-0.15, 0.15), rnd(-0.12, 0.12), 0); lf.rotation.z = rnd(0, 3); g.add(lf); } for (let i = 0; i < 6; i++) { const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.04, 0.07), 1), std(pick(['#ff5d8f', '#ffd166', '#ffffff', '#c77dff', '#ff8fab']), 0.7)); fl.position.set(rnd(-0.17, 0.17), rnd(-0.14, 0.14), 0.04); g.add(fl); } f.add(g); });
    } else if (deco === 'hearts') {
      const n = Math.max(4, Math.round(w * 3));
      for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * (w / n); const len = rnd(0.12, 0.38); const hm = new THREE.Mesh(heartGeo, std(pick(['#ff4d6d', '#ff85a1', '#ffb3c6', '#e5383b']), 0.4, 0.1, { emissive: '#ff2a55', emissiveIntensity: 0.25 })); hm.position.set(x, h / 2 + 0.03 - len, z); hm.rotation.z = rnd(-0.2, 0.2); hm.scale.setScalar(rnd(0.9, 1.5)); f.add(hm); f.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, h / 2, z), new THREE.Vector3(x, h / 2 - len + 0.04, z)]), new THREE.LineBasicMaterial({ color: '#c9a0a8' }))); }
    } else if (deco === 'ribbon') {
      const rm = std('#d62839', 0.4); const g = new THREE.Group(); g.position.set(w / 2 - 0.15, h / 2 - 0.03, z + 0.02);
      [-1, 1].forEach((s) => { const lp = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 16), rm); lp.position.set(s * 0.1, 0.02, 0); lp.scale.set(1.2, 0.9, 0.6); g.add(lp); const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.012), rm); tail.position.set(s * 0.06, -0.2, 0); tail.rotation.z = s * 0.18; g.add(tail); });
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), rm)); f.add(g);
    } else if (deco === 'vines') {
      for (let i = 0; i < 26; i++) { const t = i / 25; const onTop = i < 14; const x = onTop ? -w / 2 + t * 1.8 * (w / 2) * 0.55 + rnd(-0.04, 0.04) : -w / 2 + rnd(-0.03, 0.03); const y = onTop ? h / 2 + rnd(-0.03, 0.04) : h / 2 - (i - 14) / 11 * h * 0.7; const lf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), std(pick(['#3f9d46', '#57b05b', '#2f8040']), 0.9)); lf.scale.set(1.6, 0.6, 0.5); lf.position.set(x, y, z); lf.rotation.z = rnd(0, 3.1); f.add(lf); if (i % 6 === 3) { const bl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1), std(pick(['#ff8fab', '#fff', '#ffd166']), 0.7)); bl.position.set(x, y, z + 0.03); f.add(bl); } }
    }
  }
  W.setFrame = (slotIdx, data) => buildFrame(slotIdx, data || { style: slotIdx === 0 ? 'print' : 'classic', size: slotIdx === 0 ? 'g' : (slotIdx % 3 === 0 ? 'p' : slotIdx % 3 === 1 ? 'l' : 'sq'), deco: 'none' });
  W.defaultFor = (slotIdx) => ({ slot: slotIdx, style: slotIdx === 0 ? 'print' : 'classic', size: slotIdx === 0 ? 'g' : (slotIdx % 3 === 0 ? 'p' : slotIdx % 3 === 1 ? 'l' : 'sq'), deco: 'none', photo: null, caption: '' });
  W.slots.forEach((s) => W.setFrame(s.i, W.defaultFor(s.i)));
  W.frameData = W.slots.map((s) => W.defaultFor(s.i));

  /* ---------- collisions ---------- */
  W.collide = (p, r = 0.34) => {
    for (let pass = 0; pass < 2; pass++) for (const c of W.colliders) {
      const x0 = c.x0 - r, x1 = c.x1 + r, z0 = c.z0 - r, z1 = c.z1 + r;
      if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
        const dl = p.x - x0, dr = x1 - p.x, dt = p.z - z0, db = z1 - p.z; const m = Math.min(dl, dr, dt, db);
        if (m === dl) p.x = x0; else if (m === dr) p.x = x1; else if (m === dt) p.z = z0; else p.z = z1;
      }
    }
    p.x = Math.max(-39, Math.min(39, p.x)); p.z = Math.min(57, p.z);
  };
  // camera ray clipping against walls (returns max distance before hitting a wall)
  W.rayClip = (o, dir, maxD) => {
    let best = maxD;
    for (const c of W.colliders) {
      let t0 = 0, t1 = best;
      const ax = [[o.x, dir.x, c.x0, c.x1], [o.z, dir.z, c.z0, c.z1]]; let hit = true;
      for (const [oo, dd, lo, hi] of ax) { if (Math.abs(dd) < 1e-6) { if (oo < lo || oo > hi) { hit = false; break; } } else { let a = (lo - oo) / dd, b = (hi - oo) / dd; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { hit = false; break; } } }
      if (hit && t0 < best && t0 > 0) best = t0;
    }
    return best;
  };
  W.zoneAt = (x, z) => (z < -26.2 && Math.abs(x) < 10.8 ? 'cinema' : z < 8.4 && Math.abs(x) < 12.8 && z > -26.8 ? 'gallery' : 'garden');
  W.nearestSlot = (x, z, yaw) => {
    let best = null, bd = 3.2;
    W.slots.forEach((s) => {
      const dx = s.pos[0] - x, dz = s.pos[2] - z; const d = Math.hypot(dx, dz); if (d > bd) return;
      if (dx * s.n[0] + dz * s.n[1] > 0.4) return; // must be on the viewing side of the wall
      bd = d; best = s.i;
    });
    return best;
  };

  W.update = (dt, t, player) => {
    W.updaters.forEach((u) => u(dt, t));
    bulbMat.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.35;
    const near = Math.hypot(player.x, player.z - 8.4) < 9 && player.z > -1;
    W.doors.forEach((d) => { d.pivot.rotation.y += ((d.s === -1 ? -1 : 1) * (near ? 1.45 : 0) - d.pivot.rotation.y) * Math.min(1, dt * 3); });
  };
  return W;
}
