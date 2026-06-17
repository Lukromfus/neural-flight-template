import type { ExperienceManifest, ParameterDef } from "../types";
import { updatePlayer } from "./player";
import { dispose, setup, tick } from "./scene";
import { applySettings } from "./settings";

const parameters: ParameterDef[] = [
	{
		id: "flightSpeed",
		label: "Flight Speed",
		group: "Flight",
		min: 1,
		max: 20,
		default: 5,
		step: 0.5,
		unit: "m/s",
		icon: "Wind",
	},
	{
		id: "sandWaveSpeed",
		label: "Sand Wave Speed",
		group: "Sand",
		min: 0.1,
		max: 3.0,
		default: 0.8,
		step: 0.1,
		unit: "",
		icon: "Waves",
	},
	{
		id: "sandDensity",
		label: "Sand Density",
		group: "Sand",
		min: 0.1,
		max: 2.0,
		default: 1.0,
		step: 0.1,
		unit: "",
		icon: "Droplets",
	},
];

export const manifest: ExperienceManifest = {
	id: "llf_b66-lesser",
	name: "B66.LESSER",
	description:
		"Infinite purple sands. Arrive from the light and drift across endless dunes under a mirror of sand.",
	version: "0.1.0",
	author: "B.lesser",

	parameters,
	outputs: [],
	interfaces: { orientation: true, speed: true },

	camera: { fov: 86, near: 0.05, far: 800 },
	scene: {
		background: "#0d001a",
		fogNear: 0,
		fogFar: 0,
		fogColor: "#0d001a",
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
