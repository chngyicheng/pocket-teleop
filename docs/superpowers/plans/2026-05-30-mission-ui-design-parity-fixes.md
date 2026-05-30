# Mission UI 設計對等修補計劃（2026-05-30）

## 旨

React 移植役（branch `feat/mission-ui-react`）三浪畢，瀏覽器煙測竣，然視之與 `design_handoff_pocket_teleop/directions/mission.jsx` 比對，發現八處出入：四處為**功能缺失**（數據已具但未顯）、三處為**視覺缺失**（design 有靜態 placeholder 而本港無）、一處為**佈局回歸**（design 於 phone-portrait 亦顯之諸 overlay 於本港被 `isLandscape` 條件藏）。

## 緣由

控制器於 Wave 2、Wave 3 之側 Haiku 寫 view 文件時，遵 plan 簡化指示——「VELOCITY 顯固定 0/0/0」、「V/ω 底 readouts 固定 0.00」等 deviation 預宣為可。然功能上 Haiku 既於組件內以 useState 跟 `lx`/`ly`/`az` 之 onMove call，僅未於 readout 顯，純疏失，非設計權衡。又 MissionControl 之 phone-portrait 將 telemetry stack 與 MiniMap 全藏，違 design 之兩 layout 皆顯（size 隨 layout 調）意。本計劃逐項補之。

## 範

僅修諸 view 文件，不擴新 hook、不引新 npm 依賴、不改數據層 API。所修包：

- `web-client/src/views/MissionTablet.tsx`（六處：V/ω readouts、HEADING track、top bar LAT/UP/BAT/SIG、STREAM 四 DataRows、左欄 footer ops info、UI-only placeholders）
- `web-client/src/views/MissionControl.tsx`（一處：phone-portrait 去 `isLandscape &&` guard，size 隨 layout 變）

`shared.tsx`、`SettingsDrawer.tsx`、`hooks/*`、`teleop_client.ts`、`whep_client.ts` 諸文件不動。

## 已不為（設計權衡保留）

REC indicator chip 跳過——plan 預宣「設計 REC indicator 默認隱藏（無 recording 訊號）」為可接受 deviation，本計劃從之。

## 任務分（三 Haiku 並派；disjoint 文件域）

### Task A — MissionTablet 功能缺失修

**動：** `web-client/src/views/MissionTablet.tsx`、`web-client/test/MissionTablet.test.tsx`

**改項：**

1. 中央底部 V/ω readouts：當前硬編 `'0.00 m/s'` 與 `'0.00 rad/s'`。改用組件內已跟之 `lx`/`ly`/`az` useState：
   - V 值：`Math.hypot(lx, ly).toFixed(2) + ' m/s'`
   - ω 值：`az.toFixed(2) + ' rad/s'`

2. 右欄 HEADING > track DataRow：當前硬編 `'0°'`。改：`(Math.atan2(ly, lx) * 180 / Math.PI).toFixed(0) + '°'`。

3. 頂 bar 加 LAT Readout pill（介 robot name 與 connection chip 間）：
   - label `'LAT'`、value 自 `bridge.latencyMs`（null 時顯 `'—'`，否則 `bridge.latencyMs + 'ms'`）、color 用 palette accent

**測補：**

- MissionTablet > V/ω readouts reflect joystick state — 取 DRIVE joystick element via `getAllByTestId('joystick-zone')[0]`、fireEvent.pointerDown + pointerMove、斷 V/ω 文本含非零值（match `/[0-9]+\.[0-9]+/`）
- MissionTablet > HEADING track reflects atan2(ly, lx) — STRAFE pointerDown + pointerMove 致 ly 非零，DRIVE pointerDown + pointerMove 致 lx 非零，斷 track DataRow 文本非 `'0°'`
- MissionTablet > top bar LAT shows bridge.latencyMs — fake bridge `latencyMs: 42`，斷 DOM 含文本 `'42ms'`；改 `latencyMs: null`，斷含 `'—'`

**勿動其他既有測之斷言。**

### Task B — MissionControl phone-portrait 回歸修

**動：** `web-client/src/views/MissionControl.tsx`、`web-client/test/MissionControl.test.tsx`

**改項：**

1. 去三處 `{isLandscape && (...)}` 守，使 telemetry stack、MiniMap、Compass 於 portrait 與 landscape 皆渲。

2. Size 隨 layout 變（與 design 同）：
   - MiniMap：`size={isLandscape ? 110 : 88}`
   - Compass、telemetry stack 視覺保 landscape 之 padding 但於 portrait 顯較緊湊版（若 padding 衝突，僅 size 調，position 保 `bottom: 8, right: 8`）
   - 注：portrait 之 telemetry stack（LAT/BAT/SIG）寬度受限，宜減為僅 LAT（live 值）一 Readout——若 design 三皆顯則三皆顯。**重讀 design L82-89**：design 三皆顯於兩 layout。從之。

**測補：**

- MissionControl > phone-portrait renders telemetry stack and minimap — 渲 `layout="phone-portrait"`、斷 DOM 含 `Readout` 之 LAT 文本（或 query by `getAllByText` MiniMap polyline element）
- 既有 `phone-portrait hides telemetry stack and compass` 之測**反**：改名 `phone-portrait renders telemetry stack and minimap (smaller size)` 並斷顯而非藏

