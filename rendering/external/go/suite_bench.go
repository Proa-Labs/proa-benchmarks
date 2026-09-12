// Command suite_bench implements Go html/template for the canonical SSR suite.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	tableRowCount = 1000
	starPath      = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.363-1.118l-2.8-2.034c-.784-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
)

var productCount = func() int {
	raw, configured := os.LookupEnv("PROA_BENCH_PRODUCT_COUNT")
	if !configured {
		return 96
	}
	count, err := strconv.Atoi(raw)
	if err != nil || count < 1 {
		panic("PROA_BENCH_PRODUCT_COUNT must be a positive integer")
	}
	return count
}()

type card struct {
	DataCardID string
	Title      string
	Features   []string
}

type section struct {
	DataSection string
	Title       string
	Cards       []card
}

type tableRow struct {
	ID          int
	Name        string
	Email       string
	Status      string
	AmountCents int64
	TaxCents    int64
	CreatedUnix int64
	UpdatedUnix int64
	ScoreBPS    int
	Country     string
	Tags        []string
}

type product struct {
	ID           int
	Name         string
	Category     string
	PriceCents   int
	RatingTenths int
	ReviewCount  int
}

type productInput struct {
	Products    []product
	StarIndexes []int
}

func buildSections() []section {
	sectionTitles := []string{"Performance Metrics", "Rendering Speed", "Memory Efficiency", "Framework Comparison"}
	cardTitles := []string{"Latency Analysis", "Throughput Metrics", "Memory Usage", "CPU Utilization"}
	features := []string{"Sub-millisecond response times", "Zero-copy rendering pipeline", "SIMD-accelerated escaping", "Pre-allocated buffers", "Minimal heap allocations"}
	sections := make([]section, 4)
	for sectionIndex := range sections {
		cards := make([]card, 8)
		for cardIndex := range cards {
			cards[cardIndex] = card{
				DataCardID: []string{"even", "odd"}[cardIndex%2],
				Title:      cardTitles[cardIndex%len(cardTitles)],
				Features:   features,
			}
		}
		sections[sectionIndex] = section{
			DataSection: []string{"even", "odd"}[sectionIndex%2],
			Title:       sectionTitles[sectionIndex],
			Cards:       cards,
		}
	}
	return sections
}

func buildRows() []tableRow {
	names := []string{"Alice <admin>", "Bob & Charlie", `Dana "the boss" Lin`, "Eve O'Brien", "Frank > Smith", "Grace Hopper & Co.", "Heidi <script>", "Ivan & Sons", `Judy Q. "Public"`, "Karl <tag>", "Liu & Wang", "Mallory >&<", "Niaj <user>", "Olivia & Co.", "Peggy 'Quote'", "Quinn & Sons"}
	emails := []string{"alice+filter@example.com", "bob&charlie@example.com", "dana@example.org", "eve@example.io", "frank>smith@example.net", "grace@hopper.dev", "heidi@example.com", "ivan&sons@example.co", "judy@public.gov", "karl@example.com", "liu@wang.cn", "mallory@evil.example", "niaj@example.bd", "olivia@co.example", "peggy@quoted.example", "quinn@example.io"}
	statuses := []string{"Active", "Pending", "Disabled", "Cancelled", "Refunded"}
	countries := []string{"USA", "CAN", "GBR", "DEU", "FRA", "JPN", "AUS", "BRA"}
	tagSets := [][]string{{"new", "priority"}, {"enterprise", "vip"}, {"trial"}, {"enterprise", "vip", "priority"}, {"churn-risk"}, {"new"}, {"priority", "review"}, {"vip"}}
	rows := make([]tableRow, tableRowCount)
	for index := range rows {
		amount := int64(12345 + (index*137)%99999)
		rows[index] = tableRow{
			ID:          100000 + index,
			Name:        names[index%len(names)],
			Email:       emails[index%len(emails)],
			Status:      statuses[index%len(statuses)],
			AmountCents: amount,
			TaxCents:    amount * 8 / 100,
			CreatedUnix: 1700000000 + int64(index*86400),
			UpdatedUnix: 1710000000 + int64(index*3600),
			ScoreBPS:    5000 + (index*31)%5000,
			Country:     countries[index%len(countries)],
			Tags:        tagSets[index%len(tagSets)],
		}
	}
	return rows
}

func buildProducts() []product {
	categories := []string{"Audio", "Displays", "Wearables"}
	products := make([]product, productCount)
	for index := range products {
		products[index] = product{
			ID:           1000 + index,
			Name:         fmt.Sprintf(`Meridian "Model %d" & Co.`, index),
			Category:     categories[index%len(categories)],
			PriceCents:   1999 + (index%40)*500,
			RatingTenths: 30 + index%20,
			ReviewCount:  3 + (index*7)%400,
		}
	}
	return products
}

