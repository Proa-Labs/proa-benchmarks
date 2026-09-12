#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Proa Engineering-Laboratory Runner
#
# Runs specialized and historical experiments. It never writes the canonical
# public result. Use ./rendering/run-all for the public scoreboard.
#
# Usage:
#   ./run_all.sh              # Run all available benchmarks
#   ./run_all.sh rust         # Only Rust criterion benchmarks
#   ./run_all.sh external     # Only external (non-Rust) benchmarks
#   ./run_all.sh react        # Only React/Node benchmark
#   ./run_all.sh bun          # Only Bun + React benchmark
#   ./run_all.sh deno         # Only Deno + React benchmark
#   ./run_all.sh jinja        # Only Jinja2 benchmark
#   ./run_all.sh erb          # Only ERB benchmark
#   ./run_all.sh php          # Only PHP benchmark
#   ./run_all.sh hack         # Only Hack/HHVM benchmark
#   ./run_all.sh marko        # Only Marko benchmark
#   ./run_all.sh rocker       # Only Rocker benchmark
#   ./run_all.sh jte          # Only jte benchmark
#   ./run_all.sh topcoat      # Proa vs Topcoat (requires Rust 1.95+)
#   ./run_all.sh parity       # Normalized-DOM gate for Rust standard page
#   ./run_all.sh data-table   # Heavy data-table benchmark: Proa vs Marko
#   ./run_all.sh integers     # Byte-parity integer-to-ASCII scaling + allocations
#   ./run_all.sh representative-suite # Alias for the 15-renderer canonical suite
#   ./run_all.sh representative-suite-smoke # Canonical integrity check
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
EXTERNAL_DIR="$SCRIPT_DIR/external"

mkdir -p "$RESULTS_DIR"

TARGET="${1:-all}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[bench]${NC} $*"; }
warn()  { echo -e "${YELLOW}[bench]${NC} $*"; }
error() { echo -e "${RED}[bench]${NC} $*"; }

run_standard_page_parity() {
    if ! command -v node &>/dev/null; then
        error "Node.js is required for the normalized-DOM parity gate"
        return 1
    fi
    info "Checking normalized-DOM parity for the Rust standard page..."
    cd "$SCRIPT_DIR"
    if node standard_page_parity.mjs; then
        info "Parity report: $RESULTS_DIR/standard_page_parity.json"
    else
        error "Parity gate failed or stopped early; inspect $RESULTS_DIR/standard_page_parity.json"
        return 1
    fi
}

run_representative_suite_setup() {
    cd "$SCRIPT_DIR/.."
    ./rendering/run-all --setup-only
}

run_representative_suite() {
    cd "$SCRIPT_DIR/.."
    ./rendering/run-all
}

run_representative_suite_smoke() {
    cd "$SCRIPT_DIR/.."
    ./rendering/run-all --smoke
}

run_representative_suite_parity() {
    cd "$SCRIPT_DIR/.."
    ./rendering/run-all --parity-only
}

# --- Rust criterion benchmarks ---
run_rust() {
    run_standard_page_parity
    info "Running Rust criterion benchmarks..."
    cd "$SCRIPT_DIR/.."
    cargo bench --locked -p proa_bench --bench ssr_comparison 2>&1 | tee "$RESULTS_DIR/rust_criterion.log"
    info "Rust benchmarks complete. See criterion reports in target/criterion/"
}

# --- Topcoat (Tokio team's experimental Rust SSR framework) ---
run_topcoat() {
    info "Running Proa vs Topcoat benchmarks..."
    info "Topcoat is opt-in because its early-stage API is exact-pinned."
    cd "$SCRIPT_DIR/.."
    cargo bench --locked -p proa_bench --features topcoat --bench topcoat_comparison 2>&1 \
        | tee "$RESULTS_DIR/topcoat_criterion.log"
    cargo bench --locked -p proa_bench --features topcoat --bench ssr_comparison -- \
        'ssr_frameworks/(proa|topcoat)' 2>&1 \
        | tee "$RESULTS_DIR/topcoat_standard_page.log"
    info "Topcoat benchmarks complete. See criterion reports in target/criterion/"
}

