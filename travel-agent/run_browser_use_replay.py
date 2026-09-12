#!/usr/bin/env python3
"""Replay the Maui research chain through Browser Use without LLM variance."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import statistics
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from browser_use import Browser


FIXTURE_PATH = Path(__file__).with_name("surfaces.json")


def median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def classify(state: dict[str, Any], navigation_error: str | None) -> str:
    if navigation_error:
        return "navigation-error"
    combined = f"{state['title']} {state['text']}".lower()
    if any(
        marker in combined
        for marker in ("what is a bot", "verify you are human", "access denied")
    ):
        return "automation-blocked"
    if any(marker in combined for marker in ("bad gateway", "something unexpected")):
        return "site-error"
    return "actionable" if state["actionable"] else "empty-or-incomplete"


async def close_browser(browser: Browser) -> None:
    close = getattr(browser, "kill", None) or getattr(browser, "stop", None)
    if close is not None:
        await close()


async def read_state(browser: Browser, surface: dict[str, Any]) -> dict[str, Any]:
    page = await browser.must_get_current_page()
    config = json.dumps(
        {
            "minTextLength": surface["minTextLength"],
            "readinessText": surface["readinessText"],
        }
    )
    state = await page.evaluate(
        "() => {"
        f"const config = {config};"
        "const text = document.body?.innerText || '';"
        "return JSON.stringify({"
        "url: location.href,"
        "title: document.title,"
        "text: text.slice(0, 1000),"
        "textLength: text.length,"
        "htmlLength: document.documentElement?.outerHTML?.length || 0,"
        "scriptElements: document.scripts.length,"
        "actionable: text.length >= config.minTextLength && "
        "config.readinessText.every(value => text.includes(value))"
        "});"
        "}"
    )
    return json.loads(state)


async def performance_metrics(session: Any) -> dict[str, float]:
    response = await session.cdp_client.send_raw(
        "Performance.getMetrics", {}, session_id=session.session_id
    )
    return {metric["name"]: metric["value"] for metric in response["metrics"]}


async def configure_target(
    session: Any, *, latency_ms: float, download_mbps: float, javascript_enabled: bool
) -> None:
    send = session.cdp_client.send_raw
    await send("Network.enable", {}, session_id=session.session_id)
    await send("Performance.enable", {}, session_id=session.session_id)
    await send(
        "Network.emulateNetworkConditions",
        {
            "offline": False,
            "latency": latency_ms,
            "downloadThroughput": download_mbps * 1_000_000 / 8,
            "uploadThroughput": download_mbps * 1_000_000 / 8,
            "connectionType": "wifi",
        },
        session_id=session.session_id,
    )
    await send(
        "Emulation.setScriptExecutionDisabled",
        {"value": not javascript_enabled},
        session_id=session.session_id,
    )


async def run_once(
    mode: str,
    surfaces: list[dict[str, Any]],
    run_index: int,
    args: argparse.Namespace,
) -> dict[str, Any]:
    javascript_enabled = mode == "current"
    browser = Browser(
        headless=True,
        executable_path=args.chrome,
        enable_default_extensions=False,
        minimum_wait_page_load_time=0.05,
        wait_for_network_idle_page_load_time=0.1,
    )
    await browser.start()
    session = await browser.get_or_create_cdp_session()
    await configure_target(
        session,
        latency_ms=args.latency_ms,
        download_mbps=args.download_mbps,
        javascript_enabled=javascript_enabled,
    )

    started = time.perf_counter()
    records: list[dict[str, Any]] = []
    try:
        for surface in surfaces:
            navigation_started = time.perf_counter()
            navigation_error = None
            browser_navigation_ms = None
            actionable_ms = None
            state: dict[str, Any] = {
                "url": "",
                "title": "",
                "text": "",
                "textLength": 0,
                "htmlLength": 0,
                "scriptElements": 0,
                "actionable": False,
            }
            try:
                await asyncio.wait_for(
                    browser.navigate_to(surface["url"]),
                    timeout=args.navigation_timeout_seconds,
                )
                browser_navigation_ms = (time.perf_counter() - navigation_started) * 1000
                deadline = navigation_started + args.actionable_timeout_seconds
                while time.perf_counter() < deadline:
                    state = await read_state(browser, surface)
                    if state["actionable"]:
                        actionable_ms = (time.perf_counter() - navigation_started) * 1000
                        break
                    await asyncio.sleep(0.05)
                if not state["actionable"]:
                    state = await read_state(browser, surface)
            except Exception as error:  # Browser sites fail in several distinct ways.
                navigation_error = f"{type(error).__name__}: {error}"
                try:
                    state = await read_state(browser, surface)
                except Exception:
                    pass

            metrics = await performance_metrics(session)
            record = {
                "mode": mode,
                "run": run_index + 1,
                "surface": surface["id"],
                "label": surface["label"],
                "classification": classify(state, navigation_error),
                "finalUrl": state["url"],
                "browserNavigationMs": browser_navigation_ms,
                "actionableMs": actionable_ms,
                "scriptCpuMs": metrics.get("ScriptDuration", 0) * 1000,
                "taskCpuMs": metrics.get("TaskDuration", 0) * 1000,
                "textLength": state["textLength"],
                "htmlLength": state["htmlLength"],
                "scriptElements": state["scriptElements"],
                "navigationError": navigation_error,
            }
            records.append(record)
            print(f"TRAVEL_BROWSER_USE_RUN {json.dumps(record, separators=(',', ':'))}")
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000
        await close_browser(browser)

    return {
        "mode": mode,
        "run": run_index + 1,
        "elapsedMs": elapsed_ms,
        "actionableSurfaces": sum(
            1 for record in records if record["classification"] == "actionable"
        ),
        "records": records,
    }


def select_surfaces(
    all_surfaces: list[dict[str, Any]], selection: str
) -> list[dict[str, Any]]:
    if selection == "all":
        return all_surfaces
    if selection == "accessible":
        return [
            surface
            for surface in all_surfaces
            if surface["id"] not in {"united", "hilton"}
        ]
    if selection == "complete-html":
        return [surface for surface in all_surfaces if surface["completeHtmlComparable"]]
    selected_ids = {value.strip() for value in selection.split(",") if value.strip()}
    selected = [surface for surface in all_surfaces if surface["id"] in selected_ids]
    missing = selected_ids - {surface["id"] for surface in selected}
    if missing:
        raise ValueError(f"unknown surfaces: {', '.join(sorted(missing))}")
    return selected


def summarize(runs: list[dict[str, Any]], surfaces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries = []
    for mode in sorted({run["mode"] for run in runs}):
        mode_runs = [run for run in runs if run["mode"] == mode]
        summary = {
            "mode": mode,
            "runs": len(mode_runs),
            "workflowP50Ms": median([run["elapsedMs"] for run in mode_runs]),
            "actionableSurfacesP50": median(
                [float(run["actionableSurfaces"]) for run in mode_runs]
            ),
            "surfaces": [],
        }
        for surface in surfaces:
            records = [
                record
                for run in mode_runs
                for record in run["records"]
                if record["surface"] == surface["id"]
            ]
            actionable = [
                record for record in records if record["classification"] == "actionable"
            ]
            classifications = {
                classification: sum(
                    1 for record in records if record["classification"] == classification
                )
                for classification in sorted(
                    {record["classification"] for record in records}
                )
            }
            summary["surfaces"].append(
                {
                    "surface": surface["id"],
                    "label": surface["label"],
                    "classifications": classifications,
                    "actionableP50Ms": median(
                        [record["actionableMs"] for record in actionable]
                    ),
                    "browserNavigationP50Ms": median(
                        [
                            record["browserNavigationMs"]
                            for record in records
                            if record["browserNavigationMs"] is not None
                        ]
                    ),
                    "scriptCpuP50Ms": median(
                        [record["scriptCpuMs"] for record in records]
                    ),
                }
            )
        summaries.append(summary)
        print(f"TRAVEL_BROWSER_USE_RESULT {json.dumps(summary, separators=(',', ':'))}")
    return summaries


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument(
        "--mode", choices=("current", "complete-html", "both"), default="both"
    )
    parser.add_argument(
        "--surfaces",
        default="complete-html",
        help="all, accessible, complete-html, or a comma-separated list of ids",
    )
    parser.add_argument("--latency-ms", type=float, default=40)
    parser.add_argument("--download-mbps", type=float, default=100)
    parser.add_argument("--navigation-timeout-seconds", type=float, default=20)
    parser.add_argument("--actionable-timeout-seconds", type=float, default=20)
    parser.add_argument(
        "--chrome",
        default=os.environ.get(
            "AGENT_TRAVEL_CHROME",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
    )
    parser.add_argument("--output")
    args = parser.parse_args()

    fixture = json.loads(FIXTURE_PATH.read_text())
    surfaces = select_surfaces(fixture["surfaces"], args.surfaces)
    modes = ("current", "complete-html") if args.mode == "both" else (args.mode,)
    if "complete-html" in modes:
        non_comparable = [
            surface["id"] for surface in surfaces if not surface["completeHtmlComparable"]
        ]
        if non_comparable:
            raise SystemExit(
                "complete-html mode requires surfaces whose live document is actionable "
                f"without page JavaScript; unsupported: {', '.join(non_comparable)}"
            )

    logging.getLogger("browser_use").setLevel(logging.WARNING)
    print(
        "TRAVEL_BROWSER_USE_CONFIG "
        + json.dumps(
            {
                "trip": fixture["trip"],
                "runs": args.runs,
                "modes": modes,
                "surfaces": [surface["id"] for surface in surfaces],
                "latencyMs": args.latency_ms,
                "downloadMbps": args.download_mbps,
            },
            separators=(",", ":"),
        )
    )

    runs: list[dict[str, Any]] = []
    for run_index in range(args.runs):
        order = modes if run_index % 2 == 0 else tuple(reversed(modes))
        for mode in order:
            run = await run_once(mode, surfaces, run_index, args)
            runs.append(run)
            print(
                "TRAVEL_BROWSER_USE_WORKFLOW "
                + json.dumps(
                    {
                        "mode": mode,
                        "run": run_index + 1,
                        "elapsedMs": run["elapsedMs"],
                        "actionableSurfaces": run["actionableSurfaces"],
                    },
                    separators=(",", ":"),
                )
            )

    summaries = summarize(runs, surfaces)
    if args.output:
        Path(args.output).write_text(
            json.dumps(
                {
                    "capturedAt": datetime.now(UTC).isoformat(),
                    "trip": fixture["trip"],
                    "config": {
                        "runs": args.runs,
                        "modes": modes,
                        "surfaces": [surface["id"] for surface in surfaces],
                        "latencyMs": args.latency_ms,
                        "downloadMbps": args.download_mbps,
                    },
                    "runs": runs,
                    "summaries": summaries,
                },
                indent=2,
            )
            + "\n"
        )


if __name__ == "__main__":
    asyncio.run(main())
