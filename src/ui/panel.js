// Control desk ("pulpit") built as a piece of booth hardware: bat-handle toggles, piano-key
// mode switches, a detented speed knob, a drum footage counter and a small tachometer.

const SPEEDS = [
  { v: 24, l: '24' }, { v: 12, l: '12' }, { v: 6, l: '6' }, { v: 2, l: '2' }, { v: 0.5, l: '½' },
];

export class Panel {
  constructor(root, modes, handlers) {
    this.root = root;
    this.h = handlers;
    this.modes = modes;
    this.state = { motor: false, lamp: false, shutter: true, mode: 'work', speed: 24 };
    root.innerHTML = `
      <div class="pl-inner">
        <section class="pl-group pl-power" aria-label="Zasilanie">
          ${this.toggleHTML('motor', 'Silnik', 'Spacja')}
          ${this.toggleHTML('lamp', 'Lampa', 'L')}
          ${this.toggleHTML('shutter', 'Migawka', 'M')}
        </section>
        <div class="pl-rule"></div>
        <section class="pl-group pl-modes" aria-label="Tryby ekspozycji">
          ${modes.map((m, i) => `
            <button class="pl-key" data-mode="${m.id}" aria-label="${m.num} ${m.name}" aria-pressed="false" title="${m.title} (${i + 1})">
              <span class="k-cap"><span class="k-num">${m.num}</span></span>
              <span class="k-name">${m.name}</span>
              <i class="k-lamp"></i>
            </button>`).join('')}
        </section>
        <div class="pl-rule"></div>
        <section class="pl-group pl-speed" aria-label="Prędkość">
          <div class="dial">
            <div class="dial-ticks">${SPEEDS.map((s, i) => `<button class="dial-t" data-i="${i}" aria-label="${s.v} klatek na sekundę" aria-pressed="false" style="--a:${-60 + i * 30}deg"><span>${s.l}</span></button>`).join('')}</div>
            <button class="dial-knob" aria-label="Zmień prędkość"><span class="dial-grip"></span><span class="dial-ptr"></span></button>
          </div>
          <div class="pl-cap">Prędkość <em>kl./s</em></div>
        </section>
        <div class="pl-rule"></div>
        <section class="pl-group pl-meters" aria-label="Przyrządy">
          <div class="odo" aria-hidden="true">
            ${Array.from({ length: 5 }, (_, i) => `<span class="odo-d" data-i="${i}"><span class="odo-strip">${'0123456789'.split('').map((d) => `<b>${d}</b>`).join('')}<b>0</b></span></span>`).join('')}
            <span class="odo-sep">ft</span>
            ${Array.from({ length: 2 }, (_, i) => `<span class="odo-d odo-fr" data-i="${5 + i}"><span class="odo-strip">${'0123456789'.split('').map((d) => `<b>${d}</b>`).join('')}<b>0</b></span></span>`).join('')}
          </div>
          <div class="pl-cap">Licznik · stopy + klatki</div>
        </section>
        <section class="pl-group pl-tacho">
          <svg viewBox="0 0 120 70" class="tacho">
            <path d="M12 62 A48 48 0 0 1 108 62" class="t-arc"/>
            ${[0, 5, 10, 15, 20, 24, 30].map((value, i) => { const a = Math.PI + (value / 30) * Math.PI; const x1 = 60 + Math.cos(a) * 48, y1 = 62 + Math.sin(a) * 48, x2 = 60 + Math.cos(a) * (i % 2 ? 43 : 40), y2 = 62 + Math.sin(a) * (i % 2 ? 43 : 40); return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${value === 24 ? 't-red' : 't-tick'}"/>`; }).join('')}
            <text x="14" y="69" class="t-lab">0</text><text x="99" y="69" class="t-lab">30</text>
            <text x="${(60 + Math.cos(Math.PI * 1.8) * 34).toFixed(1)}" y="${(62 + Math.sin(Math.PI * 1.8) * 34 + 3).toFixed(1)}" class="t-lab t-24">24</text>
            <line x1="60" y1="62" x2="60" y2="20" class="t-needle"/>
            <circle cx="60" cy="62" r="4" class="t-hub"/>
          </svg>
          <div class="pl-cap">kl./s</div>
        </section>
      </div>`;

    root.querySelectorAll('.pl-toggle').forEach((el) => {
      el.addEventListener('click', () => this.flip(el.dataset.k));
    });
    root.querySelectorAll('.pl-key').forEach((el) => {
      el.addEventListener('click', () => this.h.mode(el.dataset.mode));
    });
    root.querySelectorAll('.dial-t').forEach((el) => {
      el.addEventListener('click', () => this.setSpeedIndex(+el.dataset.i, true));
    });
    const knob = root.querySelector('.dial-knob');
    knob.addEventListener('wheel', (e) => { e.preventDefault(); this.setSpeedIndex(this.speedIndex + (e.deltaY > 0 ? 1 : -1), true); }, { passive: false });
    knob.addEventListener('click', () => this.setSpeedIndex((this.speedIndex + 1) % SPEEDS.length, true));
    this.speedIndex = 0;
    this.needle = root.querySelector('.t-needle');
    this.odo = [...root.querySelectorAll('.odo-strip')];
  }

  toggleHTML(k, label, key) {
    return `<button class="pl-toggle" data-k="${k}" title="${label} (${key})" aria-pressed="false">
      <span class="tg-plate"><span class="tg-on">zał.</span><span class="tg-off">wył.</span></span>
      <span class="tg-bezel"><span class="tg-lever"></span></span>
      <span class="tg-pilot"></span>
      <span class="pl-cap">${label}</span>
    </button>`;
  }

  flip(k, value, silent) {
    const v = value ?? !this.state[k];
    this.state[k] = v;
    const el = this.root.querySelector(`.pl-toggle[data-k="${k}"]`);
    el.classList.toggle('on', v);
    el.setAttribute('aria-pressed', String(v));
    if (!silent) this.h.toggle(k, v);
  }

  setMode(id) {
    this.state.mode = id;
    this.root.querySelectorAll('.pl-key').forEach((el) => {
      el.classList.toggle('on', el.dataset.mode === id);
      el.setAttribute('aria-pressed', String(el.dataset.mode === id));
    });
  }

  setSpeedIndex(i, user) {
    i = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.speedIndex = i;
    this.state.speed = SPEEDS[i].v;
    this.root.querySelector('.dial-knob').style.setProperty('--a', `${-60 + i * 30}deg`);
    this.root.querySelector('.dial-knob').setAttribute('aria-label', `Prędkość ${SPEEDS[i].v} klatek na sekundę. Kliknij, aby zmienić`);
    this.root.querySelectorAll('.dial-t').forEach((el) => {
      el.classList.toggle('on', +el.dataset.i === i);
      el.setAttribute('aria-pressed', String(+el.dataset.i === i));
    });
    if (user) this.h.speed(SPEEDS[i].v);
  }

  setSpeedValue(v) {
    let best = 0;
    SPEEDS.forEach((s, i) => { if (Math.abs(s.v - v) < Math.abs(SPEEDS[best].v - v)) best = i; });
    this.setSpeedIndex(best, false);
  }

  // live instruments
  update(fps, totalFrames) {
    const a = -90 + Math.min(30, Math.max(0, fps)) / 30 * 180;
    this.needle.setAttribute('transform', `rotate(${a.toFixed(2)} 60 62)`);
    const feet = totalFrames / 16 + 1240;
    const fr = totalFrames % 16;
    // drum digits roll continuously on the last wheel of each group (like a real counter)
    const ft = Math.floor(feet);
    const digs = String(ft % 100000).padStart(5, '0');
    const frac = feet - ft;
    for (let i = 0; i < 5; i++) {
      let d = +digs[i];
      let roll = 0;
      const tail = digs.slice(i + 1);
      if (i === 4) roll = frac;
      else if (tail.split('').every((c) => c === '9')) roll = frac;
      this.odo[i].style.transform = `translateY(${-(d + roll) * 9.0909}%)`;
    }
    const f2 = String(Math.floor(fr)).padStart(2, '0');
    const ffrac = fr - Math.floor(fr);
    this.odo[5].style.transform = `translateY(${-(+f2[0] + (f2[1] === '5' && f2[0] === '1' ? ffrac : 0)) * 9.0909}%)`;
    this.odo[6].style.transform = `translateY(${-(+f2[1] + ffrac) * 9.0909}%)`;
  }
}