var statusClasses = map[string]string{
	"Active":    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-green-100 text-green-800 border-green-300",
	"Pending":   "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-yellow-100 text-yellow-800 border-yellow-300",
	"Disabled":  "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-gray-100 text-gray-700 border-gray-300",
	"Cancelled": "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-red-100 text-red-800 border-red-300",
	"Refunded":  "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-purple-100 text-purple-800 border-purple-300",
}

func formatCount(value uint64) string {
	digits := strconv.FormatUint(value, 10)
	var output strings.Builder
	for index, digit := range digits {
		if index != 0 && (len(digits)-index)%3 == 0 {
			output.WriteByte(',')
		}
		output.WriteRune(digit)
	}
	return output.String()
}

func currency(cents int64) string {
	sign := ""
	if cents < 0 {
		sign = "-"
		cents = -cents
	}
	return fmt.Sprintf("%s$%s.%02d", sign, formatCount(uint64(cents/100)), cents%100)
}

func percentile(sorted []float64, percent float64) float64 {
	rank := percent / 100 * float64(len(sorted)-1)
	lower, upper := int(math.Floor(rank)), int(math.Ceil(rank))
	if lower == upper {
		return sorted[lower]
	}
	return sorted[lower] + (sorted[upper]-sorted[lower])*(rank-float64(lower))
}

const cardsTemplate = `<html lang="en"><head><title>SSR Benchmark Page</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><header class="hero-section"><h1 class="title">SSR Framework Benchmark</h1><p class="subtitle">Comparing Proa, Leptos, Dioxus, and Yew</p></header><main class="main-content">{{range .}}<section class="card-section" data-section="{{.DataSection}}"><h2 class="section-title">{{.Title}}</h2><div class="card-grid">{{range .Cards}}<article class="card" data-card-id="{{.DataCardID}}"><div class="card-header"><img src="/images/benchmark.png" alt="Benchmark chart" class="card-image"></div><div class="card-body"><h3 class="card-title">{{.Title}}</h3><p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p><ul class="feature-list">{{range .Features}}<li class="feature-item">{{.}}</li>{{end}}</ul><button class="btn-primary" type="button">View Details</button></div></article>{{end}}</div></section>{{end}}</main><footer class="footer"><p>Rendered by the SSR benchmark fixture</p></footer></body></html>`

const tableTemplate = `<html lang="en"><head><title>Customer Data Table</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-gray-50 text-gray-900"><header class="px-6 py-4 border-b"><h1 class="text-xl font-semibold">Customer Accounts</h1><p class="text-sm text-gray-600">Live revenue and account status across all regions.</p></header><main class="p-6"><table class="min-w-full text-sm border-collapse"><thead class="bg-gray-100"><tr><th class="px-3 py-2 text-left">ID</th><th class="px-3 py-2 text-left">Name</th><th class="px-3 py-2 text-left">Email</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-right">Amount</th><th class="px-3 py-2 text-right">Tax</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-left">Created</th><th class="px-3 py-2 text-left">Updated</th><th class="px-3 py-2 text-right">Score</th><th class="px-3 py-2 text-left">Country</th><th class="px-3 py-2 text-left">Tags</th></tr></thead><tbody>{{range $index, $row := .}}<tr class="{{zebra $index}}" data-row-id="{{$row.ID}}"><td class="px-3 py-2 font-mono text-gray-500">{{$row.ID}}</td><td class="px-3 py-2">{{$row.Name}}</td><td class="px-3 py-2 text-blue-700">{{$row.Email}}</td><td class="px-3 py-2"><span class="{{statusClass $row.Status}}">{{$row.Status}}</span></td><td class="px-3 py-2 text-right font-mono">{{currency $row.AmountCents}}</td><td class="px-3 py-2 text-right font-mono text-gray-500">{{currency $row.TaxCents}}</td><td class="px-3 py-2 text-right font-mono font-semibold">{{currency (add $row.AmountCents $row.TaxCents)}}</td><td class="px-3 py-2 text-gray-600">{{date $row.CreatedUnix}}</td><td class="px-3 py-2 text-gray-600">{{dateTime $row.UpdatedUnix}}</td><td class="px-3 py-2 text-right font-mono">{{percent $row.ScoreBPS}}</td><td class="px-3 py-2">{{$row.Country}}</td><td class="px-3 py-2">{{range $row.Tags}}<span class="inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">{{.}}</span>{{end}}</td></tr>{{end}}</tbody></table></main></body></html>`

