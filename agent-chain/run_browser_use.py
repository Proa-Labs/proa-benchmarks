#!/usr/bin/env python3
"""Run the controlled vendor chain through the real Browser Use agent."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
import urllib.request
import uuid

from browser_use import Agent, Browser, ChatOpenAI


def read_json(url: str) -> dict[str, object]:
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.load(response)


async def close_browser(browser: Browser) -> None:
    close = getattr(browser, "kill", None) or getattr(browser, "stop", None)
    if close is not None:
        await close()


async def run_once(variant: str, base_url: str, index: int, model: str) -> dict[str, object]:
    run_id = f"bu-{variant}-{index}-{uuid.uuid4().hex[:8]}"
    start_url = f"{base_url}/start?run={run_id}"
    task = f"""
Open {start_url}. This is a closed, local benchmark.

Review all five vendor dossiers linked from the start page. For each vendor whose
status is exactly "Action required", remember its verification code. Then open
"Submit collected codes", enter codes only in the matching vendor fields, leave
all other fields empty, and submit. Finish only after the page says
"Submission accepted: 3/3". Use normal browser navigation and visible page
content; do not use page source, JavaScript evaluation, HTTP requests, or guesses.
""".strip()

    browser = Browser(
        headless=True,
        executable_path=os.environ.get(
            "AGENT_CHAIN_CHROME",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
        allowed_domains=["127.0.0.1"],
        enable_default_extensions=False,
    )
    started = time.perf_counter()
    try:
        agent = Agent(
            task=task,
            llm=ChatOpenAI(model=model),
            browser=browser,
            use_vision=False,
            flash_mode=True,
            max_actions_per_step=4,
            calculate_cost=True,
        )
        history = await agent.run(max_steps=40)
        elapsed = time.perf_counter() - started
        result = history.final_result() or ""
        metrics = read_json(f"{base_url}/metrics?run={run_id}")
        accepted = metrics.get("acceptedSubmissions") == 1
        return {
            "variant": variant,
            "seconds": elapsed,
            "accepted": accepted,
            "asset_requests": metrics.get("assetRequests"),
            "asset_bytes": metrics.get("assetBytes"),
            "steps": len(history),
            "result": result,
        }
    finally:
        await close_browser(browser)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=2)
    parser.add_argument("--model", default=os.environ.get("AGENT_CHAIN_MODEL", "gpt-4.1-mini"))
    parser.add_argument("--minimal-url", default="http://127.0.0.1:5600")
    parser.add_argument("--hydrated-url", default="http://127.0.0.1:5601")
    args = parser.parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is required")

    records: dict[str, list[dict[str, object]]] = {"minimal": [], "hydrated": []}
    for index in range(args.runs):
        order = ("minimal", "hydrated") if index % 2 == 0 else ("hydrated", "minimal")
        for variant in order:
            base_url = args.minimal_url if variant == "minimal" else args.hydrated_url
            record = await run_once(variant, base_url, index, args.model)
            records[variant].append(record)
            print(
                f"BROWSER_USE_RUN variant={variant} run={index + 1} "
                f"seconds={record['seconds']:.2f} accepted={str(record['accepted']).lower()} "
                f"steps={record['steps']} asset_requests={record['asset_requests']}"
            )

    if not all(record["accepted"] for values in records.values() for record in values):
        raise SystemExit("at least one Browser Use run failed the server-side acceptance check")

    print(
        "BROWSER_USE_VALIDATION "
        f"model={args.model} runs_per_variant={args.runs} all_accepted=true "
        "timing_comparable=false reason=model_and_trajectory_variance"
    )


if __name__ == "__main__":
    asyncio.run(main())
