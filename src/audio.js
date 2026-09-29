// Quiet, synthesised projector sound.  The intermittent "clack" is scheduled from the
// same pulldown events that move the Geneva star, so sound and picture stay in step.

export class ProjectorAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.level = 0;       // overall projector level target (0..1), used for the intro cross-fade
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = this.ctx = new AC(); } catch { return; }
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // motor hum
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 48;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'sine'; this.osc2.frequency.value = 96;
    const o2g = ctx.createGain(); o2g.gain.value = 0.5;
    this.osc1.connect(lp); this.osc2.connect(o2g).connect(lp);
    lp.connect(this.motorGain).connect(this.master);
    this.osc1.start(); this.osc2.start();

    // film / sprocket whirr
    const n1 = ctx.createBufferSource(); n1.buffer = nb; n1.loop = true;
    this.whirrF = ctx.createBiquadFilter(); this.whirrF.type = 'bandpass'; this.whirrF.frequency.value = 2600; this.whirrF.Q.value = 0.8;
    this.whirr = ctx.createGain(); this.whirr.gain.value = 0;
    n1.connect(this.whirrF).connect(this.whirr).connect(this.master);
    n1.start();

    // shutter air / fan rumble
    const n2 = ctx.createBufferSource(); n2.buffer = nb; n2.loop = true; n2.playbackRate.value = 0.7;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 420;
    this.rumble = ctx.createGain(); this.rumble.gain.value = 0;
    n2.connect(rf).connect(this.rumble).connect(this.master);
    n2.start();

    // lamp blower (only when the lamp is on)
    const n3 = ctx.createBufferSource(); n3.buffer = nb; n3.loop = true; n3.playbackRate.value = 0.5;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 700; bf.Q.value = 0.5;
    this.blower = ctx.createGain(); this.blower.gain.value = 0;
    n3.connect(bf).connect(this.blower).connect(this.master);
    n3.start();

    // click buffer (Geneva engagement)
    const cl = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const cd = cl.getChannelData(0);
    for (let i = 0; i < cd.length; i++) {
      const t = i / ctx.sampleRate;
      cd[i] = (Math.random() * 2 - 1) * Math.exp(-t * 170) * 0.9 + Math.sin(t * 2 * Math.PI * 150) * Math.exp(-t * 90) * 0.5;
    }
    this.clickBuf = cl;
    this.clickF = ctx.createBiquadFilter(); this.clickF.type = 'bandpass'; this.clickF.frequency.value = 1500; this.clickF.Q.value = 1.2;
    this.clickG = ctx.createGain(); this.clickG.gain.value = 0.5;
    this.clickF.connect(this.clickG).connect(this.master);
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }

  setLevel(v, time = 0.6) {
    this.level = v;
    if (!this.ctx || this.ctx.state === 'closed') return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled ? v * 0.32 : 0, t, time / 3);
  }

  setEnabled(on) { this.enabled = on; this.setLevel(this.level, 0.2); }

  update(mech) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const sp = Math.max(0, mech.speed);
    const run = Math.min(1, sp / 24);
    const spin = mech.motorOn ? Math.max(0.05, run) : run;
    this.osc1.frequency.setTargetAtTime(20 + 28 * Math.sqrt(run), t, 0.1);
    this.osc2.frequency.setTargetAtTime(40 + 56 * Math.sqrt(run), t, 0.1);
    this.motorGain.gain.setTargetAtTime(0.25 * spin, t, 0.15);
    this.whirr.gain.setTargetAtTime(0.05 * run, t, 0.15);
    this.whirrF.frequency.setTargetAtTime(1400 + 1600 * run, t, 0.2);
    this.rumble.gain.setTargetAtTime(0.16 * run, t, 0.2);
    this.blower.gain.setTargetAtTime(mech.lampOn ? 0.05 : 0, t, 0.4);
    // one clack per pulldown; quieter at full speed where they fuse into a rattle
    const g = 0.22 + 0.45 * (1 - run);
    for (const ev of mech.events) this.clack(t + 0.03 + ev.dt, g);
  }

  clack(when, gain) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.clickBuf;
    s.playbackRate.value = 0.92 + Math.random() * 0.16;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g).connect(this.clickF);
    s.onended = () => { s.disconnect(); g.disconnect(); };
    s.start(Math.max(this.ctx.currentTime, when));
  }

  // mechanical switch
  switchClick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [dt, f, gn] of [[0, 2400, 0.5], [0.018, 900, 0.35]]) {
      const s = this.ctx.createBufferSource(); s.buffer = this.clickBuf;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2;
      const g = this.ctx.createGain(); g.gain.value = gn;
      s.connect(bp).connect(g).connect(this.master);
      s.onended = () => { s.disconnect(); bp.disconnect(); g.disconnect(); };
      s.start(t + dt);
    }
  }
}
