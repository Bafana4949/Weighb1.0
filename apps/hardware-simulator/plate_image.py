#!/usr/bin/env python3
"""Synthetic number-plate image rendering for automatic ANPR simulation.

scenarios.py used to bypass the site daemon's real ANPR pipeline entirely by
POSTing a `manual_plate` string, because the daemon's configured camera
source is a single fixed test image (see apps/site-daemon/config.docker.yaml
`anpr.camera_source`) that always OCRs to the same plate no matter which
truck is being simulated.

This module removes that limitation: it reuses the five pre-rendered
`test_plates/sample_0N.png` images for the plates they already depict (so the
most common demo plates hit real, pre-existing assets), and renders a new
plate photo on demand for any other plate string in the same visual style,
so the daemon's actual OpenCV + EasyOCR pipeline reads a genuine image
every time instead of being told the answer.
"""
from __future__ import annotations

import re
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

SITE_DAEMON_DIR = Path(__file__).resolve().parent.parent / "site-daemon"
TEST_PLATES_DIR = SITE_DAEMON_DIR / "test_plates"

# Plate text already baked into the repo's checked-in sample images. Reused
# as-is rather than re-rendered, so the demo's most common plates exercise
# the real pre-existing fixtures instead of a generated stand-in.
_STATIC_SAMPLES = {
    "AB123CDGP": "sample_01.png",
}

_CANVAS_SIZE = (800, 450)
_PLATE_BOX = (185, 195, 615, 285)

_BOLD_FONT_CANDIDATES = [
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def _normalise(plate: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", plate.upper())


def _slug(plate: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "-", plate.upper()).strip("-").lower()


def _load_bold_font(size: int) -> ImageFont.ImageFont:
    for candidate in _BOLD_FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1 has no `size` kwarg on load_default()
        return ImageFont.load_default()


def render_plate_image(plate: str) -> str:
    """Ensure a plate photo for `plate` exists under test_plates/ and return
    its path relative to the site daemon's working directory (matching the
    convention already used by config.docker.yaml's `anpr.camera_source` and
    the daemon's /edge/check-in `image_path` field)."""
    if not HAS_PIL:
        return "test_plates/sample_01.png"

    TEST_PLATES_DIR.mkdir(parents=True, exist_ok=True)

    static_name = _STATIC_SAMPLES.get(_normalise(plate))
    if static_name and (TEST_PLATES_DIR / static_name).exists():
        return f"test_plates/{static_name}"

    filename = f"generated-{_slug(plate)}.png"
    destination = TEST_PLATES_DIR / filename

    image = Image.new("RGB", _CANVAS_SIZE, (35, 38, 45))
    draw = ImageDraw.Draw(image)
    draw.rectangle((90, 90, 710, 340), fill=(120, 125, 132))  # vehicle body
    left, top, right, bottom = _PLATE_BOX
    draw.rounded_rectangle((left, top, right, bottom), radius=8, fill=(255, 255, 255), outline=(0, 0, 0), width=6)

    text = plate.upper()
    font = _load_bold_font(52)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width, text_height = bbox[2] - bbox[0], bbox[3] - bbox[1]
    box_width, box_height = right - left, bottom - top
    origin = (
        left + (box_width - text_width) / 2 - bbox[0],
        top + (box_height - text_height) / 2 - bbox[1],
    )
    draw.text(origin, text, font=font, fill=(0, 0, 0))

    image.save(destination)
    return f"test_plates/{filename}"
