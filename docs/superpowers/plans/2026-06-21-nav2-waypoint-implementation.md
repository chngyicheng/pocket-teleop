# nav2 waypoint 發送實作計畫 — 展開 minimap 點圖置點，送 nav2 goal、pause/resume、繪 global path

> 日期 2026-06-21。旨：操作者於展開之 minimap 內入「Send Waypoint mode」，點圖（或長按召放大鏡）置 waypoint，旋小撥盤定朝向，按 Send 送 robot 之 nav2 stack；可 Pause／Resume 進行中之導航；E-STOP 取消之；nav2 之 global path 疊繪於 minimap。action 名前端可改、env 有預設。
>
> **設計（已查證 2026-06-21）**：goal 以 server 之 **`rclcpp_action` NavigateToPose action client**（預設 action `/navigate_to_pose`）送。**非** publish `/goal_pose` topic——查證 nav2 核心不可靠訂該 topic（RViz「Nav2 Goal」實呼 `/navigate_to_pose` action，非發 topic）。action client 為唯一可行 baseline，且原生支援 cancel。
>
> **pause/resume（在本 scope）**：nav2 核心無逐任務 pause/resume（open FR ros-navigation/navigation2#5213）。以慣用 workaround 達成——Pause＝`async_cancel_goal` 但**留存**該 goal；Resume＝重送留存之 goal（nav2 自當前位重規劃即「resume」）。server 持一狀態機（idle／active／paused）並廣播之，俾 UI 切按。
>
> **frame（ENV 級，不入 UI）**：goal 之 `header.frame_id` 由 env `NAV_GOAL_FRAME`（預設 `map`）定，server 蓋之；client **不送 frame**（goal 訊僅 x／y／heading）。同 `MAP_FRAME` 等之 `.env` 級制，不入 robot_config UI allowlist。
>
> **global path**：server 訂 nav2 global plan topic（env `NAV_PATH_TOPIC`，預設 `/plan`，`nav_msgs/Path`），decimate 後廣播 `nav_path` 訊；client 以 `worldToScreenPoint` 疊繪於 minimap（黏 map）。

## 現狀（已查證，行號對現 code）

- **server 入命令**：`server/src/command_handler.cpp` `parse`（5 行）→ `ParseResult` variant；現支 `ping`／`estop`／`estop_reset`／`twist`（`server/include/command_handler.hpp` 21 行）。`server/src/teleop_server.cpp` `on_message`（130 行）以 `std::holds_alternative` 分派；estop 分支（148 行）為掛 nav-cancel 之點。
- **server 出 ROS**：`server/src/teleop_node.cpp` 建 `publisher_`（Twist，45 行）、訂 odom／scan／map／battery、tf2 廣播 pose（246 行）；`declare_parameter` 宣告諸 topic／frame（8–131 行）；node 已 spin（`main.cpp`），可加 action client 與 path 訂閱。廣播樣式見 battery timer（113 行）以 `nlohmann::json` + `server_->broadcast`。
- **decimate 樣式**：`server/src/map_codec.cpp` 有 `decimate_scan`（`on_scan` 322 行用之，降至 120 點），path decimate 可循此純函式樣式。
- **config 鏈**：`config/robot.env.example`（UI 可改鍵）；`auth-server/src/robot_config.ts` `ALLOWLIST_KEYS`（4 行，今七鍵）＋ `readRobotConfig`（46 行）＋ `validateRobotConfig`（76 行，VIDEO_TOPIC 之 ROS-name 驗證 173 行）；`server/launch/teleop.launch.py` env→param（28–38 行）；`docker-compose.yml` teleop-server `environment`（`.env` 級非-UI 參如 MAP_TOPIC／MAP_FRAME 在此，20–36 行）＋`env_file: config/robot.env`（37 行，UI 鍵）。
- **client 送／收**：`web-client/src/protocol.ts` `buildTwist`／`buildEstop`（15 行）造 JSON；`parseMessage`（31 行）分派入向訊。`web-client/src/teleop_client.ts` `sendTwist`（313 行）於 `estopEngaged` no-op（315 行）；入向訊處理（422 行 estop_state 等）。`useTeleopBridge` 暴 client 法／state 於 view。
- **client 算圖**：`web-client/src/map_render.ts` `worldToScreenPoint`（90 行）world→screen；**無逆函式**。
- **client minimap**：`web-client/src/components/shared.tsx` `MiniMapView`（366 行）擁 canvas、pinch／wheel zoom、tap 偵測（`onTap` 543 行）；公開 `MiniMap`（747 行）`expandable` 展全屏 overlay（760 行），backdrop 收合（775 行）。`MiniMapView` 純表現（無資料層）；`viewM`（392 行）內部 zoom。SVG overlay 樣式見 trail polyline（671 行）。
- **auth proxy**：`/ws` 透明 reverse proxy，雙向原樣轉送——**無須改 auth-server**。
- **依賴**：`nav2_msgs`（`action/NavigateToPose`、`msg/Path` 用 `nav_msgs`）＋`rclcpp_action` 須入 server `package.xml`／`CMakeLists.txt`。

