//! Sailfish implementation of the Airbnb Listing page for benchmarking.

use sailfish::TemplateOnce;

pub struct ListingPhoto {
    pub src: &'static str,
    pub alt: &'static str,
}

pub struct ListingHighlight {
    pub title: &'static str,
    pub description: &'static str,
}

pub struct ListingReview {
    pub name: &'static str,
    pub location: &'static str,
    pub date: &'static str,
    pub duration: &'static str,
    pub body: &'static str,
    pub avatar: &'static str,
}

pub struct ReviewScores {
    pub cleanliness: &'static str,
    pub accuracy: &'static str,
    pub check_in: &'static str,
    pub communication: &'static str,
    pub location: &'static str,
    pub value: &'static str,
}

pub struct HostInfo {
    pub name: &'static str,
    pub photo: &'static str,
    pub review_count: u32,
    pub years_hosting: u32,
    pub response_rate: &'static str,
    pub response_time: &'static str,
    pub bio: &'static str,
}

pub struct CohostInfo {
    pub name: &'static str,
    pub photo: &'static str,
}

pub struct BookingDefaults {
    pub check_in: &'static str,
    pub checkout: &'static str,
    pub check_in_display: &'static str,
    pub checkout_display: &'static str,
    pub range_label: &'static str,
    pub guests: &'static str,
    pub free_cancel_date: &'static str,
    pub nights: u32,
}

pub const SHARED_CSS: &str = proa_showcase::airbnb::shared::SHARED_CSS_RAW;

