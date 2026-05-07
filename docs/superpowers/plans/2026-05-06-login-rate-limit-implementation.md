# 登錄速率限制實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** auth-server `/auth/login` 端點加速率限制，IP 級 + 用戶名級雙限，阻暴力破解。

**動機：** 今 bcrypt 拖慢但仍可暴力。無速率限制，攻擊者可並發千請求。IP 級防腳本掃，用戶名級防慢速分散攻擊。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `auth-server/package.json` | 加 `express-rate-limit` |
| `auth-server/src/routes/auth.ts` | login 端點包速率限制中間件 |
| `auth-server/src/rate_limit.ts` | 新建：IP + 用戶名雙限工廠 |
| `auth-server/test/rate_limit.test.ts` | 新建單元測試 |
| `auth-server/test/auth.integration.test.ts` | 補集成：超限後 429 |
| `AGENTS.md` | 交接更新 |

---

## 任務

### 任務 1：rate_limit.ts 模塊
- [ ] 步驟 1：寫 `rate_limit.ts`，導出 `ipLimiter`（10 次/分鐘/IP）與 `userLimiter`（5 次/分鐘/用戶名）
- [ ] 步驟 2：用 memory store（單實例足夠；未來分布式可換 Redis）
- [ ] 步驟 3：超限返回 429 + `Retry-After` header

### 任務 2：掛載至 login 路由
- [ ] 步驟 1：`routes/auth.ts` login handler 前置 `ipLimiter` → `userLimiter`
- [ ] 步驟 2：確保僅失敗計數，成功登錄重置（用 `skipSuccessfulRequests`）
- [ ] 步驟 3：429 響應渲染 login 頁，附「請稍後再試」提示

### 任務 3：測試
- [ ] 步驟 1：單元測試：限制器於閾值觸發 429
- [ ] 步驟 2：集成測試：11 次失敗登錄第 11 次得 429
- [ ] 步驟 3：集成測試：1 次成功登錄不消耗 IP 配額

### 任務 4：文檔
- [ ] 步驟 1：README 「Security」 節提及速率限制行為
- [ ] 步驟 2：AGENTS.md 交接更新

---

## 測試要求

- 新增單元測試 ≥ 4：IP 限、用戶限、成功不計、429 含 Retry-After
- 集成測試 ≥ 2
- 全套件綠：34+ auth / 157 webclient / 19 video-bridge

## 已知風險／決策

- Memory store 重啟即失，攻擊者重啟服務可重置——接受，OS 級保護由運維承擔
- 用戶名級限制可被用戶名探測誤觸發 DoS：選溫和限制（5/分），合法登錄罕難超限
- 不對 change-password 端點限速——已要求活躍 session
