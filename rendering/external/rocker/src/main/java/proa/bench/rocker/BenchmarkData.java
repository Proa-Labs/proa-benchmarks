package proa.bench.rocker;

import java.util.ArrayList;
import java.util.List;

public final class BenchmarkData {
    private static final int NUM_SECTIONS = 4;
    private static final int CARDS_PER_SECTION = 8;
    private static final int ITEMS_PER_CARD = 5;

    private static final String[] SECTION_TITLES = {
        "Performance Metrics",
        "Rendering Speed",
        "Memory Efficiency",
        "Framework Comparison"
    };

    private static final String[] CARD_TITLES = {
        "Latency Analysis",
        "Throughput Metrics",
        "Memory Usage",
        "CPU Utilization"
    };

    private static final List<String> FEATURES = List.of(
        "Sub-millisecond response times",
        "Zero-copy rendering pipeline",
        "SIMD-accelerated escaping",
        "Pre-allocated buffers",
        "Minimal heap allocations"
    );

    public static final int TABLE_ROW_COUNT = 1_000;
    public static final int PRODUCT_COUNT = productCount();
    public static final String STAR_PATH = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.363-1.118l-2.8-2.034c-.784-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

    private static final String[] NAMES = {
        "Alice <admin>", "Bob & Charlie", "Dana \"the boss\" Lin", "Eve O'Brien",
        "Frank > Smith", "Grace Hopper & Co.", "Heidi <script>", "Ivan & Sons",
        "Judy Q. \"Public\"", "Karl <tag>", "Liu & Wang", "Mallory >&<",
        "Niaj <user>", "Olivia & Co.", "Peggy 'Quote'", "Quinn & Sons"
    };
    private static final String[] EMAILS = {
        "alice+filter@example.com", "bob&charlie@example.com", "dana@example.org",
        "eve@example.io", "frank>smith@example.net", "grace@hopper.dev",
        "heidi@example.com", "ivan&sons@example.co", "judy@public.gov",
        "karl@example.com", "liu@wang.cn", "mallory@evil.example",
        "niaj@example.bd", "olivia@co.example", "peggy@quoted.example",
        "quinn@example.io"
    };
    private static final String[] STATUSES = {"Active", "Pending", "Disabled", "Cancelled", "Refunded"};
    private static final String[] COUNTRIES = {"USA", "CAN", "GBR", "DEU", "FRA", "JPN", "AUS", "BRA"};
    private static final List<List<String>> TAG_SETS = List.of(
        List.of("new", "priority"), List.of("enterprise", "vip"), List.of("trial"),
        List.of("enterprise", "vip", "priority"), List.of("churn-risk"), List.of("new"),
        List.of("priority", "review"), List.of("vip")
    );
    private static final String[] CATEGORIES = {"Audio", "Displays", "Wearables"};

    private BenchmarkData() {
    }

    private static int productCount() {
        String raw = System.getenv("PROA_BENCH_PRODUCT_COUNT");
        if (raw == null) return 96;
        int count = Integer.parseInt(raw);
        if (count < 1) throw new IllegalArgumentException("PROA_BENCH_PRODUCT_COUNT must be positive");
        return count;
    }

    public static PageData build() {
        var sections = new ArrayList<Section>(NUM_SECTIONS);

        for (int s = 0; s < NUM_SECTIONS; s++) {
            var cards = new ArrayList<Card>(CARDS_PER_SECTION);
            for (int c = 0; c < CARDS_PER_SECTION; c++) {
                cards.add(new Card(
                    c % 2 == 0 ? "even" : "odd",
                    CARD_TITLES[c % CARD_TITLES.length],
                    FEATURES.subList(0, ITEMS_PER_CARD)
                ));
            }

            sections.add(new Section(
                s % 2 == 0 ? "even" : "odd",
                SECTION_TITLES[s],
                cards
            ));
        }

        return new PageData(sections);
    }

    public static SuiteData buildSuite() {
        var rows = new ArrayList<TableRow>(TABLE_ROW_COUNT);
        for (int index = 0; index < TABLE_ROW_COUNT; index++) {
            long amount = 12_345 + (index * 137L) % 99_999;
            rows.add(new TableRow(
                index, 100_000 + index, NAMES[index % NAMES.length], EMAILS[index % EMAILS.length],
                STATUSES[index % STATUSES.length], amount, amount * 8 / 100,
                1_700_000_000L + index * 86_400L, 1_710_000_000L + index * 3_600L,
                5_000 + (index * 31) % 5_000, COUNTRIES[index % COUNTRIES.length],
                TAG_SETS.get(index % TAG_SETS.size())
            ));
        }
        var products = new ArrayList<Product>(PRODUCT_COUNT);
        for (int index = 0; index < PRODUCT_COUNT; index++) {
            products.add(new Product(
                1_000 + index, "Meridian \"Model " + index + "\" & Co.",
                CATEGORIES[index % CATEGORIES.length], 1_999 + (index % 40) * 500,
                30 + index % 20, 3 + (index * 7) % 400
            ));
        }
        return new SuiteData(build(), rows, products, List.of(0, 1, 2, 3, 4));
    }

