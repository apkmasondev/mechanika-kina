// Master clock of the projector.  Everything that moves is derived from one phase value
// (frames, float): cam angle, Geneva star, shutter, sprockets, film displacement, reels.
// This guarantees shutter/pulldown synchronisation by construction.

export const TAU = Math.PI * 2;
export const FPS_NOMINAL = 24;
export const FILM_FRAMES_IN_ATLAS = 84;

// 4-slot Geneva: pin engages during the first quarter of the cam revolution.
// Returns star progress 0..1 for the current frame cycle.
export function genevaProgress(frac) {
  if (frac >= 0.25) return 1;
  if (frac <= 0) return 0;
  const a = TAU * frac - Math.PI / 4;           // pin angle measured from the line of centres
  const r = Math.SQRT1_2;                       // crank radius / centre distance for 4 slots
  const b = Math.atan2(r * Math.sin(a), 1 - r * Math.cos(a));
  return (b + Math.PI / 4) / (Math.PI / 2);
}

// derivative d(progress)/d(frac) (for film velocity / motion blur)
export function genevaRate(frac) {
  if (frac <= 0 || frac >= 0.25) return 0;
  const e = 1e-4;
  return (genevaProgress(Math.min(0.25, frac + e)) - genevaProgress(Math.max(0, frac - e))) / (2 * e);
}

export class Mechanism {
  constructor(layout) {
    this.L = layout;
    this.F = layout.film.FRAME;
    this.phase = 0.4;          // start with a frame at rest in the gate
    this.speed = 0;            // frames per second (actual)
    this.targetFps = FPS_NOMINAL;
    this.motorOn = false;
    this.lampOn = false;
    this.shutterEnabled = true;
    this.accelUp = 16;         // fps per second (motor run-up ~1.5 s)
    this.accelDown = 9;
    this.totalFrames = 0;      // for the footage counter (frames run since load)
    // pack radii (m) - area conservation keeps them consistent
    this.rFeed = 0.152;
    this.rTake = 0.098;
    this.hubR = layout.film.reel_hub_r;
    this.filmThickness = 0.000142;
    this.reelFeedAngle = 0;
    this.reelTakeAngle = 0;
    this.douser = 0;           // 0 closed .. 1 open (animated)
    this.fireShutter = 0;      // 0 closed .. 1 open (animated)
    this.events = [];          // pulldown events inside the last update (for audio)
    this._lastN = Math.floor(this.phase);
  }

  update(dt) {
    const tgt = this.motorOn ? this.targetFps : 0;
    const a = tgt > this.speed ? this.accelUp * Math.max(0.35, Math.min(1, tgt / 24)) : this.accelDown * Math.max(0.3, Math.min(1, this.speed / 24 + 0.1));
    if (Math.abs(tgt - this.speed) < a * dt) this.speed = tgt;
    else this.speed += Math.sign(tgt - this.speed) * a * dt;

    const prev = this.phase;
    this.phase += this.speed * dt;
    this.totalFrames += this.speed * dt;

    // pulldown events (cam passes the start of the engagement window)
    this.events.length = 0;
    const n0 = Math.floor(prev), n1 = Math.floor(this.phase);
    for (let n = n0 + 1; n <= n1 && this.events.length < 8; n++) {
      this.events.push({ dt: this.speed > 0 ? (n - prev) / this.speed : 0 });
    }

    // film consumption changes pack radii (film area conserved)
    const dl = this.F * this.speed * dt;
    const k = this.filmThickness / Math.PI;
    this.rFeed = Math.sqrt(Math.max(this.hubR * this.hubR, this.rFeed * this.rFeed - k * dl));
    this.rTake = Math.sqrt(this.rTake * this.rTake + k * dl);
    if (this.rFeed <= this.hubR + 0.004) { // endless exhibit: quietly "rewind"
      const t = this.rFeed; this.rFeed = this.rTake; this.rTake = t;
    }
    this.reelFeedAngle -= dl / this.rFeed;
    this.reelTakeAngle -= dl / this.rTake;

    // fire shutter (governor): opens only near running speed; simulated slow motion keeps it open
    const fsTarget = this.motorOn && (this.speed > 16 || this.simulatedSlow) ? 1 : 0;
    this.fireShutter += (fsTarget - this.fireShutter) * Math.min(1, dt * (fsTarget ? 6 : 14));
    const dTarget = this.lampOn ? 1 : 0;
    this.douser += (dTarget - this.douser) * Math.min(1, dt * 7);
  }

  get n() { return Math.floor(this.phase); }
  get frac() { return this.phase - Math.floor(this.phase); }
  get g() { return genevaProgress(this.frac); }

  // film displacement in metres, wrapped to a multiple of the atlas length (float precision)
  get wrap() { return this.F * FILM_FRAMES_IN_ATLAS * Math.floor(this.n / FILM_FRAMES_IN_ATLAS); }
  get D() { return this.F * this.phase - this.wrap; }                       // continuous sprockets
  get G() { return this.F * (this.n + this.g) - this.wrap; }                // intermittent sprocket
  get vContinuous() { return this.F * this.speed; }
  get vIntermittent() { return this.F * this.speed * genevaRate(this.frac); }

  // angles (radians)
  get camAngle() { return TAU * this.phase - Math.PI / 4; }                 // CCW about +Z
  get starAngle() { return -(Math.PI / 2) * (this.n + this.g); }            // CW about +Z
  get shutterAngle() { return TAU * (this.phase - 0.125); }                 // about +X, blade A on beam at frac=.125

  // light transmission of the rotating shutter at the beam (0..1)
  shutterTransmission(phase = this.phase) {
    if (!this.shutterEnabled) return 1;
    const blade = this.L.shutter.blade;                   // blade angle (rad)
    const beamR = this.L.optics.rim * Math.abs(this.L.shutter.x) / Math.abs(this.L.anchors.reflector_rim_x);
    const d = Math.abs(this.L.anchors.gate[2] - this.L.shutter.axis_yz[1]);
    const delta = Math.asin(Math.min(0.99, beamR / d));
    let a = (TAU * (phase - 0.125)) % Math.PI;            // two blades 180deg apart
    if (a < 0) a += Math.PI;
    const dist = Math.min(a, Math.PI - a);                // angular distance to the nearest blade centre
    const x = (dist - (blade / 2 - delta)) / (2 * delta);
    return Math.max(0, Math.min(1, x));
  }

  // time-averaged transmission (for rendering above the flicker-fusion rate)
  get meanTransmission() {
    if (!this.shutterEnabled) return 1;
    return Math.max(0, 1 - 2 * this.L.shutter.blade / TAU);
  }
}