# --- React 19 (Node.js) ---
run_react() {
    if ! command -v node &>/dev/null; then
        warn "Node.js not found, skipping React benchmark"
        return
    fi
    info "Running React 19 (Node.js) benchmark..."
    cd "$EXTERNAL_DIR/react"
    if [ ! -d node_modules ]; then
        npm install --silent 2>/dev/null
    fi
    # NODE_ENV=production is REQUIRED: dev-mode React SSR is 3-8x slower and
    # not a fair comparison. The bench also hard-fails without it.
    NODE_ENV=production node bench.mjs
    info "React (Node.js) benchmark complete"
}

# --- React 19 (Bun) ---
run_bun() {
    local bun_bin=""
    if command -v bun &>/dev/null; then
        bun_bin="bun"
    elif [ -x "$HOME/.bun/bin/bun" ]; then
        bun_bin="$HOME/.bun/bin/bun"
    else
        warn "Bun not found, skipping Bun + React benchmark"
        return
    fi
    info "Running React 19 (Bun) benchmark..."
    cd "$EXTERNAL_DIR/bun"
    if [ ! -d node_modules ]; then
        "$bun_bin" install --silent 2>/dev/null
    fi
    # Production mode required (see run_react).
    NODE_ENV=production "$bun_bin" run bench.mjs
    info "Bun + React benchmark complete"
}

# --- React 19 (Deno) ---
run_deno() {
    if ! command -v deno &>/dev/null; then
        warn "Deno not found, skipping Deno + React benchmark"
        return
    fi
    info "Running React 19 (Deno) benchmark..."
    cd "$EXTERNAL_DIR/deno"
    deno install --allow-scripts 2>/dev/null || true
    # Production mode required (see run_react); --allow-env exposes NODE_ENV.
    NODE_ENV=production deno run --allow-env --allow-write --allow-read bench.mjs
    info "Deno + React benchmark complete"
}

# --- Jinja2 ---
run_jinja() {
    if ! command -v python3 &>/dev/null; then
        warn "Python3 not found, skipping Jinja2 benchmark"
        return
    fi
    info "Running Jinja2 benchmark..."
    cd "$EXTERNAL_DIR/jinja"
    if [ ! -d .venv ]; then
        info "Creating venv and installing Jinja2..."
        python3 -m venv .venv
        .venv/bin/pip install -q -r requirements.txt
    fi
    .venv/bin/python3 bench.py
    info "Jinja2 benchmark complete"
}

# --- ERB (Ruby) ---
run_erb() {
    if ! command -v ruby &>/dev/null; then
        warn "Ruby not found, skipping ERB benchmark"
        return
    fi
    info "Running ERB (Erubi) benchmark..."
    cd "$EXTERNAL_DIR/rails"
    export GEM_HOME="$EXTERNAL_DIR/rails/.gems"
    export PATH="$GEM_HOME/bin:$PATH"
    if ! ruby -e "require 'erubi'" 2>/dev/null; then
        info "Installing gems locally..."
        gem install erubi benchmark-ips --no-document
    fi
    ruby bench.rb
    info "ERB benchmark complete"
}

# --- Handlebars (Node.js) ---
run_handlebars() {
    if ! command -v node &>/dev/null; then
        warn "Node.js not found, skipping Handlebars benchmark"
        return
    fi
    info "Running Handlebars benchmark..."
    cd "$EXTERNAL_DIR/handlebars"
    if [ ! -d node_modules ]; then
        npm install --silent 2>/dev/null
    fi
    node bench.mjs
    info "Handlebars benchmark complete"
}

# --- Marko (Node.js) ---
run_marko() {
    if ! command -v node &>/dev/null; then
        warn "Node.js not found, skipping Marko benchmark"
        return
    fi
    info "Running Marko benchmark..."
    cd "$EXTERNAL_DIR/marko"
    if [ ! -d node_modules ]; then
        npm install --silent 2>/dev/null
    fi
    node bench.mjs
    info "Marko benchmark complete"
}

# --- Rocker (Java, optimized compiled template output) ---
run_rocker() {
    if ! command -v gradle &>/dev/null; then
        warn "Gradle not found, skipping Rocker benchmark"
        return
    fi
    info "Running Rocker benchmark..."
    cd "$EXTERNAL_DIR/rocker"
    gradle --quiet run
    info "Rocker benchmark complete"
}

# --- jte (Java, binary static content + Utf8ByteOutput) ---
run_jte() {
    if ! command -v gradle &>/dev/null; then
        warn "Gradle not found, skipping jte benchmark"
        return
    fi
    info "Running jte benchmark..."
    cd "$EXTERNAL_DIR/jte"
    gradle --quiet run
    info "jte benchmark complete"
}

