import * as THREE from "three";
import type { ExperienceState, SetupContext, TickContext } from "../types";

let stateRef: BiometricTestState | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

// ── SHARED NOISE GLSL ──
const NOISE_GLSL = `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i); float b = hash(i + vec3(1,0,0));
  float c = hash(i + vec3(0,1,0)); float d = hash(i + vec3(1,1,0));
  float e = hash(i + vec3(0,0,1)); float f_ = hash(i + vec3(1,0,1));
  float g = hash(i + vec3(0,1,1)); float h = hash(i + vec3(1,1,1));
  float mix1 = mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  float mix2 = mix(mix(e,f_,f.x), mix(g,h,f.x), f.y);
  return mix(mix1,mix2,f.z);
}
float fbm(vec3 p) {
  float v = 0.0; float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p); p = p * 2.0 + shift; a *= 0.5;
  }
  return v;
}
`;

export interface BiometricTestState extends ExperienceState {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  trap: THREE.Group;
  leftDoor: THREE.Group;
  rightDoor: THREE.Group;
  heatmap: THREE.Mesh;
  particles: THREE.Points;
  floor: THREE.Mesh;
  wall: THREE.Mesh;
  glitchRing: THREE.Group;
  phase: number;
  trapOpacity: number;
  trapScale: number;
  spinSpeed: number;
}

