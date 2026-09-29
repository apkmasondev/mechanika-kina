import * as THREE from 'three';

// Projection beam (lens -> screen), lamp cone (reflector -> aperture) for the LIGHT view,
// a ray diagram, dust motes, and the arc glow.  All additive, no fog volumes.

const beamVert = /* glsl */`
varying vec3 vN; varying vec3 vWP; varying float vT; varying vec3 vView;
attribute float along;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWP = wp.xyz; vT = along;
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const beamFrag = /* glsl */`
uniform float uI; uniform float uHaze; uniform vec3 uColor; uniform float uTime;
uniform float uGateX[3]; uniform float uGateT[3];
varying vec3 vN; varying vec3 vWP; varying float vT; varying vec3 vView;
float h3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main(){
  float facing = abs(dot(normalize(vN), normalize(vView)));
  float body = pow(facing, 2.2) * 0.8;
  vec3 q = vWP * vec3(2.2, 3.0, 3.0) + vec3(-uTime*0.05, uTime*0.02, 0.0);
  float haze = 0.55 + 0.9 * n3(q) * n3(q*2.7 + 11.0);
  float smoke = smoothstep(0.5, 0.95, uHaze);
  if (smoke > 0.0) {
    vec3 w = vWP * vec3(1.6, 2.4, 2.4) + vec3(-uTime * 0.09, uTime * 0.035, uTime * 0.02);
    w += vec3(n3(w * 0.7), n3(w * 0.7 + 5.2), n3(w * 0.7 + 9.1)) * 1.8;     // domain warp -> curls
    float curls = smoothstep(0.35, 0.8, n3(w)) * 1.9 + 0.25;
    haze = mix(haze, haze * curls, smoke);
  }
  float gate = 1.0;
  for (int i=0;i<3;i++){ if (vWP.x > uGateX[i]) gate *= uGateT[i]; }
  float I = uI * uHaze * body * haze * gate * (FALLOFF_EXPR);
  gl_FragColor = vec4(uColor * I, 1.0);
}`;

function frustumGeometry(x0, x1, r0, halfW1, halfH1, y, z, segs = 48, rings = 48, rect = true) {
  // loft from a circle of radius r0 at x0 to a rounded rectangle at x1
  const pos = [], nrm = [], along = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const tt = Math.pow(t, 1.8);          // denser rings near the lens
    const x = x0 + (x1 - x0) * tt;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      // superellipse for the rectangle end
      const p = rect ? 8 : 2;
      const k = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
      const ry = r0 + (halfH1 * (rect ? k : 1) - r0) * tt;
      const rz = r0 + (halfW1 * (rect ? k : 1) - r0) * tt;
      pos.push(x, y + s * ry, z + c * rz);
      nrm.push(0, s, c);
      along.push(tt);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  return g;
}

function beamMaterial(falloff) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uI: { value: 0 }, uHaze: { value: 0.3 }, uColor: { value: new THREE.Color(1.0, 0.9, 0.76) }, uTime: { value: 0 },
      uGateX: { value: [99, 99, 99] }, uGateT: { value: [1, 1, 1] },
    },
    vertexShader: beamVert,
    fragmentShader: beamFrag.replace('FALLOFF_EXPR', falloff),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export class Beams {
  constructor(layout, scene) {
    this.L = layout;
    const AY = layout.film.AY, ZF = layout.film.ZF;
    const scr = layout.screen;
    const lensX = layout.anchors.lens_front[0];
    this.group = new THREE.Group();
    this.group.name = 'BEAMS';
    scene.add(this.group);

    // projection beam: lens exit pupil -> projected picture on the screen (aperture ratio 1.375)
    const g = frustumGeometry(lensX, scr.x - 0.02, 0.026, scr.w / 2, scr.h / 2, AY, ZF, 48, 64, true);
    this.projMat = beamMaterial('(0.35 + 0.65 * (1.0 - smoothstep(0.0, 0.9, vT))) * (1.0 - smoothstep(0.985, 1.0, vT))');
    this.proj = new THREE.Mesh(g, this.projMat);
    this.proj.frustumCulled = false;
    this.proj.renderOrder = 10;
    this.group.add(this.proj);

    // lamp cone: reflector rim -> F2 (aperture), used in the LIGHT view
    const rimX = layout.anchors.reflector_rim_x;
    const rimR = layout.anchors.reflector_rim_r;
    const g2 = frustumGeometry(rimX, -0.001, rimR, 0.006, 0.006, AY, ZF, 48, 40, false);
    this.coneMat = beamMaterial('(0.6 + 1.4 * smoothstep(0.4, 1.0, vT))');
    this.cone = new THREE.Mesh(g2, this.coneMat);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 11;
    this.group.add(this.cone);

    // ray diagram (LIGHT view): arc -> reflector -> aperture -> lens -> screen
    this.rays = this.buildRays(layout);
    this.group.add(this.rays);

    // dust motes floating in the booth, lit only inside the beam
    this.motes = this.buildMotes(layout);
    this.group.add(this.motes);

    // arc glow sprite
    const glowTex = radialTexture();
    this.arcGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff2dd, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.arcGlow.position.set(...layout.anchors.arc);
    this.arcGlow.scale.setScalar(0.09);
    this.arcGlow.renderOrder = 12;
    this.group.add(this.arcGlow);

    // lens flare-ish glow at the lens front (seen from the screen side / in the intro framing)
    this.lensGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2b8, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lensGlow.position.set(lensX + 0.004, AY, ZF);
    this.lensGlow.scale.setScalar(0.07);
    this.group.add(this.lensGlow);
  }

  buildRays(L) {
    const AY = L.film.AY, ZF = L.film.ZF;
    const o = L.optics;
    const pts = [];
    const lensX = L.anchors.lens_front[0];
    const scr = L.screen;
    const along = [];
    // rays in several meridional planes
    for (let plane = 0; plane < 1; plane++) {
      const phi = plane * Math.PI / 3;
      const cy = Math.cos(phi), cz = Math.sin(phi);
      for (const sgn of [-1, 1]) {
        for (const frac of [0.15, 0.45, 0.75, 0.98]) {
          // point on the ellipsoid (relative x from hole to rim)
          const xr0 = -Math.sqrt(1 - (o.hole / o.b) ** 2) * o.a;
          const xr1 = -Math.sqrt(1 - (o.rim / o.b) ** 2) * o.a;
          const xrel = xr0 + (xr1 - xr0) * frac;
          const rad = o.b * Math.sqrt(1 - (xrel / o.a) ** 2);
          const R = new THREE.Vector3(o.cx + xrel, AY + sgn * rad * cy, ZF + sgn * rad * cz);
          const F1 = new THREE.Vector3(o.F1, AY, ZF);
          const F2 = new THREE.Vector3(0, AY, ZF);
          // after F2 the ray diverges, passes the lens and lands on the (inverted) screen position
          const dir = F2.clone().sub(R).normalize();
          const atLens = F2.clone().add(dir.clone().multiplyScalar((lensX - 0.02) / Math.max(0.2, dir.x)));
          atLens.y = AY + (atLens.y - AY) * 0.25; atLens.z = ZF + (atLens.z - ZF) * 0.25;
          const S = new THREE.Vector3(scr.x - 0.03, AY - sgn * cy * scr.h * 0.42 * frac, ZF - sgn * cz * scr.w * 0.42 * frac);
          const seg = [F1, R, F2, atLens, S];
          let acc = 0;
          for (let i = 0; i < seg.length - 1; i++) {
            const a = seg[i], b = seg[i + 1];
            const l = a.distanceTo(b);
            pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
            along.push(acc, acc + l);
            acc += l;
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    this.rayMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uGateX: { value: [99, 99, 99] }, uGateT: { value: [1, 1, 1] } },
      vertexShader: `attribute float along; varying float vA; varying vec3 vWP;
        void main(){ vA = along; vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform float uTime, uI; uniform float uGateX[3]; uniform float uGateT[3]; varying float vA; varying vec3 vWP;
        void main(){
          float g = 1.0; for (int i=0;i<3;i++){ if (vWP.x > uGateX[i]) g *= uGateT[i]; }
          float dash = 0.35 + 0.65 * smoothstep(0.55, 1.0, fract(vA * 9.0 - uTime * 1.6));
          float fade = 1.0 - smoothstep(1.6, 4.5, vA);
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.45) * uI * dash * g * fade, 1.0);
        }`,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const lines = new THREE.LineSegments(g, this.rayMat);
    lines.frustumCulled = false;
    lines.renderOrder = 13;
    return lines;
  }

  buildMotes(L) {
    const AY = L.film.AY, ZF = L.film.ZF;
    const n = 1400;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = 0.3 + Math.random() * 1.0;
      pos[i * 3 + 1] = AY + (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 2] = ZF + (Math.random() - 0.5) * 0.6;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const scr = L.screen;
    const lensX = L.anchors.lens_front[0];
    this.moteMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uPx: { value: 1 } },
      vertexShader: `attribute float seed; uniform float uTime, uPx; varying float vLit; varying float vSeed;
        void main(){
          vec3 p = position;
          float t = uTime * (0.02 + seed * 0.03);
          p += vec3(sin(t*3.1+seed*40.0)*0.06, sin(t*2.3+seed*17.0)*0.05 + fract(t*0.2+seed)*0.02, cos(t*2.7+seed*9.0)*0.06);
          // inside the beam frustum?
          float x = p.x - ${lensX.toFixed(4)};
          float k = clamp(x / ${(scr.x - lensX).toFixed(3)}, 0.0, 1.0);
          float hy = 0.026 + ${(scr.h / 2).toFixed(3)} * k, hz = 0.026 + ${(scr.w / 2).toFixed(3)} * k;
          float inY = 1.0 - smoothstep(hy*0.8, hy, abs(p.y - ${AY.toFixed(3)}));
          float inZ = 1.0 - smoothstep(hz*0.8, hz, abs(p.z - ${ZF.toFixed(3)}));
          vLit = step(0.0, x) * inY * inZ; vSeed = seed;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (0.45 + seed * 0.9) * (1.0 / -mv.z);
        }`,
      fragmentShader: `uniform float uI, uTime; varying float vLit; varying float vSeed;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard;
          float tw = 0.6 + 0.4*sin(uTime*2.0 + vSeed*50.0);
          gl_FragColor = vec4(vec3(1.0,0.9,0.75) * vLit * uI * tw * (1.0 - d*4.0) * 0.55, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const pts = new THREE.Points(g, this.moteMat);
    pts.frustumCulled = false;
    pts.renderOrder = 14;
    return pts;
  }

  // gates: [{x, t}] transmissions applied beyond the given planes (douser, shutter, fire shutter)
  update(time, s) {
    const gx = s.gates.map((q) => q.x), gt = s.gates.map((q) => q.t);
    for (const m of [this.projMat, this.coneMat, this.rayMat]) {
      m.uniforms.uTime.value = time;
      if (m.uniforms.uGateX) { m.uniforms.uGateX.value = gx; m.uniforms.uGateT.value = gt; }
    }
    this.projMat.uniforms.uI.value = s.projI;
    this.projMat.uniforms.uHaze.value = s.haze;
    this.proj.visible = s.projI * s.haze > 0.0005;
    this.coneMat.uniforms.uI.value = s.coneI;
    this.coneMat.uniforms.uHaze.value = 1.0;
    this.cone.visible = s.coneI > 0.001;
    this.rayMat.uniforms.uI.value = s.rayI;
    this.rays.visible = s.rayI > 0.001;
    this.moteMat.uniforms.uTime.value = time;
    const transmission = gt.reduce((a, b) => a * b, 1);
    this.moteMat.uniforms.uI.value = s.projI * s.motes * transmission;
    this.moteMat.uniforms.uPx.value = s.px;
    this.motes.visible = s.projI * s.motes * transmission > 0.001;
    this.arcGlow.material.opacity = s.arcI;
    this.arcGlow.visible = s.arcI > 0.001;
    this.arcGlow.scale.setScalar(0.06 + 0.05 * s.arcI);
    this.lensGlow.material.opacity = s.lensI;
    this.lensGlow.visible = s.lensI > 0.001;
  }
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,240,215,0.85)');
  g.addColorStop(0.35, 'rgba(255,200,140,0.25)');
  g.addColorStop(1, 'rgba(255,160,90,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
