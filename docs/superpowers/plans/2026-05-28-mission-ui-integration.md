# Mission Control UI 整合計劃（2026-05-28）

## 旨

依 `design_handoff_pocket_teleop/README.md` 與 `directions/mission.jsx` 之設計圖，移植 Mission Control UI 入 `web-client/`。設計為 React/JSX 樣板，本倉非 React——以**純 TypeScript 模塊**呈現，循 `touch_joystick.ts` 既有模式。

## 範圍

**入：**
- HUD primitives：VelBars、MiniMap、Compass、Readout——集於 `mission_hud.ts`
- MissionJoystick——支 `classic`、`edge`、`zone` 三變體，`axes: 'xy'|'x'|'y'` 軸鎖、`label` 文、theme props
- MissionHeader——漢堡符、標題、robot pill、連線芯片、E-STOP 鈕
- MissionApp——集成殼，繫 TeleopClient / WhepClient / 上三組件，掛入新 `index.html`
- 三 layout：phone-landscape（首要）、phone-portrait、tablet-landscape——以 CSS media query 切

**出（不動）：**
- `teleop_client.ts`, `whep_client.ts`, `protocol.ts`, `connection.ts`, `settings.ts`, `gamepad_profiles.ts`, `gamepad_handler.ts`, `keyboard_handler.ts`, `video_source.ts`
- `touch_joystick.ts`——舊類**保留並存**，新 `MissionJoystick` 為新類，不替換、不刪舊
- 後台：auth-server、teleop-server、video-bridge、mediamtx 配置

## 設計決議

| 議題 | 決議 |
|---|---|
| 框架 | 純 TypeScript，無 React。設計 README 允「pick whatever framework fits the rest of the stack」；本倉現存框架為 vanilla TS |
| 樣式 | CSS class + `<style>` block 注於 `index.html`，非內聯 JSX style。各模塊建 DOM 時加 class，樣式定中央 |
| 字體 | Inter + JetBrains Mono via Google Fonts CDN（design README 允；自托管後事） |
| 圖標 | Unicode glyph 足以（`☰`、`■`、`●`、`⟳`、`○`）——design 自身亦如此 |
| 視頻 | 沿用既有 WhepClient + `<video>` element；MJPEG fallback 已存 |
| 模擬 | `useTeleopState` 之 dead-reckoning **棄之**——直繫 `TeleopClient.onOdom` 真實里程計 |
| E-STOP | 永居 z-index 最上，絕不被任 modal 遮蓋 |
| Joystick 默認變體 | `zone`（hold-zone）——design README 推薦 |

## 文件圖

**新文件：**
- `web-client/src/mission_hud.ts`——`mountVelBars`、`mountMiniMap`、`mountCompass`、`mountReadout` 四 mount 函數
- `web-client/src/mission_joystick.ts`——`MissionJoystick` 類
- `web-client/src/mission_header.ts`——`MissionHeader` 類
- `web-client/src/mission_app.ts`——集成殼 `startMissionApp(opts)`
- `web-client/test/mission_hud.test.ts`——輕單元（≤ 10 個）
- `web-client/test/mission_joystick.test.ts`——輕單元（≤ 8 個）
- `web-client/test/mission_header.test.ts`——輕單元（≤ 6 個）
- `web-client/test/mission_app.test.ts`——**crown jewel** 集成測試（5–8 個）

**改文件：**
- `web-client/index.html`——替換 UI shell；保留 favicon link、script type=module、Google Fonts link
- `AGENTS.md`——交接狀態節、Head SHA、里程表追加一行

## TDD 規格——trophy 範式

依 `memory/agent-guides/project-skills.md`：「heavy integration tests, light unit tests」。

**每 Wave 1 組件流程：**
1. 創 stub 文件——導出名存，函數體拋 `Error('not implemented')`
2. 寫測試——僅驗 user-visible behavior（DOM 結構、屬性、callback 觸發），勿釘 internal helper return type
3. 跑測試確認紅（behavior failure，非 module-not-found）
4. 實作——綠
5. 不提交（控制器於 Wave 1 末合一提交）