#[derive(TemplateOnce)]
#[template(path = "airbnb_listing.stpl")]
pub struct AirbnbListingPage {
    pub css: &'static str,
    pub title: &'static str,
    pub location: &'static str,
    pub location_short: &'static str,
    pub property_line: &'static str,
    pub rating: &'static str,
    pub review_count: u32,
    pub overview_summary: &'static str,
    pub description: &'static str,
    pub nightly_rate: u32,
    pub cleaning_fee: u32,
    pub service_fee: u32,
    pub total_amenity_count: u32,
    pub photos: Vec<ListingPhoto>,
    pub highlights: Vec<ListingHighlight>,
    pub amenities: Vec<&'static str>,
    pub review_distribution: Vec<(&'static str, u8)>,
    pub review_scores: ReviewScores,
    pub reviews: Vec<ListingReview>,
    pub house_rules: Vec<&'static str>,
    pub safety_items: Vec<&'static str>,
    pub cancellation_items: Vec<&'static str>,
    pub nearby_links: Vec<&'static str>,
    pub host: HostInfo,
    pub cohost: Option<CohostInfo>,
    pub booking: BookingDefaults,
}

impl AirbnbListingPage {
    /// Historical constructor name retained for benchmark-call-site compatibility.
    /// All rendered content is a fictional, Proa-authored fixture.
    pub fn malibu() -> Self {
        Self {
            css: SHARED_CSS,
            title: "Cliffside Coast House",
            location: "Harbor Point, Coast County",
            location_short: "Harbor Point",
            property_line: "Entire home in Harbor Point",
            rating: "4.92",
            review_count: 75,
            overview_summary: "6 guests \u{00b7} 3 bedrooms \u{00b7} 3 beds \u{00b7} 3.5 baths",
            description: "A fictional coastal retreat created for repeatable rendering benchmarks.\n\nThe three-bedroom layout includes a large kitchen, quiet work area, and a deck overlooking the synthetic Harbor Point shoreline. Every name, review, and image on this page is a Proa-authored fixture.\n\nThe dataset keeps realistic page density and nesting without redistributing a captured listing.",
            nightly_rate: 1042,
            cleaning_fee: 375,
            service_fee: 545,
            total_amenity_count: 46,
            photos: vec![
                ListingPhoto { src: "/images/synthetic/property-room.svg", alt: "Illustrated living room with wide windows" },
                ListingPhoto { src: "/images/synthetic/property-deck.svg", alt: "Illustrated deck overlooking the coast" },
                ListingPhoto { src: "/images/synthetic/property-coast.svg", alt: "Illustrated coast house exterior" },
                ListingPhoto { src: "/images/synthetic/property-room.svg", alt: "Illustrated bedroom with sliding doors" },
                ListingPhoto { src: "/images/synthetic/property-room.svg", alt: "Illustrated kitchen and dining area" },
                ListingPhoto { src: "/images/synthetic/property-deck.svg", alt: "Illustrated outdoor dining area" },
                ListingPhoto { src: "/images/synthetic/property-room.svg", alt: "Illustrated bathroom with warm light" },
                ListingPhoto { src: "/images/synthetic/property-coast.svg", alt: "Illustrated house above a fictional shoreline" },
            ],
            highlights: vec![
                ListingHighlight {
                    title: "Exceptional check-in experience",
                    description: "Recent guests gave the check-in process a 5-star rating.",
                },
                ListingHighlight {
                    title: "Beautiful area",
                    description: "Guests love this home's scenic location and sense of privacy.",
                },
                ListingHighlight {
                    title: "Ocean and mountain views",
                    description: "Guests consistently call out the canyon light and coastal panorama.",
                },
            ],
            amenities: vec![
                "Coast view",
                "Garden view",
                "Shared trail access",
                "Kitchen",
                "Wifi",
                "Free parking on premises",
                "Streaming television",
                "Free washer - In unit",
                "Free dryer - In unit",
                "Air conditioning",
            ],
            review_distribution: vec![("5", 96), ("4", 1), ("3", 1), ("2", 1), ("1", 0)],
            review_scores: ReviewScores {
                cleanliness: "4.9",
                accuracy: "4.9",
                check_in: "5.0",
                communication: "5.0",
                location: "4.9",
                value: "4.8",
            },
            reviews: vec![
                ListingReview { name: "Mira", location: "North Harbor", date: "Recent stay", duration: "Stayed a few nights", body: "The deck was quiet at sunset and the kitchen had everything our group needed. Check-in was simple, the rooms were bright, and we had plenty of space to work and relax.", avatar: "/images/synthetic/avatar.svg" },
                ListingReview { name: "Cal", location: "Cedar City", date: "Recent stay", duration: "Stayed about a week", body: "The illustrated coast views match the benchmark description perfectly. The layout is unusual in a good way, with several small spaces to read or work.", avatar: "/images/synthetic/avatar.svg" },
                ListingReview { name: "Ari", location: "River Junction", date: "Recent stay", duration: "Stayed a few nights", body: "Our fictional hosts made the sample stay feel welcoming. The synthetic home is spacious and the outdoor areas give the page plenty of useful content to render.", avatar: "/images/synthetic/avatar.svg" },
                ListingReview { name: "Toni", location: "Pine Valley", date: "Recent stay", duration: "Stayed a few nights", body: "A dependable test listing with a calm setting, detailed amenity sections, and enough review copy to exercise realistic server-side rendering.", avatar: "/images/synthetic/avatar.svg" },
            ],
            house_rules: vec![
                "Check-in after 4:00 PM",
                "Checkout before 11:00 AM",
                "6 guests maximum",
                "No parties or events",
            ],
            safety_items: vec![
                "Exterior security cameras on property",
                "Smoke alarm",
                "Carbon monoxide alarm",
                "Free parking on premises",
            ],
            cancellation_items: vec![
                "Free cancellation during the grace period.",
                "Cancel before check-in for a partial refund.",
                "Review the full cancellation policy before you book.",
            ],
            nearby_links: vec![
                "Coast County stays",
                "North Harbor stays",
                "Cedar City stays",
                "River Junction stays",
                "Harbor Point monthly stays",
                "House stays in Harbor Point",
                "Coast house stays",
                "Garden house stays",
            ],
            host: HostInfo {
                name: "Dara",
                photo: "/images/synthetic/avatar.svg",
                review_count: 76,
                years_hosting: 7,
                response_rate: "100%",
                response_time: "1 hr",
                bio: "Featured hosts maintain detailed sample listings and respond quickly to fixture guests.",
            },
            cohost: Some(CohostInfo {
                name: "Kai",
                photo: "/images/synthetic/avatar.svg",
            }),
            booking: BookingDefaults {
                check_in: "flexible-check-in",
                checkout: "flexible-checkout",
                check_in_display: "Choose check-in",
                checkout_display: "Choose checkout",
                range_label: "Flexible dates",
                guests: "2 guests",
                free_cancel_date: "the grace period ends",
                nights: 7,
            },
        }
    }

    pub fn nightly_total(&self) -> u32 {
        self.nightly_rate * self.booking.nights
    }

    pub fn total(&self) -> u32 {
        self.nightly_total() + self.cleaning_fee + self.service_fee
    }

