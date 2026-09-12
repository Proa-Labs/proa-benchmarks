#!/usr/bin/env python3
"""Replay the successful chain through Browser Use without LLM timing noise."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import time
import urllib.parse
import urllib.request
import uuid

from browser_use import Browser


def read_json(url: str) -> dict[str, object]:
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.load(response)


async def close_browser(browser: Browser) -> None:
    close = getattr(browser, "kill", None) or getattr(browser, "stop", None)
    if close is not None:
        await close()


async def wait_until_hydrated(browser: Browser, timeout_seconds: float) -> None:
    deadline = time.perf_counter() + timeout_seconds
    while time.perf_counter() < deadline:
        page = await browser.must_get_current_page()
        state = json.loads(
            await page.evaluate(
                "() => JSON.stringify({"
                "hydrated: document.documentElement.dataset.agentHydrated === 'true',"
                "error: document.documentElement.dataset.agentHydrationError || null"
                "})"
            )
        )
        if state["error"]:
            raise RuntimeError(f"React hydration failed: {state['error']}")
        if state["hydrated"]:
            return
        await asyncio.sleep(0.05)
    raise TimeoutError(f"React did not hydrate within {timeout_seconds:.1f}s")


async def run_once(
    variant: str,
    base_url: str,
    index: int,
    wait_for_hydration: bool,
    hydration_timeout_seconds: float,
) -> dict[str, object]:
    run_id = f"replay-{variant}-{index}-{uuid.uuid4().hex[:8]}"
    browser = Browser(
        headless=True,
        executable_path=os.environ.get(
            "AGENT_CHAIN_CHROME",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
        allowed_domains=["127.0.0.1"],
        enable_default_extensions=False,
    )
    await browser.start()
    navigation_seconds = 0.0

    async def navigate(url: str) -> None:
        nonlocal navigation_seconds
        started = time.perf_counter()
        await browser.navigate_to(url)
        if variant == "hydrated" and wait_for_hydration:
            await wait_until_hydrated(browser, hydration_timeout_seconds)
        navigation_seconds += time.perf_counter() - started

    started = time.perf_counter()
    try:
        await navigate(f"{base_url}/start?run={run_id}")
        page = await browser.must_get_current_page()
        vendor_urls = json.loads(
            await page.evaluate(
                "() => [...document.querySelectorAll('[data-vendor-link]')].map(link => "
                "({id: link.dataset.vendorLink, href: link.href}))"
            )
        )
        if len(vendor_urls) != 5:
            raise RuntimeError(f"expected five vendor links, found {len(vendor_urls)}")

        action_required: dict[str, str] = {}
        for vendor in vendor_urls:
            await navigate(vendor["href"])
            page = await browser.must_get_current_page()
            dossier = json.loads(
                await page.evaluate(
                    "() => ({"
                    "id: document.querySelector('[data-vendor-dossier]').dataset.vendorId,"
                    "status: document.querySelector('[data-field=status]').textContent.trim(),"
                    "code: document.querySelector('[data-field=code]').textContent.trim()"
                    "})"
                )
            )
            if dossier["id"] != vendor["id"]:
                raise RuntimeError(f"dossier mismatch: {dossier['id']} != {vendor['id']}")
            if dossier["status"] == "Action required":
                action_required[dossier["id"]] = dossier["code"]

        await navigate(f"{base_url}/submit?run={run_id}")
        query: dict[str, str] = {"run": run_id}
        query.update({f"code_{vendor_id}": code for vendor_id, code in action_required.items()})
        await navigate(f"{base_url}/result?{urllib.parse.urlencode(query)}")
        page = await browser.must_get_current_page()
        accepted = (
            await page.evaluate(
                "() => document.querySelector('[data-submission-result]')?.dataset.submissionResult"
            )
            == "accepted"
        )
        elapsed = time.perf_counter() - started
        metrics = read_json(f"{base_url}/metrics?run={run_id}")
        if not accepted or metrics.get("acceptedSubmissions") != 1:
            raise RuntimeError(f"server rejected replay: accepted={accepted} metrics={metrics}")
        return {
            "variant": variant,
            "seconds": elapsed,
            "navigation_seconds": navigation_seconds,
            "asset_requests": metrics.get("assetRequests"),
            "asset_bytes": metrics.get("assetBytes"),
        }
    finally:
        await close_browser(browser)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--minimal-url", default="http://127.0.0.1:5600")
    parser.add_argument("--hydrated-url", default="http://127.0.0.1:5601")
    parser.add_argument(
        "--wait-for-hydration",
        action="store_true",
        help="wait for the React effect after Browser Use's normal readiness wait",
    )
    parser.add_argument("--hydration-timeout-seconds", type=float, default=120.0)
    args = parser.parse_args()

    records: dict[str, list[dict[str, object]]] = {"minimal": [], "hydrated": []}
    for index in range(args.runs):
        order = ("minimal", "hydrated") if index % 2 == 0 else ("hydrated", "minimal")
        for variant in order:
            base_url = args.minimal_url if variant == "minimal" else args.hydrated_url
            record = await run_once(
                variant,
                base_url,
                index,
                args.wait_for_hydration,
                args.hydration_timeout_seconds,
            )
            records[variant].append(record)
            print(
                f"BROWSER_USE_REPLAY_RUN variant={variant} run={index + 1} "
                f"seconds={record['seconds']:.3f} navigation_seconds={record['navigation_seconds']:.3f} "
                f"asset_requests={record['asset_requests']}"
            )

    minimal_median = statistics.median(record["seconds"] for record in records["minimal"])
    hydrated_median = statistics.median(record["seconds"] for record in records["hydrated"])
    minimal_navigation = statistics.median(
        record["navigation_seconds"] for record in records["minimal"]
    )
    hydrated_navigation = statistics.median(
        record["navigation_seconds"] for record in records["hydrated"]
    )
    print(
        "BROWSER_USE_REPLAY_RESULT "
        f"runs={args.runs} wait_for_hydration={str(args.wait_for_hydration).lower()} "
        f"minimal_median_s={minimal_median:.3f} "
        f"hydrated_median_s={hydrated_median:.3f} delta_s={hydrated_median - minimal_median:.3f} "
        f"ratio={hydrated_median / minimal_median:.2f}x "
        f"minimal_navigation_s={minimal_navigation:.3f} hydrated_navigation_s={hydrated_navigation:.3f}"
    )


if __name__ == "__main__":
    asyncio.run(main())
