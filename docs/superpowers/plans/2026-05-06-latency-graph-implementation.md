# 延遲歷史圖實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 既有 last-seen pill 旁加迷你折線圖，示最近 30 秒 RTT 走勢。

**動機：** 今單值難辨網絡突變。歷史圖示峰值與抖動，操作員可預判延遲尖峰。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `web-client/src/latency_history.ts` | 新建：環形緩衝 + 統計 |
| `web-client/src/latency_chart.ts` | 新建：canvas 折線渲染 |
| `web-client/test/latency_history.test.ts` | 新建測試 |
| `web-client/test/latency_chart.test.ts` | 新建測試 |
| `web-client/index.html` | 加 `<canvas id="latency-chart">` 旁 last-seen pill |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：LatencyHistory 模塊
- [ ] 步驟 1：環形緩衝大小 60（30s @ 2 Hz ping）
- [ ] 步驟 2：API：push(ms)、values()、stats()→{min,max,avg,p95}
- [ ] 步驟 3：補測：push 滾動、stats 正確

### 任務 2：LatencyChart 渲染
- [ ] 步驟 1：`render(canvas, history)` 繪折線
- [ ] 步驟 2：x 軸時間（最舊在左），y 軸 ms（自動縮放或固定 0–500）
- [ ] 步驟 3：色標：<100ms 綠、100–300 黃、>300 紅
- [ ] 步驟 4：補測：mock canvas，驗點數與顏色

### 任務 3：UI 集成
- [ ] 步驟 1：teleop_client.onLatency 加 history.push(rtt)
- [ ] 步驟 2：每秒重渲圖
- [ ] 步驟 3：尺寸：80×30 px，緊靠 pill

### 任務 4：交接
- [ ] 步驟 1：AGENTS.md 交接更新

---

## 測試要求

- latency_history 測試 ≥ 5
- latency_chart 測試 ≥ 3
- 全套件綠

## 已知風險／決策

- 環形緩衝大小固定 60——30 秒已夠決策窗
- canvas 重繪每秒：移動端可承受
- 不存 history 至 localStorage——session 即丟，無分析需求


---

## 重核附則（2026-06-15）— 對現碼校驗

- **文件引用皆存**：本計劃所引諸源文件今仍在，無改名/刪除。
- **React 遷移（關鍵 staleness）**：UI 任務原指 `web-client/index.html`（今僅 44 行 React 掛載點 `<div id="root">` + `/src/main.tsx`）；UI 須改置 React——`web-client/src/views/MissionControl.tsx`、`MissionTablet.tsx`、`web-client/src/components/`。框架無關之邏輯層（`protocol.ts`/`teleop_client.ts`/`settings.ts`、server C++）仍有效。
- **可復用基建**：`useTeleopBridge` 已暴露 `latencyMs`；歷史圖置 React 組件（非 index.html canvas）。
