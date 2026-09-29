import * as THREE from 'three';
import { makePlateTexture } from './plates.js';

// ---------------------------------------------------------------------------------------
// Shared GLSL: cheap value noise + finite-difference bump in object space.
// Object space keeps the texture glued to moving parts (doors, exploded groups).
// ---------------------------------------------------------------------------------------
// Value noise comes from a tiling 64^3 texture: one trilinear fetch instead of a pile of
// hash arithmetic (keeps shader compile time low on D3D/ANGLE and runs faster too).
let noiseTex = null;
export function noiseTexture() {
  if (noiseTex) return noiseTex;
  const N = 64;
  const data = new Uint8Array(N * N * N);
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; data[i] = seed >> 23; }
  noiseTex = new THREE.Data3DTexture(data, N, N, N);
  noiseTex.format = THREE.RedFormat;
  noiseTex.minFilter = THREE.LinearFilter;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.wrapS = noiseTex.wrapT = noiseTex.wrapR = THREE.RepeatWrapping;
  noiseTex.unpackAlignment = 1;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

const NOISE_GLSL = /* glsl */`
uniform highp sampler3D uNoise3D;
float mk_noise(vec3 x){ return texture(uNoise3D, x * 0.015625).r; }
float mk_fbm(vec3 p){ return 0.55*mk_noise(p) + 0.3*mk_noise(p*2.07+3.1) + 0.15*mk_noise(p*4.13+7.7); }
// crinkle: ridged noise reads like wrinkle-finish paint
float mk_crinkle(vec3 p){ float n = mk_noise(p); float m = mk_noise(p*2.3+7.1); return 1.0-abs(n*2.0-1.0)*0.7 - abs(m*2.0-1.0)*0.3; }
`;

// kinds: 'crinkle' (black wrinkle paint), 'hammer' (hammertone), 'peel' (orange-peel enamel),
// 'brushed' (machined metal), 'plaster', 'floor', 'wood', 'none'
function surfaceShader(mat, opts) {
  const { kind = 'none', scale = 400, bump = 0.4, rough = 0.1, wear = 0.0, section = false } = opts;
  mat.userData.surface = opts;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSectionColor = { value: new THREE.Color(0.13, 0.022, 0.016) };
    shader.uniforms.uNoise3D = { value: noiseTexture() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 metricScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));\nvObjPos = position * metricScale;\nvObjNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNrm;\nuniform vec3 uSectionColor;\n${NOISE_GLSL}
