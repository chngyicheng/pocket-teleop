# scan↔map 同步實作計畫（方案 A）— scan 配 capture pose，消相對 desync

> 日期 2026-06-14。旨：使 minimap 之 lidar scan 點疊於 map 牆而不拖尾。今 scan 純 robot-centered 繪、map 以最新 pose 置，二者參照不同步，動時 scan 似滯於 map。方案 A：為每 scan 附其 capture 時之 robot pose，client 以該 pose 將 scan 投至 map，俾二層出自同一瞬。

## 旨

操作者報 scan 與 map 間有輕微 desync。已查證（見下）：非 scan 處理較重所致——server 端 scan 僅 `decimate_scan` 至 120 點（極輕），map 反為重路（server crop+RLE、client `decodeRle`）。真因為**二層出自不同步之參照**：map 由 `mapPose`（5 Hz、`tf2 lookupTransform(TimePointZero)`、甚新）置；scan 全 robot-relative 繪、不用 pose，內含 lidar 擷取＋tf/SLAM pipeline 之延遲，時戳早於「今」。動時二者差一延遲間距，現為 scan 拖尾。

## 現狀（已查證，行號對現 code）

- `server/src/teleop_node.cpp` `on_scan`（251 行）：5 Hz 節流（`SCAN_INTERVAL` 200ms），於 scan frame≠base_frame 時查 `tf2 lookupTransform(base_frame, scan.frame, TimePointZero)` 僅取 yaw 校正 `angle_min`，組 `scan_msg`（282–288 行：`type`/`angle_min`/`angle_increment`/`range_max`/`ranges`）後 `broadcast`。**不附 pose**。
- `broadcast_pose`（197 行）：`pose_timer_` 5 Hz（`POSE_INTERVAL` 200ms），查 `map_frame←base_frame`（`TimePointZero`），失敗則 fallback `odom_frame←base_frame`，送 `pose` 訊（frame 標 `map` 或 `odom`），並更 `map_window_center_`。
- `web-client/src/map_render.ts`：`scanToScreenPoints(scan, size, metersAcross)`（89 行）純 robot-centered（front 上），**不受 pose**；`mapToScreenTransform(pose, meta, size, metersAcross)`（50 行）以 pose 置 map 影像。
- `web-client/src/components/shared.tsx` MiniMap render effect（406–444 行）：以 `mapToScreenTransform(mapPose, …)` 繪 map，再以 `scanToScreenPoints(scan, …)` 繪 scan；deps `[mapGrid, mapPose, scan, size, viewM, color]`——pose 與 scan 為二獨立 5 Hz WS 訊，各觸 render，故另有至多 ~200ms 之串流解耦瞬態 mismatch 疊於延遲之上。
- `web-client/src/protocol.ts`：`scan` 解析（110 行）取 `angle_min`/`angle_increment`/`range_max`/`ranges`，finite 守衛；`pose` 解析（69 行）。`web-client/src/hooks/useTeleopBridge.ts` `onScan`（134 行）→ `setScan`（無額外處理）。
- `memory/agent-guides/data-schema.md`（24–25、33–34 行）：pose／scan 訊 schema 與 ~5 Hz 註。

## 根因與方案 A 之理

二層皆 robot-centered、front 上。疊合之充要：置 map 之 pose ＝ scan capture 時之真 robot pose。今 map 用最新 `mapPose`、scan 不用 pose，故僅在「pose 恰等於 scan 擷取瞬之 pose」時對齊；動時不對齊。

**方案 A**：為 scan 附其 capture pose（同 frame 體系，map 或 odom）。client 繪 scan 時，每 ray 先以 capture pose 轉至 **world** 座標，再經**現行 map 之 screen transform（最新 `mapPose`）** 投至螢幕。如此 scan 點落於 map 牆之上（相對 desync 消），robot marker 仍居最新 pose（新鮮）。scan 之絕對延遲猶在，然不可見（疊牆即足）。capture pose==current pose 時，數學上還原今行為（無回歸）。

