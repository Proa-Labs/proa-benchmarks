#!/usr/bin/env python3
"""Jinja2 adapter for the canonical three-workload SSR suite."""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import BaseLoader, Environment

TABLE_ROW_COUNT = 1_000
PRODUCT_COUNT = int(os.environ.get("PROA_BENCH_PRODUCT_COUNT", "96"))
if PRODUCT_COUNT < 1:
    raise ValueError("PROA_BENCH_PRODUCT_COUNT must be positive")
STAR_PATH = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.363-1.118l-2.8-2.034c-.784-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"

STATUS_CLASSES = {
    "Active": "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-green-100 text-green-800 border-green-300",
    "Pending": "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-yellow-100 text-yellow-800 border-yellow-300",
    "Disabled": "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-gray-100 text-gray-700 border-gray-300",
    "Cancelled": "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-red-100 text-red-800 border-red-300",
    "Refunded": "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-purple-100 text-purple-800 border-purple-300",
}


def build_sections():
    section_titles = [
        "Performance Metrics",
        "Rendering Speed",
        "Memory Efficiency",
        "Framework Comparison",
    ]
    card_titles = ["Latency Analysis", "Throughput Metrics", "Memory Usage", "CPU Utilization"]
    features = [
        "Sub-millisecond response times",
        "Zero-copy rendering pipeline",
        "SIMD-accelerated escaping",
        "Pre-allocated buffers",
        "Minimal heap allocations",
    ]
    return [
        {
            "data_section": "even" if section_index % 2 == 0 else "odd",
            "title": section_titles[section_index],
            "cards": [
                {
                    "data_card_id": "even" if card_index % 2 == 0 else "odd",
                    "title": card_titles[card_index % len(card_titles)],
                    "features": features,
                }
                for card_index in range(8)
            ],
        }
        for section_index in range(4)
    ]


def build_rows():
    names = [
        "Alice <admin>", "Bob & Charlie", 'Dana "the boss" Lin', "Eve O'Brien",
        "Frank > Smith", "Grace Hopper & Co.", "Heidi <script>", "Ivan & Sons",
        'Judy Q. "Public"', "Karl <tag>", "Liu & Wang", "Mallory >&<",
        "Niaj <user>", "Olivia & Co.", "Peggy 'Quote'", "Quinn & Sons",
    ]
    emails = [
        "alice+filter@example.com", "bob&charlie@example.com", "dana@example.org",
        "eve@example.io", "frank>smith@example.net", "grace@hopper.dev",
        "heidi@example.com", "ivan&sons@example.co", "judy@public.gov",
        "karl@example.com", "liu@wang.cn", "mallory@evil.example",
        "niaj@example.bd", "olivia@co.example", "peggy@quoted.example",
        "quinn@example.io",
    ]
    statuses = ["Active", "Pending", "Disabled", "Cancelled", "Refunded"]
    countries = ["USA", "CAN", "GBR", "DEU", "FRA", "JPN", "AUS", "BRA"]
    tag_sets = [
        ["new", "priority"], ["enterprise", "vip"], ["trial"],
        ["enterprise", "vip", "priority"], ["churn-risk"], ["new"],
        ["priority", "review"], ["vip"],
    ]
    rows = []
    for index in range(TABLE_ROW_COUNT):
        amount = 12_345 + (index * 137) % 99_999
        rows.append(
            {
                "id": 100_000 + index,
                "name": names[index % len(names)],
                "email": emails[index % len(emails)],
                "status": statuses[index % len(statuses)],
                "amount_cents": amount,
                "tax_cents": amount * 8 // 100,
                "created_unix": 1_700_000_000 + index * 86_400,
                "updated_unix": 1_710_000_000 + index * 3_600,
                "score_bps": 5_000 + (index * 31) % 5_000,
                "country": countries[index % len(countries)],
                "tags": tag_sets[index % len(tag_sets)],
            }
        )
    return rows


