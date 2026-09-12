#!/usr/bin/env python3
"""Probe main-frame HTML delivery without running the interaction workflow."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from browser_use import Browser
from playwright.async_api import Route, async_playwright

from browser_timing import BrowserTimingRecorder
from run_browser_use_interactions import (
    AIRBNB_URL,
    ENTERPRISE_URL,
    FLIGHTS_URL,
    GRAND_WAILEA_URL,
    HOTELS_URL,
    close_browser,
    configure_network,
)


SURFACES = {
    "flights": FLIGHTS_URL,
    "airbnb": AIRBNB_URL,
    "hotels": HOTELS_URL,
    "grand_wailea": GRAND_WAILEA_URL,
    "enterprise": ENTERPRISE_URL,
}


def gap_context(body: bytes, decoded_offset: int, radius: int = 320) -> dict[str, Any]:
    """Return a bounded diagnostic around a decoded document-delivery boundary."""

    offset = min(max(0, decoded_offset), len(body))
    start = max(0, offset - radius)
    end = min(len(body), offset + radius)
    prefix = body[:offset].lower()
    last_script_open = prefix.rfind(b"<script")
    last_script_close = prefix.rfind(b"</script")
    before = body[start:offset].decode("utf-8", errors="replace")
    after = body[offset:end].decode("utf-8", errors="replace")
    return {
        "decodedOffset": decoded_offset,
        "bodyOffset": offset,
        "insideScript": last_script_open > last_script_close,
        "before": re.sub(r"\s+", " ", before),
        "after": re.sub(r"\s+", " ", after),
    }


async def probe_once(
    run: int, surface: str, url: str, args: argparse.Namespace
) -> dict[str, Any]:
    browser_use = Browser(
        headless=True,
        executable_path=args.chrome,
        chromium_sandbox=False if args.no_chromium_sandbox else None,
        enable_default_extensions=False,
        minimum_wait_page_load_time=0.05,
        wait_for_network_idle_page_load_time=0.1,
    )
    await browser_use.start()
    playwright = await async_playwright().start()
    playwright_browser = await playwright.chromium.connect_over_cdp(
        browser_use.cdp_url
    )
    if not playwright_browser.contexts:
        raise RuntimeError("Browser Use did not expose a browser context")
    context = playwright_browser.contexts[0]
    pages = context.pages
    if not pages:
        raise RuntimeError("Browser Use did not expose a page")
    page = pages[-1]

    if args.document_only:

        async def block_subresources(route: Route) -> None:
            if route.request.resource_type == "document":
                await route.continue_()
            else:
                await route.abort()

        await context.route("**/*", block_subresources)

    await configure_network(browser_use, args)
    recorder = await BrowserTimingRecorder.create(playwright_browser, page)
    await recorder.start_surface(surface)
    token = await recorder.begin_step(
        "navigation",
        f"probe {surface} document",
        {"documentOnly": args.document_only},
    )
    started = time.perf_counter()
    status = "completed"
    error: str | None = None
    response_body: bytes | None = None
    try:
        navigation_response = await page.goto(
            url,
            wait_until="domcontentloaded",
            timeout=args.navigation_timeout_seconds * 1_000,
        )
        if args.capture_gap_context and navigation_response is not None:
            response_body = await navigation_response.body()
        await page.wait_for_timeout(100)
    except Exception as caught:
        status = "failed"
        error = f"{type(caught).__name__}: {caught}"
    elapsed_ms = (time.perf_counter() - started) * 1_000
    await recorder.end_step(token, status=status, error=error)
    await recorder.end_surface(status)
    timing = await recorder.finish()
    user_agent = await page.evaluate("navigator.userAgent")
    final_url = page.url
    gap_contexts = []
    if response_body is not None:
        finished_documents = [
            transfer
            for transfer in timing["documentTransfers"]
            if transfer["outcome"] == "finished"
            and (transfer.get("response") or {}).get("status") == 200
        ]
        if finished_documents:
            gaps = finished_documents[-1]["chunkSummary"]["largestGaps"]
            gap_contexts = [
                {
                    "durationMs": gap["durationMs"],
                    **gap_context(
                        response_body,
                        int(gap["decodedBytesBefore"]),
                    ),
                }
                for gap in gaps
                if float(gap["durationMs"]) >= 50.0
            ][:3]

    if args.document_only:
        await context.unroute_all(behavior="ignoreErrors")
    await close_browser(browser_use)
    await playwright.stop()
    return {
        "run": run,
        "surface": surface,
        "status": status,
        "error": error,
        "elapsedMs": elapsed_ms,
        "finalUrl": final_url,
        "userAgent": user_agent,
        "responseBody": (
            {
                "bytes": len(response_body),
                "sha256": hashlib.sha256(response_body).hexdigest(),
                "gapContexts": gap_contexts,
            }
            if response_body is not None
            else None
        ),
        "documentTransfers": timing["documentTransfers"],
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--surfaces", default="all")
    parser.add_argument("--latency-ms", type=float, default=40)
    parser.add_argument("--download-mbps", type=float, default=100)
    parser.add_argument(
        "--document-only",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="abort subresources so the document does not compete with scripts/assets",
    )
    parser.add_argument("--navigation-timeout-seconds", type=float, default=35)
    parser.add_argument("--capture-gap-context", action="store_true")
    parser.add_argument("--no-chromium-sandbox", action="store_true")
    parser.add_argument(
        "--chrome",
        default=os.environ.get(
            "AGENT_TRAVEL_CHROME",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
    )
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be at least 1")
    if args.latency_ms < 0:
        parser.error("--latency-ms must be non-negative")
    if args.download_mbps <= 0:
        parser.error("--download-mbps must be greater than 0")
    selected = (
        list(SURFACES)
        if args.surfaces == "all"
        else [name.strip() for name in args.surfaces.split(",") if name.strip()]
    )
    unknown = set(selected) - set(SURFACES)
    if unknown:
        parser.error(f"unknown surfaces: {', '.join(sorted(unknown))}")
    if not selected:
        parser.error("at least one surface is required")

    records = []
    for run in range(1, args.runs + 1):
        for surface in selected:
            record = await probe_once(run, surface, SURFACES[surface], args)
            records.append(record)
            print(
                "DOCUMENT_DELIVERY_PROBE "
                + json.dumps(
                    {
                        key: value
                        for key, value in record.items()
                        if key not in {"documentTransfers", "responseBody"}
                    },
                    separators=(",", ":"),
                )
            )

    payload = {
        "capturedAt": datetime.now(UTC).isoformat(),
        "config": {
            "runs": args.runs,
            "surfaces": selected,
            "latencyMs": args.latency_ms,
            "downloadMbps": args.download_mbps,
            "documentOnly": args.document_only,
        },
        "records": records,
    }
    Path(args.output).write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    asyncio.run(main())
