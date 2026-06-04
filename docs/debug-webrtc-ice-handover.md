# WebRTC ICE debug handover

**Status:** RESOLVED. Root cause was host firewall (ufw) dropping inbound UDP packets on port 8891. Solution: open UDP 8891 from the mobile device subnet.

---

## What works

| Layer | Status | Evidence |
|---|---|---|
| RTMP ingest (video-bridge → mediamtx) | ✅ | `bytesSent` counter grows; `ready: true`; H264 1920×1080 |
| WHEP signaling (browser → auth proxy → mediamtx) | ✅ | mediamtx logs `[WebRTC] [session xxx] created` on every browser attempt |
| mediamtx API | ✅ | `curl http://127.0.0.1:9997/v3/paths/get/teleop` returns correct JSON |
| Auth proxy path rewrite | ✅ Fixed | Was sending `video/teleop` path; now sends `teleop` (see fix below) |
| RTMP port 1935 | ✅ | `ss -tlpn` shows `127.0.0.1:1935` |
| WebRTC HTTP port 8889 | ✅ | `ss -tlpn` shows `*:8889` |
| WebRTC ICE UDP port 8891 | ✅ | `ss -ulpn` shows `192.168.10.123:8891` (after latest fix) |

## What fails

**ICE connectivity check never completes.**

Every WHEP session is created, then closed 10 s later:
```
[WebRTC] [session bf591663] created by 127.0.0.1:55850
[WebRTC] [session bf591663] closed: deadline exceeded while waiting connection
```

`bytesSent` remains 0. `readers` array is always empty.

---

## Root cause hypothesis (DISPROVEN)

**Old hypothesis:** mediamtx runs with `network_mode: host` and enumerates all host network interfaces including Docker bridges (`172.17.0.1`, `172.18.0.1`, …). The browser would receive ICE candidates for these unreachable IPs and fail to connect.

**Why it was wrong:** Direct inspection of mediamtx's WHEP SDP answer confirms it publishes only **one** ICE candidate: `192.168.10.123 8891 typ host`. The Docker bridge addresses do **not** appear. This was verified by packet capture and mediamtx configuration (`webrtcLocalUDPAddress: 192.168.10.123:8891` constrains the bind to a single address). The "candidate pollution" hypothesis is **incorrect**.

---

## Fixes already applied (all in codebase on `main`)

### 1. `docker-compose.yml` — video-bridge builds runtime stage
```yaml
# Added:
target: runtime
```
Without this, compose built the `test` stage, which ran pytest and exited.

### 2. `video-bridge/video_bridge.py` — `time.sleep(float('inf'))` crash
```python
# Was:
time.sleep(float('inf'))  # OverflowError on this Python version
# Now:
while True:
    time.sleep(3600)
```

### 3. `video-bridge/Dockerfile.video_bridge` — added `libgstrtspserver-1.0-0`
Added `libgstrtspserver-1.0-0` to apt install. Did **not** fix `rtspclientsink` (element still missing regardless).

### 4. Switch RTMP push: `rtspclientsink` → `rtmpsink`
`rtspclientsink` is not available in this image (`gst-inspect-1.0` confirms absent). Switched entire push transport to RTMP:
- `video_bridge.py`: pipelines now end with `! h264parse ! flvmux streamable=true ! rtmpsink location=rtmp://127.0.0.1:1935/teleop sync=false`
- `mediamtx.yml`: removed `rtmpDisable: yes`; set `rtmpAddress: 127.0.0.1:1935`
- `docker-compose.yml`: env var `MEDIAMTX_RTMP=rtmp://127.0.0.1:1935/teleop` (was `MEDIAMTX_RTSP`)
- `.env`: added `VIDEO_TOPIC=/camera/image_raw` and `VIDEO_TOPIC_TYPE=raw`

### 5. `auth-server/src/app.ts` — WHEP proxy path rewrite
`http-proxy-middleware` v2 resets `req.url` to `req.originalUrl`, so without pathRewrite the full `/video/teleop/whep` path was forwarded to mediamtx, but mediamtx only knows path `teleop`, not `video/teleop`.
```typescript
// Was:
app.use('/video', makeHttpProxy(mediaMtxUrl));
// Now:
app.use('/video', makeHttpProxy(mediaMtxUrl, { '^/video': '' }));
```

### 6. `mediamtx.yml` — pin ICE listener to LAN IP (attempted fix, ICE still fails)
Changed from:
```yaml
webrtcICEUDPMuxAddress: :8891   # old deprecated param name, all interfaces
```
To:
```yaml
webrtcLocalUDPAddress: 192.168.10.123:8891  # new param name, LAN only
webrtcLocalTCPAddress: ""
```
After this change mediamtx startup confirms: `[WebRTC] listener opened on :8889 (HTTP), 192.168.10.123:8891 (ICE/UDP)`. ICE still times out.

