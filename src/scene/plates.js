import * as THREE from 'three';

// Procedurally drawn plates, signs and labels (canvas -> texture).
// Physical aspect ratios follow the plate sizes in blender/projector.py & booth.py.

const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
const MONO = '"IBM Plex Mono", monospace';
const SERIF = '"Marcellus SC", serif';

const dynamic = new Map();   // name -> {canvas, ctx, tex, draw}

function brushed(ctx, W, H, base = [186, 184, 176], dark = 0.12) {
  ctx.fillStyle = `rgb(${base.join(',')})`;
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    const v = (Math.random() - 0.5) * 22;
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    ctx.fillRect(0, y, W, 1);
  }
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${dark})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function engrave(ctx, text, x, y, font, color = '#141210', align = 'center') {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(text, x + 1, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function rule(ctx, x0, y, x1, color = '#141210', w = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
}

function border(ctx, W, H, inset, color, w = 3, r = 10) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.roundRect(inset, inset, W - 2 * inset, H - 2 * inset, r);
  ctx.stroke();
}

function screwHoles(ctx, W, H, inset = 14) {
  for (const [x, y] of [[inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]]) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  }
}

const DEFS = {
  plate_main: [640, 288, (c, W, H) => {
    brushed(c, W, H, [192, 186, 170]);
    border(c, W, H, 10, '#1b1814', 4, 14);
    c.fillStyle = '#16130f';
    c.fillRect(24, 26, W - 48, 64);
    engrave(c, 'PROJEKTOR KINOWY 35 mm', W / 2, 60, `600 38px ${COND}`, '#d8ceb2');
    engrave(c, 'X-L', 120, 150, `64px ${SERIF}`);
    rule(c, 210, 122, W - 40, '#1b1814', 2);
    engrave(c, 'MECHANIZM Z KRZYŻEM MALTAŃSKIM', 214, 142, `500 25px ${COND}`, '#1b1814', 'left');
    engrave(c, 'W KĄPIELI OLEJOWEJ · MIGAWKA TYLNA', 214, 172, `500 25px ${COND}`, '#1b1814', 'left');
    rule(c, 40, 205, W - 40, '#1b1814', 2);
    engrave(c, 'NR 49-1187    220 V ~ 50 Hz    24 kl./s    1440 obr./min', W / 2, 238, `500 23px ${MONO}`);
    screwHoles(c, W, H, 18);
  }],
  plate_lamp: [620, 258, (c, W, H) => {
    brushed(c, W, H, [60, 62, 58], 0.2);
    border(c, W, H, 10, '#c9bfa6', 3, 12);
    engrave(c, 'LAMPA KSENONOWA', W / 2, 62, `44px ${SERIF}`, '#e6dcc2');
    engrave(c, '2 kW · 26 V · 50–75 A', W / 2, 120, `500 30px ${MONO}`, '#e6dcc2');
    c.fillStyle = '#9b1a10';
    c.fillRect(34, 158, W - 68, 60);
    engrave(c, 'UWAGA! ZAPŁON 35 kV — NIE OTWIERAĆ', W / 2, 189, `600 28px ${COND}`, '#f1e7cf');
  }],
  plate_frame: [256, 256, (c, W, H) => {
    c.fillStyle = '#0d0b09'; c.fillRect(0, 0, W, H);
    engrave(c, 'KADR', W / 2, H / 2 + 4, `600 58px ${COND}`, '#e3d9bf');
    c.fillStyle = '#e3d9bf';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(W / 2, H / 2 + s * 70); c.lineTo(W / 2 - 16, H / 2 + s * 48); c.lineTo(W / 2 + 16, H / 2 + s * 48);
      c.fill();
    }
  }],
  plate_sound: [448, 140, (c, W, H) => {
    brushed(c, W, H, [180, 176, 164]);
    border(c, W, H, 8, '#1b1814', 3, 8);
    engrave(c, 'GŁOWICA DŹWIĘKOWA', W / 2, 50, `600 38px ${COND}`);
    engrave(c, 'ŚCIEŻKA OPTYCZNA · 35 mm', W / 2, 96, `500 24px ${MONO}`);
  }],
  plate_oil: [256, 220, (c, W, H) => {
    c.fillStyle = '#e5dcc4'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#9b1a10'; c.lineWidth = 6; c.strokeRect(8, 8, W - 16, H - 16);
    engrave(c, 'OLEJ', W / 2, 52, `700 48px ${COND}`, '#9b1a10');
    engrave(c, 'SPRAWDZAĆ', W / 2, 110, `600 30px ${COND}`, '#2a1a12');
    engrave(c, 'PO 10 MIN', W / 2, 146, `600 30px ${COND}`, '#2a1a12');
    engrave(c, 'POSTOJU', W / 2, 182, `600 30px ${COND}`, '#2a1a12');
  }],
  plate_mag: [512, 166, (c, W, H) => {
    brushed(c, W, H, [175, 170, 158]);
    border(c, W, H, 8, '#1b1814', 3, 8);
    engrave(c, 'MAGAZYN PODAJĄCY', W / 2, 58, `600 42px ${COND}`);
    engrave(c, 'SZPULA 2000 ft · 610 m', W / 2, 112, `500 26px ${MONO}`);
  }],
  plate_mag_low: [512, 166, (c, W, H) => {
    brushed(c, W, H, [175, 170, 158]);
    border(c, W, H, 8, '#1b1814', 3, 8);
    engrave(c, 'MAGAZYN ODBIORCZY', W / 2, 58, `600 42px ${COND}`);
    engrave(c, 'SPRZĘGŁO CIERNE', W / 2, 112, `500 26px ${MONO}`);
  }],
  plate_lens: [512, 122, (c, W, H) => {
    c.fillStyle = '#0c0b0a'; c.fillRect(0, 0, W, H);
    engrave(c, 'f = 65 mm   1 : 1,9   Nr 20417', W / 2, H / 2, `500 34px ${MONO}`, '#e2c07a');
  }],
  plate_warn_lamp: [420, 126, (c, W, H) => {
    c.fillStyle = '#0d0c0b'; c.fillRect(0, 0, W, H);
    border(c, W, H, 6, '#c9bfa6', 2, 6);
    engrave(c, 'ZAMYKAĆ PODCZAS PRACY', W / 2, H / 2, `600 34px ${COND}`, '#e6dcc2');
  }],
  plate_motor: [440, 240, (c, W, H) => {
    brushed(c, W, H, [170, 166, 156]);
    border(c, W, H, 8, '#1b1814', 3, 8);
    engrave(c, 'SILNIK INDUKCYJNY', W / 2, 44, `600 34px ${COND}`);
    rule(c, 30, 72, W - 30);
    engrave(c, '3~ 380 V   0,37 kW', W / 2, 108, `500 28px ${MONO}`);
    engrave(c, '1440 obr./min   50 Hz', W / 2, 150, `500 28px ${MONO}`);
    engrave(c, 'cos φ 0,78   IP 21', W / 2, 192, `500 28px ${MONO}`);
  }],
  plate_sign_smoke: [720, 260, (c, W, H) => {
    c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#a11d12'; c.fillRect(14, 14, W - 28, H - 28);
    c.strokeStyle = '#e8e0cc'; c.lineWidth = 4; c.strokeRect(26, 26, W - 52, H - 52);
    engrave(c, 'PALENIE', W / 2, 98, `700 86px ${COND}`, '#f2eadb');
    engrave(c, 'WZBRONIONE', W / 2, 180, `700 64px ${COND}`, '#f2eadb');
    // enamel chips
    for (let i = 0; i < 9; i++) {
      c.fillStyle = 'rgba(30,20,15,0.55)';
      const x = Math.random() * W, y = Math.random() < 0.5 ? Math.random() * 30 : H - Math.random() * 30;
      c.beginPath(); c.arc(x, y, 2 + Math.random() * 4, 0, Math.PI * 2); c.fill();
    }
  }],
  plate_exit: [880, 200, (c, W, H) => {
    c.fillStyle = '#141412'; c.fillRect(0, 0, W, H);
    border(c, W, H, 10, '#d9cfb6', 3, 4);
    engrave(c, 'KABINA PROJEKCYJNA', W / 2, 72, `600 58px ${COND}`, '#e6dcc2');
    engrave(c, 'OSOBOM NIEUPOWAŻNIONYM WSTĘP WZBRONIONY', W / 2, 142, `500 32px ${COND}`, '#b8ad92');
  }],
  plate_badge: [256, 256, (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 2);
    g.addColorStop(0, '#1a1714'); g.addColorStop(1, '#0a0908');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#d9cfb6'; c.lineWidth = 5;
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 14, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 24, 0, Math.PI * 2); c.stroke();
    engrave(c, 'X-L', W / 2, H / 2 + 4, `78px ${SERIF}`, '#e9dfc6');
    engrave(c, '35 mm', W / 2, H / 2 + 62, `600 26px ${COND}`, '#b8ad92');
    engrave(c, 'PROJEKTOR', W / 2, H / 2 - 58, `600 22px ${COND}`, '#b8ad92');
  }],
  plate_focus: [512, 92, (c, W, H) => {
    c.fillStyle = '#0c0b0a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#e6dcc2'; c.fillStyle = '#e6dcc2';
    for (let i = 0; i <= 40; i++) {
      const x = 24 + i * (W - 48) / 40;
      c.lineWidth = i % 5 ? 2 : 3;
      c.beginPath(); c.moveTo(x, 8); c.lineTo(x, i % 10 === 0 ? 46 : i % 5 === 0 ? 36 : 26); c.stroke();
      if (i % 10 === 0) engrave(c, String(i / 10 - 2), x, 70, `600 22px ${MONO}`, '#e6dcc2');
    }
  }],
  plate_lensring: [1024, 64, (c, W, H) => {
    c.fillStyle = '#0d0c0b'; c.fillRect(0, 0, W, H);
    const marks = ['∞', '40', '25', '18', '14', '10 m'];
    for (let rep = 0; rep < 2; rep++) {
      marks.forEach((m, i) => {
        const x = rep * W / 2 + 40 + i * 76;
        engrave(c, m, x, H / 2 + 2, `500 30px ${MONO}`, '#e2c07a');
      });
    }
  }],
  plate_panel: [420, 150, (c, W, H) => {
    c.fillStyle = '#e1d8c1'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#1b1814'; c.lineWidth = 3; c.strokeRect(6, 6, W - 12, H - 12);
    engrave(c, 'ROZDZIELNIA KABINY', W / 2, 52, `700 40px ${COND}`, '#1b1814');
    engrave(c, '3 × 380 V   ⚡', W / 2, 104, `600 34px ${MONO}`, '#9b1a10');
  }],
  plate_rect: [540, 180, (c, W, H) => {
    brushed(c, W, H, [150, 150, 142]);
    border(c, W, H, 8, '#1b1814', 3, 6);
    engrave(c, 'ZASILACZ LAMPY KSENONOWEJ', W / 2, 58, `600 38px ${COND}`);
    engrave(c, 'PROSTOWNIK 26 V = · 75 A', W / 2, 118, `500 28px ${MONO}`);
  }],
  plate_can: [512, 214, (c, W, H) => {
    c.fillStyle = '#e4dcc6'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#9b1a10'; c.fillRect(0, 0, W, 34);
    engrave(c, 'KOPIA EKSPLOATACYJNA 35 mm', W / 2, 18, `600 22px ${COND}`, '#f3ecda');
    engrave(c, 'MECHANIKA KINA', W / 2, 82, `42px ${SERIF}`, '#1b1814');
    engrave(c, 'ROLKA 3 / 6', W / 2, 136, `600 40px ${MONO}`, '#1b1814');
    engrave(c, 'dł. 598 m · głowa na zewnątrz', W / 2, 184, `500 22px ${MONO}`, '#3a2e24');
  }],
  plate_can2: [512, 214, (c, W, H) => {
    c.fillStyle = '#e4dcc6'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1f3345'; c.fillRect(0, 0, W, 34);
    engrave(c, 'KOPIA EKSPLOATACYJNA 35 mm', W / 2, 18, `600 22px ${COND}`, '#f3ecda');
    engrave(c, 'MECHANIKA KINA', W / 2, 82, `42px ${SERIF}`, '#1b1814');
    engrave(c, 'ROLKA 4 / 6', W / 2, 136, `600 40px ${MONO}`, '#1b1814');
    engrave(c, 'dł. 604 m · przewinięta', W / 2, 184, `500 22px ${MONO}`, '#3a2e24');
  }],
  plate_leader: [256, 112, (c, W, H) => {
    c.fillStyle = '#ddd3bb'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#1b1814'; c.lineWidth = 2; c.strokeRect(5, 5, W - 10, H - 10);
    engrave(c, 'ARCHIWUM', W / 2, 40, `700 34px ${COND}`, '#1b1814');
    engrave(c, 'ZWIASTUNY', W / 2, 78, `500 24px ${MONO}`, '#3a2e24');
  }],
  plate_card: [724, 1000, (c, W, H) => {
    c.fillStyle = '#e8e1cc'; c.fillRect(0, 0, W, H);
    engrave(c, 'RAPORT PROJEKCJI', W / 2, 70, `44px ${SERIF}`, '#1b1814');
    rule(c, 50, 104, W - 50, '#1b1814', 2);
    engrave(c, 'KABINA NR 1 · PROJEKTOR A', W / 2, 136, `600 28px ${COND}`, '#3a2e24');
    const rows = ['1', '2', '3', '4', '5', '6'];
    c.font = `500 24px ${MONO}`;
    engrave(c, 'ROLKA   START    KONIEC   UWAGI', 60, 200, `600 24px ${MONO}`, '#1b1814', 'left');
    for (let i = 0; i < rows.length; i++) {
      const y = 250 + i * 70;
      rule(c, 50, y + 28, W - 50, 'rgba(40,30,20,0.35)', 1);
      engrave(c, rows[i], 88, y, `500 26px ${MONO}`, '#1b1814', 'left');
      if (i < 3) {
        c.font = `italic 30px "Cormorant Garamond", serif`;
        c.fillStyle = '#23334d';
        c.textAlign = 'left';
        c.fillText(['18:02', '18:21', '18:41'][i], 185, y + 2);
        c.fillText(['18:21', '18:41', ''][i], 345, y + 2);
        c.fillText(['ok', 'sklejka 2×', i === 2 ? 'trwa…' : ''][i], 500, y + 2);
      }
    }
    engrave(c, 'Pętle: sprawdzić przed każdą rolką.', 60, 720, `500 22px ${MONO}`, '#3a2e24', 'left');
    engrave(c, 'Okienko i płozy czyścić co zmianę.', 60, 756, `500 22px ${MONO}`, '#3a2e24', 'left');
    c.font = `italic 34px "Cormorant Garamond", serif`;
    c.fillStyle = '#23334d';
    c.fillText('— kinooperator', 400, 880);
  }],
};

