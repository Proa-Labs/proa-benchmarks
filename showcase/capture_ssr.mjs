// Copyright Proa Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpus, hostname, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import {
	quantile,
	shuffled,
	stableStringHash,
	summarizeNumbers,
} from "./client_js_stats.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

function usage(message) {
	if (message) process.stderr.write(`${message}\n\n`);
	process.stderr.write(`Usage: node showcase/capture_ssr.mjs [options]

Options:
  --dump PATH       Linked showcase dump binary
  --pages CSV       Pages to measure (default: every linked page)
  --repeats N       Independent process repeats per page (default: 5)
  --warmup N        Override fixture warmup count
  --iterations N    Override fixture recorded iterations
  --bootstrap N     Bootstrap resamples for process-level medians (default: 10000)
  --seed N          Deterministic complete-block order seed (default: 8402026)
  --out PATH        Raw JSON output path
  --help            Show this help
`);
	process.exit(message ? 2 : 0);
}

function integer(value, name, { allowZero = false } = {}) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
		usage(`${name} requires ${allowZero ? "a non-negative" : "a positive"} integer`);
	}
	return parsed;
}

function parseArgs(argv) {
	const options = {
		dump:
			process.env.PROA_SHOWCASE_DUMP ||
			resolve(repositoryRoot, "fixtures/airbnb-parity-dump/target/showcase-dump"),
		pages: null,
		repeats: 5,
		warmup: null,
		iterations: null,
		bootstrap: 10_000,
		seed: 8_402_026,
		out: resolve(repositoryRoot, "showcase/results/ssr_raw.json"),
	};
	for (let index = 0; index < argv.length; index += 1) {
		const name = argv[index];
		if (name === "--help") usage();
		const value = argv[index + 1];
		if (!value) usage(`${name} requires a value`);
		switch (name) {
			case "--dump":
				options.dump = resolve(value);
				break;
			case "--pages":
				options.pages = value.split(",").filter(Boolean);
				break;
			case "--repeats":
				options.repeats = integer(value, name);
				break;
			case "--warmup":
				options.warmup = integer(value, name, { allowZero: true });
				break;
			case "--iterations":
				options.iterations = integer(value, name);
				break;
			case "--bootstrap":
				options.bootstrap = integer(value, name);
				break;
			case "--seed":
				options.seed = integer(value, name, { allowZero: true });
				break;
			case "--out":
				options.out = resolve(value);
				break;
			default:
				usage(`unknown option: ${name}`);
		}
		index += 1;
	}
	return options;
}

function run(path, args, description, { encoding = "utf8" } = {}) {
	const result = spawnSync(path, args, {
		encoding,
		maxBuffer: 256 * 1024 * 1024,
	});
	if (result.error) throw new Error(`failed to run ${description}: ${result.error.message}`);
	if (result.status !== 0) {
		throw new Error(`${description} exited ${result.status}: ${result.stderr}`);
	}
	return { stdout: result.stdout, stderr: result.stderr };
}

