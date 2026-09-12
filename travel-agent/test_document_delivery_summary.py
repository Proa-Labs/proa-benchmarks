import unittest

from summarize_document_delivery import (
    attach_stable_gaps,
    finished_document,
    parse_server_timing,
    stable_gap_centers,
    summarize_group,
)


class DocumentDeliverySummaryTests(unittest.TestCase):
    def test_parses_server_timing_across_commas_and_newlines(self) -> None:
        parsed = parse_server_timing(
            "ingress;dur=53, upstream;dur=53\n"
            "cdn-cache; desc=MISS, edge; dur=69, origin; dur=138"
        )

        self.assertEqual(parsed["cdn-cache"]["description"], "MISS")
        self.assertEqual(parsed["edge"]["durationMs"], 69.0)
        self.assertEqual(parsed["origin"]["durationMs"], 138.0)

    def test_stable_gap_prefers_repeatable_offset_over_one_large_outlier(self) -> None:
        samples = [
            {
                "surface": "example",
                "gaps": [
                    {"durationMs": 200.0, "decodedBytesBefore": 520_000},
                    {"durationMs": 2_000.0, "decodedBytesBefore": 100_000},
                ],
            },
            {
                "surface": "example",
                "gaps": [
                    {"durationMs": 300.0, "decodedBytesBefore": 519_000},
                ],
            },
            {
                "surface": "example",
                "gaps": [
                    {"durationMs": 250.0, "decodedBytesBefore": 521_000},
                ],
            },
        ]

        centers = stable_gap_centers(samples)
        attach_stable_gaps(samples, centers)

        self.assertAlmostEqual(centers["example"], 516_096, delta=8_192)
        self.assertEqual(
            [sample["stableGap"]["durationMs"] for sample in samples],
            [200.0, 300.0, 250.0],
        )

    def test_surface_without_a_long_gap_is_preserved(self) -> None:
        samples = [{"surface": "example", "gaps": []}]

        centers = stable_gap_centers(samples)
        attach_stable_gaps(samples, centers)

        self.assertEqual(centers, {})
        self.assertIsNone(samples[0]["stableGap"])

    def test_group_summary_calculates_encoded_link_floor(self) -> None:
        samples = [
            {
                "protocol": "h2",
                "ttfbMs": 100.0,
                "tailMs": 200.0,
                "documentMs": 300.0,
                "encodedBytes": 125_000.0,
                "decodedBytes": 1_000_000.0,
                "largestGapMs": 150.0,
                "headers": {"cache-control": "private, no-store"},
                "serverTiming": {
                    "cdn-cache": {"description": "MISS"},
                    "origin": {"durationMs": 80.0},
                },
                "stableGap": {
                    "durationMs": 150.0,
                    "decodedBytesBefore": 500_000,
                },
            }
        ]

        summary = summarize_group(samples, 100.0)

        self.assertEqual(summary["linkTransferFloorMsP50"], 10.0)
        self.assertEqual(summary["stableGapCoverage"], 1)
        self.assertEqual(summary["cacheDisabledCount"], 1)
        self.assertEqual(summary["cdnCacheMissCount"], 1)
        self.assertEqual(summary["serverTimingDurationMsP50"]["origin"], 80.0)

    def test_finished_document_ignores_redirect_hop(self) -> None:
        selected = finished_document(
            {
                "surface": "hotels",
                "run": 1,
                "documentTransfers": [
                    {
                        "outcome": "redirect",
                        "response": {"status": 302},
                    },
                    {
                        "outcome": "finished",
                        "response": {"status": 200},
                        "url": "https://example.test/final",
                    },
                ],
            }
        )

        self.assertEqual(selected["url"], "https://example.test/final")


if __name__ == "__main__":
    unittest.main()
