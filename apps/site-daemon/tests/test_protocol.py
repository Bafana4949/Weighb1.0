from protocol import TelemetryParser, build_command, parse_telemetry_frame


def test_valid_frame() -> None:
    frame = parse_telemetry_frame("#WT:054320;P1:1;P2:1;RF:DRV00421;ST:STABLE$")
    assert frame is not None
    assert frame.weight_kg == 54320
    assert frame.position_sensor_1 is True
    assert frame.position_sensor_2 is True
    assert frame.rfid_tag == "DRV00421"


def test_corrupt_frame_is_rejected() -> None:
    assert parse_telemetry_frame("#WT:ABC;P1:1;P2:1;RF:X;ST:STABLE$") is None
    assert parse_telemetry_frame("#WT:001000;P1:2;P2:1;RF:X;ST:STABLE$") is None


def test_partial_and_combined_frames() -> None:
    parser = TelemetryParser()
    assert parser.feed(b"noise#WT:001") == []
    frames = parser.feed(b"000;P1:0;P2:1;RF:00000000;ST:UNSTABLE$\r\n#WT:002000;P1:1;P2:1;RF:DRV00421;ST:STABLE$\r\n")
    assert [item.weight_kg for item in frames] == [1000, 2000]
    assert frames[0].rfid_tag is None


def test_command_builder() -> None:
    assert build_command("gate_open", "entry") == b"@CMD:GATE_OPEN;TGT:ENTRY$\r\n"
    assert build_command("light", "exit", "green") == b"@CMD:LIGHT;TGT:EXIT;VAL:GREEN$\r\n"
