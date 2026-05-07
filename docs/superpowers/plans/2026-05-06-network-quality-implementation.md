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
