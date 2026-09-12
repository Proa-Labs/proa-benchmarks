#!/usr/bin/env python3
"""Build and measure an eBay patch against the pinned figure-05 libraries.

First build showcase/build_buffer_bench.mjs. No dependency checkout is modified.
Both copies of srp.rs are compiled with the same Rust flags and dependencies.
"""
import hashlib
import json
import os
from pathlib import Path
import platform
import random
import statistics
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "target/render-optimizations/ebay"
RESULT = ROOT / "showcase/results/ebay-owned-string.json"
RAW = RESULT.with_name("ebay-owned-string-raw.json")
FIXTURE = ROOT / "fixtures/proa-buffer-comparison"
SOURCE = ROOT / "showcase/experiments/ebay_owned_string.rs"
PATCH = ROOT / "showcase/experiments/ebay-owned-string.patch"
SEED = 20260905
CELLS = [("original", "default"), ("original", "full-default"),
         ("candidate", "default"), ("candidate", "full-owned"),
         ("original", "memcpy"), ("candidate", "memcpy")]
INPUTS = [Path(__file__), SOURCE, PATCH, FIXTURE / "Cargo.lock",
          ROOT / "fixtures/airbnb-parity-dump/src/memcpy.rs",
          ROOT / "showcase/results/buffer-comparison.json"]


def run(args, **kwargs):
    return subprocess.check_output([str(arg) for arg in args], cwd=ROOT, text=True, **kwargs)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path):
    return str(path.relative_to(ROOT))


def summary(records):
    # The same bytes and copy loop run in both executables. Pool their ten
    # process medians into one floor for all four render comparisons.
    copy = statistics.median(c["p50_us"] for c in records if c["mode"] == "memcpy")
    rows = []
    for variant, mode in CELLS:
        values = [c["p50_us"] for c in records if (c["variant"], c["mode"]) == (variant, mode)]
        median = statistics.median(values)
        rows.append(dict(variant=variant, mode=mode, p50_us=median,
                         min_us=min(values), max_us=max(values), over_copy=median / copy))
    return {"copy_p50_us": copy, "cells": rows}


