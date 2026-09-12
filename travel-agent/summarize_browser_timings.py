#!/usr/bin/env python3
"""Summarize detailed travel-agent timings without adding overlapping costs."""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit


RESOURCE_GROUPS = (
    "document",
    "script",
    "api",
    "styleFont",
    "imageMedia",
    "other",
)


def p50(values: Iterable[float | int | None]) -> float | None:
    present = [float(value) for value in values if value is not None]
    return statistics.median(present) if present else None


def nested(record: dict[str, Any], *keys: str) -> Any:
    value: Any = record
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def summarize_group(records: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "samples": len(records),
        "requestsStartedP50": p50(
            nested(record, "requestsStarted") for record in records
        ),
        "completedRequestsStartedP50": p50(
            nested(record, "completedRequestsStarted") for record in records
        ),
        "responseBodyBytesP50": p50(
            nested(record, "responseBodyBytes") for record in records
        ),
        "activeMsP50": p50(nested(record, "activeMs") for record in records),
        "completedActiveMsP50": p50(
            nested(record, "completedActiveMs") for record in records
        ),
        "spanMsP50": p50(nested(record, "spanMs") for record in records),
        "completedSpanMsP50": p50(
            nested(record, "completedSpanMs") for record in records
        ),
        "summedRequestMsP50": p50(
            nested(record, "summedRequestMs") for record in records
        ),
        "completedSummedRequestMsP50": p50(
            nested(record, "completedSummedRequestMs") for record in records
        ),
    }


def normalize_url(url: str) -> str:
    parsed = urlsplit(url)
    return f"{parsed.netloc}{parsed.path}"


def successful_runs(payload: dict[str, Any]) -> list[dict[str, Any]]:
    expected = len(payload["config"]["surfaces"])
    runs = [
        run
        for run in payload["runs"]
        if run["completedSurfaces"] == expected and "timing" in run
    ]
    if not runs:
        raise ValueError("input contains no successful detailed-timing runs")
    return runs


def successful_control_runs(payload: dict[str, Any]) -> list[dict[str, Any]]:
    expected = len(payload["config"]["surfaces"])
    runs = [
        run
        for run in payload["runs"]
        if run["completedSurfaces"] == expected
    ]
    if not runs:
        raise ValueError("control input contains no successful runs")
    return runs


def summarize_control(payload: dict[str, Any]) -> dict[str, Any]:
    runs = successful_control_runs(payload)
    surface_order = payload["config"]["surfaces"]
    return {
        "mode": payload["config"]["mode"],
        "successfulRuns": len(runs),
        "workflowDurationMsP50": p50(run["elapsedMs"] for run in runs),
        "workflowDurationMsSamples": [
            {"run": run["run"], "durationMs": run["elapsedMs"]} for run in runs
        ],
        "surfaces": [
            {
                "surface": name,
                "durationMsP50": p50(
                    next(
                        surface["elapsedMs"]
                        for surface in run["surfaces"]
                        if surface["surface"] == name
                    )
                    for run in runs
                ),
                "durationMsSamples": [
                    {
                        "run": run["run"],
                        "durationMs": next(
                            surface["elapsedMs"]
                            for surface in run["surfaces"]
                            if surface["surface"] == name
                        ),
                    }
                    for run in runs
                ],
            }
            for name in surface_order
        ],
    }


