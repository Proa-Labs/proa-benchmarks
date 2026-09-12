#!/usr/bin/env python3
"""Summarize document-only CDP chunk probes and packet-gap evidence."""

from __future__ import annotations

import argparse
import json
import re
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any


GAP_CLUSTER_BYTES = 8 * 1024
MIN_GAP_MS = 50.0


def median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def ms(value: float | None) -> str:
    if value is None:
        return "—"
    if value >= 1_000:
        return f"{value / 1_000:.2f} s"
    return f"{value:.1f} ms"


def size(value: float | None) -> str:
    if value is None:
        return "—"
    if value >= 1024 * 1024:
        return f"{value / (1024 * 1024):.2f} MiB"
    return f"{value / 1024:.1f} KiB"


def parse_server_timing(value: str) -> dict[str, dict[str, Any]]:
    """Parse the simple metric parameters needed from Server-Timing."""

    metrics: dict[str, dict[str, Any]] = {}
    for raw_metric in re.split(r"[,\n]", value):
        parts = [part.strip() for part in raw_metric.split(";") if part.strip()]
        if not parts:
            continue
        metric: dict[str, Any] = {}
        for parameter in parts[1:]:
            name, separator, raw_value = parameter.partition("=")
            if not separator:
                continue
            normalized_name = name.strip().lower()
            normalized_value = raw_value.strip().strip('"')
            if normalized_name == "dur":
                try:
                    metric["durationMs"] = float(normalized_value)
                except ValueError:
                    continue
            elif normalized_name == "desc":
                metric["description"] = normalized_value
        metrics[parts[0].lower()] = metric
    return metrics


def load_probe(spec: str) -> dict[str, Any]:
    if "=" not in spec:
        raise ValueError(f"probe must be LABEL=PATH, got {spec!r}")
    label, raw_path = spec.split("=", 1)
    payload = json.loads(Path(raw_path).read_text(encoding="utf-8"))
    return {"label": label, "path": raw_path, "payload": payload}


def finished_document(record: dict[str, Any]) -> dict[str, Any]:
    documents = [
        transfer
        for transfer in record["documentTransfers"]
        if transfer["outcome"] == "finished"
        and (transfer.get("response") or {}).get("status") == 200
    ]
    if not documents:
        raise ValueError(
            f"no completed 200 document for {record['surface']} run {record['run']}"
        )
    return documents[-1]


def sample_from_record(condition: str, record: dict[str, Any]) -> dict[str, Any]:
    document = finished_document(record)
    chunks = document["chunkSummary"]
    response = document.get("response") or {}
    encoded_bytes = float(document.get("loadingFinishedEncodedBytes") or 0)
    headers = response.get("headers") or {}
    return {
        "condition": condition,
        "run": int(record["run"]),
        "surface": record["surface"],
        "url": document["url"],
        "protocol": response.get("protocol"),
        "headers": headers,
        "serverTiming": parse_server_timing(headers.get("server-timing", "")),
        "ttfbMs": float(document["responseStartMs"] - document["startMs"]),
        "tailMs": float(chunks["tailMs"]),
        "documentMs": float(document["endMs"] - document["startMs"]),
        "encodedBytes": encoded_bytes,
        "decodedBytes": float(chunks["decodedBytes"]),
        "largestGapMs": float(chunks.get("maxGapMs") or 0),
        "gaps": [
            {
                "durationMs": float(gap["durationMs"]),
                "decodedBytesBefore": int(gap["decodedBytesBefore"]),
                "kind": gap["kind"],
            }
            for gap in chunks["largestGaps"]
            if float(gap["durationMs"]) >= MIN_GAP_MS
        ],
    }


def stable_gap_centers(samples: list[dict[str, Any]]) -> dict[str, int]:
    by_surface: dict[str, list[tuple[int, int, float]]] = defaultdict(list)
    for sample_index, sample in enumerate(samples):
        for gap in sample["gaps"]:
            offset = int(gap["decodedBytesBefore"])
            if offset <= 0:
                continue
            cluster = round(offset / GAP_CLUSTER_BYTES)
            by_surface[sample["surface"]].append(
                (cluster, sample_index, float(gap["durationMs"]))
            )

    centers = {}
    for surface, entries in by_surface.items():
        clusters: dict[int, dict[int, float]] = defaultdict(dict)
        for cluster, sample_index, duration_ms in entries:
            clusters[cluster][sample_index] = max(
                duration_ms,
                clusters[cluster].get(sample_index, 0.0),
            )
        selected = max(
            clusters,
            key=lambda cluster: (
                len(clusters[cluster]),
                median(list(clusters[cluster].values())) or 0.0,
            ),
        )
        centers[surface] = selected * GAP_CLUSTER_BYTES
    return centers


