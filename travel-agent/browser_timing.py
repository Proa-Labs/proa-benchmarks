"""Low-overhead browser timing capture for the travel-agent benchmark.

The recorder intentionally keeps wall time, network activity, and browser CPU
as overlapping dimensions. Adding them together would double-count intervals
where Chrome downloads resources while its main thread is busy.
"""

from __future__ import annotations

import asyncio
import statistics
import time
from collections.abc import Iterable
from typing import Any

from playwright.async_api import Browser as PlaywrightBrowser
from playwright.async_api import BrowserContext, CDPSession, Page, Request


PERFORMANCE_METRICS = (
    "NavigationStart",
    "ScriptDuration",
    "TaskDuration",
    "LayoutDuration",
    "RecalcStyleDuration",
    "LayoutCount",
    "RecalcStyleCount",
)

DOCUMENT_RESPONSE_HEADERS = (
    "age",
    "cache-control",
    "cf-cache-status",
    "content-encoding",
    "content-length",
    "content-type",
    "server",
    "server-timing",
    "transfer-encoding",
    "via",
    "x-cache",
)

DOCUMENT_STALL_THRESHOLD_MS = 50.0


def interval_union_ms(intervals: Iterable[tuple[float, float]]) -> float:
    """Return the union of possibly overlapping half-open millisecond spans."""

    ordered = sorted((start, end) for start, end in intervals if end > start)
    if not ordered:
        return 0.0
    total = 0.0
    current_start, current_end = ordered[0]
    for start, end in ordered[1:]:
        if start <= current_end:
            current_end = max(current_end, end)
            continue
        total += current_end - current_start
        current_start, current_end = start, end
    return total + current_end - current_start


def disjoint_coverage_ranges(
    nested_ranges: Iterable[dict[str, Any]],
) -> list[tuple[int, int]]:
    """Convert nested V8 coverage ranges into used, non-overlapping spans."""

    points: list[tuple[int, int, int, dict[str, Any]]] = []
    for coverage_range in nested_ranges:
        start = int(coverage_range["startOffset"])
        end = int(coverage_range["endOffset"])
        length = end - start
        points.append((start, 0, -length, coverage_range))
        points.append((end, 1, length, coverage_range))
    points.sort(key=lambda point: (point[0], -point[1], point[2]))

    hit_count_stack: list[int] = []
    results: list[tuple[int, int]] = []
    last_offset = 0
    for offset, point_type, _, coverage_range in points:
        if hit_count_stack and last_offset < offset and hit_count_stack[-1] > 0:
            if results and results[-1][1] == last_offset:
                results[-1] = (results[-1][0], offset)
            else:
                results.append((last_offset, offset))
        last_offset = offset
        if point_type == 0:
            hit_count_stack.append(int(coverage_range.get("count") or 0))
        elif hit_count_stack:
            hit_count_stack.pop()
    return [(start, end) for start, end in results if end - start > 1]


def _resource_group(resource_type: str) -> str:
    normalized = resource_type.lower()
    if normalized == "document":
        return "document"
    if normalized == "script":
        return "script"
    if normalized in {"fetch", "xhr"}:
        return "api"
    if normalized in {"stylesheet", "font"}:
        return "styleFont"
    if normalized in {"image", "media"}:
        return "imageMedia"
    return "other"