**勿動其他測。**

### Task C — MissionTablet 視覺對等補（UI-only placeholders）

**動：** `web-client/src/views/MissionTablet.tsx`（同 Task A 之文件——故 Task C 須**於 Task A 後**順序執行，非並派）

**改項：**

1. 頂 bar 加三 Readout（介 LAT 與 connection chip 間，全 UI-only 靜態值，與 design L241-243 同）：
   - UP value `'03:24:18'`、BAT value `'78%'`、SIG value `'-58dBm'`、皆 color accent

2. 左欄 STREAM SidePanel 內加四 DataRow（替當前單 `'● Live'` 行；保留 stream.state 之動態行於 DataRow 後或前）：
   - `src` v `'WebRTC'`、`codec` v `'H.264'`、`fps` v `'30.1'`、`res` v `'1280×720'`（design L263-266）
   - 動態行：`● Live` 或 `● {state}` 留之

3. 左欄末尾加 footer ops info（design L277-280，margin-top auto 推至底，font-size 9px opacity 0.5）：
   - 兩行：`'cmd_vel @ 50hz'`、`'last pong 0.04s'`

**測補：** 二輕單元
- MissionTablet > top bar shows UP/BAT/SIG placeholder Readouts — 斷 DOM 含文本 `'03:24:18'`、`'78%'`、`'-58dBm'`
- MissionTablet > STREAM panel shows codec details — 斷 DOM 含 `'WebRTC'`、`'H.264'`、`'30.1'`、`'1280×720'`

**勿動其他測。Task A 之 V/ω 改與本 Task 之 placeholders 改皆於同文件——Haiku C 須先讀 Task A 之 commit diff（或重讀 MissionTablet.tsx 之最新狀態）以避衝突。**

## 工作流

| 序 | 動 |
|---|---|
| 1 | 控制器派 Task A + Task B 二 Haiku 並（disjoint 文件域：A 動 MissionTablet，B 動 MissionControl） |
| 2 | 二 Haiku 畢，控制器跑 docker 測，提交合一 commit `feat: design-parity fixes for tablet V/ω + track + LAT, phone-portrait overlays` |
| 3 | 控制器派 Task C 一 Haiku（單派——本 Task 與 A 同文件，須序執） |
| 4 | Haiku 畢，控制器跑 docker 測，提交 commit `feat: design-parity tablet placeholders for UP/BAT/SIG/STREAM/footer` |
| 5 | docker compose build webclient + up -d webclient + 求用戶煙測二回（tablet + phone portrait） |
| 6 | 更 AGENTS.md 交接表 + Head SHA |

## TDD 規

依 `memory/agent-guides/project-skills.md`「heavy integration, light unit」。各 Haiku：
- 先 stub 改至紅（assert 改前期值 → 紅）
- 再實 → 綠
- 無 silent-pass `if (x) { expect(...) }` guard（前 Wave 1 已蹈此覆轍）
- jsdom 限見前 `setup.ts` 之 polyfill 諸（matchMedia、PointerEvent、setPointerCapture、getBoundingClientRect、MediaStream、RTL cleanup 皆配，勿動）

## 不變式（Haiku 不得違）

- 不引新 npm 依賴
- 不動 `shared.tsx`、`SettingsDrawer.tsx`、`hooks/*`、`teleop_client.ts`、`whep_client.ts`、`setup.ts`、`AGENTS.md`、`vite.config.ts`、`tsconfig.json`、`Dockerfile.webclient`、`vitest.config.ts`
- E-STOP 鈕 z-index 永 10 不降
- E-STOP `bridge.eStop()` 不檢 connected 永真
- 既有 268/269 測（1 pre-existing whep_client ICE-timer flake 容忍）不破
- Haiku 不跑 docker、不 commit、不 `git add -A`，唯寫文件 + 報文件名與測名

## 驗收

- 三 Task 畢，docker 測零失敗（容 pre-existing flake）
- 瀏覽器於 phone-portrait 顯 telemetry stack + MiniMap + Compass（不藏）
- 瀏覽器於 tablet：
  - 中央底 V/ω readouts 隨 DRIVE/STRAFE joystick 動而更新
  - 右欄 HEADING track 隨 ly/lx 動而更新
  - 頂 bar 顯 LAT 自 `bridge.latencyMs`、UP/BAT/SIG 顯靜態值
  - 左欄 STREAM 顯四 codec DataRow + 動態 stream state 行
  - 左欄末顯 `cmd_vel @ 50hz` / `last pong 0.04s`

## 已知偏差（後留）

- UP / BAT / SIG / codec / fps / res 諸值皆靜態 placeholder——無對應 bridge 訊號。後續若 server 加遙測，再接入。
- REC indicator 仍藏（Wave 2 預宣 deviation 之延續）。
- `cmd_vel @ 50hz` / `last pong 0.04s` 為靜態值——後續若 bridge 暴露 pub 速率與 last pong 時，再動態化。