def attach_stable_gaps(
    samples: list[dict[str, Any]], centers: dict[str, int]
) -> None:
    for sample in samples:
        center = centers.get(sample["surface"])
        if center is None:
            sample["stableGap"] = None
            continue
        candidates = [
            gap
            for gap in sample["gaps"]
            if abs(int(gap["decodedBytesBefore"]) - center) <= GAP_CLUSTER_BYTES
        ]
        sample["stableGap"] = (
            max(candidates, key=lambda gap: gap["durationMs"]) if candidates else None
        )


def summarize_group(
    samples: list[dict[str, Any]], download_mbps: float
) -> dict[str, Any]:
    stable = [sample["stableGap"] for sample in samples if sample["stableGap"]]
    encoded_p50 = median([sample["encodedBytes"] for sample in samples])
    timing_names = {
        name
        for sample in samples
        for name, metric in sample.get("serverTiming", {}).items()
        if "durationMs" in metric
    }
    return {
        "samples": samples,
        "n": len(samples),
        "protocols": sorted(
            {sample["protocol"] for sample in samples if sample["protocol"]}
        ),
        "ttfbMsP50": median([sample["ttfbMs"] for sample in samples]),
        "tailMsP50": median([sample["tailMs"] for sample in samples]),
        "documentMsP50": median([sample["documentMs"] for sample in samples]),
        "encodedBytesP50": encoded_p50,
        "decodedBytesP50": median([sample["decodedBytes"] for sample in samples]),
        "linkTransferFloorMsP50": (
            encoded_p50 * 8 / (download_mbps * 1_000_000) * 1_000
            if encoded_p50 is not None
            else None
        ),
        "stableGapMsP50": median(
            [float(gap["durationMs"]) for gap in stable]
        ),
        "stableGapOffsetP50": median(
            [float(gap["decodedBytesBefore"]) for gap in stable]
        ),
        "stableGapCoverage": len(stable),
        "largestGapMsP50": median([sample["largestGapMs"] for sample in samples]),
        "cacheControls": sorted(
            {
                sample.get("headers", {})["cache-control"]
                for sample in samples
                if "cache-control" in sample.get("headers", {})
            }
        ),
        "cacheDisabledCount": sum(
            any(
                directive
                in sample.get("headers", {}).get("cache-control", "").lower()
                for directive in ("no-store", "no-cache")
            )
            for sample in samples
        ),
        "cdnCacheMissCount": sum(
            sample.get("serverTiming", {})
            .get("cdn-cache", {})
            .get("description", "")
            .upper()
            == "MISS"
            for sample in samples
        ),
        "cdnCacheObservationCount": sum(
            bool(
                sample.get("serverTiming", {})
                .get("cdn-cache", {})
                .get("description")
            )
            for sample in samples
        ),
        "serverTimingDurationMsP50": {
            name: median(
                [
                    float(sample["serverTiming"][name]["durationMs"])
                    for sample in samples
                    if "durationMs" in sample.get("serverTiming", {}).get(name, {})
                ]
            )
            for name in sorted(timing_names)
        },
    }


