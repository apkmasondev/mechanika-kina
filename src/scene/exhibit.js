import * as THREE from 'three';
import { Mechanism, TAU } from './mechanism.js';
import { FilmSystem } from './film.js';
import { Beams } from './beam.js';
import { makeScreenMaterial } from './screen.js';
import { buildMaterial, sectionVariant, getCachedMaterial } from './materials.js';
import { updateCounter, updateAmmeter } from './plates.js';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Exhibit {
  constructor(renderer, layout, gltf, atlas) {
    this.renderer = renderer;
    this.L = layout;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020202);
    this.mech = new Mechanism(layout);
    this.atlas = atlas;
    this.nodes = {};
    this.time = 0;

    // visual state (targets are set by modes, values are damped)
    this.s = {
      dim: 0, dimT: 0,                 // light-path isolation
      haze: 0.3, hazeT: 0.3,
      explode: 0, explodeT: 0,
      filmVis: 1, filmVisT: 1,
      rays: 0, raysT: 0,
      cone: 0, coneT: 0,
      filmHi: 0, filmHiT: 0,
      cut: null,
      cover: 0, coverT: 0,
    };
    this.doorAngles = {};
    this.doorTargets = {};

    this.setupScene(gltf.scene);
    this.setupLights();
    this.film = new FilmSystem(layout, atlas, this.mech);
    this.scene.add(this.film.mesh);
    this.setupPacks();
    this.beams = new Beams(layout, this.scene);
    this.film.update();
  }

  // ---------------------------------------------------------------------------------------
  setupScene(root) {
    this.scene.add(root);
    const L = this.L;
    // SLOW view: the hollow casting is sectioned just behind the gate, exposing the shutter chamber
    // (2 mm behind the compartment's rear wall, never on a modelled face)
    const sectionPlanes = { rear: [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.037)] };
    this.sectionPlanes = sectionPlanes;
    this.sectionMeshes = [];
    root.traverse((o) => {
      if (o.name) this.nodes[o.name] = o;
      if (!o.isMesh) return;
      const inBooth = this.ancestor(o, 'GRP_booth') || this.ancestor(o, 'GRP_auditorium');
      o.castShadow = !inBooth || /bench|equipment/.test(this.partName(o));
      o.receiveShadow = true;
      const srcMat = o.material;
      if (srcMat.name === 'screen') {
        this.screenMat = makeScreenMaterial(this.atlas);
        o.material = this.screenMat;
        o.castShadow = false;
        return;
      }
      o.material = buildMaterial(srcMat);
      if (o.material.transparent) { o.castShadow = false; o.renderOrder = 5; }
      const part = this.partName(o);
      if (part === 'head' || part === 'COVER_gearside') {
        o.userData.baseMat = o.material;
        o.userData.cutMats = { rear: sectionVariant(o.material, sectionPlanes.rear) };
        this.sectionMeshes.push(o);
      }
    });
    // base positions for animated / exploded nodes
    for (const [name, n] of Object.entries(this.nodes)) {
      n.userData.basePos = n.position.clone();
      n.userData.baseQuat = n.quaternion.clone();
    }
    for (const name of Object.keys(L.doors)) { this.doorAngles[name] = 0; this.doorTargets[name] = 0; }

    // Explicit pivots.  Meshopt quantisation bakes a dequantisation offset into each node, so a
    // node's origin ends up in the middle of its bounding box, not on its hinge or shaft.  Every
    // moving part therefore hangs under a helper placed exactly on the axis from layout.json.
    this.pivots = {};
    root.updateMatrixWorld(true);
    const wrap = (name, axisPoint) => {
      const node = this.nodes[name];
      if (!node || !axisPoint) return;
      const parent = node.parent;
      const pivot = new THREE.Object3D();
      pivot.name = name + ':pivot';
      parent.add(pivot);
      pivot.position.copy(parent.worldToLocal(new THREE.Vector3(...axisPoint)));
      pivot.updateMatrixWorld(true);
      pivot.attach(node);
      this.pivots[name] = pivot;
    };
    for (const [name, cfg] of Object.entries(L.doors)) wrap(name, cfg.pivot);
    for (const [name, cfg] of Object.entries(L.anim)) wrap(name, cfg.pivot || cfg.center);
    this.nodes.CUT_int_case && (this.nodes.CUT_int_case.visible = false);
    this.emissive = {
      arc: getCachedMaterial('emit_arc'), pilot: getCachedMaterial('emit_pilot'), exciter: getCachedMaterial('emit_exciter'),
      viewer: getCachedMaterial('glass_dark'), mirror: getCachedMaterial('mirror'), bulb: getCachedMaterial('emit_bulb'),
    };
  }

  ancestor(o, name) { for (let p = o; p; p = p.parent) if (p.name === name) return p; return null; }
  // GLTFLoader turns a multi-material node into a Group of primitive meshes; groups from
  // Blender empties arrive as plain Object3D.  The "part" is the Blender object name.
  partName(o) { return o.parent && o.parent.type === 'Group' && o.parent.parent ? o.parent.name : o.name; }

  setupLights() {
    const L = this.L;
    const scene = this.scene;
    this.hemi = new THREE.HemisphereLight(0x5a5046, 0x0e0b09, 0.8);
    scene.add(this.hemi);

    const cl = L.anchors.ceiling_lamp;
    this.key = new THREE.SpotLight(0xffc98f, 26, 9, 0.62, 0.75, 2.0);
    this.key.position.set(cl[0], cl[1], cl[2]);
    this.key.target.position.set(-0.15, 1.15, 0.1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.00015;
    this.key.shadow.normalBias = 0.012;
    this.key.shadow.camera.near = 0.2;
    this.key.shadow.camera.far = 4.5;
    this.key.shadow.radius = 3;
    scene.add(this.key, this.key.target);

    const bl = L.anchors.bench_lamp;
    this.bench = new THREE.SpotLight(0xffc27c, 16, 5, 0.95, 0.8, 2.0);
    this.bench.position.set(bl[0], bl[1], bl[2]);
    this.bench.target.position.set(bl[0], 0.9, bl[2] - 0.15);
    scene.add(this.bench, this.bench.target);

    // practical bulkhead lamp on the switch-gear wall (gives the booth some depth)
    this.wallLamp = new THREE.PointLight(0xffb266, 4.5, 4.5, 2);
    this.wallLamp.position.set(...L.anchors.wall_lamp);
    scene.add(this.wallLamp);
    // cool fill from the auditorium through the ports + warm lamphouse leak
    this.portFill = new THREE.PointLight(0x9fb4d8, 0.0, 4, 2);
    this.portFill.position.set(L.room.x[1] - 0.25, L.film.AY + 0.1, L.film.ZF + 0.3);
    scene.add(this.portFill);
    // one light for the lamphouse: leaks above the roof when closed, lights the interior when open
    this.lampLight = new THREE.PointLight(0xffc690, 0.0, 2.5, 2);
    this.lampLight.position.set(-0.62, 1.78, L.film.ZF);
    scene.add(this.lampLight);
    // rim light from behind (booth back wall practical), gives the silhouette a warm edge
    this.rim = new THREE.SpotLight(0xffb36b, 22, 8, 0.55, 0.9, 2);
    this.rim.position.set(-2.6, 2.4, -0.9);
    this.rim.target.position.set(-0.1, 1.4, 0.1);
    scene.add(this.rim, this.rim.target);
    // Inspection fill comes on with the removed rear cover; it reveals the gear teeth.
    this.inspection = new THREE.PointLight(0xdce6f2, 0, 2.0, 2);
    this.inspection.position.set(-0.05, 1.42, -0.72);
    scene.add(this.inspection);

    this.lightBase = { hemi: this.hemi.intensity, key: this.key.intensity, bench: this.bench.intensity, rim: this.rim.intensity };
  }

  setupPacks() {
    const f = this.L.film;
    const mk = (center) => {
      const segs = 160;
      const pos = [], nrm = [], tag = [], idx = [];
      const z0 = f.ZF - f.FILM_W / 2 + 0.0004, z1 = f.ZF + f.FILM_W / 2 - 0.0004;
      const hub = f.reel_hub_r + 0.0005;
      // side faces (+z, -z) and outer band
      const ring = (z, nz, rOuterTag) => {
        const base = pos.length / 3;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * TAU, c = Math.cos(a), s = Math.sin(a);
          pos.push(c * hub, s * hub, z); nrm.push(0, 0, nz); tag.push(0);
          pos.push(c, s, z); nrm.push(0, 0, nz); tag.push(1);
        }
        for (let i = 0; i < segs; i++) {
          const a = base + i * 2;
          if (nz > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      };
      ring(z1, 1); ring(z0, -1);
      const base = pos.length / 3;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * TAU, c = Math.cos(a), s = Math.sin(a);
        pos.push(c, s, z0); nrm.push(c, s, 0); tag.push(1);
        pos.push(c, s, z1); nrm.push(c, s, 0); tag.push(1);
      }
      for (let i = 0; i < segs; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('tag', new THREE.Float32BufferAttribute(tag, 1));
      g.setIndex(idx);
      const uR = { value: 0.1 };
      const m = new THREE.MeshPhysicalMaterial({ color: 0x1b140f, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uR = uR;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float tag; uniform float uR; varying vec3 vP; varying float vTag;')
          .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.xy * mix(1.0, uR, tag), position.z); vP = transformed; vTag = abs(normal.z);');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vP; varying float vTag;\nfloat ph(float x){return fract(sin(x*91.7)*43758.5);}')
          .replace('#include <map_fragment>', `
            float r = length(vP.xy);
            float a = atan(vP.y, vP.x);
            float rings = ph(floor(r * 5200.0)) * 0.5 + ph(floor(r * 900.0 + sin(a * 3.0) * 0.4)) * 0.5;
            vec3 side = mix(vec3(0.05, 0.035, 0.025), vec3(0.16, 0.11, 0.075), rings);
            side *= 0.85 + 0.15 * sin(a * 2.0 + r * 40.0);
            diffuseColor.rgb = mix(vec3(0.012), side, vTag);
          `);
      };
      m.customProgramCacheKey = () => 'pack-v1';
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(center[0], center[1], 0);
      mesh.castShadow = true; mesh.receiveShadow = true;
      // Shadow passes must use the same radius deformation as the visible pack.
      const deformShadow = (material) => {
        material.onBeforeCompile = (sh) => {
          sh.uniforms.uR = uR;
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float tag; uniform float uR;')
            .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.xy * mix(1.0, uR, tag), position.z);');
        };
        material.customProgramCacheKey = () => 'pack-shadow-v1';
        return material;
      };
      mesh.customDepthMaterial = deformShadow(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
      mesh.customDistanceMaterial = deformShadow(new THREE.MeshDistanceMaterial());
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, f.ZF), Math.hypot(f.reel_r, f.FILM_W / 2));
      mesh.userData.uR = uR;
      this.scene.add(mesh);
      return mesh;
    };
    this.packFeed = mk(f.feed_reel);
    this.packTake = mk(f.take_reel);
    // packs follow their magazine groups when exploded
    this.nodes.GRP_mag_upper.attach(this.packFeed);
    this.nodes.GRP_mag_lower.attach(this.packTake);
  }

  // ---------------------------------------------------------------------------------------
  setDoors(open) { // open: {DOOR_head: 1, ...} fractions
    for (const k of Object.keys(this.doorTargets)) this.doorTargets[k] = open[k] || 0;
  }

  setCut(kind) {
    this.s.cut = kind;
    // 'gear' = the gear-side cover is lifted off (no sectioning needed: the casting is hollow)
    for (const o of this.sectionMeshes) o.material = kind === 'rear' ? o.userData.cutMats.rear : o.userData.baseMat;
    if (this.nodes.CUT_int_case) this.nodes.CUT_int_case.visible = kind === 'rear';
    if (this.nodes.INTACT_int_case) this.nodes.INTACT_int_case.visible = kind !== 'rear';
  }

  // ---------------------------------------------------------------------------------------
  update(dt, cameraPos) {
    this.time += dt;
    const m = this.mech;
    const L = this.L;
    m.update(dt);
    const s = this.s;
    for (const k of ['dim', 'haze', 'explode', 'filmVis', 'rays', 'cone', 'filmHi', 'cover']) {
      s[k] = damp(s[k], s[k + 'T'], k === 'explode' ? 2.2 : 3.2, dt);
    }

    const n = this.nodes;
    const f = L.film;
    // Texture coordinates wrap every 84 frames; shafts with arbitrary radii must not.
    const D = m.F * m.phase;
    const rot = (name, axis, a) => { const o = this.pivots[name]; if (o) o.rotation[axis] = a; };
    rot('ANIM_spr_feed', 'z', -D / f.R24);
    rot('ANIM_spr_hold', 'z', -D / f.R24);
    rot('ANIM_spr_s1', 'z', -D / f.R24);
    rot('ANIM_spr_s2', 'z', D / f.R24);
    rot('ANIM_drum', 'z', D / f.drum_r);
    rot('ANIM_g1', 'z', D / f.g1_r);
    rot('ANIM_spr_int', 'z', m.starAngle);
    rot('ANIM_cam', 'z', m.camAngle);
    rot('ANIM_shutter', 'x', m.shutterAngle);
    rot('ANIM_shutter_shaft', 'x', m.shutterAngle);
    rot('ANIM_vshaft', 'y', TAU * m.phase);
    rot('ANIM_reel_feed', 'z', m.reelFeedAngle);
    rot('ANIM_reel_take', 'z', m.reelTakeAngle);
    this.packFeed.rotation.z = m.reelFeedAngle;
    this.packTake.rotation.z = m.reelTakeAngle;
    this.packFeed.userData.uR.value = m.rFeed;
    this.packTake.userData.uR.value = m.rTake;
    if (n.ANIM_fire_shutter) n.ANIM_fire_shutter.position.y = n.ANIM_fire_shutter.userData.basePos.y + L.anim.ANIM_fire_shutter.open_dy * m.fireShutter;
    if (this.pivots.ANIM_douser) this.pivots.ANIM_douser.rotation[L.anim.ANIM_douser.axis] = L.anim.ANIM_douser.open * m.douser;

    // doors
    for (const [name, cfg] of Object.entries(L.doors)) {
      const node = this.pivots[name];
      if (!node) continue;
      this.doorAngles[name] = damp(this.doorAngles[name], this.doorTargets[name], 3.0, dt);
      node.rotation[cfg.axis] = cfg.open * ease(Math.min(1, Math.max(0, this.doorAngles[name])));
    }
    // gear-side cover slides away in the INSIDE view
    const cov = n.COVER_gearside;
    if (cov) {
      s.coverT = s.cut === 'gear' ? 1 : 0;
      cov.position.z = cov.userData.basePos.z - 0.35 * ease(s.cover);
      cov.visible = s.cover < 0.98;
    }
    // exploded view
    const ex = ease(Math.min(1, Math.max(0, s.explode)));
    for (const [g, off] of Object.entries(L.groups)) {
      const node = n[g];
      if (!node) continue;
      node.position.set(node.userData.basePos.x + off[0] * ex, node.userData.basePos.y + off[1] * ex, node.userData.basePos.z + off[2] * ex);
    }
    const filmShow = s.filmVis * (1 - ex);
    this.film.mesh.visible = filmShow > 0.02;

    // --- light chain ---------------------------------------------------------------
    const lampOn = m.lampOn ? 1 : 0;
    this.lamp = damp(this.lamp ?? 0, lampOn, lampOn ? 5 : 9, dt);
    const lamp = this.lamp;
    const instT = m.shutterTransmission();
    const avgT = m.meanTransmission;
    const rps = Math.abs(m.speed);                          // shutter revolutions per second
    const w = THREE.MathUtils.smoothstep(rps, 3.5, 9);       // flicker fusion blend
    const shutT = m.motorOn || rps > 0.01 ? instT * (1 - w) + avgT * w : instT;
    const douserT = m.douser;
    const fireT = m.fireShutter;
    const apLight = lamp * douserT * fireT;                  // light arriving at the aperture plane
    const screenB = apLight * shutT / Math.max(avgT, 0.01) * (1 - ex);
    this.screenBrightness = screenB;

    this.film.update();
    this.film.uniforms.uLight.value = apLight * (instT * (1 - w) + avgT * w) * 1.4;
    this.film.uniforms.uVis.value = THREE.MathUtils.lerp(0.34, 0.12, s.dim);
    this.film.uniforms.uHighlight.value = 0;
    this.film.flowUniforms.uOpacity.value = s.filmHi;
    this.film.flow.visible = s.filmHi > 0.01;
    this.film.uniforms.uTime.value = this.time;

    if (this.screenMat) {
      this.screenMat.uniforms.uAp.value = this.film.projectionFrames;
      this.screenMat.uniforms.uBright.value = screenB;
      this.screenMat.uniforms.uGhost.value = m.shutterEnabled ? 0 : w;
      this.screenMat.uniforms.uTime.value = this.time;
    }

    // beams
    const sh = L.shutter;
    const gates = [
      { x: -0.30, t: douserT },
      { x: sh.x, t: shutT },
      { x: -0.022, t: fireT },
    ];
    const vp = this.renderer.getSize(this._v2 || (this._v2 = new THREE.Vector2()));
    this.beams.update(this.time, {
      gates,
      projI: lamp * (1 - ex) * 0.55,
      haze: s.haze,
      coneI: lamp * s.cone * 0.1,
      rayI: s.rays * 0.7 * lamp * (1 - ex),
      motes: 0.9,
      px: vp.y * 0.0065 * this.renderer.getPixelRatio(),
      arcI: lamp * Math.max(s.cone, this.doorAngles.DOOR_lamp || 0) * (1 - ex),
      lensI: apLight * shutT * 0.3 * (1 - ex),
    });

    // emissive parts
    if (this.emissive.arc) this.emissive.arc.emissiveIntensity = 60 * lamp;
    if (this.emissive.viewer) this.emissive.viewer.emissiveIntensity = 0.45 * lamp;
    if (this.emissive.pilot) this.emissive.pilot.emissiveIntensity = m.motorOn ? 4 : 0.15;
    if (this.emissive.exciter) this.emissive.exciter.emissiveIntensity = m.motorOn ? 3 : 0;
    if (this.emissive.mirror) { this.emissive.mirror.emissive = this.emissive.mirror.emissive || new THREE.Color(); this.emissive.mirror.emissive.setRGB(0.9, 0.7, 0.95); this.emissive.mirror.emissiveIntensity = 0.12 * lamp * Math.max(s.cone, this.doorAngles.DOOR_lamp || 0); }

    // lights
    const dimK = 1 - 0.86 * s.dim;
    this.hemi.intensity = this.lightBase.hemi * dimK;
    this.key.intensity = this.lightBase.key * dimK;
    this.bench.intensity = this.lightBase.bench * (1 - 0.7 * s.dim);
    this.rim.intensity = this.lightBase.rim * dimK;
    this.inspection.intensity = 1.5 * s.cover;
    const lo = this.doorAngles.DOOR_lamp || 0;
    this.lampLight.position.set(THREE.MathUtils.lerp(-0.62, L.anchors.arc[0] + 0.05, lo), THREE.MathUtils.lerp(1.78, L.film.AY, lo), THREE.MathUtils.lerp(L.film.ZF, L.film.ZF + 0.14, lo));
    this.lampLight.intensity = lamp * THREE.MathUtils.lerp(0.9, 1.8, lo);
    this.portFill.intensity = 0.35 * screenB * (0.9 + 0.1 * Math.sin(this.time * 7.0));
    if (this.envIntensityBase !== undefined) this.scene.environmentIntensity = this.envIntensityBase * (1 - 0.7 * s.dim);

    // instruments
    const feet = m.totalFrames / 16;
    updateCounter(Math.floor(feet) + 1240, Math.floor(m.totalFrames) % 16);
    updateAmmeter(lamp * 58 + (lamp > 0.5 ? Math.sin(this.time * 3.1) * 0.6 : 0));
  }
}
