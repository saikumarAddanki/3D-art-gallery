// Film: turns the framed photos into an animated slideshow video on a canvas (also recordable) + soft music.
const W = 1280, H = 720;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const KINDS = ['fade', 'slide', 'zoom', 'heart', 'drop', 'wipe'];
const SERIF = 'Georgia, "Times New Roman", serif';

export class Music {
  constructor() { this.ctx = null; this.on = false; this.timer = null; this.step = 0; }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.dest = this.ctx.createMediaStreamDestination(); this.master.connect(this.dest);
    const delay = this.ctx.createDelay(); delay.delayTime.value = 0.38; const fb = this.ctx.createGain(); fb.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay); this.master.connect(delay); delay.connect(this.master);
  }
  note(freq, t, dur, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  start(level = 0.5) {
    this.init(); if (!this.ctx) return; this.ctx.resume(); this.on = true;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.linearRampToValueAtTime(level, this.ctx.currentTime + 1.5);
    if (this.timer) return;
    const chords = [[261.6, 329.6, 392, 523.3], [220, 261.6, 329.6, 440], [174.6, 220, 261.6, 349.2], [196, 246.9, 293.7, 392]];
    const tick = () => {
      const ch = chords[Math.floor(this.step / 8) % 4]; const i = this.step % 8; const t = this.ctx.currentTime + 0.05;
      const n = ch[[0, 1, 2, 3, 2, 1, 3, 2][i]]; this.note(n, t, 1.8, 0.12);
      if (i === 0) { this.note(ch[0] / 2, t, 3.4, 0.1); this.note(ch[2] / 2, t, 3.4, 0.05); }
      this.step++;
    };
    this.timer = setInterval(tick, 480); tick();
  }
  stop() { if (!this.ctx) return; this.on = false; this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8); clearInterval(this.timer); this.timer = null; }
  setLevel(v) { if (this.ctx && this.on) this.master.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.5); }
}