// ── 1. VR Trap: ORTHOGONALE RIVALITÄT (Verschiedene Farben) ──
function buildVRBiometricTrap(camera: THREE.PerspectiveCamera): THREE.Group {
  const group = new THREE.Group();

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  ambientLight.layers.enable(1);
  ambientLight.layers.enable(2);
  group.add(ambientLight);

  const pointLight = new THREE.PointLight(0xffffff, 2.0);
  pointLight.position.set(0, 2, -1);
  pointLight.layers.enable(1);
  pointLight.layers.enable(2);
  group.add(pointLight);

  const createRivalryMaterial = (isVertical: boolean, colorHex: number) => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(colorHex) },
        uIsVertical: { value: isVertical ? 1.0 : 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIsVertical;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          float coord = mix(vUv.y, vUv.x, uIsVertical);
          float frequency = 40.0;
          float speed = 3.0;

          float stripe = sin(coord * frequency - uTime * speed);
          float pattern = smoothstep(-0.1, 0.1, stripe);

          float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);

          vec3 finalColor = uColor * pattern * 4.0;
          finalColor += uColor * fresnel * 2.0;

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  };

  const baseRadius = 0.15;
  const leftColor = 0xffaa00; // Gold/Orange
  const rightColor = 0x00ffff; // Cyan/Blau

  const leftGeo = new THREE.SphereGeometry(baseRadius, 32, 32);
  const leftMesh = new THREE.Mesh(
    leftGeo,
    createRivalryMaterial(false, leftColor),
  );
  leftMesh.position.set(0, 1.6, -2);
  leftMesh.layers.set(1);
  leftMesh.name = "leftEyeCircle";
  group.add(leftMesh);

  const rightGeo = new THREE.SphereGeometry(baseRadius, 32, 32);
  const rightMesh = new THREE.Mesh(
    rightGeo,
    createRivalryMaterial(true, rightColor),
  );
  rightMesh.position.set(0, 1.6, -2);
  rightMesh.layers.set(2);
  rightMesh.name = "rightEyeTriangle";
  group.add(rightMesh);

  const haloGeo = new THREE.SphereGeometry(baseRadius * 1.3, 32, 32);

  const leftHaloMat = new THREE.MeshBasicMaterial({
    color: leftColor,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const leftHalo = new THREE.Mesh(haloGeo, leftHaloMat);
  leftHalo.position.set(0, 1.6, -2);
  leftHalo.layers.set(1);
  group.add(leftHalo);

  const rightHaloMat = new THREE.MeshBasicMaterial({
    color: rightColor,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rightHalo = new THREE.Mesh(haloGeo, rightHaloMat);
  rightHalo.position.set(0, 1.6, -2);
  rightHalo.layers.set(2);
  group.add(rightHalo);

  camera.layers.enable(1);
  camera.layers.enable(2);

  return group;
}

// ── 2. Tür-Rahmen Builder (MAXIMAL DOMINANT) ──
function buildDoorFrame(isClosed: boolean, layer: number): THREE.Group {
  const group = new THREE.Group();

  const thickness = isClosed ? 0.3 : 0.15;
  const depth = isClosed ? 0.3 : 0.15;

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xaa00ff,
    emissive: 0x5500aa,
    emissiveIntensity: isClosed ? 150.0 : 4.0,
    metalness: 0.9,
    roughness: 0.1,
  });

  const pL = new THREE.Mesh(
    new THREE.BoxGeometry(thickness, 2.5, depth),
    frameMat,
  );
  pL.position.set(-0.55 - thickness / 2, 0, 0);
  const pR = new THREE.Mesh(
    new THREE.BoxGeometry(thickness, 2.5, depth),
    frameMat,
  );
  pR.position.set(0.55 + thickness / 2, 0, 0);
  const pT = new THREE.Mesh(
    new THREE.BoxGeometry(1.1 + thickness * 2, thickness, depth),
    frameMat,
  );
  pT.position.set(0, 1.25 + thickness / 2, 0);
  pT.name = "topBar";

  group.add(pL, pR, pT);

  if (isClosed) {
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      metalness: 1.0,
      roughness: 0.3,
    });

    const leftPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.53, 2.5, 0.15),
      doorMat,
    );
    leftPanel.position.set(-0.285, 0, 0);
    leftPanel.name = "leftPanel";
    group.add(leftPanel);

    const rightPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.53, 2.5, 0.15),
      doorMat,
    );
    rightPanel.position.set(0.285, 0, 0);
    rightPanel.name = "rightPanel";
    group.add(rightPanel);

    // ── GEKREUZTE SCHLOSS-BARREN (Ventilator) ──
    const lockGroup = new THREE.Group();
    lockGroup.name = "lockBar";
    lockGroup.position.set(0, 0, 0.15); // Etwas vor die Tür setzen

    const lockGeo = new THREE.BoxGeometry(2.5, 0.3, 0.15);

    function createBarMaterial(color1: THREE.Vector3, color2: THREE.Vector3): THREE.ShaderMaterial {
      return new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vUv;
          uniform vec3 uColor1;
          uniform vec3 uColor2;

          void main() {
            float coord = vUv.x;
            float frequency = 30.0;
            float speed = 12.0;
            float stripe = sin(coord * frequency - uTime * speed);
            float pattern = smoothstep(-0.1, 0.1, stripe);

            vec3 c1 = vec3(${color1.x}, ${color1.y}, ${color1.z});
            vec3 c2 = vec3(${color2.x}, ${color2.y}, ${color2.z});
            vec3 color = mix(c1, c2, pattern);
            color *= 2.0 + pattern * 2.0;

            float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
            color += c2 * pow(edge, 4.0) * 1.5;

            gl_FragColor = vec4(color, 1.0);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }

    const pinkMat = createBarMaterial(new THREE.Vector3(1.0, 0.0, 0.53), new THREE.Vector3(1.0, 0.2, 0.8));
    const blueMat = createBarMaterial(new THREE.Vector3(0.0, 0.3, 1.0), new THREE.Vector3(0.2, 0.6, 1.0));

    const bar1 = new THREE.Mesh(lockGeo, pinkMat);
    lockGroup.add(bar1);

    const bar2 = new THREE.Mesh(lockGeo, blueMat);
    bar2.rotation.z = Math.PI / 2;
    lockGroup.add(bar2);

    const bar3 = new THREE.Mesh(lockGeo, pinkMat);
    bar3.rotation.z = Math.PI / 4;
    lockGroup.add(bar3);

    const bar4 = new THREE.Mesh(lockGeo, blueMat);
    bar4.rotation.z = -Math.PI / 4;
    lockGroup.add(bar4);

    group.add(lockGroup);

    // ── DER LEUCHTENDE RISS ──
    const barrierMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGlitch: { value: 1.0 },
      },
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uGlitch;
        void main() {
          vec3 coreColor = vec3(1.0, 0.1, 0.2) * 3.0;
          gl_FragColor = vec4(coreColor * uGlitch, 1.0);
        }
      `,
      transparent: false,
    });

    const solidCenter = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 2.5, 0.1),
      barrierMat,
    );
    solidCenter.position.set(0, 0, 0);
    solidCenter.name = "energyBarrier";
    group.add(solidCenter);

    const crackGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 2.6, 0.2),
      new THREE.MeshBasicMaterial({
        color: 0xff0022,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    crackGlow.position.set(0, 0, 0.1);
    group.add(crackGlow);

    const doorLight = new THREE.PointLight(0xff0033, 300.0, 60);
    doorLight.position.set(0, 0, 1.5);
    doorLight.name = "doorLight";
    group.add(doorLight);
  }

  const haloScaleX = isClosed ? 2.2 : 1.4;
  const haloScaleY = isClosed ? 3.0 : 2.4;
  const haloOpacity = isClosed ? 0.6 : 0.1;
  const halo = new THREE.Mesh(
    new THREE.BoxGeometry(haloScaleX, haloScaleY, 0.3),
    new THREE.MeshBasicMaterial({
      color: isClosed ? 0xff0033 : 0xaa00ff,
      transparent: true,
      opacity: haloOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.position.set(0, 0, 0);
  group.add(halo);

  group.traverse((child) => {
    if (child instanceof THREE.Object3D) {
      child.layers.set(layer);
    }
  });

  return group;
}

// ── 3. HYPNO-VORTEX Heatmap ──
function buildHeatmap(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      ${NOISE_GLSL}
      uniform float uTime;
      varying vec3 vPos;

      void main() {
        vec3 p = normalize(vPos);
        float angle = atan(p.y, p.x);
        float radius = length(p.xy);
        float twist = angle + radius * 3.0 - uTime * 1.5;
        vec3 twistedPos = vec3(cos(twist) * radius, sin(twist) * radius, p.z + uTime * 1.0);

        float n = fbm(twistedPos * 4.0);
        float n2 = fbm(twistedPos * 6.0 - uTime * 0.3);
        float heat = smoothstep(0.1, 0.9, n * 0.5 + n2 * 0.5);

        vec3 c1 = vec3(0.05, 0.0, 0.2);
        vec3 c2 = vec3(0.0, 0.8, 0.6);
        vec3 c3 = vec3(1.0, 0.0, 0.5);

        vec3 color = mix(c1, c2, heat);
        color = mix(color, c3, sin(uTime * 2.0 + heat * 10.0) * 0.5 + 0.5);
        gl_FragColor = vec4(color * 0.7, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 32), mat);
  mesh.layers.set(1);
  mesh.layers.enable(2);
  return mesh;
}

// ── PERIPHERE GLITCH-STÖRER ──
function buildGlitchRing(): THREE.Group {
  const group = new THREE.Group();

  const geo = new THREE.OctahedronGeometry(0.5, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
  });

  for (let i = 0; i < 15; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 100, 0);
    group.add(mesh);
  }

  group.layers.enable(1);
  group.layers.enable(2);
  return group;
}

// ── 4. GPU PARTIKEL ──
function buildParticles(): THREE.Points {
  const countBig = 66;
  const countSmall = 6000;
  const totalCount = countBig + countSmall;

  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(totalCount * 3);
  const randoms = new Float32Array(totalCount);
  const sizes = new Float32Array(totalCount);
  const baseOpacities = new Float32Array(totalCount);

  for (let i = 0; i < totalCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 12.0;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 8.0;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 15.0;
    randoms[i] = Math.random();

    if (i < countBig) {
      sizes[i] = 10.0 + Math.random() * 14.0;
      baseOpacities[i] = 0.9;
    } else {
      sizes[i] = 3.0 + Math.random() * 6.0;
      baseOpacities[i] = 0.7;
    }
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aBaseOpacity", new THREE.BufferAttribute(baseOpacities, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      attribute float aRandom;
      attribute float aSize;
      attribute float aBaseOpacity;

      varying float vAlpha;
      varying vec3 vColor;

      void main() {
        vec3 pos = position;

        float speed = 2.0 + aRandom * 3.0;
        pos.z += uTime * speed;
        pos.z = mod(pos.z + 10.0, 20.0) - 10.0;

        pos.x += sin(uTime * 1.2 + aRandom * 20.0) * 1.5;
        pos.y += cos(uTime * 0.8 + aRandom * 15.0) * 1.0;

        vec3 color1 = vec3(0.9, 0.7, 1.0);
        vec3 color2 = vec3(1.0, 0.6, 0.8);
        vColor = mix(color1, color2, aRandom);

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

        gl_PointSize = aSize * (2.0 / max(-mvPosition.z, 0.5));
        gl_Position = projectionMatrix * mvPosition;

        float distFade = smoothstep(-10.0, -5.0, pos.z) * smoothstep(5.0, 0.0, pos.z);
        vAlpha = distFade * aBaseOpacity;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        if(d > 0.5) discard;

        float alpha = smoothstep(0.5, 0.1, d) * vAlpha;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  points.layers.set(1);
  points.layers.enable(2);
  return points;
}

// ── 5. MAUER MIT TÜR-AUSSPARUNG ──
function buildWall(): THREE.Mesh {
  const shape = new THREE.Shape();
  const wallW = 8;
  const wallH = 6;
  shape.moveTo(-wallW / 2, -wallH / 2);
  shape.lineTo(wallW / 2, -wallH / 2);
  shape.lineTo(wallW / 2, wallH / 2);
  shape.lineTo(-wallW / 2, wallH / 2);
  shape.lineTo(-wallW / 2, -wallH / 2);

  const hole = new THREE.Path();
  const doorW = 1.1;
  const doorH = 2.5;
  hole.moveTo(-doorW / 2, -doorH / 2);
  hole.lineTo(doorW / 2, -doorH / 2);
  hole.lineTo(doorW / 2, doorH / 2);
  hole.lineTo(-doorW / 2, doorH / 2);
  hole.lineTo(-doorW / 2, -doorH / 2);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.5,
    bevelEnabled: true,
    bevelSize: 0.05,
    bevelThickness: 0.05,
    bevelSegments: 3,
  });
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a0a2e,
    emissive: 0x330066,
    emissiveIntensity: 0.15,
    metalness: 0.3,
    roughness: 0.85,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 1.25, -3.0);
  mesh.layers.enable(0);
  mesh.layers.enable(1);
  mesh.layers.enable(2);
  return mesh;
}

// ── 6. Fraktaler Boden ──
function buildFractalFloor(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float wave = sin(pos.x * 0.5 + uTime * 0.8) * 0.15
                   + cos(pos.y * 0.7 + uTime * 0.6) * 0.1;
        pos.z += wave;
        vPos = pos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      ${NOISE_GLSL}
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vPos;

      void main() {
        vec2 p = vPos.xy * 0.3;
        float n = fbm(vec3(p, uTime * 0.05));
        float n2 = fbm(vec3(p * 2.0 - uTime * 0.1, uTime * 0.1));

        float fractal = smoothstep(0.4, 0.6, n * 0.5 + n2 * 0.5);

        vec3 baseColor = vec3(0.01, 0.0, 0.03);
        vec3 glowColor = vec3(0.6, 0.0, 1.0);

        vec2 grid = abs(fract(p * 1.5 - 0.5) - 0.5) / fwidth(p * 1.5);
        float line = min(grid.x, grid.y);
        float lineGlow = 1.0 - min(line, 1.0);

        vec3 finalColor = mix(baseColor, glowColor, fractal * 0.5 + lineGlow * 0.3);

        float dist = length(vPos.xy);
        float fade = exp(-dist * 0.05);

        vec3 fogColor = vec3(0.02, 0.0, 0.067);

        gl_FragColor = vec4(mix(fogColor, finalColor, fade), 1.0);
      }
    `,
    transparent: false,
    side: THREE.DoubleSide,
  });

  const geo = new THREE.PlaneGeometry(100, 100, 64, 64);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -3.0;
  mesh.layers.set(1);
  mesh.layers.enable(2);
  return mesh;
}