# --- Heavy data-table comparison: Proa vs Marko ---
run_data_table() {
    local rows="${DATA_TABLE_ROWS:-1000}"
    local iters="${DATA_TABLE_ITERS:-500}"
    local warmup="${DATA_TABLE_WARMUP:-50}"

    info "Running heavy data-table benchmark (rows=$rows, iters=$iters)"

    info "  -> Proa (Rust)"
    cd "$SCRIPT_DIR/.."
    cargo run --release -p proa_bench --bin data_table_bench -- \
        --rows "$rows" --iters "$iters" --warmup "$warmup"

    if command -v node &>/dev/null; then
        info "  -> Marko (JS)"
        cd "$EXTERNAL_DIR/marko"
        if [ ! -d node_modules ]; then
            npm install --silent 2>/dev/null
        fi
        node bench_table.mjs --rows "$rows" --iters "$iters" --warmup "$warmup"
    else
        warn "Node.js not found, skipping Marko data-table run"
    fi

    info "Data-table benchmark complete. Results in $RESULTS_DIR/data_table_*.json"
}

# --- Integer-to-ASCII byte-parity scaling and allocation audit ---
run_integers() {
    info "Checking Proa/Askama/Sailfish byte parity for integer serialization..."
    cd "$SCRIPT_DIR/.."
    cargo test --locked -p proa_bench integer_serialization -- --nocapture

    info "Running fresh-owned and reused-contiguous latency scaling matrix..."
    cargo bench --locked -p proa_bench --bench integer_serialization 2>&1 \
        | tee "$RESULTS_DIR/integer_serialization_criterion.log"

    info "Running allocation audits separately from latency measurement..."
    for rows in 1 10 100 1000 10000; do
        cargo run --locked --release -p proa_bench --bin integer_allocation_audit -- \
            --rows "$rows" --trials 25 \
            --out "$RESULTS_DIR/integer_allocations_${rows}.json"
    done
    info "Integer serialization evidence complete."
}

# --- eBay-style SRP comparison: Proa vs Marko ---
run_ebay_srp() {
    local listings="${EBAY_SRP_LISTINGS:-60}"
    local iters="${EBAY_SRP_ITERS:-500}"
    local warmup="${EBAY_SRP_WARMUP:-50}"

    info "Running eBay SRP benchmark (listings=$listings, iters=$iters)"

    info "  -> Proa (Rust)"
    cd "$SCRIPT_DIR/.."
    cargo run --release -p proa_bench --bin ebay_srp_bench -- \
        --listings "$listings" --iters "$iters" --warmup "$warmup"

    if command -v node &>/dev/null; then
        info "  -> Marko (JS)"
        cd "$EXTERNAL_DIR/marko"
        if [ ! -d node_modules ]; then
            npm install --silent 2>/dev/null
        fi
        node bench_srp.mjs --listings "$listings" --iters "$iters" --warmup "$warmup"
    else
        warn "Node.js not found, skipping Marko SRP run"
    fi

    info "eBay SRP benchmark complete. Results in $RESULTS_DIR/ebay_srp_*.json"
}

# --- Real eBay-mirror SRP (pixel-perfect markup): Proa vs Marko ---
run_ebay_srp_real() {
    local listings="${EBAY_SRP_LISTINGS:-60}"
    local iters="${EBAY_SRP_ITERS:-500}"
    local warmup="${EBAY_SRP_WARMUP:-50}"

    info "Running real-eBay-mirror SRP benchmark (listings=$listings, iters=$iters)"

    info "  -> Proa (Rust)"
    cd "$SCRIPT_DIR/.."
    cargo run --release -p proa_bench --bin ebay_srp_real_bench -- \
        --listings "$listings" --iters "$iters" --warmup "$warmup"

    if command -v node &>/dev/null; then
        info "  -> Marko (JS)"
        cd "$EXTERNAL_DIR/marko"
        if [ ! -d node_modules ]; then npm install --silent 2>/dev/null; fi
        node bench_srp_real.mjs --listings "$listings" --iters "$iters" --warmup "$warmup"
    else
        warn "Node.js not found, skipping Marko run"
    fi
}

# --- Go html/template ---
run_go() {
    if ! command -v go &>/dev/null; then
        warn "Go not found, skipping Go benchmark"
        return
    fi
    info "Running Go html/template benchmark..."
    cd "$EXTERNAL_DIR/go"
    go run bench.go
    info "Go benchmark complete"
}