## 範圍

**入**：
- server：`nav_goal`／`nav_pause`／`nav_resume`／`nav_cancel` 命令；NavigateToPose action client；goal 狀態機（idle/active/paused＋留存 goal）；`nav_state` 廣播；E-STOP→cancel；`goal_frame` 蓋 frame_id；訂 global path topic＋decimate＋`nav_path` 廣播。
- config：`NAV_ACTION`（UI 可改）；`NAV_PATH_TOPIC`、`NAV_GOAL_FRAME`（`.env` 級，非 UI）。
- client transport：`map_render.screenToWorldPoint`；`protocol` build（goal/pause/resume/cancel）＋parse（nav_state/nav_path）；`teleop_client` 諸 send（estop 守衛）；`useTeleopBridge` 暴 `navState`／`navPath`／諸法。
- client UI：waypoint 置點（loupe＋marker＋dial）；依 `navState` 切 Set/Send/Cancel／Pause/Resume/Stop 鈕；global path 疊繪；接線 views。
- docs：data-schema、server/auth-server/web-client AGENTS、milestones、deviations。

**出**（不追求，明列）：
- action feedback／進度（distance_remaining／ETA）——不顯；可選後續。
- multi-waypoint 佇列（`NavigateThroughPoses`）。
- frame_id 之 UI 設定——env 級（用戶決）。
- live runtime param apply——改 NAV_ACTION 須次 `up -d`（沿 VIDEO_TOPIC）。

## 架構

### server — 命令、action client、goal 狀態機、cancel/pause/resume

- **`command_handler.hpp`**：增 `struct NavGoalCommand { double x, y, heading; }`、`struct NavPauseCommand {}`、`struct NavResumeCommand {}`、`struct NavCancelCommand {}`，納入 `ParseResult` variant。（goal 不含 frame——server 蓋。）
- **`command_handler.cpp` `parse`**：
  - `type=="nav_goal"`：必含 `x`／`y`／`heading`（皆 `std::isfinite`，否則 ParseError）→ `NavGoalCommand`。
  - `type=="nav_pause"`／`"nav_resume"`／`"nav_cancel"`：→ 對應空 command。
- **`teleop_server.cpp` `on_message`**：
  - `NavGoalCommand`：`reset_watchdog()`；**`estopped_` 真則不送**；否則呼 `nav_goal_callback_(x, y, heading)`。
  - `NavPauseCommand` → `nav_pause_callback_()`；`NavResumeCommand` → **`estopped_` 真則不送**否則 `nav_resume_callback_()`（resume 啟動，受 estop 守衛）；`NavCancelCommand` → `nav_cancel_callback_()`。
  - **estop 分支（148 行）增呼 `nav_cancel_callback_()`**——E-STOP 取消並清留存 goal（連同 twist 歸零）。
  - `TeleopServer` 建構式增此四 callback 參（循 `publish_callback_` 注入式）。
