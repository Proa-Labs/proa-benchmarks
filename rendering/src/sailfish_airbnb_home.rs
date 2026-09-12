//! Sailfish implementation of the Airbnb Home page for benchmarking.

use sailfish::TemplateOnce;

pub struct HomeListing {
    pub title: &'static str,
    pub location: &'static str,
    pub price_per_night: u32,
    pub rating: &'static str,
    pub property_type: &'static str,
    pub image: &'static str,
}

pub struct HomeSection {
    pub title: &'static str,
    pub subtitle: &'static str,
    pub listing_indexes: Vec<usize>,
}

pub const SHARED_CSS: &str = proa_showcase::airbnb::shared::SHARED_CSS_RAW;

#[derive(TemplateOnce)]
#[template(path = "airbnb_home.stpl")]
pub struct AirbnbHomePage {
    pub css: &'static str,
    pub listings: Vec<HomeListing>,
    pub homes_sections: Vec<HomeSection>,
    pub experiences_sections: Vec<HomeSection>,
    pub services_sections: Vec<HomeSection>,
}

impl AirbnbHomePage {
    pub fn default_la() -> Self {
        Self {
            css: SHARED_CSS,
            listings: vec![
                HomeListing {
                    title: "Harbor Point House",
                    location: "Harbor Point, Coast County",
                    price_per_night: 350,
                    rating: "4.92",
                    property_type: "Entire home",
                    image: "/images/synthetic/property-room.svg",
                },
                HomeListing {
                    title: "Cedar City Studio",
                    location: "Cedar City, Coast County",
                    price_per_night: 185,
                    rating: "4.87",
                    property_type: "Entire guest suite",
                    image: "/images/synthetic/property-deck.svg",
                },
                HomeListing {
                    title: "North Harbor Villa",
                    location: "North Harbor, Coast County",
                    price_per_night: 520,
                    rating: "4.95",
                    property_type: "Entire villa",
                    image: "/images/synthetic/property-coast.svg",
                },
                HomeListing {
                    title: "Pine Valley Cabin",
                    location: "Pine Valley, Coast County",
                    price_per_night: 210,
                    rating: "4.89",
                    property_type: "Entire cabin",
                    image: "/images/synthetic/property-coast.svg",
                },
                HomeListing {
                    title: "River Junction Loft",
                    location: "River Junction, Coast County",
                    price_per_night: 275,
                    rating: "4.78",
                    property_type: "Entire loft",
                    image: "/images/synthetic/property-deck.svg",
                },
                HomeListing {
                    title: "Harbor Point Tiny Suite",
                    location: "Harbor Point, Coast County",
                    price_per_night: 295,
                    rating: "4.80",
                    property_type: "Tiny home",
                    image: "/images/synthetic/property-room.svg",
                },
            ],
            homes_sections: vec![
                HomeSection {
                    title: "Popular homes in Coast County",
                    subtitle: "",
                    listing_indexes: vec![0, 1, 2, 3, 4, 5, 0],
                },
                HomeSection {
                    title: "Featured hotels in Coast County",
                    subtitle: "A collection of independent and handpicked hotels",
                    listing_indexes: vec![2, 4, 1, 5, 3, 0, 2],
                },
                HomeSection {
                    title: "Stay by the coast in Harbor Point",
                    subtitle: "Ocean-facing stays with relaxed design details",
                    listing_indexes: vec![5, 0, 1, 4, 2, 3, 5],
                },
            ],
            experiences_sections: vec![
                HomeSection {
                    title: "Book experiences led by locals",
                    subtitle: "Design-minded activities around Coast County",
                    listing_indexes: vec![1, 3, 5, 0, 2, 4, 1],
                },
                HomeSection {
                    title: "Food, movement, and culture",
                    subtitle: "Small-group experiences with polished presentation",
                    listing_indexes: vec![4, 2, 0, 5, 1, 3, 4],
                },
            ],
            services_sections: vec![
                HomeSection {
                    title: "Services for your stay",
                    subtitle: "Private chefs, photography, and wellness add-ons",
                    listing_indexes: vec![2, 5, 3, 1, 4, 0, 2],
                },
                HomeSection {
                    title: "Top-rated service pros nearby",
                    subtitle: "Curated services that fit the Coast Stays flow",
                    listing_indexes: vec![3, 0, 4, 1, 5, 2, 3],
                },
            ],
        }
    }

    /// Compute pricing copy for a rail card based on the mode.
    pub fn rail_card_copy(mode: &str, listing: &HomeListing) -> (&'static str, String) {
        match mode {
            "experiences" => (
                "Hosted experience",
                format!("From ${} per guest", listing.price_per_night / 2 + 42),
            ),
            "services" => (
                "Professional service",
                format!("From ${} per visit", listing.price_per_night / 2 + 65),
            ),
            _ => (
                listing.property_type,
                format!("${} for 2 nights", listing.price_per_night * 2),
            ),
        }
    }
}

pub fn render() -> String {
    AirbnbHomePage::default_la()
        .render_once()
        .expect("template render failed")
}
