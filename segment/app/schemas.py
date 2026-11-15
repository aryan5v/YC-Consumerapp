"""Request models for the Fork segmentation service."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class SegmentRequest(BaseModel):
    frame_url: str | None = Field(
        default=None, description="Frame to download server side (http or https)."
    )
    frame_b64: str | None = Field(
        default=None, description="Frame as base64 (a data: URL prefix is allowed)."
    )
    targets: list[str] | None = Field(
        default=None,
        description=(
            "Thing names to find. Omit or send [] for the unnamed mode, which "
            "returns the top salient objects in the frame instead."
        ),
    )
    max_objects: int | None = Field(
        default=None, description="Unnamed mode only: how many objects to return (default 8)."
    )

    @field_validator("targets")
    @classmethod
    def _clean_targets(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("every target must be a string")
            name = item.strip()
            if not name:
                continue
            if len(name) > 160:
                raise ValueError("a target name is longer than 160 characters")
            if name.lower() not in [name2.lower() for name2 in cleaned]:
                cleaned.append(name)
        return cleaned or None

    @field_validator("max_objects")
    @classmethod
    def _sane_max_objects(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 1 or value > 32:
            raise ValueError("max_objects must be between 1 and 32")
        return value
