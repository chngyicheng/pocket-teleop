# 視頻輸入源擴展計劃

> **致代理：** 必用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。步驟以 `- [ ]` 標記追蹤。

**目標：** 使操作員可從三種視頻輸入源中選擇：RTSP（現有）、UDP/SRT（MediaMTX 接收）、MJPEG 直連（瀏覽器直接顯示）。

**背景：** 當前 `VideoSourcePicker` 僅支持 RTSP → MediaMTX → WHEP → 瀏覽器路徑。偏差表記錄「MJPEG URL 支持可在 RTSP/UDP 輸入源實現時重加」。本計劃實現全部三種源類型。

---

## 三種源類型

| 類型 | 輸入 | MediaMTX 配置 | 瀏覽器顯示 |
|---|---|---|---|
| `rtsp` | RTSP URL（現有） | `source: rtsp://...` | WHEP via `<video>` |
| `udp` | `udp://host:port` | `source: udp://...` | WHEP via `<video>` |
| `srt` | `srt://host:port` | `source: srt://...` | WHEP via `<video>` |
| `mjpeg` | HTTP MJPEG URL | 不調用 MediaMTX | `<img>` 直連 |

UDP/SRT 源通過 MediaMTX 接收後轉為 WebRTC，走現有 WHEP 路徑。MJPEG 源繞過 MediaMTX，直接以 `<img src="...">` 顯示（瀏覽器原生解碼 Motion JPEG）。

---

## 架構決策

- `VideoSourcePicker` 增加 `sourceType` 字段（`'rtsp' | 'udp' | 'srt' | 'mjpeg'`），影響 `buildMtxSource()` 及 `apply()` 行為
- MJPEG 模式下 `apply()` 不調用 `/mediamtx-api`；改而觸發新回調 `onMjpegUrl(url: string | null)`
- `index.html` 監聽 `onMjpegUrl`：有 URL 時顯示 `<img>` 並隱藏 `<video>`；null 時恢復 `<video>`
- MJPEG URL 存入 `localStorage`，頁面加載時恢復（與現有視頻源狀態持久化模式一致）
- `validate()` 方法按 `sourceType` 校驗：RTSP/UDP/SRT 驗證對應 scheme；MJPEG 驗證 `http://` 或 `https://`

---

## 文件映射

### 修改文件

| 文件 | 變更 |
|---|---|
| `web-client/src/video_source.ts` | `VideoSourceType` 枚舉；`buildMtxSource()` 支持 UDP/SRT；`validate()` 按類型；`onMjpegUrl` 回調選項；`apply()` MJPEG 分支 |
| `web-client/index.html` | 源類型選擇器 UI；MJPEG `<img>` 元素；`onMjpegUrl` handler；加載時恢復 MJPEG URL |
| `web-client/test/video_source.test.ts` | 所有新類型的 `validate()`、`buildMtxSource()`、`apply()` 測試 |
| `AGENTS.md` | 更新已竣里程；移除 MJPEG 偏差條目中的「可在 RTSP/UDP 實現時重加」說明 |

---

## 任務一 — `video_source.ts` 擴展

**文件：** `web-client/src/video_source.ts`

**目標：** 擴展 `VideoSourcePicker` 支持四種源類型。

核心變更：
- 增加 `VideoSourceType = 'rtsp' | 'udp' | 'srt' | 'mjpeg'` 類型
- `VideoSourcePickerOptions` 增加 `onMjpegUrl?: (url: string | null) => void`
- `validate(url, type)` 按類型校驗 URL scheme（RTSP 驗 `rtsp://`；UDP 驗 `udp://`；SRT 驗 `srt://`；MJPEG 驗 `http://` 或 `https://`）
- `buildMtxSource(url, type)` 對 UDP/SRT 直接以 URL 作為 source 字段（MediaMTX 原生支持）；MJPEG 不調用此函數
- `apply(url, type)` MJPEG 分支跳過 PATCH，直接調用 `onMjpegUrl(url)`；其餘類型走現有 PATCH 路徑；`apply(null)` / 停用時 MJPEG 調用 `onMjpegUrl(null)`

MJPEG URL 以獨立 localStorage key 持久化，與 MediaMTX source state 分離（兩者可能同時存在）。

驗收：現有 99 webclient 測試全通；新增測試（任務二）亦通過。

- [ ] 增加 `VideoSourceType`
- [ ] 更新 `validate()` 支持四種類型
- [ ] 更新 `buildMtxSource()` 支持 UDP/SRT
- [ ] 更新 `apply()` 增加 MJPEG 分支及 `onMjpegUrl` 回調
- [ ] MJPEG URL localStorage 持久化

---

## 任務二 — 測試

**文件：** `web-client/test/video_source.test.ts`

**目標：** 每種新源類型均有對應測試。

新增測試用例：
- `validate()` 對 UDP/SRT/MJPEG 正確 scheme 通過，錯誤 scheme 拒絕
- `buildMtxSource()` 對 UDP/SRT 生成正確 source 字段
- `apply()` MJPEG 模式：不調用 fetch；調用 `onMjpegUrl`
- `apply()` MJPEG 模式停用：調用 `onMjpegUrl(null)`

驗收：`docker compose run --rm webclient-test` 全通。

- [ ] 增加上述測試用例
- [ ] 確認現有測試無回歸

---

## 任務三 — `index.html` UI

**文件：** `web-client/index.html`

**目標：** 在設置抽屜的視頻源區域增加源類型選擇器；支持 MJPEG 直連顯示。

UI 變更：
- 源類型 `<select>`（RTSP / UDP / SRT / MJPEG 直連），現有 URL 輸入框保留
- 選擇 MJPEG 時，說明文字更新（提示輸入 `http://` URL）
- `onMjpegUrl` handler：有 URL 時顯示 `<img id="mjpeg-img">`、隱藏 `<video>`；null 時恢復 `<video>`、隱藏 `<img>`
- 頁面加載時：若 localStorage 有 MJPEG URL，恢復 `<img>` 顯示
- 頁面加載時：若 localStorage 有 MediaMTX source state，仍繼續現有重新應用邏輯

注意：`<img>` 與 `<video>` 互斥顯示。源類型選擇狀態亦存入 localStorage（避免刷新後丟失選擇）。

驗收：手動在設置抽屜切換源類型，輸入 URL，Apply → 視頻面板對應切換顯示模式（WHEP `<video>` vs MJPEG `<img>`）。

- [ ] 增加源類型 `<select>` 至設置抽屜視頻源區域
- [ ] 增加 `<img id="mjpeg-img">` 至視頻面板，默認隱藏
- [ ] 實現 `onMjpegUrl` handler
- [ ] 實現頁面加載時 MJPEG URL 恢復
- [ ] 源類型選擇持久化至 localStorage

---

## 任務四 — AGENTS.md 更新

- [ ] 更新「已竣里程」：新增 v0.11.0 視頻輸入源擴展行
- [ ] 移除偏差表中 MJPEG 相關的「可在 RTSP/UDP 實現時重加」說明
- [ ] 更新 Head SHA
- [ ] 提交：`feat(video): add UDP/SRT/MJPEG input source types to VideoSourcePicker`