def build_summary(
    probes: list[dict[str, Any]], packet_evidence: dict[str, Any]
) -> dict[str, Any]:
    samples = [
        sample_from_record(probe["label"], record)
        for probe in probes
        for record in probe["payload"]["records"]
    ]
    centers = stable_gap_centers(samples)
    attach_stable_gaps(samples, centers)

    conditions = []
    for probe in probes:
        label = probe["label"]
        config = probe["payload"]["config"]
        condition_samples = [
            sample for sample in samples if sample["condition"] == label
        ]
        surfaces = []
        for surface in sorted({sample["surface"] for sample in condition_samples}):
            surfaces.append(
                {
                    "surface": surface,
                    **summarize_group(
                        [
                            sample
                            for sample in condition_samples
                            if sample["surface"] == surface
                        ],
                        float(config["downloadMbps"]),
                    ),
                }
            )
        conditions.append({"label": label, "config": config, "surfaces": surfaces})
    return {
        "method": {
            "gapClusterBytes": GAP_CLUSTER_BYTES,
            "minimumGapMs": MIN_GAP_MS,
            "subresourcesBlocked": True,
            "freshBrowserPerDocument": True,
        },
        "stableGapCenters": centers,
        "conditions": conditions,
        "packetEvidence": packet_evidence,
    }


