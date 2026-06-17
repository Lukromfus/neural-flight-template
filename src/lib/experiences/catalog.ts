import { manifest as b1Lesser } from "./llf_b1-lesser";
import { manifest as b2Lesser } from "./llf_b2-lesser";
import { manifest as b3Lesser } from "./llf_b3-lesser";
import { manifest as b4Lesser } from "./llf_b4-lesser";
import { manifest as b5Lesser } from "./llf_b5-lesser";
import { manifest as b5dotLesser } from "./llf_b5.lesser";
import { manifest as b6Lesser } from "./llf_b6-lesser";
import { manifest as b66Lesser } from "./llf_b66-lesser";
import { manifest as biometricTest } from "./biometric-test";
import { manifest as bLesser } from "./llf_b-lesser/manifest";
import { manifest as cloudTowers } from "./cloud-towers";
import { manifest as gradientPrism } from "./gradient-prism";
import { manifest as mountainFlight } from "./mountain-flight";
import { manifest as shaderDemo } from "./shader-demo";
import type { ExperienceManifest } from "./types";

// ── Registry ──
//
// Students: To register your experience, add 2 lines:
//   1. Import:  import { manifest as myExp } from "./my-experience";
//   2. Entry:   "my-experience": myExp,
//
// The ID must match the folder name and the manifest.id field.

const CATALOG: Record<string, ExperienceManifest> = {
	"llf_b1-lesser": b1Lesser,
	"llf_b2-lesser": b2Lesser,
	"llf_b3-lesser": b3Lesser,
	"llf_b4-lesser": b4Lesser,
	"llf_b5-lesser": b5Lesser,
	"llf_b5.lesser": b5dotLesser,
	"llf_b6-lesser": b6Lesser,
	"llf_b66-lesser": b66Lesser,
	"biometric-test": biometricTest,
	"llf_b-lesser": bLesser,
	"cloud-towers": cloudTowers,
	"gradient-prism": gradientPrism,
	"mountain-flight": mountainFlight,
	"shader-demo": shaderDemo,
};

export const DEFAULT_EXPERIENCE_ID = "mountain-flight";

/** Get experience by ID — throws with available IDs if not found */
export function getExperience(id: string): ExperienceManifest {
	const exp = CATALOG[id];
	if (!exp) {
		const available = Object.keys(CATALOG).join(", ");
		throw new Error(`Experience "${id}" not found. Available: [${available}]`);
	}
	return exp;
}

/** List all available experiences (for Landing Page catalog) */
export function listExperiences(): ExperienceManifest[] {
	return Object.values(CATALOG);
}
