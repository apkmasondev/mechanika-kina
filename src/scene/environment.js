import * as THREE from 'three';

// A tiny stand-in of the booth for image-based reflections on chrome, glass and enamel:
// dark walls, a warm pendant lamp, the bench lamp and the cool glow of the port.
export function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 6), new THREE.MeshBasicMaterial({ color: 0x0b0b0a, side: THREE.BackSide }));
  room.position.y = 1.4;
  env.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshBasicMaterial({ color: 0x140a07 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01;
  env.add(floor);
  const panel = (w, h, color, intensity, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look);
    env.add(m);
  };
  panel(0.35, 0.35, 0xffc285, 4.5, [0.15, 2.7, 0.95], [0.15, 0, 0.95]);      // pendant
  panel(1.4, 0.8, 0xffd7a8, 0.7, [0.15, 2.55, 0.95], [0.15, 0, 0.95]);      // pendant spill on ceiling
  panel(0.25, 0.25, 0xffb870, 3, [-1.7, 1.7, 2.3], [-1.7, 0, 2.3]);         // bench lamp
  panel(0.5, 0.36, 0x9fb4d8, 1.2, [1.35, 1.3, 0.07], [0, 1.3, 0.07]);       // port glow
  panel(2.5, 1.0, 0x3a2e24, 1.0, [-3.1, 1.5, 0.5], [0, 1.5, 0.5]);          // back wall bounce
  panel(3.0, 0.5, 0x2a241e, 1.0, [0, 1.2, 2.9], [0, 1.2, 0]);               // op-side wall bounce
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.02);
  pm.dispose();
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}
