#!/usr/bin/env python3
"""Summarize script transfer and V8 coverage from a detailed travel run."""

from __future__ import annotations

import argparse
import gzip
import json
from collections import defaultdict
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import parse_qs, urlsplit


SURFACE_LABELS = {
    "flights": "Google Flights",
    "airbnb": "Airbnb",
    "hotels": "Google Hotels",
    "grand_wailea": "Grand Wailea",
    "enterprise": "Enterprise",
}

CATEGORY_ORDER = (
    "product",
    "maps",
    "measurement_ads",
    "consent_observability",
    "security",
    "embedded_services",
    "other",
)

CATEGORY_LABELS = {
    "product": "Product and site UI",
    "maps": "Maps",
    "measurement_ads": "Measurement and advertising",
    "consent_observability": "Consent, feedback, and observability",
    "security": "Security and anti-bot",
    "embedded_services": "Chat, booking, and embedded services",
    "other": "Other / unclassified",
}

MEASUREMENT_HOSTS = {
    "acdn.adnxs.com",
    "ads-engagement.presage.io",
    "analytics.tiktok.com",
    "app.link",
    "assets.adobedtm.com",
    "bat.bing.com",
    "beacon.sojern.com",
    "c.amazon-adsystem.com",
    "c.tvpixel.com",
    "cdn.branch.io",
    "cdn.taboola.com",
    "cdn.treasuredata.com",
    "connect.facebook.net",
    "ct.pinterest.com",
    "dx.mountain.com",
    "files.ascent360.com",
    "googleads.g.doubleclick.net",
    "gs.mountain.com",
    "js.adsrvr.org",
    "p.teads.tv",
    "prvsz4pe.micpn.com",
    "px.mountain.com",
    "rules.quantcount.com",
    "s.pinimg.com",
    "s.yimg.jp",
    "sc-static.net",
    "secure.quantserve.com",
    "snap.licdn.com",
    "solutions.invocacdn.com",
    "tag.demandbase.com",
    "tag.flvcdn.net",
    "tag.simpli.fi",
    "tr.snapchat.com",
    "trc.taboola.com",
    "www.google-analytics.com",
    "www.googleadservices.com",
    "www.googletagmanager.com",
}

CONSENT_OBSERVABILITY_HOSTS = {
    "cdn.clarip.com",
    "cdn.cookielaw.org",
    "cdn.pagesense.io",
    "client.prod.mplat-ppcprotect.com",
    "edge.marker.io",
    "s.go-mpulse.net",
    "scripts.clarity.ms",
    "siteintercept.qualtrics.com",
    "www.clarity.ms",
}

EMBEDDED_SERVICE_HOSTS = {
    "dipr2nuwo661l.cloudfront.net",
    "elfsightcdn.com",
    "fareharbor.com",
    "messenger.myma.ai",
}


