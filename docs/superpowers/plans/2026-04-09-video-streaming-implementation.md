# Video Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add low-latency robot camera streaming to the web client. A Python ROS2 node (`video-bridge`) reads a `CompressedImage` or `Image` topic, transcodes via GStreamer to H.264, and pushes RTSP into a MediaMTX container. MediaMTX serves WebRTC (WHEP) to the phone browser. All traffic goes through auth-server; the phone connects WebRTC UDP directly to the robot for media.

**Architecture:**
```
ROS2 topic (CompressedImage or Image)
        │
        ▼ rclpy subscriber
  video-bridge container (host network)
  GStreamer: appsrc → jpegdec/videoconvert → x264enc → rtph264pay → rtspclientsink
        │ RTSP push → localhost:8554
        ▼
  mediamtx container (host network)
  • receives RTSP from video-bridge
  • serves WHEP at localhost:8889/teleop/whep
  • WebRTC UDP ICE at *:8891
        │ HTTP (SDP exchange)         │ UDP (media)
        ▼ proxied via auth-server     ▼ direct browser ↔ robot
  auth-server: /video → localhost:8889
        │
        ▼ HTTP/WS at :8080
  phone browser
  WhepClient: RTCPeerConnection + POST /video/teleop/whep
        │
        ▼
  <video> element in #video-panel
```

**Tech decisions:**
- MediaMTX image: `bluenviron/mediamtx:latest` (host network, no port mapping needed)
- GStreamer Python bindings: `python3-gst-1.0` (Ubuntu 22.04 ships GStreamer 1.20)
- `rtspclientsink` from `gstreamer1.0-plugins-bad` — available in Humble base image apt
- x264enc from `gstreamer1.0-plugins-ugly`
- WHEP client: vanilla (gather-then-offer, no trickle ICE) — works on LAN without STUN
- `VIDEO_TOPIC` empty → video-bridge sleeps with `sleep infinity` (no restart loop)
- `VIDEO_TOPIC_TYPE`: `compressed` (default, `sensor_msgs/CompressedImage`) or `raw` (`sensor_msgs/Image`)
- Stream name in MediaMTX: `teleop` (fixed; single camera per robot)

**UFW rules the user must add (in addition to 8080/tcp already opened):**
```bash
sudo ufw allow 8891/udp    # WebRTC UDP ICE media — phone ↔ robot direct
```

**No new tests added in this milestone.** `WhepClient` depends on `RTCPeerConnection` which jsdom does not support; defer to a follow-up task. `video-bridge` is a Python process with no testable business logic beyond GStreamer plumbing.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `video-bridge/video_bridge.py` | Python rclpy node — subscribes to ROS2 image topic, feeds GStreamer pipeline, pushes RTSP to MediaMTX |
| `video-bridge/Dockerfile.video_bridge` | ROS2 Humble + GStreamer + python3-gst-1.0; build context is repo root so it can copy `server/fastrtps_profiles.xml` |
| `mediamtx.yml` | MediaMTX config — fixed UDP ICE port 8891, stream path `teleop` |
| `web-client/src/whep_client.ts` | `WhepClient` class — RTCPeerConnection + vanilla WHEP SDP exchange + auto-retry |

### Modified files
| File | Change |
|---|---|
| `docker-compose.yml` | Add `mediamtx` and `video-bridge` services (both host network); add `MEDIAMTX_URL` env to auth-server |
| `auth-server/src/app.ts` | Add `/video` proxy route to `AppOptions` + `createApp`; mount before webclient catch-all |
| `web-client/index.html` | Add `<video>` element; import `WhepClient`; auto-connect WHEP on load; update video settings page to status-only |
| `.env.example` | Add `VIDEO_TOPIC`, `VIDEO_TOPIC_TYPE` with TurtleBot discovery note |
| `AGENTS.md` | Update handoff, add deviations |

---

## Task 1 — mediamtx service

**Files:** `mediamtx.yml`, `docker-compose.yml` (mediamtx service only)

- [ ] **Step 1: Create `mediamtx.yml`**

