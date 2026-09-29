import { genevaRate, FILM_FRAMES_IN_ATLAS } from '../scene/mechanism.js';

// One frame cycle (360 deg of the cam) drawn like an oscillograph trace on lab paper:
//   MIGAWKA   – light passing the rotating shutter
//   TAŚMA     – film velocity in the gate (Geneva pulse)
//   EKRAN     – what the audience receives
export class TimingCard {
  constructor(canvas, mech) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.mech = mech;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.c.width = Math.max(10, Math.round(r.width * dpr));
    this.c.height = Math.max(10, Math.round(r.height * dpr));
    this.dpr = dpr;
  }
  draw() {
    const { ctx, c, mech } = this;
    const W = c.width, H = c.height, d = this.dpr;
    ctx.clearRect(0, 0, W, H);
    const x0 = 74 * d, x1 = W - 12 * d;
    const rows = [
      { y: H * 0.13, lab: 'MIGAWKA', f: (p) => mech.shutterTransmission(Math.floor(mech.phase) + p) },
      { y: H * 0.41, lab: 'TAŚMA', f: (p) => genevaRate(p) / genevaRate(0.125) },
      { y: H * 0.69, lab: 'EKRAN', f: (p) => mech.shutterTransmission(Math.floor(mech.phase) + p) * (mech.lampOn ? mech.douser * mech.fireShutter : 0) },
    ];
    const h = H * 0.19;
    // grid
    ctx.strokeStyle = 'rgba(233,225,207,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = x0 + (x1 - x0) * i / 8;
      ctx.beginPath(); ctx.moveTo(x, 8 * d); ctx.lineTo(x, H - 18 * d); ctx.stroke();
    }
    // pulldown window
    ctx.fillStyle = 'rgba(179,38,30,0.16)';
    ctx.fillRect(x0, 8 * d, (x1 - x0) * 0.25, H - 26 * d);
    ctx.font = `${10 * d}px "Barlow Condensed", sans-serif`;
    ctx.fillStyle = 'rgba(214,120,100,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText('PRZESUW 90°', x0 + (x1 - x0) * 0.125, H - 6 * d);
    ctx.fillStyle = 'rgba(233,225,207,0.55)';
    ctx.fillText('POSTÓJ KLATKI 270°', x0 + (x1 - x0) * 0.625, H - 6 * d);
    for (const r of rows) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(233,225,207,0.7)';
      ctx.font = `600 ${10.5 * d}px "Barlow Condensed", sans-serif`;
      ctx.fillText(r.lab, 8 * d, r.y + h * 0.35);
      ctx.strokeStyle = 'rgba(233,225,207,0.18)';
      ctx.beginPath(); ctx.moveTo(x0, r.y + h * 0.5); ctx.lineTo(x1, r.y + h * 0.5); ctx.stroke();
      ctx.strokeStyle = r.lab === 'TAŚMA' ? '#d6503f' : '#efe6cf';
      ctx.lineWidth = 1.6 * d;
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const p = i / 240;
        const v = r.f(p);
        const x = x0 + (x1 - x0) * p;
        const y = r.y + h * 0.5 - (v - 0.5) * h;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // playhead
    const px = x0 + (x1 - x0) * mech.frac;
    ctx.strokeStyle = '#ffb45a';
    ctx.lineWidth = 1.5 * d;
    ctx.beginPath(); ctx.moveTo(px, 6 * d); ctx.lineTo(px, H - 20 * d); ctx.stroke();
    ctx.fillStyle = '#ffb45a';
    ctx.beginPath(); ctx.arc(px, 6 * d, 3 * d, 0, Math.PI * 2); ctx.fill();
  }
}

// small "view through the port": the frame in the gate as the audience sees it
export class ScreenInset {
  constructor(canvas, atlasImage, film, mech) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.img = atlasImage; this.film = film; this.mech = mech;
    this.fw = 352; this.fh = 256;
  }
  draw(brightness) {
    const { ctx, c } = this;
    const W = Math.round(c.clientWidth * 1.5), H = Math.round(c.clientHeight * 1.5);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }   // resizing clears & reallocates
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const u = this.film.projectionFrames;
    // picture rows: u(v) = uAp + h(0.5 - v)   (v: 0 bottom .. 1 top), frames upside-down in the gate
    const pw = W * 0.9, ph = pw / 1.375;
    const ox = (W - pw) / 2, oy = (H - ph) / 2;
    const k = 15.29 / 19;
    // draw the two frames that can be visible through the aperture window
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, pw, ph); ctx.clip();
    const f0 = Math.floor(u - k / 2) - 1;
    for (let fi = f0; fi <= f0 + 3; fi++) {
      // screen position of the frame's picture area: film coordinate range [fi + 1.5/19, fi + 17.5/19]
      const ua = fi + 1.5 / 19, ub = fi + 17.5 / 19;
      // v = 0.5 - (u - uAp)/k  -> screen y (top = 0) = (1 - v) * ph
      const va = 0.5 - (ua - u) / k, vb = 0.5 - (ub - u) / k;
      // ua (image top) lands higher on the screen than ub: the lens re-inverts the picture
      const ya = oy + (1 - va) * ph, yb = oy + (1 - vb) * ph;
      const idx = ((fi % FILM_FRAMES_IN_ATLAS) + FILM_FRAMES_IN_ATLAS) % FILM_FRAMES_IN_ATLAS;
      const col = idx % 12, row = Math.floor(idx / 12);
      const sw = this.fw * 20.96 / 22, sx = col * this.fw + (this.fw - sw) / 2;
      ctx.drawImage(this.img, sx, row * this.fh, sw, this.fh, ox, ya, pw, yb - ya);
    }
    ctx.restore();
    ctx.fillStyle = `rgba(0,0,0,${1 - Math.min(1, brightness)})`;
    ctx.fillRect(ox, oy, pw, ph);
  }
}
