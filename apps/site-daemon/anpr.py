from __future__ import annotations

import logging
import re
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np

from config import AnprConfig
from models import AnprResult

LOGGER = logging.getLogger(__name__)
SA_PLATE_PATTERN = re.compile(r"^[A-Z]{2,3}\s?\d{2,3}\s?[A-Z]{2,3}\s?(?:GP|WC|KZN|EC|FS|MP|LP|NW|NC)$")


def normalise_plate(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def validate_sa_plate(value: str) -> bool:
    cleaned = re.sub(r"\s+", " ", value.upper()).strip()
    return bool(SA_PLATE_PATTERN.fullmatch(cleaned))


class AnprEngine:
    def __init__(self, config: AnprConfig) -> None:
        self.config = config
        self._reader = None

    @property
    def reader(self):
        if self._reader is None:
            import easyocr
            self._reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        return self._reader

    def preprocess(self, image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        filtered = cv2.bilateralFilter(gray, 11, 17, 17)
        thresholded = cv2.adaptiveThreshold(filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 7)
        edges = cv2.Canny(filtered, 30, 200)
        return thresholded, edges

    def plate_candidates(self, image: np.ndarray) -> list[tuple[np.ndarray, tuple[int, int, int, int]]]:
        _, edges = self.preprocess(image)
        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        candidates: list[tuple[np.ndarray, tuple[int, int, int, int]]] = []
        image_area = image.shape[0] * image.shape[1]
        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:80]:
            perimeter = cv2.arcLength(contour, True)
            polygon = cv2.approxPolyDP(contour, 0.018 * perimeter, True)
            if len(polygon) != 4:
                continue
            x, y, width, height = cv2.boundingRect(polygon)
            if height == 0:
                continue
            ratio = width / height
            area = width * height
            if 2.0 <= ratio <= 5.0 and 0.002 <= area / image_area <= 0.35:
                padding = max(2, int(height * 0.08))
                crop = image[max(0, y - padding): min(image.shape[0], y + height + padding), max(0, x - padding): min(image.shape[1], x + width + padding)]
                if crop.size:
                    candidates.append((crop, (x, y, width, height)))
        if not candidates:
            candidates.append((image, (0, 0, image.shape[1], image.shape[0])))
        return candidates[:10]

    def read_frame(self, image: np.ndarray) -> tuple[str | None, float, tuple[int, int, int, int] | None]:
        best_text: str | None = None
        best_confidence = 0.0
        best_bbox = None
        for crop, bbox in self.plate_candidates(image):
            results = self.reader.readtext(crop, detail=1, paragraph=False, allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ")
            for _, text, confidence in results:
                cleaned = re.sub(r"\s+", " ", text.upper()).strip()
                normalized = normalise_plate(cleaned)
                if len(normalized) < 5:
                    continue
                format_bonus = 0.05 if validate_sa_plate(cleaned) else 0.0
                adjusted = min(1.0, float(confidence) + format_bonus)
                if adjusted > best_confidence:
                    best_text = cleaned
                    best_confidence = adjusted
                    best_bbox = bbox
        return best_text, best_confidence, best_bbox

    def _capture_frames(self, source: str | int, count: int) -> tuple[list[np.ndarray], str | None]:
        path = Path(str(source))
        if isinstance(source, str) and path.exists():
            image = cv2.imread(str(path))
            if image is None:
                raise ValueError(f"unable to read image: {path}")
            return [image.copy() for _ in range(count)], str(path)

        source_value: str | int = int(source) if str(source).isdigit() else source
        capture = cv2.VideoCapture(source_value)
        if not capture.isOpened():
            raise ValueError(f"unable to open camera source: {source}")
        frames: list[np.ndarray] = []
        try:
            for _ in range(count):
                ok, frame = capture.read()
                if ok and frame is not None:
                    frames.append(frame)
                time.sleep(0.08)
        finally:
            capture.release()
        return frames, None

    def recognise(self, source: str | int | None = None) -> AnprResult:
        camera_source = self.config.camera_source if source is None else source
        all_reads: list[tuple[str, float, tuple[int, int, int, int] | None]] = []
        image_path: str | None = None
        attempts = 0
        for attempt in range(self.config.max_retries):
            attempts = attempt + 1
            frames, image_path = self._capture_frames(camera_source, self.config.rapid_capture_count)
            for frame in frames:
                text, confidence, bbox = self.read_frame(frame)
                if text:
                    all_reads.append((text, confidence, bbox))
            acceptable = [item for item in all_reads if item[1] >= self.config.confidence_threshold]
            if acceptable:
                break
            if attempt + 1 < self.config.max_retries:
                time.sleep(self.config.retry_interval_ms / 1000)

        if not all_reads:
            return AnprResult(plate_text=None, confidence=0, timestamp=datetime.now(timezone.utc), image_path=image_path, bbox_coordinates=None, attempts=attempts)

        normalized_counts = Counter(normalise_plate(item[0]) for item in all_reads)
        winner, _ = normalized_counts.most_common(1)[0]
        matching = [item for item in all_reads if normalise_plate(item[0]) == winner]
        best = max(matching, key=lambda item: item[1])
        return AnprResult(
            plate_text=best[0] if best[1] >= self.config.confidence_threshold else None,
            confidence=best[1],
            timestamp=datetime.now(timezone.utc),
            image_path=image_path,
            bbox_coordinates=best[2],
            attempts=attempts,
            candidates=[item[0] for item in all_reads],
        )
