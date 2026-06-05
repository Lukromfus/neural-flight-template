import * as THREE from "three";
import type { ExperienceState } from "../types";
import type { BiometricTestState } from "./scene";

export function applySettings(
	id: string,
	value: number | boolean | string,
	state: ExperienceState,
	_scene: THREE.Scene,
): void {
	const s = state as BiometricTestState;

	switch (id) {
		case "trapOpacity":
			s.trapOpacity = value as number;
			break;
		case "trapScale":
			s.trapScale = value as number;
			break;
		case "spinSpeed":
			s.spinSpeed = value as number;
			break;
		default:
			break;
	}
}