**Crown jewel 集成測試（Wave 2）：**
MissionApp mount 入 jsdom，驗：
- status callback `connected=true` → 連線芯片變綠色 + 含 `Connected` 字
- odom callback → MiniMap 之 polyline 點數增
- 指針 down/move/up on DRIVE 區 → `TeleopClient.sendTwist` 被調，lx 與 az 值正確（drive 映射 `setLx(-y); setAz(-x)`）
- 指針 on STRAFE 區 → ly 設定，lx/az 不動（X 軸鎖）
- E-STOP 鈕點擊 → `sendTwist(0,0,0)`
- Space 鍵 → `sendTwist(0,0,0)`
- reconnecting 狀態 → 視頻 viewport 加 `dim` class
- disconnected 狀態 → joystick 移動不觸 `sendTwist`

**既有 157 webclient 測試必通**——任 agent 完工後跑全套，零失敗方算結。

## 工作流

**Worktree：** `.worktrees/feat-mission-ui`，branch `feat/mission-ui`，自 `main` 始。各 agent 入此 worktree。

### Wave 1（三 Haiku agent 並行；同 worktree；不提交）

各 agent 嚴禁觸他 agent 文件域。各 agent **不 git add 不 git commit**——控制器於 Wave 1 末合一提交。各 agent 跑 docker 測試確認綠，匯報文件路徑與測試名。

**Agent A — HUD primitives**
- 唯動文件：`web-client/src/mission_hud.ts`、`web-client/test/mission_hud.test.ts`
- 導出：`mountVelBars`、`mountMiniMap`、`mountCompass`、`mountReadout`
- 各函數簽名 `(el: HTMLElement, opts: ...) => { update(state), destroy() }`
- VelBars：三行（lx、ly、az），bar 自中心向兩端伸長，幅 = `Math.abs(v)*50%`
- MiniMap：SVG polyline 維最近 80 位點，robot arrow 居中旋轉
- Compass：SVG 圓+三角針，文字三位零填補度數
- Readout：pill 形含 label + value
- 測試：每函數 1–2 個 jsdom 用例

**Agent B — MissionJoystick**
- 唯動文件：`web-client/src/mission_joystick.ts`、`web-client/test/mission_joystick.test.ts`
- 類 `MissionJoystick(container, opts)`，opts 含 `variant`、`axes`、`size`、`baseSize`、`knobSize`、`baseColor`、`ringColor`、`knobColor`、`label`、`onMove(x,y)`、`onEnd()`
- 句柄返 `destroy()` 清監聽
- 軸鎖：`axes==='x'` 強 `y=0`；`axes==='y'` 強 `x=0`
- hold-zone（`variant==='zone'`）：`pointerdown` 時 base 生於 finger 落點 local 坐標
- classic：base 永居中心
- edge：idle 顯 hint 點，active 時 base 居中
- normalization：knob 距 clamp 至 `baseSize/2`，輸出 `[-1, 1]`
- 測試：jsdom PointerEvent 模擬五用例——x-only 軸鎖、normalization clamp、hold-zone spawn 位置、destroy 清監聽、idle 時 hint 顯隱

**Agent C — MissionHeader**
- 唯動文件：`web-client/src/mission_header.ts`、`web-client/test/mission_header.test.ts`
- 類 `MissionHeader(container, opts)`，opts 含 `compact: boolean`、`robotName: string`、`onMenu()`、`onEStop()`
- 方法：`setConnectionState(state, retryCount?)`——三 state：`'live'|'reconnecting'|'disconnected'`，retryCount 顯於 reconnecting
- DOM：漢堡 button、title span、robot pill span、connection chip span、E-STOP button
- compact=true：芯片短文（`● Live` / `⟳ Retry` / `○ Down`）；false：長文（`● Connected — diff_drive` 等）
- 測試：jsdom 三用例——connection chip 三狀態正色 class、E-STOP 點擊觸 callback、compact 模式短文