float mk_height(vec3 p){
  ${kind === 'crinkle' ? 'return mk_crinkle(p*' + scale.toFixed(1) + ') ;' : ''}
  ${kind === 'hammer' ? 'float a = mk_noise(p*' + scale.toFixed(1) + '); float b = mk_noise(p*' + (scale * 2.6).toFixed(1) + '); return smoothstep(0.25,0.75,a)*0.8+b*0.2;' : ''}
  ${kind === 'peel' ? 'return mk_fbm(p*' + scale.toFixed(1) + ');' : ''}
  ${kind === 'brushed' ? 'return mk_noise(vec3(p.x*' + (scale * 0.02).toFixed(2) + ', p.y*' + scale.toFixed(1) + ', p.z*' + scale.toFixed(1) + '));' : ''}
  ${kind === 'plaster' ? 'return mk_fbm(p*' + scale.toFixed(1) + ')*0.7 + mk_noise(p*' + (scale * 7.0).toFixed(1) + ')*0.3;' : ''}
  ${kind === 'floor' || kind === 'wood' || kind === 'none' ? 'return 0.0;' : ''}
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  float mkH = mk_height(vObjPos);
  {
    float hN = mkH;
    roughnessFactor = clamp(roughnessFactor + (hN-0.5)*${rough.toFixed(3)}, 0.02, 1.0);
    ${kind === 'floor' ? `
    // 30 cm linoleum tiles, alternating tone, with worn centre path
    vec2 t = vObjPos.xz / 0.3048;
    vec2 ti = floor(t); vec2 tf = fract(t);
    float checker = mod(ti.x + ti.y, 2.0);
    float grout = smoothstep(0.0, 0.012, tf.x) * smoothstep(0.0, 0.012, tf.y) * smoothstep(0.0,0.012,1.0-tf.x) * smoothstep(0.0,0.012,1.0-tf.y);
    float mottle = mk_fbm(vec3(vObjPos.xz*7.0, 1.0));
    diffuseColor.rgb *= mix(0.55, 1.0, checker) * (0.78 + 0.35*mottle);
    diffuseColor.rgb *= mix(0.6, 1.0, grout);
    roughnessFactor = clamp(roughnessFactor + (mottle-0.5)*0.35 - checker*0.08, 0.1, 1.0);
    ` : ''}
    ${kind === 'wood' ? `
    float grain = sin(vObjPos.x*260.0 + mk_fbm(vObjPos*vec3(3.0,40.0,40.0))*9.0);
    diffuseColor.rgb *= 0.82 + 0.18*grain;
    ` : ''}
    ${wear > 0 ? `
    float w = mk_fbm(vObjPos*23.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*1.35 + 0.02, smoothstep(0.72, 0.9, w)*${wear.toFixed(2)});
    ` : ''}
  }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  ${kind !== 'none' && kind !== 'floor' && kind !== 'wood' ? `
  {
    // bump from object-space height (screen-space derivatives, as three's bump map does);
    // faded out when the pattern gets smaller than a pixel to avoid sparkle
    float h = mkH;
    float fade = 1.0 - smoothstep(0.35, 1.0, length(fwidth(vObjPos)) * ${scale.toFixed(1)});
    vec2 dH = vec2(dFdx(h), dFdy(h)) * ${bump.toFixed(3)} * fade;
    vec3 sx = normalize(dFdx(-vViewPosition));
    vec3 sy = normalize(dFdy(-vViewPosition));
    vec3 R1 = cross(sy, normal); vec3 R2 = cross(normal, sx);
    float det = dot(sx, R1) * faceDirection;
    vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
    normal = normalize(abs(det) * normal - grad);
  }` : ''}
  ${section ? 'if (!gl_FrontFacing) { normal = normalize(vNormal); }' : ''}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  ${section ? 'if (!gl_FrontFacing) { gl_FragColor.rgb = uSectionColor * (0.55 + 0.45 * mk_noise(vObjPos*900.0)); }' : ''}`);
  };
  mat.customProgramCacheKey = () => JSON.stringify(opts);
  return mat;
}

const SPECS = {
  // projector
  paint_black: { color: 0x0b0b0c, rough: 0.62, metal: 0.0, env: 0.55, surf: { kind: 'crinkle', scale: 700, bump: 0.38, rough: 0.18, wear: 0.25 } },
  paint_lamp: { color: 0x2c302e, rough: 0.4, metal: 0.4, surf: { kind: 'hammer', scale: 220, bump: 0.3, rough: 0.16, wear: 0.25 } },
  enamel_ivory: { color: 0x9c937c, rough: 0.34, metal: 0, clearcoat: 0.3, ccr: 0.25, surf: { kind: 'peel', scale: 140, bump: 0.25, rough: 0.12, wear: 0.0 } },
  steel: { color: 0xa9a9a4, rough: 0.23, metal: 1, surf: { kind: 'brushed', scale: 1400, bump: 0.08, rough: 0.12 } },
  steel_dark: { color: 0x4a4a47, rough: 0.36, metal: 1, surf: { kind: 'brushed', scale: 900, bump: 0.08, rough: 0.14 } },
  steel_black: { color: 0x0a0a0a, rough: 0.42, metal: 0.75 },
  shutter_blade: { color: 0x5b5a56, rough: 0.42, metal: 1, surf: { kind: 'brushed', scale: 700, bump: 0.1, rough: 0.12 } },
  chrome: { color: 0xe4e4e0, rough: 0.07, metal: 1 },
  aluminium: { color: 0xc6c6c0, rough: 0.3, metal: 1, surf: { kind: 'brushed', scale: 1800, bump: 0.1, rough: 0.12 } },
  brass: { color: 0xc9a05a, rough: 0.28, metal: 1 },
  lens_gold: { color: 0xb08240, rough: 0.3, metal: 1, surf: { kind: 'brushed', scale: 2200, bump: 0.05, rough: 0.08 } },
  bakelite: { color: 0x0c0806, rough: 0.2, metal: 0, clearcoat: 0.6, ccr: 0.15 },
  ivory_handle: { color: 0xa89f88, rough: 0.22, metal: 0, clearcoat: 0.5, ccr: 0.2 },
  rubber: { color: 0x0b0b0b, rough: 0.82, metal: 0 },
  cable: { color: 0x0a0a0a, rough: 0.55, metal: 0 },
  copper: { color: 0xb87350, rough: 0.35, metal: 1 },
  cut_red: { color: 0x8e1a0c, rough: 0.55, metal: 0 },
  casting_inner: { color: 0x4f534b, rough: 0.72, metal: 0, surf: { kind: 'peel', scale: 90, bump: 0.35, rough: 0.12 } },
  felt: { color: 0x0d0b0a, rough: 0.95, metal: 0 },
  duct: { color: 0x8a8a86, rough: 0.42, metal: 1, surf: { kind: 'brushed', scale: 300, bump: 0.2, rough: 0.2 } },
  reel: { color: 0x6f6f6a, rough: 0.45, metal: 1, surf: { kind: 'brushed', scale: 900, bump: 0.06, rough: 0.1 } },
  gear: { color: 0x8c877a, rough: 0.3, metal: 1 },
  tungsten: { color: 0x8a8a8d, rough: 0.3, metal: 1 },
  mirror: { color: 0xf0e8f5, rough: 0.035, metal: 1 },
  // booth
  wall_paint: { color: 0x2b2e2a, rough: 0.9, metal: 0, surf: { kind: 'plaster', scale: 9, bump: 0.8, rough: 0.1 } },
  wall_lower: { color: 0x141614, rough: 0.55, metal: 0, surf: { kind: 'plaster', scale: 12, bump: 0.5, rough: 0.2 } },
  wall_stripe: { color: 0x7a1710, rough: 0.5, metal: 0 },
  ceiling: { color: 0x1e1e1c, rough: 0.95, metal: 0, surf: { kind: 'plaster', scale: 6, bump: 0.6, rough: 0.05 } },
  floor: { color: 0x3a1c14, rough: 0.5, metal: 0, surf: { kind: 'floor' } },
  floor_mat: { color: 0x0c0c0c, rough: 0.9, metal: 0, surf: { kind: 'peel', scale: 60, bump: 0.6, rough: 0.1 } },
  wood: { color: 0x5c3820, rough: 0.42, metal: 0, clearcoat: 0.3, ccr: 0.3, surf: { kind: 'wood' } },
  wood_dark: { color: 0x2a180c, rough: 0.5, metal: 0, surf: { kind: 'wood' } },
  steel_cab: { color: 0x323833, rough: 0.48, metal: 0.25, surf: { kind: 'hammer', scale: 120, bump: 0.25, rough: 0.2, wear: 0.3 } },
  can_tin: { color: 0x8f918e, rough: 0.4, metal: 1, surf: { kind: 'peel', scale: 30, bump: 0.3, rough: 0.2 } },
  can_blue: { color: 0x1f3345, rough: 0.45, metal: 0.4, surf: { kind: 'hammer', scale: 70, bump: 0.3, rough: 0.2, wear: 0.5 } },
  paper: { color: 0xd8cfb4, rough: 0.85, metal: 0 },
  masking: { color: 0x010101, rough: 1, metal: 0, env: 0 },
  seat: { color: 0x160403, rough: 0.9, metal: 0, env: 0 },
  aud_wall: { color: 0x030202, rough: 0.95, metal: 0, env: 0 },
  curtain: { color: 0x1a0403, rough: 0.9, metal: 0, env: 0 },
  enamel_shade: { color: 0x1f2621, rough: 0.3, metal: 0.2, clearcoat: 0.5, ccr: 0.2 },
  conduit: { color: 0x5d5d5a, rough: 0.5, metal: 1 },
  film_pack: { color: 0x1a120d, rough: 0.35, metal: 0 },
};

const TRANSPARENT = {
  glass: { color: 0xdfeeee, opacity: 0.1, rough: 0.03, env: 1.4 },
  glass_lens: { color: 0x6a5a9a, opacity: 0.55, rough: 0.02, env: 2.0 },
  quartz: { color: 0xffffff, opacity: 0.16, rough: 0.02, env: 1.5 },
  glass_heat: { color: 0x7fd6cf, opacity: 0.28, rough: 0.03, env: 1.2 },
  oil_glass: { color: 0xc98a2a, opacity: 0.55, rough: 0.05, env: 1.2 },
};

export const EMISSIVE = {
  emit_arc: { color: 0xffffff, emissive: 0xfff1dc, intensity: 0 },
  emit_pilot: { color: 0x3a0503, emissive: 0xff2a10, intensity: 0 },
  emit_exciter: { color: 0x442a10, emissive: 0xffb060, intensity: 0 },
  emit_bulb: { color: 0xffe0b0, emissive: 0xffb567, intensity: 5.0 },
  glass_dark: { color: 0x061210, emissive: 0x1d6a4a, intensity: 0 },
};

const cache = new Map();

export function buildMaterial(src, envMap) {
  const name = src.name;
  if (cache.has(name)) return cache.get(name);
  let m;
  if (name.startsWith('plate_')) {
    const tex = makePlateTexture(name);
    m = new THREE.MeshStandardMaterial({ map: tex, color: 0xb8b2a6, metalness: name === 'plate_card' || name.startsWith('plate_sign') || name === 'plate_exit' || name === 'plate_leader' || name.startsWith('plate_can') ? 0.0 : 0.35, roughness: 0.5 });
    if (name === 'plate_ammeter') { m.metalness = 0; m.roughness = 0.5; }
  } else if (name === 'screen') {
    m = new THREE.MeshBasicMaterial({ color: 0x000000 });        // replaced by the screen shader
  } else if (TRANSPARENT[name]) {
    const s = TRANSPARENT[name];
    m = new THREE.MeshPhysicalMaterial({ color: s.color, transparent: true, opacity: s.opacity, roughness: s.rough,
      metalness: 0, envMapIntensity: s.env, depthWrite: false, side: THREE.DoubleSide, specularIntensity: 1, ior: 1.5 });
  } else if (EMISSIVE[name]) {
    const s = EMISSIVE[name];
    m = new THREE.MeshStandardMaterial({ color: s.color, emissive: s.emissive, emissiveIntensity: s.intensity, roughness: 0.3 });
  } else {
    const s = SPECS[name];
    if (!s) {
      m = src.clone();
    } else {
      m = s.clearcoat
        ? new THREE.MeshPhysicalMaterial({ color: s.color, roughness: s.rough, metalness: s.metal, clearcoat: s.clearcoat, clearcoatRoughness: s.ccr || 0.3 })
        : new THREE.MeshStandardMaterial({ color: s.color, roughness: s.rough, metalness: s.metal });
      if (s.env !== undefined) m.envMapIntensity = s.env;
      if (s.surf) surfaceShader(m, s.surf);
    }
  }
  m.name = name;
  cache.set(name, m);
  return m;
}

// clone a material for a cut-away (section) variant sharing the same look
export function sectionVariant(mat, planes) {
  const m = mat.clone();
  m.name = mat.name + '#section';
  m.side = THREE.DoubleSide;
  m.clippingPlanes = planes;
  m.clipShadows = true;
  const opts = { ...(mat.userData.surface || { kind: 'none' }), section: true };
  surfaceShader(m, opts);
  return m;
}

export function getCachedMaterial(name) { return cache.get(name); }