- **`teleop_node.cpp`** 之 goal 狀態機（皆 mutex 護）：
  - 成員：`active_goal_handle_`（`shared_ptr`，nullptr 即無）、`stored_goal_`（`std::optional<PoseStamped>`，留存供 resume）、`paused_`（bool）。
  - `declare_parameter("nav_action", "/navigate_to_pose")`＋`declare_parameter("goal_frame", "map")`；建 `rclcpp_action::Client<NavigateToPose>`。
  - 純 `build_goal_pose(x, y, heading, frame, stamp)` → `PoseStamped`（`position={x,y,0}`，yaw→quat `z=sin(h/2)`、`w=cos(h/2)`，`frame_id=frame`，`stamp=now`）。**gtest seam**。
  - `nav_goal_callback_`：`stored_goal_ = build_goal_pose(x,y,heading, goal_frame, now)`；`paused_=false`；`send_stored_goal_()`（內 `async_send_goal`，response cb 存 handle，result cb 清 handle＋據結果轉 state）。廣播 `nav_state: active`。
  - `nav_pause_callback_`：若 active handle 在→`async_cancel_goal`、`paused_=true`（**留** `stored_goal_`）、清 handle。廣播 `nav_state: paused`。
  - `nav_resume_callback_`：若 `paused_ && stored_goal_`→`paused_=false`、`send_stored_goal_()`。廣播 `nav_state: active`。
  - `nav_cancel_callback_`：active 在→`async_cancel_goal`；清 `stored_goal_`＋`paused_=false`＋清 handle。廣播 `nav_state: idle`。（E-STOP 經此——故 E-STOP 後 Resume 不會誤再驅。）
  - result cb：succeeded／aborted → 清 handle、清 `stored_goal_`、`paused_=false`、廣播 `nav_state: idle`。canceled 之 state 由觸發者（pause/cancel）已廣播，result cb 不覆。
  - `nav_state` 廣播：`{type:"nav_state", state:"idle"|"active"|"paused"}`（state 變即送；亦於 client 連線後補送，俾 UI 同步）。
  - action server 未上線：`wait_for_action_server` 短逾時→log warn＋棄，不阻 teleop。
- **global path**：
  - `declare_parameter("nav_path_topic", "/plan")`；訂 `nav_msgs::msg::Path`（QoS 10）。
  - 節流（如 ODOM_INTERVAL 樣）；取 `poses[].pose.position` 之 (x,y)，**decimate**（純 `decimate_path(points, max=64)` 於 `map_codec`，循 `decimate_scan` 樣，gtest seam）。
  - 廣播 `{type:"nav_path", points:[[x,y],...]}`（path 之 frame 假定同 minimap map frame；空 path → 送空 points 以清線）。
- **`package.xml`／`CMakeLists.txt`**：依賴 `nav2_msgs`、`nav_msgs`、`rclcpp_action`。

### config

- **`config/robot.env.example`**（UI 級）：增 `NAV_ACTION=`（註：NavigateToPose action 名，預設 `/navigate_to_pose`）。
- **`auth-server/src/robot_config.ts`**：`ALLOWLIST_KEYS` 增 `NAV_ACTION`（八鍵）；defaults 增 `NAV_ACTION: ''`；`validateRobotConfig` 增分支（重用 VIDEO_TOPIC 之 ROS-name 規則）。
- **`.env.example`／`docker-compose.yml`**（`.env` 級，非 UI）：增 `NAV_PATH_TOPIC=${NAV_PATH_TOPIC:-}`、`NAV_GOAL_FRAME=${NAV_GOAL_FRAME:-}` 於 teleop-server `environment`（循 MAP_TOPIC／MAP_FRAME 之式）；`NAV_ACTION=${NAV_ACTION:-}` 亦於 environment（env_file 之 robot.env 覆其上，循現有 VIDEO 等之雙重制）。
- **`server/launch/teleop.launch.py`**：增 `'nav_action': EnvironmentVariable('NAV_ACTION', default_value='/navigate_to_pose')`、`'goal_frame': EnvironmentVariable('NAV_GOAL_FRAME', default_value='map')`、`'nav_path_topic': EnvironmentVariable('NAV_PATH_TOPIC', default_value='/plan')`。
- **SettingsDrawer**：`web-client/src/components/SettingsDrawer.tsx` Robot section 增 **NAV_ACTION** 輸入欄（照搬現有 robot 鍵 UI；partial PUT）。NAV_PATH_TOPIC／NAV_GOAL_FRAME **不入 UI**。

### client transport