export class Film {
  constructor(canvas, onUpdate) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.onUpdate = onUpdate || (() => {});
    this.scenes = []; this.playing = false; this.t0 = 0; this.duration = 0; this.music = new Music();
  }
  // items: [{url, caption}]
  async load(items, title, message, from) {
    const imgs = await Promise.all(items.map((it) => new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res({ im, caption: it.caption || '' }); im.onerror = () => res(null); im.src = it.url; })));
    const photos = imgs.filter(Boolean);
    this.scenes = [{ type: 'intro', d: 4, title, message }, ...photos.map((p) => ({ type: 'photo', d: 4.6, ...p })), { type: 'outro', d: 5, title, message, from }];
    this.T = 1.1; this.starts = []; let s = 0;
    this.scenes.forEach((sc, i) => { sc.kind = KINDS[i % KINDS.length]; this.starts.push(s); s += sc.d - this.T; });
    this.duration = s + this.T; this.count = photos.length;
    this.render(0);
  }
  play(offset = 0, withMusic = true) { if (!this.scenes.length) return; this.playing = true; this.t0 = performance.now() - offset * 1000; if (withMusic) this.music.start(0.5); }
  stop() { this.playing = false; }
  tick(now) {
    if (!this.playing) return;
    const t = (now - this.t0) / 1000;
    if (t >= this.duration) { this.playing = false; this.render(this.duration - 0.01); this.onUpdate(); this.onEnd && this.onEnd(); return; }
    this.render(t); this.onUpdate();
  }
  render(t) {
    const g = this.ctx; g.save(); g.fillStyle = '#08080b'; g.fillRect(0, 0, W, H);
    const sc = this.scenes; if (!sc.length) { g.restore(); return; }
    let i = 0; for (let k = 0; k < sc.length; k++) if (t >= this.starts[k]) i = k;
    const local = t - this.starts[i];
    if (i > 0 && local < this.T) {
      this.drawScene(sc[i - 1], t - this.starts[i - 1]);
      this.transition(sc[i], clamp01(local / this.T), local);
    } else this.drawScene(sc[i], local);
    // progress bar
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, H - 4, W, 4); g.fillStyle = '#f2c777'; g.fillRect(0, H - 4, W * clamp01(t / this.duration), 4);
    g.restore();
  }
  transition(scene, q, local) {
    const g = this.ctx, e = ease(q); g.save();
    switch (scene.kind) {
      case 'slide': g.translate((1 - e) * W, 0); break;
      case 'zoom': g.globalAlpha = e; g.translate(W / 2, H / 2); g.scale(1 + (1 - e) * 0.4, 1 + (1 - e) * 0.4); g.translate(-W / 2, -H / 2); break;
      case 'heart': { const sx = W * 0.02 + e * W * 1.5, cx = W / 2, cy = H / 2 + sx * 0.05; g.beginPath(); g.moveTo(cx, cy - 0.1 * sx); g.bezierCurveTo(cx - 0.5 * sx, cy - 0.7 * sx, cx - 1.15 * sx, cy - 0.1 * sx, cx, cy + 0.6 * sx); g.bezierCurveTo(cx + 1.15 * sx, cy - 0.1 * sx, cx + 0.5 * sx, cy - 0.7 * sx, cx, cy - 0.1 * sx); g.closePath(); g.clip(); break; }
      case 'drop': g.globalAlpha = clamp01(q * 3); g.translate(W / 2, H / 2); g.rotate((1 - e) * 0.25); g.translate(-W / 2, -H / 2 - (1 - e) * H * 0.6); break;
      case 'wipe': g.beginPath(); { const x = -200 + e * (W + 400); g.moveTo(0, 0); g.lineTo(x + 200, 0); g.lineTo(x, H); g.lineTo(0, H); g.closePath(); } g.clip(); break;
      default: g.globalAlpha = e;
    }
    this.drawScene(scene, local); g.restore();
  }
  drawScene(s, lt) {
    const g = this.ctx;
    if (s.type === 'photo') return this.drawPhoto(s, lt);
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#15101a'); bg.addColorStop(1, '#2a1a22'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // floating hearts
    for (let i = 0; i < 14; i++) { const x = (i * 97 + 60) % W, y = H - ((lt * 40 + i * 83) % (H + 80)); g.globalAlpha = 0.12 + (i % 3) * 0.05; g.fillStyle = '#ff8fab'; this.heart(x, y, 10 + (i % 4) * 6); }
    g.globalAlpha = 1; g.textAlign = 'center'; g.fillStyle = '#f2ede2';
    const a = clamp01(lt / 1.0), b = clamp01((lt - 0.7) / 1.0);
    if (s.type === 'intro') {
      g.globalAlpha = a; g.fillStyle = '#b9a574'; g.font = `500 24px system-ui, sans-serif`; g.fillText('A  P E R M A N E N T   C O L L E C T I O N', W / 2, 270);
      g.fillStyle = '#f6f1e6'; g.font = `500 96px ${SERIF}`; g.fillText(s.title, W / 2, 380);
      g.globalAlpha = b; g.fillStyle = '#d6d0c4'; g.font = `italic 34px ${SERIF}`; this.wrap(s.message, W / 2, 450, 900, 44);
    } else {
      g.globalAlpha = a; g.fillStyle = '#f6f1e6'; g.font = `500 56px ${SERIF}`; this.wrap(s.message, W / 2, 300, 960, 70);
      g.globalAlpha = b; if (s.from) { g.fillStyle = '#e8b4c4'; g.font = `italic 44px ${SERIF}`; g.fillText('Always yours, ' + s.from, W / 2, 520); }
    }
    g.globalAlpha = 1;
  }
  heart(x, y, s) { const g = this.ctx; g.beginPath(); g.moveTo(x, y + s * 0.3); g.bezierCurveTo(x - s, y - s * 0.5, x - s * 0.4, y - s, x, y - s * 0.4); g.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.5, x, y + s * 0.3); g.fill(); }
  wrap(text, x, y, maxW, lh) { const g = this.ctx; const words = String(text || '').split(' '); let line = ''; const lines = []; words.forEach((w) => { const t = line + w + ' '; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w + ' '; } else line = t; }); lines.push(line); lines.forEach((l, i) => g.fillText(l.trim(), x, y + i * lh)); }
  drawPhoto(s, lt) {
    const g = this.ctx, im = s.im; const p = clamp01(lt / s.d);
    // blurred backdrop
    const cover = Math.max(W / im.width, H / im.height);
    g.save(); g.globalAlpha = 1; if ('filter' in g) g.filter = 'blur(28px) brightness(.55)'; g.drawImage(im, (W - im.width * cover * 1.15) / 2, (H - im.height * cover * 1.15) / 2, im.width * cover * 1.15, im.height * cover * 1.15); g.restore();
    if (!('filter' in g)) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, W, H); }
    // photo with Ken Burns
    const polaroid = s.kind === 'drop';
    const maxW = polaroid ? W * 0.52 : W * 0.86, maxH = polaroid ? H * 0.74 : H * 0.84; const fit = Math.min(maxW / im.width, maxH / im.height);
    const kb = 1 + p * 0.07; const w = im.width * fit * kb, h = im.height * fit * kb;
    const cx = W / 2 + (p - 0.5) * 14, cy = H / 2 - (polaroid ? 20 : 0);
    g.save();
    if (polaroid) { g.translate(cx, cy); g.rotate(-0.04 + p * 0.03); g.fillStyle = '#fdfbf5'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 40; g.shadowOffsetY = 14; g.fillRect(-w / 2 - 26, -h / 2 - 26, w + 52, h + 100); g.shadowColor = 'transparent'; g.drawImage(im, -w / 2, -h / 2, w, h); }
    else { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 40; g.shadowOffsetY = 12; g.fillStyle = '#fff'; g.fillRect(cx - w / 2 - 10, cy - h / 2 - 10, w + 20, h + 20); g.shadowColor = 'transparent'; g.drawImage(im, cx - w / 2, cy - h / 2, w, h); }
    g.restore();
    if (s.caption) { g.save(); g.globalAlpha = clamp01((lt - 0.8) / 0.6) * clamp01((s.d - lt) / 0.6); g.textAlign = 'center'; g.font = `italic 34px ${SERIF}`; g.fillStyle = polaroid ? '#3b342c' : '#fff'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = polaroid ? 0 : 12; g.fillText(s.caption, W / 2, polaroid ? cy + h / 2 + 64 : H - 44); g.restore(); }
  }
  // Record the whole film into a webm Blob (plays in real time on the screen too).
  record() {
    return new Promise((resolve, reject) => {
      if (!window.MediaRecorder || !this.canvas.captureStream) return reject(new Error('Recording is not supported in this browser'));
      this.music.start(0.5);
      const vs = this.canvas.captureStream(30); const tracks = [...vs.getVideoTracks()];
      if (this.music.dest) tracks.push(...this.music.dest.stream.getAudioTracks());
      const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(new MediaStream(tracks), type ? { mimeType: type, videoBitsPerSecond: 4e6 } : undefined); const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => { this.onEnd = null; this.music.stop(); resolve(new Blob(chunks, { type: 'video/webm' })); };
      rec.onerror = (e) => reject(e.error || e);
      this.onEnd = () => setTimeout(() => rec.stop(), 300);
      rec.start(500); this.play(0, false);
    });
  }
}
