// Go html/template SSR Benchmark
//
// Renders the same page structure as the Rust benchmarks:
// 4 sections × 8 cards × 5 list items ≈ 25KB HTML
//
// Run with: go run bench.go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

const (
	NumSections     = 4
	CardsPerSection = 8
	ItemsPerCard    = 5
)

type Section struct {
	DataSection string
	Title       string
	Cards       []Card
}

type Card struct {
	DataCardId string
	Title      string
	Features   []string
}

type PageData struct {
	Sections []Section
}

const templateSource = `<html lang="en">
<head>
    <title>SSR Benchmark Page</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
    <header class="hero-section">
        <h1 class="title">SSR Framework Benchmark</h1>
        <p class="subtitle">Comparing SSR frameworks</p>
    </header>
    <main class="main-content">
        {{range .Sections}}
        <section class="card-section" data-section="{{.DataSection}}">
            <h2 class="section-title">{{.Title}}</h2>
            <div class="card-grid">
                {{range .Cards}}
                <article class="card" data-card-id="{{.DataCardId}}">
                    <div class="card-header">
                        <img src="/images/benchmark.png" alt="Benchmark chart" class="card-image">
                    </div>
                    <div class="card-body">
                        <h3 class="card-title">{{.Title}}</h3>
                        <p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                        <ul class="feature-list">
                            {{range .Features}}
                            <li class="feature-item">{{.}}</li>
                            {{end}}
                        </ul>
                        <button class="btn-primary" type="button">View Details</button>
                    </div>
                </article>
                {{end}}
            </div>
        </section>
        {{end}}
    </main>
    <footer class="footer">
        <p>Rendered with Go html/template</p>
    </footer>
</body>
</html>`

var sectionTitles = []string{
	"Performance Metrics",
	"Rendering Speed",
	"Memory Efficiency",
	"Framework Comparison",
}

var cardTitles = []string{
	"Latency Analysis",
	"Throughput Metrics",
	"Memory Usage",
	"CPU Utilization",
}

var features = []string{
	"Sub-millisecond response times",
	"Zero-copy rendering pipeline",
	"SIMD-accelerated escaping",
	"Pre-allocated buffers",
	"Minimal heap allocations",
}

func buildData() PageData {
	sections := make([]Section, NumSections)
	for s := 0; s < NumSections; s++ {
		ds := "odd"
		if s%2 == 0 {
			ds = "even"
		}
		title := sectionTitles[3]
		if s < len(sectionTitles) {
			title = sectionTitles[s]
		}

		cards := make([]Card, CardsPerSection)
		for c := 0; c < CardsPerSection; c++ {
			dc := "odd"
			if c%2 == 0 {
				dc = "even"
			}
			cards[c] = Card{
				DataCardId: dc,
				Title:      cardTitles[c%4],
				Features:   features[:ItemsPerCard],
			}
		}

		sections[s] = Section{
			DataSection: ds,
			Title:       title,
			Cards:       cards,
		}
	}
	return PageData{Sections: sections}
}

type Result struct {
	Framework   string  `json:"framework"`
	Language    string  `json:"language"`
	LatencyUS   float64 `json:"latency_us"`
	OutputBytes int     `json:"output_bytes"`
	Iterations  int     `json:"iterations"`
	Timestamp   string  `json:"timestamp"`
}

func main() {
	tmpl := template.Must(template.New("page").Parse(templateSource))
	data := buildData()

	// Warmup and verify
	var buf bytes.Buffer
	buf.Grow(32 * 1024)
	if err := tmpl.Execute(&buf, data); err != nil {
		fmt.Fprintf(os.Stderr, "Template error: %v\n", err)
		os.Exit(1)
	}
	html := buf.Bytes()
	fmt.Printf("Output size: %d bytes\n", len(html))
	preview := string(html)
	if len(preview) > 200 {
		preview = preview[:200]
	}
	fmt.Printf("First 200 chars: %s\n\n", preview)

	// Precise latency measurement
	iterations := 10000

	// Warmup
	for i := 0; i < 100; i++ {
		buf.Reset()
		tmpl.Execute(&buf, data)
	}

	runtime.GC()
	start := time.Now()
	for i := 0; i < iterations; i++ {
		buf.Reset()
		tmpl.Execute(&buf, data)
	}
	elapsed := time.Since(start)
	avgUs := float64(elapsed.Nanoseconds()) / float64(iterations) / 1000.0

	fmt.Println("=== Go html/template Latency ===")
	fmt.Printf("  Iterations: %d\n", iterations)
	fmt.Printf("  Total: %.2f ms\n", float64(elapsed.Milliseconds()))
	fmt.Printf("  Average: %.2f µs/render\n\n", avgUs)

	// JSON output
	result := Result{
		Framework:   "Go html/template",
		Language:    "Go",
		LatencyUS:   float64(int(avgUs*100)) / 100, // round to 2 decimals
		OutputBytes: len(html),
		Iterations:  iterations,
		Timestamp:   time.Now().Format(time.RFC3339),
	}

	jsonBytes, _ := json.MarshalIndent(result, "", "  ")
	resultsDir := filepath.Join(filepath.Dir(os.Args[0]), "..", "..", "results")
	// Try relative path from source
	if _, err := os.Stat(resultsDir); os.IsNotExist(err) {
		resultsDir = filepath.Join(".", "..", "..", "results")
	}
	if _, err := os.Stat(resultsDir); os.IsNotExist(err) {
		resultsDir = filepath.Join(".", "results")
		os.MkdirAll(resultsDir, 0o755)
	}
	outPath := filepath.Join(resultsDir, "go.json")
	os.WriteFile(outPath, jsonBytes, 0o644)
	fmt.Printf("Results written to %s\n", outPath)
}
