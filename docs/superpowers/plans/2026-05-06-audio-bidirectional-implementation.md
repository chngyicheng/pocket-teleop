# 雙向音頻實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 手機麥 → 機器人喇叭，機器人麥 → 手機喇叭。WebRTC 音頻軌；WHEP 收聽，WHIP 發布。

**動機：** 現場喊話（疏散、警告）、求助、現場聲音感知。teleop 純視覺缺人聲信道。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `audio-bridge/Dockerfile.audio_bridge` | 新建：ALSA/PulseAudio + GStreamer + ROS |
| `audio-bridge/src/audio_bridge.cpp` 或 .py | 新建：機器人麥 → RTSP audio 流；RTSP audio → 機器人喇叭 |
| `mediamtx.yml` | 加 audio path（teleop-audio）支持雙向（WHIP 發布、WHEP 訂閱） |
| `auth-server/src/app.ts` | `/audio` 代理（類 `/video`） |
| `web-client/src/audio_client.ts` | 新建：getUserMedia + WHIP 上行；WHEP 下行 |
| `web-client/test/audio_client.test.ts` | 新建 |
| `web-client/index.html` | 麥克風按鈕（按住說話）；揚聲器音量條 |
| `docker-compose.yml` | audio-bridge 服務 |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：audio-bridge 服務
- [ ] 步驟 1：ROS2 節點訂 `/audio_in`（機器人麥 raw）轉 RTSP audio 推 mediamtx
- [ ] 步驟 2：訂 mediamtx audio 流（聽手機麥），轉 ALSA 播放至機器人喇叭
- [ ] 步驟 3：補 Python 測試（mock GStreamer）

### 任務 2：mediamtx audio 配置
- [ ] 步驟 1：加 `paths.teleop-audio` 支持 WHIP（手機推）+ WHEP（手機訂）
- [ ] 步驟 2：opus 編碼，48 kHz mono
- [ ] 步驟 3：手動驗證

### 任務 3：客戶端 AudioClient
- [ ] 步驟 1：getUserMedia({audio:true})；WHIP 上行至 `/audio/teleop-audio-up/whip`
- [ ] 步驟 2：WHEP 下行從 `/audio/teleop-audio-down/whep` 收
- [ ] 步驟 3：muted 默認；按鈕 toggle
- [ ] 步驟 4：補測（mock RTCPeerConnection）

### 任務 4：UI
- [ ] 步驟 1：底部加麥克風按鈕（按住說話 push-to-talk）
- [ ] 步驟 2：音量條（下行音量），靜音切換
- [ ] 步驟 3：HTTPS 必需（getUserMedia）——README 注明

### 任務 5：文檔
- [ ] 步驟 1：README 音頻用法、HTTPS 要求
- [ ] 步驟 2：data-schema.md 加 audio 流配置
- [ ] 步驟 3：AGENTS.md

---

## 測試要求

- audio-bridge 補測 ≥ 3
- audio_client 補測 ≥ 5
- 全套件綠

## 已知風險／決策

- 須 HTTPS（瀏覽器 getUserMedia 要求）——依賴 https-tls 計劃
- 機器人需音頻硬件；軟件路徑可配，無硬件時禁用
- echo cancellation 默認啟用（瀏覽器內置）
- 不錄製音頻（隱私）；session-recording 計劃明確排除


---

## 重核附則（2026-06-15）— 對現碼校驗

- **文件引用皆存**：本計劃所引諸源文件今仍在，無改名/刪除。
- **React 遷移（關鍵 staleness）**：UI 任務原指 `web-client/index.html`（今僅 44 行 React 掛載點 `<div id="root">` + `/src/main.tsx`）；UI 須改置 React——`web-client/src/views/MissionControl.tsx`、`MissionTablet.tsx`、`web-client/src/components/`。框架無關之邏輯層（`protocol.ts`/`teleop_client.ts`/`settings.ts`、server C++）仍有效。
- **可復用基建**：設計層計劃（無具體 file ref）；WHEP 今為 `useWhepStream` React hook，須刷新 scope 對之。
