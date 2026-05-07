# 地圖視圖實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 訂閱 `/map`（nav_msgs/OccupancyGrid），canvas 渲染 2D 占用網格，疊加機器人位置（朝向箭頭）。

**動機：** 視野外導航必需。今依靠視頻 + 羅盤；遠處或無視頻場景無空間感知。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `server/include/teleop_server.hpp` | 加 `OccupancyGrid` 緩存與最後時間戳 |
| `server/src/teleop_server.cpp` | broadcast 加 `occupancy` 類型；節流（1 Hz 或 changed-only） |
| `server/src/teleop_node.cpp` | 訂閱 `/map`，調 server.update_map() |
| `web-client/src/protocol.ts` | 加 `OccupancyGridMessage` 類型 |
| `web-client/src/teleop_client.ts` | 加 onMap 回調 |
| `web-client/src/map_view.ts` | 新建：canvas 渲染器 |
| `web-client/test/map_view.test.ts` | 新建：渲染、坐標變換 |
| `web-client/index.html` | 加 `<canvas id="map">` 與切換按鈕（視頻/地圖） |
| `AGENTS.md` | 交接更新 |

---

## 任務

### 任務 1：服務器端 map 訂閱與廣播
- [ ] 步驟 1：teleop_node 訂 `/map`，QoS：reliable + transient_local
- [ ] 步驟 2：teleop_server 加 update_map(grid)，存最新副本
- [ ] 步驟 3：broadcast 周期（1 Hz 或變更時）發 `{type:"occupancy", width, height, resolution, origin:{x,y,theta}, data:base64}`
- [ ] 步驟 4：補 C++ 測試：序列化正確

### 任務 2：客戶端協議與回調
- [ ] 步驟 1：protocol.ts 加 `OccupancyGridMessage` 與解析
- [ ] 步驟 2：TeleopClient 加 `onMap(grid)` 回調
- [ ] 步驟 3：補測 protocol.test.ts

### 任務 3：MapView 渲染器
- [ ] 步驟 1：`MapView` 類接 canvas + grid，渲為灰度（free=白、occupied=黑、unknown=灰）
- [ ] 步驟 2：坐標變換：map 坐標 → canvas 像素
- [ ] 步驟 3：onOdom 回調：繪機器人位置（圓 + 朝向箭頭）
- [ ] 步驟 4：拖動平移、滾輪縮放
- [ ] 步驟 5：補測：渲染像素、坐標變換、機器人疊加

### 任務 4：UI 集成
- [ ] 步驟 1：index.html 加 map canvas，初隱藏
- [ ] 步驟 2：頂部欄加「視圖：視頻 / 地圖 / 並列」三選
- [ ] 步驟 3：並列模式手機橫屏可用

### 任務 5：文檔與交接
- [ ] 步驟 1：data-schema.md 加 OccupancyGrid 消息
- [ ] 步驟 2：AGENTS.md 交接

---

## 測試要求

- C++ server 測試補 ≥ 2
- protocol 測試補 ≥ 2
- map_view 測試 ≥ 5
- 全套件綠

## 已知風險／決策

- 占用網格大（500×500=250KB）；發 base64 帶寬重——選變更後發或下采樣
- transient_local QoS 確保新訂閱者得最新地圖
- canvas 渲染移動端性能：限刷新 1 Hz
- 不訂 costmap（dynamic）以省帶寬；有需求再加
