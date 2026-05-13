"""
Helpers for metadata key ranges and tabular import numbers.

Pandas often yields NaN for empty CSV cells; JSON imports can also surface NaN or
Infinity because Python's json.loads accepts those literals by default. min/max
and stored values must stay finite for Girder's JSON (allow_nan=False).
"""

from __future__ import annotations

import math
import numbers
from typing import Any, Iterable


def as_json_finite_float(x: Any, default: float = 0.0) -> float:
    """Coerce to float; return default if missing, non-numeric, nan, or inf."""
    if isinstance(x, bool):
        return default
    try:
        fx = float(x)
    except (TypeError, ValueError):
        return default
    return fx if math.isfinite(fx) else default


def as_finite_float_or_none(x: Any) -> float | None:
    """Finite float or None (reject bool / nan / inf)."""
    if isinstance(x, bool):
        return None
    try:
        fx = float(x)
    except (TypeError, ValueError):
        return None
    return fx if math.isfinite(fx) else None


def is_nonfinite_numeric_placeholder(v: Any) -> bool:
    """
    True for NaN/inf reals (bool excluded). Used when merging values into string
    categorical aggregates so CSV NaN columns do not pollute sets.
    """
    if isinstance(v, bool):
        return False
    if isinstance(v, numbers.Real):
        return not math.isfinite(float(v))
    return False


def merge_finite_numeric_range_dict(
    current_range: dict[str, Any] | None, sample: Any
) -> dict[str, float] | None:
    """
    Merge one numeric sample into a metadataKeys-style {'min','max'} dict.

    Endpoints must already be finite or missing; non-finite samples are skipped
    (returns None). If an endpoint is missing/non-finite, range is re-seeded from
    the sample only (safe for initial key inference from clean rows).
    """
    fv = as_finite_float_or_none(sample)
    if fv is None:
        return None
    if not isinstance(current_range, dict):
        return {'min': fv, 'max': fv}
    lo = as_finite_float_or_none(current_range.get('min'))
    hi = as_finite_float_or_none(current_range.get('max'))
    if lo is None or hi is None:
        return {'min': fv, 'max': fv}
    return {'min': min(fv, lo), 'max': max(fv, hi)}


def merge_numeric_sample_into_range_dict(rng: dict[str, Any], sample: Any) -> bool:
    """
    Lenient in-place merge for persisted metadataKeys ranges (may contain legacy
    non-finite endpoints). Returns False if sample is not a finite float.
    """
    fv = as_finite_float_or_none(sample)
    if fv is None:
        return False
    lo = as_json_finite_float(rng.get('min'), fv)
    hi = as_json_finite_float(rng.get('max'), fv)
    rng['min'] = min(fv, lo)
    rng['max'] = max(fv, hi)
    if rng['min'] > rng['max']:
        rng['min'], rng['max'] = rng['max'], rng['min']
    return True


def finalize_metadata_keys_numerical_range(r: dict[str, Any]) -> None:
    """Normalize min/max to finite JSON-safe floats and fix inversion (mutates r)."""
    lo = as_json_finite_float(r.get('min'), 0.0)
    hi = as_json_finite_float(r.get('max'), 0.0)
    if lo > hi:
        lo, hi = hi, lo
    r['min'], r['max'] = lo, hi


def finite_numeric_samples(values: Iterable[Any]) -> list[float]:
    """Collect finite floats from a mixed-value iterable (e.g. CSV column values)."""
    out: list[float] = []
    for v in values:
        if isinstance(v, bool):
            continue
        if isinstance(v, numbers.Real):
            fx = float(v)
            if math.isfinite(fx):
                out.append(fx)
    return out


def safe_min_max(values: Iterable[Any]) -> tuple[float, float] | None:
    """Return (min, max) over finite numeric samples, or None if empty."""
    nums = finite_numeric_samples(values)
    if not nums:
        return None
    return min(nums), max(nums)


def categorical_values_for_schema(values: Iterable[Any]) -> list[Any]:
    """Drop non-finite numeric placeholders (CSV NaN) so metadata key sets stay JSON-safe."""
    out: list[Any] = []
    for v in values:
        if isinstance(v, numbers.Real) and not isinstance(v, bool):
            if not math.isfinite(float(v)):
                continue
        out.append(v)
    return out


def _float_or_nan(x: Any) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return float('nan')


def repair_numerical_ranges_in_metadata_keys_doc(metadata_key_doc: dict) -> bool:
    """
    Normalize every numerical key's range to JSON-safe finite floats.

    Mutates metadata_key_doc in place. Returns True if anything was changed
    (caller may persist with Model.save).
    """
    keys = metadata_key_doc.get('metadataKeys') or {}
    changed = False
    for _name, item in keys.items():
        if not isinstance(item, dict) or item.get('category') != 'numerical':
            continue
        r = item.get('range')
        if not isinstance(r, dict):
            item['range'] = {'min': 0.0, 'max': 0.0}
            changed = True
            continue
        raw_lo = _float_or_nan(r.get('min'))
        raw_hi = _float_or_nan(r.get('max'))
        lo = as_json_finite_float(raw_lo, 0.0)
        hi = as_json_finite_float(raw_hi, 0.0)
        if lo > hi:
            lo, hi = hi, lo
        # Always rewrite when originals were non-finite, inverted, or differ from normalized pair
        if (
            (not math.isfinite(raw_lo))
            or (not math.isfinite(raw_hi))
            or raw_lo > raw_hi
            or lo != raw_lo
            or hi != raw_hi
        ):
            r['min'] = lo
            r['max'] = hi
            changed = True
    return changed


