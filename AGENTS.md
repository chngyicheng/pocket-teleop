# pocket-teleop — 代理指南

> 漸進披露：所需方讀。始於**第一層**，需深者進。

---

## 舊則損益之法

**`CLAUDE.md` 為 `AGENTS.md` 之符號連結。改則改 `AGENTS.md`，勿動 `CLAUDE.md`。**

**代碼改，此文同提交。**

交接狀態節，新代理首讀之處。以零上下文讀者為對象而書：

- **Head SHA** — 更新為即將提交之 commit（暫存後提交前執行 `git rev-parse --short HEAD`）
- **任務表** — 標記 ✅ 完成；移 ⬜ 下一 至後任；Notes 記所創物或通過測試名
- **已知偏差** — 每偏差追加一行至 [deviations.md](memory/agent-guides/deviations.md)，附令冷審者信服之受納理由
- **無代詞 "we" / "I" / "our"** — 第三人稱；讀如文檔，非對話

詳見 [version-control.md](memory/agent-guides/version-control.md)。

---

## 交接狀態 — 從此續

> **致下一代理：** Mission Control UI React 移植役進行中（branch `feat/mission-ui-react`，worktree `.worktrees/feat-mission-ui-react`，自 `feat/mission-ui` HEAD `5775462` 分出）。計劃 `docs/superpowers/plans/2026-05-28-mission-ui-react-migration.md`。**Phase 0 竣**（commit `dea3f83`）：vanilla TS mission 殼諸文件刪、React 18 + Vite 5 + vitest jsdom + @testing-library/{react,jest-dom,user-event} + @vitejs/plugin-react 入 `package.json`、`vite.config.ts`/`tsconfig.json`（jsx `react-jsx`、moduleResolution `bundler`、noEmit）/`vitest.config.ts`（jsdom env）/`Dockerfile.webclient`（vite build → dist/）/`test/setup.ts` 皆配；package-lock.json 自 fresh image cp 出。**Wave 1 竣：** 三 Haiku 並派各於 disjoint 文件域：①Agent A — `src/components/shared.tsx`（Joystick classic/edge/zone variants、MiniMap、Compass、CompassTape、VelBars、Readout、CONNECTION_LABELS 常量；math 自 `design_handoff_pocket_teleop/shared.jsx` 1:1 移）+ `test/shared.test.tsx`（42 測）；②Agent B — `src/hooks/useTeleopBridge.ts`（factory function 形 TeleopClient ctor、E-STOP `sendTwist(0,0,0)` 不檢 connected）+ `src/hooks/useWhepStream.ts`（factory 形 WhepClient ctor）+ 對應 `test/*.test.tsx`（10 + 6 測）；③Agent C — `src/components/SettingsDrawer.tsx`（slide-in drawer、三 section：Gamepad/Video/Connection、robot-namespace localStorage 直存 — settings.ts API 不變式禁改）+ `test/SettingsDrawer.test.tsx`（22 測）。**控制器修諸事：** (a) `test/setup.ts` 加 RTL `afterEach(cleanup)`（vitest globals=off 致 DOM 跨測累，致 SettingsDrawer getByLabelText 多匹配）；(b) `setup.ts` 加 `MediaStream` 與 `PointerEvent` polyfill；(c) `setup.ts` 加 `Element.prototype.setPointerCapture`/`releasePointerCapture`/`hasPointerCapture` 諸 no-op stub；(d) `setup.ts` 加 `Element.prototype.getBoundingClientRect` 自 inline `style.width/height` 派生 rect（jsdom 無 layout 致 Joystick math 算 Infinity/NaN）；(e) `useTeleopBridge.ts` + `useWhepStream.ts` ctor signature 自 `new`-able 改 factory function（測 pattern 傳 arrow `() => fake` 無 `[[Construct]]` slot）；(f) `useTeleopBridge.test.tsx` factory 改 `(opts) => { fake.opts = opts; return fake; }` 致 callbacks 真綁；(g) `shared.test.tsx` 修諸 CSS 屬性選擇器自 camelCase 改 kebab-case（React 序內聯 style 為 kebab）、`toFixed(2)` 期值 0.45→0.46/0.78→0.79（JS rounding）、色 hex/rgb dual-accept（jsdom 規範化）；(h) `shared.tsx` Joystick 加 `data-testid="joystick-zone"`、MiniMap grid div 加 `data-testid="minimap-grid"`、MiniMap `background` 改 `backgroundImage` 長手 + `hexToRgba()` helper（jsdom CSSOM 拒 `background` shorthand 含多重 `repeating-linear-gradient` 與 8-digit hex `${color}22`）；(i) 4 個 `if (zone) {}` 與 `if (onMove.mock.calls.length > 0) {}` guard 諸測去之（前默靜過，今真斷）。**Trophy TDD：** 42 (shared) + 10 (useTeleopBridge) + 6 (useWhepStream) + 22 (SettingsDrawer) = 80 新測。**測：** 244/245 webclient（1 pre-existing whep_client ICE-timer flake 於 d5fb6cd 主同失，環境計時敏感）/ 34 auth / 19 video-bridge / 40 C++ 皆通。**未竣:** Wave 2（MissionControl.tsx + MissionTablet.tsx）、Wave 3（App.tsx + main.tsx + crown jewel 集成測）。
>
> **下一任務：** Wave 2 — 並派二 Haiku：Agent D 寫 `src/views/MissionControl.tsx`（phone layout，1:1 移自 `design_handoff_pocket_teleop/directions/mission.jsx` 之 `MissionControl` 函數）+ 測；Agent E 寫 `src/views/MissionTablet.tsx`（tablet 三欄 layout 220/1fr/240 + 52px top bar）+ 測。詳見計劃文 §Wave 2。

