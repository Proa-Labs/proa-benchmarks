import unittest

from analyze_javascript_payloads import (
    category_for,
    effective_coverage_surface,
    effective_resource_surface,
)


class CategoryTests(unittest.TestCase):
    def test_first_party_tag_gateway_is_measurement(self) -> None:
        self.assertEqual(
            category_for("airbnb", "https://www.airbnb.com/gtg/gtm-46mk/gtm.js"),
            "measurement_ads",
        )

    def test_enterprise_adobe_path_is_measurement(self) -> None:
        self.assertEqual(
            category_for(
                "enterprise",
                "https://www.enterprise.com/adobedtm/property/launch-file.min.js",
            ),
            "measurement_ads",
        )

    def test_recaptcha_precedes_google_product_classification(self) -> None:
        self.assertEqual(
            category_for(
                "hotels",
                "https://www.gstatic.com/recaptcha/releases/version/recaptcha__en.js",
            ),
            "security",
        )


class CarryoverTests(unittest.TestCase):
    def test_airbnb_frame_wins_over_next_surface_label(self) -> None:
        self.assertEqual(
            effective_resource_surface(
                {
                    "surface": "hotels",
                    "frameUrl": "https://www.airbnb.com/rooms/123",
                }
            ),
            "airbnb",
        )

    def test_grand_wailea_embed_wins_over_next_surface_label(self) -> None:
        self.assertEqual(
            effective_resource_surface(
                {
                    "surface": "enterprise",
                    "frameUrl": "https://fareharbor.com/embeds/cart/",
                }
            ),
            "grand_wailea",
        )

    def test_coverage_uses_url_for_observed_carryover(self) -> None:
        self.assertEqual(
            effective_coverage_surface(
                {
                    "surface": "enterprise",
                    "url": "https://messenger.myma.ai/static/js/chunk.js",
                }
            ),
            "grand_wailea",
        )


if __name__ == "__main__":
    unittest.main()
