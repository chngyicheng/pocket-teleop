# 2026-07-13 — 積壓六務實施之策(重鑄)

## 緣起

nav feedback 既成,操者命續填六缺。舊策四篇(latency-graph、map-view、geofence、diagnostics-panel,皆 2026-05-06)先於 React migration 與 SLAM minimap,故此策重鑄之——基建今多已備,範圍大縮。務一、務二無舊策(2026-07-13 gap 察所得)。

## 六務總綱

### 務一 — disconnected-send feedback(無舊策,小)

今 socket 既斷而按 Send/Pause/Resume/Stop,Connection.send 默然 no-op,鈕似成而實未發。

- teleop_client.ts:sendNavGoal 增察 connection.isOpen(),不通則返 false(estop 察依舊);sendNavPause、sendNavResume、sendNavCancel 亦改返 boolean,不通則 false 不發。
- useTeleopBridge.ts:四包皆察返值。false 時:bridge 已知 estopEngaged——鎖則 notice 文曰 E-STOP engaged — reset before navigating(warn,唯 goal 與 resume 有此因);否則文曰 Not connected(warn)。
- 試:client 四法斷線返 false 不發;bridge 斷線 notice 文正。

### 務二 — waypoint occupancy check(無舊策,小)

今 waypoint 可落牆內、未知域,nav2 敗而唯 failed toast。先驗於落點。

- map_render.ts:增純函 cellAtWorld(mapGrid, wx, wy) → cell 值(CELL_UNKNOWN/FREE/OCCUPIED)或 null(界外)。世界→格:以 originX/originY/resolution 逆推,floor 至格址。
- shared.tsx MiniMap wrapper:onWaypointPlace 之際察 cellAtWorld——非 CELL_FREE 則不立 waypoint,立瞬時 blocked state(二秒自滅),nav-controls 行內顯小紅文曰 Blocked — tap free space。
- 試:cellAtWorld 單試(四隅、界外、三值);wrapper 拒立與提示。

### 務三 — latency sparkline(重鑄 2026-05-06-latency-graph)

舊策 canvas + index.html + stats(),今棄 canvas 就 SVG(jsdom 可試,trail polyline 同式),棄 stats()(YAGNI,deviation 記之)。

- useTeleopBridge.ts:onLatency 既有——增環形史 latencyHistory: number[](上限 60),出於 interface。
- shared.tsx:增 LatencySparkline 純示件——受 history 與寬高(約 80×24),SVG polyline,y 自縮(下 0 上 max(300, 觀測極)),色由末值:<100 綠、<300 琥珀、餘紅;無據則不繪。
- views:MissionControl landscape 左 rail LAT readout 下、MissionTablet rail 同位各繪其一。portrait 不置(位窘)。
- 試:bridge 史滾動上限;sparkline 點數、色階、空史不繪。

### 務四 — map view(重鑄 2026-05-06-map-view)

舊策 server 訂 /map + canvas 渲染 + index.html——皆已成於 SLAM minimap。餘值唯一:以地圖為主視口駕駛(視頻遮蔽、無視頻、視野外)。

- views 增 viewMode state('cam' | 'map',默 cam):header 增小 toggle chip(文曰 CAM / MAP,樣同 mode chip)。map 態:主視口 video 隱(display none,stream 不斷),置一大 MiniMap 充滿主域(pannable、非 expandable——已是主圖,expand 無義;waypoint 諸 props 照舊傳,nav 控鈕須可用……然 MiniMap 之 nav 控鈕唯 expanded overlay 有。故 map 態仍用 expandable MiniMap 而 size 充主域?否——過巧)。**決:map 態繪 MiniMap size 充主域、pannable、enableWaypoints 經既有 expand 途(充域圖上再 tap 展開亦可,不另闢波)。joysticks、E-STOP、readouts 照舊疊於上。**
- 二 view 皆施(MissionControl landscape+portrait、MissionTablet 中欄)。
- 無 map 資料時 toggle disabled(muted)。
- 試:toggle 顯隱 video/map、無 map 禁用、joysticks 仍在。

### 務五 — geofence(重鑄 2026-05-06-geofence;SAFETY,最大,居末)

禁入多邊形(map 座標),近界衰速,入內則停。唯轄 teleop twist——nav2 自駕不經 client twist,此限記於 deviation(nav goal 落禁域已有務二占據察部分擋之)。