- **`map_render.ts` `screenToWorldPoint`**：`worldToScreenPoint`（90 行）之逆。`s=size/metersAcross`；`forward=(cy-y)/s`、`left=(cx-x)/s`；`world.x=pose.x + forward·cosθ - left·sinθ`、`world.y=pose.y + forward·sinθ + left·cosθ`。精確逆（往返單測鎖）。
- **`protocol.ts`**：build——`buildNavGoal(x,y,heading)`、`buildNavPause()`、`buildNavResume()`、`buildNavCancel()`。parse（`parseMessage`）——`nav_state`（`state∈{idle,active,paused}`，否則 unknown）、`nav_path`（`points` 為 `[number,number][]`，finite 守衛，非法則 unknown）。`InboundMessage` union 增二型。
- **`teleop_client.ts`**：`sendNavGoal(wx,wy,heading)`（`estopEngaged` no-op＋warn，否則 send；座標為絕對 world，不乘 maxLinear）；`sendNavResume()`（同受 estop 守衛）；`sendNavPause()`／`sendNavCancel()`（恆送——止動作不受 estop 阻）。入向 `nav_state`／`nav_path` 存於 state、設 callback。
- **`useTeleopBridge`**：暴 `sendNavGoal`／`sendNavPause`／`sendNavResume`／`sendNavCancel` 及 `navState`／`navPath`。

### client UI — 展開 minimap

職責分割（保 `MiniMapView` 純表現）：

- **`MiniMap` wrapper（747 行）擁狀態與鈕**，新 props：`enableWaypoints?`、`navState?: 'idle'|'active'|'paused'`、`onSendWaypoint?`、`onNavPause?`、`onNavResume?`、`onNavCancel?`、`navPath?`。wrapper state：`waypointMode`、`waypoint{wx,wy,heading}|null`。overlay 控制列依態切：
  - **navState idle 且非 waypointMode**：「Set Waypoint」（僅 `enableWaypoints && mapGrid && mapPose && mapPose.frame==='map'` 可按；否則禁＋「需 map」提示）→ 入 waypointMode、清 waypoint。
  - **waypointMode**：「Send Waypoint」（`waypoint==null` 灰）→ `onSendWaypoint(wx,wy,heading)`、退 waypointMode；「Cancel」→ 退 waypointMode＋清。
  - **navState active**：「Pause」→`onNavPause()`；「Stop」→`onNavCancel()`。
  - **navState paused**：「Resume」→`onNavResume()`；「Stop」→`onNavCancel()`。
  - 收合：waypointMode 時傳 `onTap=undefined`（點圖置點非收合）；backdrop（775 行）**恆**收合，退時清 waypointMode＋waypoint。
- **`MiniMapView`（366 行）擁置點互動與繪製**，新 optional props：`waypointMode`、`waypoint`、`navPath`、`onWaypointPlace`、`onWaypointHeading`。
  - **置點手勢**：waypointMode 時 pointer down→move 顯 **loupe**（小 canvas，`drawImage(mainCanvas, fx-r,fy-r,2r,2r, 0,0,loupeSize,loupeSize)` 裁放已繪區＋中十字，浮指上方）；pointer up→`screenToWorldPoint(releasePt, mapPose, size, viewM)`→`onWaypointPlace`。waypointMode 時取代 tap／pinch（wheel zoom 留）。
  - **marker＋dial**：`waypoint` 在時每 render 以 `worldToScreenPoint` 算螢幕位（黏 map），繪 SVG 點＋朝向箭（角=`heading - mapPose.heading`）；旁置小圓 **dial**，其上 pointer drag 以 `atan2` 算螢幕角→`worldHeading=screenAngle + mapPose.heading`→`onWaypointHeading`。一 handler 足；令操作者滑指精確指向。
  - **global path 繪製**：`navPath` 在且 map mode 時，各點 `worldToScreenPoint(pt, mapPose, size, viewM)`，連為 SVG polyline（循 trail 671 行樣，異色標 nav path）。黏 map、隨 zoom。
- **接線**：`MissionControl.tsx`／`MissionTablet.tsx` 之 `MiniMap` 傳 `enableWaypoints`、`navState={bridge.navState}`、`navPath={bridge.navPath}`、`onSendWaypoint`/`onNavPause`/`onNavResume`/`onNavCancel` → bridge 諸法。

### 相容與邊角