---

## RESOLVED — actual root cause and fix

**Root cause:** The host's ufw firewall had `ENABLED=yes` with `DEFAULT_INPUT_POLICY="DROP"`. Port TCP 8080 (auth-server signaling) had an explicit allow rule, so WHEP SDP exchange worked. Port **UDP 8891** (mediamtx WebRTC ICE media, using UDP mux) did **not** have a firewall rule, so inbound STUN binding requests from the mobile device were dropped by ufw before reaching mediamtx. Mediamtx never saw the client's ICE candidates, could not establish a connection, and closed the session after 10 seconds with `deadline exceeded while waiting connection`.

**Verification:** Packet inspection of mediamtx's WHEP answer SDP confirms it correctly publishes only the single ICE candidate `192.168.10.123 8891 typ host` (due to the `webrtcLocalUDPAddress` config). The problem was not candidate pollution but firewall filtering.

**Solution (verified working):**
```bash
# Open UDP 8891 from the mobile device subnet:
sudo ufw allow from 192.168.10.0/24 to any port 8891 proto udp

# Or, without subnet restriction:
sudo ufw allow 8891/udp
```

After the firewall rule is added, video streams immediately. The mobile device can send STUN binding requests through the firewall, mediamtx receives them, and ICE connection succeeds.

**Note:** mediamtx uses a single UDP mux on port 8891 for all WebRTC ICE connectivity (configured in `mediamtx.yml` as `webrtcLocalUDPAddress: 192.168.10.123:8891`). Only this port needs to be opened; no additional TCP or UDP ports are required beyond 8080 for signaling.

---

## Current `mediamtx.yml`

```yaml
logLevel: info
logDestinations: [stdout]

api: yes
apiAddress: 127.0.0.1:9997

rtspAddress: 127.0.0.1:8554
rtmpAddress: 127.0.0.1:1935
hlsAddress: :8888
webrtcAddress: :8889
srtAddress: :8890

hlsDisable: yes

webrtcLocalUDPAddress: 192.168.10.123:8891
webrtcLocalTCPAddress: ""

paths:
  teleop:
    source: publisher
```

---

## Archive: Debugging steps used to identify the root cause

The steps below were used during investigation and are now obsolete (root cause identified). Kept for reference:

1. Pinned mediamtx ICE listener to single LAN IP (`webrtcLocalUDPAddress: 192.168.10.123:8891`) — confirmed it binds correctly, but did not resolve the timeout.

2. Verified SDP answer contents — confirmed mediamtx publishes only one ICE candidate (`192.168.10.123 8891 typ host`), disproving the "candidate pollution" hypothesis.

3. Checked firewall state — discovered ufw with `DEFAULT_INPUT_POLICY="DROP"` and no rule for UDP 8891, explaining why STUN requests were being dropped.

4. Tested firewall rule (`sudo ufw allow 8891/udp`) — video streamed immediately after opening the port, confirming the root cause.

---

## Key file locations

| File | Role |
|---|---|
| `mediamtx.yml` | mediamtx config — ICE/WebRTC settings here |
| `video-bridge/video_bridge.py` | ROS2 → GStreamer → RTMP pipeline |
| `video-bridge/Dockerfile.video_bridge` | multi-stage: `runtime` (prod) / `test` (pytest) |
| `docker-compose.yml` | service wiring, env vars, port mappings |
| `auth-server/src/app.ts` | Express routes + proxy config (lines 88-99) |
| `auth-server/src/proxy.ts` | `makeHttpProxy` wrapper around http-proxy-middleware |
| `web-client/src/whep_client.ts` | WhepClient — ICE gather-then-offer WHEP impl |
| `web-client/src/hooks/useWhepStream.ts` | React hook wrapping WhepClient |
| `.env` | `VIDEO_TOPIC`, `VIDEO_TOPIC_TYPE`, `ROS_NETWORK_INTERFACE=192.168.10.123` |

---

## Environment facts

- Host LAN IP: `192.168.10.123` (from `.env` `ROS_NETWORK_INTERFACE`)
- mediamtx: v1.17.1, `network_mode: host`
- video-bridge: ROS2 Humble, GStreamer 1.20, `network_mode: host`, `ROS_DOMAIN_ID=30`
- Stream: `/camera/image_raw` (raw `sensor_msgs/Image`, RGB8, 1920×1080, ~15 fps)
- Auth proxy: Express + `http-proxy-middleware` v2.0.9
- App URL: `http://192.168.10.123:8080`