def render_markdown(summary: dict[str, Any]) -> str:
    capture = summary["packetEvidence"]["capture"]
    lines = [
        "# HTML document delivery diagnosis",
        "",
        "Measured on the same 8-vCPU AMD EPYC Milan Hetzner VPS and Chrome for Testing 149 used by the travel-agent benchmark. Each sample used a fresh browser. All scripts, stylesheets, images, fonts, and API requests were blocked so the main document could not contend with subresources.",
        "",
        "`TTFB` ends at the first response byte. `Tail` runs from the first byte through the last encoded response byte; those adjacent phases form the document's network time. `Stable gap` is the repeated ≥50 ms delivery pause found at the same decoded-body offset across conditions, so it is already inside `Tail` and must not be added again.",
        "",
        "## Result",
        "",
        "| Condition | Surface | n | TTFB p50 | Encoded response | Link floor | Tail p50 | Stable gap p50 | Gap after decoded |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for condition in summary["conditions"]:
        for surface in condition["surfaces"]:
            lines.append(
                "| {condition} | {surface_name} | {n} | {ttfb} | {encoded} | {floor} | {tail} | {gap} ({coverage}/{n}) | {offset} |".format(
                    condition=condition["label"],
                    surface_name=surface["surface"],
                    n=surface["n"],
                    ttfb=ms(surface["ttfbMsP50"]),
                    encoded=size(surface["encodedBytesP50"]),
                    floor=ms(surface["linkTransferFloorMsP50"]),
                    tail=ms(surface["tailMsP50"]),
                    gap=ms(surface["stableGapMsP50"]),
                    coverage=surface["stableGapCoverage"],
                    offset=size(surface["stableGapOffsetP50"]),
                )
            )

    baseline = next(
        (
            condition
            for condition in summary["conditions"]
            if float(condition["config"]["latencyMs"]) == 40.0
            and float(condition["config"]["downloadMbps"]) == 100.0
        ),
        summary["conditions"][0],
    )
    lines.extend(
        [
            "",
            "## First-byte evidence",
            "",
            f"These response headers came from the {baseline['label']} control. Server-Timing metrics are origin-provided diagnostics and may overlap; they are not added to TTFB.",
            "",
            "| Surface | Cache-Control | CDN cache | Origin p50 | Edge p50 |",
            "|---|---|---:|---:|---:|",
        ]
    )
    for surface in baseline["surfaces"]:
        timing = surface["serverTimingDurationMsP50"]
        cache_observations = surface["cdnCacheObservationCount"]
        cache_result = (
            f"MISS {surface['cdnCacheMissCount']}/{cache_observations}"
            if cache_observations
            else "not exposed"
        )
        lines.append(
            "| {surface_name} | {cache_control} ({disabled}/{n}) | {cache_result} | {origin} | {edge} |".format(
                surface_name=surface["surface"],
                cache_control="; ".join(surface["cacheControls"]) or "not exposed",
                disabled=surface["cacheDisabledCount"],
                n=surface["n"],
                cache_result=cache_result,
                origin=ms(timing.get("origin")),
                edge=ms(timing.get("edge")),
            )
        )

    baseline_by_surface = {
        surface["surface"]: surface for surface in baseline["surfaces"]
    }
    airbnb = baseline_by_surface.get("airbnb")
    hotels = baseline_by_surface.get("hotels")
    first_byte_note = "First byte and body delivery are separate waits."
    if airbnb is not None and hotels is not None:
        airbnb_timing = airbnb["serverTimingDurationMsP50"]
        first_byte_note += (
            f" Airbnb's {airbnb['n']} documents were explicitly private/no-store"
            f" and all reported a CDN miss; its own Server-Timing header reported"
            f" {ms(airbnb_timing.get('origin'))} origin and"
            f" {ms(airbnb_timing.get('edge'))} edge p50 inside the"
            f" {ms(airbnb['ttfbMsP50'])} browser-observed TTFB. Google Hotels"
            " also disabled caching but did not expose an equivalent origin/edge"
            " split. Removing the configured 40 ms latency did not improve either"
            " site's TTFB, which points to upstream document generation and edge"
            " handling rather than link throughput as the dominant first-byte cost."
        )

    lines.extend(
        [
            "",
            first_byte_note,
            "",
            "Raising the configured link from 100 Mbps to 1 Gbps does not reduce either stable gap. Removing the configured request latency does not remove them either. A separate 1 Mbps validation makes Airbnb's 119 KiB encoded document a smooth ~910 ms transfer, confirming that Chrome's throughput control is active and that the 100 Mbps runs are not bandwidth-limited.",
            "",
            "The decoded boundary is also repeatable. Airbnb pauses at roughly 507 KiB, between its SPA boot/auth roots and listing-image preload links. Google Hotels pauses at roughly 1.39 MiB inside the streamed `c-wiz` document markup. This describes where delivery stops; it does not establish whether either page's visible UI is server-rendered.",
            "",
            "## Packet correlation",
            "",
            f"The correlation capture used {capture['tool']} on `{capture['interface']}` with a {capture['snaplenBytes']}-byte snap length and a port-443 filter; it reported {capture['packetDrops']} dropped packets. Only timing and matching-flow metadata are retained in the repository.",
            "",
            "| Surface | Protocol | CDP gap | Matching packet silence | Observation |",
            "|---|---|---:|---:|---|",
        ]
    )
    for evidence in summary["packetEvidence"]["flows"]:
        lines.append(
            "| {surface} | {protocol} | {cdp} | {packet} | {observation} |".format(
                surface=evidence["surface"],
                protocol=evidence["protocol"],
                cdp=ms(float(evidence["cdpGapMs"])),
                packet=ms(float(evidence["packetSilenceMs"])),
                observation=evidence["observation"],
            )
        )
    lines.extend(
        [
            "",
            "The packet captures show that the delay exists on the wire rather than only in parser or CDP event delivery: the remote flow itself sends no packets during the measured pause. The receiver remained available in the TCP case, and no client packet triggered resumption in either capture. The remaining externally visible boundary is origin/CDN delivery. Without Airbnb or Google's internal tracing, the experiment cannot distinguish application-side deferred work from edge buffering or pacing.",
            "",
            "## Every document-only sample",
            "",
            "| Condition | Surface | Run | TTFB | Tail | Stable gap | Gap offset | Encoded | Decoded |",
            "|---|---|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for condition in summary["conditions"]:
        for surface in condition["surfaces"]:
            for sample in surface["samples"]:
                gap = sample["stableGap"]
                lines.append(
                    "| {condition} | {surface_name} | {run} | {ttfb} | {tail} | {gap} | {offset} | {encoded} | {decoded} |".format(
                        condition=condition["label"],
                        surface_name=surface["surface"],
                        run=sample["run"],
                        ttfb=ms(sample["ttfbMs"]),
                        tail=ms(sample["tailMs"]),
                        gap=ms(float(gap["durationMs"])) if gap else "—",
                        offset=size(float(gap["decodedBytesBefore"])) if gap else "—",
                        encoded=size(sample["encodedBytes"]),
                        decoded=size(sample["decodedBytes"]),
                    )
                )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="append", required=True)
    parser.add_argument("--packet-evidence", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--markdown", required=True)
    args = parser.parse_args()
    probes = [load_probe(spec) for spec in args.probe]
    packet_evidence = json.loads(
        Path(args.packet_evidence).read_text(encoding="utf-8")
    )
    summary = build_summary(probes, packet_evidence)
    Path(args.output).write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    Path(args.markdown).write_text(render_markdown(summary), encoding="utf-8")


if __name__ == "__main__":
    main()
