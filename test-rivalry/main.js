import * as THREE from "three";
import { VRButton } from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/webxr/VRButton.js";

// ── Scene ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// ── Camera ──
const camera = new THREE.PerspectiveCamera(90, 1, 0.01, 100);
camera.position.set(0, 0, 0);

// ── Renderer ──
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

// ── Lights ──
const ambient = new THREE.AmbientLight(0x222244, 2);
scene.add(ambient);

// ── Floor Grid (spatial reference) ──
const grid = new THREE.GridHelper(8, 12, 0x444466, 0x222244);
grid.position.z = -3;
scene.add(grid);

// ═══════════════════════════════════════════════════
//  BINOCULAR RIVALRY – Two shapes, same space,
//  different eyes, different layers
// ═══════════════════════════════════════════════════

// ── Yellow Circle (Left Eye only → Layer 1) ──
const circleGeo = new THREE.CircleGeometry(0.35, 64);
const circleMat = new THREE.MeshBasicMaterial({
  color: 0xffdd44,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.92,
});
const circle = new THREE.Mesh(circleGeo, circleMat);
circle.position.set(0, 0, -2.5);
circle.layers.set(1);
scene.add(circle);

// Glow ring around circle
const glowRing = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.5, 64),
  new THREE.MeshBasicMaterial({
    color: 0xffdd44,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.25,
  })
);
glowRing.position.copy(circle.position);
glowRing.layers.set(1);
scene.add(glowRing);

// ── Cyan Triangle (Right Eye only → Layer 2) ──
const triGeo = new THREE.CircleGeometry(0.42, 3);
const triMat = new THREE.MeshBasicMaterial({
  color: 0x44ffdd,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.92,
});
const triangle = new THREE.Mesh(triGeo, triMat);
triangle.position.set(0, 0, -2.5);
triangle.layers.set(2);
scene.add(triangle);

// Glow ring around triangle
const triGlow = new THREE.Mesh(
  new THREE.RingGeometry(0.42, 0.57, 3),
  new THREE.MeshBasicMaterial({
    color: 0x44ffdd,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.25,
  })
);
triGlow.position.copy(triangle.position);
triGlow.layers.set(2);
scene.add(triGlow);

// ── State ──
let locked = false;
let choice = ""; // "circle" | "triangle" | ""
const rollEl = document.getElementById("roll-display")!;
const statusEl = document.getElementById("status")!;
const instrEl = document.getElementById("instructions")!;

// ── Reference Space for head tracking ──
let referenceSpace: XRReferenceSpace | null = null;

renderer.xr.addEventListener("sessionstart", () => {
  instrEl.classList.add("hidden");
  statusEl.classList.remove("hidden");
  statusEl.textContent = "Tilt your head left (←) or right (→)";
  const session = renderer.xr.getSession()!;
  referenceSpace = session.requestReferenceSpace("local");
});

// ═══════════════════════════════════════════════════
//  HEAD TRACKING via XRFrame (predict, not camera.rotation.z)
// ═══════════════════════════════════════════════════

function getHeadRoll(): number {
  const session = renderer.xr.getSession();
  if (!session || !referenceSpace) return 0;
  const frame = renderer.xr.getFrame();
  if (!frame) return 0;
  const pose = frame.getViewerPose(referenceSpace);
  if (!pose) return 0;
  // Roll = rotation around Z-axis (left/right tilt)
  // From quaternion: roll = atan2(2*(qx*qy+qw*qz), qw*qw+qx*qx-qy*qy-qz*qz)
  const q = pose.transform.orientation;
  const roll = Math.atan2(
    2 * (q[0] * q[1] + q[3] * q[2]),
    q[3] * q[3] + q[0] * q[0] - q[1] * q[1] - q[2] * q[2]
  );
  return roll;
}

// ═══════════════════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════════════════

function animate() {
  renderer.setAnimationLoop(() => {
    if (renderer.xr.isPresenting) {
      const roll = getHeadRoll();
      rollEl.textContent = `Roll: ${roll.toFixed(3)} rad`;

      if (!locked) {
        // Subtle pulse animation
        const p = 0.85 + 0.15 * Math.sin(performance.now() * 0.003);
        circleMat.opacity = 0.92 * p;
        triMat.opacity = 0.92 * p;

        // Check head tilt
        if (roll < -0.2) {
          // Tilted left → keep Circle, hide Triangle
          locked = true;
          choice = "circle";
          triangle.visible = false;
          triGlow.visible = false;
          statusEl.textContent = "⏺ Circle selected — Triangle hidden";
          statusEl.style.color = "#ffdd44";
        } else if (roll > 0.2) {
          // Tilted right → keep Triangle, hide Circle
          locked = true;
          choice = "triangle";
          circle.visible = false;
          glowRing.visible = false;
          statusEl.textContent = "⏹ Triangle selected — Circle hidden";
          statusEl.style.color = "#44ffdd";
        }
      } else {
        // Keep pulsing the surviving shape
        const p = 0.85 + 0.15 * Math.sin(performance.now() * 0.003);
        if (choice === "circle") circleMat.opacity = 0.92 * p;
        if (choice === "triangle") triMat.opacity = 0.92 * p;
      }

      renderer.render(scene, camera);
    } else {
      // Desktop fallback: show both overlapping
      rollEl.textContent = "Enter VR to test";
      circle.layers.enableAll();
      triangle.layers.enableAll();
      glowRing.layers.enableAll();
      triGlow.layers.enableAll();
      circleMat.opacity = 0.5;
      triMat.opacity = 0.5;
      renderer.render(scene, camera);
    }
  });
}

animate();

// ── Resize ──
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});