export async function setup(ctx: SetupContext): Promise<BiometricTestState> {
  const { scene, camera, renderer } = ctx;

  const fogColor = 0x050011;
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.FogExp2(fogColor, 0.12);

  const trap = buildVRBiometricTrap(camera);
  trap.visible = true;
  scene.add(trap);

  // Linke Tür = Offen (Layer 1)
  const leftDoor = buildDoorFrame(false, 1);
  leftDoor.position.set(0, 1.25, -3.0);
  leftDoor.visible = false;
  scene.add(leftDoor);

  // Rechte Tür = Geschlossen (Layer 2)
  const rightDoor = buildDoorFrame(true, 2);
  rightDoor.position.set(0, 1.25, -3.0);
  rightDoor.visible = false;
  scene.add(rightDoor);

  const heatmap = buildHeatmap();
  scene.add(heatmap);

  const particles = buildParticles();
  scene.add(particles);

  const floor = buildFractalFloor();
  scene.add(floor);

  const wall = buildWall();
  scene.add(wall);

  const glitchRing = buildGlitchRing();
  scene.add(glitchRing);

  keyHandler = (e: KeyboardEvent): void => {
    if (e.key === "a" || e.key === "1" || e.key === "A") {
      if (stateRef) stateRef.phase = stateRef.phase === 0 ? 1 : 0;
    }
  };
  document.addEventListener("keydown", keyHandler);

  renderer.xr.addEventListener("sessionstart", () => {
    const session = renderer.xr.getSession();
    if (session) {
      session.addEventListener("select", (event: XRSessionEvent) => {
        if (event.inputSource?.handedness === "right" && stateRef) {
          stateRef.phase = stateRef.phase === 0 ? 1 : 0;
        }
      });
    }
  });

  const state: BiometricTestState = {
    camera,
    renderer,
    trap,
    leftDoor,
    rightDoor,
    heatmap,
    particles,
    floor,
    wall,
    glitchRing,
    phase: 0,
    trapOpacity: 0.85,
    trapScale: 1,
    spinSpeed: 0.7,
  };
  stateRef = state;
  return state;
}

