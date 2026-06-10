# 診斷面板實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 訂 `/diagnostics`（diagnostic_msgs/DiagnosticArray），UI 列關鍵組件健康。客戶端亦顯本地連接狀態（WebSocket、視頻、odom 是否新鮮）。

**動機：** 「無視頻」當下不知緣何——video-bridge 死？mediamtx 異？網絡？診斷面板一目了然。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `server/include/teleop_server.hpp` | 加 DiagnosticArray 緩存 |
| `server/src/teleop_server.cpp` | broadcast diagnostics 類型（節流） |
| `server/src/teleop_node.cpp` | 訂 `/diagnostics` |
| `web-client/src/protocol.ts` | 加 DiagnosticsMessage |
| `web-client/src/teleop_client.ts` | onDiagnostics 回調；本地新鮮度追蹤 |
| `web-client/src/diagnostics.ts` | 新建：聚合服務器端 + 客戶端狀態 |
| `web-client/test/diagnostics.test.ts` | 新建 |
| `web-client/index.html` | 診斷側邊欄（可摺疊） |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：服務器端訂閱
- [ ] 步驟 1：teleop_node 訂 /diagnostics，QoS：default
- [ ] 步驟 2：teleop_server broadcast 1 Hz 或變更時，發 `{type:"diagnostics", statuses:[{name,level,message,values}]}`
- [ ] 步驟 3：補 C++ 測試

### 任務 2：客戶端聚合模塊
- [ ] 步驟 1：Diagnostics 類接受服務器 diag 與本地新鮮度（last odom, last video frame, ws state）
- [ ] 步驟 2：API：getStatuses() → 統一格式
- [ ] 步驟 3：補測

### 任務 3：UI 面板
- [ ] 步驟 1：右側可摺疊 drawer，列各組件（WebSocket、Video, Odom, Map, Battery, ROS topics）
- [ ] 步驟 2：色點：綠（健康）、黃（警告）、紅（錯誤）、灰（無數據）
- [ ] 步驟 3：點擊組件展開詳情（消息、值、最後更新時間）

### 任務 4：本地新鮮度檢查
- [ ] 步驟 1：每 1 秒檢：odom > 2s 無更新 → 黃；> 5s → 紅
- [ ] 步驟 2：類似邏輯 video frame、ws ping
- [ ] 步驟 3：補測

### 任務 5：文檔與交接
- [ ] 步驟 1：data-schema.md
- [ ] 步驟 2：AGENTS.md

---

## 測試要求

- C++ server 補 ≥ 2
- diagnostics 模塊測試 ≥ 6
- 全套件綠

## 已知風險／決策

- /diagnostics 可能高頻：節流 1 Hz 服務器端
- 機器人無 /diagnostics——僅本地狀態顯示
- 摺疊默認收起，避免主屏幕擁擠

---

## 補遺 (2026-06-11) — 執行法度，凡務皆遵 (不得違)

> **陳舊之警：** 本規早於 Mission UI React migration（2026-05-28）、SLAM minimap（2026-06-10）。所引檔徑、現狀勘定**執行前必重勘於今碼**——web client 今為 React（`web-client/src/` views/hooks/components），protocol 今有 map/pose/scan 訊息。勘異則循今碼，本規唯存意圖。

1. **trophy TDD**：先紅後綠。C++ 純函數＝gtest；TS 純函數＝vitest 單測；component/hook＝RTL＋jsdom。
2. **git worktree 一務一樹，branch 鏈式**：務一自 main 分；每後務自前務之 branch 分。終端一次 merge 入 main，非每務一 merge。樹中 docker 須 `--env-file /home/chngyicheng/pocket-teleop/.env`。
3. **Haiku 子代役之，prompt 以 caveman wenyan-ultra**（English technical terms 留 English）；code／commit／test 名用 normal English。
4. **子代不得 commit、不得 stage、不得行任何 git；不得改所司以外之檔**。prompt 必書「do not stage or commit; leave changes in the working tree and report」「on permission denial, stop and report」。留 dirty tree 而報。控者審 `git status`（main repo 與 worktree 兩處）、explicit path stage、commit。
5. **docker 測必 `--build`**；C++ 測循 repository-structure.md 之 volume-mount 式。樹移前 chown 還 root-owned `node_modules`。
6. **收束**：測綠（baseline 556/51/19/69 不退）→ 控者更 AGENTS.md handover → commit（code＋doc 同）→ 問操作者方 push／merge。
