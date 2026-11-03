# Metadata 10k Scale Test

Harness to time DIVE Metadata ingest (folder indexing and NDJSON
`process_metadata`) on the Celery **`local`** worker queue.

Both ingest endpoints enqueue a Girder job and return immediately. This test
seeds lightweight datasets (no video upload / postprocess), then times enqueue
plus job completion.

## Prerequisites

- Local DIVE / Girder reachable (default `http://127.0.0.1:8010`)
- **`localworker`** running (`celery -A girder_worker.app worker -Q local`)
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

### 2. Time ingest (local worker jobs)

```bash
uv run run_metadata_scale_test.py \
  --root-folder-id <TEST_ROOT_ID> \
  --timeout 3600 \
  --phases A,B
```

| Phase | Endpoint | What it stresses |
|-------|----------|------------------|
| **A** | `POST /dive_metadata/create_metadata_folder/{root}` | Job: recursive dataset walk + Mongo writes |
| **B** | `POST /dive_metadata/process_metadata/{root}` | Job: full NDJSON load + per-row name/path matching |

Each phase records:

- `enqueue_time_s` — HTTP return of the job document (should stay small)
- `wall_time_s` — enqueue → job `SUCCESS`
- `job_id` / compact `diveMetadataIngestResult` from job `meta`

`--timeout` is the **client** read timeout for individual HTTP calls (enqueue +
polls). Use `3600` for long jobs.

Reports write to `scale_report_<timestamp>.json` (gitignored via `*.json`).

Run a single phase:

```bash
uv run run_metadata_scale_test.py --root-folder-id <ID> --phases A
uv run run_metadata_scale_test.py --root-folder-id <ID> --phases B
```

## Interpreting results

Healthy worker path:

- Enqueue completes quickly (typically well under a few seconds)
- Girder stays responsive to other API calls while the job runs
- Job reaches `SUCCESS` with low `error_count` / good match rate

Investigate if:

- Enqueue is slow (Girder overload) or returns non-job payloads
- Job stuck `INACTIVE` / `QUEUED` (localworker / RabbitMQ)
- Job `ERROR` or OOM on the worker
- High `error_count` / low match rate (correctness, not just speed)

The report `interpretation` array repeats these heuristics from measured times
and errors.

## What this test deliberately skips

- Real video upload / `dive_rpc/postprocess` (wrong bottleneck; see
  `generateMetadata.py` for that path)
- Chunking/streaming NDJSON inside the worker (same full-file load as before;
  off-request-thread first)

## Related scripts

| Script | Role |
|--------|------|
| `generateNDJSON.py` | Standalone fake NDJSON generator |
| `generateMetadata.py` | E2E with video + postprocess (`limit=100`); polls ingest job |
| `seed_metadata_scale.py` | Fast annotate-only seed for scale tests |
| `run_metadata_scale_test.py` | Timed Phase A / B jobs + JSON report |