```yaml
# MediaMTX configuration for pocket-teleop
# Full reference: https://github.com/bluenviron/mediamtx
logLevel: warn
logDestinations: [stdout]

# Bind addresses — host network, so these are on the host directly.
# Only RTSP (ingest) and WebRTC HTTP (WHEP) ports are used.
rtspAddress: :8554
rtmpAddress: :1935     # disabled below
hlsAddress: :8888      # disabled below
webrtcAddress: :8889
srtAddress: :8890      # disabled below

rtmpDisable: yes
hlsDisable: yes
srtDisable: yes

# WebRTC — single fixed UDP port so the user only needs one UFW rule.
# ICE candidates advertise the host's own LAN IP automatically (host network).
webrtcICEUDPMuxAddress: :8891
webrtcICETCPMuxAddress: ""

paths:
  teleop:
    # video-bridge pushes RTSP here; mediamtx waits for the publisher.
    source: publisher
    # Clients that connect before video-bridge is ready get a 404 — WhepClient retries.
```

- [ ] **Step 2: Add `mediamtx` service to `docker-compose.yml`**

Add after `webclient`, before `auth-server`:

```yaml
  mediamtx:
    image: bluenviron/mediamtx:latest
    network_mode: "host"
    volumes:
      - ./mediamtx.yml:/mediamtx.yml:ro
    restart: unless-stopped
```

---

## Task 2 — video-bridge service

**Files:** `video-bridge/video_bridge.py`, `video-bridge/Dockerfile.video_bridge`, `docker-compose.yml` (video-bridge service)

- [ ] **Step 1: Create `video-bridge/video_bridge.py`**

