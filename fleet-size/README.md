# Fleet size from CPU per response

The HTTP capacity page already translates one-core CPU per response into cores
needed for 10,000 responses/s. This command uses the same formula on a
publication `page-load` capture, at any request rate, with optional headroom.

```
cores = (CPU ms / response) × (target responses / s) / 1000
provisioned = cores × (1 + headroom)
```

It does not run a multi-core benchmark. The portable input is the retained
CPU-time per successful closed-loop response.

## Run

```sh
node fleet-size/run.mjs
node fleet-size/run.mjs --target-rps 1000,10000,50000 --headroom 0.3 --max-cores 16
node fleet-size/run.mjs --capture page-load/results/latest.json --json
```

`--headroom` is a fraction (`0.3` is 30%). `--max-cores` flags cells whose
provisioned value exceeds that budget and exits `2` when any cell does.
Generator-limited or non-publication captures are refused.

Reproduce the published 10,000 responses/s table with the default command
against `page-load/results/latest.json`.

## Tests

```sh
node --test fleet-size/fleet-size.test.mjs
```
