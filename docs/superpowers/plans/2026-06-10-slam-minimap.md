# SLAM 真圖 minimap — 實施之規 (2026-06-10)

> minimap 今偽也——空 grid 加 odom trail 而已。此規使之承 SLAM 所建之 map、robot 真位（map frame）、lidar 掃描，如 RViz 以 base_link 為定 frame 之觀：robot 恆居中向上，map 繞之轉。
> 本規以 wenyan 述之；identifiers、檔名、API 名留 English。讀者零背景亦可承。

---

## 一、緣起 — 操作者所求

| 號 | 求 | 操作者語 |
|---|---|---|
| 求一 | 真圖 | minimap 顯 SLAM 所建所更之 map，非空 grid |
| 求二 | 真位 | robot 於 map 中移動，定位準確（localisation 之例同） |
| 求三 | base_link 定 frame | 如 RViz：robot 居中，map 旋轉——非 map 定而 robot 游 |
| 求四 | lidar 覆層 | scan 若在，頂視顯障礙實距 |
| 求五 | 風格不破 | 須合 Mission palette 之設計語言 |

## 二、現狀勘定 (已驗於 code)

- **MiniMap 偽**（`web-client/src/components/shared.tsx`）：CSS repeating-linear-gradient 為 grid、odom trail polyline、中央箭。無 map、無 scan。README 已注 WIP。
- **odom 管道既通**：`teleop_node.cpp` 訂 `/odom`（param `odom_topic`）、節流 `ODOM_INTERVAL`、quaternion→yaw、JSON `{type:"odom",x,y,heading}` broadcast → `protocol.ts` parse（`Number.isFinite` 守）→ `useTeleopBridge.odom` → MiniMap props。**此即新訊息可循之路。**
- **所缺三物**：
  - `/map`（`nav_msgs/OccupancyGrid`）未訂。SLAM（slam_toolbox 之屬）以 **transient_local** QoS latch 之——訂者須同 QoS 方得既發之圖。
  - **map frame 真 pose 無從得**。odom 在 odom frame，漂移且不合 map 原點。SLAM 出 `map→odom` TF 修正；真 pose＝tf2 lookup `map→base_link`。今 server 無 tf2。
  - `/scan`（`sensor_msgs/LaserScan`）未訂。QoS 多為 sensor_data（best_effort）。
- **WS 乃 websocketpp 純 JSON text**：`connection.ts` 之 onmessage 唯 string。不引 binary frame——RLE 文字編碼足矣（見〈四〉頻寬預算）。
- **jsdom 無 canvas**：`getContext('2d')` 還 null。故渲染算術須抽純函數測之，component 守 null ctx。

## 三、設計總綱

### 數據流

ROS2 topics（`/map`、`/scan`、tf）→ **teleop_node（C++，延之，不增容器）** → 既有 WS 管道三新訊息 → `protocol.ts` parse → `useTeleopBridge` 曝 → `MiniMap`（canvas 化）渲染。

不另立 Python bridge、不增 proxy route——video-bridge 之繁，此處無所需；teleop_node 既知 ROS2 既握 WS，延之最簡。

### 新訊息 (server → client)

| type | 載荷 | 頻率 | 旨 |
|---|---|---|---|
| `map` | `resolution`、`width`、`height`、`origin_x`、`origin_y`、`cells`（trinary RLE string） | ≤0.5 Hz，且唯變時 | crop 窗之佔據圖 |
| `pose` | `frame`（"map"｜"odom"）、`x`、`y`、`heading` | 5 Hz | base_link 於 map（或退 odom）frame 之真位 |
| `scan` | `angle_min`、`angle_increment`、`range_max`、`ranges[]`（≤120 點，2 位小數，0＝無效） | 5 Hz | base frame 之 lidar 掃描 |