**Head SHA：** `dea3f83`（截至 2026-05-28，branch `feat/mission-ui-react`；Phase 0 scaffold）

### 已竣里程

| 里程碑 | 測試數 | 標籤 |
|---|---|---|
| Server（ROS2 WebSocket、command handler、teleop node） | — | `v0.1.0-server` |
| Web client v0.1.0（protocol、connection、gamepad handler、teleop client、集成測試） | 10 | `v0.1.0-client` |
| Practical gaps（gamepad profiles、reconnection、calibration UI） | 43 | `v0.2.0` |
| Frontend UI（settings.ts、onTwist、responsive index.html 重寫） | 43 | `v0.3.0` |
| Touch joystick + UI 磨光（TouchJoystick 模塊、namespace 設置、gamepad 切換、雙指修復、UI 細化） | 60 | `v0.4.0` |
| v0.5.0（KeyboardHandler、TeleopClient 修復 retry + onPong、TouchJoystick hint、axis remap、輸入模式欄、last-seen pill） | 63 | `v0.5.0` |
| 視頻串流（mediamtx、video-bridge、WhepClient、/video proxy、WebRTC 面板） | 85 webclient / 31 auth / 19 video-bridge | `v0.6.0` |
| 視頻源選擇器（auth-server /mediamtx-api proxy、VideoSourcePicker 模塊、設置 UI）+ 404 修復 | 34 auth / 99 webclient / 19 video-bridge | `v0.7.0` |
| v0.8.0 控制可靠性（鍵盤 key-up 即時觸發、e-stop 按鈕 + 空格、calibration Ready 階段） | 34 auth / 103 webclient / 19 video-bridge | `v0.8.0` |
| v0.9.0 反饋與磨光（RTSP URL 驗證、WhepClient 串流健康徽章、TeleopClient 延遲顯示） | 34 auth / 117 webclient / 19 video-bridge | `v0.9.0` |
| v0.10.0 機器人遙測（odom 訂閱、廣播、protocol odom 類型、TeleopClient onOdom、UI 面板 + 羅盤） | 34 auth / 119 webclient / 19 video-bridge | `v0.10.0` |
| Apply 按鈕端到端驗證（integration profile：mediamtx-test 容器、mediamtx-test-config.yml、3 集成測試） | 3 integration | — |
| v0.11.0 視頻輸入源擴展（VideoSourceType、UDP/SRT/MJPEG validate/buildMtxSource/apply、onMjpegUrl 回調、UI 源類型選擇器、MJPEG img 直連） | 34 auth / 149 webclient / 19 video-bridge | — |
| v0.11.0 代碼審查修復（5 處邏輯缺陷、8 個補測、代碼氣味清理） | 34 auth / 157 webclient / 19 video-bridge | — |
| Auth bugfixes（賬戶頁表單 fetch 內聯錯誤、visibilitychange 登出保護、Docker 健康檢查修復） | 34 auth / 157 webclient / 19 video-bridge | — |
| location.replace 修復及 README 更新（表單成功重定向防回退、測試計數、故障排除更新、UDP/SRT/MJPEG 文檔） | 34 auth / 157 webclient / 19 video-bridge | — |
| start.sh 啟動腳本 + mjpegImgEl 筆誤修復 + vitest 文件序列化（解 idle-watchdog 集成測試計時失敗） | 34 auth / 157 webclient / 19 video-bridge | — |
| 全倉代碼審查並修（六 Haiku 斥候並修 30 findings：mjpegImgEl 餘殘、9091/9997/8554 LAN 曝閉、isfinite 守、test_command_handler 補 28 測、TeleopClient 指數退避、namespace 邏輯正、video_bridge Lock、auth 等時+原子寫+secure cookie+proxy timeout 等） | 34 auth / 157 webclient / 19 video-bridge / 40 C++ | — |
| Mission Control UI 整合（worktree + 三 Haiku 並 + 一 Haiku 集成 + 控制器測修：`mission_hud.ts`、`mission_joystick.ts`、`mission_header.ts`、`mission_app.ts`、`index.html` 全重寫；trophy TDD：24 輕單元 + 13 重集成；E-STOP z-index 10 永居最上、Space 鍵聯動） | 34 auth / 191 webclient (1 pre-existing flake) / 19 video-bridge / 40 C++ | `feat/mission-ui` |
| Mission UI React 移植 Phase 0 + Wave 1（vanilla TS 殼刪、React 18 + Vite 5 + jsdom + RTL 配；三 Haiku 並寫 `shared.tsx` / `useTeleopBridge` + `useWhepStream` hooks / `SettingsDrawer.tsx`；控制器加 `setup.ts` polyfills - jest-dom/cleanup/MediaStream/PointerEvent/setPointerCapture/getBoundingClientRect、改 ctor 為 factory function 形、修 CSS 屬性選擇器 camelCase→kebab、MiniMap `background` shorthand 改 `backgroundImage` 長手 + `hexToRgba()`、去諸 `if (zone)` silent-pass guard） | 34 auth / 244/245 webclient (1 pre-existing flake) / 19 video-bridge / 40 C++ | `feat/mission-ui-react` |

