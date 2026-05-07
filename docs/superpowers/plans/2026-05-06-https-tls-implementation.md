# HTTPS/TLS 實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 公網部署時於 8080 前置 TLS 終端，session cookie 加 `secure` 旗，所有 HTTP 流量加密。

**動機：** 今 cookie 僅 `httpOnly + sameSite:lax`，無 `secure`。手機公網用，憑據與 session 可被截。WebSocket 走 `ws://`，twist 與視頻控制亦明文。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `docker-compose.yml` | 加 `caddy` 服務，反代 8080 → 443/80（含 ACME） |
| `Caddyfile` | 新建：自動 Let's Encrypt 或自簽證書 |
| `auth-server/src/app.ts` | session cookie 加 `secure: true`（生產時） |
| `auth-server/src/index.ts` | `trust proxy` 設為 1，使 cookie 識 X-Forwarded-Proto |
| `auth-server/test/app.test.ts` | 補測 cookie secure 旗 |
| `.env.example` | 加 `TLS_DOMAIN`（公網域名）、`TLS_MODE`（auto/self/off） |
| `README.md` | 加「啟用 HTTPS」節 |
| `AGENTS.md` | 交接更新 |

---

## 任務

### 任務 1：加 Caddy 反向代理服務
- [ ] 步驟 1：寫 `Caddyfile`，三模式：`auto`（Let's Encrypt）、`self`（自簽 internal）、`off`（純 HTTP 開發）
- [ ] 步驟 2：`docker-compose.yml` 加 `caddy` 服務，掛 `Caddyfile` 與 `caddy_data` 卷
- [ ] 步驟 3：將 auth-server 8080 端口移至 loopback（127.0.0.1:8080），caddy 取 443/80 為公網

### 任務 2：cookie secure 旗 + trust proxy
- [ ] 步驟 1：`app.ts` cookie 配置加 `secure: process.env.NODE_ENV === 'production'`
- [ ] 步驟 2：`index.ts` 加 `app.set('trust proxy', 1)`，使 Caddy 之 `X-Forwarded-Proto: https` 生效
- [ ] 步驟 3：補測：mock `X-Forwarded-Proto: https`，驗 Set-Cookie 含 `Secure`

### 任務 3：自簽證書回退路徑
- [ ] 步驟 1：Caddyfile 之 `self` 模式用 `tls internal`（Caddy 自管 CA）
- [ ] 步驟 2：README 注「首次訪問需信任自簽 CA」流程
- [ ] 步驟 3：手機端說明：iOS/Android 安裝 root CA

### 任務 4：文檔與環境
- [ ] 步驟 1：`.env.example` 加變量並注釋
- [ ] 步驟 2：README 加「啟用 HTTPS」節，含三模式選擇
- [ ] 步驟 3：AGENTS.md 交接更新

---

## 測試要求

- auth-server 測試補：cookie secure 旗於 X-Forwarded-Proto:https 時設置
- 手動驗：`auto` 模式公網域名取 Let's Encrypt 證書成功
- 手動驗：`self` 模式手機端可訪問且 WebSocket 升級成功
- 全套件綠：34 auth / 157 webclient / 19 video-bridge

## 已知風險／決策

- Let's Encrypt 速率限制：dev 用 staging endpoint
- 自簽證書 WebSocket 不被瀏覽器接受除非用戶顯式信任根 CA
- 不破壞純 HTTP 模式，便於本地開發
