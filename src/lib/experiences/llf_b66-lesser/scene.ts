import * as THREE from "three";
import { Effect, EffectComposer, EffectPass, RenderPass } from "postprocessing";
import type { ExperienceState, SetupContext, TickContext } from "../types";
import { buildSandstormVortex, updateSandstorm } from "./scene2";

// @ts-ignore
import tunnelVert from "./shaders/tunnel.vert?raw";
// @ts-ignore
import tunnelFrag from "./shaders/tunnel.frag?raw";
// @ts-ignore
import tunnelHaloVert from "./shaders/tunnel-halo.vert?raw";
// @ts-ignore
import tunnelHaloFrag from "./shaders/tunnel-halo.frag?raw";
// @ts-ignore
import frVert from "./shaders/fr.vert?raw";
// @ts-ignore
import cageFrag from "./shaders/cage.frag?raw";
// @ts-ignore
import glowFrag from "./shaders/glow.frag?raw";
// @ts-ignore
import particleVert from "./shaders/particle.vert?raw";
// @ts-ignore
import particleFrag from "./shaders/particle.frag?raw";
// @ts-ignore
import starVert from "./shaders/star.vert?raw";
// @ts-ignore
import starFrag from "./shaders/star.frag?raw";
// @ts-ignore
import postFrag from "./shaders/post.frag?raw";

import meatDiffuseUrl from "./textures/Ground Beef/Meat 001_diffuse.png";

let stateRef: B66LesserState | null = null;
let menuEl: HTMLDivElement | null = null;

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

const CANAL_VERTEX = `
uniform float uTime;
uniform float uPeriStrength;
uniform float uVoidReveal;
varying vec3 vViewPos;
varying float vZ;
varying vec2 vUv;
varying float vNoise;
varying float vPeri;

${NOISE_GLSL}

void main() {
  vUv = uv; float t = uTime;
  float effectiveZ = (modelMatrix * vec4(position, 1.0)).z;
  vZ = effectiveZ;
  float angle = atan(position.y, position.x);
  float crossMod = 1.0 + 0.12 * sin(angle * 3.0 + 0.5)
                        + 0.08 * cos(angle * 5.0 + 1.3)
                        + 0.05 * sin(angle * 7.0 + 2.1);
  float g1 = exp(-pow(sin(effectiveZ * 0.06 + t * 0.25), 2.0) * 5.0);
  float g2 = exp(-pow(sin(effectiveZ * 0.12 - t * 0.4), 2.0) * 7.0);
  float g3 = exp(-pow(sin(effectiveZ * 0.03 + t * 0.15), 2.0) * 3.0);
  float g4 = exp(-pow(sin(effectiveZ * 0.2 + t * 0.5 + position.x * 0.1), 2.0) * 10.0);
  float n = fbm(vec3(position.xy * 0.08, effectiveZ * 0.04 + t * 0.08));
  vNoise = n;
  float vib = sin(t * 2.0 + effectiveZ * 1.5) * 0.25;
  float peristalsis = (g1 * 0.8 + g2 * 0.5 + g3 * 0.4 + g4 * 0.3) * 0.6 + vib;
  vPeri = peristalsis;
  float noiseD = n * 0.3;
  float totalD = (crossMod - 1.0) + (peristalsis + noiseD) * uPeriStrength;
  totalD = max(totalD, -3.0);
  float bendX = sin(effectiveZ * 0.015) * 2.0;
  float bendY = cos(effectiveZ * 0.01) * 1.2;
  vec3 p = position;
  p += normal * totalD;
  p.x += bendX; p.y += bendY;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vViewPos = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const CANAL_FRAGMENT = `
uniform float uTime;
uniform float uPeriStrength;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform sampler2D uDiffuse;
uniform float uTexBlend;
uniform float uLightZ;
uniform float uBright;
uniform float uVoidReveal;
varying vec3 vViewPos;
varying float vZ;
varying vec2 vUv;
varying float vNoise;
varying float vPeri;
${NOISE_GLSL}

