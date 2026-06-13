# video-bridge — ROS2 image → WebRTC

## Purpose

Python `rclpy` node that subscribes to a ROS2 image topic (`CompressedImage` or `Image`) and feeds a GStreamer pipeline pushing RTMP to MediaMTX, which serves WHEP to the browser. Sleeps idle if `VIDEO_TOPIC` is unset.

```
ROS2 image topic
    │ rclpy subscriber
    ▼
video-bridge container (host network)
GStreamer: appsrc → jpegdec/videoconvert → x264enc → h264parse → flvmux → rtmpsink
    │ RTMP push → 127.0.0.1:1935/teleop
    ▼
mediamtx container (host network)
    • receives RTMP (or pulls an RTSP source directly)
    • serves WHEP at :8889/teleop/whep   • WebRTC UDP ICE at *:8891
    │ HTTP (SDP via auth-server /video)   │ UDP media (direct browser ↔ robot)
    ▼
phone browser  (WhepClient: RTCPeerConnection + POST /video/teleop/whep → <video>)
```

## Ownership

Owns: `video_bridge.py`, `test_video_bridge.py`, `Dockerfile.video_bridge` (ROS2 Humble + GStreamer + python3-gst-1.0; multi-stage base/runtime/test).

| File | What it does |
|---|---|
| `video_bridge.py` | rclpy node — subscribes image topic, feeds GStreamer, pushes RTMP; sleeps if `VIDEO_TOPIC` unset |
| `test_video_bridge.py` | pytest — pipeline-string functions + format map (pure, no live pipeline) |
| `Dockerfile.video_bridge` | base → runtime → test stages |

MediaMTX config (`mediamtx.yml`, `mediamtx-test-config.yml` at repo root) and the browser-side `whep_client.ts` (web-client) are owned elsewhere.

## Local Contracts

- Pipeline-string builders and the format map are **pure functions** — keep them testable without a live GStreamer/ROS2 runtime.
- **Port roles** (host, not repo): RTMP 1935 (ingest) / RTSP 8554 (external sources) / WHEP+API 8889 — all internal; **UDP ICE 8891 must be opened on the host firewall** or video ICE fails:
  `sudo ufw allow from <lan-subnet>/24 to any port 8891 proto udp`

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `VIDEO_TOPIC` | No (empty = disabled) | Full ROS2 topic path, e.g. `/camera/image_raw/compressed`; empty = node sleeps |
| `VIDEO_TOPIC_TYPE` | No (`compressed`) | `compressed` (`sensor_msgs/CompressedImage`) or `raw` (`sensor_msgs/Image`) |
| `MEDIAMTX_RTMP` | No (`rtmp://127.0.0.1:1935/teleop`) | RTMP push URL into MediaMTX |

## Work Guidance

Testing trophy + TDD order. Tests cover pipeline-string functions and the format map only (pure — no live pipeline spin-up).

## Verification

```bash
docker compose -p pocket-teleop run --rm --no-deps --build video-bridge-test
```
`--build` REQUIRED after edits. Baseline: video-bridge count in the root AGENTS.md "Test baseline" (authoritative).

## Child DOX Index

No children. Leaf boundary. For MediaMTX config + the browser WHEP client: root [AGENTS.md](../AGENTS.md) + [repository-structure.md](../memory/agent-guides/repository-structure.md).
