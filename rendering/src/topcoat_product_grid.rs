//! Product-grid workload derived from Topcoat's own `topcoat-view` benchmark.
//!
//! Upstream source (Topcoat 0.3.1):
//! <https://github.com/tokio-rs/topcoat/blob/topcoat-view-v0.3.1/crates/topcoat-view/benches/render.rs>
//!
//! The Topcoat implementation preserves the upstream component structure and
//! data generator. The Proa implementation emits byte-identical HTML directly
//! so the benchmark can distinguish cached-view serialization from full
//! request-time view construction and rendering.

use proa_core::shared::attr_value::AttrValue;
use proa_core::{text, WebContext, WebRenderSync, WriteBuf, WriteError};
use proa_macros::html_sync;
use topcoat::{
    context::Cx,
    view::{component, view, View},
    Result,
};

/// Heroicons solid star path used by Topcoat's upstream benchmark.
pub(crate) const STAR_PATH: &str = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.363-1.118l-2.8-2.034c-.784-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

/// Product data shape used by Topcoat's upstream product-grid benchmark.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Product {
    pub id: u32,
    pub name: String,
    pub category: String,
    pub price_cents: u32,
    pub rating_tenths: u32,
    pub review_count: u32,
}

/// Generate the same deterministic products as Topcoat's upstream benchmark.
pub fn make_products(count: usize) -> Vec<Product> {
    const CATEGORIES: [&str; 3] = ["Audio", "Displays", "Wearables"];

    (0..count)
        .map(|i| {
            let n = u32::try_from(i).unwrap_or_default();
            Product {
                id: 1000 + n,
                name: format!("Meridian \"Model {i}\" & Co."),
                category: CATEGORIES[i % CATEGORIES.len()].to_string(),
                price_cents: 1999 + (n % 40) * 500,
                rating_tenths: 30 + (n % 20),
                review_count: 3 + (n * 7) % 400,
            }
        })
        .collect()
}

pub(crate) fn format_price(cents: u32) -> String {
    format!("${}.{:02}", cents / 100, cents % 100)
}

pub(crate) fn format_rating(tenths: u32) -> String {
    format!("{}.{}", tenths / 10, tenths % 10)
}

// ---------------------------------------------------------------------------
// Topcoat implementation, preserving the upstream benchmark structure.
// ---------------------------------------------------------------------------

#[component]
async fn topcoat_rating_stars(tenths: u32) -> Result {
    let filled = (tenths + 5) / 10;

    view! {
        <div class="flex">
            for index in 0..5u32 {
                <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    class=(if index < filled {
                        "h-4 w-4 text-amber-400"
                    } else {
                        "h-4 w-4 text-slate-200"
                    })
                >
                    <path d=(STAR_PATH)></path>
                </svg>
            }
        </div>
    }
}

#[component]
async fn topcoat_product_card(product: &Product) -> Result {
    view! {
        <a
            href=(format!("/products/{}", product.id))
            class="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
        >
            <div
                class="mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300"
            >
                (&product.category)
            </div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                (&product.category)
            </p>
            <h3
                class="mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600"
            >
                (&product.name)
            </h3>
            <div class="mt-2 flex items-center gap-1">
                topcoat_rating_stars(tenths: product.rating_tenths)
                <span class="text-xs text-slate-500">
                    (format_rating(product.rating_tenths))
                    " ("
                    (product.review_count)
                    ")"
                </span>
            </div>
            <p class="mt-3 text-lg font-bold">(format_price(product.price_cents))</p>
        </a>
    }
}

async fn topcoat_product_grid(cx: &Cx, products: &[Product]) -> Result {
    view! {
        cx =>
        <main class="mx-auto w-full max-w-6xl px-4 py-10">
            <h1 class="text-2xl font-bold tracking-tight">"All products"</h1>
            <div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                for product in products {
                    topcoat_product_card(product: product)
                }
            </div>
        </main>
    }
}

/// Build Topcoat's intermediate product-grid view.
#[inline]
pub fn build_topcoat_view(cx: &Cx, products: &[Product]) -> View {
    futures::executor::block_on(topcoat_product_grid(cx, products))
        .expect("Topcoat product-grid view should build")
}

/// Build and serialize a complete Topcoat product grid.
#[inline]
pub fn render_topcoat(cx: &Cx, products: &[Product]) -> String {
    build_topcoat_view(cx, products).render(cx)
}

// ---------------------------------------------------------------------------
// Proa byte-identical implementation.
// ---------------------------------------------------------------------------

/// Proa's direct-render product grid.
#[derive(Clone, Copy)]
pub struct ProaProductGrid<'a> {
    products: &'a [Product],
}

