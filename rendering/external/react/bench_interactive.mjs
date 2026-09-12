/**
 * React 19 SSR Benchmark — INTERACTIVE variant.
 *
 * Same 4 x 8 x 5 page structure as bench.mjs, but every card is a stateful,
 * context-consuming component (useState + useMemo + 3x useContext) wrapped in
 * three nested providers. Rendered output stays structurally equivalent, so
 * the delta vs bench.mjs isolates React's *server-side reactivity tax*:
 * hook initialization, context propagation, and memo computation that a
 * static template never pays.
 *
 * Run: NODE_ENV=production node bench_interactive.mjs
 */

import { createContext, createElement as h, useContext, useMemo, useState } from "react";
import { renderToString } from "react-dom/server";

if (process.env.NODE_ENV !== "production") {
  throw new Error("Requires NODE_ENV=production. Run: NODE_ENV=production node bench_interactive.mjs");
}

const NUM_SECTIONS = 4;
const CARDS_PER_SECTION = 8;
const ITEMS_PER_CARD = 5;

const SECTION_TITLES = ["Performance Metrics", "Rendering Speed", "Memory Efficiency", "Framework Comparison"];
const CARD_TITLES = ["Latency Analysis", "Throughput Metrics", "Memory Usage", "CPU Utilization"];
const FEATURES = [
  "Sub-millisecond response times",
  "Zero-copy rendering pipeline",
  "SIMD-accelerated escaping",
  "Pre-allocated buffers",
  "Minimal heap allocations",
];

// Three nested providers, the kind a real app stacks (theme, i18n, auth).
const ThemeContext = createContext({ mode: "light", accent: "brand" });
const LocaleContext = createContext({ locale: "en-US", dir: "ltr" });
const AuthContext = createContext({ signedIn: true, tier: "pro" });

function FeatureList() {
  return h(
    "ul",
    { className: "feature-list" },
    Array.from({ length: ITEMS_PER_CARD }, (_, i) =>
      h("li", { key: i, className: "feature-item" }, FEATURES[i] ?? FEATURES[4])
    )
  );
}

// Stateful, interactive card: local state + reads all three contexts + a memo.
function InteractiveCard({ cardIdx }) {
  const [open, setOpen] = useState(cardIdx % 3 === 0);
  const theme = useContext(ThemeContext);
  const locale = useContext(LocaleContext);
  const auth = useContext(AuthContext);

  const cardClass = useMemo(
    () =>
      [
        "card",
        cardIdx % 2 === 0 ? "even" : "odd",
        `theme-${theme.mode}`,
        `dir-${locale.dir}`,
        auth.signedIn ? "auth" : "guest",
        open ? "open" : "closed",
      ].join(" "),
    [cardIdx, theme.mode, locale.dir, auth.signedIn, open]
  );

  const title = CARD_TITLES[cardIdx % 4];
  // Reference setOpen so the handler is "live" (matches a real interactive component).
  const onToggle = () => setOpen((v) => !v);

  return h(
    "article",
    { className: cardClass, "data-card-id": cardIdx % 2 === 0 ? "even" : "odd", "data-tier": auth.tier },
    h("div", { className: "card-header" },
      h("img", { src: "/images/benchmark.png", alt: "Benchmark chart", className: "card-image" })
    ),
    h("div", { className: "card-body" },
      h("h3", { className: "card-title" }, title),
      h("p", { className: "card-description" },
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
      ),
      h(FeatureList, null),
      h("button", { className: "btn-primary", type: "button", "aria-expanded": open, onClick: onToggle }, "View Details")
    )
  );
}

function Section({ sectionIdx }) {
  const title = SECTION_TITLES[sectionIdx] ?? SECTION_TITLES[3];
  return h(
    "section",
    { className: "card-section", "data-section": sectionIdx % 2 === 0 ? "even" : "odd" },
    h("h2", { className: "section-title" }, title),
    h("div", { className: "card-grid" },
      Array.from({ length: CARDS_PER_SECTION }, (_, i) => h(InteractiveCard, { key: i, cardIdx: i }))
    )
  );
}

function InteractivePage() {
  const tree = h(
    "html", { lang: "en" },
    h("head", null,
      h("title", null, "SSR Benchmark Page"),
      h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" })
    ),
    h("body", null,
      h("header", { className: "hero-section" },
        h("h1", { className: "title" }, "SSR Framework Benchmark"),
        h("p", { className: "subtitle" }, "Comparing SSR frameworks")
      ),
      h("main", { className: "main-content" },
        Array.from({ length: NUM_SECTIONS }, (_, i) => h(Section, { key: i, sectionIdx: i }))
      ),
      h("footer", { className: "footer" }, h("p", null, "Rendered with React 19"))
    )
  );
  // Wrap the whole tree in the three providers.
  return h(ThemeContext.Provider, { value: { mode: "light", accent: "brand" } },
    h(LocaleContext.Provider, { value: { locale: "en-US", dir: "ltr" } },
      h(AuthContext.Provider, { value: { signedIn: true, tier: "pro" } }, tree)
    )
  );
}

const html = renderToString(h(InteractivePage, null));
console.log(`Output size: ${Buffer.byteLength(html)} bytes`);

const WARMUP = 1000;
const ITERATIONS = 10_000;
for (let i = 0; i < WARMUP; i++) renderToString(h(InteractivePage, null));
const start = process.hrtime.bigint();
for (let i = 0; i < ITERATIONS; i++) renderToString(h(InteractivePage, null));
const elapsed = Number(process.hrtime.bigint() - start);
console.log(`  Average: ${(elapsed / ITERATIONS / 1000).toFixed(2)} µs/render`);