def _duration(start: float | int | None, end: float | int | None) -> float | None:
    if start is None or end is None or start < 0 or end < 0 or end < start:
        return None
    return float(end - start)


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def summarize_document_chunks(
    transfer: dict[str, Any],
    *,
    stall_threshold_ms: float = DOCUMENT_STALL_THRESHOLD_MS,
) -> dict[str, Any]:
    """Summarize how a main-frame document's bytes arrived after first byte.

    Chrome's `Network.dataReceived` callbacks are delivery observations rather
    than transport packets. Gaps are nevertheless useful for separating a
    continuously transferred response from an origin- or proxy-paced tail.
    """

    response_start_ms = transfer.get("responseStartMs")
    end_ms = transfer.get("endMs")
    chunks = sorted(
        transfer.get("chunks", []), key=lambda chunk: float(chunk["timestampMs"])
    )
    tail_ms = _duration(response_start_ms, end_ms)
    if response_start_ms is None or end_ms is None:
        return {
            "tailMs": tail_ms,
            "chunkCount": len(chunks),
            "chunksAfterWireFinish": 0,
            "maxDecodedDeliveryLagMs": None,
            "decodedBytes": sum(int(chunk.get("dataLength") or 0) for chunk in chunks),
            "encodedChunkBytes": sum(
                int(chunk.get("encodedDataLength") or 0) for chunk in chunks
            ),
            "firstChunkDelayMs": None,
            "lastChunkToEndMs": None,
            "medianGapMs": None,
            "p95GapMs": None,
            "maxGapMs": None,
            "stallThresholdMs": stall_threshold_ms,
            "stallCount": 0,
            "stallMs": 0.0,
            "largestGaps": [],
        }

    wire_chunks = [
        chunk for chunk in chunks if float(chunk["timestampMs"]) <= float(end_ms)
    ]
    post_finish_chunks = [
        chunk for chunk in chunks if float(chunk["timestampMs"]) > float(end_ms)
    ]
    intervals: list[dict[str, Any]] = []
    previous_ms = float(response_start_ms)
    decoded_before = 0
    encoded_before = 0
    for index, chunk in enumerate(wire_chunks):
        timestamp_ms = float(chunk["timestampMs"])
        intervals.append(
            {
                "kind": "headers-to-first-chunk" if index == 0 else "between-chunks",
                "startMs": previous_ms,
                "endMs": timestamp_ms,
                "durationMs": max(0.0, timestamp_ms - previous_ms),
                "decodedBytesBefore": decoded_before,
                "encodedBytesBefore": encoded_before,
            }
        )
        decoded_before += int(chunk.get("dataLength") or 0)
        encoded_before += int(chunk.get("encodedDataLength") or 0)
        previous_ms = timestamp_ms
    intervals.append(
        {
            "kind": "last-chunk-to-finish" if wire_chunks else "headers-to-finish",
            "startMs": previous_ms,
            "endMs": float(end_ms),
            "durationMs": max(0.0, float(end_ms) - previous_ms),
            "decodedBytesBefore": decoded_before,
            "encodedBytesBefore": encoded_before,
        }
    )
    gaps = [float(interval["durationMs"]) for interval in intervals]
    stalls = [
        interval
        for interval in intervals
        if float(interval["durationMs"]) >= stall_threshold_ms
    ]
    return {
        "tailMs": tail_ms,
        "chunkCount": len(chunks),
        "chunksBeforeWireFinish": len(wire_chunks),
        "chunksAfterWireFinish": len(post_finish_chunks),
        "maxDecodedDeliveryLagMs": (
            max(
                float(chunk["timestampMs"]) - float(end_ms)
                for chunk in post_finish_chunks
            )
            if post_finish_chunks
            else 0.0
        ),
        "decodedBytes": sum(int(chunk.get("dataLength") or 0) for chunk in chunks),
        "decodedBytesBeforeWireFinish": decoded_before,
        "encodedChunkBytes": sum(
            int(chunk.get("encodedDataLength") or 0) for chunk in chunks
        ),
        "encodedChunkBytesBeforeWireFinish": encoded_before,
        "firstChunkDelayMs": (
            max(
                0.0,
                float(wire_chunks[0]["timestampMs"]) - float(response_start_ms),
            )
            if wire_chunks
            else None
        ),
        "lastChunkToEndMs": (
            max(0.0, float(end_ms) - float(wire_chunks[-1]["timestampMs"]))
            if wire_chunks
            else tail_ms
        ),
        "medianGapMs": statistics.median(gaps) if gaps else None,
        "p95GapMs": _percentile(gaps, 0.95),
        "maxGapMs": max(gaps, default=None),
        "stallThresholdMs": stall_threshold_ms,
        "stallCount": len(stalls),
        "stallMs": sum(float(interval["durationMs"]) for interval in stalls),
        "largestGaps": sorted(
            intervals, key=lambda interval: float(interval["durationMs"]), reverse=True
        )[:10],
    }


def _clip_interval(
    resource: dict[str, Any], start_ms: float, end_ms: float
) -> tuple[float, float] | None:
    start = max(start_ms, float(resource["startMs"]))
    end = min(end_ms, float(resource["endMs"]))
    return (start, end) if end > start else None


