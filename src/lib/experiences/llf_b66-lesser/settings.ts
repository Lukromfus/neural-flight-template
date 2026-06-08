import * as THREE from "three";
import type { ExperienceState } from "../types";
import type { B66LesserState } from "./scene";

export function applySettings(
	id: string,
	value: number | boolean | string,
	state: ExperienceState,
	scene: THREE.Scene,
): void {
	const s = state as B66LesserState;
	switch (id) {
		case "flightSpeed":
			s.flightSpeed = value as number;
			break;
		case "sandWaveSpeed":
			s.sandWaveSpeed = value as number;
			break;
		case "sandDensity":
			s.sandDensity = value as number;
			break;
		default:
			break;
	}
	void scene;
}