### 已知偏差（後續工作仍相關）

詳見 [deviations.md](memory/agent-guides/deviations.md)。新增偏差亦追加於彼。

---

## 文檔索引

| 所需 | 查閱 |
|---|---|
| 立即運行堆棧 | 第一層（下） |
| 構建、測試、docker 指令 | [repository-structure.md](memory/agent-guides/repository-structure.md) |
| 已知偏差完整列表 | [deviations.md](memory/agent-guides/deviations.md) |
| 技術棧與依賴 | [techstack.md](memory/agent-guides/techstack.md) |
| 消息協議與數據類型 | [data-schema.md](memory/agent-guides/data-schema.md) |
| Git 工作流與文檔更新規則 | [version-control.md](memory/agent-guides/version-control.md) |
| TDD 標準、護欄、任務導向 | [project-skills.md](memory/agent-guides/project-skills.md) |
| Server 實現計劃 | `docs/superpowers/plans/2026-03-27-server-implementation.md` |
| Server 設計規格 | `docs/superpowers/specs/2026-03-27-server-design.md` |
| Web client 實現計劃 | `docs/superpowers/plans/2026-03-28-client-implementation.md` |
| Web client 設計規格 | `docs/superpowers/specs/2026-03-28-client-design.md` |
| Practical gaps 實現計劃 | `docs/superpowers/plans/2026-03-28-practical-gaps-implementation.md` |
| Practical gaps 設計規格 | `docs/superpowers/specs/2026-03-28-practical-gaps-design.md` |
| Frontend UI 實現計劃 | `docs/superpowers/plans/2026-03-28-frontend-ui-implementation.md` |
| Frontend UI 設計規格 | `docs/superpowers/specs/2026-03-28-frontend-ui-design.md` |
| Touch joystick 實現計劃 | `docs/superpowers/plans/2026-03-29-touch-joystick-implementation.md` |
| Touch joystick 設計規格 | `docs/superpowers/specs/2026-03-28-touch-joystick-design.md` |
| **v0.5.0 實現計劃** | `docs/superpowers/plans/2026-03-30-v0.5.0-implementation.md` |
| v0.5.0 設計規格 | `docs/superpowers/specs/2026-03-30-v0.5.0-design.md` |
| **Auth server 實現計劃** | `docs/superpowers/plans/2026-04-03-auth-server-implementation.md` |
| Auth server 設計規格 | `docs/superpowers/specs/2026-04-03-auth-server-design.md` |
| **視頻串流實現計劃** | `docs/superpowers/plans/2026-04-09-video-streaming-implementation.md` |
| **視頻源選擇器實現計劃** | `docs/superpowers/plans/2026-04-09-video-source-picker-implementation.md` |
| **v0.8.0 控制可靠性計劃** | `docs/superpowers/plans/2026-04-11-v0.8.0-control-reliability.md` |
| **v0.9.0 反饋與磨光計劃** | `docs/superpowers/plans/2026-04-11-v0.9.0-feedback-polish.md` |
| **v0.10.0 機器人遙測計劃** | `docs/superpowers/plans/2026-04-11-v0.10.0-robot-telemetry.md` |
| **Apply 按鈕端到端驗證計劃** | `docs/superpowers/plans/2026-04-17-apply-button-e2e-verification.md` |
| **視頻輸入源擴展計劃** | `docs/superpowers/plans/2026-04-17-video-input-sources.md` |
| **Auth bugfixes 實現計劃** | `docs/superpowers/plans/2026-04-08-auth-bugfixes.md` |
| **代碼審查評閱（2026-05-27）** | `docs/2026-05-27-codebase-review.md` |
| **代碼審查修補計劃（2026-05-27）** | `docs/superpowers/plans/2026-05-27-codebase-review-fixes.md` |
| **Mission Control UI 整合計劃（2026-05-28）** | `docs/superpowers/plans/2026-05-28-mission-ui-integration.md` |
| **Mission Control UI React 移植計劃（2026-05-28）** | `docs/superpowers/plans/2026-05-28-mission-ui-react-migration.md` |
| **功能待辦池（2026-05-06 起）** | 見下「功能計劃池」 |

