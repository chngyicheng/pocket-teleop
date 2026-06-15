# OTA 遠程更新機制實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** UI 加「檢查更新」按鈕，比對本地與 Git remote 版本；用戶確認後執行 `git pull && docker compose up --build -d`。

**動機：** 今更新須 SSH。野外或無遠程訪問時無法升級。Web UI 觸發更新降低運維門檻。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `auth-server/src/routes/updates.ts` | 新建：check、apply 端點 |
| `auth-server/src/app.ts` | 掛載 |
| `auth-server/test/updates.test.ts` | 新建 |
| `web-client/index.html` | 設置加「更新」節 |
| `update.sh` | 新建：拉代碼、重建、重啟 |
| `docker-compose.yml` | auth-server 掛載 docker.sock 與 git 工作樹（用於更新） |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：update.sh 腳本
- [ ] 步驟 1：腳本：cd 至工作樹、`git fetch`、比 HEAD vs origin/main、若有更新 `git pull && docker compose up --build -d`
- [ ] 步驟 2：日誌寫 `/data/update.log`
- [ ] 步驟 3：原子性：失敗時不破壞當前運行（藍綠或先 build 後 swap）

### 任務 2：auth-server 路由
- [ ] 步驟 1：`/updates/check` GET：返 `{currentSha, remoteSha, behind, behindCommits}`
- [ ] 步驟 2：`/updates/apply` POST：觸發 update.sh（後台），返 job id
- [ ] 步驟 3：`/updates/status/:jobId` GET：返進度與日誌尾部
- [ ] 步驟 4：認證：require 登錄
- [ ] 步驟 5：補集成測試

### 任務 3：UI 設置節
- [ ] 步驟 1：設置加「軟件版本」面板，顯示當前 SHA
- [ ] 步驟 2：「檢查更新」按鈕 → /updates/check
- [ ] 步驟 3：有更新時「應用更新」按鈕 → 確認對話框 → /updates/apply
- [ ] 步驟 4：進度面板輪詢 status

### 任務 4：docker-compose 變更
- [ ] 步驟 1：auth-server 掛 `/var/run/docker.sock`（執 docker compose）與 git 工作樹
- [ ] 步驟 2：注意安全：docker.sock 暴露 = root 等價；限授權用戶
- [ ] 步驟 3：補 README 安全警告

### 任務 5：rollback
- [ ] 步驟 1：「rollback」按鈕：`git reset --hard HEAD~1 && docker compose up -d`
- [ ] 步驟 2：限最近一次更新窗口（24 小時）
- [ ] 步驟 3：補測

### 任務 6：文檔
- [ ] 步驟 1：README OTA 用法與安全注意
- [ ] 步驟 2：AGENTS.md

---

## 測試要求

- auth-server 補 ≥ 5
- 手動驗：實際更新流程
- 全套件綠

## 已知風險／決策

- docker.sock 暴露為大攻擊面——僅授權 admin 角色可訪 /updates 端點
- 更新中 auth-server 自身被重啟——客戶端 UI 須 reconnect 處理
- rollback 限定 git 樹乾淨；衝突時拒絕並警告
- 不支持自動更新（須用戶觸發）——避免意外升級


---

## 重核附則（2026-06-15）— 對現碼校驗

- **文件引用皆存**：本計劃所引諸源文件今仍在，無改名/刪除。
- **React 遷移（關鍵 staleness）**：UI 任務原指 `web-client/index.html`（今僅 44 行 React 掛載點 `<div id="root">` + `/src/main.tsx`）；UI 須改置 React——`web-client/src/views/MissionControl.tsx`、`MissionTablet.tsx`、`web-client/src/components/`。框架無關之邏輯層（`protocol.ts`/`teleop_client.ts`/`settings.ts`、server C++）仍有效。
- **可復用基建**：`auth-server/src/app.ts` 現存；**無 React staleness**，然 OTA over Docker-Compose 為 15 中最重之設計項。