```python
#!/usr/bin/env python3
"""
video_bridge — ROS2 → GStreamer → RTSP → MediaMTX

Environment variables
---------------------
VIDEO_TOPIC       Full topic path, e.g. /camera/image_raw/compressed.
                  If empty the node sleeps without subscribing.
VIDEO_TOPIC_TYPE  'compressed' (default) or 'raw'.
MEDIAMTX_RTSP     RTSP push URL (default: rtsp://localhost:8554/teleop).
"""
import os
import sys
import time

import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib  # noqa: E402

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage, Image  # noqa: E402


Gst.init(None)

MEDIAMTX_RTSP = os.environ.get('MEDIAMTX_RTSP', 'rtsp://localhost:8554/teleop')

# ROS2 encoding string → GStreamer video/x-raw format string
_FORMAT_MAP: dict[str, str] = {
    'rgb8':  'RGB',
    'bgr8':  'BGR',
    'mono8': 'GRAY8',
    'rgba8': 'RGBA',
    'bgra8': 'BGRA',
}


def _compressed_pipeline() -> str:
    """GStreamer pipeline for sensor_msgs/CompressedImage (JPEG frames)."""
    return (
        'appsrc name=src is-live=true block=false format=time '
        'caps=image/jpeg '
        '! jpegparse '
        '! avdec_mjpeg '
        '! videoconvert '
        '! video/x-raw,format=I420 '
        '! x264enc tune=zerolatency speed-preset=ultrafast key-int-max=30 bitrate=2000 '
        '! rtph264pay config-interval=-1 pt=96 '
        f'! rtspclientsink location={MEDIAMTX_RTSP} protocols=tcp latency=0'
    )


def _raw_pipeline(width: int, height: int, gst_format: str) -> str:
    """GStreamer pipeline for sensor_msgs/Image (raw pixel frames)."""
    caps = (
        f'video/x-raw,format={gst_format},'
        f'width={width},height={height},framerate=15/1'
    )
    return (
        f'appsrc name=src is-live=true block=false format=time caps={caps} '
        '! videoconvert '
        '! video/x-raw,format=I420 '
        '! x264enc tune=zerolatency speed-preset=ultrafast key-int-max=30 bitrate=2000 '
        '! rtph264pay config-interval=-1 pt=96 '
        f'! rtspclientsink location={MEDIAMTX_RTSP} protocols=tcp latency=0'
    )


class VideoBridgeNode(Node):
    def __init__(self, topic: str, topic_type: str) -> None:
        super().__init__('video_bridge')
        self._topic_type = topic_type
        self._pipeline: Gst.Pipeline | None = None
        self._src: Gst.Element | None = None
        self._pipeline_started = False
        self._retry_timer = None

        msg_type = CompressedImage if topic_type == 'compressed' else Image
        self.subscription = self.create_subscription(
            msg_type, topic, self._on_message, 10
        )
        self.get_logger().info(
            f'video_bridge: subscribing to {topic} '
            f'(type={topic_type}, rtsp={MEDIAMTX_RTSP})'
        )

    # ------------------------------------------------------------------
    # Pipeline lifecycle
    # ------------------------------------------------------------------

    def _build_pipeline(self, msg) -> None:
        """Build and start the GStreamer pipeline on first message."""
        if self._topic_type == 'compressed':
            pipeline_str = _compressed_pipeline()
        else:
            gst_format = _FORMAT_MAP.get(getattr(msg, 'encoding', 'bgr8'), 'BGR')
            pipeline_str = _raw_pipeline(msg.width, msg.height, gst_format)

        self.get_logger().info(f'Starting GStreamer pipeline: {pipeline_str}')
        self._pipeline = Gst.parse_launch(pipeline_str)
        self._src = self._pipeline.get_by_name('src')

        bus = self._pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect('message::error', self._on_bus_error)

        ret = self._pipeline.set_state(Gst.State.PLAYING)
        if ret == Gst.StateChangeReturn.FAILURE:
            self.get_logger().error('GStreamer pipeline failed to start — will retry in 5s')
            self._schedule_pipeline_restart()
        else:
            self._pipeline_started = True

    def _stop_pipeline(self) -> None:
        if self._pipeline is not None:
            self._pipeline.set_state(Gst.State.NULL)
            self._pipeline = None
            self._src = None
        self._pipeline_started = False

    def _schedule_pipeline_restart(self) -> None:
        self._stop_pipeline()
        self._retry_timer = self.create_timer(5.0, self._retry_pipeline)

    def _retry_pipeline(self) -> None:
        if self._retry_timer:
            self._retry_timer.cancel()
            self._retry_timer = None
        self.get_logger().info('Retrying GStreamer pipeline…')
        # Pipeline will be rebuilt on next message

    def _on_bus_error(self, _bus, msg) -> None:
        err, debug = msg.parse_error()
        self.get_logger().error(f'GStreamer error: {err.message} ({debug})')
        self._schedule_pipeline_restart()

    # ------------------------------------------------------------------
    # ROS2 message callback
    # ------------------------------------------------------------------

    def _on_message(self, msg) -> None:
        if not self._pipeline_started:
            self._build_pipeline(msg)
            return  # first message used only to build pipeline; push on next

        if self._src is None:
            return

        data = bytes(msg.data)
        buf = Gst.Buffer.new_wrapped(data)
        ret = self._src.emit('push-buffer', buf)
        if ret != Gst.FlowReturn.OK:
            self.get_logger().warning(f'push-buffer returned {ret} — restarting pipeline')
            self._schedule_pipeline_restart()

    def destroy_node(self) -> None:
        self._stop_pipeline()
        super().destroy_node()


def main() -> None:
    topic = os.environ.get('VIDEO_TOPIC', '').strip()
    if not topic:
        print('video_bridge: VIDEO_TOPIC not set — sleeping (video disabled)', flush=True)
        # Stay alive without spinning so Docker reports healthy, but do nothing.
        try:
            time.sleep(float('inf'))
        except KeyboardInterrupt:
            pass
        return

    topic_type = os.environ.get('VIDEO_TOPIC_TYPE', 'compressed').strip()
    if topic_type not in ('compressed', 'raw'):
        print(f'video_bridge: unknown VIDEO_TOPIC_TYPE={topic_type!r}, defaulting to compressed',
              flush=True)
        topic_type = 'compressed'

    # Run a GLib main loop in a background thread for GStreamer bus watch callbacks.
    loop = GLib.MainLoop()
    import threading
    glib_thread = threading.Thread(target=loop.run, daemon=True)
    glib_thread.start()

    rclpy.init()
    node = VideoBridgeNode(topic, topic_type)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
        loop.quit()


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Create `video-bridge/Dockerfile.video_bridge`**

Build context is `.` (repo root) so `server/fastrtps_profiles.xml` is reachable.

```dockerfile
FROM ros:humble

