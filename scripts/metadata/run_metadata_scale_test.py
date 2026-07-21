# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "click",
#     "girder-client",
#     "setuptools",
# ]
# ///
"""Time metadata ingest (folder index + NDJSON process) via local-worker jobs.

Use against a root created by seed_metadata_scale.py. Captures enqueue latency,
job wall time to SUCCESS, and writes a JSON report.
"""
from __future__ import annotations

import json
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import click
import girder_client
import requests

# Girder JobStatus numeric values
JOB_SUCCESS = 3
JOB_ERROR = 4
JOB_CANCELED = 5
TERMINAL_JOB_STATUSES = {JOB_SUCCESS, JOB_ERROR, JOB_CANCELED}


def login(
    api_url: str, port: int, api_key: str | None, timeout: float
) -> girder_client.GirderClient:
    gc = girder_client.GirderClient(
        api_url, port=port, apiRoot="api/v1", scheme="http"
    )
    if api_key:
        gc.authenticate(apiKey=api_key)
    else:
        gc.authenticate(interactive=True)

    original_send = gc.sendRestRequest

    def send_with_timeout(*args, **kwargs):
        kwargs.setdefault("timeout", timeout)
        return original_send(*args, **kwargs)

    gc.sendRestRequest = send_with_timeout  # type: ignore[method-assign]
    return gc


def summarize_ingest_result(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"raw_type": type(payload).__name__, "raw": str(payload)[:500]}

    errors = payload.get("errors") or payload.get("errorLog") or []
    summary: dict[str, Any] = {
        "results": payload.get("results"),
        "folderId": payload.get("folderId") or payload.get("metadataFolderId"),
        "added": payload.get("added"),
        "existing": payload.get("existing"),
        "datasetCount": payload.get("datasetCount"),
        "dataFileName": payload.get("dataFileName"),
        "error_count": len(errors) if isinstance(errors, list) else None,
    }
    if isinstance(errors, list) and errors:
        summary["error_sample"] = errors[:5]
    keys = payload.get("metadataKeys")
    if isinstance(keys, dict):
        if "_keyCount" in keys:
            summary["metadata_key_count"] = keys["_keyCount"]
        else:
            summary["metadata_key_count"] = len(keys)
    return summary


def wait_for_job(
    gc: girder_client.GirderClient,
    job_id: str,
    *,
    poll_interval: float = 2.0,
) -> dict[str, Any]:
    """Poll until the job reaches a terminal status; return final job doc."""
    while True:
        job = gc.get(f"job/{job_id}")
        status = job.get("status")
        if status in TERMINAL_JOB_STATUSES:
            return job
        time.sleep(poll_interval)


def timed_ingest_post(
    gc: girder_client.GirderClient,
    path: str,
    *,
    parameters: dict | None = None,
    poll_interval: float = 2.0,
) -> dict[str, Any]:
    """POST ingest endpoint (returns job), then poll until SUCCESS/ERROR."""
    started = time.perf_counter()
    result: dict[str, Any] = {
        "path": path,
        "ok": False,
        "http_status": None,
        "enqueue_time_s": None,
        "wall_time_s": None,
        "job_id": None,
        "job_status": None,
        "exception": None,
        "response_summary": None,
    }
    try:
        enqueue_started = time.perf_counter()
        job = gc.post(path, parameters=parameters or {})
        result["enqueue_time_s"] = round(time.perf_counter() - enqueue_started, 3)
        result["http_status"] = 200
        if not isinstance(job, dict) or not job.get("_id"):
            result["exception"] = f"Expected Girder job document, got: {type(job).__name__}"
            return result
        job_id = str(job["_id"])
        result["job_id"] = job_id
        click.echo(f"  job={job_id} (enqueue {result['enqueue_time_s']}s)")

        final_job = wait_for_job(gc, job_id, poll_interval=poll_interval)
        result["job_status"] = final_job.get("status")
        ingest_result = (final_job.get("meta") or {}).get("diveMetadataIngestResult") or {}
        result["response_summary"] = summarize_ingest_result(ingest_result)
        if final_job.get("status") == JOB_SUCCESS:
            result["ok"] = True
            if isinstance(ingest_result, dict):
                result["_folder_id"] = (
                    ingest_result.get("folderId")
                    or ingest_result.get("metadataFolderId")
                    or None
                )
        else:
            log = (final_job.get("log") or "")[-1000:]
            result["exception"] = f"Job status={final_job.get('status')}: {log}"
    except requests.exceptions.Timeout as exc:
        result["exception"] = f"Timeout: {exc}"
        result["http_status"] = None
    except girder_client.HttpError as exc:
        result["exception"] = str(exc)
        result["http_status"] = getattr(exc, "status", None) or getattr(
            exc, "response", None
        )
        if hasattr(exc, "response") and exc.response is not None:
            result["http_status"] = getattr(exc.response, "status_code", result["http_status"])
            try:
                result["response_summary"] = summarize_ingest_result(exc.response.json())
            except Exception:
                result["response_body"] = getattr(exc.response, "text", "")[:1000]
    except Exception as exc:  # noqa: BLE001
        result["exception"] = f"{type(exc).__name__}: {exc}"
    finally:
        result["wall_time_s"] = round(time.perf_counter() - started, 3)
    return result


