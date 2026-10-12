#!/usr/bin/env python3
"""Local sanity checks for SAM 3.1 multiplex checkpoint loading patches."""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow importing SAM3Demo helpers when run from repo root or SAM3Demo/
sys.path.insert(0, str(Path(__file__).resolve().parent))

from SAM3Demo import (  # noqa: E402
    _patch_sam3_multiplex_checkpoint_preload,
    _patch_sam3_offload_state_to_cpu_kwarg,
    _prepare_sam31_multiplex_checkpoint,
)


def test_patches_apply() -> None:
    _patch_sam3_offload_state_to_cpu_kwarg()
    _patch_sam3_multiplex_checkpoint_preload()
    import sam3.model_builder as model_builder

    assert getattr(model_builder, '_sam3demo_skip_tracker_preload', False)
    print('OK: multiplex checkpoint preload patch applied')


def test_checkpoint_key_layout(checkpoint_path: Path) -> None:
    ckpt = _prepare_sam31_multiplex_checkpoint(checkpoint_path)
    keys = list(ckpt.keys())
    has_detector = any(k.startswith('detector.') for k in keys)
    has_tracker = any(k.startswith('tracker.model.') for k in keys)
    print(f'Checkpoint keys: {len(keys)} total')
    print(f'  detector.* present: {has_detector}')
    print(f'  tracker.model.* present: {has_tracker}')
    if not (has_detector and has_tracker):
        raise SystemExit(
            'Checkpoint does not look like SAM 3.1 multiplex (expected detector.* and tracker.model.*)'
        )
    print('OK: checkpoint key layout')


def test_build_predictor(checkpoint_path: Path | None) -> None:
    import torch

    if not torch.cuda.is_available():
        print('SKIP: CUDA not available for predictor build')
        return

    _patch_sam3_offload_state_to_cpu_kwarg()
    _patch_sam3_multiplex_checkpoint_preload()
    from sam3.model_builder import build_sam3_multiplex_video_predictor

    ckpt = str(checkpoint_path) if checkpoint_path else None
    print(f'Building predictor (checkpoint={ckpt or "HF Hub"})...')
    predictor = build_sam3_multiplex_video_predictor(
        checkpoint_path=ckpt,
        use_fa3=False,
        use_rope_real=False,
        async_loading_frames=False,
    )
    print(f'OK: predictor built: {type(predictor).__name__}')


def main() -> None:
    test_patches_apply()
    ckpt_env = os.environ.get('SAM3_CHECKPOINT', '/opt/SAM3/models/sam3.1_multiplex.pt')
    ckpt_path = Path(ckpt_env)
    if ckpt_path.is_file():
        test_checkpoint_key_layout(ckpt_path)
        if '--build' in sys.argv:
            test_build_predictor(ckpt_path)
    else:
        print(f'SKIP: checkpoint not found at {ckpt_path} (set SAM3_CHECKPOINT to test layout/build)')
        if '--build' in sys.argv:
            test_build_predictor(None)


if __name__ == '__main__':
    main()
