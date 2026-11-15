"""Grounding DINO (open-vocabulary text detection) + SAM 2.1 (mask from box).

Both weights are ungated and Apache-2.0, so this engine works today on the
cluster without waiting for the gated SAM 3 approval. The detector localises
the target from its name, SAM 2.1 turns each box into an exact silhouette.
"""

from __future__ import annotations

import numpy as np

from ..config import Settings
from . import Instance, Segmenter

SAM2_LOGIT_THRESHOLD = 0.0


class DinoSam2Engine(Segmenter):
    name = "dino_sam2"

    def __init__(self, settings: Settings):
        import torch
        from transformers import (
            AutoModelForZeroShotObjectDetection,
            AutoProcessor,
            Sam2Model,
            Sam2Processor,
        )

        self.torch = torch
        self.settings = settings
        self.device = settings.resolve_device()
        self.dino_processor = AutoProcessor.from_pretrained(settings.dino_model_id)
        self.dino = (
            AutoModelForZeroShotObjectDetection.from_pretrained(settings.dino_model_id)
            .to(self.device)
            .eval()
        )
        self.sam2_processor = Sam2Processor.from_pretrained(settings.sam2_model_id)
        self.sam2 = Sam2Model.from_pretrained(settings.sam2_model_id).to(self.device).eval()
        self.detail = (
            f"{settings.dino_model_id} + {settings.sam2_model_id} on {self.device}"
        )

    def instances(self, image, target: str) -> list[Instance]:
        boxes, box_scores = self._detect(image, target)
        if not boxes:
            return []
        masks, iou_scores = self._segment(image, boxes)
        out: list[Instance] = []
        for mask, box_score, iou in zip(masks, box_scores, iou_scores):
            if mask is None:
                continue
            out.append(Instance(score=float(box_score) * float(iou), mask=mask))
        return out

    def _detect(self, image, target: str) -> tuple[list[list[float]], list[float]]:
        torch = self.torch
        prompt = target.strip().lower()
        if not prompt.endswith("."):
            prompt = f"{prompt}."
        inputs = self.dino_processor(images=image, text=prompt, return_tensors="pt").to(self.device)
        with torch.inference_mode():
            outputs = self.dino(**inputs)
        result = self.dino_processor.post_process_grounded_object_detection(
            outputs,
            inputs["input_ids"],
            threshold=self.settings.box_threshold,
            text_threshold=self.settings.text_threshold,
            target_sizes=[image.size[::-1]],
        )[0]
        boxes = [_as_list(box) for box in result["boxes"]]
        scores = [float(score) for score in result["scores"]]
        order = np.argsort(scores)[::-1][: self.settings.max_boxes_per_target]
        return [boxes[int(i)] for i in order], [scores[int(i)] for i in order]

    def propose(self, image) -> list[Instance]:
        from ..salient import GridMasker

        masker = GridMasker(
            self.sam2, self.sam2_processor, self.torch, self.device, self.settings
        )
        return masker.propose(image, self.settings.amg_points_per_side)

    def _segment(self, image, boxes: list[list[float]]):
        torch = self.torch
        inputs = self.sam2_processor(
            images=image, input_boxes=[boxes], return_tensors="pt"
        ).to(self.device)
        with torch.inference_mode():
            outputs = self.sam2(**inputs)
        processed = self.sam2_processor.post_process_masks(
            outputs.pred_masks.detach().cpu(),
            inputs["original_sizes"],
            SAM2_LOGIT_THRESHOLD,
            True,
        )
        masks = np.asarray(processed[0])
        iou_scores = np.asarray(outputs.iou_scores.detach().cpu().numpy()[0])
        return best_per_prompt(masks, iou_scores)


def best_per_prompt(masks: np.ndarray, scores: np.ndarray):
    """SAM 2 returns three candidate masks per prompt: keep the best-scoring one."""
    masks = np.asarray(masks)
    scores = np.asarray(scores).reshape(masks.shape[0], -1)
    pick = scores.argmax(axis=1)
    selected = [masks[index, pick[index]].astype(bool) for index in range(masks.shape[0])]
    return selected, [float(scores[index, pick[index]]) for index in range(masks.shape[0])]


def _as_list(box) -> list[float]:
    if hasattr(box, "tolist"):
        box = box.tolist()
    return [float(value) for value in box]
