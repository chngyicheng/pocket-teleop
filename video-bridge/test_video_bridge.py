"""
Tests for the pure pipeline-string functions in video_bridge.py.

These tests do not require GStreamer or ROS2 to be connected — they verify
that the pipeline strings are structurally correct for the expected GStreamer
elements and that the format map covers all documented encodings.
"""
import os
import sys

# Ensure the module is importable from the repo root where the Dockerfile
# copies it to /video_bridge.py, or from the video-bridge/ directory during
# local test runs.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from video_bridge import (  # noqa: E402
    _compressed_pipeline,
    _raw_pipeline,
    _FORMAT_MAP,
)


# ── _compressed_pipeline ──────────────────────────────────────────────────────

def test_compressed_pipeline_has_appsrc():
    assert 'appsrc' in _compressed_pipeline()


def test_compressed_pipeline_has_jpeg_caps():
    assert 'caps=image/jpeg' in _compressed_pipeline()


def test_compressed_pipeline_decodes_jpeg():
    p = _compressed_pipeline()
    assert 'jpegparse' in p
    assert 'avdec_mjpeg' in p


def test_compressed_pipeline_encodes_h264():
    p = _compressed_pipeline()
    assert 'x264enc' in p
    assert 'tune=zerolatency' in p


def test_compressed_pipeline_packages_rtp():
    assert 'rtph264pay' in _compressed_pipeline()


def test_compressed_pipeline_pushes_to_rtsp():
    p = _compressed_pipeline()
    assert 'rtspclientsink' in p
    assert 'rtsp://localhost:8554/teleop' in p


def test_compressed_pipeline_default_rtsp_url():
    # Default URL is used when MEDIAMTX_RTSP is unset — already verified by
    # test_compressed_pipeline_pushes_to_rtsp; this test makes the intent explicit.
    assert 'rtsp://localhost:8554/teleop' in _compressed_pipeline()


def test_compressed_pipeline_custom_rtsp_url(monkeypatch):
    import video_bridge as vb
    monkeypatch.setattr(vb, 'MEDIAMTX_RTSP', 'rtsp://192.168.1.50:8554/cam')
    assert 'rtsp://192.168.1.50:8554/cam' in vb._compressed_pipeline()


# ── _raw_pipeline ─────────────────────────────────────────────────────────────

def test_raw_pipeline_has_appsrc():
    assert 'appsrc' in _raw_pipeline(640, 480, 'BGR')


def test_raw_pipeline_includes_dimensions():
    p = _raw_pipeline(1280, 720, 'RGB')
    assert 'width=1280' in p
    assert 'height=720' in p


def test_raw_pipeline_includes_format():
    p = _raw_pipeline(640, 480, 'RGB')
    assert 'format=RGB' in p


def test_raw_pipeline_encodes_h264():
    p = _raw_pipeline(640, 480, 'BGR')
    assert 'x264enc' in p
    assert 'tune=zerolatency' in p


def test_raw_pipeline_pushes_to_rtsp():
    p = _raw_pipeline(640, 480, 'BGR')
    assert 'rtspclientsink' in p
    assert 'rtsp://localhost:8554/teleop' in p


def test_raw_pipeline_converts_to_i420():
    # videoconvert + explicit I420 caps are required for x264enc
    p = _raw_pipeline(640, 480, 'BGR')
    assert 'videoconvert' in p
    assert 'I420' in p


# ── _FORMAT_MAP ───────────────────────────────────────────────────────────────

def test_format_map_rgb8():
    assert _FORMAT_MAP['rgb8'] == 'RGB'


def test_format_map_bgr8():
    assert _FORMAT_MAP['bgr8'] == 'BGR'


def test_format_map_mono8():
    assert _FORMAT_MAP['mono8'] == 'GRAY8'


def test_format_map_rgba8():
    assert _FORMAT_MAP['rgba8'] == 'RGBA'


def test_format_map_bgra8():
    assert _FORMAT_MAP['bgra8'] == 'BGRA'