    public static final class SuiteData {
        public final PageData cards;
        public final List<TableRow> rows;
        public final List<Product> products;
        public final List<Integer> starIndexes;

        SuiteData(PageData cards, List<TableRow> rows, List<Product> products, List<Integer> starIndexes) {
            this.cards = cards;
            this.rows = rows;
            this.products = products;
            this.starIndexes = starIndexes;
        }
    }

    public static final class TableRow {
        public final int index;
        public final int id;
        public final String name;
        public final String email;
        public final String status;
        public final long amountCents;
        public final long taxCents;
        public final long createdUnix;
        public final long updatedUnix;
        public final int scoreBps;
        public final String country;
        public final List<String> tags;

        TableRow(int index, int id, String name, String email, String status, long amountCents,
                 long taxCents, long createdUnix, long updatedUnix, int scoreBps, String country,
                 List<String> tags) {
            this.index = index;
            this.id = id;
            this.name = name;
            this.email = email;
            this.status = status;
            this.amountCents = amountCents;
            this.taxCents = taxCents;
            this.createdUnix = createdUnix;
            this.updatedUnix = updatedUnix;
            this.scoreBps = scoreBps;
            this.country = country;
            this.tags = tags;
        }

        public String zebra() { return index % 2 == 0 ? "bg-white" : "bg-gray-50"; }
        public String statusClass() {
            String base = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ";
            return base + switch (status) {
                case "Active" -> "bg-green-100 text-green-800 border-green-300";
                case "Pending" -> "bg-yellow-100 text-yellow-800 border-yellow-300";
                case "Disabled" -> "bg-gray-100 text-gray-700 border-gray-300";
                case "Cancelled" -> "bg-red-100 text-red-800 border-red-300";
                default -> "bg-purple-100 text-purple-800 border-purple-300";
            };
        }
        public String amount() { return formatCurrency(amountCents); }
        public String tax() { return formatCurrency(taxCents); }
        public String total() { return formatCurrency(amountCents + taxCents); }
        public String created() { return java.time.Instant.ofEpochSecond(createdUnix).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString(); }
        public String updated() { return java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(java.time.ZoneOffset.UTC).format(java.time.Instant.ofEpochSecond(updatedUnix)); }
        public String score() { return (scoreBps / 100) + "." + ((scoreBps % 100) / 10) + "%"; }
    }

    public static final class Product {
        public final int id;
        public final String name;
        public final String category;
        public final int priceCents;
        public final int ratingTenths;
        public final int reviewCount;

        Product(int id, String name, String category, int priceCents, int ratingTenths, int reviewCount) {
            this.id = id;
            this.name = name;
            this.category = category;
            this.priceCents = priceCents;
            this.ratingTenths = ratingTenths;
            this.reviewCount = reviewCount;
        }
        public int filledStars() { return (ratingTenths + 5) / 10; }
        public String rating() { return (ratingTenths / 10) + "." + (ratingTenths % 10); }
        public String price() { return String.format(java.util.Locale.ROOT, "$%d.%02d", priceCents / 100, priceCents % 100); }
    }

    private static String formatCurrency(long cents) {
        String sign = cents < 0 ? "-" : "";
        long absolute = Math.abs(cents);
        return String.format(java.util.Locale.ROOT, "%s$%,d.%02d", sign, absolute / 100, absolute % 100);
    }

    public static final class PageData {
        public final List<Section> sections;

        public PageData(List<Section> sections) {
            this.sections = sections;
        }
    }

    public static final class Section {
        public final String dataSection;
        public final String title;
        public final List<Card> cards;

        public Section(String dataSection, String title, List<Card> cards) {
            this.dataSection = dataSection;
            this.title = title;
            this.cards = cards;
        }
    }

    public static final class Card {
        public final String dataCardId;
        public final String title;
        public final List<String> features;

        public Card(String dataCardId, String title, List<String> features) {
            this.dataCardId = dataCardId;
            this.title = title;
            this.features = features;
        }
    }
}