// dynamic: footage counter & ammeter
function drawCounter(c, W, H, feet = 0, frames = 0) {
  c.fillStyle = '#0a0908'; c.fillRect(0, 0, W, H);
  const digits = String(Math.floor(feet) % 100000).padStart(5, '0') + String(Math.floor(frames) % 16).padStart(2, '0');
  const cw = W / 8.2;
  for (let i = 0; i < 7; i++) {
    const x = 10 + i * cw + (i >= 5 ? cw * 0.8 : 0);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a2723'); g.addColorStop(0.5, i >= 5 ? '#e8dfc8' : '#121110'); g.addColorStop(1, '#2a2723');
    c.fillStyle = g;
    c.fillRect(x, 8, cw - 6, H - 16);
    c.font = `600 ${Math.floor(H * 0.52)}px ${MONO}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = i >= 5 ? '#1a1612' : '#ece3cc';
    c.fillText(digits[i], x + (cw - 6) / 2, H / 2 + 2);
  }
  c.font = `600 ${Math.floor(H * 0.2)}px ${COND}`;
  c.fillStyle = '#b8ad92';
  c.fillText('FT', 10 + 5 * cw + cw * 0.38, H * 0.2);
}

function drawAmmeter(c, W, H, amps = 0) {
  c.fillStyle = '#e9e1cc'; c.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.62, R = W * 0.4;
  c.strokeStyle = '#1b1814'; c.lineWidth = 3;
  c.beginPath(); c.arc(cx, cy, R, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 1.15 + (Math.PI * 0.7) * i / 10;
    const r0 = R - (i % 5 === 0 ? 22 : 12);
    c.lineWidth = i % 5 === 0 ? 3 : 2;
    c.strokeStyle = i >= 8 ? '#9b1a10' : '#1b1814';
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke();
    if (i % 5 === 0) engrave(c, String(i * 10), cx + Math.cos(a) * (R - 44), cy + Math.sin(a) * (R - 44), `600 26px ${MONO}`, '#1b1814');
  }
  engrave(c, 'A', cx, cy + 34, `600 40px ${SERIF}`, '#1b1814');
  const a = Math.PI * 1.15 + (Math.PI * 0.7) * Math.min(1, amps / 100);
  c.strokeStyle = '#111'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); c.stroke();
  c.fillStyle = '#111'; c.beginPath(); c.arc(cx, cy, 10, 0, Math.PI * 2); c.fill();
}

export function makePlateTexture(name) {
  let W = 256, H = 256, draw = null;
  if (name === 'plate_counter') { W = 512; H = 160; draw = (c) => drawCounter(c, W, H); }
  else if (name === 'plate_ammeter') { W = 512; H = 512; draw = (c) => drawAmmeter(c, W, H); }
  else if (DEFS[name]) { [W, H, draw] = DEFS[name]; draw = ((d) => (c) => d(c, W, H))(draw); }
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (draw) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;               // glTF UV convention (v = 0 at the top)
  tex.anisotropy = 8;
  if (name === 'plate_counter' || name === 'plate_ammeter') dynamic.set(name, { canvas, ctx, tex, W, H, last: '' });
  return tex;
}

export function updateCounter(feet, frames) {
  const d = dynamic.get('plate_counter');
  if (!d) return;
  const key = Math.floor(feet) + ':' + Math.floor(frames);
  if (key === d.last) return;
  d.last = key;
  drawCounter(d.ctx, d.W, d.H, feet, frames);
  d.tex.needsUpdate = true;
}

export function updateAmmeter(amps) {
  const d = dynamic.get('plate_ammeter');
  if (!d) return;
  const key = amps.toFixed(0);
  if (key === d.last) return;
  d.last = key;
  drawAmmeter(d.ctx, d.W, d.H, amps);
  d.tex.needsUpdate = true;
}
