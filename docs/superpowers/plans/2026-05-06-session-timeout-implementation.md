# 會話閒置超時實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** session 30 分鐘無活動自動失效，用戶需重新登錄。

**動機：** 今 cookie maxAge 30 日，rolling 滾動。若手機被竊或共用，無閒置鎖。teleop 涉物理機器人，session 失竊風險物理化。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `auth-server/src/app.ts` | session 配置加 `cookie.maxAge: 30 * 60 * 1000`（30 分） |
| `auth-server/src/middleware/activity.ts` | 新建：每請求記 `req.session.lastActivity` |
| `auth-server/src/middleware/idle_check.ts` | 新建：閒置超時則銷毀 session |
| `auth-server/test/idle_timeout.test.ts` | 新建測試 |
| `web-client/src/teleop_client.ts` | onClose 收 401 觸發 location.replace 至 /auth/login |
| `web-client/index.html` | 加「即將超時」橫幅（剩 5 分時顯示） |
| `AGENTS.md` | 交接更新 |

---

## 任務

### 任務 1：服務器端閒置追蹤
- [ ] 步驟 1：寫 `activity.ts` 中間件，每請求更新 `req.session.lastActivity = Date.now()`
- [ ] 步驟 2：寫 `idle_check.ts`，若 `Date.now() - lastActivity > 30*60*1000` 則 `req.session.destroy()` 並 401
- [ ] 步驟 3：注意：WebSocket 升級不走 express middleware；ws 連接活躍即視為活動，需在 upgrade handler 中檢查並更新

### 任務 2：客戶端橫幅
- [ ] 步驟 1：服務器加 `/auth/session-status` 端點，返 `{ remainingMs }`
- [ ] 步驟 2：客戶端每分鐘輪詢，若 `remainingMs < 5*60*1000` 顯示橫幅
- [ ] 步驟 3：橫幅含「保持登錄」按鈕，點擊發空 POST 至 `/auth/heartbeat` 重置

### 任務 3：401 自動登出
- [ ] 步驟 1：teleop_client.ts onClose 若收 4001 自定義 close code（服務器發出表示 session 失效），調 `location.replace('/auth/login')`
- [ ] 步驟 2：服務器 WebSocket 升級時若 session 過期，發 4001 close
- [ ] 步驟 3：HTTP 401 由現有 redirect 中間件處理

### 任務 4：測試
- [ ] 步驟 1：單元測試：idle_check 過期銷毀 session
- [ ] 步驟 2：集成測試：31 分後請求得 401
- [ ] 步驟 3：集成測試：活動期間滾動延長

---

## 測試要求

- auth-server 補測 ≥ 5
- 全套件綠

## 已知風險／決策

- WebSocket 長連接無 HTTP 請求，不更新 lastActivity——選 ws message 視為活動
- 橫幅「保持登錄」可被自動腳本點擊規避超時——接受，目的為防被動失竊非主動繞過
- 30 分鐘為硬編碼——可後續改 env 變量