def summarize_mode(payload: dict[str, Any]) -> dict[str, Any]:
    runs = successful_runs(payload)
    surface_records: dict[str, list[dict[str, Any]]] = defaultdict(list)
    step_records: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    document_records: dict[
        tuple[str, str, int], list[dict[str, Any]]
    ] = defaultdict(list)

    for run in runs:
        timing = run["timing"]
        surfaces_by_name = {
            surface["surface"]: surface for surface in timing["surfaces"]
        }
        steps_by_id = {step["id"]: step for step in timing["steps"]}
        for surface in timing["surfaces"]:
            surface_steps = [
                step
                for step in timing["steps"]
                if step["surface"] == surface["surface"]
            ]
            first_step = min(surface_steps, key=lambda step: step["startMs"])
            surface_records[surface["surface"]].append(
                {**surface, "_run": run["run"], "_firstStep": first_step}
            )
            occurrence: dict[str, int] = defaultdict(int)
            for document in surface["documents"]:
                normalized = normalize_url(document["url"])
                index = occurrence[normalized]
                occurrence[normalized] += 1
                document_records[(surface["surface"], normalized, index)].append(
                    {
                        **document,
                        "surfaceStartMs": surface["startMs"],
                        "initiatingStepLabel": nested(
                            steps_by_id.get(document["initiatingStepId"], {}), "label"
                        ),
                    }
                )
        for step in timing["steps"]:
            surface = surfaces_by_name[step["surface"]]
            enriched = {
                **step,
                "offsetMs": float(step["startMs"]) - float(surface["startMs"]),
            }
            step_records[(step["surface"], step["kind"], step["label"])].append(
                enriched
            )

    surfaces: list[dict[str, Any]] = []
    surface_order = payload["config"]["surfaces"]
    for name in surface_order:
        records = surface_records[name]
        groups = {
            group: summarize_group(
                [nested(record, "network", "byGroup", group) for record in records]
            )
            for group in RESOURCE_GROUPS
        }
        surfaces.append(
            {
                "surface": name,
                "samples": len(records),
                "durationMsP50": p50(record["durationMs"] for record in records),
                "durationMsSamples": [
                    {"run": record["_run"], "durationMs": record["durationMs"]}
                    for record in records
                ],
                "stepWallMsP50": p50(record["stepWallMs"] for record in records),
                "betweenStepMsP50": p50(
                    float(record["durationMs"]) - float(record["stepWallMs"])
                    for record in records
                ),
                "initialNavigationLabel": records[0]["_firstStep"]["label"],
                "initialNavigationMsP50": p50(
                    nested(record, "_firstStep", "durationMs") for record in records
                ),
                "browserCpu": {
                    key + "P50": p50(
                        nested(record, "browserCpu", key) for record in records
                    )
                    for key in ("scriptMs", "taskMs", "layoutMs", "styleMs")
                },
                "network": {
                    "requestsStartedP50": p50(
                        nested(record, "network", "requestsStarted")
                        for record in records
                    ),
                    "activeMsP50": p50(
                        nested(record, "network", "activeMs") for record in records
                    ),
                    "completedActiveMsP50": p50(
                        nested(record, "network", "completedActiveMs")
                        for record in records
                    ),
                    "byGroup": groups,
                },
            }
        )

    steps = []
    for (surface, kind, label), records in step_records.items():
        groups = {
            group: summarize_group(
                [nested(record, "network", "byGroup", group) for record in records]
            )
            for group in RESOURCE_GROUPS
        }
        steps.append(
            {
                "surface": surface,
                "kind": kind,
                "label": label,
                "samples": len(records),
                "offsetMsP50": p50(record["offsetMs"] for record in records),
                "durationMsP50": p50(record["durationMs"] for record in records),
                "browserCpu": {
                    key + "P50": p50(
                        nested(record, "browserCpu", key) for record in records
                    )
                    for key in ("scriptMs", "taskMs", "layoutMs", "styleMs")
                },
                "network": {
                    "requestsStartedP50": p50(
                        nested(record, "network", "requestsStarted")
                        for record in records
                    ),
                    "activeMsP50": p50(
                        nested(record, "network", "activeMs") for record in records
                    ),
                    "completedActiveMsP50": p50(
                        nested(record, "network", "completedActiveMs")
                        for record in records
                    ),
                    "byGroup": groups,
                },
                "pollsP50": p50(nested(record, "details", "polls") for record in records),
                "pollEvaluationWallMsP50": p50(
                    nested(record, "details", "pollEvaluationWallMs")
                    for record in records
                ),
            }
        )
    order = {surface: index for index, surface in enumerate(surface_order)}
    steps.sort(key=lambda step: (order[step["surface"]], step["offsetMsP50"] or 0.0))

    documents = []
    for (surface, url, occurrence), records in document_records.items():
        timing_records = [record["timing"] for record in records if record["timing"]]
        documents.append(
            {
                "surface": surface,
                "url": url,
                "occurrence": occurrence,
                "samples": len(records),
                "initiatingStep": next(
                    (
                        record["initiatingStepLabel"]
                        for record in records
                        if record["initiatingStepLabel"]
                    ),
                    None,
                ),
                "offsetMsP50": p50(
                    float(record["startMs"]) - float(record["surfaceStartMs"])
                    for record in records
                ),
                "durationMsP50": p50(record["durationMs"] for record in records),
                "responseBodyBytesP50": p50(
                    max(0, int(record.get("responseBodyBytes") or 0))
                    for record in records
                ),
                "status": sorted(
                    {record["status"] for record in records if record["status"]}
                ),
                "timing": {
                    key + "P50": p50(record.get(key) for record in timing_records)
                    for key in (
                        "dnsMs",
                        "connectMs",
                        "tlsMs",
                        "requestToFirstByteMs",
                        "downloadMs",
                        "totalMs",
                    )
                },
            }
        )
    documents.sort(
        key=lambda document: (
            order[document["surface"]],
            document["offsetMsP50"] or 0.0,
        )
    )

    return {
        "mode": payload["config"]["mode"],
        "successfulRuns": len(runs),
        "workflowDurationMsP50": p50(run["elapsedMs"] for run in runs),
        "workflowDurationMsSamples": [
            {"run": run["run"], "durationMs": run["elapsedMs"]} for run in runs
        ],
        "surfaces": surfaces,
        "steps": steps,
        "documents": documents,
    }


