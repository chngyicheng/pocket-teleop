# Apply 按鈕端到端驗證計劃

> **致代理：** 必用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。步驟以 `- [ ]` 標記追蹤。

**目標：** 驗證 VideoSourcePicker「Apply」按鈕之請求確實抵達真實 MediaMTX 實例並修改路徑配置。現有測試均以 mock 代替 MediaMTX，無法捕獲代理鏈傳輸層缺陷。

**背景：** `/mediamtx-api` 代理鏈歷經多次修復（body-parser 消耗請求流、`req.url` 被 http-proxy-middleware 覆蓋、`pathRewrite` 順序錯誤）。Mock 對上述缺陷皆視而不見。真實 MediaMTX 端點方能在傳輸層捕獲回歸。

---

## 架構

```
mediamtx-integration-test service:
  auth-server（host network）→ 真實 mediamtx 容器 → /v3/config/paths/cam
```

MediaMTX 暴露 `:9997` 配置 API；RTSP/WebRTC 等媒體服務不需要啟用。

測試流程：
1. POST `/auth/login` 取得 session cookie
2. PATCH `/mediamtx-api/config/paths/add/cam` 設置 `source` 為測試 RTSP URL
3. GET `/mediamtx-api/config/paths/get/cam` 斷言 `source` 字段與輸入一致
4. 驗證無 session 時返回 302 重定向至登錄頁

---

## 文件映射

### 新增文件

| 文件 | 用途 |
|---|---|
| `mediamtx-test-config.yml` | 測試用最小 MediaMTX 配置（僅啟用 API，關閉所有媒體服務） |
| `auth-server/test/mediamtx_integration.test.ts` | 集成測試：login → PATCH → GET → 斷言 |

### 修改文件

| 文件 | 變更 |
|---|---|
| `docker-compose.yml` | 增加 `mediamtx-test` 服務（`integration` profile）及 `mediamtx-integration-test` 服務 |
| `AGENTS.md` | 標記「Apply 按鈕運行時驗證」未竟事項為已解決 |

---

## 任務一 — MediaMTX 測試配置與 compose 服務

**文件：** `mediamtx-test-config.yml`、`docker-compose.yml`

**目標：** 以 `integration` docker-compose profile 啟動最小 MediaMTX，僅開放 `:9997` 配置 API；為 `mediamtx-integration-test` 服務配置環境變量 `MEDIAMTX_API_URL=http://localhost:9997`，使 auth-server 代理指向此實例。`mediamtx-integration-test` 服務須 `depends_on` `mediamtx-test` 健康狀態。

驗收：`docker compose --profile integration up mediamtx-test` 啟動後，`curl http://localhost:9997/v3/config/global/get` 返回 200。

- [ ] 創建 `mediamtx-test-config.yml`（關閉 RTSP/RTMP/HLS/WebRTC/SRT，僅啟用 API）
- [ ] 在 `docker-compose.yml` 增加 `mediamtx-test` 服務，`profile: integration`，host 網絡，掛載上述配置，配健康檢查
- [ ] 在 `docker-compose.yml` 增加 `mediamtx-integration-test` 服務，運行 auth-server 的 vitest 測試，依賴 `mediamtx-test` healthy

---

## 任務二 — 集成測試

**文件：** `auth-server/test/mediamtx_integration.test.ts`

**目標：** 三個測試用例：

1. PATCH 設置 source → GET 確認 source 字段與輸入一致（200 往返）
2. 無 session PATCH → 302 重定向
3. PATCH 無效 JSON body → 不崩潰（400 或代理轉發錯誤均可）

所有測試在 `beforeAll` 中登錄取得 cookie。`MEDIAMTX_API_URL` 從環境變量讀取，默認 `http://localhost:9997`。

驗收：`docker compose --profile integration up --build --abort-on-container-exit mediamtx-integration-test` 3 tests pass，0 failures。

- [ ] 寫 `mediamtx_integration.test.ts`，三個測試用例
- [ ] 於 `auth-server/vitest.config.ts` 確認 `include` glob 覆蓋此文件（或已覆蓋）
- [ ] 運行集成測試，確認全通

---

## 任務三 — AGENTS.md 更新

- [ ] 交接狀態移除「Apply 按鈕運行時驗證尚未完成」
- [ ] 更新 Head SHA
- [ ] 提交：`test(auth-server): add MediaMTX e2e integration test for Apply button`