void main() {
  float t = uTime;
  float wave1 = 0.5 + 0.5 * sin(vZ * 0.06 + t * 0.4);
  float wave2 = 0.5 + 0.5 * sin(vZ * 0.1 - t * 0.6);
  float wave3 = 0.5 + 0.5 * sin(vZ * 0.15 + t * 0.25 + vUv.x * 2.0);
  float pulse = wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2;
  float n = fbm(vec3(vUv * 3.0, t * 0.04));
  float n2 = fbm(vec3(vUv.yx * 5.0, t * 0.06 + 10.0));
  vec3 col = mix(uColor2, uColor1, pulse * 0.6 + n * 0.4);
  col += uColor3 * n2 * 0.06 * pulse;
  vec4 tex = texture2D(uDiffuse, vUv * 3.0);
  col = mix(col, col * (tex.rgb * 1.4), uTexBlend);
  col *= 0.55;
  col += vec3(0.8, 0.1, 0.25) * 0.12;
  col += vec3(1.0, 0.2, 0.4) * vPeri * 0.4;
  float dz = vZ - uLightZ;
  float lightGlow = exp(-dz * dz * 0.008) * 0.2;
  col += vec3(1.0, 0.5, 0.2) * lightGlow;
  float mistN = fbm(vec3(vUv * 1.5, t * 0.02));
  float mist2 = fbm(vec3(vZ * 0.02 + vUv.x * 0.5, vUv.y * 2.0, t * 0.03));
  float mist = mistN * 0.4 + mist2 * 0.35;
  mist = clamp(mist, 0.0, 0.75);
  col += vec3(0.9, 0.12, 0.35) * mist;
  float depthHaze = exp(-abs(vZ + 20.0) * 0.01) * 0.2;
  col += vec3(0.6, 0.08, 0.2) * depthHaze;
  col *= 0.92 + 0.08 * sin(t * 0.15 + vZ * 0.03);
  col *= uVoidReveal;
  gl_FragColor = vec4(col, 1.0);
}
`;

function createCanalMaterial(): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		side: THREE.BackSide,
		vertexShader: CANAL_VERTEX,
		fragmentShader: CANAL_FRAGMENT,
		uniforms: {
			uTime: { value: 0 },
			uPeriStrength: { value: 1 },
			uColor1: { value: new THREE.Color(0.2, 0.02, 0.05) },
			uColor2: { value: new THREE.Color(0.12, 0.01, 0.03) },
			uColor3: { value: new THREE.Color(0.3, 0.04, 0.1) },
			uDiffuse: { value: null },
			uTexBlend: { value: 0.8 },
			uLightZ: { value: 0 },
			uBright: { value: 1.0 },
			uVoidReveal: { value: 0.0 },
		},
	});
}

class B66Effect extends Effect {
	constructor() {
		super("B66Effect", postFrag, {
			uniforms: new Map<string, THREE.Uniform<number>>([
				["uCA", new THREE.Uniform(0.12)],
				["uWarp", new THREE.Uniform(0.0)],
				["uVig", new THREE.Uniform(0.55)],
				["uFlicker", new THREE.Uniform(0.0)],
				["uHeartbeat", new THREE.Uniform(0.0)],
				["uTime", new THREE.Uniform(0.0)],
			]),
		});
	}
}

// ── State interface ──

export interface B66LesserState extends ExperienceState {
	scene: THREE.Scene;
	renderer: THREE.WebGLRenderer;
	camera: THREE.PerspectiveCamera;

	phase: number;
	phaseT: number;
	showMenu: boolean;
	fadeInTime: number;
	showHitbox: boolean;
	hitboxViz: THREE.LineSegments;
	hitboxScale: number;
	audioCtx: AudioContext | null;
	audioMaster: GainNode | null;
	audioFilter: BiquadFilterNode | null;
	audioDrone: OscillatorNode | null;
	audioWave: OscillatorNode | null;
	audioGainDrone: GainNode | null;
	audioGainWave: GainNode | null;
	checkpointPos: THREE.Vector3;
	checkpointHeading: number;
	hitGlow: THREE.PointLight;
	hitGlowIntensity: number;

	rig: THREE.Group;
	camPos: THREE.Vector3;
	heading: number;
	currentSpeed: number;
	flightSpeed: number;
	currentPitch: number;
	currentRoll: number;

	orientation: { pitch: number; roll: number };
	speed: { accelerate: boolean; brake: boolean };

	// Phase 0 — Start + Birth canal
	startSprite: THREE.Sprite;
	leanStartTime: number;
	canalMat: THREE.ShaderMaterial;
	outerCanalMat: THREE.ShaderMaterial;
	chunkPool: THREE.Mesh[];
	outerChunkPool: THREE.Mesh[];

	// Phase 1 — Desert
	sandFloor: THREE.Mesh;
	sandCeiling: THREE.Mesh;
	sandParticles: THREE.Points;
	sandWaveSpeed: number;
	sandDensity: number;
	desertOrbs: THREE.Mesh[];
	orbData: { baseY: number; radiusX: number; radiusZ: number; speed: number; phase: number }[];

	// Phase 2 — Biometric test
	biometricPhase: number;
	trapOpacity: number;
	trapScale: number;
	biometricTrap: THREE.Group;
	biometricParticles: THREE.Points;
	heatmap: THREE.Mesh;
	leftDoor: THREE.Group;
	rightDoor: THREE.Group;
	fractalFloor: THREE.Mesh;
	wall: THREE.Mesh;
	glitchRing: THREE.Group;

	// Phase 3 — Void / Cage
	cageMesh: THREE.Mesh;
	stars: THREE.Points;
	nebula: THREE.Points;
	trails: THREE.Object3D[];
	gpMesh: THREE.Points;

	// Phase 4 — Exit tunnel
	tunnelMesh: THREE.Mesh;
	tunnelHalo: THREE.Mesh;
	tunnelParticles: THREE.Points;
	tunnelFog: THREE.Mesh[];
	tunnelFogMat: THREE.ShaderMaterial[];
	tunnelLight: THREE.PointLight;
	tunnelProgress: number;
	closedDoor: THREE.Mesh;
	openDoor: THREE.Mesh;

	// Phase 2 sandstorm (from scene2)
	sandstormVortex: THREE.Mesh;

	// Per-phase groups for visibility
	groups: Record<number, THREE.Object3D[]>;

	b66Effect: B66Effect;
	postfxComposer: EffectComposer;
	postfxRender: () => void;
	postfxDeltaRef: { value: number };

	_onResize: () => void;
	_keyHandler: ((e: KeyboardEvent) => void) | null;
}

// ═══════════════════════════════════════════════════════════════════════
//  PHASE BUILDERS
// ═══════════════════════════════════════════════════════════════════════

// ── Phase 0: Start screen + Birth canal ──

function buildCanalAudio(): {
	ctx: AudioContext;
	master: GainNode;
	filter: BiquadFilterNode;
	drone: OscillatorNode;
	gainDrone: GainNode;
	wave: OscillatorNode;
	gainWave: GainNode;
} | null {
	try {
		const ctx = new AudioContext();
		const master = ctx.createGain();
		master.gain.value = 0.08;
		master.connect(ctx.destination);

		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 180;
		filter.Q.value = 0.8;
		filter.connect(master);

		// Deep submarine hum (very low, barely audible)
		const gainDrone = ctx.createGain();
		gainDrone.gain.value = 0.04;
		gainDrone.connect(filter);
		const drone = ctx.createOscillator();
		drone.type = "sine";
		drone.frequency.value = 45;
		drone.connect(gainDrone);
		drone.start();

		// Gentle wave layer (soothing, undulating)
		const gainWave = ctx.createGain();
		gainWave.gain.value = 0.035;
		gainWave.connect(filter);
		const wave = ctx.createOscillator();
		wave.type = "sine";
		wave.frequency.value = 95;
		wave.connect(gainWave);
		wave.start();

		return { ctx, master, filter, drone, gainDrone, wave, gainWave };
	} catch {
		return null;
	}
}

const CANAL_NEAR = 10; const CANAL_FAR = 10 - 700; const CANAL_RADIUS = 5; const CANAL_RAD_SEG = 32; const CANAL_Z_SEG = 100;
const CHUNK_LEN = 80;
const CHUNKS_AHEAD = 6;
const CHUNKS_BEHIND = 3;
const CHUNK_POOL = CHUNKS_AHEAD + 1 + CHUNKS_BEHIND;
const HITBOX_RAD = CANAL_RADIUS - 0.6;
const OUTER_CANAL_RADIUS = CANAL_RADIUS * 1.8;

function buildStartSprite(): THREE.Sprite {
	const canvas = document.createElement("canvas");
	canvas.width = 512; canvas.height = 256;
	const cx = canvas.getContext("2d")!;
	cx.fillStyle = "transparent"; cx.clearRect(0, 0, 512, 256);
	cx.textAlign = "center"; cx.textBaseline = "middle";
	cx.fillStyle = "#ffffff";
	cx.font = "bold 48px monospace";
	cx.fillText("upload yourself", 256, 100);
	cx.font = "20px monospace";
	cx.fillStyle = "#888888";
	cx.fillText("lean forward to start", 256, 170);
	const tex = new THREE.CanvasTexture(canvas);
	tex.needsUpdate = true;
	const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
	sprite.position.set(0, 0, -6);
	sprite.scale.set(12, 6, 1);
	return sprite;
}

function wallRadAt(z: number, x: number, y: number, t: number): number {
	const angle = Math.atan2(y, x);
	const crossMod = 1.0 + 0.12 * Math.sin(angle * 3.0 + 0.5)
	                   + 0.08 * Math.cos(angle * 5.0 + 1.3)
	                   + 0.05 * Math.sin(angle * 7.0 + 2.1);
	const g1 = Math.exp(-Math.pow(Math.sin(z * 0.06 + t * 0.25), 2) * 5);
	const g2 = Math.exp(-Math.pow(Math.sin(z * 0.12 - t * 0.4), 2) * 7);
	const g3 = Math.exp(-Math.pow(Math.sin(z * 0.03 + t * 0.15), 2) * 3);
	const g4 = Math.exp(-Math.pow(Math.sin(z * 0.2 + t * 0.5 + x * 0.1), 2) * 10);
	const vib = Math.sin(t * 2.0 + z * 1.5) * 0.25;
	const peristalsis = (g1 * 0.8 + g2 * 0.5 + g3 * 0.4 + g4 * 0.3) * 0.6 + vib;
	const uPeri = 6.0 * (0.8 + 0.2 * Math.sin(t * 0.8));
	let totalD = (crossMod - 1.0) + (peristalsis - 0.3) * uPeri;
	totalD = Math.max(-3.0, totalD);
	return CANAL_RADIUS + totalD;
}

function buildChunk(length: number): THREE.BufferGeometry {
	const path = new THREE.LineCurve3(
		new THREE.Vector3(0, 0, 0),
		new THREE.Vector3(0, 0, -length),
	);
	return new THREE.TubeGeometry(path, Math.round(length / 5), CANAL_RADIUS, CANAL_RAD_SEG, false);
}

function buildChunkPool(mat: THREE.ShaderMaterial): THREE.Mesh[] {
	const geo = buildChunk(CHUNK_LEN);
	const pool: THREE.Mesh[] = [];
	for (let i = 0; i < CHUNK_POOL; i++) {
		const m = new THREE.Mesh(geo, mat);
		pool.push(m);
	}
	return pool;
}

// ── Phase 1: Purple sand desert ──

function buildSandSheet(isCeiling: boolean): THREE.Mesh {
	const mat = new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 }, uWaveSpeed: { value: 0.8 }, uDensity: { value: 1.0 } },
		vertexShader: `
			uniform float uTime; uniform float uWaveSpeed;
			varying vec2 vUv; varying vec3 vPos;
			void main() {
				vUv = uv;
				vec3 pos = position;
				float wave = sin(pos.x * 0.15 + uTime * uWaveSpeed * 0.3) * 1.8
				           + cos(pos.y * 0.2 + uTime * uWaveSpeed * 0.25) * 1.4
				           + sin((pos.x + pos.y * 0.7) * 0.08 + uTime * uWaveSpeed * 0.2) * 2.5
				           + sin(pos.x * 0.05 + uTime * 0.15) * 1.2
				           + cos(pos.y * 0.06 + uTime * 0.2) * 1.0;
				pos.z += wave; vPos = pos;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
			}`,
		fragmentShader: `
			${NOISE_GLSL}
			uniform float uTime; uniform float uWaveSpeed; uniform float uDensity;
			varying vec2 vUv; varying vec3 vPos;
			void main() {
				vec2 p = vPos.xy * 0.12 * uDensity;
				float n = fbm(vec3(p, uTime * uWaveSpeed * 0.03));
				float n2 = fbm(vec3(p * 1.5 - uTime * 0.05, uTime * 0.04));
				float sand = smoothstep(0.3, 0.7, n * 0.6 + n2 * 0.4);
				vec3 baseDark = vec3(0.06, 0.01, 0.10);
				vec3 duneMid = vec3(0.20, 0.06, 0.30);
				vec3 duneLight = vec3(0.55, 0.15, 0.45);
				vec3 color = mix(baseDark, duneMid, sand);
				color = mix(color, duneLight, pow(sand, 2.0) * 0.5);
				float dist = length(vPos.xy);
				float fade = exp(-dist * 0.008);
				gl_FragColor = vec4(mix(vec3(0.01,0.0,0.02), color, fade), 1.0);
			}`,
		transparent: false, side: THREE.DoubleSide,
	});
	const geo = new THREE.PlaneGeometry(600, 600, 200, 200);
	const mesh = new THREE.Mesh(geo, mat);
	mesh.rotation.x = isCeiling ? Math.PI / 2 : -Math.PI / 2;
	mesh.position.y = isCeiling ? 8.0 : -6.0;
	return mesh;
}

function buildSandParticles(): THREE.Points {
	const count = 30000;
	const geo = new THREE.BufferGeometry();
	const positions = new Float32Array(count * 3);
	const randoms = new Float32Array(count);
	const sizes = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		positions[i * 3] = (Math.random() - 0.5) * 120;
		positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
		positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
		randoms[i] = Math.random();
		sizes[i] = 0.3 + Math.random() * 1.5;
	}
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
	geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	const mat = new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 } },
		vertexShader: `
			uniform float uTime; attribute float aRandom; attribute float aSize;
			varying float vAlpha; varying vec3 vColor;
			void main() {
				vec3 pos = position;
				pos.z += uTime * (1.0 + aRandom * 1.5);
				pos.z = mod(pos.z + 90.0, 180.0) - 90.0;
				pos.x += sin(uTime * 0.4 + aRandom * 30.0) * 4.0;
				pos.y += cos(uTime * 0.6 + aRandom * 20.0) * 2.0;
				vColor = mix(vec3(0.4,0.08,0.6), vec3(0.9,0.5,0.1), aRandom * 0.5);
				vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
				gl_PointSize = aSize * (4.0 / max(-mvPosition.z, 0.5));
				gl_Position = projectionMatrix * mvPosition;
				float distFade = smoothstep(-80.0, -10.0, pos.z) * smoothstep(80.0, 10.0, pos.z);
				vAlpha = distFade * (0.2 + aRandom * 0.5);
			}`,
		fragmentShader: `
			varying float vAlpha; varying vec3 vColor;
			void main() {
				float d = distance(gl_PointCoord, vec2(0.5));
				if(d > 0.5) discard;
				float alpha = smoothstep(0.5, 0.1, d) * vAlpha;
				gl_FragColor = vec4(vColor, alpha);
			}`,
		transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
	});
	return new THREE.Points(geo, mat);
}

function buildDesertOrbs(): { orbs: THREE.Mesh[]; data: { baseY: number; radiusX: number; radiusZ: number; speed: number; phase: number }[] } {
	const orbs: THREE.Mesh[] = [];
	const data: { baseY: number; radiusX: number; radiusZ: number; speed: number; phase: number }[] = [];
	const colors = [0xff66aa, 0xaa66ff, 0x66aaff, 0xffaa44, 0x44ffaa];
	for (let i = 0; i < 10; i++) {
		const geo = new THREE.SphereGeometry(0.4 + Math.random() * 0.4, 12, 10);
		const mat = new THREE.MeshBasicMaterial({
			color: colors[i % colors.length],
			transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false,
		});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.position.set(0, 0, 0);
		orbs.push(mesh);
		data.push({
			baseY: -1 + Math.random() * 4,
			radiusX: 4 + Math.random() * 6,
			radiusZ: 4 + Math.random() * 6,
			speed: 0.15 + Math.random() * 0.2,
			phase: Math.random() * Math.PI * 2,
		});
	}
	return { orbs, data };
}

// ── Phase 2: Biometric test elements ──

function buildWall(): THREE.Mesh {
	const shape = new THREE.Shape();
	const wallW = 8;
	const wallH = 6;
	shape.moveTo(-wallW/2, -wallH/2);
	shape.lineTo(wallW/2, -wallH/2);
	shape.lineTo(wallW/2, wallH/2);
	shape.lineTo(-wallW/2, wallH/2);
	shape.lineTo(-wallW/2, -wallH/2);
	const hole = new THREE.Path();
	const doorW = 1.1;
	const doorH = 2.5;
	hole.moveTo(-doorW/2, -doorH/2);
	hole.lineTo(doorW/2, -doorH/2);
	hole.lineTo(doorW/2, doorH/2);
	hole.lineTo(-doorW/2, doorH/2);
	hole.lineTo(-doorW/2, -doorH/2);
	shape.holes.push(hole);
	const geo = new THREE.ExtrudeGeometry(shape, {
		depth: 0.5, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3,
	});
	const mat = new THREE.MeshStandardMaterial({
		color: 0x1a0a2e, emissive: 0x330066, emissiveIntensity: 0.15, metalness: 0.3, roughness: 0.85,
	});
	const mesh = new THREE.Mesh(geo, mat);
	mesh.position.set(0, 1.25, -3.0);
	return mesh;
}

function buildBiometricParticles(): THREE.Points {
	const countBig = 66;
	const countSmall = 6000;
	const totalCount = countBig + countSmall;
	const geo = new THREE.BufferGeometry();
	const positions = new Float32Array(totalCount * 3);
	const randoms = new Float32Array(totalCount);
	const sizes = new Float32Array(totalCount);
	const baseOpacities = new Float32Array(totalCount);
	for (let i = 0; i < totalCount; i++) {
		positions[i*3] = (Math.random()-0.5)*12;
		positions[i*3+1] = (Math.random()-0.5)*8;
		positions[i*3+2] = (Math.random()-0.5)*15;
		randoms[i] = Math.random();
		if (i < countBig) { sizes[i] = 10+Math.random()*14; baseOpacities[i] = 0.9; }
		else { sizes[i] = 3+Math.random()*6; baseOpacities[i] = 0.7; }
	}
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
	geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geo.setAttribute("aBaseOpacity", new THREE.BufferAttribute(baseOpacities, 1));
	const mat = new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 } },
		vertexShader: `
			uniform float uTime;
			attribute float aRandom; attribute float aSize; attribute float aBaseOpacity;
			varying float vAlpha; varying vec3 vColor;
			void main() {
				vec3 pos = position;
				pos.z += uTime * (2.0 + aRandom * 3.0);
				pos.z = mod(pos.z + 10.0, 20.0) - 10.0;
				pos.x += sin(uTime*1.2 + aRandom*20.0)*1.5;
				pos.y += cos(uTime*0.8 + aRandom*15.0)*1.0;
				vColor = mix(vec3(0.9,0.7,1.0), vec3(1.0,0.6,0.8), aRandom);
				vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
				gl_PointSize = aSize * (2.0 / max(-mvPosition.z, 0.5));
				gl_Position = projectionMatrix * mvPosition;
				float distFade = smoothstep(-10.0, -5.0, pos.z) * smoothstep(5.0, 0.0, pos.z);
				vAlpha = distFade * aBaseOpacity;
			}`,
		fragmentShader: `
			varying float vAlpha; varying vec3 vColor;
			void main() {
				float d = distance(gl_PointCoord, vec2(0.5));
				if(d > 0.5) discard;
				float alpha = smoothstep(0.5, 0.1, d) * vAlpha;
				gl_FragColor = vec4(vColor, alpha);
			}`,
		transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
	});
	return new THREE.Points(geo, mat);
}

function buildBiometricTrap(camera: THREE.PerspectiveCamera): THREE.Group {
	const group = new THREE.Group();
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
	ambientLight.layers.enable(1); ambientLight.layers.enable(2);
	group.add(ambientLight);
	const pointLight = new THREE.PointLight(0xffffff, 2.0);
	pointLight.position.set(0, 2, -1);
	pointLight.layers.enable(1); pointLight.layers.enable(2);
	group.add(pointLight);

	const createRivalryMaterial = (isVertical: boolean, colorHex: number) => new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(colorHex) }, uIsVertical: { value: isVertical ? 1.0 : 0.0 } },
		vertexShader: `varying vec2 vUv; varying vec3 vNormal; void main(){ vUv = uv; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
		fragmentShader: `
			uniform float uTime; uniform vec3 uColor; uniform float uIsVertical;
			varying vec2 vUv; varying vec3 vNormal;
			void main() {
				float coord = mix(vUv.y, vUv.x, uIsVertical);
				float stripe = sin(coord * 40.0 - uTime * 3.0);
				float pattern = smoothstep(-0.1, 0.1, stripe);
				float fresnel = pow(1.0 - max(dot(vNormal, vec3(0,0,1)), 0.0), 2.0);
				vec3 finalColor = uColor * pattern * 4.0;
				finalColor += uColor * fresnel * 2.0;
				gl_FragColor = vec4(finalColor, 1.0);
			}`,
		transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
	});

	const leftMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 32), createRivalryMaterial(false, 0xffaa00));
	leftMesh.position.set(0, 1.6, -2);
	leftMesh.layers.set(1);
	leftMesh.name = "leftEyeCircle";
	group.add(leftMesh);

	const rightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 32), createRivalryMaterial(true, 0x00ffff));
	rightMesh.position.set(0, 1.6, -2);
	rightMesh.layers.set(2);
	rightMesh.name = "rightEyeTriangle";
	group.add(rightMesh);

	const haloGeo = new THREE.SphereGeometry(0.195, 32, 32);
	const leftHalo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
		color: 0xffaa00, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false,
	}));
	leftHalo.position.set(0, 1.6, -2);
	leftHalo.layers.set(1);
	group.add(leftHalo);

	const rightHalo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
		color: 0x00ffff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false,
	}));
	rightHalo.position.set(0, 1.6, -2);
	rightHalo.layers.set(2);
	group.add(rightHalo);

	camera.layers.enable(1);
	camera.layers.enable(2);
	return group;
}

