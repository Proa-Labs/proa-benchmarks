package proa.bench.rocker;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.Locale;

public final class Bench {
    private static volatile Object sink;

    private Bench() {}

    public static void main(String[] args) throws Exception {
        var options = Options.parse(args);
        var data = BenchmarkData.buildSuite();
        Renderer renderer = () -> render(options.workload, data);
        String html = renderer.render();

        if (options.dump != null) {
            Files.createDirectories(options.dump.toAbsolutePath().getParent());
            Files.writeString(options.dump, html, StandardCharsets.UTF_8);
        }
        if (options.dumpOnly) {
            System.out.printf("Rocker %s: %d bytes%n", options.workload, html.getBytes(StandardCharsets.UTF_8).length);
            return;
        }

        for (int index = 0; index < options.warmup; index++) sink = renderer.render();
        double[] samples = new double[options.iterations];
        for (int index = 0; index < samples.length; index++) {
            long started = System.nanoTime();
            html = renderer.render();
            samples[index] = (System.nanoTime() - started) / 1_000.0;
            sink = html;
        }
        Arrays.sort(samples);
        int outputBytes = html.getBytes(StandardCharsets.UTF_8).length;
        double mean = Arrays.stream(samples).average().orElseThrow();
        String json = String.format(Locale.ROOT, """
            {
              "schema_version": 1,
              "framework": "Rocker",
              "framework_id": "rocker",
              "language": "Java",
              "language_version": "%s",
              "workload": "%s",
              "workload_cardinality": %d,
              "allocation_policy": "optimized Rocker template flattened to a fresh owned string",
              "iterations": %d,
              "warmup": %d,
              "output_bytes": %d,
              "min_us": %.6f,
              "mean_us": %.6f,
              "p50_us": %.6f,
              "p95_us": %.6f,
              "p99_us": %.6f,
              "max_us": %.6f,
              "timestamp": "%s"
            }
            """, Runtime.version(), options.workload, cardinality(options.workload), options.iterations,
            options.warmup, outputBytes, samples[0], mean, percentile(samples, 50),
            percentile(samples, 95), percentile(samples, 99), samples[samples.length - 1], Instant.now());
        System.out.printf("%-20s %-8s %9.2f µs p50  %9.2f µs p95  %8d bytes%n",
            "Rocker", options.workload, percentile(samples, 50), percentile(samples, 95), outputBytes);
        if (options.out != null) {
            Files.createDirectories(options.out.toAbsolutePath().getParent());
            Files.writeString(options.out, json, StandardCharsets.UTF_8);
        } else {
            System.out.print(json);
        }
    }

    private static String render(String workload, BenchmarkData.SuiteData data) {
        return switch (workload) {
            case "cards" -> views.cards.template(data.cards).render().toString();
            case "table" -> views.table.template(data).render().toString();
            case "products" -> views.products.template(data).render().toString();
            default -> throw new IllegalArgumentException(workload);
        };
    }

    private static int cardinality(String workload) {
        return switch (workload) {
            case "cards" -> 32;
            case "table" -> BenchmarkData.TABLE_ROW_COUNT;
            case "products" -> BenchmarkData.PRODUCT_COUNT;
            default -> throw new IllegalArgumentException(workload);
        };
    }

    private static double percentile(double[] values, double percent) {
        double rank = percent / 100 * (values.length - 1);
        int lower = (int)Math.floor(rank);
        int upper = (int)Math.ceil(rank);
        return lower == upper ? values[lower] : values[lower] + (values[upper] - values[lower]) * (rank - lower);
    }

    @FunctionalInterface
    private interface Renderer { String render(); }

    private record Options(String workload, int iterations, int warmup, Path out, Path dump, boolean dumpOnly) {
        static Options parse(String[] args) {
            String workload = null;
            Integer iterations = null;
            Integer warmup = null;
            Path out = null;
            Path dump = null;
            boolean dumpOnly = false;
            for (int index = 0; index < args.length; index++) {
                switch (args[index]) {
                    case "--workload" -> workload = args[++index];
                    case "--iterations" -> iterations = Integer.parseInt(args[++index]);
                    case "--warmup" -> warmup = Integer.parseInt(args[++index]);
                    case "--out" -> out = Path.of(args[++index]);
                    case "--dump" -> dump = Path.of(args[++index]);
                    case "--dump-only" -> dumpOnly = true;
                    default -> throw new IllegalArgumentException("unknown argument " + args[index]);
                }
            }
            if (!Arrays.asList("cards", "table", "products").contains(workload)) {
                throw new IllegalArgumentException("--workload must be cards, table, or products");
            }
            int defaultIterations = workload.equals("cards") ? 2_000 : workload.equals("table") ? 200 : 500;
            int defaultWarmup = workload.equals("cards") ? 200 : workload.equals("table") ? 20 : 50;
            return new Options(workload, iterations == null ? defaultIterations : iterations,
                warmup == null ? defaultWarmup : warmup, out, dump, dumpOnly);
        }
    }
}