def summarize_resources(
    resources: list[dict[str, Any]], start_ms: float, end_ms: float
) -> dict[str, Any]:
    """Summarize request activity overlapping one step or surface.

    `activeMs` is a union, while `summedRequestMs` intentionally counts
    parallel requests separately. `spanMs` covers discovery gaps between the
    first request start and last response end. These answer different questions
    and must not be treated as interchangeable.
    """

    overlapping = [
        resource
        for resource in resources
        if _clip_interval(resource, start_ms, end_ms) is not None
    ]
    by_group: dict[str, Any] = {}
    for group in (
        "document",
        "script",
        "api",
        "styleFont",
        "imageMedia",
        "other",
    ):
        selected = [
            resource
            for resource in overlapping
            if _resource_group(resource["resourceType"]) == group
        ]
        intervals = [
            clipped
            for resource in selected
            if (clipped := _clip_interval(resource, start_ms, end_ms)) is not None
        ]
        started = [
            resource
            for resource in selected
            if start_ms <= float(resource["startMs"]) < end_ms
        ]
        completed = [resource for resource in started if not resource["incomplete"]]
        completed_overlapping = [
            resource for resource in selected if not resource["incomplete"]
        ]
        completed_intervals = [
            clipped
            for resource in completed_overlapping
            if (clipped := _clip_interval(resource, start_ms, end_ms)) is not None
        ]
        first_start = min((interval[0] for interval in intervals), default=None)
        last_end = max((interval[1] for interval in intervals), default=None)
        first_completed_start = min(
            (interval[0] for interval in completed_intervals), default=None
        )
        last_completed_end = max(
            (interval[1] for interval in completed_intervals), default=None
        )
        by_group[group] = {
            "requestsStarted": len(started),
            "requestsOverlapping": len(selected),
            "completedRequestsStarted": len(completed),
            "responseBodyBytes": sum(
                max(0, int(resource.get("responseBodyBytes") or 0))
                for resource in completed
            ),
            "activeMs": interval_union_ms(intervals),
            "completedActiveMs": interval_union_ms(completed_intervals),
            "spanMs": (
                last_end - first_start
                if first_start is not None and last_end is not None
                else 0.0
            ),
            "summedRequestMs": sum(end - start for start, end in intervals),
            "completedSpanMs": (
                last_completed_end - first_completed_start
                if first_completed_start is not None
                and last_completed_end is not None
                else 0.0
            ),
            "completedSummedRequestMs": sum(
                end - start for start, end in completed_intervals
            ),
        }
    all_intervals = [
        clipped
        for resource in overlapping
        if (clipped := _clip_interval(resource, start_ms, end_ms)) is not None
    ]
    completed_all_intervals = [
        clipped
        for resource in overlapping
        if not resource["incomplete"]
        and (clipped := _clip_interval(resource, start_ms, end_ms)) is not None
    ]
    return {
        "requestsStarted": sum(
            1
            for resource in overlapping
            if start_ms <= float(resource["startMs"]) < end_ms
        ),
        "requestsOverlapping": len(overlapping),
        "activeMs": interval_union_ms(all_intervals),
        "completedActiveMs": interval_union_ms(completed_all_intervals),
        "byGroup": by_group,
    }


