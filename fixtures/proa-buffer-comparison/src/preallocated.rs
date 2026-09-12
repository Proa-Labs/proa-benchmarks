use proa_core::{WebContext, WebRenderSync};
use proa_showcase::{airbnb, ebay, espn, nike, sentry_otel, settings_console};

#[allow(dead_code)]
mod real_chrome {
    include!(env!("PROA_BUFFER_EBAY_MODULE"));
}

pub fn render(page: &str, capacity: usize) -> String {
    // Capacity is measured before timing; allocation itself happens per render.
    let mut output = Vec::with_capacity(capacity);
    let mut cx = WebContext::with_buffer(&mut output);
    match page {
        "core-cards" => crate::core_cards::SafeTextBenchmarkPage
            .render(&mut cx)
            .unwrap(),
        "core-products" => crate::core_products::ProaProductGrid::new(crate::products())
            .render(&mut cx)
            .unwrap(),
        "core-table" => crate::core_table::DataTablePage {
            rows: crate::table_rows(),
        }
        .render(&mut cx)
        .unwrap(),
        "airbnb-home" => airbnb::home::render_into(&mut cx, &airbnb::home::HomeData::default_la()),
        "airbnb-search" => {
            airbnb::search::render_into(&mut cx, &airbnb::search::SearchData::default_malibu())
        }
        "airbnb-listing" => {
            let data = airbnb::listing::ListingData::malibu();
            let islands = airbnb::listing::build_islands(&data);
            airbnb::listing::render_into(&mut cx, &data, Some(&islands)).unwrap();
        }
        "nike-catalog" => nike::catalog::render_into(&mut cx, &nike::catalog::default_data()),
        "nike-product" => nike::product::render_into(&mut cx, &nike::product::default_data()),
        "ebay-cards" => ebay::srp::ListingsList {
            listings: ebay::srp::default_listings(60),
        }
        .render(&mut cx)
        .unwrap(),
        "ebay-chrome" => {
            let listings = ebay::srp::default_listings(60);
            let meta = ebay::srp_chrome::derive_srp_meta(listings);
            ebay::srp_chrome::SrpDocument {
                query: ebay::srp_chrome::DEFAULT_QUERY,
                meta: &meta,
                per_page: listings.len() as u64,
                river: ebay::srp::ListingsList { listings },
                tail: (),
            }
            .render(&mut cx)
            .unwrap();
        }
        "ebay-real-chrome" => {
            let listings = ebay::srp::default_listings(60);
            real_chrome::RealSrpDocument {
                query: ebay::srp_chrome_real::DEFAULT_QUERY,
                total: 117_406 + listings.len() as u64 * 7,
                river: ebay::srp::ListingsList { listings },
                tail: (),
            }
            .render(&mut cx)
            .unwrap();
        }
        "espn" => espn::render_into(&mut cx, &espn::GAME).unwrap(),
        "sentry-otel" => sentry_otel::render_into(&mut cx, sentry_otel::DEFAULT_ROW_COUNT).unwrap(),
        "settings-console" => settings_console::SettingsConsole {
            audit_events: settings_console::AUDIT_EVENTS,
        }
        .render(&mut cx)
        .unwrap(),
        _ => panic!("unsupported preallocated page {page}"),
    }
    let runtime = if matches!(page, "espn" | "sentry-otel" | "settings-console") {
        Some((cx.rsjs_artifacts_snapshot(), cx.csp_nonce_cloned()))
    } else {
        None
    };
    drop(cx);
    // Match the response owner's UTF-8 policy: render_to_string validates;
    // RenderBuffer::into_string trusts its HTML writer in release builds.
    let mut html = if page.starts_with("core-") || page == "ebay-cards" {
        String::from_utf8(output).expect("renderer produced invalid UTF-8")
    } else {
        debug_assert!(std::str::from_utf8(&output).is_ok());
        // SAFETY: only the same typed HTML renderers and UTF-8 static text used
        // by the standard response owners above write into this vector.
        unsafe { String::from_utf8_unchecked(output) }
    };
    if let Some((artifacts, nonce)) = runtime {
        let plan = rsjs::manifest()
            .page_runtime_plan(artifacts.rendered_islands())
            .unwrap();
        let mut tags = Vec::new();
        plan.write_html(&mut tags, nonce.as_ref()).unwrap();
        let tags = std::str::from_utf8(&tags).unwrap();
        if page == "settings-console" {
            let body_end = html.rfind("</body>").unwrap();
            html.insert_str(body_end, tags);
        } else {
            const END: &str = "</body></html>";
            let body_end = html.strip_suffix(END).unwrap().len();
            html.truncate(body_end);
            html.push_str(tags);
            html.push_str(END);
        }
    }
    html
}