def build_products():
    categories = ["Audio", "Displays", "Wearables"]
    return [
        {
            "id": 1_000 + index,
            "name": f'Meridian "Model {index}" & Co.',
            "category": categories[index % len(categories)],
            "price_cents": 1_999 + (index % 40) * 500,
            "rating_tenths": 30 + index % 20,
            "review_count": 3 + (index * 7) % 400,
        }
        for index in range(PRODUCT_COUNT)
    ]


def currency(cents):
    sign = "-" if cents < 0 else ""
    absolute = abs(cents)
    return f"{sign}${absolute // 100:,}.{absolute % 100:02d}"


def percentile(sorted_values, percent):
    rank = percent / 100 * (len(sorted_values) - 1)
    lower, upper = math.floor(rank), math.ceil(rank)
    if lower == upper:
        return sorted_values[lower]
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * (rank - lower)


TEMPLATES = {
    "cards": """<html lang="en"><head><title>SSR Benchmark Page</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><header class="hero-section"><h1 class="title">SSR Framework Benchmark</h1><p class="subtitle">Comparing Proa, Leptos, Dioxus, and Yew</p></header><main class="main-content">{% for section in sections %}<section class="card-section" data-section="{{ section.data_section }}"><h2 class="section-title">{{ section.title }}</h2><div class="card-grid">{% for card in section.cards %}<article class="card" data-card-id="{{ card.data_card_id }}"><div class="card-header"><img src="/images/benchmark.png" alt="Benchmark chart" class="card-image"></div><div class="card-body"><h3 class="card-title">{{ card.title }}</h3><p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p><ul class="feature-list">{% for feature in card.features %}<li class="feature-item">{{ feature }}</li>{% endfor %}</ul><button class="btn-primary" type="button">View Details</button></div></article>{% endfor %}</div></section>{% endfor %}</main><footer class="footer"><p>Rendered by the SSR benchmark fixture</p></footer></body></html>""",
    "table": """<html lang="en"><head><title>Customer Data Table</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-gray-50 text-gray-900"><header class="px-6 py-4 border-b"><h1 class="text-xl font-semibold">Customer Accounts</h1><p class="text-sm text-gray-600">Live revenue and account status across all regions.</p></header><main class="p-6"><table class="min-w-full text-sm border-collapse"><thead class="bg-gray-100"><tr><th class="px-3 py-2 text-left">ID</th><th class="px-3 py-2 text-left">Name</th><th class="px-3 py-2 text-left">Email</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-right">Amount</th><th class="px-3 py-2 text-right">Tax</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-left">Created</th><th class="px-3 py-2 text-left">Updated</th><th class="px-3 py-2 text-right">Score</th><th class="px-3 py-2 text-left">Country</th><th class="px-3 py-2 text-left">Tags</th></tr></thead><tbody>{% for row in rows %}<tr class="{{ 'bg-white' if loop.index0 % 2 == 0 else 'bg-gray-50' }}" data-row-id="{{ row.id }}"><td class="px-3 py-2 font-mono text-gray-500">{{ row.id }}</td><td class="px-3 py-2">{{ row.name }}</td><td class="px-3 py-2 text-blue-700">{{ row.email }}</td><td class="px-3 py-2"><span class="{{ status_classes[row.status] }}">{{ row.status }}</span></td><td class="px-3 py-2 text-right font-mono">{{ currency(row.amount_cents) }}</td><td class="px-3 py-2 text-right font-mono text-gray-500">{{ currency(row.tax_cents) }}</td><td class="px-3 py-2 text-right font-mono font-semibold">{{ currency(row.amount_cents + row.tax_cents) }}</td><td class="px-3 py-2 text-gray-600">{{ date(row.created_unix) }}</td><td class="px-3 py-2 text-gray-600">{{ date_time(row.updated_unix) }}</td><td class="px-3 py-2 text-right font-mono">{{ percent(row.score_bps) }}</td><td class="px-3 py-2">{{ row.country }}</td><td class="px-3 py-2">{% for tag in row.tags %}<span class="inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">{{ tag }}</span>{% endfor %}</td></tr>{% endfor %}</tbody></table></main></body></html>""",
    "products": """<main class="mx-auto w-full max-w-6xl px-4 py-10"><h1 class="text-2xl font-bold tracking-tight">All products</h1><div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{% for product in products %}<a href="/products/{{ product.id }}" class="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"><div class="mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300">{{ product.category }}</div><p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ product.category }}</p><h3 class="mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600">{{ product.name }}</h3><div class="mt-2 flex items-center gap-1"><div class="flex">{% for index in star_indexes %}<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="{{ star_class(index, product.rating_tenths) }}"><path d="{{ star_path }}"></path></svg>{% endfor %}</div><span class="text-xs text-slate-500">{{ rating(product.rating_tenths) }} ({{ product.review_count }})</span></div><p class="mt-3 text-lg font-bold">{{ price(product.price_cents) }}</p></a>{% endfor %}</div></main>""",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workload", choices=TEMPLATES, required=True)
    parser.add_argument("--iterations", type=int)
    parser.add_argument("--warmup", type=int)
    parser.add_argument("--out")
    parser.add_argument("--dump")
    parser.add_argument("--dump-only", action="store_true")
    args = parser.parse_args()

    defaults = {
        "cards": (2_000, 200, 32),
        "table": (200, 20, TABLE_ROW_COUNT),
        "products": (500, 50, PRODUCT_COUNT),
    }
    default_iterations, default_warmup, cardinality = defaults[args.workload]
    iterations = args.iterations if args.iterations is not None else default_iterations
    warmup = args.warmup if args.warmup is not None else default_warmup
    if iterations < 1 or warmup < 0:
        parser.error("iterations must be positive and warmup non-negative")

    environment = Environment(loader=BaseLoader(), autoescape=True)
    environment.globals.update(
        currency=currency,
        date=lambda unix: datetime.fromtimestamp(unix, timezone.utc).strftime("%Y-%m-%d"),
        date_time=lambda unix: datetime.fromtimestamp(unix, timezone.utc).strftime("%Y-%m-%d %H:%M"),
        percent=lambda bps: f"{bps // 100}.{(bps % 100) // 10}%",
        price=lambda cents: f"${cents // 100}.{cents % 100:02d}",
        rating=lambda tenths: f"{tenths // 10}.{tenths % 10}",
        star_class=lambda index, tenths: "h-4 w-4 text-amber-400" if index < (tenths + 5) // 10 else "h-4 w-4 text-slate-200",
    )
    template = environment.from_string(TEMPLATES[args.workload])
    inputs = {
        "cards": {"sections": build_sections()},
        "table": {"rows": build_rows(), "status_classes": STATUS_CLASSES},
        "products": {"products": build_products(), "star_indexes": range(5), "star_path": STAR_PATH},
    }[args.workload]
    render = lambda: template.render(**inputs)

    html = render()
    if args.dump:
        path = Path(args.dump)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html)
    if args.dump_only:
        print(f"Jinja2 {args.workload}: {len(html.encode())} bytes")
        return

    for _ in range(warmup):
        html = render()
    samples = []
    for _ in range(iterations):
        started = time.perf_counter_ns()
        html = render()
        samples.append((time.perf_counter_ns() - started) / 1_000)
    samples.sort()
    result = {
        "schema_version": 1,
        "framework": "Jinja2",
        "framework_id": "jinja2",
        "language": "Python",
        "language_version": platform.python_version(),
        "workload": args.workload,
        "workload_cardinality": cardinality,
        "allocation_policy": "compiled Jinja2 template; fresh owned string",
        "iterations": iterations,
        "warmup": warmup,
        "output_bytes": len(html.encode()),
        "min_us": samples[0],
        "mean_us": statistics.fmean(samples),
        "p50_us": percentile(samples, 50),
        "p95_us": percentile(samples, 95),
        "p99_us": percentile(samples, 99),
        "max_us": samples[-1],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    print(
        f"{result['framework']:<20} {args.workload:<8} {result['p50_us']:9.2f} µs p50  "
        f"{result['p95_us']:9.2f} µs p95  {result['output_bytes']:8d} bytes"
    )
    encoded = json.dumps(result, indent=2) + "\n"
    if args.out:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(encoded)
    else:
        print(encoded, end="")


if __name__ == "__main__":
    main()
