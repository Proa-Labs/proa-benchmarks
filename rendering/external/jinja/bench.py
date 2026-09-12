#!/usr/bin/env python3
"""
Jinja2 SSR Benchmark

Renders the same page structure as the Rust benchmarks:
4 sections × 8 cards × 5 list items ≈ 25KB HTML

Jinja2 is the standard Python template engine (Flask, FastAPI, etc.).
"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, BaseLoader
from markupsafe import escape

NUM_SECTIONS = 4
CARDS_PER_SECTION = 8
ITEMS_PER_CARD = 5

TEMPLATE_SOURCE = """\
<html lang="en">
<head>
    <title>SSR Benchmark Page</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
    <header class="hero-section">
        <h1 class="title">SSR Framework Benchmark</h1>
        <p class="subtitle">Comparing SSR frameworks</p>
    </header>
    <main class="main-content">
        {% for section_idx in range(num_sections) %}
        <section class="card-section" data-section="{{ 'even' if section_idx % 2 == 0 else 'odd' }}">
            <h2 class="section-title">{{ section_titles[section_idx] if section_idx < section_titles|length else "Framework Comparison" }}</h2>
            <div class="card-grid">
                {% for card_idx in range(cards_per_section) %}
                <article class="card" data-card-id="{{ 'even' if card_idx % 2 == 0 else 'odd' }}">
                    <div class="card-header">
                        <img src="/images/benchmark.png" alt="Benchmark chart" class="card-image">
                    </div>
                    <div class="card-body">
                        <h3 class="card-title">{{ card_titles[card_idx % 4] }}</h3>
                        <p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                        <ul class="feature-list">
                            {% for item_idx in range(items_per_card) %}
                            <li class="feature-item">{{ features[item_idx] if item_idx < features|length else "Minimal heap allocations" }}</li>
                            {% endfor %}
                        </ul>
                        <button class="btn-primary" type="button">View Details</button>
                    </div>
                </article>
                {% endfor %}
            </div>
        </section>
        {% endfor %}
    </main>
    <footer class="footer">
        <p>Rendered with Jinja2</p>
    </footer>
</body>
</html>
"""

CONTEXT = {
    "num_sections": NUM_SECTIONS,
    "cards_per_section": CARDS_PER_SECTION,
    "items_per_card": ITEMS_PER_CARD,
    "section_titles": [
        "Performance Metrics",
        "Rendering Speed",
        "Memory Efficiency",
        "Framework Comparison",
    ],
    "card_titles": [
        "Latency Analysis",
        "Throughput Metrics",
        "Memory Usage",
        "CPU Utilization",
    ],
    "features": [
        "Sub-millisecond response times",
        "Zero-copy rendering pipeline",
        "SIMD-accelerated escaping",
        "Pre-allocated buffers",
        "Minimal heap allocations",
    ],
}


def main():
    env = Environment(loader=BaseLoader(), autoescape=True)
    template = env.from_string(TEMPLATE_SOURCE)

    # Warmup and verify
    html = template.render(**CONTEXT)
    print(f"Output size: {len(html.encode('utf-8'))} bytes")
    print(f"First 200 chars: {html[:200]}")
    print()

    # --- Precise latency measurement ---
    iterations = 10_000

    # Warmup
    for _ in range(100):
        template.render(**CONTEXT)

    start = time.perf_counter_ns()
    for _ in range(iterations):
        template.render(**CONTEXT)
    elapsed_ns = time.perf_counter_ns() - start
    avg_us = elapsed_ns / iterations / 1000.0

    print("=== Jinja2 Latency ===")
    print(f"  Iterations: {iterations}")
    print(f"  Total: {elapsed_ns / 1_000_000:.2f} ms")
    print(f"  Average: {avg_us:.2f} µs/render")
    print()

    # --- Throughput estimate ---
    renders_per_sec = 1_000_000 / avg_us
    print(f"  Throughput: ~{renders_per_sec:.0f} renders/sec")
    print()

    # --- JSON output ---
    result = {
        "framework": "Jinja2",
        "language": "Python",
        "latency_us": round(avg_us, 2),
        "output_bytes": len(html.encode("utf-8")),
        "iterations": iterations,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    results_path = Path(__file__).parent.parent.parent / "results" / "jinja2.json"
    results_path.write_text(json.dumps(result, indent=2))
    print(f"Results written to {results_path}")


if __name__ == "__main__":
    main()