const productsTemplate = `<main class="mx-auto w-full max-w-6xl px-4 py-10"><h1 class="text-2xl font-bold tracking-tight">All products</h1><div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{{range .Products}}{{$product := .}}<a href="/products/{{$product.ID}}" class="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"><div class="mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300">{{$product.Category}}</div><p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{$product.Category}}</p><h3 class="mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600">{{$product.Name}}</h3><div class="mt-2 flex items-center gap-1"><div class="flex">{{range $.StarIndexes}}<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="{{starClass . $product.RatingTenths}}"><path d="` + starPath + `"></path></svg>{{end}}</div><span class="text-xs text-slate-500">{{rating $product.RatingTenths}} ({{$product.ReviewCount}})</span></div><p class="mt-3 text-lg font-bold">{{price $product.PriceCents}}</p></a>{{end}}</div></main>`

type summary struct {
	SchemaVersion       int     `json:"schema_version"`
	Framework           string  `json:"framework"`
	FrameworkID         string  `json:"framework_id"`
	Language            string  `json:"language"`
	LanguageVersion     string  `json:"language_version"`
	Workload            string  `json:"workload"`
	WorkloadCardinality int     `json:"workload_cardinality"`
	AllocationPolicy    string  `json:"allocation_policy"`
	Iterations          int     `json:"iterations"`
	Warmup              int     `json:"warmup"`
	OutputBytes         int     `json:"output_bytes"`
	MinUS               float64 `json:"min_us"`
	MeanUS              float64 `json:"mean_us"`
	P50US               float64 `json:"p50_us"`
	P95US               float64 `json:"p95_us"`
	P99US               float64 `json:"p99_us"`
	MaxUS               float64 `json:"max_us"`
	Timestamp           string  `json:"timestamp"`
}

func main() {
	workload := flag.String("workload", "", "cards, table, or products")
	iterationsFlag := flag.Int("iterations", 0, "measured renders")
	warmupFlag := flag.Int("warmup", -1, "warmup renders")
	outputPath := flag.String("out", "", "result JSON path")
	dumpPath := flag.String("dump", "", "HTML dump path")
	dumpOnly := flag.Bool("dump-only", false, "render once without timing")
	servePort := flag.Int("serve", 0, "serve every workload over HTTP on this port instead of timing")
	flag.Parse()

	if *servePort != 0 {
		serve(*servePort)
		return
	}

	defaults := map[string][3]int{"cards": {2000, 200, 32}, "table": {200, 20, tableRowCount}, "products": {500, 50, productCount}}
	selected, ok := defaults[*workload]
	if !ok {
		fmt.Fprintln(os.Stderr, "--workload must be cards, table, or products")
		os.Exit(2)
	}
	iterations, warmup := *iterationsFlag, *warmupFlag
	if iterations == 0 {
		iterations = selected[0]
	}
	if warmup == -1 {
		warmup = selected[1]
	}
	if iterations < 1 || warmup < 0 {
		fmt.Fprintln(os.Stderr, "iterations must be positive and warmup non-negative")
		os.Exit(2)
	}

	funcs := templateFuncs()
	sources := map[string]string{"cards": cardsTemplate, "table": tableTemplate, "products": productsTemplate}
	inputs := map[string]any{
		"cards":    buildSections(),
		"table":    buildRows(),
		"products": productInput{Products: buildProducts(), StarIndexes: []int{0, 1, 2, 3, 4}},
	}
	tmpl := template.Must(template.New(*workload).Funcs(funcs).Parse(sources[*workload]))
	render := func() string {
		var output bytes.Buffer
		if err := tmpl.Execute(&output, inputs[*workload]); err != nil {
			panic(err)
		}
		return output.String()
	}

	html := render()
	if *dumpPath != "" {
		if err := os.MkdirAll(filepath.Dir(*dumpPath), 0o755); err != nil {
			panic(err)
		}
		if err := os.WriteFile(*dumpPath, []byte(html), 0o644); err != nil {
			panic(err)
		}
	}
	if *dumpOnly {
		fmt.Printf("Go html/template %s: %d bytes\n", *workload, len(html))
		return
	}
	for index := 0; index < warmup; index++ {
		html = render()
	}
	samples := make([]float64, iterations)
	for index := range samples {
		started := time.Now()
		html = render()
		samples[index] = float64(time.Since(started).Nanoseconds()) / 1000
	}
	sort.Float64s(samples)
	mean := 0.0
	for _, sample := range samples {
		mean += sample
	}
	mean /= float64(len(samples))
	result := summary{
		SchemaVersion: 1, Framework: "Go html/template", FrameworkID: "go-html-template",
		Language: "Go", LanguageVersion: runtime.Version(), Workload: *workload,
		WorkloadCardinality: selected[2], AllocationPolicy: "fresh bytes.Buffer and owned string",
		Iterations: iterations, Warmup: warmup, OutputBytes: len(html), MinUS: samples[0],
		MeanUS: mean, P50US: percentile(samples, 50), P95US: percentile(samples, 95),
		P99US: percentile(samples, 99), MaxUS: samples[len(samples)-1], Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	fmt.Printf("%-20s %-8s %9.2f µs p50  %9.2f µs p95  %8d bytes\n", result.Framework, *workload, result.P50US, result.P95US, result.OutputBytes)
	encoded, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		panic(err)
	}
	encoded = append(encoded, '\n')
	if *outputPath != "" {
		if err := os.MkdirAll(filepath.Dir(*outputPath), 0o755); err != nil {
			panic(err)
		}
		if err := os.WriteFile(*outputPath, encoded, 0o644); err != nil {
			panic(err)
		}
	} else {
		fmt.Print(string(encoded))
	}
}