### Wave 2（單 Haiku agent，續 Wave 1；同 worktree）

**Agent D — MissionApp 集成**
- 動文件：
  - 新 `web-client/src/mission_app.ts`、`web-client/test/mission_app.test.ts`
  - 改 `web-client/index.html`
- 函數 `startMissionApp(opts)`：
  - 創 MissionHeader、四 HUD mount、二 MissionJoystick（DRIVE 與 STRAFE）、`<video>` element
  - 繫 `TeleopClient.onStatus` → MissionHeader.setConnectionState
  - 繫 `TeleopClient.onOdom` → MiniMap + Compass update
  - 繫 `TeleopClient.onLatency` → Readout update
  - 繫 `TeleopClient.onReconnecting` → MissionHeader.setConnectionState('reconnecting', n) + viewport dim class
  - DRIVE joystick.onMove `(x,y) => sendTwist(-y, ly, -x)`（lx=-y，az=-x，ly 由 STRAFE 維持）
  - STRAFE joystick.onMove `(x) => sendTwist(lx, x, az)`
  - DRIVE/STRAFE onEnd 各歸零自軸
  - E-STOP 鈕 + Space 鍵雙觸 `sendTwist(0,0,0)`
- `index.html` 改寫：
  - 清舊 chrome（status pill、robot-name strip、舊 video panel、settings drawer 全替）
  - 留 favicon link、Google Fonts link、script type=module 載 mission_app
  - 預定 CSS：dark palette、grid layout、media query 切手機橫 / 豎 / 平板
- 跑 crown jewel 集成測試 + 全 157 既有測試——零失敗
- 提交 `feat: integrate Mission Control UI`——含 Wave 1 + Wave 2 全部新文件（控制器於 Wave 2 末統一提交，或 Wave 1 末預提交+Wave 2 再提交）

## 工作流順序（控制器）

1. 創 worktree `.worktrees/feat-mission-ui`，branch `feat/mission-ui` 自 `main`
2. 並行派遣 Agent A、B、C 入此 worktree——各嚴限文件域
3. Wave 1 三 agent 全綠後，控制器提交 `feat: add mission ui primitives (hud, joystick, header)`
4. 派遣 Agent D 續整合
5. Agent D 完工後，控制器跑全套測試（webclient + auth + video-bridge）確零失敗
6. 控制器更新 `AGENTS.md` 交接表 + Head SHA + 里程行
7. 控制器提交 `feat: integrate Mission Control UI shell`
8. 報用戶：`"Committed as <hash>. Ready to push — shall I?"`

## 驗收

- 全 157 既有 webclient 測試通
- 新單元測試 ≥ 15 個通
- 新 crown jewel 集成測試 ≥ 5 個通
- `docker compose up --build` 起動正常（人工煙測——告用戶 manual verify）
- E-STOP 鈕（鼠標）與 Space 鍵雙觸 zero-twist
- 連線指示器三狀態色正

## 不變式（agents 不得違）

- 不引 React、Vue、Angular、Svelte 等 UI framework；無 `npm install` 新依賴
- 不動 TeleopClient、WhepClient、protocol、connection、settings 之 API
- 不動 `touch_joystick.ts`、`whep_client.ts`、`teleop_client.ts` 等既有源
- 不破既測——agent 完工前跑全 `webclient-test` 確零失敗
- E-STOP z-index 永最高
- 各 Wave 1 agent 唯動自身文件域；不 `git add -A`、不提交
- 測試命名 `mission_*.test.ts`，vitest 自掃，無需配置改動
- TDD 紅階段必為 behavior failure，非 module-not-found（stub 先存）

## 已知偏差

- 設計 README 提及 LIGHTS toggles、REC indicator、calibration UI 等——本計劃首版**不實作**（無對應後端訊號）；後續計劃覆蓋
- 設計之 VideoScene 動畫地板格——棄之，以真實 `<video>` 替；空閒時黑底
