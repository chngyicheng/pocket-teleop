# 斷線後安全行為配置實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 服務器配置可選斷線後行為：`stop`（默認，今行為）、`hold`（保持當前速度 N 秒後停）、`return-home`（觸發 return-home 服務）、`continue`（指定毫秒繼續上次指令後停）。

**動機：** 不同任務有不同安全偏好。低速倉庫機器人立即停可能堵路；無人機立即停反致墜。配置化提供場景適配。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `server/include/teleop_server.hpp` | 加 `disconnect_action_` 枚舉與相關狀態 |
| `server/src/teleop_server.cpp` | watchdog_loop 觸發按配置動作 |
| `server/src/teleop_node.cpp` | 加 `disconnect_action` 與 `disconnect_action_param` 參數 |
| `server/test/test_teleop_server.cpp` | 補各模式測試 |
| `data-schema.md` | 加配置文檔 |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：枚舉與配置
- [ ] 步驟 1：`enum class DisconnectAction { Stop, Hold, ReturnHome, Continue }`
- [ ] 步驟 2：teleop_node 加 ROS 參數 `disconnect_action`（string） + `disconnect_action_param`（int，毫秒）
- [ ] 步驟 3：構造 TeleopServer 時注入

### 任務 2：watchdog 行為改造
- [ ] 步驟 1：今 watchdog 觸發即發 0,0,0 並關連接——保留為 Stop 模式
- [ ] 步驟 2：Hold 模式：發 last_twist 持續 param 毫秒，後發 0,0,0 關
- [ ] 步驟 3：Continue 模式：類 Hold 但 param=毫秒
- [ ] 步驟 4：ReturnHome 模式：調 ROS service `/return_home`（async）後發 0,0,0 關

### 任務 3：last_twist 緩存
- [ ] 步驟 1：on_message 處理 TwistCommand 時緩存 last_twist
- [ ] 步驟 2：補測

### 任務 4：return-home service client
- [ ] 步驟 1：teleop_node 加 std_srvs/Trigger client
- [ ] 步驟 2：service 不可用時回退至 Stop
- [ ] 步驟 3：補測

### 任務 5：UI 顯示當前行為
- [ ] 步驟 1：status 消息加 `disconnect_action` 字段
- [ ] 步驟 2：客戶端設置面板顯示當前配置（只讀）
- [ ] 步驟 3：補測

### 任務 6：文檔
- [ ] 步驟 1：data-schema.md 添 disconnect_action 參數
- [ ] 步驟 2：README 配置示例
- [ ] 步驟 3：AGENTS.md

---

## 測試要求

- C++ server 補 ≥ 6
- protocol 補 ≥ 1
- 全套件綠

## 已知風險／決策

- ReturnHome 依賴外部 service 存在——回退 Stop 為安全默認
- Hold/Continue 模式違反「故障停」原則——文檔明確警告
- 默認仍 Stop 模式，向後兼容

---

## 補遺 (2026-06-11) — 執行法度，凡務皆遵 (不得違)

> **陳舊之警：** 本規早於 Mission UI React migration（2026-05-28）、SLAM minimap（2026-06-10）。所引檔徑、現狀勘定**執行前必重勘於今碼**——web client 今為 React（`web-client/src/` views/hooks/components），protocol 今有 map/pose/scan 訊息。勘異則循今碼，本規唯存意圖。

1. **trophy TDD**：先紅後綠。C++ 純函數＝gtest；TS 純函數＝vitest 單測；component/hook＝RTL＋jsdom。
2. **git worktree 一務一樹，branch 鏈式**：務一自 main 分；每後務自前務之 branch 分。終端一次 merge 入 main，非每務一 merge。樹中 docker 須 `--env-file /home/chngyicheng/pocket-teleop/.env`。
3. **Haiku 子代役之，prompt 以 caveman wenyan-ultra**（English technical terms 留 English）；code／commit／test 名用 normal English。
4. **子代不得 commit、不得 stage、不得行任何 git；不得改所司以外之檔**。prompt 必書「do not stage or commit; leave changes in the working tree and report」「on permission denial, stop and report」。留 dirty tree 而報。控者審 `git status`（main repo 與 worktree 兩處）、explicit path stage、commit。
5. **docker 測必 `--build`**；C++ 測循 repository-structure.md 之 volume-mount 式。樹移前 chown 還 root-owned `node_modules`。
6. **收束**：測綠（baseline 556/51/19/69 不退）→ 控者更 AGENTS.md handover → commit（code＋doc 同）→ 問操作者方 push／merge。