func templateFuncs() template.FuncMap {
	return template.FuncMap{
		"zebra": func(index int) string {
			if index%2 == 0 {
				return "bg-white"
			}
			return "bg-gray-50"
		},
		"statusClass": func(status string) string { return statusClasses[status] },
		"currency":    currency,
		"add":         func(left, right int64) int64 { return left + right },
		"date":        func(unix int64) string { return time.Unix(unix, 0).UTC().Format("2006-01-02") },
		"dateTime":    func(unix int64) string { return time.Unix(unix, 0).UTC().Format("2006-01-02 15:04") },
		"percent":     func(bps int) string { return fmt.Sprintf("%d.%d%%", bps/100, (bps%100)/10) },
		"price":       func(cents int) string { return fmt.Sprintf("$%d.%02d", cents/100, cents%100) },
		"rating":      func(tenths int) string { return fmt.Sprintf("%d.%d", tenths/10, tenths%10) },
		"starClass": func(index, tenths int) string {
			if index < (tenths+5)/10 {
				return "h-4 w-4 text-amber-400"
			}
			return "h-4 w-4 text-slate-200"
		},
	}
}

// serve exposes the canonical workloads over net/http for the HTTP page
// benchmark. Templates are parsed and fixture data is built before the
// listener opens; each request executes the template straight into the
// ResponseWriter, which is the ordinary Go server path.
func serve(port int) {
	funcs := templateFuncs()
	inputs := map[string]any{
		"cards":    buildSections(),
		"table":    buildRows(),
		"products": productInput{Products: buildProducts(), StarIndexes: []int{0, 1, 2, 3, 4}},
	}
	templates := map[string]*template.Template{}
	for name, source := range map[string]string{"cards": cardsTemplate, "table": tableTemplate, "products": productsTemplate} {
		templates[name] = template.Must(template.New(name).Funcs(funcs).Parse(source))
	}
	mux := http.NewServeMux()
	for name := range templates {
		tmpl, input := templates[name], inputs[name]
		mux.HandleFunc("/"+name, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			if err := tmpl.Execute(w, input); err != nil {
				http.Error(w, "render error", http.StatusInternalServerError)
			}
		})
	}
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]any{
			"status":     "ok",
			"engine":     "go-html-template",
			"framework":  "Go html/template " + runtime.Version(),
			"id":         "canonical_pages_v1",
			"gomaxprocs": runtime.GOMAXPROCS(0),
			"workloads": map[string]any{
				"cards":    map[string]any{"path": "/cards", "cardinality": 32},
				"table":    map[string]any{"path": "/table", "cardinality": tableRowCount},
				"products": map[string]any{"path": "/products", "cardinality": productCount},
			},
			"renderPath": "html/template Execute into net/http ResponseWriter; fresh response per request",
		})
	})
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		var usage syscall.Rusage
		if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		cpuMicros := usage.Utime.Sec*1_000_000 + int64(usage.Utime.Usec) + usage.Stime.Sec*1_000_000 + int64(usage.Stime.Usec)
		peakRss := usage.Maxrss
		if runtime.GOOS != "darwin" {
			peakRss *= 1024
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]any{"cpuTimeMicros": cpuMicros, "peakRssBytes": peakRss})
	})
	server := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", port), Handler: mux}
	fmt.Printf("Go html/template page server listening on http://%s\n", server.Addr)
	if err := server.ListenAndServe(); err != nil {
		panic(err)
	}
}
