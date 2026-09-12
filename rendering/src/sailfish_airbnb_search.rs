//! Sailfish implementation of the Airbnb Search page for benchmarking.

use sailfish::TemplateOnce;

pub struct SearchListing {
    pub title: &'static str,
    pub location: &'static str,
    pub price_per_night: u32,
    pub rating: &'static str,
    pub reviews_count: u32,
    pub property_type: &'static str,
    pub beds: u8,
    pub baths: u8,
    pub image: &'static str,
}

pub const SHARED_CSS: &str = proa_showcase::airbnb::shared::SHARED_CSS_RAW;

#[derive(TemplateOnce)]
#[template(path = "airbnb_search.stpl")]
pub struct AirbnbSearchPage {
    pub css: &'static str,
    pub title: &'static str,
    pub subtitle: &'static str,
    pub stay_info: &'static str,
    pub filters: Vec<&'static str>,
    pub listings: Vec<SearchListing>,
}

impl AirbnbSearchPage {
    pub fn default_malibu() -> Self {
        Self {
            css: SHARED_CSS,
            title: "Harbor Point \u{2014} Fictional Stays",
            subtitle: "Entire homes and unique stays",
            stay_info: "Flexible week \u{00b7} 2 guests",
            filters: vec![
                "Price",
                "Type of place",
                "Rooms and beds",
                "Amenities",
                "Book instantly",
            ],
            listings: vec![
                SearchListing {
                    title: "Harbor Point House",
                    location: "Harbor Point, Coast County",
                    price_per_night: 350,
                    rating: "4.92",
                    reviews_count: 128,
                    property_type: "Entire home",
                    beds: 3,
                    baths: 2,
                    image: "/images/synthetic/property-room.svg",
                },
                SearchListing {
                    title: "Cedar City Studio",
                    location: "Cedar City, Coast County",
                    price_per_night: 185,
                    rating: "4.87",
                    reviews_count: 94,
                    property_type: "Entire guest suite",
                    beds: 1,
                    baths: 1,
                    image: "/images/synthetic/property-deck.svg",
                },
                SearchListing {
                    title: "North Harbor Villa",
                    location: "North Harbor, Coast County",
                    price_per_night: 520,
                    rating: "4.95",
                    reviews_count: 67,
                    property_type: "Entire villa",
                    beds: 5,
                    baths: 4,
                    image: "/images/synthetic/property-coast.svg",
                },
                SearchListing {
                    title: "Pine Valley Cabin",
                    location: "Pine Valley, Coast County",
                    price_per_night: 210,
                    rating: "4.89",
                    reviews_count: 156,
                    property_type: "Entire cabin",
                    beds: 2,
                    baths: 1,
                    image: "/images/synthetic/property-coast.svg",
                },
                SearchListing {
                    title: "River Junction Loft",
                    location: "River Junction, Coast County",
                    price_per_night: 275,
                    rating: "4.78",
                    reviews_count: 203,
                    property_type: "Entire loft",
                    beds: 2,
                    baths: 2,
                    image: "/images/synthetic/property-deck.svg",
                },
                SearchListing {
                    title: "Harbor Point Tiny Suite",
                    location: "Harbor Point, Coast County",
                    price_per_night: 295,
                    rating: "4.80",
                    reviews_count: 247,
                    property_type: "Tiny home",
                    beds: 1,
                    baths: 1,
                    image: "/images/synthetic/property-room.svg",
                },
            ],
        }
    }
}

pub fn render() -> String {
    AirbnbSearchPage::default_malibu()
        .render_once()
        .expect("template render failed")
}