def ms(value: float | None) -> str:
    if value is None:
        return "—"
    if value >= 1_000:
        return f"{value / 1_000:.2f} s"
    return f"{value:.1f} ms"


def count(value: float | None) -> str:
    return "—" if value is None else f"{value:.0f}"


def size(value: float | None) -> str:
    if value is None:
        return "—"
    if value >= 1024 * 1024:
        return f"{value / (1024 * 1024):.2f} MiB"
    return f"{value / 1024:.1f} KiB"


def sample_durations(records: list[dict[str, Any]]) -> str:
    return ", ".join(ms(record["durationMs"]) for record in records)


def multiple(numerator: float | None, denominator: float | None) -> str:
    if numerator is None or denominator is None or denominator <= 0:
        return "—"
    return f"{numerator / denominator:.2f}×"


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Detailed Maui browser workflow timings",
        "",
        "Measured August 28, 2026 on the 8-vCPU AMD EPYC Milan Hetzner host with",
        "Chrome for Testing 149, 100 Mbps emulated throughput, 40 ms request latency,",
        "a fresh browser per trial, and normal caching within each trial. Every run",
        "completed five surfaces, 24 state-changing interactions, and all assertions.",
        "No LLM calls are included.",
        "",
        "All table values are independent p50s across three successful trials unless",
        "a row explicitly lists the three samples. Wall time, network-active time,",
        "and browser CPU overlap and **must not be added together**. `Active` is the",
        "union of request intervals; `span` is first request start to last response",
        "end, including discovery gaps; `summed` double-counts parallel requests.",
        "TLS is contained within connect time. A dash usually means connection reuse",
        "or that Chromium did not expose that phase. Renderer CPU counters cover",
        "asynchronous page work occurring during the sampling window, not only code",
        "synchronously caused by the named harness operation.",
        "",
        "In proxy mode, original script requests can be observed before interception",
        "aborts them; they have zero response bytes and do not execute. HTML is fetched",
        "and rewritten inside the route handler, so proxy document total time remains",
        "useful but its browser-visible first-byte subphase can be absent.",
        "",
    ]
    controls = summary.get("controls")
    if controls:
        lines.extend(
            [
                "## Low-overhead controls",
                "",
                "These adjacent runs use the same workflow without request listeners or",
                "CDP performance sampling.",
                "",
                "| Mode | Run 1 | Run 2 | Run 3 | p50 |",
                "|---|---:|---:|---:|---:|",
            ]
        )
        for key in ("current", "proaProxy"):
            control = controls[key]
            samples = control["workflowDurationMsSamples"]
            lines.append(
                "| {mode} | {samples} | {median} |".format(
                    mode=control["mode"],
                    samples=" | ".join(
                        ms(record["durationMs"]) for record in samples
                    ),
                    median=ms(control["workflowDurationMsP50"]),
                )
            )
        lines.extend(
            [
                "",
                "Control workflow speedup: **{speedup}**. Trace overhead was "
                "**{current_overhead}** for current sites and **{proxy_overhead}** for "
                "the proxy.".format(
                    speedup=multiple(
                        controls["current"]["workflowDurationMsP50"],
                        controls["proaProxy"]["workflowDurationMsP50"],
                    ),
                    current_overhead=summary["traceOverhead"]["current"],
                    proxy_overhead=summary["traceOverhead"]["proaProxy"],
                ),
                "",
            ]
        )

    lines.extend(
        [
            "## Traced comparison",
            "",
            "| Surface | Current | Proa proxy | Current / proxy |",
            "|---|---:|---:|---:|",
        ]
    )
    proxy_surfaces = {
        surface["surface"]: surface for surface in summary["proaProxy"]["surfaces"]
    }
    for current_surface in summary["current"]["surfaces"]:
        proxy_surface = proxy_surfaces[current_surface["surface"]]
        lines.append(
            "| {surface} | {current} | {proxy} | {speedup} |".format(
                surface=current_surface["surface"],
                current=ms(current_surface["durationMsP50"]),
                proxy=ms(proxy_surface["durationMsP50"]),
                speedup=multiple(
                    current_surface["durationMsP50"],
                    proxy_surface["durationMsP50"],
                ),
            )
        )
    lines.extend(
        [
            "| **workflow** | **{current}** | **{proxy}** | **{speedup}** |".format(
                current=ms(summary["current"]["workflowDurationMsP50"]),
                proxy=ms(summary["proaProxy"]["workflowDurationMsP50"]),
                speedup=multiple(
                    summary["current"]["workflowDurationMsP50"],
                    summary["proaProxy"]["workflowDurationMsP50"],
                ),
            ),
            "",
        ]
    )

    for mode_name in ("current", "proaProxy"):
        mode = summary[mode_name]
        lines.extend(
            [
                f"## {mode['mode']}",
                "",
                f"Workflow p50: **{ms(mode['workflowDurationMsP50'])}** across "
                f"{mode['successfulRuns']} successful traced trials "
                f"({sample_durations(mode['workflowDurationMsSamples'])}).",
                "",
                "### Initial page and script path",
                "",
                "`Initial navigation` is the harness call through page readiness; HTML",
                "shows the main-frame response(s) inside it. Script active/span covers",
                "the full surface, including later interactions and navigations.",
                "",
                "| Surface | Initial navigation | HTML response(s) | HTML body | Script started / completed / bytes | Script active / span | Surface JS CPU | Full surface |",
                "|---|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for surface in mode["surfaces"]:
            initial_documents = [
                document
                for document in mode["documents"]
                if document["surface"] == surface["surface"]
                and document["initiatingStep"]
                == surface["initialNavigationLabel"]
            ]
            if not initial_documents:
                initial_documents = [
                    document
                    for document in mode["documents"]
                    if document["surface"] == surface["surface"]
                ][:1]
            script = surface["network"]["byGroup"]["script"]
            lines.append(
                "| {surface} | {navigation} | {html} | {body} | "
                "{script_requests} / {script_completed} / {script_bytes} | {script_active} / "
                "{script_span} | {script_cpu} | {wall} |".format(
                    surface=surface["surface"],
                    navigation=ms(surface["initialNavigationMsP50"]),
                    html=" → ".join(
                        ms(document["durationMsP50"])
                        for document in initial_documents
                    )
                    or "—",
                    body=" → ".join(
                        size(document["responseBodyBytesP50"])
                        for document in initial_documents
                    )
                    or "—",
                    script_requests=count(script["requestsStartedP50"]),
                    script_completed=count(
                        script["completedRequestsStartedP50"]
                    ),
                    script_bytes=size(script["responseBodyBytesP50"]),
                    script_active=ms(script["completedActiveMsP50"]),
                    script_span=ms(script["completedSpanMsP50"]),
                    script_cpu=ms(surface["browserCpu"]["scriptMsP50"]),
                    wall=ms(surface["durationMsP50"]),
                )
            )
        lines.extend(
            [
                "",
                "### Surfaces",
                "",
                "`Between-step` is traced wall outside named operations, dominated by",
                "CDP metric queries and request-listener bookkeeping. It is observer /",
                "harness overhead, not a page phase to add to the site cost.",
                "",
                "| Surface | Wall samples | Wall p50 | Named-step wall | Between-step | Task CPU | JS CPU | Layout / style | Requests | Network active | Script started / completed / bytes | Script active / span / summed | API started / completed / bytes | API active / span / summed |",
                "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for surface in mode["surfaces"]:
            script = surface["network"]["byGroup"]["script"]
            api = surface["network"]["byGroup"]["api"]
            lines.append(
                "| {surface} | {wall_samples} | {wall} | {step_wall} | {between_step} | "
                "{task} | {script_cpu} | "
                "{layout} / {style} | {requests} | {network} | "
                "{script_requests} / {script_completed} / {script_bytes} | {script_active} / "
                "{script_span} / {script_summed} | {api_requests} / {api_completed} / {api_bytes} | "
                "{api_active} / {api_span} / {api_summed} |".format(
                    surface=surface["surface"],
                    wall_samples=sample_durations(surface["durationMsSamples"]),
                    wall=ms(surface["durationMsP50"]),
                    step_wall=ms(surface["stepWallMsP50"]),
                    between_step=ms(surface["betweenStepMsP50"]),
                    task=ms(surface["browserCpu"]["taskMsP50"]),
                    script_cpu=ms(surface["browserCpu"]["scriptMsP50"]),
                    layout=ms(surface["browserCpu"]["layoutMsP50"]),
                    style=ms(surface["browserCpu"]["styleMsP50"]),
                    requests=count(surface["network"]["requestsStartedP50"]),
                    network=ms(surface["network"]["completedActiveMsP50"]),
                    script_requests=count(script["requestsStartedP50"]),
                    script_completed=count(
                        script["completedRequestsStartedP50"]
                    ),
                    script_bytes=size(script["responseBodyBytesP50"]),
                    script_active=ms(script["completedActiveMsP50"]),
                    script_span=ms(script["completedSpanMsP50"]),
                    script_summed=ms(script["completedSummedRequestMsP50"]),
                    api_requests=count(api["requestsStartedP50"]),
                    api_completed=count(api["completedRequestsStartedP50"]),
                    api_bytes=size(api["responseBodyBytesP50"]),
                    api_active=ms(api["completedActiveMsP50"]),
                    api_span=ms(api["completedSpanMsP50"]),
                    api_summed=ms(api["completedSummedRequestMsP50"]),
                )
            )
        lines.extend(
            [
                "",
                "### Main-frame documents",
                "",
                "This is initial HTML plus every later full-document navigation. A route",
                "change absent from this table was client-side and used scripts/APIs instead.",
                "",
                "| Surface | Role / initiating step | Document | n | Offset | Total | DNS | Connect | TLS | Request → first byte | Download | Body |",
                "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for document in mode["documents"]:
            timing = document["timing"]
            surface_summary = next(
                surface
                for surface in mode["surfaces"]
                if surface["surface"] == document["surface"]
            )
            if document["initiatingStep"] == surface_summary["initialNavigationLabel"]:
                role = (
                    "initial HTML redirect"
                    if any(300 <= status < 400 for status in document["status"])
                    else "initial HTML"
                )
            else:
                role = document["initiatingStep"] or "later navigation"
            lines.append(
                "| {surface} | {role} | `{url}` | {samples} | {offset} | {total} | {dns} | "
                "{connect} | {tls} | {ttfb} | {download} | {body} |".format(
                    surface=document["surface"],
                    role=role.replace("|", "\\|"),
                    url=document["url"],
                    samples=document["samples"],
                    offset=ms(document["offsetMsP50"]),
                    total=ms(document["durationMsP50"]),
                    dns=ms(timing["dnsMsP50"]),
                    connect=ms(timing["connectMsP50"]),
                    tls=ms(timing["tlsMsP50"]),
                    ttfb=ms(timing["requestToFirstByteMsP50"]),
                    download=ms(timing["downloadMsP50"]),
                    body=size(document["responseBodyBytesP50"]),
                )
            )
        lines.extend(
            [
                "",
                "### Every workflow step: wall and browser CPU",
                "",
                "| Surface | Offset | Kind | Step | n | Wall | Task CPU | JS CPU | Layout | Style | Polls / poll evaluation |",
                "|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for step in mode["steps"]:
            lines.append(
                "| {surface} | {offset} | {kind} | {label} | {samples} | {wall} | {task} | "
                "{script_cpu} | {layout} | {style} | {polls} / {poll_wall} |".format(
                    surface=step["surface"],
                    offset=ms(step["offsetMsP50"]),
                    kind=step["kind"],
                    label=step["label"].replace("|", "\\|"),
                    samples=step["samples"],
                    wall=ms(step["durationMsP50"]),
                    task=ms(step["browserCpu"]["taskMsP50"]),
                    script_cpu=ms(step["browserCpu"]["scriptMsP50"]),
                    layout=ms(step["browserCpu"]["layoutMsP50"]),
                    style=ms(step["browserCpu"]["styleMsP50"]),
                    polls=count(step["pollsP50"]),
                    poll_wall=ms(step["pollEvaluationWallMsP50"]),
                )
            )
        lines.extend(
            [
                "",
                "### Every workflow step: overlapping network work",
                "",
                "| Surface | Step | n | All requests / active | Documents active | Scripts started / completed / bytes | Scripts active / span / summed | APIs started / completed / bytes | APIs active / span / summed | Style/font active | Image/media active |",
                "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for step in mode["steps"]:
            groups = step["network"]["byGroup"]
            script = groups["script"]
            api = groups["api"]
            lines.append(
                "| {surface} | {label} | {samples} | {requests} / {network} | {documents} | "
                "{script_requests} / {script_completed} / {script_bytes} | {script_active} / "
                "{script_span} / {script_summed} | {api_requests} / {api_completed} / {api_bytes} | "
                "{api_active} / {api_span} / {api_summed} | {style_font} | "
                "{image_media} |".format(
                    surface=step["surface"],
                    label=step["label"].replace("|", "\\|"),
                    samples=step["samples"],
                    requests=count(step["network"]["requestsStartedP50"]),
                    network=ms(step["network"]["completedActiveMsP50"]),
                    documents=ms(groups["document"]["completedActiveMsP50"]),
                    script_requests=count(script["requestsStartedP50"]),
                    script_completed=count(
                        script["completedRequestsStartedP50"]
                    ),
                    script_bytes=size(script["responseBodyBytesP50"]),
                    script_active=ms(script["completedActiveMsP50"]),
                    script_span=ms(script["completedSpanMsP50"]),
                    script_summed=ms(script["completedSummedRequestMsP50"]),
                    api_requests=count(api["requestsStartedP50"]),
                    api_completed=count(api["completedRequestsStartedP50"]),
                    api_bytes=size(api["responseBodyBytesP50"]),
                    api_active=ms(api["completedActiveMsP50"]),
                    api_span=ms(api["completedSpanMsP50"]),
                    api_summed=ms(api["completedSummedRequestMsP50"]),
                    style_font=ms(groups["styleFont"]["completedActiveMsP50"]),
                    image_media=ms(groups["imageMedia"]["completedActiveMsP50"]),
                )
            )
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", required=True)
    parser.add_argument("--proa-proxy", required=True)
    parser.add_argument("--current-control")
    parser.add_argument("--proa-proxy-control")
    parser.add_argument("--metadata")
    parser.add_argument("--output", required=True)
    parser.add_argument("--markdown")
    args = parser.parse_args()
    if bool(args.current_control) != bool(args.proa_proxy_control):
        parser.error(
            "--current-control and --proa-proxy-control must be supplied together"
        )
    current = json.loads(Path(args.current).read_text(encoding="utf-8"))
    proa_proxy = json.loads(Path(args.proa_proxy).read_text(encoding="utf-8"))
    summary = {
        "methodology": {
            "aggregation": "independent median for each named metric",
            "overlapWarning": (
                "Wall, network-active, and CPU durations overlap and are not additive."
            ),
            "scriptSpan": (
                "Elapsed first-to-last completed script response, including discovery gaps."
            ),
            "scriptActive": "Union of completed script request intervals.",
        },
        "current": summarize_mode(current),
        "proaProxy": summarize_mode(proa_proxy),
    }
    if args.metadata:
        summary["environment"] = json.loads(
            Path(args.metadata).read_text(encoding="utf-8")
        )
    if args.current_control and args.proa_proxy_control:
        current_control = summarize_control(
            json.loads(Path(args.current_control).read_text(encoding="utf-8"))
        )
        proa_proxy_control = summarize_control(
            json.loads(Path(args.proa_proxy_control).read_text(encoding="utf-8"))
        )
        summary["controls"] = {
            "current": current_control,
            "proaProxy": proa_proxy_control,
        }

        def overhead(mode: str, control: dict[str, Any]) -> str:
            traced = float(summary[mode]["workflowDurationMsP50"])
            baseline = float(control["workflowDurationMsP50"])
            return f"{(traced / baseline - 1) * 100:.1f}%"

        summary["traceOverhead"] = {
            "current": overhead("current", current_control),
            "proaProxy": overhead("proaProxy", proa_proxy_control),
        }
    Path(args.output).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    if args.markdown:
        Path(args.markdown).write_text(render_markdown(summary), encoding="utf-8")


if __name__ == "__main__":
    main()
