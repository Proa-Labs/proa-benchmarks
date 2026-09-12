#!/usr/bin/env node

/**
 * Normalized-DOM parity gate for the legacy Rust standard-page fixture.
 *
 * This gate deliberately covers static HTML SSR only. It does not claim
 * hydration, routing, data loading, or HTTP lifecycle equivalence. Browser
 * comments are omitted because several component renderers emit internal
 * hydration delimiters; their bytes and render cost remain in each framework's
 * raw output, but the comments are not application-visible DOM.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus, release as osRelease, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const benchDir = dirname(fileURLToPath(import.meta.url));
const workspaceDir = resolve(benchDir, "..");
const resultDir = join(benchDir, "results");
const require = createRequire(import.meta.url);
const frameworks = [
  {
    id: "proa_fresh_owned",
    argument: "proa",
    implementation: "Proa",
    allocationPolicy: "fresh owned String",
    role: "cross-framework baseline",
    criterionRow: "ssr_frameworks/proa/fresh_owned_full",
    crossFrameworkComparable: true,
  },
  {
    id: "proa_reused_chained",
    argument: "proa-reused",
    implementation: "Proa",
    allocationPolicy: "reused ChainedBumpWriter; ownership excluded",
    role: "allocation-policy evidence",
    criterionRow: "ssr_frameworks/proa/reused_chained_full",
    crossFrameworkComparable: false,
  },
  {
    id: "proa_raw_baseline",
    argument: "proa-raw",
    implementation: "Proa",
    allocationPolicy: "reused caller-provided cursor; raw writes; ownership excluded",
    role: "parity-only manual-write control; component and macro work excluded",
    criterionRow: null,
    crossFrameworkComparable: false,
  },
  {
    id: "askama",
    argument: "askama",
    implementation: "Askama",
    allocationPolicy: "fresh owned String",
    role: "cross-framework peer",
    criterionRow: "ssr_frameworks/askama/ssr",
    crossFrameworkComparable: true,
  },
  {
    id: "sailfish",
    argument: "sailfish",
    implementation: "Sailfish",
    allocationPolicy: "fresh owned String",
    role: "cross-framework peer",
    criterionRow: "ssr_frameworks/sailfish/ssr",
    crossFrameworkComparable: true,
  },
  {
    id: "leptos",
    argument: "leptos",
    implementation: "Leptos",
    allocationPolicy: "fresh owned String",
    role: "cross-framework peer",
    criterionRow: "ssr_frameworks/leptos/ssr",
    crossFrameworkComparable: true,
  },
  {
    id: "dioxus",
    argument: "dioxus",
    implementation: "Dioxus",
    allocationPolicy: "fresh owned String",
    role: "cross-framework peer",
    criterionRow: "ssr_frameworks/dioxus/ssr",
    adapterNote:
      "Dioxus 0.6 has no document-level html RSX element; the adapter writes the static outer html tag into the same fresh String, while Dioxus renders head, body, and fixture control flow.",
    crossFrameworkComparable: true,
  },
  {
    id: "yew",
    argument: "yew",
    implementation: "Yew",
    allocationPolicy: "fresh owned String",
    role: "cross-framework peer",
    criterionRow: "ssr_frameworks/yew/ssr",
    crossFrameworkComparable: true,
  },
];
const fixtureFiles = [
  "Cargo.toml",
  "rendering/Cargo.toml",
  "rust-toolchain.toml",
  ".cargo/config.toml",
  "rendering/standard_page_parity.mjs",
  "rendering/src/bin/standard_page_dump.rs",
  "rendering/src/lib.rs",
  "rendering/src/proa_page.rs",
  "rendering/src/askama_page.rs",
  "rendering/src/sailfish_page.rs",
  "rendering/src/leptos_page.rs",
  "rendering/src/dioxus_page.rs",
  "rendering/src/yew_page.rs",
  "rendering/templates/benchmark.html",
  "rendering/templates/benchmark.stpl",
  "rendering/benches/ssr_comparison.rs",
];
const proaDependencyNames = [
  "proa_core",
  "proa_macros",
  "proa_showcase",
];

function command(commandName, args, options = {}) {
  return execFileSync(commandName, args, {
    cwd: workspaceDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  }).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function sha256Files(paths) {
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(join(workspaceDir, path)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp.json`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

function firstDifference(left, right) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  if (index === limit && left.length === right.length) return null;
  const start = Math.max(0, index - 100);
  const end = index + 100;
  return {
    index,
    expected: left.slice(start, end),
    actual: right.slice(start, end),
  };
}

const latestReportPath = join(resultDir, "standard_page_parity.json");
const startedAt = new Date().toISOString();
let reportCompleted = false;
mkdirSync(resultDir, { recursive: true });
writeJsonAtomic(latestReportPath, {
  schema_version: 1,
  status: "running",
  started_at: startedAt,
  note: "A prior pass is not current evidence; this run has not completed.",
});
process.on("exit", (exitCode) => {
  if (reportCompleted || exitCode === 0) return;
  writeJsonAtomic(latestReportPath, {
    schema_version: 1,
    status: "error",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    exit_code: exitCode,
    note: "The gate stopped before producing a complete parity comparison.",
  });
});
// Resolve the non-core dependency only after replacing any stale latest
// report. A missing Playwright install must leave explicit error evidence
// instead of preserving an older pass.
const { chromium } = await import("playwright");
const workspacePackageJsonPath = join(workspaceDir, "package.json");
const workspacePackageJson = JSON.parse(
  readFileSync(workspacePackageJsonPath, "utf8"),
);
const playwrightPackagePath = require.resolve("playwright/package.json");
const playwrightPackage = JSON.parse(readFileSync(playwrightPackagePath, "utf8"));
// Resolve Playwright's private dependency from Playwright itself. npm happened
// to hoist playwright-core to the workspace root; pnpm correctly keeps the
// transitive package behind Playwright's dependency boundary.
const requireFromPlaywright = createRequire(playwrightPackagePath);
const playwrightCorePackagePath = requireFromPlaywright.resolve(
  "playwright-core/package.json",
);
const playwrightCorePackage = JSON.parse(
  readFileSync(playwrightCorePackagePath, "utf8"),
);
const declaredPlaywright = workspacePackageJson.dependencies?.playwright;
if (declaredPlaywright !== playwrightPackage.version) {
  throw new Error(
    `installed Playwright ${playwrightPackage.version} does not match the exact package.json pin ${declaredPlaywright ?? "<missing>"}`,
  );
}
const declaredPlaywrightCore = playwrightPackage.dependencies?.["playwright-core"];
if (declaredPlaywrightCore !== playwrightCorePackage.version) {
  throw new Error(
    `installed playwright-core ${playwrightCorePackage.version} does not match Playwright's exact dependency ${declaredPlaywrightCore ?? "<missing>"}`,
  );
}

function selectedCodegenEnvironment() {
  const exactNames = new Set([
    "RUSTFLAGS",
    "CARGO_ENCODED_RUSTFLAGS",
    "CARGO_BUILD_TARGET",
  ]);
  const prefixes = [
    "CARGO_PROFILE_BENCH_",
    "CARGO_PROFILE_RELEASE_",
    "CARGO_TARGET_",
  ];
  return Object.fromEntries(
    Object.entries(process.env)
      .filter(
        ([name]) =>
          exactNames.has(name) || prefixes.some((prefix) => name.startsWith(prefix)),
      )
      .filter(([name]) => !name.endsWith("_RUNNER"))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

function resolvedProaDependencies() {
  const metadata = JSON.parse(
    command("cargo", ["metadata", "--format-version", "1", "--locked"]),
  );
  return Object.fromEntries(
    proaDependencyNames.map((name) => {
      const dependency = metadata.packages.find((pkg) => pkg.name === name);
      if (!dependency?.source?.startsWith("git+https://github.com/Proa-Labs/proa")) {
        throw new Error(`${name} did not resolve from Proa's GitHub repository`);
      }
      return [
        name,
        {
          version: dependency.version,
          source: dependency.source,
        },
      ];
    }),
  );
}

function sourceFingerprint() {
  return {
    fixture_source_sha256: sha256Files(fixtureFiles),
    proa_dependencies: resolvedProaDependencies(),
    cargo_lock_sha256: sha256File(join(workspaceDir, "Cargo.lock")),
    package_json_sha256: sha256File(workspacePackageJsonPath),
  };
}

const sourceBeforeBuild = sourceFingerprint();
const cargoBuildArgs = [
  "build",
  "--release",
  "--locked",
  "-p",
  "proa_bench",
  "--bin",
  "standard_page_dump",
  "--message-format=json-render-diagnostics",
];
const buildMessages = execFileSync(
  "cargo",
  cargoBuildArgs,
  {
    cwd: workspaceDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  },
);
const executable = buildMessages
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .find(
    (message) =>
      message.reason === "compiler-artifact" &&
      message.target?.name === "standard_page_dump" &&
      message.executable,
  )?.executable;
if (!executable) {
  throw new Error("cargo did not report the standard_page_dump executable");
}

const raw = new Map(
  frameworks.map(({ id, argument }) => [
    id,
    execFileSync(executable, [argument], {
      cwd: workspaceDir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  ]),
);

const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const canonical = new Map();

try {
  const context = await browser.newContext({ javaScriptEnabled: false });
  for (const { id } of frameworks) {
    const page = await context.newPage();
    await page.setContent(raw.get(id), { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(() => {
      const preserveWhitespaceTags = new Set(["PRE", "SCRIPT", "STYLE", "TEXTAREA"]);
      const preserveWhitespaceModes = new Set([
        "pre",
        "pre-line",
        "pre-wrap",
        "break-spaces",
      ]);
      const collapsibleWhitespace = /[\u0009\u000a\u000c\u000d\u0020]+/gu;

      function normalizedText(value, preserve) {
        if (preserve) return value;
        return value
          .replace(collapsibleWhitespace, " ")
          .replace(/^ /u, "")
          .replace(/ $/u, "");
      }

      function compareAttribute([leftName, leftValue], [rightName, rightValue]) {
        if (leftName < rightName) return -1;
        if (leftName > rightName) return 1;
        if (leftValue < rightValue) return -1;
        if (leftValue > rightValue) return 1;
        return 0;
      }

      function elementNode(element, inheritedPreserve = false) {
        const whiteSpace = getComputedStyle(element).whiteSpace;
        const preserve =
          inheritedPreserve ||
          preserveWhitespaceTags.has(element.tagName) ||
          preserveWhitespaceModes.has(whiteSpace);
        const attributes = [...element.attributes]
          .map(({ name, value }) => [name, value])
          .sort(compareAttribute);
        const children = [];
        let text = "";

        const flushText = () => {
          const value = normalizedText(text, preserve);
          text = "";
          if (value.length === 0) return;
          children.push(["#text", value]);
        };

        for (const child of element.childNodes) {
          if (child.nodeType === Node.COMMENT_NODE) continue;
          if (child.nodeType === Node.TEXT_NODE) {
            text += child.nodeValue ?? "";
            continue;
          }
          if (child.nodeType === Node.ELEMENT_NODE) {
            flushText();
            children.push(elementNode(child, preserve));
          }
        }
        flushText();
        const renderedText =
          element instanceof HTMLElement &&
          !["HEAD", "SCRIPT", "STYLE", "TEMPLATE"].includes(element.tagName)
            ? normalizedText(element.innerText, preserve)
            : null;
        return [element.tagName.toLowerCase(), attributes, renderedText, children];
      }

      // Guard against a normalizer that accidentally erases the application-
      // visible space at an inline-element boundary while still ignoring
      // indentation between ordinary block elements.
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-10000px;top:0";
      document.body.append(probe);
      probe.innerHTML = "<p>Hello <strong>world</strong></p>";
      const spacedInline = JSON.stringify(elementNode(probe.firstElementChild));
      probe.innerHTML = "<p>Hello<strong>world</strong></p>";
      const joinedInline = JSON.stringify(elementNode(probe.firstElementChild));
      probe.innerHTML = "<div><p>A</p><p>B</p></div>";
      const compactBlocks = JSON.stringify(elementNode(probe.firstElementChild));
      probe.innerHTML = "<div>\n  <p>A</p>\n  <p>B</p>\n</div>";
      const indentedBlocks = JSON.stringify(elementNode(probe.firstElementChild));
      probe.remove();
      if (spacedInline === joinedInline) {
        throw new Error("DOM normalizer erased visible inline whitespace");
      }
      if (compactBlocks !== indentedBlocks) {
        throw new Error("DOM normalizer retained formatting-only block indentation");
      }

      const forbidden = [];
      for (const element of document.querySelectorAll("*")) {
        if (element.tagName === "SCRIPT") {
          forbidden.push(element.outerHTML);
          continue;
        }
        const eventAttribute = [...element.attributes].find(({ name }) =>
          /^on/iu.test(name),
        );
        if (eventAttribute) {
          forbidden.push(`${element.tagName.toLowerCase()}[${eventAttribute.name}]`);
        }
      }
      const doctype = document.doctype
        ? {
            name: document.doctype.name,
            publicId: document.doctype.publicId,
            systemId: document.doctype.systemId,
          }
        : null;
      return {
        document: {
          compatMode: document.compatMode,
          doctype,
          tree: elementNode(document.documentElement),
        },
        forbidden,
      };
    });
    await page.close();

    if (result.forbidden.length > 0) {
      throw new Error(
        `${id} is not a static-SSR-only fixture: ${result.forbidden[0]}`,
      );
    }
    canonical.set(id, JSON.stringify(result.document));
  }
  await context.close();
} finally {
  await browser.close();
}

const expected = canonical.get("proa_fresh_owned");
const mismatches = [];
for (const { id } of frameworks.slice(1)) {
  const actual = canonical.get(id);
  if (actual !== expected) {
    mismatches.push({
      framework: id,
      difference: firstDifference(expected, actual),
    });
  }
}
const proaRawExpected = raw.get("proa_fresh_owned");
const proaControlMismatches = [
  "proa_reused_chained",
  "proa_raw_baseline",
].flatMap((id) => {
  const actual = raw.get(id);
  return actual === proaRawExpected
    ? []
    : [{ framework: id, difference: firstDifference(proaRawExpected, actual) }];
});

const cargoMetadata = JSON.parse(
  command("cargo", ["metadata", "--format-version", "1", "--locked"]),
);
const rustDependencyNames = [
  "askama",
  "criterion",
  "dioxus",
  "dioxus-ssr",
  "leptos",
  "sailfish",
  "yew",
];
const resolvedRustDependencies = Object.fromEntries(
  rustDependencyNames.map((name) => [
    name,
    [
      ...new Set(
        cargoMetadata.packages
          .filter((pkg) => pkg.name === name)
          .map((pkg) => pkg.version),
      ),
    ].sort(),
  ]),
);
const playwrightBrowsersPath = join(
  dirname(playwrightCorePackagePath),
  "browsers.json",
);
const browserPins = JSON.parse(readFileSync(playwrightBrowsersPath, "utf8")).browsers
  .filter(({ name }) => name === "chromium" || name === "chromium-headless-shell")
  .map(({ name, revision, browserVersion: pinnedBrowserVersion }) => ({
    name,
    revision,
    browserVersion: pinnedBrowserVersion,
  }));
const gitStatus = command("git", ["status", "--short", "--untracked-files=normal"]);
const fixtureStatus = command("git", [
  "status",
  "--short",
  "--untracked-files=all",
  "--",
  ...fixtureFiles,
])
  .split("\n")
  .filter(Boolean);
const sourceAfterRun = sourceFingerprint();
const sourceChangedDuringRun =
  JSON.stringify(sourceBeforeBuild) !== JSON.stringify(sourceAfterRun);
const cpu = cpus()[0];
const generatedAt = new Date().toISOString();
const archiveFileName =
  `standard_page_parity-${generatedAt.replace(/[:.]/gu, "-")}.json`;
const report = {
  schema_version: 1,
  status:
    mismatches.length === 0 &&
    proaControlMismatches.length === 0 &&
    !sourceChangedDuringRun
      ? "pass"
      : "fail",
  fixture: "standard-page-v1",
  started_at: startedAt,
  generated_at: generatedAt,
  artifacts: {
    latest: "rendering/results/standard_page_parity.json",
    archive: `rendering/results/${archiveFileName}`,
  },
  build: {
    command: "cargo",
    args: cargoBuildArgs,
    executable_sha256: sha256File(executable),
  },
  scope: {
    included: [
      "static HTML SSR",
      "deterministic trusted fixture values",
      "component/template control flow",
      "HTML serialization",
    ],
    excluded: [
      "untrusted-input escaping",
      "hydration",
      "client events",
      "routing",
      "data loading",
      "HTTP lifecycle",
    ],
    cross_framework_baseline: "proa_fresh_owned",
    cross_framework_work:
      "Fresh-owned rows include component/template execution, serialization, and owned output.",
    allocation_policy:
      "Only fresh-owned rows are cross-framework comparable; proa_reused_chained is allocation-policy evidence, while proa_raw_baseline is an internal manual-write upper bound.",
    proa_renderer_control:
      "proa_fresh_owned and proa_reused_chained execute the same SafeTextBenchmarkPage; their intended difference is output ownership and buffer reuse.",
    output_equivalence:
      "browser-parsed DOM and rendered text; doctype/compat mode retained, attributes sorted, only collapsible ASCII whitespace normalized, comments omitted",
    proa_control_equivalence:
      "proa_fresh_owned, proa_reused_chained, and proa_raw_baseline must also be byte-identical",
  },
  source: {
    git_head: command("git", ["rev-parse", "HEAD"]),
    git_dirty: gitStatus.length > 0,
    changed_during_run: sourceChangedDuringRun,
    before_build: sourceBeforeBuild,
    after_run: sourceAfterRun,
    fixture_source_sha256: sourceAfterRun.fixture_source_sha256,
    fixture_files: Object.fromEntries(
      fixtureFiles.map((path) => [path, sha256File(join(workspaceDir, path))]),
    ),
    fixture_git_status: fixtureStatus,
    proa_dependencies: sourceAfterRun.proa_dependencies,
    cargo_lock_sha256: sourceAfterRun.cargo_lock_sha256,
    package_json_sha256: sourceAfterRun.package_json_sha256,
  },
  environment: {
    platform: `${process.platform}-${process.arch}`,
    os_release: osRelease(),
    cpu: cpu?.model ?? "unknown",
    logical_cpus: cpus().length,
    total_memory_bytes: totalmem(),
    node: process.version,
    playwright_declared: declaredPlaywright,
    playwright: playwrightPackage.version,
    playwright_core_declared: declaredPlaywrightCore,
    playwright_core: playwrightCorePackage.version,
    playwright_browser_pins: browserPins,
    chromium: browserVersion,
    rustc: command("rustc", ["--version"]),
    rustc_verbose: command("rustc", ["-vV"]),
    cargo: command("cargo", ["--version"]),
    cargo_build_target: process.env.CARGO_BUILD_TARGET ?? null,
    rustflags: process.env.RUSTFLAGS ?? null,
    cargo_encoded_rustflags: process.env.CARGO_ENCODED_RUSTFLAGS ?? null,
    codegen_environment: selectedCodegenEnvironment(),
    resolved_rust_dependencies: resolvedRustDependencies,
  },
  frameworks: Object.fromEntries(
    frameworks.map(
      ({
        id,
        implementation,
        allocationPolicy,
        role,
        criterionRow,
        adapterNote = null,
        crossFrameworkComparable,
      }) => {
        const html = raw.get(id);
        const dom = canonical.get(id);
        return [
          id,
          {
            implementation,
            role,
            criterion_row: criterionRow,
            adapter_note: adapterNote,
            allocation_policy: allocationPolicy,
            cross_framework_comparable: crossFrameworkComparable,
            renderer_work_included: id !== "proa_raw_baseline",
            raw_bytes: Buffer.byteLength(html),
            raw_sha256: sha256(html),
            normalized_dom_sha256: sha256(dom),
          },
        ];
      },
    ),
  ),
  mismatches,
  proa_control_mismatches: proaControlMismatches,
};

writeJsonAtomic(join(resultDir, archiveFileName), report);
writeJsonAtomic(latestReportPath, report);
reportCompleted = true;

if (
  mismatches.length > 0 ||
  proaControlMismatches.length > 0 ||
  sourceChangedDuringRun
) {
  for (const mismatch of mismatches) {
    process.stderr.write(
      `${mismatch.framework} normalized DOM differs at ${mismatch.difference.index}\n` +
        `expected: ${mismatch.difference.expected}\n` +
        `actual:   ${mismatch.difference.actual}\n`,
    );
  }
  for (const mismatch of proaControlMismatches) {
    process.stderr.write(
      `${mismatch.framework} raw Proa control differs at ${mismatch.difference.index}\n` +
        `expected: ${mismatch.difference.expected}\n` +
        `actual:   ${mismatch.difference.actual}\n`,
    );
  }
  if (sourceChangedDuringRun) {
    process.stderr.write(
      "benchmark fixture or local renderer source changed while the gate was running\n",
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `standard-page normalized DOM parity passed (${frameworks
      .map(({ id }) => id)
      .join(", ")})\n`,
  );
}
