import { createElement as h } from "react";
import { hydrateRoot } from "react-dom/client";
import { App } from "./app.mjs";

const root = document.querySelector("#root");
const seed = document.querySelector("#agent-chain-data");

if (!root || !seed) {
	throw new Error("agent-chain hydration seed is missing");
}

const props = JSON.parse(seed.textContent || "{}");
hydrateRoot(root, h(App, props), {
	onRecoverableError(error) {
		document.documentElement.dataset.agentHydrationError = String(error);
	},
});
