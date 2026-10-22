// Procedural stylised avatar with a smooth walk/run/idle cycle and hug / kiss poses.
import * as THREE from 'three';

export const SKINS = { original: '#f1c9a9', sand: '#e0b38a', honey: '#c68e5f', sienna: '#985f3f', umber: '#5b3a28' };
export const HAIRS = ['#2b1d16', '#5a3a26', '#a0703c', '#d9b26a', '#c4452f', '#1c1c24', '#8a8f9c'];
export const OUTFITS = ['#2f6f6a', '#c7664e', '#3d5a99', '#e8c15a', '#b0507a', '#3a3a40', '#f1eee6', '#5d8f4f'];
export const PANTS = ['#4a4a52', '#cfc7b4', '#2b3547', '#6a5a46', '#1f1f24', '#8f6f5a'];
export const SHOES = ['#6b3f2a', '#1d1d22', '#f1eee6', '#b0414a'];
export const DEFAULTS = {
  kai: { char: 'kai', height: 'avg', skin: 'original', hair: HAIRS[1], hairStyle: 'short', shirt: OUTFITS[0], vest: '#8c836f', pants: PANTS[0], shoes: SHOES[0] },
  mira: { char: 'mira', height: 'avg', skin: 'original', hair: HAIRS[0], hairStyle: 'long', shirt: OUTFITS[1], vest: null, pants: PANTS[1], shoes: SHOES[1] },
};
const HEIGHT = { short: 0.88, avg: 0.95, tall: 1.03 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const M = (c, r = 0.75, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

let shadowTex;
function blobTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  const x = c.getContext('2d'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

function pivot(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function mesh(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }

export class Avatar {
  constructor(look) {
    this.group = new THREE.Group();
    this.phase = Math.random() * 6;
    this.t = Math.random() * 10;
    this.lean = 0; this.leanVel = 0;
    this.k = 0; // pose weight (0 = locomotion, 1 = hug/kiss)
    this.pose = null; // 'hug' | 'kiss' | null
    this.side = 1; // which side the head tilts toward
    this.eyeClose = 0;
    this.setLook(look || DEFAULTS.kai);
  }

  setLook(look) {
    this.look = { ...DEFAULTS[look.char || 'kai'], ...look };
    const L = this.look, female = L.char === 'mira';
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    const skin = M(SKINS[L.skin] || SKINS.original, 0.6), shirt = M(L.shirt, 0.8), pants = M(L.pants, 0.85);
    const shoe = M(L.shoes, 0.5), hair = M(L.hair, 0.55);
    const root = this.root = pivot(this.group);
    root.scale.setScalar(HEIGHT[L.height] || HEIGHT.avg);
    const body = this.body = pivot(root);

    // legs
    const mkLeg = (sx) => {
      const hip = pivot(body, sx * 0.095, 0.9, 0);
      mesh(hip, new THREE.CapsuleGeometry(0.072, 0.34, 6, 12), pants, 0, -0.22, 0);
      const knee = pivot(hip, 0, -0.43, 0);
      mesh(knee, new THREE.CapsuleGeometry(0.062, 0.34, 6, 12), pants, 0, -0.21, 0);
      const foot = mesh(knee, new THREE.CapsuleGeometry(0.058, 0.12, 6, 10), shoe, 0, -0.41, 0.06);
      foot.rotation.x = Math.PI / 2;
      return { hip, knee };
    };
    this.legL = mkLeg(1); this.legR = mkLeg(-1);

    // torso
    const torso = this.torso = pivot(body, 0, 0.92, 0);
    const chestW = female ? 0.125 : 0.15;
    const chest = mesh(torso, new THREE.CapsuleGeometry(chestW, 0.3, 8, 16), shirt, 0, 0.27, 0);
    chest.scale.set(1.12, 1, 0.8);
    if (!female) { // waistcoat
      const vest = mesh(torso, new THREE.CapsuleGeometry(chestW + 0.008, 0.28, 8, 16), M(L.vest || '#8c836f', 0.85), 0, 0.26, 0.012);
      vest.scale.set(1.12, 0.96, 0.82);
      mesh(torso, new THREE.BoxGeometry(0.06, 0.34, 0.01), M(L.shirt, 0.8), 0, 0.3, chestW * 0.8 + 0.01).visible = true;
    } else { // slightly flared hips
      const skirtHip = mesh(torso, new THREE.CapsuleGeometry(0.135, 0.06, 6, 14), pants, 0, 0.02, 0);
      skirtHip.scale.set(1.12, 1, 0.82);
    }
    const belt = mesh(torso, new THREE.CylinderGeometry(chestW * 0.92, chestW * 0.92, 0.035, 18), M('#2a211c', 0.5), 0, 0.07, 0);
    belt.scale.set(1.12, 1, 0.8);

    // arms
    const mkArm = (sx) => {
      const sh = pivot(torso, sx * (chestW * 1.12 + 0.045), 0.46, 0);
      mesh(sh, new THREE.SphereGeometry(0.058, 12, 10), shirt);
      mesh(sh, new THREE.CapsuleGeometry(0.05, 0.2, 6, 10), shirt, 0, -0.15, 0);
      const el = pivot(sh, 0, -0.29, 0);
      mesh(el, new THREE.CapsuleGeometry(0.045, 0.19, 6, 10), shirt, 0, -0.12, 0);
      mesh(el, new THREE.SphereGeometry(0.048, 12, 10), skin, 0, -0.27, 0);
      return { sh, el };
    };
    this.armL = mkArm(1); this.armR = mkArm(-1);

    // neck + head
    mesh(torso, new THREE.CylinderGeometry(0.04, 0.045, 0.1, 10), skin, 0, 0.55, 0);
    const head = this.head = pivot(torso, 0, 0.62, 0);
    const skull = mesh(head, new THREE.SphereGeometry(0.128, 28, 22), skin, 0, 0.13, 0);
    skull.scale.set(0.95, 1.08, 1.02);
    mesh(head, new THREE.SphereGeometry(0.02, 10, 8), skin, 0, 0.125, 0.128); // nose
    const eyeMat = M('#1a1417', 0.3);
    this.eyes = [-1, 1].map((sx) => {
      const e = mesh(head, new THREE.SphereGeometry(0.02, 10, 8), eyeMat, sx * 0.046, 0.15, 0.112);
      e.scale.set(0.85, 1.25, 0.6);
      mesh(e, new THREE.SphereGeometry(0.006, 6, 6), M('#ffffff', 0.2), 0.005, 0.008, 0.016);
      mesh(head, new THREE.BoxGeometry(0.05, 0.008, 0.01), hair, sx * 0.047, 0.188, 0.114).rotation.z = -sx * 0.12;
      const blush = mesh(head, new THREE.CircleGeometry(0.02, 12), new THREE.MeshBasicMaterial({ color: '#ff8a8a', transparent: true, opacity: 0.28 }), sx * 0.08, 0.108, 0.1);
      blush.rotation.y = sx * 0.6;
      return e;
    });
    this.mouth = mesh(head, new THREE.TorusGeometry(0.022, 0.0045, 6, 14, Math.PI), M('#8a3b3b', 0.5), 0, 0.093, 0.122);
    this.mouth.rotation.z = Math.PI;

    // hair
    const hs = L.hairStyle || 'short';
    const cap = mesh(head, new THREE.SphereGeometry(0.139, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, 0, 0.14, -0.006);
    cap.scale.set(1.0, 1.08, 1.06); cap.rotation.x = -0.42;
    if (hs === 'short') {
      mesh(head, new THREE.SphereGeometry(0.135, 20, 14), hair, 0, 0.17, -0.03).scale.set(0.98, 0.9, 1.0);
      const fringe = mesh(head, new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), hair, 0.02, 0.222, 0.06);
      fringe.scale.set(1.15, 0.5, 0.9); fringe.rotation.x = 0.7;
    } else if (hs === 'long') {
      const back = mesh(head, new THREE.CapsuleGeometry(0.115, 0.34, 8, 16), hair, 0, -0.04, -0.06);
      back.scale.set(1.0, 1, 0.75);
      [-1, 1].forEach((sx) => { const side = mesh(head, new THREE.CapsuleGeometry(0.03, 0.26, 6, 10), hair, sx * 0.115, 0.0, 0.0); side.rotation.z = sx * 0.05; });
    } else { // bun
      mesh(head, new THREE.SphereGeometry(0.135, 20, 14), hair, 0, 0.17, -0.03).scale.set(0.98, 0.9, 1.0);
      mesh(head, new THREE.SphereGeometry(0.06, 14, 12), hair, 0, 0.3, -0.07);
    }

    // soft blob shadow
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; this.group.add(sh);
    this.group.traverse((o) => { if (o.isMesh && o !== sh) o.castShadow = false; });
  }

  // speed in m/s, accel = signed forward acceleration (for lean)
  update(dt, speed, accel = 0) {
    this.t += dt;
    const walk = clamp(speed / 1.5, 0, 1), run = clamp((speed - 1.6) / 2.4, 0, 1);
    this.phase += dt * speed * (3.1 - run * 0.4);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = 0.52 * walk + 0.32 * run;
    const breathe = Math.sin(this.t * 1.7), sway = Math.sin(this.t * 0.7);

    // posture lean (spring toward target)
    const leanT = clamp(accel * 0.02, -0.12, 0.12) + run * 0.1;
    this.leanVel += ((leanT - this.lean) * 60 - this.leanVel * 11) * dt;
    this.lean += this.leanVel * dt;

    // locomotion targets
    const idleArm = 0.05 + breathe * 0.02;
    let aLx = -s * amp * 0.9 * walk + sway * 0.03, aRx = s * amp * 0.9 * walk - sway * 0.03;
    let eLx = -(0.12 + walk * 0.25 + run * 0.7), eRx = eLx;
    let aLz = -idleArm * (1 - walk * 0.6), aRz = idleArm * (1 - walk * 0.6);
    let lLx = -s * amp, lRx = s * amp;
    let kLx = Math.max(0, c) * amp * 1.25 + walk * 0.04, kRx = Math.max(0, -c) * amp * 1.25 + walk * 0.04;
    let torsoY = s * 0.1 * walk, torsoZ = c * 0.025 * walk, torsoX = this.lean;
    let headX = -this.lean * 0.6, headZ = Math.sin(this.t * 0.5) * 0.02 * (1 - walk), headY = Math.sin(this.t * 0.37) * 0.12 * (1 - walk);
    let bodyY = Math.abs(c) * 0.04 * walk * (1 + run * 0.6) - Math.abs(c) * 0.0;
    let mouthS = 1, mouthY = 1, eyeClose = 0;

    // hug / kiss pose targets
    const target = this.pose ? 1 : 0;
    this.k += (target - this.k) * Math.min(1, dt * 4.5);
    const k = this.k;
    if (k > 0.001) {
      const sd = this.side;
      let pAx, pAz, pEx, pHz, pTorso, pL, pK, pMs, pMy;
      if (this.pose === 'kiss') {
        pAx = -1.9; pAz = 0.2; pEx = -0.9; pHz = 0.22 * sd; pTorso = 0.09; pL = 0; pK = 0; pMs = 0.45; pMy = 0.9; eyeClose = 1;
        this.kickBack = this.look.char === 'mira' ? 0.45 : 0;
      } else {
        pAx = -1.15; pAz = 0.55; pEx = -0.85; pHz = 0.2 * sd; pTorso = 0.04; pL = 0; pK = 0; pMs = 1.1; pMy = 1; eyeClose = 1;
        this.kickBack = 0;
      }
      const w = 1 - 0 + Math.sin(this.t * 1.5) * 0.02;
      aLx = lerp(aLx, pAx * w, k); aRx = lerp(aRx, pAx * w, k);
      aLz = lerp(aLz, -pAz, k); aRz = lerp(aRz, pAz, k);
      eLx = lerp(eLx, pEx, k); eRx = lerp(eRx, pEx, k);
      headZ = lerp(headZ, pHz, k); headY = lerp(headY, 0, k);
      torsoX = lerp(torsoX, pTorso, k); torsoY = lerp(torsoY, 0, k);
      lLx = lerp(lLx, 0, k); lRx = lerp(lRx, -this.kickBack * 0.0, k);
      // girl pops a foot while kissing
      if (this.kickBack) { lRx = lerp(lRx, 0.5 * this.kickBack * 2, k); kRx = lerp(kRx, 0.9, k); }
      else { lRx = lerp(lRx, 0, k); kRx = lerp(kRx, 0, k); }
      kLx = lerp(kLx, 0, k);
      mouthS = lerp(1, pMs, k); mouthY = lerp(1, pMy, k);
      bodyY = lerp(bodyY, 0, k);
    }
    this.eyeClose += (eyeClose - this.eyeClose) * Math.min(1, dt * 10);
    // blink
    const blink = (this.t % 4.2) < 0.12 ? 1 : 0;
    const closed = Math.max(this.eyeClose, blink);
    this.eyes.forEach((e) => { e.scale.y = lerp(1.25, 0.12, closed); });

    const ap = (arm, x, z, ex) => { arm.sh.rotation.set(x, 0, z); arm.el.rotation.x = ex; };
    ap(this.armL, aLx, aLz, eLx); ap(this.armR, aRx, aRz, eRx);
    this.legL.hip.rotation.x = lLx; this.legR.hip.rotation.x = lRx;
    this.legL.knee.rotation.x = kLx; this.legR.knee.rotation.x = kRx;
    this.torso.rotation.set(torsoX, torsoY, torsoZ);
    this.torso.scale.y = 1 + breathe * 0.008;
    this.head.rotation.set(headX, headY, headZ);
    this.body.position.y = bodyY;
    this.mouth.scale.set(mouthS, mouthY, 1);
    this.mouth.rotation.z = this.pose === 'kiss' && k > 0.5 ? 0 : Math.PI;
  }

  setPose(kind, side = 1) { this.pose = kind; this.side = side; }
}