def sanitize_categorical_sets_in_metadata_keys_doc(metadata_key_doc: dict) -> bool:
    """Remove NaN/inf from categorical value sets (mutates doc)."""
    keys = metadata_key_doc.get('metadataKeys') or {}
    changed = False
    for _name, item in keys.items():
        if not isinstance(item, dict) or item.get('category') != 'categorical':
            continue
        s = item.get('set')
        if not isinstance(s, list):
            continue
        cleaned = categorical_values_for_schema(s)
        if len(cleaned) != len(s):
            item['set'] = cleaned
            changed = True
    return changed


def deep_strip_nonfinite_numbers(metadata_key_doc: dict) -> bool:
    """
    Catch-all for DIVE_MetadataKeys documents: non-finite reals in dict values (min/max -> 0),
    non-finite list elements removed. Returns whether any mutation occurred.
    """
    return sanitize_value_tree_for_girder_json(metadata_key_doc, minmax_keys_to_zero=True)


def sanitize_value_tree_for_girder_json(root: Any, *, minmax_keys_to_zero: bool = False) -> bool:
    """
    Mutate dict/list trees in place so json.dumps(..., allow_nan=False) succeeds.

    - Dict values that are non-finite reals become None, or 0.0 for keys 'min'/'max' when
      minmax_keys_to_zero=True (metadata key range endpoints).
    - Non-finite reals are removed from lists (e.g. categorical value sets, filter value lists).
    """
    changed = False

    def walk(o: Any) -> None:
        nonlocal changed
        if isinstance(o, dict):
            for k, v in list(o.items()):
                if isinstance(v, (dict, list)):
                    walk(v)
                elif isinstance(v, numbers.Real) and not isinstance(v, bool):
                    fx = float(v)
                    if not math.isfinite(fx):
                        o[k] = 0.0 if (minmax_keys_to_zero and k in ('min', 'max')) else None
                        changed = True
        elif isinstance(o, list):
            i = 0
            while i < len(o):
                v = o[i]
                if isinstance(v, (dict, list)):
                    walk(v)
                    i += 1
                elif isinstance(v, numbers.Real) and not isinstance(v, bool):
                    if not math.isfinite(float(v)):
                        del o[i]
                        changed = True
                        continue
                i += 1

    walk(root)
    return changed


def coerce_export_empty_strings(root: Any) -> None:
    """
    For tabular/JSON export: use empty string instead of null/NaN for missing or invalid
    categorical/search/string-friendly cells (re-import friendly).
    """
    if isinstance(root, dict):
        for k, v in list(root.items()):
            if isinstance(v, dict):
                coerce_export_empty_strings(v)
            elif isinstance(v, list):
                for i, el in enumerate(v):
                    if isinstance(el, (dict, list)):
                        coerce_export_empty_strings(el)
                    elif el is None:
                        root[k][i] = ''
                    elif isinstance(el, numbers.Real) and not isinstance(el, bool) and not math.isfinite(float(el)):
                        root[k][i] = ''
                    elif isinstance(el, str) and el.strip().lower() == 'nan':
                        root[k][i] = ''
            elif v is None:
                root[k] = ''
            elif isinstance(v, numbers.Real) and not isinstance(v, bool) and not math.isfinite(float(v)):
                root[k] = ''
            elif isinstance(v, str) and v.strip().lower() == 'nan':
                root[k] = ''
    elif isinstance(root, list):
        i = 0
        while i < len(root):
            el = root[i]
            if isinstance(el, dict):
                coerce_export_empty_strings(el)
                i += 1
            elif isinstance(el, list):
                coerce_export_empty_strings(el)
                i += 1
            elif el is None:
                root[i] = ''
                i += 1
            elif isinstance(el, numbers.Real) and not isinstance(el, bool) and not math.isfinite(float(el)):
                root[i] = ''
                i += 1
            elif isinstance(el, str) and el.strip().lower() == 'nan':
                root[i] = ''
                i += 1
            else:
                i += 1


def sanitize_metadata_keys_doc_for_api(metadata_key_doc: dict) -> bool:
    """Repair all known JSON hazards in a DIVE_MetadataKeys document; returns whether to save."""
    c1 = repair_numerical_ranges_in_metadata_keys_doc(metadata_key_doc)
    c2 = sanitize_categorical_sets_in_metadata_keys_doc(metadata_key_doc)
    c3 = deep_strip_nonfinite_numbers(metadata_key_doc)
    return c1 or c2 or c3