- 舊 server＋新 client：無 `nav_state` 則 UI 維 idle（Set 仍可，但 send 無效——記 docs）；新 server＋舊 client：多餘訊忽略。
- estop 中：client `sendNavGoal`/`sendNavResume` no-op；E-STOP 觸 server cancel＋清留存（Resume 後不誤驅）。
- 無 nav2：send 之 `wait_for_action_server` 逾時棄，不阻 teleop；`nav_state` 維 idle。
- 無 map／odom frame：Set 鈕禁用。
- 空 path：廣播空 points 清線。
- 退 overlay 於 waypointMode：清模式＋waypoint（不影響已送之 nav——nav 由 navState 控）。

## 任務（chain branch，trophy TDD，Haiku）

1. **server nav 控制命令＋action client＋狀態機**：`nav2_msgs`／`rclcpp_action` 依賴；`command_handler` 四命令＋parse（finite 守衛）＋variant；`teleop_server` 分派＋estop→cancel＋四注入 callback；`teleop_node` `nav_action`／`goal_frame` 參、action client、狀態機（active/paused/stored）、`build_goal_pose` 純 seam、`nav_state` 廣播。trophy：gtest——(a) parse 四命令（有效＋缺欄/非 finite→error）；(b) `build_goal_pose` quat＋frame_id＋position。action send/cancel／狀態機之 ROS 路徑俟實機。docs：data-schema（nav_goal/pause/resume/cancel/nav_state、nav_action/goal_frame param、E-STOP→cancel）、server/AGENTS.md。
2. **server global path 廣播**：`nav_path_topic` 參、訂 `nav_msgs/Path`、純 `decimate_path`（map_codec）、節流、`nav_path` 廣播。trophy：gtest——`decimate_path` 降點數＋保端點＋空輸入。docs：data-schema（nav_path、nav_path_topic）、server/AGENTS.md。
3. **config 全鏈**：robot.env.example（NAV_ACTION）、.env.example＋compose（NAV_PATH_TOPIC/NAV_GOAL_FRAME/NAV_ACTION）、robot_config.ts（NAV_ACTION allowlist＋驗證）＋test、launch（三參）。trophy：vitest——NAV_ACTION 有效納/壞拒/預設/八鍵序。docs：data-schema env／param 表、auth-server/AGENTS.md。
4. **client transport**：`screenToWorldPoint`；protocol build（4）＋parse（nav_state/nav_path）；`teleop_client` 四 send（estop 守衛分野）＋入向 state；`useTeleopBridge` 暴 navState/navPath/法。trophy：vitest——(a) screen↔world 往返；(b) build JSON shape；(c) parse nav_state/nav_path（含非法→unknown）；(d) sendNavGoal/Resume estop no-op、Pause/Cancel 恆送。docs：data-schema、web-client/AGENTS.md。
5. **client UI**：`MiniMapView` 置點手勢＋loupe＋marker＋dial＋path polyline＋props；`MiniMap` wrapper navState 驅之鈕（Set/Send/Cancel／Pause/Resume/Stop）＋啟用 gate＋onTap 抑制；views 接線。trophy：vitest（jsdom，canvas try/catch 沿既有）——(a) 入模式點圖不收合；(b) 置點後 marker 現、Send 轉可按；(c) navState active→Pause/Stop、paused→Resume/Stop 之鈕切；(d) 無 map frame Set 禁用；(e) backdrop 恆收合；(f) navPath 在時 polyline 點數對。docs：web-client/AGENTS.md。
6. **doc 收束**：AGENTS handover、milestones、deviations（action-client baseline、E-STOP→cancel、pause/resume 之 cancel+resend workaround 與 FR#5213、frame 之 env 級決策、path 繪製、loupe/dial、八鍵遷移）、test baseline 更新。

> 各任務 code 與 doc 同 commit（DOX 規）；task 6 僅收束。

## 安全