**為何非方案 A2（以 capture pose 同置 map+scan）**：A2 令二層共 capture pose 故亦對齊，然 robot marker 隨之滯後真實 robot 一延遲。teleop 首重障礙（scan）對齊 map 牆而 robot 位新鮮，故取 A1（本計畫即 A1）。

## 範圍

**入**：scan 訊附 capture pose（server）；protocol 解析；bridge 傳遞；`scanToScreenPoints` 改以 capture+current pose 行 world 疊置；MiniMap 接線含 frame-match fallback；文件更新。
**出**：絕對延遲補償（不追求；不可見即可）；以 scan stamp 反查歷史 map（map 已甚靜，不需）；提高 5→10 Hz（方案 B，另議）；odom/map frame 轉換瞬態之完美處理（退回即可）。

## 架構

### server（`teleop_node.cpp` `on_scan`）

- 於 `on_scan` 內，除既有 yaw 校正外，查 capture pose：先 `lookupTransform(map_frame, base_frame, scan.stamp)`；extrapolation／查敗則 fallback `odom_frame←base_frame`（與 `broadcast_pose` 同序）；皆敗則**略 pose 欄**。frame label 隨之（`map`／`odom`）。
- 用 **scan 之 `header.stamp`**（非 `TimePointZero`）以時對齊；buffer 不足而拋則退 fallback／略。
- `scan_msg` 增 optional 欄：`pose_x`、`pose_y`、`pose_heading`、`pose_frame`（缺檔→不寫，向後相容）。
- 注意：capture pose frame 須與該瞬 `broadcast_pose` 所用 frame 體系一致，俾 client frame-match 可行。

### protocol（`web-client/src/protocol.ts`）

- `scan` 解析增 optional `pose`：四欄齊且 finite 且 `pose_frame∈{map,odom}` 方納為 `ScanData.pose = { frame, x, y, heading }`；任一缺／非法則 `pose` 為 undefined（不致整訊棄）。
- `ScanData` type 增 optional `pose`。

### bridge（`useTeleopBridge.ts`）

- `onScan` 將 `pose` 一併入 `setScan`。

### render（`map_render.ts` + `shared.tsx`）

- `scanToScreenPoints` 新簽名：受 `capturePose` 與 `currentPose`（即 `mapPose`）。每 ray：polar→base_link cartesian（`bx` 前、`by` 左）→ world（以 `capturePose` 旋移）→ screen（以 `currentPose` robot-centered front 上、`s=size/metersAcross`）。`capturePose===currentPose` 時化簡回今式（單測 vector 鎖此等價）。
- 抽 `worldToScreenPoint(world, currentPose, size, metersAcross)` 純helper（forward/left 分量 → screen），供 scan 用，亦利測。
- MiniMap render effect：繪 scan 以 `scanToScreenPoints(scan, scan.pose ?? mapPose, mapPose, …)`——即 capture pose 缺則以 `mapPose` 充（還原今行為）。**frame-match 守衛**：`scan.pose` 在且 `scan.pose.frame !== mapPose.frame` 時，棄 capture pose、以 `mapPose` 充（退回 robot-centered），免跨 frame 體系誤投。

### 相容與邊角

- 舊 server（無 pose 欄）＋新 client：`scan.pose` undefined → 退回今行為。
- 新 server＋舊 client：多餘欄被忽略。
- map↔odom frame 轉換瞬態：frame 不符→退回，無誤投。
- NO MAP／odom-only 無 map 可疊：scan 仍 robot-centered，如常。
- tf at stamp 抽取失敗：server 略 pose → client 退回。

## 任務（chain branch，trophy TDD，Haiku）