function buildHeatmap(): THREE.Mesh {
	const mat = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		uniforms: { uTime: { value: 0 } },
		vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
		fragmentShader: `
			${NOISE_GLSL}
			uniform float uTime; varying vec3 vPos;
			void main() {
				vec3 p = normalize(vPos);
				float angle = atan(p.y, p.x);
				float radius = length(p.xy);
				float twist = angle + radius * 3.0 - uTime * 1.5;
				vec3 twistedPos = vec3(cos(twist)*radius, sin(twist)*radius, p.z + uTime);
				float n = fbm(twistedPos * 4.0);
				float n2 = fbm(twistedPos * 6.0 - uTime * 0.3);
				float heat = smoothstep(0.1, 0.9, n*0.5 + n2*0.5);
				vec3 c1 = vec3(0.05,0.0,0.2), c2 = vec3(0.0,0.8,0.6), c3 = vec3(1.0,0.0,0.5);
				vec3 color = mix(c1, c2, heat);
				color = mix(color, c3, sin(uTime*2.0 + heat*10.0)*0.5 + 0.5);
				gl_FragColor = vec4(color*0.7, 1.0);
			}`,
	});
	return new THREE.Mesh(new THREE.SphereGeometry(20, 32, 32), mat);
}

function buildDoorFrame(isClosed: boolean): THREE.Group {
	const group = new THREE.Group();
	const thickness = 0.3;
	const depth = 0.3;
	const frameMat = new THREE.MeshStandardMaterial({
		color: 0xaa00ff, emissive: 0x5500aa,
		emissiveIntensity: isClosed ? 150.0 : 4.0, metalness: 0.9, roughness: 0.1,
	});
	group.add(new THREE.Mesh(new THREE.BoxGeometry(thickness, 2.5, depth), frameMat).translateX(-0.55 - thickness/2));
	group.add(new THREE.Mesh(new THREE.BoxGeometry(thickness, 2.5, depth), frameMat).translateX(0.55 + thickness/2));
	group.add(new THREE.Mesh(new THREE.BoxGeometry(1.1 + thickness*2, thickness, depth), frameMat).translateY(1.25 + thickness/2));

	if (isClosed) {
		const doorMat = new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 1.0, roughness: 0.3 });
		group.add(new THREE.Mesh(new THREE.BoxGeometry(0.53, 2.5, 0.15), doorMat).translateX(-0.285));
		group.add(new THREE.Mesh(new THREE.BoxGeometry(0.53, 2.5, 0.15), doorMat).translateX(0.285));

		const lockGroup = new THREE.Group();
		lockGroup.name = "lockBar";
		lockGroup.position.set(0, 0, 0.15);
		const lockGeo = new THREE.BoxGeometry(2.5, 0.3, 0.15);
		const makeBarMat = (c1: string, c2: string) => new THREE.ShaderMaterial({
			uniforms: { uTime: { value: 0 } },
			vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: `
				uniform float uTime; varying vec2 vUv;
				void main() {
					float stripe = sin(vUv.x * 30.0 - uTime * 12.0);
					float pattern = smoothstep(-0.1, 0.1, stripe);
					vec3 c1 = ${c1}; vec3 c2 = ${c2};
					vec3 col = mix(c1, c2, pattern); col *= 2.0 + pattern * 2.0;
					float edge = 1.0 - abs(vUv.x - 0.5) * 2.0; col += c2 * pow(edge, 4.0) * 1.5;
					gl_FragColor = vec4(col, 1.0);
				}`,
			transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
		});
		const pinkMat = makeBarMat("vec3(1,0,0.53)", "vec3(1,0.2,0.8)");
		const blueMat = makeBarMat("vec3(0,0.3,1)", "vec3(0.2,0.6,1)");
		lockGroup.add(new THREE.Mesh(lockGeo, pinkMat));
		const b2 = new THREE.Mesh(lockGeo, blueMat); b2.rotation.z = Math.PI/2; lockGroup.add(b2);
		const b3 = new THREE.Mesh(lockGeo, pinkMat); b3.rotation.z = Math.PI/4; lockGroup.add(b3);
		const b4 = new THREE.Mesh(lockGeo, blueMat); b4.rotation.z = -Math.PI/4; lockGroup.add(b4);
		group.add(lockGroup);

		const barrierMat = new THREE.ShaderMaterial({
			uniforms: { uTime: { value: 0 }, uGlitch: { value: 1.0 } },
			vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: `uniform float uGlitch; void main(){ gl_FragColor = vec4(vec3(1,0.1,0.2)*3.0*uGlitch, 1.0); }`,
		});
		const barrierMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.5, 0.1), barrierMat);
		barrierMesh.name = "energyBarrier";
		group.add(barrierMesh);
		group.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.2),
			new THREE.MeshBasicMaterial({ color: 0xff0022, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
		const dl = new THREE.PointLight(0xff0033, 300, 60);
		dl.name = "doorLight";
		group.add(dl.translateZ(1.5));
	}
	return group;
}

