# 地理圍欄實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 操作員可定義機器人禁入多邊形（map 坐標系），客戶端訂閱 odom 後若機器人接近邊界即衰減速度，越界則 e-stop。

**動機：** 物理空間有禁區（樓梯口、坡道、貴重設備）。今全憑操作員視野；超視野或網絡卡時無防護。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `web-client/src/geofence.ts` | 新建：點-多邊形碰撞、距離計算、衰減函數 |
| `web-client/src/settings.ts` | 加 `fences: Polygon[]` persist |
| `web-client/src/teleop_client.ts` | sendTwist 前查 geofence，按距邊界衰減或停 |
| `web-client/test/geofence.test.ts` | 新建：點包含、距邊界、衰減曲線 |
| `web-client/index.html` | 地圖視圖編輯模式：點擊加頂點，閉合成多邊形 |
| `AGENTS.md` | 交接更新 |

**前置：** 需 `map-view` 計劃實現後方能可視化編輯；可先獨立實現邏輯部分。

---

## 任務

### 任務 1：geofence 模塊（純邏輯）
- [ ] 步驟 1：`Polygon = { vertices: [x,y][] }`，`pointInPolygon(p, poly)` 用 ray-casting
- [ ] 步驟 2：`distanceToBoundary(p, poly)` 返最近邊距離
- [ ] 步驟 3：`speedScale(p, poly, bufferM=0.5)` 返 [0,1]：>buffer 時 1，0–buffer 線性，越界 0
- [ ] 步驟 4：補測 geofence.test.ts：包含、不包含、距離、衰減

### 任務 2：teleop_client 集成
- [ ] 步驟 1：TeleopClient 加 `setFences(fences)` 與 odom 訂閱
- [ ] 步驟 2：sendTwist 前計 `currentScale = min(speedScale(robotPos, fence) for fence in fences)`
- [ ] 步驟 3：lx/ly/az 各乘 currentScale；scale=0 時不發或發停

### 任務 3：settings 持久化
- [ ] 步驟 1：settings 加 `fences: Polygon[]`，默認空
- [ ] 步驟 2：save/load 序列化為 JSON 至 localStorage
- [ ] 步驟 3：補測

### 任務 4：UI 編輯（依賴 map-view）
- [ ] 步驟 1：地圖視圖加「編輯圍欄」按鈕，進入後點擊加頂點
- [ ] 步驟 2：閉合：雙擊或返回首頂點
- [ ] 步驟 3：圍欄列表：可重命名、刪除

---

## 測試要求

- geofence 模塊單元測試 ≥ 8（凸/凹多邊形、邊界、衰減）
- teleop_client 集成測試 ≥ 3
- 全套件綠

## 已知風險／決策

- 客戶端執行——依賴 map 坐標系與 odom 一致；某些 SLAM 重定位後失準
- 不替代物理 e-stop；僅軟性防護
- 凹多邊形 ray-casting 需謹慎邊界處理；用標準算法
- map_frame 漂移時圍欄漂移；後續可錨定 landmark