### 功能計劃池（待用戶選定優先級實施）

**安全與控制**
- HTTPS/TLS：`docs/superpowers/plans/2026-05-06-https-tls-implementation.md`
- 登錄速率限制：`docs/superpowers/plans/2026-05-06-login-rate-limit-implementation.md`
- 會話閒置超時：`docs/superpowers/plans/2026-05-06-session-timeout-implementation.md`
- 速度上限滑桿：`docs/superpowers/plans/2026-05-06-speed-limit-slider-implementation.md`
- 地理圍欄：`docs/superpowers/plans/2026-05-06-geofence-implementation.md`
- 斷線後行為：`docs/superpowers/plans/2026-05-06-disconnect-behavior-implementation.md`

**觀察**
- 地圖視圖：`docs/superpowers/plans/2026-05-06-map-view-implementation.md`
- 多攝像頭：`docs/superpowers/plans/2026-05-06-multi-camera-implementation.md`
- 延遲歷史圖：`docs/superpowers/plans/2026-05-06-latency-graph-implementation.md`
- 電池遙測：`docs/superpowers/plans/2026-05-06-battery-telemetry-implementation.md`
- 診斷面板：`docs/superpowers/plans/2026-05-06-diagnostics-panel-implementation.md`
- 網絡質量：`docs/superpowers/plans/2026-05-06-network-quality-implementation.md`

**操作**
- 會話錄制：`docs/superpowers/plans/2026-05-06-session-recording-implementation.md`
- 多觀察者：`docs/superpowers/plans/2026-05-06-multi-observer-implementation.md`
- 雙向音頻：`docs/superpowers/plans/2026-05-06-audio-bidirectional-implementation.md`
- PTZ 雲台控制：`docs/superpowers/plans/2026-05-06-ptz-control-implementation.md`
- 輔助輸出：`docs/superpowers/plans/2026-05-06-aux-outputs-implementation.md`
- 預設動作宏：`docs/superpowers/plans/2026-05-06-action-macros-implementation.md`
- OTA 更新：`docs/superpowers/plans/2026-05-06-ota-updates-implementation.md`

**何時更深：** 指南文件不能解答 → 讀相關規格。規格不能解答 → 讀計劃。勿預先讀取三者。