export function tick(
  state: ExperienceState,
  ctx: TickContext,
): { state: ExperienceState } {
  const s = state as BiometricTestState;
  const { elapsed } = ctx;

  if (s.heatmap && s.heatmap.material instanceof THREE.ShaderMaterial) {
    s.heatmap.material.uniforms.uTime.value = elapsed;
  }
  if (s.floor && s.floor.material instanceof THREE.ShaderMaterial) {
    s.floor.material.uniforms.uTime.value = elapsed;
  }
  if (s.particles && s.particles.material instanceof THREE.ShaderMaterial) {
    s.particles.material.uniforms.uTime.value = elapsed;
  }

  // ── STROBOSKOP & GLITCH LOGIK ──
  // Hier prüfen wir in diesem Fall die rightDoor, da sie in setup() als isClosed=true definiert wurde
  const energyBarrier = s.rightDoor.getObjectByName(
    "energyBarrier",
  ) as THREE.Mesh | null;
  const doorLight = s.rightDoor.getObjectByName(
    "doorLight",
  ) as THREE.PointLight | null;

  if (energyBarrier && doorLight) {
    (energyBarrier.material as THREE.ShaderMaterial).uniforms.uTime.value =
      elapsed;

    const isGlitching = Math.random() < 0.05;
    const glitchIntensity = isGlitching
      ? Math.random() > 0.5
        ? 4.0
        : 0.1
      : 1.0;

    (energyBarrier.material as THREE.ShaderMaterial).uniforms.uGlitch.value =
      glitchIntensity;
    doorLight.intensity = isGlitching ? Math.random() * 50 : 300.0;
  }

  // ── PERIPHERE WIREFRAME-ATTACKEN ──
  if (s.glitchRing) {
    s.glitchRing.children.forEach((child) => {
      if (Math.random() < 0.02) {
        const x = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 3.0);
        const y = 1.6 + (Math.random() - 0.5) * 3.0;
        const z = -0.5 - Math.random() * 2.5;

        child.position.set(x, y, z);
        child.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        child.scale.setScalar(0.2 + Math.random() * 1.5);
      }
    });
  }

  if (!s.renderer.xr.isPresenting) {
    s.camera.layers.enable(1);
    s.camera.layers.enable(2);
  }

  const showTrap = s.phase === 0;
  s.trap.visible = showTrap;
  s.leftDoor.visible = !showTrap;
  s.rightDoor.visible = !showTrap;
  s.wall.visible = !showTrap;
  s.heatmap.visible = showTrap;

  // ── SCHLOSS-BALKEN WIE EIN VENTILATOR GEGEN UHRZEIGER DREHEN ──
  if (!showTrap) {
    // Da rightDoor in setup() als isClosed generiert wird, sitzt hier der lockBar
    const lockBar = s.rightDoor.getObjectByName(
      "lockBar",
    ) as THREE.Group | null;
    if (lockBar) {
      lockBar.rotation.z = elapsed * 2.5;
      lockBar.children.forEach((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.material instanceof THREE.ShaderMaterial) {
          mesh.material.uniforms.uTime.value = elapsed;
        }
      });
    }
  }

  if (!showTrap && s.renderer.xr.isPresenting) {
    const xrCam = s.renderer.xr.getCamera() as THREE.ArrayCamera;
    if (xrCam.cameras && xrCam.cameras.length === 2) {
      const left = xrCam.cameras[0];
      const right = xrCam.cameras[1];
      left.layers.enable(0);
      left.layers.enable(1);
      left.layers.disable(2);
      right.layers.enable(0);
      right.layers.disable(1);
      right.layers.enable(2);
    }
  }

  const shapeT = Math.min(1.0, elapsed / 3.0);
  const pulse = 0.9 + 0.1 * Math.sin(elapsed * 2.5);
  const baseScale = 0.2 + shapeT * 0.8;

  const circleMesh = s.trap.getObjectByName(
    "leftEyeCircle",
  ) as THREE.Mesh | null;
  const triangleMesh = s.trap.getObjectByName(
    "rightEyeTriangle",
  ) as THREE.Mesh | null;

  if (circleMesh) {
    const matM = circleMesh.material as THREE.ShaderMaterial;
    matM.uniforms.uTime.value = elapsed;
    circleMesh.scale.setScalar(baseScale * pulse * s.trapScale);
    circleMesh.position.y = 1.6 + Math.sin(elapsed * 2.0) * 0.05;
  }

  if (triangleMesh) {
    const matM = triangleMesh.material as THREE.ShaderMaterial;
    matM.uniforms.uTime.value = elapsed;
    triangleMesh.scale.setScalar(baseScale * pulse * s.trapScale);
    triangleMesh.position.y = 1.6 + Math.sin(elapsed * 2.0) * 0.05;
  }

  return { state: s };
}

export function dispose(state: ExperienceState, _scene: THREE.Scene): void {
  const s = state as BiometricTestState;

  stateRef = null;
  if (keyHandler) document.removeEventListener("keydown", keyHandler);

  const disposeGroup = (group: THREE.Group) => {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
    _scene.remove(group);
  };

  disposeGroup(s.trap);
  disposeGroup(s.leftDoor);
  disposeGroup(s.rightDoor);
  disposeGroup(s.glitchRing);

  s.heatmap.geometry.dispose();
  (s.heatmap.material as THREE.Material).dispose();
  _scene.remove(s.heatmap);

  if (s.particles) {
    s.particles.geometry.dispose();
    (s.particles.material as THREE.Material).dispose();
    _scene.remove(s.particles);
  }

  if (s.floor) {
    s.floor.geometry.dispose();
    (s.floor.material as THREE.Material).dispose();
    _scene.remove(s.floor);
  }

  if (s.wall) {
    s.wall.geometry.dispose();
    (s.wall.material as THREE.Material).dispose();
    _scene.remove(s.wall);
  }
}