def filter_sanity(
    gc: girder_client.GirderClient, metadata_folder_id: str
) -> dict[str, Any]:
    started = time.perf_counter()
    out: dict[str, Any] = {"ok": False, "wall_time_s": None, "exception": None}
    try:
        response = gc.get(
            f"dive_metadata/{metadata_folder_id}/filter",
            parameters={
                "limit": 1,
                "offset": 0,
                "filters": json.dumps({}),
            },
        )
        out["ok"] = True
        if isinstance(response, dict):
            out["filtered"] = response.get("filtered")
            out["count"] = response.get("count")
            out["totalPages"] = response.get("totalPages")
            if "pageResults" in response:
                out["page_result_len"] = len(response.get("pageResults") or [])
    except Exception as exc:  # noqa: BLE001
        out["exception"] = f"{type(exc).__name__}: {exc}"
    out["wall_time_s"] = round(time.perf_counter() - started, 3)
    return out


def run_phase_a(gc: girder_client.GirderClient, root_folder_id: str) -> dict[str, Any]:
    """Folder indexing via create_metadata_folder (local worker job)."""
    display_config = {"display": ["DIVE_DatasetId", "DIVE_Name"], "hide": []}
    ffprobe_metadata = {
        "import": False,
        "keys": ["width", "height", "display_aspect_ratio"],
    }
    click.echo("Phase A: POST dive_metadata/create_metadata_folder/ (job)...")
    result = timed_ingest_post(
        gc,
        f"dive_metadata/create_metadata_folder/{root_folder_id}",
        parameters={
            "name": "Scale Test Metadata",
            "rootFolderId": root_folder_id,
            "categoricalLimit": 50,
            "displayConfig": json.dumps(display_config),
            "ffprobeMetadata": json.dumps(ffprobe_metadata),
        },
    )
    folder_id = result.pop("_folder_id", None)
    if result["ok"] and folder_id:
        click.echo(f"  metadata folder: {folder_id}")
        result["filter_sanity"] = filter_sanity(gc, folder_id)
        result["metadata_folder_id"] = folder_id
    return result


def run_phase_b(gc: girder_client.GirderClient, root_folder_id: str) -> dict[str, Any]:
    """NDJSON matching via process_metadata (local worker job)."""
    params = {
        "displayConfig": {
            "display": [
                "PatientName",
                "SampleDate",
                "Age",
                "Height",
                "Weight",
                "City",
                "State",
            ],
            "hide": [],
        },
        "ffprobeMetadata": {
            "import": False,
            "keys": ["width", "height", "display_aspect_ratio"],
        },
        "pathKey": "Key",
        "matcher": "Filename",
        "fileType": "ndjson",
        "sibling_path": "info",
    }
    query = {
        "displayConfig": urllib.parse.quote(json.dumps(params["displayConfig"])),
        "ffprobeMetadata": urllib.parse.quote(json.dumps(params["ffprobeMetadata"])),
        "path_key": params["pathKey"],
        "matcher": params["matcher"],
        "fileType": params["fileType"],
        "sibling_path": params["sibling_path"],
    }
    query_string = "&".join(f"{key}={value}" for key, value in query.items())
    path = f"dive_metadata/process_metadata/{root_folder_id}?{query_string}"
    click.echo("Phase B: POST dive_metadata/process_metadata/ (job)...")
    result = timed_ingest_post(gc, path)
    result.pop("_folder_id", None)
    if result["ok"]:
        result["filter_sanity"] = filter_sanity(gc, root_folder_id)
        result["metadata_folder_id"] = root_folder_id
        summary = result.get("response_summary") or {}
        added = summary.get("added")
        err_count = summary.get("error_count")
        click.echo(f"  added={added} errors={err_count}")
    return result


