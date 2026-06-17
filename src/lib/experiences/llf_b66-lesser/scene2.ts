import * as THREE from "three";
import type { B66LesserState } from "./scene";

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

// Sandstorm vortex — visual effect for phase 1 (desert) sub-event
export function buildSandstormVortex(): THREE.Mesh {
	const mat = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
		vertexShader: `
			varying vec3 vPos;
			void main() {
				vPos = position;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: `
			${NOISE_GLSL}
			uniform float uTime;
			uniform float uIntensity;
			varying vec3 vPos;

			void main() {
				vec3 p = normalize(vPos);
				float angle = atan(p.y, p.x);
				float radius = length(p.xy);
				float twist = angle + radius * 4.0 - uTime * 2.0;
				vec3 twistedPos = vec3(cos(twist) * radius, sin(twist) * radius, p.z + uTime * 1.5);

				float n = fbm(twistedPos * 5.0 + uTime * 0.2);
				float n2 = fbm(twistedPos * 8.0 - uTime * 0.4);
				float swirl = smoothstep(0.2, 0.8, n * 0.5 + n2 * 0.5);

				vec3 dark = vec3(0.1, 0.0, 0.15);
				vec3 bright = vec3(0.8, 0.2, 0.9);

				vec3 color = mix(dark, bright, swirl);
				color += vec3(0.6, 0.1, 0.5) * uIntensity;

				float fade = 1.0 - abs(p.z);
				gl_FragColor = vec4(color * fade * (0.5 + uIntensity * 0.5), 1.0);
			}`,
	});

	const mesh = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 32), mat);
	mesh.visible = false;
	return mesh;
}

// Update sandstorm vortex in desert phase (phase 1)
// After ~30s in desert, sandstorm intensity rises, then fades
export function updateSandstorm(s: B66LesserState, elapsed: number): void {
	if (!s.sandstormVortex) return;

	const desertTime = s.phaseT;
	let intensity = 0;

	if (desertTime > 25 && desertTime < 55) {
		intensity = Math.sin((desertTime - 25) / 30 * Math.PI);
	}

	const active = intensity > 0.01;
	s.sandstormVortex.visible = active;

	if (active) {
		const mat = s.sandstormVortex.material as THREE.ShaderMaterial;
		mat.uniforms.uTime.value = elapsed;
		mat.uniforms.uIntensity.value = intensity;
		s.sandstormVortex.position.copy(s.rig.position);
	}
}
