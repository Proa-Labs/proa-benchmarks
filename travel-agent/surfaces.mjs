import { readFileSync } from "node:fs";

const fixture = JSON.parse(
	readFileSync(new URL("./surfaces.json", import.meta.url), "utf8"),
);

export const TRIP = Object.freeze(fixture.trip);
export const SURFACES = Object.freeze(
	fixture.surfaces.map((surface) => Object.freeze(surface)),
);