def interpret(phases: dict[str, Any]) -> list[str]:
    """Heuristic notes for local-worker ingest health."""
    notes: list[str] = []
    for name, phase in phases.items():
        if not phase:
            continue
        wall = phase.get("wall_time_s") or 0
        enqueue = phase.get("enqueue_time_s")
        if phase.get("exception") and "Timeout" in str(phase.get("exception")):
            notes.append(
                f"{name}: client timeout during enqueue or poll — check localworker / RabbitMQ."
            )
        elif not phase.get("ok"):
            notes.append(
                f"{name}: failed ({phase.get('exception') or phase.get('http_status')}) "
                "— investigate job log and localworker."
            )
        elif enqueue is not None and enqueue > 5:
            notes.append(
                f"{name}: enqueue took {enqueue}s — request path should stay fast; "
                "check Girder overload."
            )
        elif wall > 300:
            notes.append(
                f"{name}: job completed in {wall}s (>5 min) — still slow at scale; "
                "consider chunking/streaming next."
            )
        elif wall > 120:
            notes.append(
                f"{name}: job completed in {wall}s (>2 min) — acceptable off-request-thread "
                "if Girder stayed responsive."
            )
        else:
            notes.append(
                f"{name}: completed in {wall}s (enqueue {enqueue}s) — healthy worker path."
            )

        summary = phase.get("response_summary") or {}
        err_count = summary.get("error_count")
        if isinstance(err_count, int) and err_count > 0:
            notes.append(
                f"{name}: {err_count} match/index errors — check Key/Filename alignment "
                "and path matching; high error rates are a correctness failure at scale."
            )
    return notes


@click.command(name="RunMetadataScaleTest")
@click.option(
    "--root-folder-id",
    required=True,
    help="Seed test root from seed_metadata_scale.py (contains rawdata/ and info/)",
)
@click.option("--api-url", default="127.0.0.1", show_default=True)
@click.option("--port", default=8010, show_default=True, type=int)
@click.option("--api-key", default=None, envvar="GIRDER_API_KEY", help="Optional API key")
@click.option(
    "--timeout",
    default=3600,
    show_default=True,
    type=float,
    help="Client HTTP read timeout in seconds (enqueue + polls)",
)
@click.option(
    "--phases",
    default="A,B",
    show_default=True,
    help="Comma-separated phases: A=create_metadata_folder, B=process_metadata",
)
@click.option(
    "--report",
    default=None,
    help="JSON report path (default: scripts/metadata/scale_report_<timestamp>.json)",
)
def run_metadata_scale_test(
    root_folder_id: str,
    api_url: str,
    port: int,
    api_key: str | None,
    timeout: float,
    phases: str,
    report: str | None,
) -> None:
    """Time Phase A (folder index) and/or Phase B (NDJSON process_metadata) as jobs."""
    selected = {p.strip().upper() for p in phases.split(",") if p.strip()}
    unknown = selected - {"A", "B"}
    if unknown:
        raise click.ClickException(f"Unknown phases: {', '.join(sorted(unknown))}")
    if not selected:
        raise click.ClickException("No phases selected")

    gc = login(api_url, port, api_key, timeout)
    root = gc.getFolder(root_folder_id)
    click.echo(f"Root: {root['name']} ({root_folder_id})")
    click.echo(f"Client timeout: {timeout}s")
    click.echo(f"Phases: {', '.join(sorted(selected))}")
    click.echo("")

    phase_results: dict[str, Any] = {}
    if "A" in selected:
        phase_results["A_create_metadata_folder"] = run_phase_a(gc, root_folder_id)
        click.echo(
            f"  wall_time_s={phase_results['A_create_metadata_folder']['wall_time_s']} "
            f"ok={phase_results['A_create_metadata_folder']['ok']}"
        )
        click.echo("")
    if "B" in selected:
        phase_results["B_process_metadata"] = run_phase_b(gc, root_folder_id)
        click.echo(
            f"  wall_time_s={phase_results['B_process_metadata']['wall_time_s']} "
            f"ok={phase_results['B_process_metadata']['ok']}"
        )
        click.echo("")

    notes = interpret(phase_results)
    report_doc = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "root_folder_id": root_folder_id,
        "root_folder_name": root.get("name"),
        "api_url": api_url,
        "port": port,
        "timeout_s": timeout,
        "phases": phase_results,
        "interpretation": notes,
    }

    script_dir = Path(__file__).resolve().parent
    if report:
        report_path = Path(report)
    else:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        report_path = script_dir / f"scale_report_{stamp}.json"

    report_path.write_text(json.dumps(report_doc, indent=2), encoding="utf-8")
    click.echo(f"Report: {report_path}")
    click.echo("Interpretation:")
    for note in notes:
        click.echo(f"  - {note}")


if __name__ == "__main__":
    run_metadata_scale_test()