---

## 第一層 — 何物，如何運行

**pocket-teleop** 通過 WebSocket 從手機瀏覽器駕駛 ROS2 機器人。Auth server 處理登錄、代理 web client 和 WebSocket，通過 ROS2 向 `/cmd_vel` 發布速度指令。

**ROS2 在 Docker 內運行。主機僅需 Docker 和 Docker Compose。**

```bash
# 先複製 .env.example 至 .env 並填入所有值：
cp .env.example .env
# 編輯 .env：設置 TELEOP_ADMIN_USER、TELEOP_ADMIN_PASSWORD、SESSION_SECRET

docker compose up --build

# 停止
docker compose down
```

Web client（手機瀏覽器）：`http://<robot-ip>:8080` — 首次訪問顯示登錄提示。

**憑據：** 每機器人單一操作員。首次運行：用 `.env` 值登錄——服務器強制立即更改密碼。新憑據存於 `auth-data` Docker 卷，跨重啟和鏡像重建持久。重置：`docker compose down -v`（刪除卷）後重啟。

構建指令、測試指令、文件結構 → [repository-structure.md](memory/agent-guides/repository-structure.md)

---

## 執行模式 — 子代理驅動開發

**所有實現工作使用 `superpowers:subagent-driven-development` 技能。**

控制器每任務派遣新子代理。各子代理：
1. 嚴格按計劃實現
2. 運行測試（僅 Docker — 絕不裸 `npm`）
3. 在與代碼同一 commit 中更新 `AGENTS.md` 交接表
4. 提交並匯報

每個子代理完成後，控制器進行兩輪審查（規格合規，然後代碼質量）後標記任務完成並繼續。

見 `docs/superpowers/plans/` 獲取當前實現計劃。

### 通訊模式（caveman skill 規）

| 通道 | 模式 | 何故 |
|---|---|---|
| 控制器 ↔ 用戶 | `caveman full`（英） | 默認交互，省 token 而保技術精確 |
| 控制器 ↔ Haiku 子代理 | `caveman wenyan-ultra`（文言極簡） | Haiku 提示亦壓縮，技術術語英文不譯 |
| Code / commits / PRs / security warnings / 不可逆操作確認 | normal English | caveman skill 之 auto-clarity 規定 |

用戶說 `normal` 或 `stop caveman` 則本輪 revert。等級持至改或會話終。

---

## 任務完成典則 — 每任務強制執行

**每任務、每次、無例外。**

1. **運行所有測試** — 零失敗方可繼續。先修失敗。套件綠燈前勿進行第 2 步。
2. **更新所有文檔** — 與代碼同一 commit：
   - `AGENTS.md` 交接表：標記任務 ✅ 完成，推進 ⬜ 下一，更新 Notes 和 Head SHA
   - 任何已更改的指南文件（見 [version-control.md](memory/agent-guides/version-control.md) 中「文檔持續更新」表）
3. **提交** — 每任務一個 commit，代碼 + 文檔合併
4. **請求推送** — 精確說：`"Committed as <hash>. Ready to push — shall I?"`
5. **等待** — 用戶明確確認推送並給予許可前勿開始下一任務

跳過任何步驟違反工作流。測試為門——通過前一切停止。

---

## 第二層 — 開發工作流

構建和測試指令見 [repository-structure.md](memory/agent-guides/repository-structure.md)。

分支策略、提交約定、文檔更新規則見 [version-control.md](memory/agent-guides/version-control.md)。

TDD 標準、代碼質量標準、執行規則見 [project-skills.md](memory/agent-guides/project-skills.md)。

---

## 第三層 — 架構與數據

語言、運行時、依賴詳情見 [techstack.md](memory/agent-guides/techstack.md)。

組件層圖和關鍵文件映射見 [repository-structure.md](memory/agent-guides/repository-structure.md)。

消息協議、C++ 結果類型、ROS2 參數、環境變量見 [data-schema.md](memory/agent-guides/data-schema.md)。

---

## 第四層 — 任務指引

任務導向表（各任務創建何物及須通過哪些測試）見 [project-skills.md](memory/agent-guides/project-skills.md)。

完整逐步代碼：`docs/superpowers/plans/2026-03-27-server-implementation.md`

完整協議和組件規格：`docs/superpowers/specs/2026-03-27-server-design.md`