# GStreamer with H.264 support and Python bindings
RUN apt-get update && apt-get install -y \
    ros-humble-rclpy \
    ros-humble-sensor-msgs \
    gstreamer1.0-tools \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    python3-gst-1.0 \
    && rm -rf /var/lib/apt/lists/*

# Reuse the same FastDDS LAN-whitelist profile as teleop-server
COPY server/fastrtps_profiles.xml /fastrtps_profiles.xml
COPY video-bridge/video_bridge.py /video_bridge.py

CMD ["/bin/bash", "-c", "\
  . /opt/ros/humble/setup.sh && \
  if [ -n \"${ROS_NETWORK_INTERFACE}\" ]; then \
    sed \"s|\\$ENV{ROS_NETWORK_INTERFACE}|${ROS_NETWORK_INTERFACE}|g\" \
      /fastrtps_profiles.xml > /tmp/fastrtps_resolved.xml && \
    export FASTRTPS_DEFAULT_PROFILES_FILE=/tmp/fastrtps_resolved.xml; \
  fi && \
  python3 /video_bridge.py"]
```

- [ ] **Step 3: Add `video-bridge` service to `docker-compose.yml`**

Add after the `mediamtx` service:

```yaml
  video-bridge:
    build:
      context: .
      dockerfile: video-bridge/Dockerfile.video_bridge
      network: host
    network_mode: "host"
    environment:
      - VIDEO_TOPIC=${VIDEO_TOPIC:-}
      - VIDEO_TOPIC_TYPE=${VIDEO_TOPIC_TYPE:-compressed}
      - MEDIAMTX_RTSP=rtsp://localhost:8554/teleop
      - ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-0}
      - ROS_NETWORK_INTERFACE=${ROS_NETWORK_INTERFACE:-}
    restart: unless-stopped
    depends_on:
      - mediamtx
```

---

## Task 3 — auth-server /video proxy

**Files:** `auth-server/src/app.ts`, `docker-compose.yml` (MEDIAMTX_URL env for auth-server)

- [ ] **Step 1: Add `mediaMtxUrl` to `AppOptions` and wire proxy in `createApp`**

In `auth-server/src/app.ts`, extend `AppOptions`:

```typescript
export interface AppOptions {
  credPath: string;
  sessionsPath: string;
  sessionSecret: string;
  webClientUrl?: string;
  mediaMtxUrl?: string;   // ← new
}
```

In `createApp`, resolve the URL and mount the proxy **after auth middleware, before the webclient catch-all**:

```typescript
const mediaMtxUrl = options.mediaMtxUrl
  ?? process.env['MEDIAMTX_URL']
  ?? 'http://localhost:8889';

// ... (existing session, auth, must-change-password middleware) ...

// Video stream proxy — authenticated; /video/* → MediaMTX WHEP/HTTP.
// Express strips the '/video' prefix from req.url before handing off,
// so MediaMTX receives the path relative to its root (e.g. /teleop/whep).
app.use('/video', makeHttpProxy(mediaMtxUrl));

// Proxy authenticated requests to nginx (catch-all — must be last)
app.use(makeHttpProxy(webClientUrl));
```

- [ ] **Step 2: Add `MEDIAMTX_URL` env to auth-server in `docker-compose.yml`**

In the `auth-server` environment block, add:

```yaml
      - MEDIAMTX_URL=http://localhost:8889
```

- [ ] **Step 3: Verify auth-server tests still pass**

```bash
docker compose --profile test run --rm auth-server-test
```

Expected: all existing tests pass. No new tests added for the `/video` route (MediaMTX would need to be running; deferred to integration testing).

---

## Task 4 — WhepClient TypeScript module

**Files:** `web-client/src/whep_client.ts`

- [ ] **Step 1: Create `web-client/src/whep_client.ts`**

```typescript
/**
 * WhepClient — WebRTC-HTTP Egress Protocol (WHEP) client.
 *
 * Connects to a MediaMTX WHEP endpoint, establishes a WebRTC receive-only
 * peer connection, and delivers the media stream via onStream callback.
 *
 * Uses vanilla WHEP (gather-then-offer): all ICE candidates are gathered
 * locally before the SDP offer is sent. No STUN server is required on a
 * LAN where the robot's IP is directly reachable.
 *
 * Auto-retries with exponential back-off if the stream is unavailable or
 * the connection drops (e.g. video-bridge restarting).
 */
export interface WhepCallbacks {
  onStream: (stream: MediaStream) => void;
  onError:  (msg: string) => void;
  onClose:  () => void;
}

const BASE_RETRY_MS  = 3_000;
const MAX_RETRY_MS   = 30_000;

export class WhepClient {
  private readonly url:       string;
  private readonly callbacks: WhepCallbacks;
  private pc:         RTCPeerConnection | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay  = BASE_RETRY_MS;
  private stopped     = false;

  constructor(url: string, callbacks: WhepCallbacks) {
    this.url       = url;
    this.callbacks = callbacks;
  }

  /** Begin connecting. Safe to call multiple times (stops any in-progress attempt first). */
  start(): void {
    this.stopped = false;
    this._connect();
  }

