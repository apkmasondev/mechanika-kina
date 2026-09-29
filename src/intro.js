// Intro film -> 3D hand-over.
// The last shot of the film (projector left, beam to the right, title right of centre) is
// matched by the 3D camera.  From HANDOVER seconds the scene renders beneath the video,
// the film dissolves into it, and the title stays put (a DOM replica aligned to the film's
// title) before flying up into the exhibit placard.

const HANDOVER = 8.15;     // seconds into the 10 s film
// The film's title keeps growing slowly until the last frame (baseline fixed at y = 537).
// Measured left/right edges of the lettering (film pixels) - the replica follows this track.
const TITLE_TRACK = [[8.0, 933, 1706], [8.25, 924, 1707], [8.5, 916, 1707], [8.75, 907, 1709], [9.0, 900, 1710],
  [9.25, 892, 1713], [9.5, 887, 1721], [9.75, 884, 1726], [10.0, 875, 1734]];

function titleTransform(t) {
  let a = TITLE_TRACK[0], b = TITLE_TRACK[TITLE_TRACK.length - 1];
  for (let i = 0; i < TITLE_TRACK.length - 1; i++) {
    if (t >= TITLE_TRACK[i][0] && t <= TITLE_TRACK[i + 1][0]) { a = TITLE_TRACK[i]; b = TITLE_TRACK[i + 1]; break; }
  }
  const k = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 1;
  const L = a[1] + (b[1] - a[1]) * k, R = a[2] + (b[2] - a[2]) * k;
  const s = (R - L) / 859, cx = (L + R) / 2;
  return `translate(${cx.toFixed(2)} 537) scale(${s.toFixed(4)}) translate(-1304.5 -537)`;
}

export class Intro {
  constructor(o) {
    this.o = o;
    this.v = o.video;
    this.handed = false;
    this.revealed = false;
    this.started = false;
    this.skipRequested = false;
    this.lastTime = 0;
    this.lastAdvance = performance.now();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    o.ticket.addEventListener('click', () => this.start());
    o.ticket.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.start(); } });
    o.skip.addEventListener('click', () => this.skip());
    this.v.addEventListener('error', () => this.skip());
    this.v.addEventListener('ended', () => this.onEnded());
    this.layout();
    document.fonts.ready.then(() => this.layout());
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.o.onUserStart();
    this.o.ticket.inert = true;
    document.body.classList.add('tearing');
    setTimeout(() => {
      document.body.classList.add('playing');
      this.lastAdvance = performance.now();
      this.v.volume = 0.9;
      if (this.reducedMotion || this.v.error) this.skip();
      if (!this.skipRequested) this.play();
      requestAnimationFrame(() => this.tick());
    }, 650);
  }

  async play() {
    try { await this.v.play(); }
    catch {
      if (this.skipRequested) return;
      this.v.muted = true;
      try { await this.v.play(); } catch { this.skip(); }
    }
  }

  skip() {
    this.skipRequested = true;
    this.v.pause();
  }

  tick() {
    const t = this.v.currentTime;
    const now = performance.now();
    if (t !== this.lastTime || document.hidden) this.lastAdvance = now;
    this.lastTime = t;
    // A broken/blocked/stalled optional film must never lock the exhibition.
    if (!this.revealed && now - this.lastAdvance > 8000) this.skip();
    if (!this.handed && (this.skipRequested || this.v.ended)) {
      document.body.classList.add('waiting');
      if (this.o.isReady()) {
        this.handed = true;
        this.o.onHandover();
        document.body.classList.add('handover');
        this.reveal();
      }
    }
    if (!this.handed && t >= HANDOVER && this.o.isReady()) {
      this.handed = true;
      this.o.onHandover();
      document.body.classList.add('handover');
    }
    if (this.handed && this.skipRequested && !this.revealed) this.reveal();
    if (this.handed && !this.revealed) {
      this.o.title.querySelector('.tt-block').setAttribute('transform', titleTransform(Math.min(10, t + 0.05)));
      // the replica takes over while the film dissolves (letterforms differ slightly from the film's)
      this.o.title.style.opacity = Math.min(1, Math.max(0, (t - 8.9) / 0.9)).toFixed(3);
    }
    if (t > 8.6) this.v.volume = Math.max(0, Math.min(0.9, (9.95 - t) / 1.35 * 0.9));
    if (!this.revealed && this.handed && (this.v.ended || t >= this.v.duration - 0.05)) this.reveal();
    if (!this.revealed) requestAnimationFrame(() => this.tick());
  }

  onEnded() { if (this.handed && !this.revealed) this.reveal(); }

  reveal() {
    if (this.revealed) return;
    this.revealed = true;
    this.o.skip.inert = true;
    document.body.classList.add('revealed');
    this.o.title.querySelector('.tt-block').removeAttribute('transform');
    this.o.title.style.opacity = '1';
    document.body.classList.remove('waiting');
    this.o.onRevealed();
    // fly the title into the placard (FLIP on the full-frame SVG)
    setTimeout(() => {
      const svg = this.o.title;
      const ra = svg.querySelector('.tt-block').getBoundingClientRect();
      const rb = document.querySelector('#placard .pc-g').getBoundingClientRect();
      const k = rb.width / ra.width;
      svg.style.transformOrigin = '0 0';
      svg.style.transition = 'transform 2.1s cubic-bezier(.65,.02,.25,1)';
      svg.style.transform = `translate(${rb.left - ra.left * k}px, ${rb.top - ra.top * k}px) scale(${k})`;
      setTimeout(() => { document.body.classList.add('placard-on'); svg.style.opacity = ''; }, 2050);
      setTimeout(() => { this.v.pause(); this.v.removeAttribute('src'); this.v.load(); }, 2600);
    }, 900);
  }

  // The SVG replica lives in film-frame coordinates (viewBox 1920x1080, "slice" = cover),
  // so only the font size has to be derived: caps of the film's lettering are 91 px / 60 px.
  layout() {
    const c = document.createElement('canvas').getContext('2d');
    c.font = '100px "Marcellus SC"';
    const cap = c.measureText('H').actualBoundingBoxAscent / 100 || 0.7;
    document.querySelectorAll('.tt-t').forEach((t) => t.setAttribute('font-size', (91 / cap).toFixed(2)));
    document.querySelectorAll('.tt-s').forEach((t) => t.setAttribute('font-size', (60 / cap).toFixed(2)));
  }
}
