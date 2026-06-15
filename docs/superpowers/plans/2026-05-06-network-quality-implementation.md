# 網絡質量指示實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** UI 顯示網絡信號強度條（類手機網絡圖標），基於延遲、抖動、丟包率聚合為 0–4 格指示。

**動機：** 操作員可預判網絡降級。今單延遲值難辨整體質量；丟包與抖動同等重要。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `web-client/src/network_quality.ts` | 新建：聚合 RTT、抖動、丟包 |
| `web-client/src/teleop_client.ts` | 追蹤丟 ping（已發無 pong）、抖動 |
| `web-client/test/network_quality.test.ts` | 新建 |
| `web-client/index.html` | 信號條 UI（4 格） |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：teleop_client 抖動與丟包追蹤
- [ ] 步驟 1：每 sendPing 記時戳；onPong 計 RTT 與 expected pong 序號
- [ ] 步驟 2：超 1 秒未收 pong 視為丟
- [ ] 步驟 3：抖動 = 連續 RTT 之絕對差均值
- [ ] 步驟 4：暴露 `getNetworkStats()` 返 `{rtt, jitter, lossRate}`

### 任務 2：NetworkQuality 模塊
- [ ] 步驟 1：`computeQuality(stats)` 返 0–4
- [ ] 步驟 2：規則：rtt<100 抖<20 丟<1% → 4；遞減
- [ ] 步驟 3：補測 ≥ 6

### 任務 3：UI 信號條
- [ ] 步驟 1：頂部欄 4 格信號條（CSS 漸高）
- [ ] 步驟 2：每秒更新
- [ ] 步驟 3：點擊展開詳情（rtt、jitter、loss）

### 任務 4：警告閾值
- [ ] 步驟 1：質量降至 1 格 → 黃徽章「網絡差」
- [ ] 步驟 2：降至 0 格 → 紅徽章「網絡危」
- [ ] 步驟 3：補測

### 任務 5：文檔
- [ ] 步驟 1：AGENTS.md 交接

---

## 測試要求

- network_quality 模塊測試 ≥ 8
- teleop_client 補 ≥ 3（丟、抖、stats）
- 全套件綠

## 已知風險／決策

- 抖動標準算法用 RFC 3550 EWMA；本計劃簡化為均值，可後升
- 丟包窗口：最近 20 ping
- 信號條與 latency 圖互補：圖示細節，條示概覽

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
- **可復用基建**：邏輯 client 端；UI = 既有 React `<Readout label="SIG" value="—">`（今硬編 em-dash）。
