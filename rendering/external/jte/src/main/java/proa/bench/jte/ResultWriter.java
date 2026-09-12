package proa.bench.jte;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Locale;

final class ResultWriter {
    private ResultWriter() {
    }

    static void write(String fileName, double latencyUs, int outputBytes, int iterations)
            throws IOException {
        Path resultsDir = Path.of("..", "..", "results").normalize();
        Files.createDirectories(resultsDir);

        String json = String.format(
            Locale.ROOT,
            """
            {
              "framework": "jte",
              "language": "Java",
              "runtime": "JVM",
              "mode": "binaryStaticContent + Utf8ByteOutput",
              "latency_us": %.2f,
              "output_bytes": %d,
              "iterations": %d,
              "timestamp": "%s"
            }
            """,
            latencyUs,
            outputBytes,
            iterations,
            Instant.now().toString()
        );

        Files.writeString(resultsDir.resolve(fileName), json);
    }
}