1. **server scan 附 capture pose**：`on_scan` 查 capture pose（stamp、map→odom fallback、查敗略）、frame label、`scan_msg` 增四 optional 欄。trophy：將「pose→scan_msg 欄」之組裝抽為純函式（receives optional pose struct）以利 gtest 斷有 pose／無 pose 之 JSON shape 與 frame label；tf 路徑因需 buffer 難純測，於計畫註明僅測組裝 seam，tf 行為俟實機。docs：`data-schema.md` scan 欄、`server/AGENTS.md`。
2. **protocol 解析 + bridge 傳遞**：`protocol.ts` 解析 optional `pose`（四欄＋frame 守衛，部分／非法則 undefined）；`ScanData.pose`；`useTeleopBridge.onScan` 傳遞。trophy：vitest——有 pose 完整解析；缺欄→pose undefined 而 scan 仍解；非法 frame→undefined。docs：`data-schema.md`。
3. **render world 疊置 + MiniMap 接線**：`map_render` 抽 `worldToScreenPoint`、`scanToScreenPoints` 新簽名（capture+current）；MiniMap 以 `scan.pose ?? mapPose` 充 capture 並加 frame-match 守衛。trophy：vitest——(a) capturePose≠currentPose 之 world 疊置 vector（scan 點落於預期 world→screen 位）；(b) capturePose===currentPose 還原既有 vector（回歸鎖）；(c) MiniMap 於 frame 不符 或 pose 缺時退回 robot-centered。docs：`web-client/AGENTS.md`、`map_render.ts` 註解。
4. **doc 收束**：AGENTS handover、milestones、deviations（capture-pose 疊置之取捨、hardware-verify、tf-at-stamp fallback、frame-match 退回）統一更新。

> 各任務 code 與 doc 同 commit（DOX 規）；task 4 僅收束跨檔 handover。

## 安全

- 純顯示路徑，無新 input、無 endpoint、無權限面。scan pose 為唯讀 telemetry。
- 無 user 控之路徑或值；frame 守衛防誤投，非安全患。

## 驗證

- C++：`docker compose -p pocket-teleop run --rm --no-deps --build teleop-server-test`（或現行 gtest 役名）——新增組裝 seam 測。
- web-client：`docker compose -p pocket-teleop run --rm --no-deps --build webclient-test npm test`——map_render vector＋protocol＋MiniMap 新測。
- baseline 沿 AGENTS.md「Test baseline」（webclient 602 / auth 96 / vb 20 / cpp 72）。
- **hardware-verify（俟實機，列 deviation）**：robot 原地旋轉與直行，確 scan 點疊於 map 牆而無拖尾；frame 由 map↔odom 轉換時無誤投／無跳。

## 風險與待決

- **tf at stamp**：擷取瞬之 transform 或未入 buffer（extrapolation）→ 本計畫退 fallback／略 pose，client 退回今行為；不致崩，唯該幀無補償。
- **frame 體系轉換瞬態**：map↔odom fallback 切換時，scan.pose.frame 與 mapPose.frame 可能短暫不符→退回 robot-centered（可接受）。
- **效果界限**：A 消**相對** desync（scan 疊 map 牆）；**絕對** scan 延遲仍在但不可見。若操作者要 robot marker 亦無延遲，須別解（不在此）。
- **C++ tf 測難**：tf 依賴路徑難純測，僅測組裝 seam；tf 正確性俟實機。
- **方案 B（5→10 Hz）**：可作正交之 quick mitigation，與 A 不衝突；本計畫不含。

## 執行附則（2026-06-11 規）

- chain branch，末次一併 merge——**惟 merge 入 main 須俟操作者實機測／批准**（commit 不受此限）。
- trophy TDD（先 red 行為失敗，非 missing module）。
- Haiku subagent，prompt 以 wenyan-ultra；subagent 不執 git，controller 按顯式路徑 stage + commit；派後驗主 repo 與 worktree 二處 `git status`。
- 測試僅經 Docker，編輯後必 `--build`。
- 採用前 re-verify 本計畫所引檔路徑（行號）對現 code，防 staleness。