function buildFractalFloor(): THREE.Mesh {
	const mat = new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 } },
		vertexShader: `
			varying vec2 vUv; varying vec3 vPos; uniform float uTime;
			void main() {
				vUv = uv; vec3 pos = position;
				float wave = sin(pos.x*0.5+uTime*0.8)*0.15 + cos(pos.y*0.7+uTime*0.6)*0.1;
				pos.z += wave; vPos = pos;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
			}`,
		fragmentShader: `
			${NOISE_GLSL}
			uniform float uTime; varying vec2 vUv; varying vec3 vPos;
			void main() {
				vec2 p = vPos.xy * 0.3;
				float n = fbm(vec3(p, uTime*0.05));
				float n2 = fbm(vec3(p*2.0 - uTime*0.1, uTime*0.1));
				float fractal = smoothstep(0.4, 0.6, n*0.5+n2*0.5);
				vec3 baseColor = vec3(0.01,0.0,0.03);
				vec3 glowColor = vec3(0.6,0.0,1.0);
				vec2 grid = abs(fract(p*1.5-0.5)-0.5)/fwidth(p*1.5);
				float line = min(grid.x, grid.y);
				float lineGlow = 1.0 - min(line, 1.0);
				vec3 finalColor = mix(baseColor, glowColor, fractal*0.5+lineGlow*0.3);
				float dist = length(vPos.xy);
				float fade = exp(-dist*0.05);
				gl_FragColor = vec4(mix(vec3(0.02,0.0,0.067), finalColor, fade), 1.0);
			}`,
		transparent: false, side: THREE.DoubleSide,
	});
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 64, 64), mat);
	mesh.rotation.x = -Math.PI/2;
	mesh.position.y = -3.0;
	return mesh;
}

function buildGlitchRing(): THREE.Group {
	const group = new THREE.Group();
	const geo = new THREE.OctahedronGeometry(0.5, 0);
	const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
	for (let i = 0; i < 15; i++) group.add(new THREE.Mesh(geo, mat).translateY(100));
	return group;
}

// ── Phase 3: Void / Cage ──

function createCylGeo(r: number, len: number, rSeg: number, lSeg: number): THREE.BufferGeometry {
	const verts: number[] = [];
	const idxs: number[] = [];
	for (let j = 0; j <= lSeg; j++) {
		const t = j / lSeg;
		const z = -t * len;
		for (let i = 0; i <= rSeg; i++) {
			const a = (i / rSeg) * Math.PI * 2;
			verts.push(Math.cos(a) * r, Math.sin(a) * r, z);
		}
	}
	for (let j = 0; j < lSeg; j++) {
		for (let i = 0; i < rSeg; i++) {
			const a = j * (rSeg + 1) + i;
			idxs.push(a, a + 1, a + rSeg + 1, a + 1, a + rSeg + 2, a + rSeg + 1);
		}
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
	geo.setIndex(idxs);
	geo.computeVertexNormals();
	return geo;
}

function buildStarField(count: number, r: number, zStart: number, zLen: number, colorFn: (r: number) => number[], sizeRange: number[]): THREE.Points {
	const pos = new Float32Array(count * 3);
	const col = new Float32Array(count * 3);
	const sz = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		const ang = Math.random() * Math.PI * 2;
		const rad = Math.sqrt(Math.random()) * r;
		pos[i*3] = Math.cos(ang) * rad;
		pos[i*3+1] = Math.sin(ang) * rad;
		pos[i*3+2] = -(zStart + Math.random() * zLen);
		const c = colorFn(Math.random());
		col[i*3] = c[0]; col[i*3+1] = c[1]; col[i*3+2] = c[2];
		sz[i] = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
	geo.setAttribute("aSz", new THREE.Float32BufferAttribute(sz, 1));
	const mat = new THREE.ShaderMaterial({
		uniforms: { uTime: { value: 0 } },
		vertexShader: starVert, fragmentShader: starFrag,
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
	});
	return new THREE.Points(geo, mat);
}

// ── Phase 4: Exit tunnel ──

function buildCurvedTunnel(): { mesh: THREE.Mesh; halo: THREE.Mesh } {
	const points: THREE.Vector3[] = [];
	for (let z = 0; z <= 300; z += 3) {
		const t = -z * 0.04;
		points.push(new THREE.Vector3(
			Math.sin(t) * 5 + Math.sin(t * 0.35) * 3,
			Math.cos(t * 0.45) * 4.5 + Math.sin(t * 0.25) * 2.5,
			-z,
		));
	}
	const curve = new THREE.CatmullRomCurve3(points);
	const tunnelU = {
		uTime: new THREE.Uniform(0), uWaveAmp: new THREE.Uniform(0.8),
		uBase: new THREE.Uniform(new THREE.Color(0x06030d)),
		uGlowA: new THREE.Uniform(new THREE.Color(0.12, 0.32, 0.9)),
		uGlowB: new THREE.Uniform(new THREE.Color(0.65, 0.25, 0.9)),
		uAccent: new THREE.Uniform(new THREE.Color(1.0, 0.55, 0.12)),
		uGlowIntensity: new THREE.Uniform(1.4),
	};
	const mesh = new THREE.Mesh(
		new THREE.TubeGeometry(curve, 260, 6.4, 32, false),
		new THREE.ShaderMaterial({ vertexShader: tunnelVert, fragmentShader: tunnelFrag, uniforms: tunnelU as any, side: THREE.BackSide }),
	);
	const haloMat = new THREE.ShaderMaterial({
		vertexShader: tunnelHaloVert, fragmentShader: tunnelHaloFrag,
		uniforms: { uTime: new THREE.Uniform(0), uGlowIntensity: new THREE.Uniform(0.6) } as any,
		transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
	});
	const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 260, 7.68, 32, false), haloMat);
	return { mesh, halo };
}

