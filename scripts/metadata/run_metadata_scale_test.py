# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "click",
#     "girder-client",
#     "setuptools",
# ]
# ///
"""Time metadata ingest (folder index + NDJSON process) on the request thread.

Use against a root created by seed_metadata_scale.py. Captures wall time, HTTP
status / errors, and writes a JSON report for worker-vs-request-thread decisions.
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

    # GirderClient only has _session inside `with gc.session()`; outside that it
    # calls requests.* directly. Inject timeout via sendRestRequest (**kwargs).
    original_send = gc.sendRestRequest

    def send_with_timeout(*args, **kwargs):
        kwargs.setdefault("timeout", timeout)
        return original_send(*args, **kwargs)

    gc.sendRestRequest = send_with_timeout  # type: ignore[method-assign]
    return gc


def summarize_response(payload: Any) -> dict[str, Any]:
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
    # metadataKeys can be huge at 10k — only record key count
    keys = payload.get("metadataKeys")
    if isinstance(keys, dict):
        summary["metadata_key_count"] = len(keys)
    return summary


def timed_post(
    gc: girder_client.GirderClient, path: str, *, parameters: dict | None = None
) -> dict[str, Any]:
    started = time.perf_counter()
    result: dict[str, Any] = {
        "path": path,
        "ok": False,
        "http_status": None,
        "wall_time_s": None,
        "exception": None,
        "response_summary": None,
    }
    try:
        response = gc.post(path, parameters=parameters or {})
        result["ok"] = True
        result["http_status"] = 200
        result["response_summary"] = summarize_response(response)
        # Prefer folder id from response for filter sanity checks
        if isinstance(response, dict):
            result["_folder_id"] = (
                response.get("folderId")
                or response.get("metadataFolderId")
                or None
            )
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
                result["response_summary"] = summarize_response(exc.response.json())
            except Exception:
                result["response_body"] = getattr(exc.response, "text", "")[:1000]
    except Exception as exc:  # noqa: BLE001 — report any failure mode
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
    """Folder indexing via create_metadata_folder (request thread)."""
    display_config = {"display": ["DIVE_DatasetId", "DIVE_Name"], "hide": []}
    ffprobe_metadata = {
        "import": False,
        "keys": ["width", "height", "display_aspect_ratio"],
    }
    click.echo("Phase A: POST dive_metadata/create_metadata_folder/...")
    result = timed_post(
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
    """NDJSON matching via process_metadata (request thread)."""
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
    # Match generateMetadata.py query encoding (json params URL-quoted).
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
    click.echo("Phase B: POST dive_metadata/process_metadata/...")
    result = timed_post(gc, path)
    result.pop("_folder_id", None)
    if result["ok"]:
        # process_metadata marks the seed root itself as the metadata folder
        result["filter_sanity"] = filter_sanity(gc, root_folder_id)
        result["metadata_folder_id"] = root_folder_id
        summary = result.get("response_summary") or {}
        added = summary.get("added")
        err_count = summary.get("error_count")
        click.echo(f"  added={added} errors={err_count}")
    return result


def interpret(phases: dict[str, Any]) -> list[str]:
    """Heuristic notes for request-thread vs worker decision."""
    notes: list[str] = []
    for name, phase in phases.items():
        if not phase:
            continue
        wall = phase.get("wall_time_s") or 0
        if phase.get("exception") and "Timeout" in str(phase.get("exception")):
            notes.append(
                f"{name}: client timeout — request-thread ingest likely insufficient "
                "(move to local worker job, or raise proxy/client timeouts only as a stopgap)."
            )
        elif not phase.get("ok"):
            notes.append(
                f"{name}: failed ({phase.get('exception') or phase.get('http_status')}) "
                "— investigate server logs for OOM / proxy / CherryPy errors."
            )
        elif wall > 300:
            notes.append(
                f"{name}: completed in {wall}s (>5 min) — too slow for interactive UX; "
                "prefer a local worker with progress/cancel even if sync eventually succeeds."
            )
        elif wall > 120:
            notes.append(
                f"{name}: completed in {wall}s (>2 min) — borderline for interactive import; "
                "consider worker for UX."
            )
        else:
            notes.append(
                f"{name}: completed in {wall}s — sync may be acceptable short-term; "
                "still consider worker for progress/cancel."
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
    help="Client HTTP read timeout in seconds",
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
    """Time Phase A (folder index) and/or Phase B (NDJSON process_metadata)."""
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