def validate(capture):
    assert capture["schema_version"] == 1 and capture["status"] == "pass"
    assert capture["configuration"] == dict(repeats=5, seed=SEED, allocation_included=True)
    records = capture["records"]
    assert len(records) == len(CELLS) * 5
    baseline = json.loads((ROOT / "showcase/results/buffer-comparison.json").read_text())
    reference = next(c for c in baseline["records"] if c["page"] == "ebay-cards")
    for variant, mode in CELLS:
        cells = [c for c in records if (c["variant"], c["mode"]) == (variant, mode)]
        assert sorted(c["repeat"] for c in cells) == [1, 2, 3, 4, 5]
        for cell in cells:
            assert cell["parity_pass"] and cell["p50_us"] > 0
            assert cell["exact_capacity_pass"] == (True if mode.startswith("full-") else None)
            assert cell["output_sha256"] == reference["output_sha256"]
            assert cell["output_bytes"] == reference["output_bytes"]
            assert (cell["warmup"], cell["iterations"]) == ((200, 2000) if mode == "memcpy" else (1000, 10000))
            copies = (16 * 1024 * 1024 + cell["output_bytes"] - 1) // cell["output_bytes"]
            assert cell["operations_per_sample"] == (copies if mode == "memcpy" else 1)
    assert capture["summary"] == summary(records)
    assert [i["path"] for i in capture["provenance"]["inputs"]] == [relative(p) for p in INPUTS]
    for item in capture["provenance"]["inputs"]:
        assert digest(ROOT / item["path"]) == item["sha256"], item["path"]
    if RAW.exists():
        assert digest(RAW) == capture["raw_artifact"]["sha256"]
        raw_records = json.loads(RAW.read_text())
        for raw, cell in zip(raw_records, records, strict=True):
            values = raw.pop("raw_ns")
            assert raw == cell and len(values) == cell["iterations"]
            assert all(isinstance(ns, int) and ns > 0 for ns in values)
            measured = sorted(values)[(len(values) - 1) // 2] / 1000 / cell["operations_per_sample"]
            assert abs(measured - cell["p50_us"]) < 1e-9


def build():
    print(run(["node", "showcase/capture_buffers.mjs", "--check"]), end="")
    metadata = json.loads(run(["cargo", "metadata", "--manifest-path", FIXTURE / "Cargo.toml",
                               "--format-version", "1", "--locked", "--offline"]))
    showcase = next(p for p in metadata["packages"] if p["name"] == "proa_showcase")
    original = Path(showcase["manifest_path"]).parent / "src/ebay/srp.rs"
    final_target = FIXTURE / "target/proa-rsjs/final-target"
    candidates = list(final_target.rglob("lib-proa_showcase.json"))
    assert len(candidates) == 1, "Build the buffer fixture first; expected one final showcase library"
    showcase_fp = candidates[0]
    fingerprints = showcase_fp.parent.parent
    deps = fingerprints.parent / "deps"

    def library(name):
        if name == "proa_showcase":
            folder = showcase_fp.parent
        else:
            dependency = next(d for d in json.loads(showcase_fp.read_text())["deps"] if d[1] == name)
            folder = next(p.parent for p in fingerprints.glob(f"{name}-*/lib-{name}")
                          if int.from_bytes(bytes.fromhex(p.read_text()), "little") == dependency[3])
        suffix = ".dylib" if name == "proa_macros" else ".rlib"
        return deps / f"lib{folder.name}{suffix}"

    libraries = {name: library(name) for name in ("proa_showcase", "proa_core", "proa_macros", "serde_json")}
    libraries["sha2"] = next(deps.glob("libsha2-*.rlib"))
    flags = ["--edition=2024", "-A", "dead_code", "-C", "opt-level=3", "-C", "lto=thin",
             "-C", "codegen-units=1", "-L", f"dependency={deps}", "--cfg", "experiment_srp"]
    for name, path in libraries.items():
        flags += ["--extern", f"{name}={path}"]
    OUT.mkdir(parents=True, exist_ok=True)
    for variant in ("original", "candidate"):
        folder = OUT / variant
        page = folder / "proa_showcase/src/ebay/srp.rs"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(original.read_text())
        if variant == "candidate":
            print(run(["patch", "--batch", "--fuzz=0", "-p1", "-d", folder, "-i", PATCH]), end="")
        module = folder / "module.rs"
        module.write_text(f"#[path = {json.dumps(str(page))}]\nmod srp;\n")
        env = {**os.environ, "EXPERIMENT_SRP_MODULE": str(module)}
        print(f"Compiling {variant}", flush=True)
        run(["rustc", *flags, SOURCE, "-o", OUT / variant / "bench"], env=env)
        if variant == "candidate":
            run(["rustc", *flags, "--test", SOURCE, "-o", folder / "tests"], env=env)
            print(run([folder / "tests"]), end="")
    return dict(proa_revision=showcase["source"].split("#")[1],
                upstream_file_sha256=digest(original), rustc=run(["rustc", "--version"]).strip(),
                rustc_flags=flags, host=dict(platform=platform.platform(), machine=platform.machine()),
                libraries=[dict(path=relative(p), sha256=digest(p)) for p in libraries.values()],
                binaries=[dict(variant=v, path=relative(OUT / v / "bench"), sha256=digest(OUT / v / "bench"))
                          for v in ("original", "candidate")],
                inputs=[dict(path=relative(p), sha256=digest(p)) for p in INPUTS])


def main():
    if sys.argv[1:] == ["--check"]:
        validate(json.loads(RESULT.read_text()))
        print("eBay optimization capture, source hashes, output parity and ratios verified.")
        return
    assert len(sys.argv) == 1, "Usage: ebay_owned_string.py [--check]"
    provenance = build()
    records, raw_records = [], []
    for repeat in range(1, 6):
        cells = CELLS.copy()
        random.Random(SEED + repeat).shuffle(cells)
        for variant, mode in cells:
            warmup, iterations = (200, 2000) if mode == "memcpy" else (1000, 10000)
            raw = json.loads(run([OUT / variant / "bench", mode, warmup, iterations]))
            raw.update(variant=variant, repeat=repeat, sequence=len(records) + 1)
            raw_records.append(raw)
            records.append({k: v for k, v in raw.items() if k != "raw_ns"})
            print(f"{repeat}/5 {variant}/{mode}: {raw['p50_us']:.3f} µs", flush=True)
    RAW.write_text(json.dumps(raw_records) + "\n")
    capture = dict(schema_version=1, status="pass", captured_at=datetime.now(timezone.utc).isoformat(),
                   configuration=dict(repeats=5, seed=SEED, allocation_included=True),
                   provenance=provenance, records=records, summary=summary(records),
                   raw_artifact=dict(path=relative(RAW), sha256=digest(RAW)))
    validate(capture)
    RESULT.write_text(json.dumps(capture, indent=2) + "\n")
    for row in capture["summary"]["cells"]:
        print(f"{row['variant']}/{row['mode']}: {row['p50_us']:.3f} µs · {row['over_copy']:.2f}× memcpy")
    print(f"Saved {relative(RESULT)}")


if __name__ == "__main__":
    main()
