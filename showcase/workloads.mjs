// Copyright Proa Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const INTERACTIVE_PAGES = [
	"airbnb-parity",
	"espn",
	"sentry-otel",
	"settings-console",
];

export const PAGE_METADATA = {
	"airbnb-parity": {
		description: "large travel landing page with nested islands and broad UI state",
	},
	espn: {
		description: "sports game page with mutually exclusive, structurally different tabs",
	},
	"sentry-otel": {
		description: "400-row observability log stream with scroll and toggle state",
	},
	"settings-console": {
		description: "application settings page stressing class, data, ARIA, and boolean attributes",
	},
};

async function dispatchClick(locator) {
	await locator.first().evaluate((element) => {
		if (!(element instanceof HTMLElement)) {
			throw new Error("click target is not an HTMLElement");
		}
		if ("disabled" in element && element.disabled) {
			throw new Error("click target is disabled");
		}
		element.dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				composed: true,
				view: window,
			}),
		);
	});
}

async function setInputValue(locator, value) {
	await locator.first().evaluate((element, nextValue) => {
		if (!(element instanceof HTMLInputElement)) {
			throw new Error("input target is not an HTMLInputElement");
		}
		const setter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		setter?.call(element, nextValue);
		element.dispatchEvent(
			new InputEvent("input", {
				bubbles: true,
				cancelable: false,
				composed: true,
				data: nextValue,
				inputType: "insertText",
			}),
		);
	}, value);
}

async function waitFor(page, predicate, message) {
	try {
		await page.waitForFunction(predicate, undefined, { timeout: 5_000 });
	} catch (error) {
		throw new Error(`${message}: ${error.message}`);
	}
}

async function runAirbnb(page) {
	const profile = page.locator(".air-parity-profile");
	await dispatchClick(profile);
	await waitFor(
		page,
		() => document.querySelector(".air-parity-profile")?.getAttribute("aria-expanded") === "true",
		"profile menu did not open",
	);
	await dispatchClick(profile);

	const destination = page.locator(".air-parity-destination-input");
	await setInputValue(destination, "Lake");
	await waitFor(
		page,
		() => !document.querySelector('[aria-label="Suggested destinations"]')?.hasAttribute("hidden"),
		"destination suggestions did not open",
	);
	await dispatchClick(page.locator(".air-parity-option").nth(1));
	await waitFor(
		page,
		() => document.querySelector(".air-parity-destination-input")?.value === "Lake Tahoe",
		"destination signal did not update",
	);

	const fields = page.locator(".air-parity-search > button.air-parity-field");
	await dispatchClick(fields.nth(0));
	await waitFor(
		page,
		() => !document.querySelector('[aria-label="Choose dates"]')?.hasAttribute("hidden"),
		"date picker did not open",
	);
	await dispatchClick(
		page.locator('[aria-label="Move forward to switch to the next month."]'),
	);
	await waitFor(
		page,
		() => !document.querySelector('[aria-label^="Move backward"]')?.hasAttribute("disabled"),
		"calendar did not advance",
	);

	await dispatchClick(fields.nth(1));
	await waitFor(
		page,
		() => !document.querySelector('[aria-label="Choose guests"]')?.hasAttribute("hidden"),
		"guest picker did not open",
	);
	await dispatchClick(page.locator('[aria-label="Increase Adults"]'));
	await dispatchClick(page.locator('[aria-label="Increase Adults"]'));
	await waitFor(
		page,
		() => !document.querySelector('[aria-label="Decrease Adults"]')?.hasAttribute("disabled"),
		"guest counter did not update",
	);

	await dispatchClick(page.locator(".air-parity-favorite"));
	await waitFor(
		page,
		() => !document.querySelector('[aria-labelledby="air-parity-auth-title"]')?.hasAttribute("hidden"),
		"wishlist action did not open authentication dialog",
	);
	return {
		actions: 10,
		assertions: 7,
	};
}

async function runEspn(page) {
	await dispatchClick(page.locator(".game-tabs button").filter({ hasText: /^Gamecast$/ }));
	await waitFor(
		page,
		() => !document.querySelector('[data-panel="gamecast"]')?.hasAttribute("hidden"),
		"Gamecast panel did not activate",
	);
	await dispatchClick(page.locator(".game-tabs button").filter({ hasText: /^Play-by-Play$/ }));
	await waitFor(
		page,
		() => !document.querySelector('[data-panel="play-by-play"]')?.hasAttribute("hidden"),
		"play-by-play panel did not activate",
	);
	await dispatchClick(page.locator(".game-tabs button").filter({ hasText: /^Box Score$/ }));
	await waitFor(
		page,
		() => !document.querySelector('[data-panel="box-score"]')?.hasAttribute("hidden"),
		"box-score panel did not reactivate",
	);
	return {
		actions: 3,
		assertions: 3,
	};
}

async function runSentry(page) {
	const autoRefresh = page.locator(".auto-refresh");
	await dispatchClick(autoRefresh);
	await waitFor(
		page,
		() => document.querySelector(".auto-refresh")?.getAttribute("aria-pressed") === "false",
		"auto-refresh did not turn off",
	);
	await dispatchClick(autoRefresh);
	await waitFor(
		page,
		() => document.querySelector(".auto-refresh")?.getAttribute("aria-pressed") === "true",
		"auto-refresh did not turn back on",
	);
	await page.locator(".logs-viewport").evaluate((element) => {
		element.scrollTop = Math.min(
			Math.max(1_800, element.clientHeight * 3),
			Math.max(1_800, element.scrollHeight - element.clientHeight),
		);
		element.dispatchEvent(new Event("scroll", { bubbles: true }));
	});
	await waitFor(
		page,
		() => Number(document.querySelector("[data-log-stream]")?.getAttribute("data-visible-batches")) > 1,
		"log stream did not reveal another batch after scrolling",
	);
	return {
		actions: 3,
		assertions: 3,
	};
}

async function runSettings(page) {
	await dispatchClick(page.locator(".settings-nav__head button").filter({ hasText: /^Compact$/ }));
	await waitFor(
		page,
		() => document.querySelector(".settings-nav")?.getAttribute("data-state") === "collapsed",
		"settings navigation did not collapse",
	);
	await dispatchClick(page.locator(".settings-nav__head button").filter({ hasText: /^Expand$/ }));
	await waitFor(
		page,
		() => document.querySelector(".settings-nav")?.getAttribute("data-state") === "expanded",
		"settings navigation did not expand",
	);
	await dispatchClick(page.locator('[role="tab"]').filter({ hasText: /^Billing$/ }));
	await waitFor(
		page,
		() => document.querySelector('[role="tabpanel"] h2')?.textContent === "Billing controls",
		"settings tab title did not update",
	);
	await dispatchClick(page.locator(".settings-row").nth(2));
	await waitFor(
		page,
		() => document.querySelector(".settings-detail > p")?.textContent === "Security",
		"selected settings row did not update",
	);
	await dispatchClick(page.locator(".settings-secondary"));
	await waitFor(
		page,
		() => !document.querySelector(".settings-primary")?.hasAttribute("disabled"),
		"save button did not become enabled",
	);
	return {
		actions: 5,
		assertions: 5,
	};
}

export async function runInteractionWorkload(pageName, page) {
	switch (pageName) {
		case "airbnb-parity":
			return runAirbnb(page);
		case "espn":
			return runEspn(page);
		case "sentry-otel":
			return runSentry(page);
		case "settings-console":
			return runSettings(page);
		default:
			throw new Error(`no browser interaction workload is defined for ${pageName}`);
	}
}
