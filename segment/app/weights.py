"""Download the weights the chosen engine needs, before the server starts.

Keeping this separate from the server means the first request never pays for a
multi-gigabyte download, and a gated SAM 3 repo fails here with a clear message
instead of at request time.
"""

from __future__ import annotations

import argparse
import os
import sys

from .config import Settings


def _hf_token() -> str | None:
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    return token.strip() if token and token.strip() else None


def download(model_ids: list[str], *, allow_failure: set[str]) -> list[str]:
    from huggingface_hub import snapshot_download

    problems: list[str] = []
    for model_id in model_ids:
        print(f"-> {model_id}", flush=True)
        try:
            path = snapshot_download(
                repo_id=model_id,
                token=_hf_token(),
                allow_patterns=[
                    "*.json",
                    "*.txt",
                    "*.safetensors",
                    "*.model",
                    "*.py",
                ],
                ignore_patterns=["*.bin", "*.h5", "*.msgpack", "*.onnx"],
            )
            print(f"   ready at {path}", flush=True)
        except Exception as exc:
            if model_id in allow_failure:
                problems.append(f"{model_id}: {type(exc).__name__}: {exc}")
                print(f"   SKIPPED ({type(exc).__name__}: {exc})", flush=True)
                continue
            raise
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download segmentation model weights")
    parser.add_argument(
        "--engine",
        default=os.environ.get("SEGMENT_ENGINE", "auto"),
        choices=["auto", "sam3", "dino_sam2"],
    )
    parser.add_argument(
        "--sam3-model",
        default=None,
        help="Override the SAM 3 repo id, for example facebook/sam3.1",
    )
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    sam3_id = args.sam3_model or settings.sam3_model_id
    skipped: list[str] = []

    if args.engine in ("auto", "sam3"):
        # auto may fall through; a forced sam3 engine must actually get the weights.
        skipped = download([sam3_id], allow_failure={sam3_id})
        if skipped and args.engine == "auto":
            print(
                "SAM 3 weights are gated: request access to the repo on Hugging Face "
                "(accept the SAM License), then set HF_TOKEN. Falling back to "
                "Grounding DINO + SAM 2.1, which need no approval.",
                file=sys.stderr,
            )
        if skipped and args.engine == "sam3":
            print("SEGMENT_ENGINE=sam3 but the weights could not be downloaded.", file=sys.stderr)
            return 1

    # SAM 2.1 serves the unnamed top-objects mode for every engine. Grounding DINO
    # is the named-target detector for dino_sam2, and the runtime fallback for auto.
    needed = [settings.sam2_model_id]
    if args.engine in ("auto", "dino_sam2"):
        needed.insert(0, settings.dino_model_id)
    download(list(dict.fromkeys(needed)), allow_failure=set())
    print("weights ready", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
