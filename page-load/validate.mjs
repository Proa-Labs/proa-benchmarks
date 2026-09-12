// Every measured page response must be byte-identical to the parity-gated
// dump the same engine produced through its canonical adapter.

import { createHash } from "node:crypto";

export function createValidator({ expectedBytes, expectedSha256 }) {
  return (buffer) => {
    if (buffer.length !== expectedBytes) {
      throw new Error(`response is ${buffer.length} bytes; expected ${expectedBytes}`);
    }
    const digest = createHash("sha256").update(buffer).digest("hex");
    if (digest !== expectedSha256) {
      throw new Error("response bytes differ from the canonical dump");
    }
  };
}
