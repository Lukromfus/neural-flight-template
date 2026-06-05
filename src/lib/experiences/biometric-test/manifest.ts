import type { ExperienceManifest, ParameterDef } from "../types";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";

const parameters: ParameterDef[] = [
	{
		id: "trapOpacity",
		label: "Opacity",
		group: "Biometric Trap",
		min: 0,
		max: 1,
		default: 0.85,
		step: 0.05,
		icon: "Eye",
	},
	{
		id: "trapScale",
		label: "Scale",
		group: "Biometric Trap",
		min: 0.1,
		max: 3,
		default: 1,
		step: 0.1,
		icon: "Maximize",
	},
	{
		id: "spinSpeed",
		label: "Spin Speed",
		group: "Biometric Trap",
		min: 0,
		max: 3,
		default: 0.7,
		step: 0.1,
		icon: "RotateCw",
	},
];

export const manifest: ExperienceManifest = {
	id: "biometric-test",
	name: "Biometric Test",
	description: "Test the VR binocular rivalry effect with 3D PBR shapes on stereo layers.",
	version: "0.1.0",
	author: "LuFu",

	parameters,
	outputs: [],
	interfaces: { orientation: false, speed: false },

	camera: { fov: 86, near: 0.05, far: 100 },
	scene: {
		background: "#000000",
		fogNear: 0,
		fogFar: 0,
		fogColor: "#000000",
		ambientIntensity: 0.0,
		sunIntensity: 0.0,
		sunColor: "#ffffff",
		sunPosition: { x: 0, y: 100, z: 0 },
	},
	spawn: { position: { x: 0, y: 0, z: 0 } },

	setup,
	tick,
	applySettings,
	updatePlayer,
	dispose,
};
