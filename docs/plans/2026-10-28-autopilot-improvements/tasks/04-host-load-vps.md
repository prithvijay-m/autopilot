# 04: Host-load: cgroup limits, reserve, bound readout

Security: no
Graph: lanes(), main()
Spec: 3.5
Decisions: D12, D24

## Goal
Lane sizing that sees what a VPS or container really allows: the cgroup v2 CPU quota and memory limit, a memory reserve kept free for the OS and the session, and a readout that says which limit is binding (request item 1).

## Interfaces
Provides (in `scripts/host-load.mjs`):
- `lanes({ max, cores, load, freeGb, laneGb = 1.5, reserveGb = 0 })` returns a number: `max(1, min(max, floor(cores - load), floor((freeGb - reserveGb) / laneGb)))`. The default `reserveGb = 0` keeps today's callers and tests unchanged.
- `explain(sameArgs)` returns `{ lanes, bound }`, where `bound` is `"plan" | "cpu" | "memory"`: the smallest of the three terms. Ties go to plan first, then cpu, then memory.
- `reserveFor(totalGb)` returns `Math.max(1, totalGb * 0.1)`.
- `readCgroup(dir = "/sys/fs/cgroup")` returns `{ cpus: number | null, memFreeGb: number | null }`. `cpu.max` of `"<quota> <period>"` gives quota/period; `"max ..."` gives null. `memory.max` minus `memory.current`, in GiB, gives memFreeGb; `"max"` gives null. Missing or unreadable files give null. It never throws.
- CLI `host-load.mjs <max> [--json]` prints `lanes: N of M (cores C, load L, free F of T GB, reserve R GB, bound by X)`. C, L, F, T and R use one decimal. cores is `min(os cores, cgroup cpus)`; free is `min(os free, cgroup memFreeGb)`; T is the OS total. `--json` prints `{ lanes, max, cores, load, freeGb, totalGb, reserveGb, bound }`. It always exits 0, and on any error prints `lanes: 1 (could not read the host: <msg>)`.
- `AUTOPILOT_LANE_GB` still sets laneGb.

Consumes: nothing. The conductor reads only the `lanes: N` prefix.

## Acceptance criteria
- [ ] A cgroup `cpu.max` of `200000 100000` caps cores at 2. Proof: tests/host-load.test.mjs "cpu quota caps cores" (fixture dir from `tempDir()`).
- [ ] A `cpu.max` of `max 100000` means no CPU cap. Proof: tests/host-load.test.mjs "no quota, no cap".
- [ ] `memory.max` minus `memory.current` caps free memory. Proof: tests/host-load.test.mjs "memory limit caps free memory".
- [ ] A `memory.max` of `max` means no memory cap. Proof: tests/host-load.test.mjs "no memory limit, no cap".
- [ ] A missing cgroup directory gives nulls and does not throw. Proof: tests/host-load.test.mjs "no cgroup".
- [ ] The reserve is max(1 GB, 10% of total). Proof: tests/host-load.test.mjs, where `reserveFor(8) === 1` and `reserveFor(64) === 6.4`.
- [ ] The reserve is taken off free memory before sizing. Proof: `lanes({ max: 5, cores: 8, load: 0, freeGb: 4, laneGb: 1, reserveGb: 1 }) === 3`.
- [ ] A reserve larger than free memory still gives one lane. Proof: `lanes({ max: 5, cores: 8, load: 0, freeGb: 0.5, reserveGb: 1 }) === 1`.
- [ ] `explain` names the binding limit. Proof: tests/host-load.test.mjs "bound by plan", "bound by cpu" and "bound by memory", one assertion each.
- [ ] A tie names plan before cpu before memory. Proof: tests/host-load.test.mjs "ties".
- [ ] The CLI prints the new line and exits 0 for args `5`, `0`, `x` and none. Proof: the CLI test's regex is updated to `^lanes: [1-9]\d* of [1-9]\d* \(cores [\d.]+, load [\d.]+, free [\d.]+ of [\d.]+ GB, reserve [\d.]+ GB, bound by (plan|cpu|memory)\)$`.
- [ ] `--json` prints an object with `lanes`, `max` and `bound`. Proof: tests/host-load.test.mjs "json".
- [ ] The existing six `lanes()` assertions still pass. Proof: `node --test tests/host-load.test.mjs`.

## Tests (red first)
All in `tests/host-load.test.mjs`. Cgroup fixtures are written into a `tempDir()` and removed in `after()`. Never read the real /sys in a unit test; the CLI test only checks the format. Each case goes red before it is implemented.

## Touches
scripts/host-load.mjs, tests/host-load.test.mjs

## Out of scope
Copilot lane shares (07, 20). cgroup v1. Disk space.
