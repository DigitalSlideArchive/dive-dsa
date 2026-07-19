# Metadata 10k Scale Test

Harness to decide whether DIVE Metadata ingest (folder indexing and NDJSON
`process_metadata`) can stay on the Girder **request thread** or should move to a
**local worker job**.

Both paths are synchronous today. This test seeds lightweight datasets (no video
upload / postprocess), then times only the metadata API calls.

## Prerequisites

- Local DIVE / Girder reachable (default `http://127.0.0.1:8010`)
- A writable parent folder ID
- [uv](https://docs.astral.sh/uv/) for script deps
- Optional: `GIRDER_API_KEY` to skip interactive login

## Workflow

### 1. Seed (~10k annotate folders + NDJSON)

```bash
cd scripts/metadata

# Ramp recommended: 1000 → 5000 → 10000 on a clean parent each time
uv run seed_metadata_scale.py \
  --count 10000 \
  --root-folder-id <PARENT_FOLDER_ID> \
  --batch-report 100
```

Creates:

```
{parent}/metadata_scale_test/
  rawdata/{city}/{hospital}/{filename}/   # meta.annotate = true
  info/scale_test.ndjson                  # Key paths start with rawdata/
```

Prints `test_root_id` for the next step. Seed wall time is **not** the metric under
test (many sequential REST folder creates).

Reuse an existing NDJSON:

```bash
uv run seed_metadata_scale.py \
  --count 10000 \
  --root-folder-id <PARENT_FOLDER_ID> \
  --ndjson scale_test.ndjson
```

### 2. Time ingest (request thread)

```bash
uv run run_metadata_scale_test.py \
  --root-folder-id <TEST_ROOT_ID> \
  --timeout 3600 \
  --phases A,B
```

| Phase | Endpoint | What it stresses |
|-------|----------|------------------|
| **A** | `POST /dive_metadata/create_metadata_folder/{root}` | Recursive dataset walk + Mongo writes |
| **B** | `POST /dive_metadata/process_metadata/{root}` | Full NDJSON load + per-row name/path matching |

`--timeout` is the **client** read timeout. Use a value close to your proxy /
load-balancer limit if you want to see production-like failures (e.g. `60` or
`300`), or `3600` to measure how long a successful sync run actually takes.

Reports write to `scale_report_<timestamp>.json` (gitignored via `*.json`).

Run a single phase:

```bash
uv run run_metadata_scale_test.py --root-folder-id <ID> --phases A
uv run run_metadata_scale_test.py --root-folder-id <ID> --phases B
```

## Interpreting results

Treat **request-thread ingest as insufficient** if any of:

- Client or proxy **timeout** before HTTP 200
- Girder becomes **unresponsive** to other API calls while the request runs
- Process **OOM** / Girder restart during NDJSON load
- Wall time **> ~2–5 minutes** for an interactive “Import metadata” UX (even if it eventually succeeds)
- High `error_count` / low match rate (correctness failure at scale, not just speed)

If both phases complete reliably under ~2 minutes with healthy match rates, sync
may be acceptable short-term. Prefer a worker anyway for progress, cancel, and
to avoid blocking CherryPy request threads.

The report `interpretation` array repeats these heuristics from measured wall
times and errors.

## What this test deliberately skips

- Real video upload / `dive_rpc/postprocess` (wrong bottleneck; see
  `generateMetadata.py` for that path)
- Changing server or proxy timeouts
- Implementing worker-backed ingest (evidence only)

## Related scripts

| Script | Role |
|--------|------|
| `generateNDJSON.py` | Standalone fake NDJSON generator |
| `generateMetadata.py` | E2E with video + postprocess (`limit=100`) |
| `seed_metadata_scale.py` | Fast annotate-only seed for scale tests |
| `run_metadata_scale_test.py` | Timed Phase A / B + JSON report |