impl<'a> ProaProductGrid<'a> {
    pub const fn new(products: &'a [Product]) -> Self {
        Self { products }
    }
}

impl<B: WriteBuf, L: proa_core::DataLoader> WebRenderSync<L, B> for ProaProductGrid<'_> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        html_sync! {
            <main class="mx-auto w-full max-w-6xl px-4 py-10">
                <h1 class="text-2xl font-bold tracking-tight">"All products"</h1>
                <div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                    {ProaProductCards { products: self.products }}
                </div>
            </main>
        }
        .render(cx)
    }
}

/// The product cards alone, without the page chrome, so a streamed panel can
/// carry exactly the markup the canonical grid emits.
pub struct ProaProductCards<'a> {
    pub products: &'a [Product],
}

impl<B: WriteBuf, L: proa_core::DataLoader> WebRenderSync<L, B> for ProaProductCards<'_> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        for product in self.products {
            ProaProductCard { product }.render(cx)?;
        }
        Ok(())
    }
}

struct ProaProductCard<'a> {
    product: &'a Product,
}

impl<B: WriteBuf, L: proa_core::DataLoader> WebRenderSync<L, B> for ProaProductCard<'_> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let product = self.product;

        html_sync! {
            <a
                href={ProductUrl(product.id)}
                class="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
                <div class="mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300">
                    {text(&product.category)}
                </div>
                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {text(&product.category)}
                </p>
                <h3 class="mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600">
                    {text(&product.name)}
                </h3>
                <div class="mt-2 flex items-center gap-1">
                    {ProaRatingStars(product.rating_tenths)}
                    <span class="text-xs text-slate-500">
                        {Rating(product.rating_tenths)}
                        " ("
                        {product.review_count}
                        ")"
                    </span>
                </div>
                <p class="mt-3 text-lg font-bold">{Price(product.price_cents)}</p>
            </a>
        }
        .render(cx)
    }
}

struct ProaRatingStars(u32);

// proa-perf-ok(scope): this byte-exact cross-framework fixture emits trusted
// static SVG chrome and chooses the only dynamic class from two constants.
impl<B: WriteBuf, L: proa_core::DataLoader> WebRenderSync<L, B> for ProaRatingStars {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let filled = (self.0 + 5) / 10;
        cx.out.extend(b"<div class=\"flex\">")?;
        for index in 0..5u32 {
            let class = if index < filled {
                "h-4 w-4 text-amber-400"
            } else {
                "h-4 w-4 text-slate-200"
            };
            // Proa normally serializes empty SVG paths as `<path .../>`.
            // Topcoat emits an explicit closing tag, so spell out this static
            // fragment to keep the cross-framework fixture byte-identical.
            cx.out.extend(
                b"<svg viewBox=\"0 0 20 20\" fill=\"currentColor\" aria-hidden=\"true\" class=\"",
            )?;
            cx.out.extend(class.as_bytes())?;
            cx.out.extend(b"\"><path d=\"")?;
            cx.out.extend(STAR_PATH.as_bytes())?;
            cx.out.extend(b"\"></path></svg>")?;
        }
        cx.out.extend(b"</div>")
    }
}

struct ProductUrl(u32);

impl AttrValue for ProductUrl {
    #[inline(always)]
    fn should_render(&self) -> bool {
        true
    }

    #[inline]
    fn render_attr_value<B: WriteBuf, L: proa_core::DataLoader>(
        &self,
        cx: &mut WebContext<L, B>,
    ) -> Result<(), WriteError> {
        cx.out.extend(b"/products/")?;
        self.0.render(cx)
    }
}

struct Rating(u32);

impl<B: WriteBuf, L: proa_core::DataLoader> WebRenderSync<L, B> for Rating {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        (self.0 / 10).render(cx)?;
        cx.out.extend(b".")?;
        (self.0 % 10).render(cx)
    }
}

struct Price(u32);

impl<B: WriteBuf, L: proa_core::DataLoader> WebRenderSync<L, B> for Price {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        cx.out.extend(b"$")?;
        (self.0 / 100).render(cx)?;
        cx.out.extend(b".")?;
        let cents = self.0 % 100;
        cx.out
            .extend(&[b'0' + (cents / 10) as u8, b'0' + (cents % 10) as u8])
    }
}

/// Render a Proa product grid into a newly allocated `String`.
pub fn render_proa(products: &[Product]) -> String {
    proa_core::render_to_string(ProaProductGrid::new(products))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_grid_outputs_match_byte_for_byte() {
        let cx = Cx::default();
        for count in [0, 1, 12, 96] {
            let products = make_products(count);
            assert_eq!(render_topcoat(&cx, &products), render_proa(&products));
        }
    }
}