def open_json(path: Path) -> dict[str, Any]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def host_for(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def effective_resource_surface(resource: dict[str, Any]) -> str | None:
    """Repair requests that began after the harness advanced its surface label.

    The live workflow reuses one page. A few scripts from an outgoing page begin
    between ``start_surface`` and the next navigation. The request's frame URL is
    authoritative for these two observed carry-over windows.
    """

    surface = resource.get("surface")
    frame_host = host_for(str(resource.get("frameUrl") or ""))
    if surface == "hotels" and frame_host.endswith("airbnb.com"):
        return "airbnb"
    if surface == "enterprise" and (
        frame_host.endswith("grandwailea.com")
        or frame_host.endswith("fareharbor.com")
        or frame_host.endswith("myma.ai")
    ):
        return "grand_wailea"
    return surface


def effective_coverage_surface(entry: dict[str, Any]) -> str | None:
    """Apply the URL equivalent of ``effective_resource_surface`` to coverage."""

    surface = entry.get("surface")
    host = host_for(str(entry.get("url") or ""))
    if surface == "hotels" and (host.endswith("airbnb.com") or host == "a0.muscache.com"):
        return "airbnb"
    if surface == "enterprise" and (
        host.endswith("fareharbor.com")
        or host.endswith("myma.ai")
        or host == "dipr2nuwo661l.cloudfront.net"
    ):
        return "grand_wailea"
    return surface


def category_for(surface: str | None, url: str) -> str:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path

    if host == "maps.googleapis.com":
        return "maps"
    if "recaptcha" in path or host in {"www.recaptcha.net"}:
        return "security"
    if host.endswith("grandwailea.com") and "/cdn-cgi/challenge-platform/" in path:
        return "security"
    if surface == "airbnb" and host == "www.airbnb.com" and path.startswith("/gtg/"):
        return "measurement_ads"
    if surface == "enterprise" and host == "www.enterprise.com" and "/adobedtm/" in path:
        return "measurement_ads"
    if host in MEASUREMENT_HOSTS:
        return "measurement_ads"
    if host in CONSENT_OBSERVABILITY_HOSTS or host.endswith(".siteintercept.qualtrics.com"):
        return "consent_observability"
    if host in EMBEDDED_SERVICE_HOSTS:
        return "embedded_services"
    if surface in {"flights", "hotels"} and host in {"www.google.com", "www.gstatic.com"}:
        return "product"
    if surface == "airbnb" and (
        host.endswith("airbnb.com") or host in {"a0.muscache.com", "d0a7e.airbnb.com"}
    ):
        return "product"
    if surface == "grand_wailea" and host in {
        "www.grandwailea.com",
        "cdn.jsdelivr.net",
        "unpkg.com",
    }:
        return "product"
    if surface == "enterprise" and host in {
        "www.enterprise.com",
        "use.typekit.net",
    }:
        return "product"
    return "other"


def short_name(url: str) -> str:
    parsed = urlsplit(url)
    host = parsed.hostname or "inline"
    name = PurePosixPath(parsed.path).name or parsed.path or "document inline script"
    query = parse_qs(parsed.query)
    if host == "www.googletagmanager.com":
        name = f"{name} ({query.get('id', ['unknown ID'])[0]})"
    elif "/_/mss/" in parsed.path:
        module_count = (
            len(parsed.path.rsplit("/m=", 1)[-1].split(","))
            if "/m=" in parsed.path
            else 0
        )
        name = f"Google module batch ({module_count} modules)"
    if len(name) > 96:
        name = name[:93] + "..."
    return f"{host}/{name}"


def pct(numerator: int, denominator: int) -> float | None:
    return numerator * 100.0 / denominator if denominator else None


def summarize(raw: dict[str, Any], run_index: int) -> dict[str, Any]:
    run = raw["runs"][run_index]
    timing = run.get("timing")
    if not isinstance(timing, dict):
        raise ValueError("selected run has no detailed timing payload")
    coverage_payload = timing.get("javascriptCoverage")
    if not isinstance(coverage_payload, dict):
        raise ValueError("selected run has no JavaScript coverage payload")

    resources: list[dict[str, Any]] = []
    carryover_bytes: dict[tuple[str, str], int] = defaultdict(int)
    for resource in timing.get("resources", []):
        body_bytes = resource.get("responseBodyBytes")
        if (
            resource.get("resourceType") != "script"
            or resource.get("outcome") != "finished"
            or not isinstance(body_bytes, (int, float))
            or body_bytes <= 0
        ):
            continue
        item = dict(resource)
        original = item.get("surface")
        effective = effective_resource_surface(item)
        item["effectiveSurface"] = effective
        item["category"] = category_for(effective, str(item.get("url") or ""))
        item["responseBodyBytes"] = int(body_bytes)
        resources.append(item)
        if original != effective and original and effective:
            carryover_bytes[(str(original), str(effective))] += int(body_bytes)

    coverage: list[dict[str, Any]] = []
    for entry in coverage_payload.get("entries", []):
        item = dict(entry)
        effective = effective_coverage_surface(item)
        item["effectiveSurface"] = effective
        item["category"] = category_for(effective, str(item.get("url") or ""))
        coverage.append(item)

    surfaces: dict[str, Any] = {}
    for surface in SURFACE_LABELS:
        surface_resources = [r for r in resources if r["effectiveSurface"] == surface]
        surface_coverage = [e for e in coverage if e["effectiveSurface"] == surface]
        total_bytes = sum(r["responseBodyBytes"] for r in surface_resources)
        source_chars = sum(int(e.get("sourceCharacters") or 0) for e in surface_coverage)
        used_chars = sum(int(e.get("usedCharacters") or 0) for e in surface_coverage)

        categories = []
        for category in CATEGORY_ORDER:
            category_resources = [r for r in surface_resources if r["category"] == category]
            category_coverage = [e for e in surface_coverage if e["category"] == category]
            category_bytes = sum(r["responseBodyBytes"] for r in category_resources)
            category_source = sum(int(e.get("sourceCharacters") or 0) for e in category_coverage)
            category_used = sum(int(e.get("usedCharacters") or 0) for e in category_coverage)
            if not category_resources and not category_coverage:
                continue
            categories.append(
                {
                    "category": category,
                    "label": CATEGORY_LABELS[category],
                    "transferBytes": category_bytes,
                    "transferPercent": pct(category_bytes, total_bytes),
                    "requests": len(category_resources),
                    "coverageSourceCharacters": category_source,
                    "coverageUsedCharacters": category_used,
                    "coverageUsedPercent": pct(category_used, category_source),
                }
            )

        host_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        path_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for resource in surface_resources:
            parsed = urlsplit(resource["url"])
            host = parsed.hostname or "unknown"
            host_groups[host].append(resource)
            path_groups[(host, parsed.path)].append(resource)

        repeated_paths = []
        for (host, path), entries in path_groups.items():
            if len(entries) < 2:
                continue
            path_bytes = sum(e["responseBodyBytes"] for e in entries)
            extra_like_bytes = path_bytes - max(e["responseBodyBytes"] for e in entries)
            repeated_paths.append(
                {
                    "host": host,
                    "path": path,
                    "requests": len(entries),
                    "transferBytes": path_bytes,
                    "extraLikeBytes": extra_like_bytes,
                }
            )

        top_transfers = sorted(
            (
                {
                    "name": short_name(r["url"]),
                    "category": r["category"],
                    "transferBytes": r["responseBodyBytes"],
                }
                for r in surface_resources
            ),
            key=lambda row: row["transferBytes"],
            reverse=True,
        )[:20]

        top_unused = sorted(
            (
                {
                    "name": short_name(e["url"]),
                    "category": e["category"],
                    "sourceCharacters": int(e.get("sourceCharacters") or 0),
                    "usedCharacters": int(e.get("usedCharacters") or 0),
                    "unusedCharacters": int(e.get("sourceCharacters") or 0)
                    - int(e.get("usedCharacters") or 0),
                    "usedPercent": e.get("usedPercent"),
                }
                for e in surface_coverage
            ),
            key=lambda row: row["unusedCharacters"],
            reverse=True,
        )[:20]

        surfaces[surface] = {
            "label": SURFACE_LABELS[surface],
            "transferBytes": total_bytes,
            "requests": len(surface_resources),
            "hosts": len(host_groups),
            "coverageScripts": len(surface_coverage),
            "coverageSourceCharacters": source_chars,
            "coverageUsedCharacters": used_chars,
            "coverageUsedPercent": pct(used_chars, source_chars),
            "categories": categories,
            "topHosts": sorted(
                (
                    {
                        "host": host,
                        "transferBytes": sum(e["responseBodyBytes"] for e in entries),
                        "requests": len(entries),
                    }
                    for host, entries in host_groups.items()
                ),
                key=lambda row: row["transferBytes"],
                reverse=True,
            ),
            "topTransfers": top_transfers,
            "topUnused": top_unused,
            "repeatedPaths": sorted(
                repeated_paths,
                key=lambda row: row["extraLikeBytes"],
                reverse=True,
            ),
        }

    return {
        "sourceCapturedAt": raw.get("capturedAt"),
        "runIndex": run_index,
        "config": raw.get("config"),
        "method": {
            "transferUnits": (
                "Playwright responseBodySize bytes for completed positive-size "
                "script responses"
            ),
            "coverageUnits": str(coverage_payload.get("units")),
            "coverageScope": str(coverage_payload.get("scope")),
            "coverageCaveat": (
                "Coverage records source ranges entered during this exact workflow. "
                "It is not a byte-for-byte attribution of compressed transfer, and repeated "
                "document contexts can execute the same cached source more than once."
            ),
        },
        "carryoverReattribution": [
            {"recordedSurface": source, "effectiveSurface": target, "transferBytes": value}
            for (source, target), value in sorted(carryover_bytes.items())
        ],
        "surfaces": surfaces,
    }


def mib(value: int) -> str:
    return f"{value / (1024 * 1024):.2f} MiB"


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# JavaScript payload diagnostic",
        "",
        "This is one instrumented, fresh-browser workflow on the same 8-vCPU AMD EPYC Milan",
        "VPS as the primary travel benchmark, with 100 Mbps throughput and 40 ms request",
        "latency. Coverage instrumentation adds overhead, so its wall time is not a headline",
        "performance result. Transfer and execution coverage are the useful outputs.",
        "",
        "## Overview",
        "",
        "| Surface | Script transfer | Requests | Hosts | V8-covered source | Source entered |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for surface in SURFACE_LABELS:
        row = summary["surfaces"][surface]
        lines.append(
            f"| {row['label']} | {mib(row['transferBytes'])} | {row['requests']} | "
            f"{row['hosts']} | {row['coverageSourceCharacters'] / 1_000_000:.2f}M chars | "
            f"{row['coverageUsedPercent']:.1f}% |"
        )

    lines.extend(
        [
            "",
            "`Source entered` is Chrome precise function coverage during the complete scripted",
            "interaction, not a claim that the entered code was useful or on the critical path.",
            "It also is not directly convertible to compressed response bytes.",
            "",
            "## Category transfer",
            "",
            "The categories are transparent URL/host rules in `analyze_javascript_payloads.py`;",
            "they are intended to explain payload ownership, not to declare every third-party",
            "byte removable.",
            "",
            "| Surface | Product/UI | Maps | Measurement/ads | Consent/observability "
            "| Security | Embedded services | Other |",
            "|---|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for surface in SURFACE_LABELS:
        row = summary["surfaces"][surface]
        values = {entry["category"]: entry["transferBytes"] for entry in row["categories"]}
        lines.append(
            f"| {row['label']} | "
            + " | ".join(
                mib(values.get(category, 0))
                for category in (
                    "product",
                    "maps",
                    "measurement_ads",
                    "consent_observability",
                    "security",
                    "embedded_services",
                    "other",
                )
            )
            + " |"
        )

    for surface in SURFACE_LABELS:
        row = summary["surfaces"][surface]
        lines.extend(
            [
                "",
                f"## {row['label']}",
                "",
                "### Largest hosts",
                "",
                "| Host | Transfer | Requests |",
                "|---|---:|---:|",
            ]
        )
        for host in row["topHosts"][:12]:
            lines.append(
                f"| `{host['host']}` | {mib(host['transferBytes'])} | "
                f"{host['requests']} |"
            )

        lines.extend(
            [
                "",
                "### Largest completed script responses",
                "",
                "| Script | Category | Transfer |",
                "|---|---|---:|",
            ]
        )
        for script in row["topTransfers"][:12]:
            lines.append(
                f"| `{script['name']}` | {CATEGORY_LABELS[script['category']]} | "
                f"{script['transferBytes'] / 1024:.1f} KiB |"
            )

        repeats = [entry for entry in row["repeatedPaths"] if entry["extraLikeBytes"] > 0]
        if repeats:
            lines.extend(
                [
                    "",
                    "### Repeated URL paths",
                    "",
                    "This groups query variants by host and path. `Extra-like` is the observed",
                    "total minus the largest response, a diagnostic for duplicated runtimes—not",
                    "a guaranteed removable-byte estimate.",
                    "",
                    "| Path | Requests | Transfer | Extra-like |",
                    "|---|---:|---:|---:|",
                ]
            )
            for repeat in repeats[:10]:
                path = repeat["path"]
                if len(path) > 72:
                    path = path[:69] + "..."
                lines.append(
                    f"| `{repeat['host']}{path}` | {repeat['requests']} | "
                    f"{mib(repeat['transferBytes'])} | {mib(repeat['extraLikeBytes'])} |"
                )

        lines.extend(
            [
                "",
                "### Largest source ranges not entered",
                "",
                "| Script | Source | Not entered | Entered |",
                "|---|---:|---:|---:|",
            ]
        )
        for script in row["topUnused"][:10]:
            used = script["usedPercent"]
            used_text = f"{used:.1f}%" if isinstance(used, (int, float)) else "—"
            lines.append(
                f"| `{script['name']}` | {script['sourceCharacters'] / 1_000_000:.2f}M | "
                f"{script['unusedCharacters'] / 1_000_000:.2f}M | {used_text} |"
            )

    lines.extend(
        [
            "",
            "## Carry-over correction",
            "",
            "The harness reuses one tab. These requests were labeled after the next surface had",
            "started but their recorded frame still belonged to the outgoing page:",
            "",
            "| Recorded as | Reattributed to | Transfer |",
            "|---|---|---:|",
        ]
    )
    for item in summary["carryoverReattribution"]:
        lines.append(
            f"| {SURFACE_LABELS[item['recordedSurface']]} | "
            f"{SURFACE_LABELS[item['effectiveSurface']]} | {mib(item['transferBytes'])} |"
        )
    lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--run-index", type=int, default=0)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--markdown", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = summarize(open_json(args.input), args.run_index)
    args.output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(summary), encoding="utf-8")


if __name__ == "__main__":
    main()
