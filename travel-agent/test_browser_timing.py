import unittest

from browser_timing import (
    disjoint_coverage_ranges,
    interval_union_ms,
    summarize_document_chunks,
    summarize_resources,
)


class BrowserTimingTests(unittest.TestCase):
    def test_coverage_ranges_respect_nested_unexecuted_blocks(self) -> None:
        ranges = disjoint_coverage_ranges(
            [
                {"startOffset": 0, "endOffset": 100, "count": 1},
                {"startOffset": 20, "endOffset": 40, "count": 0},
                {"startOffset": 60, "endOffset": 80, "count": 0},
            ]
        )

        self.assertEqual(ranges, [(0, 20), (40, 60), (80, 100)])

    def test_coverage_ranges_merge_adjacent_used_blocks(self) -> None:
        ranges = disjoint_coverage_ranges(
            [
                {"startOffset": 0, "endOffset": 10, "count": 1},
                {"startOffset": 10, "endOffset": 20, "count": 1},
            ]
        )

        self.assertEqual(ranges, [(0, 20)])

    def test_interval_union_does_not_double_count_parallel_requests(self) -> None:
        self.assertEqual(
            interval_union_ms([(0.0, 10.0), (4.0, 8.0), (12.0, 15.0)]),
            13.0,
        )

    def test_resource_summary_preserves_active_sum_and_discovery_span(self) -> None:
        resources = [
            {
                "resourceType": "script",
                "startMs": 10.0,
                "endMs": 30.0,
                "responseBodyBytes": 100,
                "incomplete": False,
            },
            {
                "resourceType": "script",
                "startMs": 20.0,
                "endMs": 40.0,
                "responseBodyBytes": 200,
                "incomplete": False,
            },
            {
                "resourceType": "xhr",
                "startMs": 50.0,
                "endMs": 60.0,
                "responseBodyBytes": 300,
                "incomplete": False,
            },
        ]

        summary = summarize_resources(resources, 0.0, 100.0)
        scripts = summary["byGroup"]["script"]
        self.assertEqual(scripts["requestsStarted"], 2)
        self.assertEqual(scripts["responseBodyBytes"], 300)
        self.assertEqual(scripts["activeMs"], 30.0)
        self.assertEqual(scripts["spanMs"], 30.0)
        self.assertEqual(scripts["summedRequestMs"], 40.0)
        self.assertEqual(summary["activeMs"], 40.0)

    def test_resource_summary_clips_requests_to_step_boundaries(self) -> None:
        resources = [
            {
                "resourceType": "script",
                "startMs": 0.0,
                "endMs": 100.0,
                "responseBodyBytes": 100,
                "incomplete": False,
            }
        ]
        scripts = summarize_resources(resources, 25.0, 75.0)["byGroup"]["script"]
        self.assertEqual(scripts["requestsStarted"], 0)
        self.assertEqual(scripts["requestsOverlapping"], 1)
        self.assertEqual(scripts["activeMs"], 50.0)

    def test_incomplete_requests_do_not_inflate_completed_network_time(self) -> None:
        resources = [
            {
                "resourceType": "xhr",
                "startMs": 10.0,
                "endMs": 100.0,
                "responseBodyBytes": None,
                "incomplete": True,
            },
            {
                "resourceType": "xhr",
                "startMs": 20.0,
                "endMs": 40.0,
                "responseBodyBytes": 100,
                "incomplete": False,
            },
        ]

        api = summarize_resources(resources, 0.0, 50.0)["byGroup"]["api"]
        self.assertEqual(api["requestsStarted"], 2)
        self.assertEqual(api["completedRequestsStarted"], 1)
        self.assertEqual(api["activeMs"], 40.0)
        self.assertEqual(api["completedActiveMs"], 20.0)
        self.assertEqual(api["responseBodyBytes"], 100)

    def test_document_chunk_summary_exposes_paced_response_gaps(self) -> None:
        summary = summarize_document_chunks(
            {
                "responseStartMs": 100.0,
                "endMs": 500.0,
                "chunks": [
                    {
                        "timestampMs": 110.0,
                        "dataLength": 100,
                        "encodedDataLength": 50,
                    },
                    {
                        "timestampMs": 310.0,
                        "dataLength": 200,
                        "encodedDataLength": 75,
                    },
                    {
                        "timestampMs": 490.0,
                        "dataLength": 300,
                        "encodedDataLength": 125,
                    },
                ],
            }
        )

        self.assertEqual(summary["tailMs"], 400.0)
        self.assertEqual(summary["chunkCount"], 3)
        self.assertEqual(summary["decodedBytes"], 600)
        self.assertEqual(summary["chunksAfterWireFinish"], 0)
        self.assertEqual(summary["encodedChunkBytes"], 250)
        self.assertEqual(summary["firstChunkDelayMs"], 10.0)
        self.assertEqual(summary["lastChunkToEndMs"], 10.0)
        self.assertEqual(summary["maxGapMs"], 200.0)
        self.assertEqual(summary["stallCount"], 2)
        self.assertEqual(summary["stallMs"], 380.0)
        self.assertEqual(summary["largestGaps"][0]["decodedBytesBefore"], 100)

    def test_document_chunk_summary_separates_decoded_delivery_after_wire_end(self) -> None:
        summary = summarize_document_chunks(
            {
                "responseStartMs": 100.0,
                "endMs": 200.0,
                "chunks": [
                    {
                        "timestampMs": 150.0,
                        "dataLength": 100,
                        "encodedDataLength": 0,
                    },
                    {
                        "timestampMs": 225.0,
                        "dataLength": 900,
                        "encodedDataLength": 0,
                    },
                ],
            }
        )

        self.assertEqual(summary["tailMs"], 100.0)
        self.assertEqual(summary["chunkCount"], 2)
        self.assertEqual(summary["chunksBeforeWireFinish"], 1)
        self.assertEqual(summary["chunksAfterWireFinish"], 1)
        self.assertEqual(summary["decodedBytes"], 1000)
        self.assertEqual(summary["decodedBytesBeforeWireFinish"], 100)
        self.assertEqual(summary["maxDecodedDeliveryLagMs"], 25.0)

    def test_document_chunk_summary_handles_response_without_chunk_events(self) -> None:
        summary = summarize_document_chunks(
            {"responseStartMs": 20.0, "endMs": 85.0, "chunks": []}
        )

        self.assertEqual(summary["tailMs"], 65.0)
        self.assertEqual(summary["stallCount"], 1)
        self.assertEqual(summary["lastChunkToEndMs"], 65.0)
        self.assertEqual(summary["largestGaps"][0]["kind"], "headers-to-finish")


if __name__ == "__main__":
    unittest.main()