function runOptional(command, args) {
	const result = spawnSync(command, args, {
		cwd: repositoryRoot,
		encoding: "utf8",
	});
	return result.status === 0 ? result.stdout.trim() : null;
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

async function inputDigest(relativePath) {
	const body = await readFile(resolve(repositoryRoot, relativePath));
	return { path: relativePath, bytes: body.length, sha256: sha256(body) };
}

function processSummary(values, unit, options, key) {
	return {
		unit,
		...summarizeNumbers(values, {
			seed: options.seed ^ stableStringHash(key),
			resamples: options.bootstrap,
		}),
	};
}

function summarizePage(page, samples, options) {
	const rawOutputs = new Set(samples.map((sample) => sample.output_sha256));
	const canonicalOutputs = new Set(
		samples.map((sample) => sample.canonical_output_sha256),
	);
	const byteCounts = new Set(samples.map((sample) => sample.output_bytes));
	if (canonicalOutputs.size !== 1 || byteCounts.size !== 1) {
		throw new Error(`${page} changed semantically across independent processes`);
	}
	const allNs = samples.flatMap((sample) => sample.raw_ns);
	const sortedNs = [...allNs].sort((left, right) => left - right);
	return {
		page,
		processRepeats: samples.length,
		totalRecordedRenders: allNs.length,
		outputBytes: samples[0].output_bytes,
		byteDeterministicAcrossProcesses: rawOutputs.size === 1,
		rawOutputSha256s: [...rawOutputs].sort(),
		canonicalOutputSha256: samples[0].canonical_output_sha256,
		canonicalization:
			"HTML bytes unchanged; object keys recursively sorted only inside application/json script bodies",
		warmupsPerProcess: [...new Set(samples.map((sample) => sample.warmup))],
		iterationsPerProcess: [...new Set(samples.map((sample) => sample.iterations))],
		processMedianUs: processSummary(
			samples.map((sample) => sample.p50_us),
			"microseconds",
			options,
			`${page}:processMedianUs`,
		),
		processMeanUs: processSummary(
			samples.map((sample) => sample.mean_us),
			"microseconds",
			options,
			`${page}:processMeanUs`,
		),
		pooledDescriptiveUs: {
			n: sortedNs.length,
			min: sortedNs[0] / 1_000,
			mean:
				sortedNs.reduce((sum, value) => sum + value, 0) /
				sortedNs.length /
				1_000,
			p50: quantile(sortedNs, 0.5) / 1_000,
			p95: quantile(sortedNs, 0.95) / 1_000,
			p99: quantile(sortedNs, 0.99) / 1_000,
			max: sortedNs.at(-1) / 1_000,
			note: "descriptive only; process repeats, not pooled inner renders, are the independent units",
		},
	};
}

const options = parseArgs(process.argv.slice(2));
await stat(options.dump).catch((error) => {
	throw new Error(`showcase dump binary is unavailable at ${options.dump}: ${error.message}`);
});
const availablePages = run(options.dump, ["--list-pages"], "showcase page listing").stdout
	.trim()
	.split(/\s+/)
	.filter(Boolean);
options.pages ??= availablePages;
if (options.pages.length === 0) usage("no pages selected");
for (const page of options.pages) {
	if (!availablePages.includes(page)) usage(`linked fixture does not contain page ${page}`);
}

const records = [];
const executionOrder = [];
let sequence = 0;
for (let repeat = 1; repeat <= options.repeats; repeat += 1) {
	const orderedPages = shuffled(
		options.pages,
		options.seed ^ stableStringHash(`ssr-block:${repeat}`),
	);
	for (const page of orderedPages) {
		sequence += 1;
		const args = ["--bench", "--page", page];
		if (options.warmup !== null) args.push("--warmup", String(options.warmup));
		if (options.iterations !== null) args.push("--iterations", String(options.iterations));
		process.stdout.write(
			`SHOWCASE_SSR_START sequence=${sequence} repeat=${repeat} page=${page}\n`,
		);
		const result = run(options.dump, args, `${page} SSR process repeat ${repeat}`);
		const parsed = JSON.parse(result.stdout);
		if (parsed.pages?.length !== 1 || parsed.pages[0].page !== page) {
			throw new Error(`${page} process returned an unexpected report`);
		}
		const sample = {
			sequence,
			repeat,
			...parsed.pages[0],
		};
		records.push(sample);
		executionOrder.push({ sequence, repeat, page });
		process.stdout.write(
			`SHOWCASE_SSR_DONE ${JSON.stringify({
				sequence,
				repeat,
				page,
				outputBytes: sample.output_bytes,
				meanUs: sample.mean_us,
				p50Us: sample.p50_us,
				p95Us: sample.p95_us,
			})}\n`,
		);
	}
}

const fixtureLock = await readFile(
	resolve(repositoryRoot, "fixtures/airbnb-parity-dump/Cargo.lock"),
	"utf8",
);
const proaRevision = fixtureLock.match(
	/name = "proa_showcase"[\s\S]*?source = "git\+[^#]+#([0-9a-f]{40})"/,
)?.[1];
const binary = await readFile(options.dump);
const report = {
	schemaVersion: 1,
	method: {
		unit: "one release benchmark process per page and repeat",
		order: "seeded randomized complete blocks; each repeat contains every selected page",
		inference:
			"confidence intervals use process-level medians; pooled inner renders are retained for descriptive quantiles only",
		outcomeParity:
			"each page must retain an identical byte count and canonical document SHA-256; raw byte hashes separately reveal JSON object-key-order nondeterminism",
	},
	configuration: {
		pages: options.pages,
		processRepeatsPerPage: options.repeats,
		warmupOverride: options.warmup,
		iterationsOverride: options.iterations,
		seed: options.seed,
		bootstrapResamples: options.bootstrap,
	},
	provenance: {
		generatedAt: new Date().toISOString(),
		repository: {
			commit: runOptional("git", ["rev-parse", "HEAD"]),
			branch: runOptional("git", ["branch", "--show-current"]),
			status: runOptional("git", ["status", "--short"]),
		},
		proaRevision: proaRevision ?? null,
		fixtureBinary: {
			path: options.dump,
			bytes: binary.length,
			sha256: sha256(binary),
		},
		inputs: await Promise.all([
			inputDigest("fixtures/airbnb-parity-dump/Cargo.toml"),
			inputDigest("fixtures/airbnb-parity-dump/Cargo.lock"),
			inputDigest("fixtures/airbnb-parity-dump/src/main.rs"),
			inputDigest("showcase/capture_ssr.mjs"),
			inputDigest("showcase/client_js_stats.mjs"),
		]),
		host: {
			hostname: hostname(),
			platform: platform(),
			osRelease: release(),
			cpuModel: cpus()[0]?.model ?? null,
			logicalCpuCount: cpus().length,
			totalMemoryBytes: totalmem(),
		},
	},
	executionOrder,
	summaries: options.pages.map((page) =>
		summarizePage(
			page,
			records.filter((record) => record.page === page),
			options,
		),
	),
	records,
};
await mkdir(dirname(options.out), { recursive: true });
await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
	`SHOWCASE_SSR_RESULT ${JSON.stringify({
		out: options.out,
		pages: options.pages.length,
		processRepeatsPerPage: options.repeats,
		records: records.length,
	})}\n`,
);