- **nav_goal 觸發自主移動**——比 teleop 大之安全面：robot 收 goal 自驅 `/cmd_vel` 趨點。docs／UI 明示（按 Send 即令自主行）。
- **E-STOP 取消 nav（已解）**：E-STOP→server cancel＋**清留存 goal**（故 Resume 後不誤再驅）＋twist 歸零。
- **cancel 非硬急停**：`async_cancel_goal` 經 nav2 controller 減速停，非瞬停；E-STOP 之 twist 歸零僅停 teleop 自身 twist，不直控 nav2 之 `/cmd_vel`。即 E-STOP 後 robot 或滑行至 nav2 停妥。**docs 顯著註**：真急停須硬體 E-STOP。
- **送向守衛**：client＋server 於 estop 中皆不送 nav_goal／nav_resume（不啟新動作）；nav_pause／nav_cancel 恆許（止動作）。
- **frame**：`goal_frame`（env，預設 map）須與 minimap pose／nav2 global frame 一致；UI 僅於 map frame 啟用 Set。docs 註 env 須對齊。
- **輸入驗證**：finite 守衛防 NaN／Inf 入 goal／path；NAV_ACTION 經 ROS-name 驗證。
- 無新 endpoint／權限面（沿 `/ws` 透明 proxy 與 `/auth/robot-config` PUT）。

## 驗證

- C++：`docker compose -p pocket-teleop run --rm --no-deps --build teleop-server-test`——parse＋build_goal_pose＋decimate_path seam 測。
- web-client：`docker compose -p pocket-teleop run --rm --no-deps --build webclient-test npm test`——screenToWorldPoint＋protocol＋transport＋MiniMap UI 測。
- auth：`docker compose -p pocket-teleop run --rm --no-deps --build <auth-test 役> npm test`——robot_config NAV_ACTION 測。
- baseline 沿 AGENTS.md「Test baseline」（webclient 790 / auth 96 / video-bridge 20 / C++ 88），新增測後更新計數於收束 commit。
- **hardware-verify（俟實機＋nav2，列 deviation）**：(a) Send 後 robot 趨正確 world 位＋朝向；(b) **Pause 令 robot 止、Resume 令其續趨同點**；(c) **E-STOP 取消 nav、robot 止、Resume 後不誤驅**；(d) global path 疊於 minimap 牆且隨 robot/zoom 黏合；(e) NAV_ACTION 改後（Settings→次 up -d）生效；(f) odom frame 下 Set 禁用；(g) 無 nav2 時 send 不阻 teleop；(h) goal frame_id 與 nav2 global frame 一致；(i) loupe／dial 真觸控手感。

## 風險與待決

- **goal/path frame 與 nav2 TF**：`goal_frame`（env）與 path 假定皆 map frame；若 nav2 用異名／namespaced frame，須令 env 對齊。實機驗（待決）。
- **cancel 非瞬停**：見安全節；nav2 減速停，真急停倚硬體。
- **path topic 名因 nav2 設定異**：預設 `/plan`（planner_server 全域路）；某些 stack 用 `/received_global_plan` 等——env 可改（待操作者按其 nav2 設）。
- **resume 之語義**：resume 重送同 goal，nav2 自當前位重規劃（非續舊軌）；對障礙已變之場景反更穩，但非「精確續行」。docs 註。
- **狀態機競態**：action 之 response／result cb 與 WS 命令並發——皆 mutex 護 active_handle/stored/paused；result cb 不覆由命令剛設之 state（canceled 例）。實機驗無錯切。
- **loupe 於 jsdom**：`drawImage` null ctx；UI 測沿 try/catch，視覺俟實機。
- **dial 精度**：先簡 atan2，必要時加吸附/微調。
- **八鍵遷移**：既有 `config/robot.env` 無 `NAV_ACTION` 行→預設空→server 用 launch 預設 `/navigate_to_pose`（向後相容；TROUBLESHOOTING 註）。NAV_PATH_TOPIC／NAV_GOAL_FRAME 為 `.env` 級，舊 `.env` 缺則用 launch 預設。

## 執行附則（沿 2026-06-11 規）

- chain branch，末次一併 merge——merge 入 main 須俟操作者實機測／批准（commit 不限）。
- trophy TDD（先 red 行為失敗，非 missing module）。
- Haiku subagent，prompt wenyan-ultra；subagent 不執 git，controller 按顯式路徑 stage＋commit；派後驗主 repo 與 worktree 二處 `git status`。
- 測試僅經 Docker，編輯後必 `--build`。
- 採用前 re-verify 本計畫所引檔路徑（行號）對現 code，防 staleness。