- geofence.ts 新純模:Polygon 型(vertices [x,y][]);pointInPolygon(ray-casting,標準演算);distanceToBoundary(點至各邊最近距);speedScale(p, fences, bufferM 0.5)→[0,1]:域內 0,距界>buffer 1,間線性。
- settings.ts:loadFences/saveFences(localStorage JSON,默空)。
- teleop_client.ts:setFences(fences);client 內部自 pose 訊息(map frame 優先)存 lastPose;publisher tick 內 currentTwist 各軸乘 scale 後發;scale 初至 0 之 tick 呼 onGeofenceLimit?() 一次(復 >0 則重武)。estop、nav 諸令不涉。
- useTeleopBridge.ts:onGeofenceLimit → navNotice 文曰 Geofence limit — motion stopped(warn);load fences 於 connect 後 setFences;出 fences 與 saveFences 包(編輯器用)。
- shared.tsx MiniMap:expanded overlay 增 Edit Fence 鈕(idle 態唯有):入編輯——tap 加頂點(既有 screenToWorldPoint 途),頂點+線 SVG 疊層(紅系,別於 navPath 青),Close Fence 鈕閉合(≥3 頂點),Clear Fences 鈕盡刪,Save 存 localStorage 並 setFences。fences 常繪於 map(半透紅面)。
- 試:geofence 純試 ≥8(凸、凹、界上、buffer 內外、多 fence 取 min);client 集成 ≥3(scale 乘、0 停、onGeofenceLimit 一次);編輯器 UI 試(加點、閉合、存取)。

### 務六 — diagnostics panel(重鑄 2026-05-06-diagnostics;半縮)

舊策 server 訂 /diagnostics + 本地新鮮度。今唯建本地半——「無視頻何故」之值盡在本地;server /diagnostics 延後(robot 未必發,deviation 記之)。

- diagnostics.ts 新純模:computeDiagnostics(inputs)→rows。inputs:ws connectionState、whep state、odom 齡、pose 齡、scan 齡、map 齡、battery 齡(ms 或 null)。row:{name, level: ok|warn|error|none, detail}。齡律:<2s ok、<5s warn、餘 error、null none(battery:<3s/<10s)。ws:live ok、reconnecting warn、餘 error。video:live ok、connecting/retrying warn、餘 error。
- useTeleopBridge.ts:增 lastMsgAt ref 群(odom/pose/scan/map/battery 各記 Date.now() 於 callback),出 telemetryAges(1 Hz interval 更新,既有 network 輪詢同式)。
- SettingsDrawer.tsx:增 Diagnostics 節(諸節同式):行列 WS、Video、Odom、Pose、Scan、Map、Battery,色點(ok 綠、warn 琥珀、error 紅、none 灰)+ detail 文(齡或態)。stream state 經 App 傳入 drawer(既有 props 途察之,無則增一 prop)。
- 試:diagnostics 純試 ≥6(諸齡階、null、ws/video 態映);drawer 節渲染試。

## 序與併

- 第一波:務一 ∥ 務二(檔域不交:一在 teleop_client+bridge,二在 map_render+shared)。
- 第二波:務三(待一之 bridge、二之 shared)。
- 第三波:務四 ∥ 務六(四在 views+shared,六在 bridge+diagnostics+SettingsDrawer,不交)。
- 第四波:務五(最大,待四之 MiniMap 靜)。
- branch 一枝 feat/backlog-6,控者每務 commit;盡成一併入 main;push 必先請(操者命:六務盡成方報)。

## 驗證

- webclient:docker compose --profile test,890 基線不退,每務增試。
- C++ 無涉(六務皆 client 側)。
- 手驗(操者他日):斷線 Send toast;牆內 tap 拒;sparkline 走勢;MAP 態駕駛;fence 衰速停;diagnostics 齡準。

## 執行規約

- Haiku subagent,wenyan-ultra 諭之,trophy TDD。
- subagent 永不行 git、永不遣 subagent(Agent tool 禁);樹留 dirty 報之;permission 拒則止。
- 試唯 Docker。
- 控者每務審(status、spec、quality)乃明路 stage commit。

## Deviation 記

- 務三:棄 stats()(min/max/avg/p95)——sparkline 目測已足,無消費者。
- 務五:geofence 唯轄 teleop twist,不轄 nav2 自駕(client twist 不經);軟護,非代物理 E-STOP。
- 務六:server /diagnostics 訂閱延後——robot 未必發之,本地新鮮度先付其值;有真 /diagnostics 需求再增。
