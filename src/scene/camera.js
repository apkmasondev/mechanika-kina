import * as THREE from 'three';

// Orbit rig around a target, with damping, limits, collision against simple proxies,
// and eased flights between authored shots.  Flights interpolate in spherical coordinates
// around a moving pivot so the camera arcs around the machine instead of cutting through it.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  constructor(camera, dom, layout) {
    this.camera = camera;
    this.dom = dom;
    this.L = layout;
    this.target = new THREE.Vector3(-0.2, 1.2, 0.07);
    this.sph = new THREE.Spherical(2.2, 1.3, 0.6);  // radius, phi (from +Y), theta (around Y from +Z)
    this.cur = { target: this.target.clone(), sph: this.sph.clone(), fov: camera.fov };
    this.fov = camera.fov;
    this.limits = { rMin: 0.28, rMax: 3.4, phiMin: 0.32, phiMax: 2.0 };
    this.flight = null;
    this.lastInput = performance.now();
    this.enabled = true;
    this.idleDrift = true;
    const pad = 0.035;
    this.boxes = layout.colliders.map((c) => new THREE.Box3(
      new THREE.Vector3(c.min[0] - pad, c.min[1] - pad, c.min[2] - pad),
      new THREE.Vector3(c.max[0] + pad, c.max[1] + pad, c.max[2] + pad)));
    const r = layout.room;
    this.room = new THREE.Box3(new THREE.Vector3(r.x[0] + 0.18, 0.25, r.z[0] + 0.18), new THREE.Vector3(r.x[1] - 0.12, r.y[1] - 0.15, r.z[1] - 0.18));
    this.targetBounds = new THREE.Box3(new THREE.Vector3(-1.3, 0.3, -0.6), new THREE.Vector3(0.9, 2.3, 0.8));
    this.bind();
  }

  bind() {
    const d = this.dom;
    let drag = null;
    const pointers = new Map();
    let pinch = null;
    const gesture = () => {
      const [a, b] = [...pointers.values()];
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    d.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (pointers.size >= 2) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) pinch = gesture();
      drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, id: e.pointerId };
      d.setPointerCapture(e.pointerId);
      this.touch();
    });
    d.addEventListener('pointermove', (e) => {
      if (!this.enabled || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const next = gesture();
        this.cancelFlight();
        this.sph.radius = clamp(this.sph.radius * pinch.distance / Math.max(1, next.distance), this.limits.rMin, this.limits.rMax);
        this.pan(next.x - pinch.x, next.y - pinch.y);
        pinch = next;
        this.touch();
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      this.cancelFlight();
      if (drag.pan) {
        this.pan(dx, dy);
      } else {
        this.sph.theta -= dx * 0.0055;
        this.sph.phi = clamp(this.sph.phi - dy * 0.0045, this.limits.phiMin, this.limits.phiMax);
      }
      this.touch();
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      pinch = null;
      if (pointers.size === 1) {
        const [id, p] = [...pointers][0];
        drag = { ...p, id, pan: false };
      } else drag = null;
    };
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    d.addEventListener('lostpointercapture', up);
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.cancelFlight();
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.dom.clientHeight : 1);
      const k = Math.exp(pixels * 0.0011);
      this.sph.radius = clamp(this.sph.radius * k, this.limits.rMin, this.limits.rMax);
      this.touch();
    }, { passive: false });
  }

  pan(dx, dy) {
    const s = this.sph.radius * 0.0012;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
    this.targetBounds.clampPoint(this.target, this.target);
  }

  touch() { this.lastInput = performance.now(); }
  cancelFlight() { if (this.flight) { this.flight = null; } }

  // shot: {pos:[x,y,z], target:[x,y,z], fov, rMin, rMax}
  flyTo(shot, duration = 2.2) {
    if (this.reducedMotion) duration = 0.0001;
    const tgt = new THREE.Vector3(...shot.target);
    const off = new THREE.Vector3(...shot.pos).sub(tgt);
    const sph = new THREE.Spherical().setFromVector3(off);
    // shortest azimuth path
    let dth = sph.theta - this.cur.sph.theta;
    dth = ((dth + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.flight = {
      t: 0, dur: duration,
      from: { target: this.cur.target.clone(), r: this.cur.sph.radius, phi: this.cur.sph.phi, theta: this.cur.sph.theta, fov: this.cur.fov },
      to: { target: tgt, r: sph.radius, phi: sph.phi, theta: this.cur.sph.theta + dth, fov: shot.fov ?? this.fov },
    };
    this.limits.rMin = shot.rMin ?? 0.28;
    this.limits.rMax = shot.rMax ?? 3.4;
    this.touch();
  }

  jumpTo(shot) {
    this.flyTo(shot, 0.0001);
    this.update(1);
  }

  update(dt) {
    const c = this.cur;
    if (this.flight) {
      const f = this.flight;
      f.t += dt / f.dur;
      const k = easeIO(Math.min(1, f.t));
      // lift the radius in the middle of long flights so we arc around the machine
      const span = f.from.target.distanceTo(f.to.target) + Math.abs(f.to.theta - f.from.theta) * 0.6;
      const lift = Math.sin(Math.PI * k) * Math.min(0.5, span * 0.25);
      this.target.lerpVectors(f.from.target, f.to.target, k);
      this.sph.radius = THREE.MathUtils.lerp(f.from.r, f.to.r, k) + lift;
      this.sph.phi = THREE.MathUtils.lerp(f.from.phi, f.to.phi, k);
      this.sph.theta = THREE.MathUtils.lerp(f.from.theta, f.to.theta, k);
      this.fov = THREE.MathUtils.lerp(f.from.fov, f.to.fov, k);
      c.target.copy(this.target); c.sph.copy(this.sph); c.fov = this.fov;
      if (f.t >= 1) this.flight = null;
    } else {
      // idle drift: a very slow breathing orbit after 14 s without input
      if (this.idleDrift && performance.now() - this.lastInput > 14000) {
        this.sph.theta += dt * 0.018 * Math.sin((performance.now() - this.lastInput) * 0.00005);
      }
      this.sph.radius = clamp(this.sph.radius, this.limits.rMin, this.limits.rMax);
      const k = 1 - Math.exp(-dt * 7);
      c.target.lerp(this.target, k);
      c.sph.radius += (this.sph.radius - c.sph.radius) * k;
      c.sph.phi += (this.sph.phi - c.sph.phi) * k;
      c.sph.theta += (this.sph.theta - c.sph.theta) * k;
      c.fov += (this.fov - c.fov) * k;
    }
    const pos = new THREE.Vector3().setFromSpherical(c.sph).add(c.target);
    this.resolve(pos, c.target);
    this.camera.position.copy(pos);
    this.camera.lookAt(c.target);
    // Preserve horizontal coverage when the viewport becomes portrait.
    const fov = Math.min(85, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * Math.max(1, 1.15 / this.camera.aspect))));
    if (Math.abs(this.camera.fov - fov) > 1e-3) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  // keep the eye out of solid proxies and inside the room
  resolve(pos, target) {
    this.room.clampPoint(pos, pos);
    const dir = new THREE.Vector3();
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!b.containsPoint(pos)) continue;
        // pull the eye towards the target until it leaves the box
        dir.subVectors(target, pos);
        if (dir.lengthSq() < 1e-10) dir.set(0, 0, -1);
        const ray = new THREE.Ray(target.clone(), dir.clone().negate().normalize());
        const hit = ray.intersectBox(b, new THREE.Vector3());
        if (hit) { pos.copy(hit).addScaledVector(ray.direction, b.containsPoint(target) ? 0.01 : -0.01); moved = true; }
      }
      if (!moved) break;
    }
    this.room.clampPoint(pos, pos);
  }
}