class BrowserTimingRecorder:
    """Record browser operations, resource waterfalls, and Chrome CPU counters."""

    def __init__(
        self,
        context: BrowserContext,
        page: Page,
        cdp: CDPSession,
        *,
        origin_perf_ms: float,
        origin_epoch_ms: float,
        main_frame_id: str,
        javascript_coverage: bool,
    ) -> None:
        self.context = context
        self.page = page
        self.cdp = cdp
        self.origin_perf_ms = origin_perf_ms
        self.origin_epoch_ms = origin_epoch_ms
        self.main_frame_id = main_frame_id
        self.javascript_coverage = javascript_coverage
        self.steps: list[dict[str, Any]] = []
        self.resources: list[dict[str, Any]] = []
        self.document_transfers: list[dict[str, Any]] = []
        self.surfaces: list[dict[str, Any]] = []
        self.current_surface: str | None = None
        self.active_step_id: int | None = None
        self._surface_start_ms: float | None = None
        self._open_requests: dict[Request, dict[str, Any]] = {}
        self._finished_requests: set[Request] = set()
        self._open_document_transfers: dict[str, dict[str, Any]] = {}
        self._coverage_scripts: dict[str, dict[str, Any]] = {}
        self._javascript_coverage_entries: list[dict[str, Any]] = []
        self._coverage_active = False
        self._pending: set[asyncio.Task[None]] = set()
        self._next_step_id = 1

    @classmethod
    async def create(
        cls,
        browser: PlaywrightBrowser,
        page: Page,
        *,
        javascript_coverage: bool = False,
    ) -> BrowserTimingRecorder:
        if not browser.contexts:
            raise RuntimeError("timing recorder requires a Playwright browser context")
        origin_perf_ms = time.perf_counter() * 1_000
        origin_epoch_ms = time.time() * 1_000
        context = browser.contexts[0]
        cdp = await context.new_cdp_session(page)
        await cdp.send("Performance.enable", {"timeDomain": "timeTicks"})
        await cdp.send("Page.enable")
        await cdp.send("Network.enable")
        frame_tree = await cdp.send("Page.getFrameTree")
        main_frame_id = str(frame_tree["frameTree"]["frame"]["id"])
        recorder = cls(
            context,
            page,
            cdp,
            origin_perf_ms=origin_perf_ms,
            origin_epoch_ms=origin_epoch_ms,
            main_frame_id=main_frame_id,
            javascript_coverage=javascript_coverage,
        )
        context.on("request", recorder._on_request)
        context.on("requestfinished", recorder._on_request_finished)
        context.on("requestfailed", recorder._on_request_failed)
        cdp.on("Network.requestWillBeSent", recorder._on_cdp_request)
        cdp.on("Network.responseReceived", recorder._on_cdp_response)
        cdp.on("Network.dataReceived", recorder._on_cdp_data)
        cdp.on("Network.loadingFinished", recorder._on_cdp_finished)
        cdp.on("Network.loadingFailed", recorder._on_cdp_failed)
        if javascript_coverage:
            cdp.on("Debugger.scriptParsed", recorder._on_script_parsed)
            await cdp.send("Debugger.enable")
            await cdp.send("Debugger.setSkipAllPauses", {"skip": True})
        return recorder

    def now_ms(self) -> float:
        return time.perf_counter() * 1_000 - self.origin_perf_ms

    def _cdp_event_ms(
        self, transfer: dict[str, Any], timestamp_seconds: float | int
    ) -> float:
        return float(transfer["startMs"]) + (
            float(timestamp_seconds) - float(transfer["startTimestamp"])
        ) * 1_000

    def _filtered_response_headers(self, headers: dict[str, Any]) -> dict[str, str]:
        normalized = {str(name).lower(): str(value) for name, value in headers.items()}
        return {
            name: normalized[name]
            for name in DOCUMENT_RESPONSE_HEADERS
            if name in normalized
        }

    def _finish_document_transfer(
        self,
        request_id: str,
        *,
        timestamp: float | int,
        outcome: str,
        encoded_data_length: float | int | None = None,
        error_text: str | None = None,
    ) -> None:
        transfer = self._open_document_transfers.pop(request_id, None)
        if transfer is None:
            return
        transfer["endMs"] = self._cdp_event_ms(transfer, timestamp)
        transfer["finishObservedMs"] = self.now_ms()
        transfer["outcome"] = outcome
        transfer["loadingFinishedEncodedBytes"] = (
            int(encoded_data_length) if encoded_data_length is not None else None
        )
        transfer["error"] = error_text
        transfer["chunkSummary"] = summarize_document_chunks(transfer)
        self.document_transfers.append(transfer)

    def _on_cdp_request(self, event: dict[str, Any]) -> None:
        request_id = str(event["requestId"])
        existing = self._open_document_transfers.get(request_id)
        if existing is not None:
            redirect_response = event.get("redirectResponse") or {}
            existing["response"] = {
                "status": redirect_response.get("status"),
                "mimeType": redirect_response.get("mimeType"),
                "protocol": redirect_response.get("protocol"),
                "connectionReused": redirect_response.get("connectionReused"),
                "remoteIPAddress": redirect_response.get("remoteIPAddress"),
                "remotePort": redirect_response.get("remotePort"),
                "headers": self._filtered_response_headers(
                    redirect_response.get("headers") or {}
                ),
                "timing": redirect_response.get("timing"),
            }
            self._finish_document_transfer(
                request_id,
                timestamp=event["timestamp"],
                outcome="redirect",
                encoded_data_length=redirect_response.get("encodedDataLength"),
            )

        if (
            str(event.get("type") or "").lower() != "document"
            or str(event.get("frameId") or "") != self.main_frame_id
        ):
            return
        request = event.get("request") or {}
        wall_time = event.get("wallTime")
        start_ms = (
            float(wall_time) * 1_000 - self.origin_epoch_ms
            if wall_time is not None
            else self.now_ms()
        )
        self._open_document_transfers[request_id] = {
            "requestId": request_id,
            "surface": self.current_surface,
            "initiatingStepId": self.active_step_id,
            "url": request.get("url"),
            "method": request.get("method"),
            "initialPriority": request.get("initialPriority"),
            "startMs": start_ms,
            "startTimestamp": float(event["timestamp"]),
            "responseStartMs": None,
            "response": None,
            "chunks": [],
        }

    def _on_cdp_response(self, event: dict[str, Any]) -> None:
        transfer = self._open_document_transfers.get(str(event["requestId"]))
        if transfer is None:
            return
        response = event.get("response") or {}
        transfer["responseStartMs"] = self._cdp_event_ms(
            transfer, event["timestamp"]
        )
        transfer["responseObservedMs"] = self.now_ms()
        transfer["response"] = {
            "status": response.get("status"),
            "mimeType": response.get("mimeType"),
            "protocol": response.get("protocol"),
            "connectionReused": response.get("connectionReused"),
            "remoteIPAddress": response.get("remoteIPAddress"),
            "remotePort": response.get("remotePort"),
            "fromDiskCache": response.get("fromDiskCache"),
            "fromPrefetchCache": response.get("fromPrefetchCache"),
            "fromServiceWorker": response.get("fromServiceWorker"),
            "encodedDataLengthAtHeaders": response.get("encodedDataLength"),
            "headers": self._filtered_response_headers(response.get("headers") or {}),
            "timing": response.get("timing"),
        }

    def _on_cdp_data(self, event: dict[str, Any]) -> None:
        transfer = self._open_document_transfers.get(str(event["requestId"]))
        if transfer is None:
            return
        transfer["chunks"].append(
            {
                "timestampMs": self._cdp_event_ms(transfer, event["timestamp"]),
                "observedMs": self.now_ms(),
                "dataLength": int(event.get("dataLength") or 0),
                "encodedDataLength": int(event.get("encodedDataLength") or 0),
            }
        )

    def _on_cdp_finished(self, event: dict[str, Any]) -> None:
        self._finish_document_transfer(
            str(event["requestId"]),
            timestamp=event["timestamp"],
            outcome="finished",
            encoded_data_length=event.get("encodedDataLength"),
        )

    def _on_cdp_failed(self, event: dict[str, Any]) -> None:
        self._finish_document_transfer(
            str(event["requestId"]),
            timestamp=event["timestamp"],
            outcome="failed",
            error_text=event.get("errorText"),
        )

    def _on_script_parsed(self, event: dict[str, Any]) -> None:
        url = str(event.get("url") or "")
        if not url:
            return
        self._coverage_scripts[str(event["scriptId"])] = {
            "url": url,
            "surface": self.current_surface,
            "parsedMs": self.now_ms(),
            "sourceCharacters": int(event.get("length") or 0),
        }

    async def _start_javascript_coverage(self) -> None:
        if not self.javascript_coverage:
            return
        await self.cdp.send("Profiler.enable")
        await self.cdp.send(
            "Profiler.startPreciseCoverage",
            {"callCount": True, "detailed": True},
        )
        self._coverage_active = True

    async def _stop_javascript_coverage(self, surface: str) -> None:
        if not self._coverage_active:
            return
        try:
            profile = await self.cdp.send("Profiler.takePreciseCoverage")
        finally:
            await asyncio.gather(
                self.cdp.send("Profiler.stopPreciseCoverage"),
                self.cdp.send("Profiler.disable"),
                return_exceptions=True,
            )
            self._coverage_active = False

        for result in profile.get("result", []):
            metadata = self._coverage_scripts.get(str(result.get("scriptId")))
            if metadata is None or metadata["surface"] != surface:
                continue
            nested_ranges = [
                coverage_range
                for function in result.get("functions", [])
                for coverage_range in function.get("ranges", [])
            ]
            used_ranges = disjoint_coverage_ranges(nested_ranges)
            source_characters = int(metadata["sourceCharacters"])
            if source_characters <= 0:
                source_characters = max(
                    (int(item.get("endOffset") or 0) for item in nested_ranges),
                    default=0,
                )
            used_characters = sum(end - start for start, end in used_ranges)
            self._javascript_coverage_entries.append(
                {
                    **metadata,
                    "sourceCharacters": source_characters,
                    "usedCharacters": min(source_characters, used_characters),
                    "usedPercent": (
                        min(source_characters, used_characters)
                        / source_characters
                        * 100
                        if source_characters
                        else None
                    ),
                    "functionCount": len(result.get("functions", [])),
                }
            )

    async def _finish_javascript_coverage(self) -> dict[str, Any] | None:
        if not self.javascript_coverage:
            return None
        if self._coverage_active and self.current_surface is not None:
            await self._stop_javascript_coverage(self.current_surface)
        await asyncio.gather(
            self.cdp.send("Debugger.disable"),
            return_exceptions=True,
        )
        self._javascript_coverage_entries.sort(
            key=lambda entry: (entry["parsedMs"], entry["url"])
        )
        return {
            "scope": "main renderer, URL-bearing parsed scripts; workers excluded",
            "units": "UTF-16 source characters reported by V8",
            "entries": self._javascript_coverage_entries,
        }

    async def _metrics(self) -> dict[str, float]:
        try:
            response = await self.cdp.send("Performance.getMetrics")
        except Exception:
            return {}
        values = {
            metric["name"]: float(metric["value"])
            for metric in response.get("metrics", [])
            if metric["name"] in PERFORMANCE_METRICS
        }
        return values

    def _on_request(self, request: Request) -> None:
        try:
            frame_url = request.frame.url
            main_frame = request.frame == self.page.main_frame
        except Exception:
            frame_url = None
            main_frame = False
        self._open_requests[request] = {
            "callbackStartMs": self.now_ms(),
            "surface": self.current_surface,
            "initiatingStepId": self.active_step_id,
            "mainFrame": main_frame,
            "frameUrl": frame_url,
        }

    def _schedule_request(self, request: Request, outcome: str) -> None:
        task = asyncio.create_task(self._record_request(request, outcome))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

    def _on_request_finished(self, request: Request) -> None:
        self._schedule_request(request, "finished")

    def _on_request_failed(self, request: Request) -> None:
        self._schedule_request(request, "failed")

    async def _record_request(self, request: Request, outcome: str) -> None:
        if request in self._finished_requests:
            return
        self._finished_requests.add(request)
        try:
            fallback_frame_url = request.frame.url
            fallback_main_frame = request.frame == self.page.main_frame
        except Exception:
            fallback_frame_url = None
            fallback_main_frame = False
        state = self._open_requests.get(
            request,
            {
                "callbackStartMs": self.now_ms(),
                "surface": self.current_surface,
                "initiatingStepId": self.active_step_id,
                "mainFrame": fallback_main_frame,
                "frameUrl": fallback_frame_url,
            },
        )
        callback_end_ms = self.now_ms()
        timing = dict(request.timing)
        timing_start_ms = float(timing.get("startTime", 0)) - self.origin_epoch_ms
        response_end = float(timing.get("responseEnd", -1))
        if timing_start_ms < -1_000 or response_end < 0:
            start_ms = float(state["callbackStartMs"])
            end_ms = callback_end_ms
        else:
            start_ms = timing_start_ms
            end_ms = max(start_ms, timing_start_ms + response_end)
        try:
            response = await asyncio.wait_for(request.response(), timeout=1.0)
        except Exception:
            response = None
        try:
            sizes = await asyncio.wait_for(request.sizes(), timeout=1.0)
        except Exception:
            sizes = {}
        self.resources.append(
            {
                "surface": state["surface"],
                "initiatingStepId": state["initiatingStepId"],
                "url": request.url,
                "method": request.method,
                "resourceType": request.resource_type,
                "navigationRequest": request.is_navigation_request(),
                "mainFrame": state["mainFrame"],
                "frameUrl": state["frameUrl"],
                "outcome": outcome,
                "failure": request.failure,
                "status": response.status if response is not None else None,
                "fromServiceWorker": (
                    response.from_service_worker if response is not None else False
                ),
                "startMs": start_ms,
                "endMs": end_ms,
                "durationMs": max(0.0, end_ms - start_ms),
                "requestHeadersBytes": sizes.get("requestHeadersSize"),
                "requestBodyBytes": sizes.get("requestBodySize"),
                "responseHeadersBytes": sizes.get("responseHeadersSize"),
                "responseBodyBytes": sizes.get("responseBodySize"),
                "timing": {
                    "dnsMs": _duration(
                        timing.get("domainLookupStart"),
                        timing.get("domainLookupEnd"),
                    ),
                    "connectMs": _duration(
                        timing.get("connectStart"), timing.get("connectEnd")
                    ),
                    "tlsMs": _duration(
                        timing.get("secureConnectionStart"), timing.get("connectEnd")
                    ),
                    "requestToFirstByteMs": _duration(
                        timing.get("requestStart"), timing.get("responseStart")
                    ),
                    "downloadMs": _duration(
                        timing.get("responseStart"), timing.get("responseEnd")
                    ),
                    "totalMs": (
                        response_end if response_end >= 0 else max(0.0, end_ms - start_ms)
                    ),
                    "raw": timing,
                },
                "incomplete": False,
            }
        )
        self._open_requests.pop(request, None)

    async def start_surface(self, name: str) -> None:
        if self.current_surface is not None:
            raise RuntimeError("cannot start a timing surface while another is active")
        self.current_surface = name
        await self._start_javascript_coverage()
        self._surface_start_ms = self.now_ms()

    async def end_surface(self, status: str) -> None:
        if self.current_surface is None or self._surface_start_ms is None:
            return
        end_ms = self.now_ms()
        await self._stop_javascript_coverage(self.current_surface)
        self.surfaces.append(
            {
                "surface": self.current_surface,
                "status": status,
                "startMs": self._surface_start_ms,
                "endMs": end_ms,
            }
        )
        self.current_surface = None
        self._surface_start_ms = None

    async def begin_step(
        self,
        kind: str,
        label: str,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if self.active_step_id is not None:
            raise RuntimeError("nested timing steps are not supported")
        before_metrics = await self._metrics()
        token = {
            "id": self._next_step_id,
            "surface": self.current_surface,
            "kind": kind,
            "label": label,
            "details": details or {},
            "startMs": self.now_ms(),
            "beforeUrl": self.page.url,
            "_beforeMetrics": before_metrics,
        }
        self._next_step_id += 1
        self.active_step_id = int(token["id"])
        return token

    async def end_step(
        self,
        token: dict[str, Any],
        *,
        status: str = "completed",
        details: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        end_ms = self.now_ms()
        self.active_step_id = None
        after_metrics = await self._metrics()
        before_metrics = token.pop("_beforeMetrics")
        navigation_reset = (
            "NavigationStart" in before_metrics
            and "NavigationStart" in after_metrics
            and abs(
                after_metrics["NavigationStart"] - before_metrics["NavigationStart"]
            )
            > 1e-9
        )
        reset_metrics = [
            name
            for name in PERFORMANCE_METRICS
            if name in before_metrics and name in after_metrics
            and (
                navigation_reset
                or after_metrics.get(name, 0.0) + 1e-12
                < before_metrics.get(name, 0.0)
            )
        ]

        def metric_delta(name: str, *, milliseconds: bool) -> float | None:
            if name not in after_metrics:
                return None
            before = before_metrics.get(name, 0.0)
            after = after_metrics[name]
            delta = after if name in reset_metrics else after - before
            return delta * 1_000 if milliseconds else delta

        merged_details = dict(token["details"])
        if details:
            merged_details.update(details)
        token.update(
            {
                "details": merged_details,
                "endMs": end_ms,
                "durationMs": max(0.0, end_ms - float(token["startMs"])),
                "afterUrl": self.page.url,
                "status": status,
                "error": error,
                "browserCpu": {
                    "scriptMs": metric_delta("ScriptDuration", milliseconds=True),
                    "taskMs": metric_delta("TaskDuration", milliseconds=True),
                    "layoutMs": metric_delta("LayoutDuration", milliseconds=True),
                    "styleMs": metric_delta(
                        "RecalcStyleDuration", milliseconds=True
                    ),
                    "layoutCount": metric_delta("LayoutCount", milliseconds=False),
                    "styleCount": metric_delta(
                        "RecalcStyleCount", milliseconds=False
                    ),
                    "metricsReset": bool(reset_metrics),
                    "resetMetrics": reset_metrics,
                },
            }
        )
        self.steps.append(token)

    async def finish(self) -> dict[str, Any]:
        if self._pending:
            pending_snapshot = tuple(self._pending)
            _, still_pending = await asyncio.wait(pending_snapshot, timeout=2.0)
            for task in still_pending:
                task.cancel()
            if still_pending:
                await asyncio.gather(*still_pending, return_exceptions=True)
        javascript_coverage = await self._finish_javascript_coverage()
        finish_ms = self.now_ms()
        for request_id, transfer in list(self._open_document_transfers.items()):
            transfer["endMs"] = finish_ms
            transfer["outcome"] = "incomplete"
            transfer["loadingFinishedEncodedBytes"] = None
            transfer["error"] = None
            transfer["chunkSummary"] = summarize_document_chunks(transfer)
            self.document_transfers.append(transfer)
            self._open_document_transfers.pop(request_id, None)
        for request, state in list(self._open_requests.items()):
            self.resources.append(
                {
                    "surface": state["surface"],
                    "initiatingStepId": state["initiatingStepId"],
                    "url": request.url,
                    "method": request.method,
                    "resourceType": request.resource_type,
                    "navigationRequest": request.is_navigation_request(),
                    "mainFrame": state["mainFrame"],
                    "frameUrl": state["frameUrl"],
                    "outcome": "incomplete",
                    "failure": request.failure,
                    "status": None,
                    "fromServiceWorker": False,
                    "startMs": float(state["callbackStartMs"]),
                    "endMs": finish_ms,
                    "durationMs": max(
                        0.0, finish_ms - float(state["callbackStartMs"])
                    ),
                    "requestHeadersBytes": None,
                    "requestBodyBytes": None,
                    "responseHeadersBytes": None,
                    "responseBodyBytes": None,
                    "timing": None,
                    "incomplete": True,
                }
            )
        self._open_requests.clear()
        self.resources.sort(key=lambda resource: (resource["startMs"], resource["endMs"]))
        self.document_transfers.sort(
            key=lambda transfer: (transfer["startMs"], transfer["endMs"])
        )
        self.steps.sort(key=lambda step: step["startMs"])
        for step in self.steps:
            step_resources = [
                resource
                for resource in self.resources
                if resource["surface"] == step["surface"]
            ]
            step["network"] = summarize_resources(
                step_resources, float(step["startMs"]), float(step["endMs"])
            )
        enriched_surfaces = []
        for surface in self.surfaces:
            start_ms = float(surface["startMs"])
            end_ms = float(surface["endMs"])
            surface_steps = [
                step for step in self.steps if step["surface"] == surface["surface"]
            ]
            surface_resources = [
                resource
                for resource in self.resources
                if resource["surface"] == surface["surface"]
            ]
            documents = [
                resource
                for resource in surface_resources
                if resource["resourceType"].lower() == "document"
                and resource["mainFrame"]
                and _clip_interval(resource, start_ms, end_ms) is not None
            ]
            cpu_keys = ("scriptMs", "taskMs", "layoutMs", "styleMs")
            cpu = {
                key: sum(
                    float(step["browserCpu"].get(key) or 0.0)
                    for step in surface_steps
                )
                for key in cpu_keys
            }
            enriched_surfaces.append(
                {
                    **surface,
                    "durationMs": max(0.0, end_ms - start_ms),
                    "stepWallMs": sum(float(step["durationMs"]) for step in surface_steps),
                    "browserCpu": cpu,
                    "network": summarize_resources(
                        surface_resources, start_ms, end_ms
                    ),
                    "documents": documents,
                }
            )
        result = {
            "clock": {
                "originEpochMs": self.origin_epoch_ms,
                "originPerfMs": self.origin_perf_ms,
            },
            "durationMs": finish_ms,
            "steps": self.steps,
            "surfaces": enriched_surfaces,
            "resources": self.resources,
            "documentTransfers": self.document_transfers,
        }
        if javascript_coverage is not None:
            result["javascriptCoverage"] = javascript_coverage
        return result
