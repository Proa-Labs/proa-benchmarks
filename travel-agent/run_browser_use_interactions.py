#!/usr/bin/env python3
"""Run a real, non-transactional Maui research workflow through Browser Use.

The actions are deterministic so browser/network/runtime cost is measurable
without LLM latency or trajectory variance. Every surface must produce a
structured fact after at least one state-changing browser interaction.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import statistics
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, AsyncIterator, Awaitable, Callable
from urllib.parse import quote

from browser_use import Browser
from playwright.async_api import Browser as PlaywrightBrowser
from playwright.async_api import Page, async_playwright

from browser_timing import BrowserTimingRecorder


AIRBNB_URL = (
    "https://www.airbnb.com/s/Wailea--Hawaii--United-States/homes"
    "?checkin=2026-10-12&checkout=2026-10-19"
)
ENTERPRISE_URL = (
    "https://www.enterprise.com/en/car-rental-locations/us/hi/kahului-airport-36e4.html"
)
FLIGHTS_URL = (
    "https://www.google.com/travel/flights?q="
    + quote("Flights from SFO to OGG Oct 12 2026 returning Oct 19 2026")
    + "&hl=en&curr=USD"
)
GRAND_WAILEA_URL = "https://www.grandwailea.com/"
HOTELS_URL = (
    "https://www.google.com/travel/hotels?q="
    + quote("Wailea hotels Oct 12 2026 to Oct 19 2026")
    + "&hl=en&curr=USD"
)

PROA_PROXY_SCRIPT = r"""
(() => {
  const mount = () => {
    const host = location.hostname;
    const path = location.pathname;
    const setBody = html => { document.body.innerHTML = `<main>${html}</main>`; };

    if (host === 'www.google.com' && path.includes('/travel/flights')) {
      setBody(`
        <h1>Flight search</h1><p>San Francisco SFO to Kahului OGG</p>
        <button id="stops">Stops</button><section id="stops-dialog" hidden>
          <h2>Stops</h2><label><input type="radio" role="radio" name="stops">Nonstop only</label>
          <button aria-label="Close dialog">Close dialog</button></section>
        <div role="tablist"><button role="tab">Best</button><button role="tab">Cheapest</button></div>
        <section id="flight-results"><h2>Search results</h2><p>9 results returned.</p>
          <p>United · SFO–OGG · Nonstop · $369 round trip</p>
          <p>Alaska · SFO–OGG · Nonstop · $399 round trip</p></section>`);
      const dialog = document.querySelector('#stops-dialog');
      document.querySelector('#stops').addEventListener('click', () => { dialog.hidden = false; });
      document.querySelector('[aria-label="Close dialog"]').addEventListener('click', () => { dialog.hidden = true; });
      return;
    }

    if (host === 'www.airbnb.com' && path.startsWith('/rooms/')) {
      setBody(`<h1>South Maui cozy studio, split AC, steps to beach!</h1>
        <p>Entire condo in Kihei, Hawaii · 2 guests · 1 bedroom · 1 bed · 1 bath</p>
        <p>Rated 4.97 out of 5 stars.</p><p>Hosted by Anna</p><p>Free cancellation</p>`);
      return;
    }
    if (host === 'www.airbnb.com') {
      setBody(`<h1>Search results; homes in Wailea</h1><p>Oct 12–19 · for 7 nights</p>
        <button role="checkbox" aria-label="Free cancellation" aria-checked="false">Free cancellation</button>
        <article data-testid="card-container"><p>Condo in Kihei</p>
          <a target="listing" href="/rooms/47514058?check_in=2026-10-12&check_out=2026-10-19">South Maui cozy studio, split AC, steps to beach!</a>
          <p>1 bedroom · 1 king bed · 1 bath</p><p>$1,310 for 7 nights</p>
          <p>4.97 out of 5 average rating, 108 reviews</p></article>`);
      document.querySelector('[role="checkbox"]').addEventListener('click', event => {
        event.currentTarget.setAttribute('aria-checked', 'true');
        history.replaceState({}, '', `${location.pathname}?checkin=2026-10-12&checkout=2026-10-19&flexible_cancellation=true`);
      });
      return;
    }

    if (host === 'www.google.com' && (path.includes('/travel/hotels') || path.includes('/travel/search'))) {
      setBody(`<h1>Wailea · 64 results</h1><button id="rating">4+ rating</button>
        <button id="pool">Pool</button><button id="sort">Sort by</button><span id="filter-count">All filters</span>
        <section id="sort-options" hidden><label><input role="radio" type="radio">Lowest price</label>
          <label><input role="radio" type="radio">Highest rating</label></section>
        <section><h2>Palms at Wailea Maui by Outrigger</h2><p>$231</p><p>4.4</p>
          <p>Outdoor pool · Free parking</p><button>View prices</button></section>
        <p>Showing results 1 - 18 of 64</p>`);
      let filters = 0;
      const update = () => { document.querySelector('#filter-count').textContent = `All filters (${filters})`; };
      document.querySelector('#rating').addEventListener('click', () => { filters += 1; update(); });
      document.querySelector('#pool').addEventListener('click', () => { filters += 1; update(); });
      document.querySelector('#sort').addEventListener('click', () => { document.querySelector('#sort-options').hidden = false; });
      return;
    }

    if (host === 'www.grandwailea.com' && path === '/') {
      setBody(`<h1>Grand Wailea</h1><a href="/stay/rooms-suites">Rooms & Suites</a>`);
      return;
    }
    if (host === 'www.grandwailea.com' && path === '/stay/rooms-suites') {
      setBody(`<h1>Our Rooms & Suites</h1><label>Categories<select name="category">
          <option value="All">All</option><option value="4">Signature Rooms</option></select></label>
        <label>View<select name="view"><option value="All">All</option><option value="11">Ocean</option></select></label>
        <article><h3>Deluxe Ocean View King</h3><p>640 SQ.FT. · SLEEPS 1-4 · DELUXE OCEAN VIEWS</p>
          <a href="/stay/deluxe-ocean-view-king">View this room</a></article>`);
      return;
    }
    if (host === 'www.grandwailea.com' && path === '/stay/deluxe-ocean-view-king') {
      setBody(`<h1>Deluxe Ocean View King</h1><h2>Amenities</h2>
        <p>SLEEPS SLEEPS 4</p><p>640 SQ.FT.</p><p>PRIVATE LĀNAI</p>`);
      return;
    }

    if (host === 'www.enterprise.com' && path.includes('/reserve')) {
      setBody(`<h1>Choose a Vehicle Class</h1><p>Oct 12, 10:00 AM</p><p>Oct 19, 10:00 AM</p>
        <h2>Best Match</h2><p>Compact SUV</p><p>Hyundai Kona or similar</p>
        <p>$ 419 .00 Total</p>`);
      return;
    }
    if (host === 'www.enterprise.com') {
      setBody(`<h1>Kahului Airport (OGG) Car Rental</h1><h2>Reserve a Vehicle</h2>
        <button id="pickupCalendarFocusable" aria-expanded="false">Pick-up Date</button>
        <section id="pickup" hidden><button data-test-id="10/12/2026">10/12/2026</button></section>
        <section id="return-control"></section>
        <label>Pick-up time<select aria-label="Pick-Up Time Selector"><option>10:00 AM</option></select></label>
        <label>Return time<select aria-label="Return Time Selector"><option>10:00 AM</option></select></label>
        <button name="vehicle-filters-trigger">All Vehicles</button>
        <section id="vehicles" hidden><label><input id="SUVs-301-select" type="checkbox">Compact SUV</label>
          <button id="apply">Apply Filter</button></section>
        <button aria-label="Browse Vehicles">Browse Vehicles</button>`);
      const pickupButton = document.querySelector('#pickupCalendarFocusable');
      pickupButton.addEventListener('click', () => {
        pickupButton.setAttribute('aria-expanded', 'true'); document.querySelector('#pickup').hidden = false;
      });
      document.querySelector('[data-test-id="10/12/2026"]').addEventListener('click', () => {
        document.querySelector('#return-control').innerHTML = `<button id="dropoffCalendarFocusable">Return Date</button>
          <section id="dropoff" hidden><button data-test-id="10/19/2026">10/19/2026</button></section>`;
        document.querySelector('#dropoffCalendarFocusable').addEventListener('click', () => {
          document.querySelector('#dropoff').hidden = false;
        });
      });
      document.querySelector('[name="vehicle-filters-trigger"]').addEventListener('click', () => {
        document.querySelector('#vehicles').hidden = false;
      });
      document.querySelector('#apply').addEventListener('click', () => {
        document.querySelector('[name="vehicle-filters-trigger"]').textContent = 'Compact SUV';
        document.querySelector('#vehicles').hidden = true;
      });
      document.querySelector('[aria-label="Browse Vehicles"]').addEventListener('click', () => {
        location.href = 'https://www.enterprise.com/en/reserve.html#car_select';
      });
    }
  };
  document.addEventListener('DOMContentLoaded', mount, {once: true});
})();
"""


def median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


@dataclass
class InteractionBrowser:
    """A Browser Use-managed browser with a deterministic Playwright action layer."""

    browser_use: Browser
    playwright: PlaywrightBrowser
    timing: BrowserTimingRecorder | None = None

    async def page(self) -> Page:
        current_url = await self.browser_use.get_current_page_url()
        pages = [page for context in self.playwright.contexts for page in context.pages]
        matching = [page for page in pages if page.url == current_url]
        if matching:
            return matching[-1]
        if pages:
            return pages[-1]
        raise RuntimeError("Browser Use browser has no Playwright-visible page")


async def close_browser(browser: Browser) -> None:
    close = getattr(browser, "kill", None) or getattr(browser, "stop", None)
    if close is not None:
        await close()


async def _evaluate_raw(browser: InteractionBrowser, body: str) -> Any:
    page = await browser.browser_use.must_get_current_page()
    source = f"() => JSON.stringify((() => {{ {body} }})())"
    encoded = await page.evaluate(source)
    return json.loads(encoded)


@asynccontextmanager
async def timed_step(
    browser: InteractionBrowser,
    kind: str,
    label: str,
    details: dict[str, Any] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    outcome: dict[str, Any] = {}
    token = (
        await browser.timing.begin_step(kind, label, details)
        if browser.timing is not None
        else None
    )
    try:
        yield outcome
    except Exception as error:
        if browser.timing is not None and token is not None:
            await browser.timing.end_step(
                token,
                status="failed",
                details=outcome,
                error=f"{type(error).__name__}: {error}",
            )
        raise
    else:
        if browser.timing is not None and token is not None:
            await browser.timing.end_step(token, details=outcome)


async def evaluate(
    browser: InteractionBrowser, body: str, *, label: str = "browser evaluation"
) -> Any:
    async with timed_step(browser, "evaluation", label):
        return await _evaluate_raw(browser, body)


async def wait_for(
    browser: InteractionBrowser,
    predicate: str,
    label: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    async with timed_step(browser, "wait", label) as timing_details:
        deadline = time.perf_counter() + timeout_seconds
        last_state: dict[str, Any] = {}
        polls = 0
        poll_wall_ms = 0.0
        while time.perf_counter() < deadline:
            poll_started = time.perf_counter()
            polls += 1
            try:
                state = await _evaluate_raw(
                    browser,
                    "const text = document.body?.innerText || '';"
                    "return {"
                    f"ready: Boolean({predicate}),"
                    "url: location.href, title: document.title, textLength: text.length,"
                    "text: text.slice(0, 500)"
                    "};",
                )
                last_state = state
                poll_wall_ms += (time.perf_counter() - poll_started) * 1_000
                if state["ready"]:
                    timing_details.update(
                        {
                            "polls": polls,
                            "pollEvaluationWallMs": poll_wall_ms,
                            "finalUrl": state["url"],
                        }
                    )
                    return state
            except Exception as error:
                poll_wall_ms += (time.perf_counter() - poll_started) * 1_000
                last_state = {"error": f"{type(error).__name__}: {error}"}
            await asyncio.sleep(0.05)
        timing_details.update(
            {"polls": polls, "pollEvaluationWallMs": poll_wall_ms}
        )
        raise TimeoutError(f"timed out waiting for {label}: {last_state}")


async def click_selector(
    browser: InteractionBrowser, selector: str, *, label: str | None = None
) -> dict[str, Any]:
    async with timed_step(
        browser,
        "action",
        label or f"click selector {selector}",
        {"action": "click", "selector": selector},
    ) as timing_details:
        page = await browser.page()
        for element in await page.locator(selector).all():
            if await element.is_visible():
                text = (await element.inner_text()).strip() or (
                    await element.get_attribute("aria-label") or ""
                ).strip()
                await element.click()
                result = {"clicked": True, "text": text}
                timing_details.update(result)
                return result
        raise RuntimeError(
            f"selector did not resolve to a visible control: {selector}"
        )


async def click_text(
    browser: InteractionBrowser,
    text: str,
    *,
    selector: str = "button, a, label, [role=button], [role=tab], [role=radio]",
    exact: bool = True,
) -> dict[str, Any]:
    async with timed_step(
        browser,
        "action",
        f'click "{text}"',
        {"action": "click", "selector": selector, "expectedText": text},
    ) as timing_details:
        page = await browser.page()
        expected = " ".join(text.split())
        for element in await page.locator(selector).all():
            if not await element.is_visible():
                continue
            actual = " ".join((await element.inner_text()).split())
            if actual == expected or (not exact and actual.startswith(expected)):
                await element.click()
                result = {"clicked": True, "text": actual}
                timing_details.update(result)
                return result
        raise RuntimeError(f"visible browser control not found: {text}")


async def select_option(
    browser: InteractionBrowser,
    selector: str,
    value: str,
    *,
    label: str | None = None,
) -> None:
    async with timed_step(
        browser,
        "action",
        label or f'select "{value}" in {selector}',
        {"action": "select", "selector": selector, "value": value},
    ) as timing_details:
        page = await browser.page()
        for element in await page.locator(selector).all():
            if await element.is_visible():
                selected = await element.select_option(value=value)
                if value not in selected:
                    raise RuntimeError(f"could not select {value!r} in {selector}")
                timing_details["selected"] = selected
                return
        raise RuntimeError(f"select did not resolve to a visible control: {selector}")


async def navigate(
    browser: InteractionBrowser,
    url: str,
    timeout_seconds: float,
    *,
    label: str | None = None,
) -> None:
    async with timed_step(
        browser,
        "navigation",
        label or f"navigate to {url}",
        {"url": url},
    ):
        await asyncio.wait_for(
            browser.browser_use.navigate_to(url), timeout=timeout_seconds
        )


async def pause(browser: InteractionBrowser, seconds: float, label: str) -> None:
    async with timed_step(
        browser, "pause", label, {"requestedMs": seconds * 1_000}
    ):
        await asyncio.sleep(seconds)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


async def research_flights(
    browser: InteractionBrowser, args: argparse.Namespace
) -> dict[str, Any]:
    await navigate(
        browser,
        FLIGHTS_URL,
        args.navigation_timeout_seconds,
        label="load Google Flights results",
    )
    await wait_for(
        browser,
        "text.includes('results returned.') && text.includes('SFO') && text.includes('OGG')",
        "Google Flights results",
        args.action_timeout_seconds,
    )
    await click_text(browser, "Stops", selector="button")
    await wait_for(
        browser,
        "text.includes('Nonstop only')",
        "Flights stops filter",
        args.action_timeout_seconds,
    )
    await click_text(browser, "Nonstop only", selector="label, [role=radio]")
    await pause(browser, 0.2, "allow Flights nonstop filter to settle")
    await click_selector(
        browser,
        'button[aria-label="Close dialog"]',
        label="close Flights stops dialog",
    )
    await click_text(browser, "Cheapest", selector="[role=tab]", exact=False)
    await wait_for(
        browser,
        "text.includes('Nonstop') && /\\$[0-9,]+/.test(text)",
        "filtered Flights fares",
        args.action_timeout_seconds,
    )
    facts = await evaluate(
        browser,
        "const text = document.body?.innerText || '';"
        "const results = text.slice(text.indexOf('Search results'));"
        "const prices = [...results.matchAll(/\\$[0-9,]+/g)].map(match => match[0]);"
        "return {route: 'SFO-OGG', lowestDisplayedPrice: prices[0] || null, "
        "priceSamples: [...new Set(prices)].slice(0, 3), nonstop: results.includes('Nonstop')};",
        label="extract filtered flight facts",
    )
    require(facts["nonstop"] and facts["lowestDisplayedPrice"], "invalid flight facts")
    return {"actions": 4, "facts": facts}


async def research_airbnb(
    browser: InteractionBrowser, args: argparse.Namespace
) -> dict[str, Any]:
    await navigate(
        browser,
        AIRBNB_URL,
        args.navigation_timeout_seconds,
        label="load Airbnb Wailea results",
    )
    await wait_for(
        browser,
        "text.includes('homes in Wailea') && text.includes('for 7 nights')",
        "Airbnb search results",
        args.action_timeout_seconds,
    )
    consent = await evaluate(
        browser,
        "const modal = [...document.querySelectorAll('[data-testid=modal-container]')]"
        ".find(element => element.getClientRects().length);"
        "if (!modal) return {present: false, dismissed: false};"
        "const buttons = [...modal.querySelectorAll('button')].filter(element => "
        "element.getClientRects().length);"
        "const button = buttons.find(element => "
        "/only necessary|reject all|decline|continue without accepting/i.test("
        "(element.innerText || '').trim())) || buttons.find(element => "
        "(element.getAttribute('aria-label') || '').trim().toLowerCase() === 'close');"
        "if (button) button.click();"
        "return {present: true, dismissed: Boolean(button), "
        "text: (modal.innerText || '').slice(0, 500), "
        "buttons: buttons.map(element => (element.innerText || "
        "element.getAttribute('aria-label') || '').trim()).filter(Boolean)};",
        label="inspect and dismiss Airbnb consent modal",
    )
    if consent["present"]:
        require(
            consent["dismissed"],
            f"unsupported Airbnb modal blocked the search controls: {consent}",
        )
        await wait_for(
            browser,
            "![...document.querySelectorAll('[data-testid=modal-container]')]"
            ".some(element => element.getClientRects().length)",
            "dismissed Airbnb modal",
            args.action_timeout_seconds,
        )
    await click_selector(
        browser,
        '[role="checkbox"][aria-label="Free cancellation"]',
        label="enable Airbnb free cancellation",
    )
    await wait_for(
        browser,
        "document.querySelector('[role=checkbox][aria-label=\"Free cancellation\"]')"
        "?.getAttribute('aria-checked') === 'true' && "
        "location.href.includes('flexible_cancellation=true')",
        "Airbnb cancellation filter",
        args.action_timeout_seconds,
    )
    await wait_for(
        browser,
        "Boolean(document.querySelector('[data-testid=card-container] "
        'a[href*="/rooms/"]\'))',
        "filtered Airbnb listing cards",
        args.action_timeout_seconds,
    )
    card = await evaluate(
        browser,
        "const card = [...document.querySelectorAll('[data-testid=card-container]')]"
        ".find(element => element.getClientRects().length);"
        "const link = card?.querySelector('a[href*=\"/rooms/\"]');"
        "if (!card || !link) return {found: false};"
        "return {found: true, summary: (card.innerText || '').slice(0, 700), href: link.href};",
        label="inspect first filtered Airbnb listing",
    )
    require(card["found"], "Airbnb did not expose a filtered listing")
    click = await evaluate(
        browser,
        "const card = [...document.querySelectorAll('[data-testid=card-container]')]"
        ".find(element => element.getClientRects().length);"
        "const link = card?.querySelector('a[href*=\"/rooms/\"]');"
        "if (!link) return {clicked: false};"
        "link.target = '_self'; link.click(); return {clicked: true};",
        label="open Airbnb listing detail",
    )
    require(click["clicked"], "Airbnb listing click failed")
    await wait_for(
        browser,
        "location.pathname.startsWith('/rooms/') && "
        "text.includes('Hosted by') && text.includes('bedroom')",
        "Airbnb listing detail",
        args.action_timeout_seconds,
    )
    facts = await evaluate(
        browser,
        "const text = document.body?.innerText || '';"
        "const title = [...document.querySelectorAll('h1')].find(element => "
        "element.getClientRects().length)?.innerText?.trim() || null;"
        "const rating = text.match(/Rated ([0-9.]+) out of 5/)?.[1] || null;"
        "return {title, rating, filteredCard: "
        + json.dumps(card["summary"])
        + ", url: location.href};",
        label="extract Airbnb listing facts",
    )
    require(facts["title"] and facts["rating"], "invalid Airbnb listing facts")
    return {"actions": 2, "facts": facts}


async def research_hotels(
    browser: InteractionBrowser, args: argparse.Namespace
) -> dict[str, Any]:
    await navigate(
        browser,
        HOTELS_URL,
        args.navigation_timeout_seconds,
        label="load Google Hotels Wailea results",
    )
    await wait_for(
        browser,
        "/Wailea\\s*·\\s*[0-9,]+ results/.test(text) && text.includes('View prices')",
        "Google Hotels results",
        args.action_timeout_seconds,
    )
    await click_text(browser, "4+ rating", selector="button")
    await pause(browser, 0.25, "allow Google Hotels rating filter to settle")
    await click_text(browser, "Pool", selector="button")
    await wait_for(
        browser,
        "text.includes('All filters (2)')",
        "Google Hotels quick filters",
        args.action_timeout_seconds,
    )
    await click_text(browser, "Sort by", selector="button")
    await wait_for(
        browser,
        "text.includes('Lowest price') && text.includes('Highest rating')",
        "Google Hotels sort choices",
        args.action_timeout_seconds,
    )
    await click_text(browser, "Lowest price", selector="label, [role=radio], div")
    await wait_for(
        browser,
        "text.includes('Showing results 1 -') && text.includes('Outdoor pool')",
        "sorted Google Hotels results",
        args.action_timeout_seconds,
    )
    facts = await evaluate(
        browser,
        "const text = document.body?.innerText || '';"
        "const marker = text.match(/Wailea\\s*·\\s*[0-9,]+ results/);"
        "const results = marker ? text.slice(marker.index + marker[0].length) : text;"
        "const lines = results.split('\\n').map(line => line.trim()).filter(Boolean);"
        "const priceIndex = lines.findIndex(line => /^\\$[0-9,]+$/.test(line));"
        "const property = lines.slice(Math.max(0, priceIndex - 6), priceIndex)"
        ".reverse().find(line => !/^(DEAL|GREAT DEAL|GREAT PRICE|VACATION RENTAL|"
        "SPONSORED)$/i.test(line) && !/^[0-9]+%/.test(line));"
        "return {property: property || null, "
        "price: priceIndex >= 0 ? lines[priceIndex] : null, "
        "poolFilter: text.includes('All filters (2)'), resultCount: marker?.[0] || null};",
        label="extract filtered Google Hotels facts",
    )
    require(
        facts["property"] and facts["price"] and facts["poolFilter"],
        "invalid hotel facts",
    )
    return {"actions": 4, "facts": facts}


async def research_grand_wailea(
    browser: InteractionBrowser, args: argparse.Namespace
) -> dict[str, Any]:
    await navigate(
        browser,
        GRAND_WAILEA_URL,
        args.navigation_timeout_seconds,
        label="load Grand Wailea home page",
    )
    await wait_for(
        browser,
        "text.includes('Grand Wailea') && "
        "Boolean(document.querySelector('a[href=\"/stay/rooms-suites\"]'))",
        "Grand Wailea home page",
        args.action_timeout_seconds,
    )
    await evaluate(
        browser,
        "const reject = [...document.querySelectorAll('button')].find(element => "
        "(element.innerText || '').trim() === 'Reject All Cookies');"
        "if (reject) reject.click(); return {dismissed: Boolean(reject)};",
        label="dismiss Grand Wailea cookie banner",
    )
    rooms_click = await evaluate(
        browser,
        "const link = [...document.querySelectorAll('a[href=\"/stay/rooms-suites\"]')]"
        ".find(element => element.getClientRects().length);"
        "if (!link) return {clicked: false}; link.click(); return {clicked: true};",
        label="open Grand Wailea room catalog",
    )
    require(rooms_click["clicked"], "Grand Wailea rooms link was unavailable")
    await wait_for(
        browser,
        "location.pathname === '/stay/rooms-suites' && "
        "Boolean(document.querySelector('select[name=category]'))",
        "Grand Wailea room catalog",
        args.action_timeout_seconds,
    )
    await select_option(
        browser,
        "select[name=category]",
        "4",
        label="select Grand Wailea room category",
    )
    await pause(browser, 0.2, "allow Grand Wailea category filter to settle")
    await select_option(
        browser,
        "select[name=view]",
        "11",
        label="select Grand Wailea ocean view",
    )
    await wait_for(
        browser,
        "[...document.querySelectorAll('h3')].some(element => "
        "element.getClientRects().length && element.innerText.includes('Ocean View'))",
        "filtered Grand Wailea rooms",
        args.action_timeout_seconds,
    )
    room = await evaluate(
        browser,
        "const heading = [...document.querySelectorAll('h3')].find(element => "
        "element.getClientRects().length && element.innerText.includes('Ocean View'));"
        "const card = heading?.closest('article');"
        "const link = [...(card?.querySelectorAll('a') || [])].find(element => "
        "(element.innerText || '').trim().toLowerCase() === 'view this room');"
        "if (!heading || !card || !link) return {found: false};"
        "return {found: true, name: heading.innerText.trim(), summary: "
        "(card.innerText || '').slice(0, 600), href: link.href};",
        label="inspect filtered Grand Wailea room",
    )
    require(room["found"], "Grand Wailea filtered room was unavailable")
    room_click = await evaluate(
        browser,
        "const link = [...document.querySelectorAll('a')].find(element => "
        "element.getClientRects().length && "
        "(element.innerText || '').trim().toLowerCase() === 'view this room');"
        "if (!link) return {clicked: false}; link.click(); return {clicked: true};",
        label="open Grand Wailea room detail",
    )
    require(room_click["clicked"], "Grand Wailea room detail link was unavailable")
    await wait_for(
        browser,
        "text.includes('Amenities') && text.includes('SQ.FT.') && "
        "text.includes('PRIVATE LĀNAI')",
        "Grand Wailea room detail",
        args.action_timeout_seconds,
    )
    facts = await evaluate(
        browser,
        "const text = document.body?.innerText || '';"
        "return {name: "
        + json.dumps(room["name"])
        + ", squareFeet: text.match(/([0-9,]+) SQ\\.FT\\./)?.[1] || null, "
        "sleeps: text.match(/SLEEPS(?: SLEEPS)? ([0-9]+)/)?.[1] || null, url: location.href};",
        label="extract Grand Wailea room facts",
    )
    require(facts["squareFeet"] and facts["sleeps"], "invalid Grand Wailea facts")
    return {"actions": 4, "facts": facts}


async def research_enterprise(
    browser: InteractionBrowser, args: argparse.Namespace
) -> dict[str, Any]:
    await navigate(
        browser,
        ENTERPRISE_URL,
        args.navigation_timeout_seconds,
        label="load Enterprise Kahului reservation form",
    )
    await wait_for(
        browser,
        "Boolean(document.querySelector('#pickupCalendarFocusable')) && "
        "text.includes('Kahului Airport (OGG)')",
        "Enterprise reservation form",
        args.action_timeout_seconds,
    )
    await evaluate(
        browser,
        "document.querySelector('#onetrust-accept-btn-handler')?.click();"
        "document.querySelector('.login-curtain')?.click();"
        "return {dismissed: true};",
        label="dismiss Enterprise consent and login overlays",
    )
    await pause(browser, 0.25, "allow Enterprise overlays to close")
    await wait_for(
        browser,
        "Boolean(document.querySelector('#pickupCalendarFocusable'))",
        "Enterprise form after consent dismissal",
        args.action_timeout_seconds,
    )
    await click_selector(
        browser, "#pickupCalendarFocusable", label="open Enterprise pickup calendar"
    )
    await wait_for(
        browser,
        "document.querySelector('#pickupCalendarFocusable')"
        "?.getAttribute('aria-expanded') === 'true'",
        "open Enterprise pickup calendar",
        args.action_timeout_seconds,
    )
    if not (
        await evaluate(
            browser,
            "return {visible: Boolean(document.querySelector("
            "'[data-test-id=\"10/12/2026\"]'))};",
            label="check whether Enterprise October pickup date is visible",
        )
    )["visible"]:
        await click_selector(
            browser,
            'button[aria-label="Next Month"]',
            label="advance Enterprise pickup calendar",
        )
    await wait_for(
        browser,
        "Boolean(document.querySelector('[data-test-id=\"10/12/2026\"]'))",
        "Enterprise October pickup date",
        args.action_timeout_seconds,
    )
    await click_selector(
        browser,
        '[data-test-id="10/12/2026"]',
        label="select Enterprise pickup date",
    )
    await wait_for(
        browser,
        "Boolean(document.querySelector('#dropoffCalendarFocusable'))",
        "Enterprise return date control",
        args.action_timeout_seconds,
    )
    await click_selector(
        browser, "#dropoffCalendarFocusable", label="open Enterprise return calendar"
    )
    await wait_for(
        browser,
        "Boolean(document.querySelector('[data-test-id=\"10/19/2026\"]'))",
        "Enterprise October return date",
        args.action_timeout_seconds,
    )
    await click_selector(
        browser,
        '[data-test-id="10/19/2026"]',
        label="select Enterprise return date",
    )
    await select_option(
        browser,
        'select[aria-label="Pick-Up Time Selector"]',
        "10:00 AM",
        label="select Enterprise pickup time",
    )
    await select_option(
        browser,
        'select[aria-label="Return Time Selector"]',
        "10:00 AM",
        label="select Enterprise return time",
    )
    await click_selector(
        browser,
        'button[name="vehicle-filters-trigger"]',
        label="open Enterprise vehicle filters",
    )
    await wait_for(
        browser,
        "Boolean(document.querySelector('#SUVs-301-select'))",
        "Enterprise vehicle filter",
        args.action_timeout_seconds,
    )
    await click_selector(
        browser, "#SUVs-301-select", label="select Enterprise compact SUV"
    )
    await wait_for(
        browser,
        "document.querySelector('#SUVs-301-select')?.checked === true",
        "Enterprise compact SUV selection",
        args.action_timeout_seconds,
    )
    await click_selector(
        browser,
        "#apply, .ReactModal__Content button:last-of-type",
        label="apply Enterprise vehicle filter",
    )
    await wait_for(
        browser,
        "(() => {"
        "const modal = document.querySelector('.ReactModal__Content');"
        "const trigger = document.querySelector('button[name=\"vehicle-filters-trigger\"]');"
        "const checkbox = document.querySelector('#SUVs-301-select');"
        "return (!modal || !modal.getClientRects().length) && "
        "(!checkbox || trigger?.innerText.toLowerCase().includes('compact suv'));"
        "})()",
        "applied Enterprise compact SUV filter",
        args.action_timeout_seconds,
    )
    await click_selector(
        browser,
        'button[aria-label="Browse Vehicles"]',
        label="browse Enterprise vehicles",
    )
    await wait_for(
        browser,
        "location.hash === '#car_select' && "
        "text.toLowerCase().includes('choose a vehicle class') && "
        "text.toLowerCase().includes('compact suv') && "
        "text.toLowerCase().includes('hyundai kona or similar') && "
        "text.toLowerCase().includes('oct 12') && "
        "text.toLowerCase().includes('oct 19') && "
        "/\\$\\s*[0-9]+\\s*\\.[0-9]{2}/.test("
        "text.slice(text.toLowerCase().indexOf('compact suv')))",
        "Enterprise vehicle availability",
        args.action_timeout_seconds,
    )
    facts = await evaluate(
        browser,
        "const text = document.body?.innerText || '';"
        "const start = text.toLowerCase().indexOf('compact suv');"
        "const compact = text.slice(start, start + 1000);"
        "const lines = compact.split('\\n').map(line => line.trim()).filter(Boolean);"
        "const vehicle = lines.find(line => line.toLowerCase() === 'compact suv') || null;"
        "const example = lines.find(line => /or similar/i.test(line)) || null;"
        "return {vehicle, example, "
        "priceSample: compact.match(/\\$\\s*([0-9,]+)\\s*\\.([0-9]{2})/)"
        "?.slice(1).join('.') || null, "
        "datesPresent: text.toLowerCase().includes('oct 12') && "
        "text.toLowerCase().includes('oct 19'), url: location.href};",
        label="extract Enterprise vehicle facts",
    )
    require(
        facts["vehicle"] and facts["priceSample"] and facts["datesPresent"],
        f"invalid Enterprise availability facts: {facts}",
    )
    return {"actions": 10, "facts": facts}


RESEARCHERS: list[
    tuple[
        str,
        Callable[[InteractionBrowser, argparse.Namespace], Awaitable[dict[str, Any]]],
    ]
] = [
    ("flights", research_flights),
    ("airbnb", research_airbnb),
    ("hotels", research_hotels),
    ("grand_wailea", research_grand_wailea),
    ("enterprise", research_enterprise),
]


async def configure_network(browser: Browser, args: argparse.Namespace) -> None:
    session = await browser.get_or_create_cdp_session()
    send = session.cdp_client.send_raw
    await send("Network.enable", {}, session_id=session.session_id)
    await send(
        "Network.emulateNetworkConditions",
        {
            "offline": False,
            "latency": args.latency_ms,
            "downloadThroughput": args.download_mbps * 1_000_000 / 8,
            "uploadThroughput": args.download_mbps * 1_000_000 / 8,
            "connectionType": "wifi",
        },
        session_id=session.session_id,
    )


async def configure_proa_proxy(browser: PlaywrightBrowser) -> None:
    if not browser.contexts:
        raise RuntimeError("Browser Use did not expose a browser context")
    context = browser.contexts[0]

    async def block_site_javascript(route: Any) -> None:
        if route.request.resource_type == "document":
            upstream = await route.fetch(timeout=35_000)
            upstream_html = await upstream.text()
            scriptless_html = re.sub(
                r"<script\b[^>]*>[\s\S]*?</script\s*>",
                "",
                upstream_html,
                flags=re.IGNORECASE,
            )
            headers = {
                name: value
                for name, value in upstream.headers.items()
                if name.lower()
                not in {
                    "content-encoding",
                    "content-length",
                    "content-security-policy",
                    "content-security-policy-report-only",
                }
            }
            await route.fulfill(
                status=upstream.status,
                headers=headers,
                content_type="text/html; charset=utf-8",
                body=scriptless_html,
            )
        elif route.request.resource_type == "script":
            await route.abort()
        else:
            await route.continue_()

    await context.route("**/*", block_site_javascript)
    await context.add_init_script(script=PROA_PROXY_SCRIPT)


async def run_once(
    index: int,
    args: argparse.Namespace,
    researchers: list[
        tuple[
            str,
            Callable[
                [InteractionBrowser, argparse.Namespace], Awaitable[dict[str, Any]]
            ],
        ]
    ],
    mode: str,
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
    playwright_browser = await playwright.chromium.connect_over_cdp(browser_use.cdp_url)
    if mode == "proa-proxy":
        await configure_proa_proxy(playwright_browser)
    browser = InteractionBrowser(browser_use, playwright_browser)
    await configure_network(browser_use, args)
    if args.detailed_timings:
        browser.timing = await BrowserTimingRecorder.create(
            playwright_browser,
            await browser.page(),
            javascript_coverage=args.javascript_coverage,
        )
    started = time.perf_counter()
    surfaces: list[dict[str, Any]] = []
    timing: dict[str, Any] | None = None
    try:
        for name, researcher in researchers:
            surface_started = time.perf_counter()
            if browser.timing is not None:
                await browser.timing.start_surface(name)
            try:
                result = await researcher(browser, args)
                record = {
                    "surface": name,
                    "status": "completed",
                    "elapsedMs": (time.perf_counter() - surface_started) * 1000,
                    **result,
                }
            except Exception as error:
                record = {
                    "surface": name,
                    "status": "failed",
                    "elapsedMs": (time.perf_counter() - surface_started) * 1000,
                    "error": f"{type(error).__name__}: {error}",
                }
            if browser.timing is not None:
                await browser.timing.end_surface(record["status"])
            surfaces.append(record)
            print(
                "TRAVEL_INTERACTION_SURFACE "
                + json.dumps({"run": index + 1, **record}, separators=(",", ":"))
            )
            if record["status"] != "completed" and args.fail_fast:
                break
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000
        if browser.timing is not None:
            timing = await browser.timing.finish()
        if mode == "proa-proxy":
            for context in playwright_browser.contexts:
                await context.unroute_all(behavior="ignoreErrors")
        await close_browser(browser_use)
        await playwright.stop()
    record = {
        "run": index + 1,
        "mode": mode,
        "elapsedMs": elapsed_ms,
        "completedSurfaces": sum(
            1 for surface in surfaces if surface["status"] == "completed"
        ),
        "actions": sum(surface.get("actions", 0) for surface in surfaces),
        "surfaces": surfaces,
    }
    if timing is not None:
        record["timing"] = timing
    return record


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--mode", choices=("current", "proa-proxy"), default="current")
    parser.add_argument("--latency-ms", type=float, default=40)
    parser.add_argument("--download-mbps", type=float, default=100)
    parser.add_argument("--no-chromium-sandbox", action="store_true")
    parser.add_argument(
        "--detailed-timings",
        action="store_true",
        help="capture per-step Chrome CPU counters and every resource request",
    )
    parser.add_argument(
        "--javascript-coverage",
        action="store_true",
        help="capture main-renderer V8 source coverage (requires detailed timings)",
    )
    parser.add_argument("--navigation-timeout-seconds", type=float, default=35)
    parser.add_argument("--action-timeout-seconds", type=float, default=30)
    parser.add_argument(
        "--fail-fast", action=argparse.BooleanOptionalAction, default=True
    )
    parser.add_argument(
        "--surfaces",
        default="all",
        help="all or a comma-separated list of flights, airbnb, hotels, grand_wailea, enterprise",
    )
    parser.add_argument(
        "--chrome",
        default=os.environ.get(
            "AGENT_TRAVEL_CHROME",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
    )
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be at least 1")
    if args.latency_ms < 0:
        parser.error("--latency-ms must be non-negative")
    if args.download_mbps <= 0:
        parser.error("--download-mbps must be greater than 0")
    if args.detailed_timings and not args.output:
        parser.error("--detailed-timings requires --output")
    if args.javascript_coverage and not args.detailed_timings:
        parser.error("--javascript-coverage requires --detailed-timings")
    selected = (
        {name for name, _ in RESEARCHERS}
        if args.surfaces == "all"
        else {name.strip() for name in args.surfaces.split(",") if name.strip()}
    )
    unknown = selected - {name for name, _ in RESEARCHERS}
    if unknown:
        raise SystemExit(f"unknown surfaces: {', '.join(sorted(unknown))}")
    researchers = [entry for entry in RESEARCHERS if entry[0] in selected]
    if not researchers:
        raise SystemExit("at least one surface is required")

    logging.getLogger("browser_use").setLevel(logging.WARNING)
    print(
        "TRAVEL_INTERACTION_CONFIG "
        + json.dumps(
            {
                "runs": args.runs,
                "mode": args.mode,
                "latencyMs": args.latency_ms,
                "downloadMbps": args.download_mbps,
                "surfaces": [name for name, _ in researchers],
                "llmCalls": 0,
                "detailedTimings": args.detailed_timings,
                "javascriptCoverage": args.javascript_coverage,
            },
            separators=(",", ":"),
        )
    )
    runs = []
    for index in range(args.runs):
        record = await run_once(index, args, researchers, args.mode)
        runs.append(record)
        console_record = {key: value for key, value in record.items() if key != "timing"}
        print(
            "TRAVEL_INTERACTION_RUN "
            + json.dumps(console_record, separators=(",", ":"))
        )

    successful = [run for run in runs if run["completedSurfaces"] == len(researchers)]
    summary = {
        "mode": args.mode,
        "runs": args.runs,
        "successfulRuns": len(successful),
        "workflowP50Ms": median([run["elapsedMs"] for run in successful]),
        "actionsP50": median([float(run["actions"]) for run in successful]),
        "surfaceP50Ms": {
            name: median(
                [
                    surface["elapsedMs"]
                    for run in successful
                    for surface in run["surfaces"]
                    if surface["surface"] == name
                ]
            )
            for name, _ in researchers
        },
    }
    print(f"TRAVEL_INTERACTION_RESULT {json.dumps(summary, separators=(',', ':'))}")
    if args.output:
        Path(args.output).write_text(
            json.dumps(
                {
                    "capturedAt": datetime.now(UTC).isoformat(),
                    "config": {
                        "runs": args.runs,
                        "mode": args.mode,
                        "latencyMs": args.latency_ms,
                        "downloadMbps": args.download_mbps,
                        "surfaces": [name for name, _ in researchers],
                        "llmCalls": 0,
                        "detailedTimings": args.detailed_timings,
                        "javascriptCoverage": args.javascript_coverage,
                    },
                    "runs": runs,
                    "summary": summary,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    if len(successful) != args.runs:
        raise SystemExit("at least one interaction workflow failed")


if __name__ == "__main__":
    asyncio.run(main())
