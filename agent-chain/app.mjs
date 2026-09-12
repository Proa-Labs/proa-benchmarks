import { createElement as h, useEffect } from "react";

export const VENDORS = [
	{
		id: "aster",
		name: "Aster Systems",
		status: "Action required",
		code: "AST-731",
	},
	{ id: "birch", name: "Birch Analytics", status: "Verified", code: "BIR-204" },
	{
		id: "cobalt",
		name: "Cobalt Freight",
		status: "Action required",
		code: "COB-918",
	},
	{ id: "delta", name: "Delta Medical", status: "Verified", code: "DEL-447" },
	{
		id: "ember",
		name: "Ember Security",
		status: "Action required",
		code: "EMB-562",
	},
];

function withRun(path, runId) {
	if (!runId) return path;
	return `${path}?run=${encodeURIComponent(runId)}`;
}

function StartPage({ vendors, runId }) {
	return h(
		"main",
		{ "data-agent-chain-page": "start" },
		h("h1", null, "Vendor compliance review"),
		h(
			"p",
			null,
			"Review every dossier. Record a verification code only when its status is Action required.",
		),
		h(
			"ul",
			{ "data-vendor-list": "" },
			...vendors.map((vendor) =>
				h(
					"li",
					{ key: vendor.id },
					h(
						"a",
						{
							href: withRun(`/vendor/${vendor.id}`, runId),
							"data-vendor-link": vendor.id,
						},
						vendor.name,
					),
				),
			),
		),
		h(
			"a",
			{ href: withRun("/submit", runId), "data-submit-link": "" },
			"Submit collected codes",
		),
	);
}

function VendorPage({ vendor, runId }) {
	return h(
		"main",
		{
			"data-agent-chain-page": "vendor",
			"data-vendor-dossier": "",
			"data-vendor-id": vendor.id,
		},
		h("h1", null, `${vendor.name} dossier`),
		h(
			"dl",
			null,
			h("dt", null, "Status"),
			h("dd", { "data-field": "status" }, vendor.status),
			h("dt", null, "Verification code"),
			h("dd", { "data-field": "code" }, vendor.code),
		),
		h("a", { href: withRun("/start", runId) }, "Back to review"),
		" ",
		h("a", { href: withRun("/submit", runId) }, "Submit report"),
	);
}

function SubmitPage({ vendors, runId }) {
	return h(
		"main",
		{ "data-agent-chain-page": "submit" },
		h("h1", null, "Submit compliance report"),
		h(
			"p",
			null,
			"Enter codes only for vendors whose dossier says Action required. Leave every other field empty.",
		),
		h(
			"form",
			{ action: "/result", method: "get", "data-compliance-form": "" },
			h("input", { type: "hidden", name: "run", defaultValue: runId }),
			...vendors.map((vendor) =>
				h(
					"label",
					{ key: vendor.id },
					`${vendor.name} code`,
					h("input", {
						name: `code_${vendor.id}`,
						autoComplete: "off",
						"data-code-input": vendor.id,
					}),
				),
			),
			h("button", { type: "submit" }, "Submit report"),
		),
	);
}

function ResultPage({ accepted, errors, runId }) {
	return h(
		"main",
		{
			"data-agent-chain-page": "result",
			"data-submission-result": accepted ? "accepted" : "rejected",
		},
		h(
			"h1",
			null,
			accepted ? "Submission accepted: 3/3" : "Submission rejected",
		),
		accepted
			? h("p", null, "All action-required vendors were reported correctly.")
			: h(
					"ul",
					{ "data-submission-errors": "" },
					...errors.map((error) => h("li", { key: error }, error)),
				),
		h("a", { href: withRun("/submit", runId) }, "Return to report"),
	);
}

export function App(props) {
	useEffect(() => {
		document.documentElement.dataset.agentHydrated = "true";
	}, []);

	switch (props.page) {
		case "start":
			return h(StartPage, props);
		case "vendor":
			return h(VendorPage, props);
		case "submit":
			return h(SubmitPage, props);
		case "result":
			return h(ResultPage, props);
		default:
			return h(
				"main",
				{ "data-agent-chain-page": "missing" },
				h("h1", null, "Not found"),
			);
	}
}