- 既有 `odom` 訊息**不動**——compass、trail、舊測皆賴之。`pose` 為增量。
- **trinary RLE**：cell 三分——unknown（−1）、free（0..49）、occupied（≥50，ROS 慣例）。編為 token 串：字母（`u`/`f`/`o`）續 run 長，如 `u120f300o5u80…`。JSON-safe、可逆、易測。室內圖 run 長，壓縮極佳。
- **crop 窗**：不送全圖。server 以 robot pose 為中，裁方窗（param `map_window_m`，default 24 m）。重送之機：新 map 至，或 robot 距前窗中心移逾 2 m。訊息之 `origin_x/y` 即窗左下於 map frame 之座標——client 無須知全圖。圖大圖小，訊息恆有界。
- **scan**：server 以 tf2 轉至 base frame（lookup `base_frame ← scan frame_id`；不得則恆等退之）。decimate 至 ≤120 點（step＝ceil(n/120)），`angle_increment` 隨乘 step。無效（inf/nan/超界）→ 0。
- `frame` 降級鏈：tf2 得 `map→base_link` → frame="map"；唯得 `odom→base_link` → frame="odom"；皆不得 → 不發 pose（client 退用既有 odom 訊息）。

### Server 端 (C++ teleop_node)

- 新 params：`map_topic`（default `/map`）、`scan_topic`（default `/scan`）、`map_frame`（`map`）、`odom_frame`（`odom`）、`base_frame`（`base_link`）、`map_window_m`（24.0）。topic params 皆**絕對路徑、原值用之**——不施 namespace 魔法，循既有 `odom_topic` 之例（deployer 自書全徑）。
- `/map` 訂閱 QoS：`transient_local` + reliable，depth 1——latch 圖方可得。
- `/scan` 訂閱 QoS：sensor_data（best_effort）。
- tf2：`tf2_ros::Buffer` + `TransformListener`；wall timer 5 Hz lookup `map→base_link`，零時刻（latest）、容 extrapolation 失敗（戒 spam log，throttle warn）。
- 依賴增：`tf2`、`tf2_ros`、`tf2_geometry_msgs` 入 `package.xml`、`CMakeLists.txt`。ros:humble base image 自有，Dockerfile 不動。
- RLE encode、crop、decimate 皆**純函數**置 `command_handler.cpp` 旁新檔（如 `map_codec.cpp`/`.hpp`），無 ROS2 依賴，gtest 直測。

### 部署者易配 — env var 直通 (deployer 不觸 code)

凡新 param 必有 env var 直通，循既有 `ROBOT_NAME` 之路：`.env` → `docker-compose.yml` environment → Dockerfile CMD `${VAR:+-p param:=${VAR}}` → ROS param。launch file 亦同步增 `EnvironmentVariable` 條。

| env var | ROS param | default | 注 |
|---|---|---|---|
| `ODOM_TOPIC` | `odom_topic` | `/odom` | **param 既存而 env 直通缺**——補之 |
| `MAP_TOPIC` | `map_topic` | `/map` | 務一 |
| `MAP_WINDOW_M` | `map_window_m` | `24.0` | 務一 |
| `SCAN_TOPIC` | `scan_topic` | `/scan` | 務二 |
| `MAP_FRAME` | `map_frame` | `map` | 務二 |
| `ODOM_FRAME` | `odom_frame` | `odom` | 務二 |
| `BASE_FRAME` | `base_frame` | `base_link` | 務二 |

各 C++ 務自接其 vars 於 `Dockerfile`、`docker-compose.yml`、`.env.example`（附注釋如 VIDEO_TOPIC 之例：何以察 robot 實 topic 名）、`launch/teleop.launch.py`。data-schema.md env 表務五併更。

### Client 端

- `protocol.ts`：parse 三新訊息，`Number.isFinite` 守如 odom 之例；型別入 union。
- 新純模組 `map_codec.ts`：`decodeRle(cells, width, height)` → `Uint8Array`（0=unknown、1=free、2=occupied）；malformed → null，不擲。
- 新純模組 `map_render.ts`：座標算術之家——
  - ROS 慣例：x 前、y 左、theta 逆時針。螢幕：robot 居中、x-前向上。故 rel＝R(−θ)·(p−robot)，screen_x＝cx − rel_y·s，screen_y＝cy − rel_x·s（s＝px/m）。
  - `mapToScreenTransform(pose, meta, size, scale)` → canvas setTransform 六參。
  - `scanToScreenPoints(scan, size, scale)` → 點列（scan 既在 base frame，唯極座標→直角→螢幕）。
  - 此模組純算術，vitest 直測鎖定方向慣例——**hardware-verify 前之唯一真理源**。
