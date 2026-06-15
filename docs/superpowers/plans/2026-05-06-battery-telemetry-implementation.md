# 電池遙測實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 服務器訂閱 `sensor_msgs/BatteryState`，廣播至客戶端，UI 顯示百分比、電壓、剩餘時間估算、低電警告。

**動機：** 野外作業電量為命。今無提示，斷電才察覺。電池圖標 + 警告閾值大幅提升可靠性。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `server/include/teleop_server.hpp` | 加 BatteryState 緩存 |
| `server/src/teleop_server.cpp` | broadcast 加 battery 類型 |
| `server/src/teleop_node.cpp` | 訂 `/battery_state`（可配 topic） |
| `web-client/src/protocol.ts` | 加 BatteryMessage 類型 |
| `web-client/src/teleop_client.ts` | onBattery 回調 |
| `web-client/index.html` | 電池徽章（百分比 + 圖標 + 警告色） |
| `data-schema.md` | 加 BatteryState 消息 |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：服務器端訂閱與廣播
- [ ] 步驟 1：teleop_node 訂 `/battery_state`，topic 名可配 ROS 參數
- [ ] 步驟 2：teleop_server 緩存最新值，broadcast 1 Hz 發 `{type:"battery", percentage, voltage, current, charging}`
- [ ] 步驟 3：補 C++ 測試

### 任務 2：客戶端協議
- [ ] 步驟 1：protocol.ts 加 BatteryMessage 解析
- [ ] 步驟 2：TeleopClient 加 onBattery
- [ ] 步驟 3：補 protocol 測試

### 任務 3：UI 徽章
- [ ] 步驟 1：index.html 加電池徽章（頂部欄）
- [ ] 步驟 2：圖標分檔（>80% 綠、20–80% 黃、<20% 紅 + 閃爍）
- [ ] 步驟 3：點擊展開詳情面板（電壓、電流、充電狀態、估算剩餘時間）

### 任務 4：剩餘時間估算
- [ ] 步驟 1：客戶端記百分比歷史（前 60 秒）計放電速率
- [ ] 步驟 2：估剩餘時間 = current_pct / discharge_rate
- [ ] 步驟 3：充電中顯示「充電中」非估算
- [ ] 步驟 4：補測

### 任務 5：文檔與交接
- [ ] 步驟 1：data-schema.md
- [ ] 步驟 2：README 提及電池 topic 配置
- [ ] 步驟 3：AGENTS.md

---

## 測試要求

- C++ server 補 ≥ 2
- protocol 補 ≥ 2
- 估算邏輯單元測 ≥ 3
- 全套件綠

## 已知風險／決策

- 機器人無 BatteryState topic——徽章不顯（缺消息時隱藏，非顯示 0%）
- 1 Hz broadcast 帶寬可忽略
- 估算簡單線性回歸；不模擬非線性放電曲線

---

## 補遺 (2026-06-11) — 執行法度，凡務皆遵 (不得違)

> **陳舊之警：** 本規早於 Mission UI React migration（2026-05-28）、SLAM minimap（2026-06-10）。所引檔徑、現狀勘定**執行前必重勘於今碼**——web client 今為 React（`web-client/src/` views/hooks/components），protocol 今有 map/pose/scan 訊息。勘異則循今碼，本規唯存意圖。

1. **trophy TDD**：先紅後綠。C++ 純函數＝gtest；TS 純函數＝vitest 單測；component/hook＝RTL＋jsdom。
2. **git worktree 一務一樹，branch 鏈式**：務一自 main 分；每後務自前務之 branch 分。終端一次 merge 入 main，非每務一 merge。樹中 docker 須 `--env-file /home/chngyicheng/pocket-teleop/.env`。
3. **Haiku 子代役之，prompt 以 caveman wenyan-ultra**（English technical terms 留 English）；code／commit／test 名用 normal English。
4. **子代不得 commit、不得 stage、不得行任何 git；不得改所司以外之檔**。prompt 必書「do not stage or commit; leave changes in the working tree and report」「on permission denial, stop and report」。留 dirty tree 而報。控者審 `git status`（main repo 與 worktree 兩處）、explicit path stage、commit。
5. **docker 測必 `--build`**；C++ 測循 repository-structure.md 之 volume-mount 式。樹移前 chown 還 root-owned `node_modules`。
6. **收束**：測綠（baseline 556/51/19/69 不退）→ 控者更 AGENTS.md handover → commit（code＋doc 同）→ 問操作者方 push／merge。


---

## 重核附則（2026-06-15）— 對現碼校驗

- **文件引用皆存**：本計劃所引諸源文件今仍在，無改名/刪除。
- **React 遷移（關鍵 staleness）**：UI 任務原指 `web-client/index.html`（今僅 44 行 React 掛載點 `<div id="root">` + `/src/main.tsx`）；UI 須改置 React——`web-client/src/views/MissionControl.tsx`、`MissionTablet.tsx`、`web-client/src/components/`。框架無關之邏輯層（`protocol.ts`/`teleop_client.ts`/`settings.ts`、server C++）仍有效。
- **可復用基建**：server C++ + `protocol.ts` + `teleop_client.ts` 皆現存；UI = 填值於既有 React `<Readout label="BAT" value="—">`（MissionControl.tsx:424/695，今硬編 em-dash）。
