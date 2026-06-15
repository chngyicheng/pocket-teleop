# 多攝像頭實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 支持多個視頻源並切換，每路獨立 mediamtx path 與配置。UI 提供攝像頭選擇器。

**動機：** 今單流。雙視角（前後）、多視角（環視）、雲台多角度為實機常見配置。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `mediamtx.yml` | 加多 path：teleop, teleop2, teleop3...（或動態） |
| `auth-server/src/app.ts` | `/video` 代理支持 path 參數 |
| `web-client/src/video_source.ts` | 加 cameraId 概念，per-camera 配置 |
| `web-client/src/whep_client.ts` | URL 含 cameraId |
| `web-client/index.html` | 攝像頭切換條（縮略圖列） |
| `web-client/src/settings.ts` | 加 `cameras: CameraConfig[]` |
| `video-bridge/Dockerfile.video_bridge` | 支持 N 個 video-bridge 實例 |
| `docker-compose.yml` | 多實例化 video-bridge（環境變量 CAMERA_ID） |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：服務器端多路徑
- [ ] 步驟 1：mediamtx.yml 加 `paths.teleop2`、`teleop3` 配置（或用通配 `~teleop\d+`）
- [ ] 步驟 2：video-bridge 取 `CAMERA_ID` env，發布至 `rtsp://localhost:8554/teleop${CAMERA_ID}`
- [ ] 步驟 3：docker-compose.yml 多實例化 video-bridge，每個綁不同 ROS topic + camera id

### 任務 2：auth-server /video 路由參數化
- [ ] 步驟 1：`/video/:cameraId/whep` 路由代理至 `mediamtx/teleop${cameraId}/whep`
- [ ] 步驟 2：補集成測試

### 任務 3：客戶端 cameraId
- [ ] 步驟 1：WhepClient 構造接 cameraId，URL 含之
- [ ] 步驟 2：VideoSourcePicker 加 cameras 列表（每相機獨立 mode + url）
- [ ] 步驟 3：settings 持久化 cameras 配置

### 任務 4：UI 切換
- [ ] 步驟 1：index.html 視頻面板下加縮略圖條，每相機一格
- [ ] 步驟 2：點擊切換主視圖
- [ ] 步驟 3：縮略圖小流（低分辨率）並行訂閱以快速切換；或僅訂主流

### 任務 5：文檔
- [ ] 步驟 1：README 多攝像頭配置節
- [ ] 步驟 2：AGENTS.md 交接

---

## 測試要求

- whep_client 測試補 cameraId
- video_source 測試補多相機配置
- auth-server 集成測試補 /video/:id
- 全套件綠

## 已知風險／決策

- 多 video-bridge 實例耗 CPU；移動 CPU 可能不堪——限 N=2 默認，可配
- 縮略圖並行訂閱耗帶寬——僅主流訂；切換時重連
- mediamtx 通配 path 簡化配置但動態相機數需 hot-reload 支持


---

## 重核附則（2026-06-15）— 對現碼校驗

- **文件引用皆存**：本計劃所引諸源文件今仍在，無改名/刪除。
- **React 遷移（關鍵 staleness）**：UI 任務原指 `web-client/index.html`（今僅 44 行 React 掛載點 `<div id="root">` + `/src/main.tsx`）；UI 須改置 React——`web-client/src/views/MissionControl.tsx`、`MissionTablet.tsx`、`web-client/src/components/`。框架無關之邏輯層（`protocol.ts`/`teleop_client.ts`/`settings.ts`、server C++）仍有效。
- **可復用基建**：視頻今經 `useWhepStream` React hook（非 index.html `<video>`）；切換器/分屏置 React。`video_source.ts`/`whep_client.ts`/`settings.ts` 仍現存。
