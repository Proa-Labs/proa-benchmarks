// Canonical React fixtures shared by the timed adapter (suite_bench.mjs) and
// the HTTP page server (page-load/react_server.mjs). Every consumer renders
// exactly these components so the served bytes equal the parity-gated dump.

import { createElement as h } from "react";

import {
  STAR_PATH,
  STATUS_CLASSES,
  buildCardSections,
  buildProducts,
  buildTableRows,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatRating,
} from "../shared/suite_data.mjs";

const TABLE_HEADERS = [
  ["ID", "px-3 py-2 text-left"],
  ["Name", "px-3 py-2 text-left"],
  ["Email", "px-3 py-2 text-left"],
  ["Status", "px-3 py-2 text-left"],
  ["Amount", "px-3 py-2 text-right"],
  ["Tax", "px-3 py-2 text-right"],
  ["Total", "px-3 py-2 text-right"],
  ["Created", "px-3 py-2 text-left"],
  ["Updated", "px-3 py-2 text-left"],
  ["Score", "px-3 py-2 text-right"],
  ["Country", "px-3 py-2 text-left"],
  ["Tags", "px-3 py-2 text-left"],
];

export const sections = buildCardSections();
export const rows = buildTableRows();
export const products = buildProducts();

export function CardPage() {
  return h(
    "html",
    { lang: "en" },
    h(
      "head",
      null,
      h("title", null, "SSR Benchmark Page"),
      h("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      }),
    ),
    h(
      "body",
      null,
      h(
        "header",
        { className: "hero-section" },
        h("h1", { className: "title" }, "SSR Framework Benchmark"),
        h(
          "p",
          { className: "subtitle" },
          "Comparing Proa, Leptos, Dioxus, and Yew",
        ),
      ),
      h(
        "main",
        { className: "main-content" },
        sections.map((section, sectionIndex) =>
          h(
            "section",
            {
              key: sectionIndex,
              className: "card-section",
              "data-section": section.dataSection,
            },
            h("h2", { className: "section-title" }, section.title),
            h(
              "div",
              { className: "card-grid" },
              section.cards.map((card, cardIndex) =>
                h(
                  "article",
                  {
                    key: cardIndex,
                    className: "card",
                    "data-card-id": card.dataCardId,
                  },
                  h(
                    "div",
                    { className: "card-header" },
                    h("img", {
                      src: "/images/benchmark.png",
                      alt: "Benchmark chart",
                      className: "card-image",
                    }),
                  ),
                  h(
                    "div",
                    { className: "card-body" },
                    h("h3", { className: "card-title" }, card.title),
                    h(
                      "p",
                      { className: "card-description" },
                      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
                    ),
                    h(
                      "ul",
                      { className: "feature-list" },
                      card.features.map((feature, featureIndex) =>
                        h(
                          "li",
                          { key: featureIndex, className: "feature-item" },
                          feature,
                        ),
                      ),
                    ),
                    h(
                      "button",
                      { className: "btn-primary", type: "button" },
                      "View Details",
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      h(
        "footer",
        { className: "footer" },
        h("p", null, "Rendered by the SSR benchmark fixture"),
      ),
    ),
  );
}

function TableRow({ row, index }) {
  return h(
    "tr",
    {
      className: index % 2 === 0 ? "bg-white" : "bg-gray-50",
      "data-row-id": row.id,
    },
    h("td", { className: "px-3 py-2 font-mono text-gray-500" }, row.id),
    h("td", { className: "px-3 py-2" }, row.name),
    h("td", { className: "px-3 py-2 text-blue-700" }, row.email),
    h(
      "td",
      { className: "px-3 py-2" },
      h("span", { className: STATUS_CLASSES[row.status] }, row.status),
    ),
    h(
      "td",
      { className: "px-3 py-2 text-right font-mono" },
      formatCurrency(row.amountCents),
    ),
    h(
      "td",
      { className: "px-3 py-2 text-right font-mono text-gray-500" },
      formatCurrency(row.taxCents),
    ),
    h(
      "td",
      { className: "px-3 py-2 text-right font-mono font-semibold" },
      formatCurrency(row.amountCents + row.taxCents),
    ),
    h(
      "td",
      { className: "px-3 py-2 text-gray-600" },
      formatDate(row.createdUnix),
    ),
    h(
      "td",
      { className: "px-3 py-2 text-gray-600" },
      formatDateTime(row.updatedUnix),
    ),
    h(
      "td",
      { className: "px-3 py-2 text-right font-mono" },
      formatPercent(row.scoreBps),
    ),
    h("td", { className: "px-3 py-2" }, row.country),
    h(
      "td",
      { className: "px-3 py-2" },
      row.tags.map((tag, tagIndex) =>
        h(
          "span",
          {
            key: tagIndex,
            className:
              "inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200",
          },
          tag,
        ),
      ),
    ),
  );
}

export function TablePage() {
  return h(
    "html",
    { lang: "en" },
    h(
      "head",
      null,
      h("title", null, "Customer Data Table"),
      h("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      }),
    ),
    h(
      "body",
      { className: "bg-gray-50 text-gray-900" },
      h(
        "header",
        { className: "px-6 py-4 border-b" },
        h("h1", { className: "text-xl font-semibold" }, "Customer Accounts"),
        h(
          "p",
          { className: "text-sm text-gray-600" },
          "Live revenue and account status across all regions.",
        ),
      ),
      h(
        "main",
        { className: "p-6" },
        h(
          "table",
          { className: "min-w-full text-sm border-collapse" },
          h(
            "thead",
            { className: "bg-gray-100" },
            h(
              "tr",
              null,
              TABLE_HEADERS.map(([label, className]) =>
                h("th", { key: label, className }, label),
              ),
            ),
          ),
          h(
            "tbody",
            null,
            rows.map((row, index) =>
              h(TableRow, { key: row.id, row, index }),
            ),
          ),
        ),
      ),
    ),
  );
}

function RatingStars({ ratingTenths }) {
  const filled = Math.floor((ratingTenths + 5) / 10);
  return h(
    "div",
    { className: "flex" },
    Array.from({ length: 5 }, (_, index) =>
      h(
        "svg",
        {
          key: index,
          viewBox: "0 0 20 20",
          fill: "currentColor",
          "aria-hidden": "true",
          className:
            index < filled
              ? "h-4 w-4 text-amber-400"
              : "h-4 w-4 text-slate-200",
        },
        h("path", { d: STAR_PATH }),
      ),
    ),
  );
}

export function ProductCard({ product }) {
  return h(
    "a",
    {
      href: `/products/${product.id}`,
      className:
        "group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md",
    },
    h(
      "div",
      {
        className:
          "mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300",
      },
      product.category,
    ),
    h(
      "p",
      { className: "text-xs font-medium uppercase tracking-wide text-slate-400" },
      product.category,
    ),
    h(
      "h3",
      {
        className:
          "mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600",
      },
      product.name,
    ),
    h(
      "div",
      { className: "mt-2 flex items-center gap-1" },
      h(RatingStars, { ratingTenths: product.ratingTenths }),
      h(
        "span",
        { className: "text-xs text-slate-500" },
        `${formatRating(product.ratingTenths)} (${product.reviewCount})`,
      ),
    ),
    h(
      "p",
      { className: "mt-3 text-lg font-bold" },
      formatPrice(product.priceCents),
    ),
  );
}

export function ProductGrid() {
  return h(
    "main",
    { className: "mx-auto w-full max-w-6xl px-4 py-10" },
    h("h1", { className: "text-2xl font-bold tracking-tight" }, "All products"),
    h(
      "div",
      { className: "mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" },
      products.map((product) =>
        h(ProductCard, { key: product.id, product }),
      ),
    ),
  );
}

export const ROOTS = { cards: CardPage, table: TablePage, products: ProductGrid };