function buildTunnelParticles(): THREE.Points {
	const count = 8000;
	const pos = new Float32Array(count * 3);
	const col = new Float32Array(count * 3);
	const sz = new Float32Array(count);
	const ph = new Float32Array(count);
	const c = new THREE.Color();
	for (let i = 0; i < count; i++) {
		const ang = Math.random() * Math.PI * 2;
		const rad = Math.random() * 6.4 * 0.9;
		pos[i*3] = Math.cos(ang) * rad;
		pos[i*3+1] = Math.sin(ang) * rad;
		pos[i*3+2] = -Math.random() * 300;
		const r = Math.random();
		if (r < 0.65) c.setHSL(0.66, 0.45, 0.8);
		else if (r < 0.9) c.setHSL(0.78, 0.35, 0.75);
		else c.setHSL(0.08, 0.65, 0.75);
		col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
		sz[i] = 0.2 + Math.random() * 0.6;
		ph[i] = Math.random() * Math.PI * 2;
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
	geo.setAttribute("aSz", new THREE.Float32BufferAttribute(sz, 1));
	geo.setAttribute("aPh", new THREE.Float32BufferAttribute(ph, 1));
	return new THREE.Points(geo, new THREE.ShaderMaterial({
		vertexShader: starVert, fragmentShader: starFrag,
		uniforms: { uTime: { value: 0 } },
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
	}));
}

function buildTunnelFog(): { meshes: THREE.Mesh[]; mats: THREE.ShaderMaterial[] } {
	const meshes: THREE.Mesh[] = [];
	const mats: THREE.ShaderMaterial[] = [];
	const fogGeo = new THREE.CircleGeometry(4, 16);
	for (let i = 0; i < 60; i++) {
		const fogMat = new THREE.ShaderMaterial({
			vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)); float a = smoothstep(0.5, 0.0, d) * 0.06; a *= 0.5 + 0.5 * sin(uTime + vUv.x * 3.0); gl_FragColor = vec4(vec3(0.4,0.45,1.0), a); }`,
			uniforms: { uTime: { value: 0 } },
			transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
		});
		const f = new THREE.Mesh(fogGeo, fogMat);
		const zPos = -Math.random() * 300 - 5;
		f.position.set((Math.random()-0.5)*8, (Math.random()-0.5)*8, zPos);
		f.scale.set(0.5+Math.random()*1.5, 0.5+Math.random()*1.5, 1);
		meshes.push(f); mats.push(fogMat);
	}
	return { meshes, mats };
}

function buildTunnelDoors(): { closed: THREE.Mesh; open: THREE.Mesh } {
	const closed = new THREE.Mesh(
		new THREE.BoxGeometry(4, 6, 0.5),
		new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true }),
	);
	const open = new THREE.Mesh(
		new THREE.BoxGeometry(4, 6, 0.5),
		new THREE.MeshBasicMaterial({ color: 0x111111, wireframe: false, transparent: true, opacity: 0.5 }),
	);
	return { closed, open };
}

// ═══════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════

export async function setup(ctx: SetupContext): Promise<B66LesserState> {
	const { scene, renderer } = ctx;
	const fogColor = new THREE.Color(0x0d001a);
	scene.fog = new THREE.FogExp2(fogColor, 0.008);
	scene.background = fogColor;

	const camera = new THREE.PerspectiveCamera(86, 1, 0.05, 800);
	const rig = new THREE.Group();
	rig.add(camera);
	scene.add(rig);

	const b66Effect = new B66Effect();
	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	composer.addPass(new EffectPass(camera, b66Effect));
	composer.setSize(window.innerWidth, window.innerHeight);

	const postfxDeltaRef = { value: 0.016 };
	const postfxRender = () => composer.render(postfxDeltaRef.value);

	// ── Phase 0: Start + Birth canal ──
	const startSprite = buildStartSprite();
	scene.add(startSprite);

	const canalMat = createCanalMaterial();
	canalMat.transparent = true;
	canalMat.depthWrite = false;
	canalMat.opacity = 0.85;

	// Outer canal layer (visible through inner walls)
	const outerCanalMat = createCanalMaterial();
	outerCanalMat.transparent = true;
	outerCanalMat.depthWrite = false;
	outerCanalMat.opacity = 0.25;
	outerCanalMat.uniforms.uBright.value = 0.35;
	outerCanalMat.uniforms.uColor1.value.setRGB(0.08, 0.01, 0.02);
	outerCanalMat.uniforms.uColor2.value.setRGB(0.05, 0.005, 0.01);
	outerCanalMat.uniforms.uColor3.value.setRGB(0.12, 0.015, 0.04);
	outerCanalMat.side = THREE.BackSide;
	const sRatio = OUTER_CANAL_RADIUS / CANAL_RADIUS;
	const outerChunkPool = buildChunkPool(outerCanalMat);
	for (const m of outerChunkPool) {
		m.scale.set(sRatio, sRatio, 1);
		m.renderOrder = -1;
		scene.add(m);
	}

	const texLoader = new THREE.TextureLoader();
	const diffuseTex = texLoader.load(meatDiffuseUrl);
	diffuseTex.wrapS = diffuseTex.wrapT = THREE.RepeatWrapping;
	diffuseTex.repeat.set(1, 1);
	canalMat.uniforms.uDiffuse.value = diffuseTex;

	const chunkPool = buildChunkPool(canalMat);
	for (const m of chunkPool) scene.add(m);

	// Canal audio (underwater ambience)
	const canalAudio = buildCanalAudio();

	// Hit glow — red light when touching the wall
	const hitGlow = new THREE.PointLight(0xff0000, 0, 8);
	hitGlow.position.set(0, 0, 0);
	scene.add(hitGlow);

	// Initial checkpoint at canal entry

	// Debug hitbox visualizer (togglable with Q)
	const vizPath = new THREE.LineCurve3(
		new THREE.Vector3(0, 0, -CHUNK_POOL * CHUNK_LEN / 2),
		new THREE.Vector3(0, 0, CHUNK_POOL * CHUNK_LEN / 2),
	);
	const vizGeo = new THREE.TubeGeometry(vizPath, 32, HITBOX_RAD, 16, false);
	const hitboxViz = new THREE.LineSegments(
		new THREE.EdgesGeometry(vizGeo),
		new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3, depthTest: false }),
	);
	hitboxViz.visible = false;
	hitboxViz.position.set(0, 0, 0);
	scene.add(hitboxViz);

	// ── Phase 1: Desert ──
	const sandFloor = buildSandSheet(false);
	scene.add(sandFloor);
	const sandCeiling = buildSandSheet(true);
	scene.add(sandCeiling);
	const sandParticles = buildSandParticles();
	scene.add(sandParticles);

	const sandstormVortex = buildSandstormVortex();
	scene.add(sandstormVortex);

	// Flying orbs (gentle desert floaters)
	const orbStuff = buildDesertOrbs();
	for (const o of orbStuff.orbs) scene.add(o);

	// ── Phase 2: Biometric test ──
	const biometricTrap = buildBiometricTrap(camera);
	biometricTrap.visible = true;
	scene.add(biometricTrap);

	const heatmap = buildHeatmap();
	scene.add(heatmap);

	const biometricParticles = buildBiometricParticles();
	scene.add(biometricParticles);

	const fractalFloor = buildFractalFloor();
	scene.add(fractalFloor);

	const wall = buildWall();
	wall.visible = false;
	scene.add(wall);

	const leftDoor = buildDoorFrame(false);
	leftDoor.position.set(0, 1.25, -3.0);
	leftDoor.visible = false;
	scene.add(leftDoor);

	const rightDoor = buildDoorFrame(true);
	rightDoor.position.set(0, 1.25, -3.0);
	rightDoor.visible = false;
	scene.add(rightDoor);

	const glitchRing = buildGlitchRing();
	scene.add(glitchRing);

	// ── Phase 3: Void / Cage ──
	const cageMesh = new THREE.Mesh(
		createCylGeo(16, 400, 72, 260),
		new THREE.ShaderMaterial({
			vertexShader: frVert, fragmentShader: cageFrag,
			uniforms: { uTime: new THREE.Uniform(0), uInten: new THREE.Uniform(0), uCol: new THREE.Uniform(new THREE.Color(0x1a3acc)) } as any,
			side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
		}),
	);
	scene.add(cageMesh);

	const stars = buildStarField(5500, 17, 80, 400, (r) => r < 0.5 ? [0.72,0.82,1.0] : r < 0.82 ? [0.96,0.96,1.0] : [0.88,0.92,1.0], [0.28, 2.2]);
	scene.add(stars);

	const nebula = buildStarField(900, 8, 17, 400, (r) => r < 0.5 ? [0.06,0.12,0.48] : [0.22,0.04,0.42], [0.9, 3.5]);
	scene.add(nebula);

	const gpCount = 850;
	const gpPos = new Float32Array(gpCount * 3);
	const gpCol = new Float32Array(gpCount * 3);
	const gpSz = new Float32Array(gpCount);
	for (let i = 0; i < gpCount; i++) {
		gpPos[i*3] = (Math.random()-0.5)*20;
		gpPos[i*3+1] = (Math.random()-0.5)*20;
		gpPos[i*3+2] = -(Math.random()*160);
		gpCol[i*3] = 1.0; gpCol[i*3+1] = 0.82; gpCol[i*3+2] = 0.18;
		gpSz[i] = 0.35 + Math.random() * 0.4;
	}
	const gpGeo = new THREE.BufferGeometry();
	gpGeo.setAttribute("position", new THREE.Float32BufferAttribute(gpPos, 3));
	gpGeo.setAttribute("aCol", new THREE.Float32BufferAttribute(gpCol, 3));
	gpGeo.setAttribute("aSz", new THREE.Float32BufferAttribute(gpSz, 1));
	const gpMesh = new THREE.Points(gpGeo, new THREE.ShaderMaterial({
		vertexShader: particleVert, fragmentShader: particleFrag,
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
	}));
	scene.add(gpMesh);

	const trails: THREE.Object3D[] = [];

	// ── Phase 4: Exit tunnel ──
	const tunnel = buildCurvedTunnel();
	scene.add(tunnel.mesh);
	scene.add(tunnel.halo);

	const tunnelLight = new THREE.PointLight(0x4b1b91, 4.2, 30);
	scene.add(tunnelLight);

	const tunnelParticles = buildTunnelParticles();
	scene.add(tunnelParticles);

	const tf = buildTunnelFog();
	for (const m of tf.meshes) scene.add(m);

	const doors = buildTunnelDoors();
	scene.add(doors.closed);
	scene.add(doors.open);

	// ── Phase visibility groups ──
	const groups: Record<number, THREE.Object3D[]> = {
		0: [startSprite, ...chunkPool, ...outerChunkPool],
		1: [sandFloor, sandCeiling, sandParticles, sandstormVortex, ...orbStuff.orbs],
		2: [biometricTrap, heatmap, biometricParticles, fractalFloor, wall, leftDoor, rightDoor, glitchRing],
		3: [cageMesh, stars, nebula, gpMesh, ...trails],
		4: [tunnel.mesh, tunnel.halo, tunnelLight, tunnelParticles, ...tf.meshes, doors.closed, doors.open],
	};

	// ── Menu overlay (DOM) ──
	menuEl = document.createElement("div");
	menuEl.id = "b66-menu";
	menuEl.style.cssText = `
		position: fixed; top: 0; left: 0; width: 100%; height: 100%;
		display: none; justify-content: center; align-items: center;
		background: rgba(0,0,0,0.7); z-index: 100;
		font-family: monospace;
	`;
	const menuInner = document.createElement("div");
	menuInner.style.cssText = `
		background: rgba(20,0,40,0.9); border: 2px solid #8800cc;
		padding: 24px; border-radius: 12px; min-width: 280px;
	`;
	menuInner.innerHTML = `
		<h2 style="color:#cc66ff;text-align:center;margin:0 0 16px 0;">~ Phase Menu ~</h2>
		<div id="b66-phase-buttons" style="display:flex;flex-direction:column;gap:8px;"></div>
		<p style="color:#666;text-align:center;margin:12px 0 0 0;font-size:12px;">Press P again to close</p>
	`;
	menuEl.appendChild(menuInner);
	const btnContainer = menuInner.querySelector("#b66-phase-buttons")!;
	const phaseNames = ["0: Start + Canal", "1: Purple Desert", "2: Biometric Test", "3: Void Space", "4: Exit Tunnel"];
	const phaseColors = ["#ff6600", "#aa44ff", "#ff0066", "#3366ff", "#ffaa00"];
	phaseNames.forEach((name, i) => {
		const btn = document.createElement("button");
		btn.textContent = name;
		btn.style.cssText = `
			padding: 10px 20px; border: 2px solid ${phaseColors[i]};
			background: rgba(0,0,0,0.5); color: white;
			border-radius: 8px; cursor: pointer; font-size: 16px; font-family: monospace;
			transition: all 0.2s;
		`;
		btn.onmouseenter = () => { btn.style.background = phaseColors[i] + "44"; };
		btn.onmouseleave = () => { btn.style.background = "rgba(0,0,0,0.5)"; };
		btn.onclick = () => {
			if (stateRef) {
				stateRef.phase = i;
				stateRef.phaseT = 0;
				if (i === 0) { stateRef.leanStartTime = 0; stateRef.rig.position.set(0, 0, 0); stateRef.rig.rotation.set(0, 0, 0); }
				stateRef.showMenu = false;
				if (menuEl) menuEl.style.display = "none";
			}
		};
		btnContainer.appendChild(btn);
	});
	document.body.appendChild(menuEl);

	const _onResize = () => composer.setSize(window.innerWidth, window.innerHeight);
	window.addEventListener("resize", _onResize);

	const _keyHandler = (e: KeyboardEvent): void => {
		if (e.key === "p" || e.key === "P") {
			if (!stateRef) return;
			stateRef.showMenu = !stateRef.showMenu;
			if (menuEl) menuEl.style.display = stateRef.showMenu ? "flex" : "none";
		}
		if (e.key === "a" || e.key === "1" || e.key === "A") {
			if (stateRef && stateRef.phase === 2) {
				stateRef.biometricPhase = stateRef.biometricPhase === 0 ? 1 : 0;
			}
		}
		if (e.key === "q" || e.key === "Q") {
			if (stateRef) {
				stateRef.showHitbox = !stateRef.showHitbox;
				stateRef.hitboxViz.visible = stateRef.showHitbox;
			}
		}
		if (e.key === "r" || e.key === "R") {
			if (stateRef && stateRef.phase === 0 && stateRef.leanStartTime < 0) {
				stateRef.rig.position.copy(stateRef.checkpointPos);
				stateRef.heading = stateRef.checkpointHeading;
			}
		}
	};
	document.addEventListener("keydown", _keyHandler);

	renderer.xr.addEventListener("sessionstart", () => {
		const session = renderer.xr.getSession();
		if (session) {
			session.addEventListener("select", (event: XRInputSourceEvent) => {
				if (event.inputSource?.handedness === "right" && stateRef && stateRef.phase === 2) {
					stateRef.biometricPhase = stateRef.biometricPhase === 0 ? 1 : 0;
				}
			});
		}
	});

	stateRef = null; // Will be set after return

	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.0;

	// Start with only phase 0 visible
	for (let p = 0; p <= 4; p++) {
		for (const obj of groups[p]) obj.visible = p === 0;
	}

	const state: B66LesserState = {
		scene, renderer, camera,
		phase: 0, phaseT: 0, showMenu: false, fadeInTime: 0,
		showHitbox: false, hitboxViz, hitboxScale: 1,
		audioCtx: canalAudio?.ctx ?? null, audioMaster: canalAudio?.master ?? null, audioFilter: canalAudio?.filter ?? null,
		audioDrone: canalAudio?.drone ?? null, audioGainDrone: canalAudio?.gainDrone ?? null,
		audioWave: canalAudio?.wave ?? null, audioGainWave: canalAudio?.gainWave ?? null,
		checkpointPos: new THREE.Vector3(0, 0, 30), checkpointHeading: 0,
		hitGlow, hitGlowIntensity: 0,
		rig, camPos: new THREE.Vector3(0, 0, 0),
		heading: 0, currentSpeed: 0, flightSpeed: 3,
		currentPitch: 0, currentRoll: 0,
		orientation: { pitch: 0, roll: 0 },
		speed: { accelerate: false, brake: false },
		startSprite, leanStartTime: 0,
		canalMat, outerCanalMat, chunkPool, outerChunkPool,
		sandFloor, sandCeiling, sandParticles, sandWaveSpeed: 0.5, sandDensity: 2.0,
		desertOrbs: orbStuff.orbs, orbData: orbStuff.data,
		biometricPhase: 0, trapOpacity: 0.85, trapScale: 1,
		biometricTrap, biometricParticles, heatmap, leftDoor, rightDoor, fractalFloor, wall, glitchRing,
		cageMesh, stars, nebula, trails, gpMesh,
		tunnelMesh: tunnel.mesh, tunnelHalo: tunnel.halo, tunnelParticles,
		tunnelFog: tf.meshes, tunnelFogMat: tf.mats, tunnelLight,
		tunnelProgress: 0,
		closedDoor: doors.closed, openDoor: doors.open,
		sandstormVortex,
		groups,
		b66Effect, postfxComposer: composer, postfxRender, postfxDeltaRef,
		_onResize, _keyHandler,
	};
	stateRef = state;
	return state;
}

// ═══════════════════════════════════════════════════════════════════════
//  TICK
// ═══════════════════════════════════════════════════════════════════════

export function tick(state: ExperienceState, ctx: TickContext): { state: ExperienceState } {
	const s = state as B66LesserState;
	const { delta, elapsed } = ctx;
	s.phaseT += delta;
	s.postfxDeltaRef.value = delta;

	// ── Show only current phase ──
	for (let p = 0; p <= 4; p++) {
		const vis = p === s.phase;
		for (const obj of s.groups[p]) {
			if (obj) obj.visible = vis;
		}
	}

	// ── Phase-specific logic ──

	const DEG2RAD = Math.PI / 180;
	const LERP = 0.15;
	s.currentPitch += (s.orientation.pitch - s.currentPitch) * LERP;
	s.currentRoll += (s.orientation.roll - s.currentRoll) * LERP;

	if (s.phase === 0) {
		if (s.leanStartTime >= 0) {
			s.renderer.toneMappingExposure += (0.5 - s.renderer.toneMappingExposure) * delta * 0.5;
			for (const m of s.chunkPool) m.visible = false;
			for (const m of s.outerChunkPool) m.visible = false;
			const pitch = s.orientation.pitch;
			if (pitch > 0.523) {
				if (s.leanStartTime === 0) s.leanStartTime = elapsed;
				else if (elapsed - s.leanStartTime >= 3) {
					s.startSprite.visible = false;
					s.rig.position.set(0, 0, 30);
					s.rig.rotation.set(0, 0, 0);
					s.renderer.toneMappingExposure = 0.5;
					s.leanStartTime = -1;
				}
			} else {
				s.leanStartTime = 0;
			}
		} else {
			// Canal flight — infinite chunks, simple cylindrical hitbox
			s.startSprite.visible = false;
			const { accelerate, brake } = s.speed;
			s.heading -= s.currentRoll * DEG2RAD * 1.5 * delta;
			s.currentSpeed += (s.flightSpeed * 2.0 * (accelerate ? 2.0 : brake ? 0.3 : 1.0) - s.currentSpeed) * delta * 1.2;

			const pitchRad = s.currentPitch * DEG2RAD;
			const forward = new THREE.Vector3(
				-Math.sin(s.heading) * Math.cos(pitchRad),
				-Math.sin(pitchRad),
				-Math.cos(s.heading) * Math.cos(pitchRad),
			);
			s.rig.position.addScaledVector(forward, s.currentSpeed * delta);
			s.rig.rotation.set(-pitchRad, s.heading, -s.currentRoll * DEG2RAD, "YXZ");

			// Slide chunk window so 6 ahead, 3 behind
			const windowStart = s.rig.position.z + CHUNKS_AHEAD * CHUNK_LEN;
			for (let i = 0; i < CHUNK_POOL; i++) {
				s.chunkPool[i].position.z = windowStart - i * CHUNK_LEN;
				s.outerChunkPool[i].position.z = windowStart - i * CHUNK_LEN;
			}
			s.hitboxViz.position.z = s.rig.position.z;

			// Dynamic hitbox + red glow on contact
			const wallR = wallRadAt(s.rig.position.z, s.rig.position.x, s.rig.position.y, elapsed);
			const HITBOX = wallR - 0.15;
			const xyDist = Math.sqrt(s.rig.position.x * s.rig.position.x + s.rig.position.y * s.rig.position.y);
			const hit = xyDist > HITBOX;
			if (hit) {
				const scale = HITBOX / xyDist;
				s.rig.position.x *= scale;
				s.rig.position.y *= scale;
				s.hitboxScale = Math.max(0.85, s.hitboxScale - delta * 3);
				s.hitGlowIntensity = Math.min(3, s.hitGlowIntensity + delta * 5);
				const dir = new THREE.Vector3(s.rig.position.x, s.rig.position.y, 0).normalize().multiplyScalar(HITBOX);
				s.hitGlow.position.copy(dir).add(s.rig.position);
			} else {
				s.hitboxScale += (1 - s.hitboxScale) * delta * 4;
				s.hitGlowIntensity = Math.max(0, s.hitGlowIntensity - delta * 3);
			}
			s.hitGlow.intensity = s.hitGlowIntensity;
			s.hitboxViz.scale.set(s.hitboxScale, s.hitboxScale, 1);
			if (s.rig.position.z > CANAL_NEAR) s.rig.position.z = CANAL_NEAR;

			// Checkpoint — save at deepest Z
			if (s.rig.position.z < s.checkpointPos.z - 100) {
				s.checkpointPos.copy(s.rig.position);
				s.checkpointHeading = s.heading;
			}

			// Canal visual updates
			s.canalMat.uniforms.uLightZ.value = s.rig.position.z - 30;
			const reveal = Math.min(1, s.phaseT / 4.0);
			s.canalMat.uniforms.uVoidReveal.value = reveal;
			s.canalMat.uniforms.uTime.value = elapsed;
			const periPulse = 0.8 + 0.2 * Math.sin(elapsed * 0.8);
			s.canalMat.uniforms.uPeriStrength.value = 6.0 * periPulse;

			// Outer canal follows same visual params
			s.outerCanalMat.uniforms.uLightZ.value = s.canalMat.uniforms.uLightZ.value;
			s.outerCanalMat.uniforms.uTime.value = elapsed;
			s.outerCanalMat.uniforms.uPeriStrength.value = s.canalMat.uniforms.uPeriStrength.value;

			// Canal audio — gentle, deep, wavy underwater ambience
			if (s.audioFilter && s.audioGainDrone && s.audioGainWave) {
				const waveLfo = 0.5 + 0.5 * Math.sin(elapsed * 0.15);
				s.audioFilter.frequency.value = 120 + waveLfo * 100;
				s.audioFilter.Q.value = 0.5 + waveLfo * 0.6;
				s.audioGainDrone.gain.value = 0.02 + waveLfo * 0.03;
				s.audioGainWave.gain.value = 0.015 + waveLfo * 0.025;
				if (s.audioWave) s.audioWave.frequency.value = 80 + waveLfo * 30;
			}

			s.renderer.toneMappingExposure += (1.0 - s.renderer.toneMappingExposure) * delta * 0.5;

			if (s.rig.position.z <= CANAL_FAR) {
				s.phase = 1;
				s.phaseT = 0;
				s.rig.position.set(0, 0.5, 0);
			}
		}
		s.camPos.copy(s.rig.position);

	} else if (s.phase === 1) {
		// Desert flight — full rig physics like canal
		const { accelerate, brake } = s.speed;
		s.heading -= s.currentRoll * DEG2RAD * 1.5 * delta;
		s.currentSpeed += (s.flightSpeed * 2.0 * (accelerate ? 2.0 : brake ? 0.3 : 1.0) - s.currentSpeed) * delta * 1.2;

		const pitchRad = s.currentPitch * DEG2RAD;
		const forward = new THREE.Vector3(
			-Math.sin(s.heading) * Math.cos(pitchRad),
			-Math.sin(pitchRad),
			-Math.cos(s.heading) * Math.cos(pitchRad),
		);
		s.rig.position.addScaledVector(forward, s.currentSpeed * delta);
		s.rig.rotation.set(-pitchRad, s.heading, -s.currentRoll * DEG2RAD, "YXZ");

		// Sand shader update
		const sf = s.sandFloor.material as THREE.ShaderMaterial;
		sf.uniforms.uTime.value = elapsed; sf.uniforms.uWaveSpeed.value = s.sandWaveSpeed; sf.uniforms.uDensity.value = s.sandDensity;
		const sc = s.sandCeiling.material as THREE.ShaderMaterial;
		sc.uniforms.uTime.value = elapsed; sc.uniforms.uWaveSpeed.value = s.sandWaveSpeed; sc.uniforms.uDensity.value = s.sandDensity;
		s.sandFloor.position.x = s.rig.position.x; s.sandFloor.position.z = s.rig.position.z;
		s.sandCeiling.position.x = s.rig.position.x; s.sandCeiling.position.z = s.rig.position.z;
		(s.sandParticles.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
		s.sandParticles.position.copy(s.rig.position);

		updateSandstorm(s, elapsed);

		// Flying orbs — gentle float around player
		for (let i = 0; i < s.desertOrbs.length; i++) {
			const orb = s.desertOrbs[i];
			const data = s.orbData[i];
			const t = elapsed * data.speed + data.phase;
			orb.position.x = s.rig.position.x + Math.sin(t) * data.radiusX;
			orb.position.y = data.baseY + Math.sin(t * 0.7 + 1.3) * 1.5;
			orb.position.z = s.rig.position.z + Math.cos(t * 0.8) * data.radiusZ;
			orb.rotation.x = t * 0.2; orb.rotation.y = t * 0.3;
			const pulse = 0.8 + 0.2 * Math.sin(t * 1.5);
			orb.scale.setScalar(pulse);
		}
		s.camPos.copy(s.rig.position);

	} else if (s.phase === 2) {
		// Biometric test — stationary
		s.rig.position.lerp(new THREE.Vector3(0, 1.6, 0), delta * 2);
		s.rig.rotation.set(0, 0, 0);

		if (s.heatmap.material instanceof THREE.ShaderMaterial) {
			s.heatmap.material.uniforms.uTime.value = elapsed;
		}
		if (s.fractalFloor.material instanceof THREE.ShaderMaterial) {
			s.fractalFloor.material.uniforms.uTime.value = elapsed;
		}
		if (s.biometricParticles.material instanceof THREE.ShaderMaterial) {
			s.biometricParticles.material.uniforms.uTime.value = elapsed;
		}

		const energyBarrier = s.rightDoor.getObjectByName("energyBarrier") as THREE.Mesh | null;
		const doorLight = s.rightDoor.getObjectByName("doorLight") as THREE.PointLight | null;

		if (energyBarrier && doorLight) {
			(energyBarrier.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
			const isGlitching = Math.random() < 0.05;
			const glitchIntensity = isGlitching ? (Math.random() > 0.5 ? 4.0 : 0.1) : 1.0;
			(energyBarrier.material as THREE.ShaderMaterial).uniforms.uGlitch.value = glitchIntensity;
			doorLight.intensity = isGlitching ? Math.random() * 50 : 300.0;
		}

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

		const showTrap = s.biometricPhase === 0;
		s.biometricTrap.visible = showTrap;
		s.leftDoor.visible = !showTrap;
		s.rightDoor.visible = !showTrap;
		s.wall.visible = !showTrap;
		s.heatmap.visible = showTrap;

		if (!showTrap) {
			const lockBar = s.rightDoor.getObjectByName("lockBar") as THREE.Group | null;
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

		const circleMesh = s.biometricTrap.getObjectByName("leftEyeCircle") as THREE.Mesh | null;
		const triangleMesh = s.biometricTrap.getObjectByName("rightEyeTriangle") as THREE.Mesh | null;

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

		s.leftDoor.position.set(0, 1.25, s.rig.position.z - 3);
		s.rightDoor.position.set(0, 1.25, s.rig.position.z - 3);
		s.wall.position.set(0, 0, s.rig.position.z - 3);
		s.heatmap.position.copy(s.rig.position);
		s.biometricTrap.position.set(0, 0, s.rig.position.z - 3);
		s.biometricParticles.position.copy(s.rig.position);
		s.fractalFloor.position.x = s.rig.position.x;
		s.fractalFloor.position.z = s.rig.position.z;
		s.camPos.copy(s.rig.position);

	} else if (s.phase === 3) {
		// Void / Cage flight — mountain-flight physics
		const { accelerate, brake } = s.speed;
		s.heading -= s.currentRoll * DEG2RAD * 1.5 * delta;
		s.currentSpeed += (s.flightSpeed * (accelerate ? 2.0 : brake ? 0.3 : 1.0) - s.currentSpeed) * delta * 1.2;

		const pitchRad = s.currentPitch * DEG2RAD;
		const forward = new THREE.Vector3(
			-Math.sin(s.heading) * Math.cos(pitchRad),
			-Math.sin(pitchRad),
			-Math.cos(s.heading) * Math.cos(pitchRad),
		);
		s.rig.position.addScaledVector(forward, s.currentSpeed * delta);
		s.rig.rotation.set(-pitchRad, s.heading, -s.currentRoll * DEG2RAD, "YXZ");

		// Cage
		(s.cageMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
		s.cageMesh.position.set(0, 0, s.rig.position.z - 80);

		// Stars + nebula
		s.stars.position.set(0, 0, s.rig.position.z - 50);
		s.nebula.position.set(0, 0, s.rig.position.z - 50);
		(s.stars.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
		(s.nebula.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;

		// Golden path
		s.gpMesh.position.set(0, 0, s.rig.position.z);
		s.camPos.copy(s.rig.position);

	} else if (s.phase === 4) {
		// Exit tunnel
		s.tunnelProgress += 0.06 * delta;

		const t = Math.min(0.999, s.tunnelProgress);
		const tunnelMat = s.tunnelMesh.material as THREE.ShaderMaterial;
		tunnelMat.uniforms.uTime.value = elapsed;
		tunnelMat.uniforms.uGlowIntensity.value = 1.6;

		const haloMat = s.tunnelHalo.material as THREE.ShaderMaterial;
		haloMat.uniforms.uTime.value = elapsed;

		(s.tunnelParticles.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;

		for (const fm of s.tunnelFogMat) fm.uniforms.uTime.value = elapsed;

		s.rig.position.set(0, 0, t * 320 - 320);
		s.rig.rotation.set(0, 0, 0);
		s.tunnelLight.position.copy(s.rig.position);

		const showDoors = t > 0.85;
		s.closedDoor.visible = showDoors;
		s.openDoor.visible = showDoors;
		if (showDoors) {
			const doorZ = s.rig.position.z + 30;
			s.closedDoor.position.set(0, 0, doorZ);
			s.openDoor.position.set(0, 0, doorZ);
		}
		s.camPos.copy(s.rig.position);
	}

	// ── Post-FX ──
	s.b66Effect.uniforms.get("uCA")!.value = s.phase === 4 ? 0.14 : 0.12;
	s.b66Effect.uniforms.get("uWarp")!.value = 0;
	s.b66Effect.uniforms.get("uVig")!.value = 0.55;
	s.b66Effect.uniforms.get("uFlicker")!.value = 0;
	s.b66Effect.uniforms.get("uHeartbeat")!.value = 0;
	s.b66Effect.uniforms.get("uTime")!.value = elapsed * 100;

	// ── Fog by phase ──
	const fogTargets: Record<number, { density: number; color: THREE.Color }> = {
		0: { density: 0.006, color: new THREE.Color(0x0a0102) },
		1: { density: 0.008, color: new THREE.Color(0x0d001a) },
		2: { density: 0.12, color: new THREE.Color(0x050011) },
		3: { density: 0.005, color: new THREE.Color(0x010218) },
		4: { density: 0.016, color: new THREE.Color(0x0a0102) },
	};
	const ft = fogTargets[s.phase] ?? fogTargets[0];
	const fog = s.scene.fog as THREE.FogExp2;
	fog.color.lerp(ft.color, delta * 0.5);
	fog.density += (ft.density - fog.density) * delta * 0.5;

	return { state: s };
}

// ═══════════════════════════════════════════════════════════════════════
//  DISPOSE
// ═══════════════════════════════════════════════════════════════════════

export function dispose(state: ExperienceState, scene: THREE.Scene): void {
	const s = state as B66LesserState;
	stateRef = null;
	if (menuEl) { menuEl.remove(); menuEl = null; }
	window.removeEventListener("resize", s._onResize);
	if (s._keyHandler) document.removeEventListener("keydown", s._keyHandler);
	s.postfxComposer.dispose();

	// Stop canal audio
	if (s.audioCtx) s.audioCtx.close();

	const allObjects: THREE.Object3D[] = [];
	for (let p = 0; p <= 4; p++) {
		for (const obj of s.groups[p]) {
			if (obj) allObjects.push(obj);
		}
	}
	allObjects.push(s.startSprite, ...s.chunkPool, ...s.outerChunkPool, s.hitboxViz, s.hitGlow,
		s.sandFloor, s.sandCeiling, s.sandParticles, s.sandstormVortex, ...s.desertOrbs,
		s.biometricTrap, s.biometricParticles, s.heatmap, s.leftDoor, s.rightDoor, s.fractalFloor, s.wall, s.glitchRing,
		s.cageMesh, s.stars, s.nebula, s.gpMesh,
		s.tunnelMesh, s.tunnelHalo, s.tunnelParticles, s.tunnelLight,
		s.closedDoor, s.openDoor);

	for (const obj of allObjects) {
		if (!obj) continue;
		if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
			if (obj.geometry) obj.geometry.dispose();
			if (obj.material) (obj.material as THREE.Material).dispose();
		}
		scene.remove(obj);
	}
}
