from unittest.mock import patch

import numpy as np

from anpr import AnprEngine, normalise_plate, validate_sa_plate
from config import AnprConfig


def test_plate_normalisation_and_validation() -> None:
    assert normalise_plate("ab 123 cd gp") == "AB123CDGP"
    assert validate_sa_plate("AB 123 CD GP") is True
    assert validate_sa_plate("?") is False


def test_multi_read_majority_vote() -> None:
    engine = AnprEngine(AnprConfig(camera_source="unused", confidence_threshold=0.75, max_retries=1, rapid_capture_count=5))
    engine.available = True  # OCR is mocked below, so easyocr need not be installed
    fake_frames = [np.zeros((40, 120, 3), dtype=np.uint8) for _ in range(5)]
    reads = iter([
        ("AB 123 CD GP", 0.91, (1, 2, 3, 4)),
        ("AB 123 CD GP", 0.89, (1, 2, 3, 4)),
        ("AB 128 CD GP", 0.80, (1, 2, 3, 4)),
        ("AB 123 CD GP", 0.87, (1, 2, 3, 4)),
        (None, 0.0, None),
    ])
    with patch.object(engine, "_capture_frames", return_value=(fake_frames, "sample.png")), patch.object(engine, "read_frame", side_effect=lambda _: next(reads)):
        result = engine.recognise("unused")
    assert result.plate_text == "AB 123 CD GP"
    assert result.confidence == 0.91


def test_missing_easyocr_disables_anpr_cleanly() -> None:
    with patch("anpr.ANPR_AVAILABLE", False):
        engine = AnprEngine(AnprConfig(camera_source="unused"))
    assert engine.available is False
    assert "not installed" in (engine.unavailable_reason or "")
    result = engine.recognise("unused")
    assert result.plate_text is None and result.attempts == 0
