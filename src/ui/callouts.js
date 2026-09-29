import * as THREE from 'three';

// Technical-drawing style callouts: a dot on the part, a hairline leader, a numbered label.
export class Callouts {
  constructor(layer, svg, camera, getGroupOffset, onFocus) {
    this.layer = layer; this.svg = svg; this.camera = camera;
    this.getGroupOffset = getGroupOffset;
    this.onFocus = onFocus;
    this.items = [];
    this.v = new THREE.Vector3();
    this.p = new THREE.Vector3();
    this.camDir = new THREE.Vector3();
    this.visible = true;
  }

  set(labels) {
    // retire old items with a fade
    for (const it of this.items) {
      it.el.classList.add('out'); it.line.classList.add('out'); it.dot.classList.add('out');
      it.el.inert = true;
      const { el, line, dot } = it;
      setTimeout(() => { el.remove(); line.remove(); dot.remove(); }, 450);
    }
    this.items = labels.map((lb, i) => {
      const el = document.createElement('button');
      el.className = 'co';
      el.innerHTML = `<span class="co-n">${lb.n}</span><span class="co-tx"><span class="co-t">${lb.t}</span>${lb.s ? `<span class="co-s">${lb.s}</span>` : ''}</span>`;
      el.style.setProperty('--d', `${120 + i * 60}ms`);
      el.addEventListener('click', () => this.onFocus(lb, this.worldPos(lb)));
      this.layer.appendChild(el);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('class', 'co-line');
      line.style.setProperty('--d', `${120 + i * 60}ms`);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '2.6');
      dot.setAttribute('class', 'co-dot');
      dot.style.setProperty('--d', `${120 + i * 60}ms`);
      this.svg.appendChild(line); this.svg.appendChild(dot);
      return { lb, el, line, dot, w: 0 };
    });
  }

  worldPos(lb, out = new THREE.Vector3()) {
    out.set(lb.a[0], lb.a[1], lb.a[2]);
    if (lb.g) out.add(this.getGroupOffset(lb.g));
    return out;
  }

  update(width, height) {
    const cam = this.camera;
    const camDir = cam.getWorldDirection(this.camDir);
    const resized = this.lastWidth !== width || this.lastHeight !== height;
    this.lastWidth = width; this.lastHeight = height;
    const compact = width <= 780;
    const rects = [];
    for (const selector of ['#placard', '#corner', '#card', '#timing.show', '#inset.show']) {
      const el = document.querySelector(selector);
      if (el && getComputedStyle(el).display !== 'none') rects.push(el.getBoundingClientRect());
    }
    const overlaps = (a, b) => a.left < b.right + 5 && a.right + 5 > b.left && a.top < b.bottom + 5 && a.bottom + 5 > b.top;
    for (const it of this.items) {
      const p = this.worldPos(it.lb, this.p);
      const toP = this.v.copy(p).sub(cam.position);
      const behind = toP.dot(camDir) < 0.05;
      this.v.copy(p).project(cam);
      const x = (this.v.x * 0.5 + 0.5) * width, y = (-this.v.y * 0.5 + 0.5) * height;
      const off = behind || x < -40 || x > width + 40 || y < -40 || y > height + 40 || !this.visible;
      it.el.classList.toggle('hidden', off);
      it.line.classList.toggle('hidden', off);
      it.dot.classList.toggle('hidden', off);
      if (off) continue;
      if (!it.w || resized) { it.w = it.el.offsetWidth || 120; it.h = it.el.offsetHeight || 28; }
      const h = it.h;
      let lx = x + it.lb.dx, ly = y + it.lb.dy;
      const left = it.lb.dx < 0;
      lx = Math.max(16 + (left ? it.w : 0), Math.min(width - 16 - (left ? 0 : it.w), lx));
      ly = Math.max(70, Math.min(height - 150, ly));
      let px = compact ? (left ? 12 : width - it.w - 12) : (left ? lx - it.w : lx);
      let py = ly - 11;
      const minY = compact ? 86 : 70;
      const maxY = Math.max(minY, height - (compact ? 170 : 126) - h);
      let chosen = null;
      for (let step = 0; step < 40; step++) {
        const shift = Math.ceil(step / 2) * (h + 6) * (step % 2 ? 1 : -1);
        const top = Math.max(minY, Math.min(maxY, py + shift));
        const candidate = { left: px, right: px + it.w, top, bottom: top + h };
        if (!rects.some((r) => overlaps(candidate, r))) { chosen = candidate; break; }
      }
      if (chosen) py = chosen.top;
      rects.push({ left: px, right: px + it.w, top: py, bottom: py + h });
      lx = left ? px + it.w : px;
      ly = py + h / 2;
      it.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      // leader: from the dot, diagonal to an elbow, then horizontal into the label
      const ex = lx + (left ? 10 : -10);
      it.line.setAttribute('points', `${x.toFixed(1)},${y.toFixed(1)} ${ex.toFixed(1)},${ly.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)}`);
      it.dot.setAttribute('cx', x.toFixed(1));
      it.dot.setAttribute('cy', y.toFixed(1));
    }
  }
}