    pub fn review_details(&self) -> Vec<(&'static str, &'static str, &'static str)> {
        vec![
            (
                "Cleanliness",
                self.review_scores.cleanliness,
                r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="currentColor"><path d="M24 0v6h-4.3c.13 1.4.67 2.72 1.52 3.78l.2.22-1.5 1.33a9.05 9.05 0 0 1-2.2-5.08c-.83.38-1.32 1.14-1.38 2.2v4.46l4.14 4.02a5 5 0 0 1 1.5 3.09l.01.25.01.25v8.63a3 3 0 0 1-2.64 2.98l-.18.01-.21.01-12-.13A3 3 0 0 1 4 29.2L4 29.02v-8.3a5 5 0 0 1 1.38-3.45l.19-.18L10 12.9V8.85l-4.01-3.4.02-.7A5 5 0 0 1 10.78 0H11zm-5.03 25.69a8.98 8.98 0 0 1-6.13-2.41l-.23-.23A6.97 6.97 0 0 0 6 21.2v7.82c0 .51.38.93.87 1H7l11.96.13h.13a1 1 0 0 0 .91-.88l.01-.12v-3.52c-.34.04-.69.06-1.03.06zM17.67 2H11a3 3 0 0 0-2.92 2.3l-.04.18-.01.08 3.67 3.1h2.72l.02-.1a4.29 4.29 0 0 1 3.23-3.4zM30 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-3-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-5 0h-2.33v2H22zm8-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM20 20.52a3 3 0 0 0-.77-2l-.14-.15-4.76-4.61v-4.1H12v4.1l-5.06 4.78a3 3 0 0 0-.45.53 9.03 9.03 0 0 1 7.3 2.34l.23.23A6.98 6.98 0 0 0 20 23.6z"/></svg>"##,
            ),
            (
                "Accuracy",
                self.review_scores.accuracy,
                r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="currentColor"><path d="M16 1a15 15 0 1 1 0 30 15 15 0 0 1 0-30zm0 2a13 13 0 1 0 0 26 13 13 0 0 0 0-26zm7 7.59L24.41 12 13.5 22.91 7.59 17 9 15.59l4.5 4.5z"/></svg>"##,
            ),
            (
                "Check-in",
                self.review_scores.check_in,
                r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="currentColor"><path d="M16.84 27.16v-3.4l-.26.09c-.98.32-2.03.51-3.11.55h-.7A11.34 11.34 0 0 1 1.72 13.36v-.59A11.34 11.34 0 0 1 12.77 1.72h.59c6.03.16 10.89 5.02 11.04 11.05V13.45a11.3 11.3 0 0 1-.9 4.04l-.13.3 7.91 7.9v5.6H25.7l-4.13-4.13zM10.31 7.22a3.1 3.1 0 1 1 0 6.19 3.1 3.1 0 0 1 0-6.2zm0 2.06a1.03 1.03 0 1 0 0 2.06 1.03 1.03 0 0 0 0-2.06zM22.43 25.1l4.12 4.13h2.67v-2.67l-8.37-8.37.37-.68.16-.3c.56-1.15.9-2.42.96-3.77v-.64a9.28 9.28 0 0 0-9-9h-.55a9.28 9.28 0 0 0-9 9v.54a9.28 9.28 0 0 0 13.3 8.1l.3-.16 1.52-.8v4.62z"/></svg>"##,
            ),
            (
                "Communication",
                self.review_scores.communication,
                r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="m25.5 3.5c2.2091 0 4 1.79086 4 4v13.8333c0 2.2092-1.7909 4-4 4h-5.8192l-3.6808 4.5-3.6832-4.5h-5.8168c-2.20914 0-4-1.7908-4-4v-13.8333c0-2.20914 1.79086-4 4-4z"/></svg>"##,
            ),
            (
                "Location",
                self.review_scores.location,
                r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="currentColor"><path d="M30.95 3.81a2 2 0 0 0-2.38-1.52l-7.58 1.69-10-2-8.42 1.87A1.99 1.99 0 0 0 1 5.8v21.95a1.96 1.96 0 0 0 .05.44 2 2 0 0 0 2.38 1.52l7.58-1.69 10 2 8.42-1.87A1.99 1.99 0 0 0 31 26.2V4.25a1.99 1.99 0 0 0-.05-.44zM12 4.22l8 1.6v21.96l-8-1.6zM3 27.75V5.8l7-1.55V26.2zm26-1.55-7 1.55V5.8l7-1.55z"/></svg>"##,
            ),
            (
                "Value",
                self.review_scores.value,
                r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="currentColor"><path d="M16.17 2a3 3 0 0 1 1.98.74l.14.14 11 11a3 3 0 0 1 .14 4.1l-.14.14L18.12 29.3a3 3 0 0 1-4.1.14l-.14-.14-11-11A3 3 0 0 1 2 16.37l-.01-.2V5a3 3 0 0 1 2.82-3h11.35zm0 2H5a1 1 0 0 0-1 .88v11.29a1 1 0 0 0 .2.61l.1.1 11 11a1 1 0 0 0 1.31.08l.1-.08L27.88 16.7a1 1 0 0 0 .08-1.32l-.08-.1-11-11a1 1 0 0 0-.58-.28L16.17 4zM9 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>"##,
            ),
        ]
    }
}

pub fn render() -> String {
    AirbnbListingPage::malibu()
        .render_once()
        .expect("template render failed")
}
