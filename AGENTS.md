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

> **致下一代理：** location.replace 修復及 README 更新竣。change-username 和 change-password 表單成功後改用 window.location.replace() 替代 href= 賦值，防止用戶回退至已登出的認證頁面。README 修正測試計數（webclient 85→157、auth 31→34）、移除過時的 detectGateway 故障排除說明、補充 UDP/SRT/MJPEG 視頻源文檔。version-control.md 新增 README.md 更新規則。157 webclient 測試通過。
>
> **下一任務：** 待用戶指示。

**Head SHA：** `cb0c131`（截至 2026-04-29）

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