# --- PHP ---
run_php() {
    if ! command -v php &>/dev/null; then
        warn "PHP not found, skipping PHP benchmark"
        return
    fi
    info "Running PHP benchmark..."
    cd "$EXTERNAL_DIR/hack"
    php bench.php
    info "PHP benchmark complete"
}

# --- Hack/HHVM ---
run_hack() {
    if ! command -v hhvm &>/dev/null; then
        warn "HHVM not found, skipping Hack benchmark"
        warn "  Install: https://docs.hhvm.com/hhvm/installation/introduction"
        warn "  Falling back to PHP if available..."
        run_php
        return
    fi
    info "Running Hack/HHVM benchmark..."
    cd "$EXTERNAL_DIR/hack"
    hhvm bench.hack
    info "Hack benchmark complete"
}

# --- Aggregate results ---
aggregate() {
    info "Aggregating engineering-only results..."
    local combined="$RESULTS_DIR/engineering-latest.json"

    # Use the Jinja venv's Python if system python3 is externally-managed
    local py="python3"
    if [ -x "$EXTERNAL_DIR/jinja/.venv/bin/python3" ]; then
        py="$EXTERNAL_DIR/jinja/.venv/bin/python3"
    fi

    # Merge all individual JSON results
    "$py" -c "
import json, glob, os

results = []
for f in sorted(glob.glob(os.path.join('$RESULTS_DIR', '*.json'))):
    if os.path.basename(f) in {'latest.json', 'engineering-latest.json'} or os.path.basename(f).startswith('canonical-'):
        continue
    with open(f) as fh:
        results.append(json.load(fh))

# Sort by latency
results.sort(key=lambda r: r.get('latency_us', float('inf')))

with open('$combined', 'w') as fh:
    json.dump({
        'benchmarks': results,
        'generated': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    }, fh, indent=2)

print()
print('=== Combined Results ===')
print(f'{\"Framework\":<25} {\"Language\":<12} {\"Latency\":>12} {\"Output\":>10}')
print('-' * 61)
for r in results:
    lat = r['latency_us']
    unit = 'ms' if lat >= 1000 else 'µs'
    val = lat / 1000 if lat >= 1000 else lat
    print(f'{r[\"framework\"]:<25} {r[\"language\"]:<12} {val:>9.2f} {unit}  {r[\"output_bytes\"]:>7} B')
print()
" 2>/dev/null || warn "Python3 needed for aggregation, skipping"

    info "Engineering results written to $combined (never used by the public report)"
}

# --- Dispatch ---
case "$TARGET" in
    all)
        run_react
        run_bun
        run_deno
        run_handlebars
        run_marko
        run_rocker
        run_jte
        run_jinja
        run_erb
        run_go
        run_php
        echo
        aggregate
        echo
        info "To also run Rust criterion benchmarks: ./run_all.sh rust"
        ;;
    rust)
        run_rust
        ;;
    external)
        run_react
        run_bun
        run_deno
        run_handlebars
        run_marko
        run_rocker
        run_jte
        run_jinja
        run_erb
        run_go
        run_php
        aggregate
        ;;
    react)      run_react ;;
    bun)        run_bun ;;
    deno)       run_deno ;;
    handlebars) run_handlebars ;;
    marko)      run_marko ;;
    rocker)     run_rocker ;;
    jte)        run_jte ;;
    topcoat)    run_topcoat ;;
    parity)     run_standard_page_parity ;;
    jinja)      run_jinja ;;
    erb)        run_erb ;;
    go)         run_go ;;
    php)        run_php ;;
    hack)       run_hack ;;
    data-table) run_data_table ;;
    integers) run_integers ;;
    ebay-srp)   run_ebay_srp ;;
    ebay-srp-real) run_ebay_srp_real ;;
    representative-suite-setup) run_representative_suite_setup ;;
    representative-suite) run_representative_suite ;;
    representative-suite-smoke) run_representative_suite_smoke ;;
    representative-suite-parity) run_representative_suite_parity ;;
    *)
        error "Unknown target: $TARGET"
        echo "Usage: $0 [all|rust|external|react|bun|deno|handlebars|marko|rocker|jte|topcoat|parity|jinja|erb|go|php|hack|data-table|integers|ebay-srp|ebay-srp-real|representative-suite-setup|representative-suite|representative-suite-smoke|representative-suite-parity]"
        exit 1
        ;;
esac
