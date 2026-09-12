#!/usr/bin/env python3
"""Render the p50 browser workflow as an SVG Gantt chart."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape


WIDTH = 1280
HEIGHT = 650
LEFT = 174
RIGHT = 28
PLOT_WIDTH = WIDTH - LEFT - RIGHT
MAX_SECONDS = 65.0


def x(milliseconds: float) -> float:
    return LEFT + milliseconds / 1_000 / MAX_SECONDS * PLOT_WIDTH


def seconds(milliseconds: float) -> str:
    return f"{milliseconds / 1_000:.2f} s"


def short_label(step: dict[str, Any]) -> str | None:
    label = step["label"]
    labels = (
        ("load Airbnb", "initial navigation"),
        ("load Google Hotels", "initial navigation"),
        ("load Grand Wailea", "initial navigation"),
        ("load Enterprise", "initial navigation"),
        ('click "Lowest price"', "sort refresh"),
        ("Airbnb listing detail", "listing detail wait"),
        ("Enterprise form after", "form readiness wait"),
        ("Enterprise vehicle availability", "vehicle results wait"),
        ("Grand Wailea room detail", "room detail wait"),
    )
    for needle, replacement in labels:
        if needle in label:
            return replacement
    return None


def render(summary: dict[str, Any]) -> str:
    current = summary["current"]
    proxy = summary["proaProxy"]
    surfaces = current["surfaces"]
    steps_by_surface: dict[str, list[dict[str, Any]]] = {
        surface["surface"]: [] for surface in surfaces
    }
    for step in current["steps"]:
        steps_by_surface[step["surface"]].append(step)

    surface_offsets: dict[str, float] = {}
    cursor = 0.0
    for surface in surfaces:
        surface_offsets[surface["surface"]] = cursor
        cursor += float(surface["durationMsP50"])

    out = [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" '
        'aria-labelledby="timing-title timing-desc">',
        '<title id="timing-title">Measured current-site browser workflow timeline</title>',
        '<desc id="timing-desc">Five sequential travel website surfaces take 62.75 seconds at p50. The largest waits are Grand Wailea initial navigation and Enterprise vehicle results. A complete-HTML proxy takes 10.35 seconds on the same scale.</desc>',
        "<style>",
        ":root{--bg:#fff;--fg:#24211d;--muted:#716a61;--grid:#ded8cf;"
        "--track:#eee9e1;--nav:#dd7627;--wait:#8759c7;--action:#25845f;"
        "--eval:#3675b7;--pause:#9a938a;--proxy:#d78a4a;--proxy-alt:#e8b17f}",
        "@media(prefers-color-scheme:dark){:root{--bg:#171513;--fg:#f2eee8;"
        "--muted:#b7afa5;--grid:#413c36;--track:#2b2723;--nav:#ef9149;"
        "--wait:#ad82e8;--action:#55b98c;--eval:#6da7e1;--pause:#9e978f;"
        "--proxy:#e79a59;--proxy-alt:#b97843}}",
        ".bg{fill:var(--bg)}.fg{fill:var(--fg)}.muted{fill:var(--muted)}"
        ".grid{stroke:var(--grid);stroke-width:1}.track{fill:var(--track)}"
        ".navigation{fill:var(--nav)}.wait{fill:var(--wait)}"
        ".action{fill:var(--action)}.evaluation{fill:var(--eval)}"
        ".pause{fill:var(--pause)}.proxy{fill:var(--proxy)}"
        ".proxy-alt{fill:var(--proxy-alt)}text{font-family:ui-monospace,SFMono-Regular,"
        "Menlo,Consolas,monospace;font-size:12px}.title{font-family:ui-sans-serif,"
        "system-ui,sans-serif;font-size:21px;font-weight:600}.subtitle{font-family:"
        "ui-sans-serif,system-ui,sans-serif;font-size:12px}.site{font-family:"
        "ui-sans-serif,system-ui,sans-serif;font-size:13px;font-weight:600}"
        ".inside{fill:#fff;font-size:10px;font-weight:600}.tiny{font-size:10px}",
        "</style>",
        f'<rect class="bg" width="{WIDTH}" height="{HEIGHT}"/>',
        '<text id="chart-heading" class="title fg" x="18" y="32">Where the 62.75-second workflow went</text>',
        '<text class="subtitle muted" x="18" y="53">Current sites · p50 step offsets and durations · 3 traced trials · 100 Mbps + 40 ms/request</text>',
    ]

    legend = [
        ("navigation", "navigation"),
        ("wait", "readiness/data wait"),
        ("action", "browser action"),
        ("evaluation", "assert/extract"),
        ("pause", "fixed settle"),
    ]
    legend_x = LEFT
    for css_class, label in legend:
        out.append(
            f'<rect class="{css_class}" x="{legend_x}" y="69" width="11" height="11"/>'
        )
        out.append(
            f'<text class="muted tiny" x="{legend_x + 16}" y="79">{escape(label)}</text>'
        )
        legend_x += 118 if css_class != "wait" else 151

    plot_top = 101
    plot_bottom = 514
    for tick in range(0, 66, 5):
        tick_x = x(tick * 1_000)
        out.append(
            f'<line class="grid" x1="{tick_x:.2f}" y1="{plot_top}" x2="{tick_x:.2f}" y2="{plot_bottom}"/>'
        )
        out.append(
            f'<text class="muted tiny" text-anchor="middle" x="{tick_x:.2f}" y="96">{tick}s</text>'
        )

    row_top = 124
    row_gap = 76
    for index, surface in enumerate(surfaces):
        name = surface["surface"]
        y = row_top + index * row_gap
        global_start = surface_offsets[name]
        surface_end = global_start + float(surface["durationMsP50"])
        out.append(f'<text class="site fg" x="18" y="{y + 4}">{escape(name.replace("_", " "))}</text>')
        out.append(
            f'<rect class="track" x="{x(global_start):.2f}" y="{y - 13}" '
            f'width="{max(1.0, x(surface_end) - x(global_start)):.2f}" height="20"/>'
        )
        for step in steps_by_surface[name]:
            start = global_start + float(step["offsetMsP50"] or 0.0)
            end = start + float(step["durationMsP50"] or 0.0)
            rect_x = x(start)
            width = max(1.0, x(end) - rect_x)
            cpu = step["browserCpu"]
            title = (
                f'{step["label"]}: wall {seconds(float(step["durationMsP50"]))}; '
                f'JS CPU {seconds(float(cpu["scriptMsP50"] or 0.0))}; '
                f'network active {seconds(float(step["network"]["completedActiveMsP50"] or 0.0))}'
            )
            out.append(
                f'<rect class="{escape(step["kind"])}" x="{rect_x:.2f}" y="{y - 13}" '
                f'width="{width:.2f}" height="20"><title>{escape(title)}</title></rect>'
            )
            label = short_label(step)
            if label and width >= 68:
                out.append(
                    f'<text class="inside" x="{rect_x + 4:.2f}" y="{y + 1}">{escape(label)}</text>'
                )
        documents = [
            document
            for document in current["documents"]
            if document["surface"] == name
        ]
        first_step_label = steps_by_surface[name][0]["label"]
        initial_documents = [
            document
            for document in documents
            if document["initiatingStep"] == first_step_label
        ]
        if not initial_documents and documents:
            initial_documents = [documents[0]]
        initial_html = max(
            (float(document["durationMsP50"] or 0.0) for document in initial_documents),
            default=0.0,
        )
        scripts = surface["network"]["byGroup"]["script"]
        detail = (
            f'HTML response {seconds(initial_html)}  ·  '
            f'script fetch {seconds(float(scripts["completedActiveMsP50"] or 0.0))} active / '
            f'{seconds(float(scripts["completedSpanMsP50"] or 0.0))} span  ·  '
            f'JS CPU {seconds(float(surface["browserCpu"]["scriptMsP50"] or 0.0))}'
        )
        out.append(
            f'<text class="muted tiny" x="{LEFT}" y="{y + 26}">{escape(detail)}</text>'
        )

    proxy_y = 548
    out.append('<text class="site fg" x="18" y="552">Proa proxy</text>')
    proxy_cursor = 0.0
    for index, surface in enumerate(proxy["surfaces"]):
        start = proxy_cursor
        proxy_cursor += float(surface["durationMsP50"])
        rect_x = x(start)
        width = max(1.0, x(proxy_cursor) - rect_x)
        css_class = "proxy" if index % 2 == 0 else "proxy-alt"
        title = f'{surface["surface"]}: {seconds(float(surface["durationMsP50"]))}'
        out.append(
            f'<rect class="{css_class}" x="{rect_x:.2f}" y="{proxy_y - 13}" '
            f'width="{width:.2f}" height="20"><title>{escape(title)}</title></rect>'
        )
    out.append(
        f'<text class="fg tiny" x="{x(proxy_cursor) + 7:.2f}" y="{proxy_y + 1}">10.35 s</text>'
    )

    axis_y = 590
    out.append(
        f'<line class="grid" x1="{LEFT}" y1="{axis_y}" x2="{WIDTH - RIGHT}" y2="{axis_y}"/>'
    )
    for tick in range(0, 66, 5):
        tick_x = x(tick * 1_000)
        out.append(
            f'<line class="grid" x1="{tick_x:.2f}" y1="{axis_y}" x2="{tick_x:.2f}" y2="{axis_y + 5}"/>'
        )
        out.append(
            f'<text class="muted tiny" text-anchor="middle" x="{tick_x:.2f}" y="{axis_y + 20}">{tick}</text>'
        )
    out.append(
        f'<text class="muted" text-anchor="middle" x="{LEFT + PLOT_WIDTH / 2:.2f}" y="{axis_y + 40}">elapsed workflow time (seconds)</text>'
    )
    out.append(
        '<text class="muted tiny" x="18" y="638">Independent p50s; step bars are sequential workflow phases. Network and CPU measurements overlap these bars.</text>'
    )
    out.append("</svg>")
    return "\n".join(out) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    summary = json.loads(Path(args.summary).read_text(encoding="utf-8"))
    Path(args.output).write_text(render(summary), encoding="utf-8")


if __name__ == "__main__":
    main()