- `useTeleopBridge`：訂三新訊息，曝 `mapGrid`（decode 後 cells＋meta）、`mapPose`、`scan`。decode 於訊息至時一次，非每 render。
- `MiniMap`（`shared.tsx`）canvas 化：
  - 層序（下→上）：bg → **map canvas** → 薄 grid（既有，存 HUD 風）→ **scan 點層** → trail（map frame 下仍可用）→ 中央 robot 箭（不動）。
  - map 至 → offscreen canvas 一建（ImageData，palette 染色）；pose 至 → 主 canvas clear + setTransform + drawImage。`imageSmoothingEnabled=false`，cell 稜角分明，合 HUD 風。
  - 重繪由 props 變化驅動（pose 5 Hz），無自走 rAF loop。
  - **降級**：無 map → 今日之 grid＋trail 全然如故（grid fallback 即現行 DOM 路徑，`data-testid="minimap-grid"` 存）；無 odom 亦如今。設計語言、舊測皆不破。

### 設計語言 (求五)

| 元素 | 治 |
|---|---|
| 容器 | 不動：`rgba(0,0,0,0.55)` bg、1px `rgba(255,255,255,0.15)` border、radius 6 |
| map cells | unknown→透明（bg 透出）、free→accent 微暈 `rgba(78,201,214,0.07)`、occupied→亮 `rgba(230,240,245,0.9)` |
| scan 點 | accent `#4ec9d6`，1.5 px，opacity 0.8——障礙實距一目了然 |
| grid 覆層 | 既有 gradient grid 降 opacity 覆 map 上，存掃描線 HUD 之風 |
| 微標 | 左下角 uppercase 小字如 Readout 之式：`MAP`（frame=map）／`ODOM`（退 odom）／`NO MAP`（無圖，今態） |
| 比例環 | 既有 `ranges` 虛線環，加米數微標（如 `2m`），由 scale 算出 |
| robot 箭 | 不動，恆居中向上 |

phone（92 px）圖窄，default scale 顯 ~10 m 徑；tablet 之 MiniMap 較大可增。tap-to-expand 全屏圖＝**Map view** backlog plan 之疆，此處不涉。

## 四、頻寬預算

| 流 | 量 | 頻 | 計 |
|---|---|---|---|
| map | 24 m ÷ 0.05 m ＝ 480² cells，室內 RLE 約 5–30 KB | ≤0.5 Hz 且唯變時 | 峰 ~15 KB/s，常態近零 |
| scan | 120 點 × ~6 B ≈ 0.8 KB | 5 Hz | ~4 KB/s |
| pose | ~80 B | 5 Hz | 微 |

LAN Wi-Fi 之下皆細流；video WebRTC 之側無足道。

## 五、共通法度 — 凡務皆遵 (不得違)

1. **trophy TDD**：先紅後綠。C++ 純函數＝gtest；TS 純函數＝vitest 單測；component/hook＝RTL＋jsdom。
2. **git worktree 一務一樹，branch 鏈式**：務 A 自 main 分；每後務自前務之 branch 分。**終端一次 merge 入 main**（操作者既定之法），非每務一 merge。樹中 docker 須 `--env-file /home/chngyicheng/pocket-teleop/.env`。
3. **Haiku 子代以 wenyan-ultra 役之**；code／commit 用 normal English。
4. **子代不得 commit、不得 stage、不得行任何 git；不得改所司以外之檔**。留 dirty tree 而報。控者審 `git status`、explicit path stage、commit。
5. **docker 測必 `--build`**；C++ 測循 repository-structure.md 之 volume-mount 式。樹移前 chown 還 root-owned `node_modules`。
6. **收束**：測綠 → 控者更 AGENTS.md handover → commit（code＋doc 同）→ 問操作者方 push／merge。