  /** Permanently stop — no further retries. */
  stop(): void {
    this.stopped = true;
    this._clearRetry();
    this._closePc();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async _connect(): Promise<void> {
    this._closePc();
    if (this.stopped) return;

    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc   = pc;

    // Receive-only: one video track, no audio (video-bridge sends video only)
    pc.addTransceiver('video', { direction: 'recvonly' });

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        this.retryDelay = BASE_RETRY_MS; // reset back-off on success
        this.callbacks.onStream(e.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.callbacks.onClose();
        this._scheduleRetry();
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete before sending the offer.
      // On a LAN without STUN, gathering is fast (host candidates only).
      await this._waitForIceGathering(pc);

      const res = await fetch(this.url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body:    pc.localDescription!.sdp,
      });

      if (!res.ok) {
        // 404 = stream not yet published (video-bridge not started yet)
        // Other codes = MediaMTX error
        this.callbacks.onError(
          res.status === 404 ? 'stream not available' : `WHEP ${res.status}`
        );
        this._scheduleRetry();
        return;
      }

      const sdp = await res.text();
      await pc.setRemoteDescription({ type: 'answer', sdp });
      // ontrack fires once remote description is set and ICE completes.

    } catch (e) {
      this.callbacks.onError((e as Error).message ?? 'connection error');
      this._scheduleRetry();
    }
  }

  private _waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
      // Safety timeout: if gathering stalls, proceed anyway after 5s
      setTimeout(resolve, 5_000);
    });
  }

  private _scheduleRetry(): void {
    if (this.stopped) return;
    this._clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this._connect();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
  }

  private _clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private _closePc(): void {
    this.pc?.close();
    this.pc = null;
  }
}
```

No tests added in this task — `RTCPeerConnection` is not available in jsdom. Note as a known deviation in AGENTS.md.

---

## Task 5 — web client video panel integration

**Files:** `web-client/index.html`

This task has no TypeScript changes — everything is in the inline `<script type="module">` and HTML/CSS.

- [ ] **Step 1: Add `<video>` element to `#video-panel`**

Replace the existing video panel body (keep `#vel-overlay` unchanged):

```html
  <main id="video-panel">
    <div id="vel-overlay">
      <!-- unchanged -->
    </div>
    <div id="video-placeholder-box">
      <p id="video-placeholder">No video stream</p>
    </div>
    <!-- WebRTC stream (primary, auto-connects when mediamtx is up) -->
    <video id="video-el"
           autoplay muted playsinline
           style="max-width:100%;max-height:100%;object-fit:contain;display:none">
    </video>
  </main>
```

The `<img id="video-img">` for manual MJPEG URLs is removed — the settings Video page already had no persisted state worth preserving.

- [ ] **Step 2: Update the Settings drawer Video page**

Replace the Stream URL field group with a status indicator:

```html
    <!-- Video page -->
    <div id="page-video" class="drawer-page" hidden>
      <div class="field-group">
        <span class="field-label">Video stream</span>
        <span id="video-status" class="field-value">Connecting…</span>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:4px">
        Set <code>VIDEO_TOPIC</code> in <code>.env</code> to enable the robot camera.
        Run <code>ros2 topic list | grep image</code> on the robot to find the topic name.
      </p>
    </div>
```

- [ ] **Step 3: Add `WhepClient` import and video panel wiring to the inline `<script>`**

Add import at top of the script block:

```javascript
import { WhepClient } from '/dist/whep_client.js';
```

Remove the old video panel section (the `applyVideoUrl`, `videoImg.onerror`, `savedUrl`, `video-apply-btn`, `video-clear-btn` logic) and replace with:

```javascript
// ── Video panel (WebRTC / WHEP) ───────────────────────────────────────────

const videoEl          = document.getElementById('video-el');
const videoPlaceholder = document.getElementById('video-placeholder');
const videoPlaceholderBox = document.getElementById('video-placeholder-box');
const videoStatus      = document.getElementById('video-status');

function showVideoStream(stream) {
  videoEl.srcObject = stream;
  videoEl.style.display = 'block';
  videoPlaceholderBox.style.display = 'none';
  if (videoStatus) videoStatus.textContent = 'Connected';
}

function hideVideoStream(reason) {
  videoEl.style.display = 'none';
  videoEl.srcObject = null;
  videoPlaceholderBox.style.display = '';
  videoPlaceholder.textContent = reason ?? 'No video stream';
  if (videoStatus) videoStatus.textContent = reason ?? 'Not available';
}

const whepUrl = `${window.location.protocol}//${window.location.host}/video/teleop/whep`;

const whepClient = new WhepClient(whepUrl, {
  onStream: (stream) => showVideoStream(stream),
  onError:  (msg)    => hideVideoStream(msg === 'stream not available' ? 'No video stream' : `Video: ${msg}`),
  onClose:  ()       => hideVideoStream('Stream closed'),
});

whepClient.start();
```

Also remove the old `loadVideoUrl` / `saveVideoUrl` / `clearVideoUrl` import from the `settings.js` import line (keep other imports):

```javascript
import { SettingsRouter } from '/dist/settings.js';
```

- [ ] **Step 4: Verify webclient tests still pass**

```bash
docker compose --profile test run --rm webclient-test
```

Expected: all existing tests pass. WhepClient's `fetch('/video/teleop/whep')` in the test environment returns a non-OK response (no MediaMTX running) — WhepClient should handle this silently and show the placeholder. No assertion failures expected.

---

## Task 6 — docs and env

**Files:** `.env.example`, `README.md`, `AGENTS.md`

- [ ] **Step 1: Add video variables to `.env.example`**

Add after the `ROS_NETWORK_INTERFACE` block:

```bash
# Video streaming (optional — leave VIDEO_TOPIC empty to disable)
# To find your camera topic: ros2 topic list | grep -i image
# Common TurtleBot topics:
#   TurtleBot3 (Pi Camera): /raspicam_node/image/compressed
#   TurtleBot4 (OAK-D):     /oakd/rgb/preview/image_raw/compressed
# Set VIDEO_TOPIC_TYPE=raw if only a raw sensor_msgs/Image topic is available.
VIDEO_TOPIC=
VIDEO_TOPIC_TYPE=compressed
```

- [ ] **Step 2: Add video streaming section to `README.md`**

Add under the existing `## Optional robot configuration` table:

```markdown
## Video streaming

Set `VIDEO_TOPIC` in `.env` to enable the robot camera in the web UI:

```bash
# .env
VIDEO_TOPIC=/camera/image_raw/compressed   # adjust to your camera's topic
```

To find the right topic name, run on the robot while the stack is up:

```bash
ros2 topic list | grep -i image
```

One additional UFW rule is required for WebRTC UDP media:

```bash
sudo ufw allow 8891/udp
```

The video stream uses WebRTC (via MediaMTX). Latency is typically 100–300 ms on a local network. Video auto-connects in the browser and retries automatically if the stream is interrupted.
```

- [ ] **Step 3: Update `AGENTS.md`**

  - Update Handoff State summary sentence
  - Update Head SHA after committing
  - Add deviations:

| Deviation | Location | Why accepted |
|---|---|---|
| `WhepClient` has no unit tests | `web-client/src/whep_client.ts` | `RTCPeerConnection` is not available in jsdom 24; mocking it adds no correctness value for an API-thin adapter; deferred to a follow-up with a real browser test harness |
| `video-bridge` has no unit tests | `video-bridge/video_bridge.py` | The node is a thin GStreamer + ROS2 plumbing layer with no testable business logic; correctness is verified by the running stream |
| `<img id="video-img">` removed without replacement | `web-client/index.html` | Manual MJPEG URL input had no users (feature existed but stream URL was never persisted from prior sessions); WebRTC/WHEP supersedes it; MJPEG URL support can be re-added when RTSP/UDP input sources are implemented |
| `loadVideoUrl` / `saveVideoUrl` / `clearVideoUrl` removed from settings.ts imports | `web-client/index.html` | No longer needed after MJPEG path removed; `settings.ts` functions remain in source for future use |

---

## Completion checklist

Before marking this milestone done:

- [ ] `docker compose up --build` starts without errors
- [ ] `docker compose logs mediamtx` shows `MediaMTX v…` startup line
- [ ] `docker compose logs video-bridge` shows either "VIDEO_TOPIC not set" or `video_bridge: subscribing to …`
- [ ] With `VIDEO_TOPIC` set to a live camera topic, browser shows video in `#video-panel` within ~5 seconds of page load
- [ ] Without `VIDEO_TOPIC` set, browser shows "No video stream" placeholder — no JS errors
- [ ] Auth-server tests pass: `docker compose --profile test run --rm auth-server-test`
- [ ] Webclient tests pass: `docker compose --profile test run --rm webclient-test`
- [ ] AGENTS.md Head SHA updated to the commit hash of this task's commit