## 六、諸務 (serial，依賴有序)

> **依賴**：務一、務二同改 C++ teleop_node──序列。務三賴務 A 之型別。務四賴務 A＋務三。務五賴一切。
> **序**：務 A → 務一 → 務二 → 務三 → 務四 → 務五。TS 務（A）可先於 C++ 務，protocol 為兩端之約，先立為佳。

### 務 A — protocol 之約＋RLE decode (client 純層)

- **的**：三新訊息之 client 端 parse＋decode，先立兩端之約。
- **治**：`protocol.ts` 加 `map`/`pose`/`scan` parse（finite 守、型別 union）；新 `map_codec.ts` 之 `decodeRle`（malformed→null）。
- **測**：parse 正例反例（缺欄、非數、Inf/NaN）；decodeRle 正逆、run 溢界、空串、雜字。
- **所司檔**：`web-client/src/protocol.ts`、`web-client/src/map_codec.ts`、`web-client/test/protocol.test.ts`、`web-client/test/map_codec.test.ts`。
- **worktree**：`feat/map-protocol`。

### 務一 — C++ map broadcast

- **的**：訂 `/map`（transient_local）、crop 窗、trinary RLE、節流 broadcast。
- **治**：新 `map_codec.hpp/.cpp` 純函數（trinary 分類、RLE encode、crop 裁切）；`teleop_node` 訂閱＋params（`map_topic`、`map_window_m`）＋重送之機（新圖或移逾 2 m）。robot 位未得時（pose 尚無）以圖心為窗中。env 直通：`MAP_TOPIC`、`MAP_WINDOW_M`、補 `ODOM_TOPIC`（見〈部署者易配〉）。
- **測**：gtest 純函數（RLE 正逆、crop 邊界、全 unknown、窗逾圖界之鉗）；`test_teleop_node` 發 OccupancyGrid 斷 JSON broadcast 形。
- **所司檔**：`server/include/map_codec.hpp`、`server/src/map_codec.cpp`、`server/src/teleop_node.cpp`、`server/include/teleop_node.hpp`、`server/test/test_map_codec.cpp`、`server/test/test_teleop_node.cpp`、`server/CMakeLists.txt`、`server/package.xml`、`Dockerfile`、`docker-compose.yml`、`.env.example`、`server/launch/teleop.launch.py`。
- **worktree**：`feat/map-server`。

### 務二 — C++ pose (tf2)＋scan broadcast

- **的**：map frame 真 pose 與 decimated scan 入 WS。
- **治**：tf2 Buffer＋Listener；5 Hz timer lookup `map→base_link`，降級鏈（map→odom→不發）；`/scan` 訂（sensor_data QoS）、tf2 轉 base frame（不得則恆等）、decimate ≤120、節流 5 Hz、無效→0。params：`scan_topic`、`map_frame`、`odom_frame`、`base_frame`。env 直通：`SCAN_TOPIC`、`MAP_FRAME`、`ODOM_FRAME`、`BASE_FRAME`。warn log 必 throttle。
- **測**：decimate 純函數 gtest（step 算、無效值、空 scan）；`test_teleop_node` 發 static TF＋scan 斷 broadcast。tf2 於測中以 `StaticTransformBroadcaster` 立。
- **所司檔**：`server/src/teleop_node.cpp`、`server/include/teleop_node.hpp`、`server/src/map_codec.cpp`（decimate 同檔可也）、`server/include/map_codec.hpp`、`server/test/test_teleop_node.cpp`、`server/test/test_map_codec.cpp`、`Dockerfile`、`docker-compose.yml`、`.env.example`、`server/launch/teleop.launch.py`。
- **worktree**：`feat/pose-scan-server`。

### 務三 — bridge 曝新流

- **的**：map／pose／scan 達 React 層。
- **治**：`useTeleopBridge` 訂三訊息；map 至即 `decodeRle` 一次存 state（cells＋meta 併物）；`TeleopBridge` 介面增 `mapGrid`、`mapPose`、`scan`。`TeleopClient` 若需新 callback（如 `onMapMessage`），循 `onOdom` 之例增之。
- **測**：mock TeleopClientCtor 餵訊息，斷 bridge 曝物隨變；malformed map → mapGrid 不變。
- **所司檔**：`web-client/src/hooks/useTeleopBridge.ts`、`web-client/src/teleop_client.ts`、`web-client/test/useTeleopBridge.test.tsx`、`web-client/test/teleop_client.test.ts`。
- **worktree**：`feat/map-bridge`。

### 務四 — 渲染算術＋MiniMap canvas 化

- **的**：base_link 定 frame 之 canvas 渲染，降級如今。
- **治**：新 `map_render.ts` 純函數（〈三〉所列）；`MiniMap` 增 props（`mapGrid`、`mapPose`、`scan`），canvas 層疊〈設計語言〉表，offscreen 建圖、pose 驅重繪、smoothing off、null ctx 守；無 map 時走現行 DOM 路徑不變。微標＋米數環。
- **測**：`map_render` 單測**鎖方向慣例**（前行→圖下移、左轉→圖順旋等具體斷言）；MiniMap RTL 測：無 map→grid testid 存（舊測不破）、有 map→canvas 在＋微標文、scan props 變不擲。
- **所司檔**：`web-client/src/map_render.ts`、`web-client/src/components/shared.tsx`、`web-client/test/map_render.test.ts`、`web-client/test/shared.test.tsx`。
- **worktree**：`feat/minimap-render`。

### 務五 — view 接線＋docs 收束

- **的**：兩 view 傳新 props；docs 除 WIP 之注。
- **治**：`MissionControl`（兩處）＋`MissionTablet` 之 MiniMap 傳 `mapGrid`/`mapPose`/`scan`；pose 在則 minimap 位取 pose（frame=map），否則如今取 odom。README 除「minimap WIP」注、改述真圖；TROUBLESHOOTING 增「map 不顯」條（SLAM 未走、topic 名異、QoS 不合、tf 鏈斷之察法：`ros2 topic echo /map --qos-durability transient_local`、`ros2 run tf2_ros tf2_echo map base_link`）；data-schema.md 增三訊息＋新 params。
- **測**：view 測斷 props 達；全四 suite 綠。
- **所司檔**：`web-client/src/views/MissionControl.tsx`、`web-client/src/views/MissionTablet.tsx`、相應測檔、`README.md`、`TROUBLESHOOTING.md`、`memory/agent-guides/data-schema.md`、`AGENTS.md`。
- **worktree**：`feat/minimap-integration`。

## 七、險與未決

| 險 | 度 |
|---|---|
| **方向慣例** — ROS x前y左 vs 螢幕 y下、map origin、yaw 符號——紙上推演必有一誤 | `map_render` 單測鎖慣例；**hardware-verify 條入 deviations.md**：實機驗前行→圖後退、左旋→圖順旋、障礙方位合 scan |
| **SLAM 未必走** — robot 或無 slam_toolbox | 降級鏈保今態；TROUBLESHOOTING 載察法。操作者宜告 SLAM stack 與 topic 名（params 有 default，不阻工） |
| **tf2 lookup 於 container** — teleop-server 容器須見 `/tf`、`/tf_static`（host network 既同 ROS_DOMAIN，odom 既通，當無礙） | 實機驗之；hardware-verify 條 |
| **巨圖** | crop 窗有界，與全圖大小無涉 |
| **scan frame 倒置**（lidar 倒裝者眾） | tf2 轉 base frame 自正；hardware-verify 仍列 |
| **jsdom canvas null** | 算術純函數測；component 守 null |

## 八、與 backlog 之界

Feature pool 之 **Map view**（`2026-05-06-map-view-implementation.md`）乃全屏圖、目標點、路徑之疆。本規唯 minimap 真化；其 map/pose/scan 管道成後，Map view 可承之而不另立傳輸——屆時彼 plan 宜更新以引此管道。
