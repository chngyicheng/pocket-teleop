# 會話錄制／回放實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 服務器端錄 twist 指令 + 視頻流（MediaMTX recordings），存 `/data/recordings`。UI 列出歷史會話、下載。

**動機：** 事故復盤、訓練、操作員考核。今無記錄，事後僅能憑記憶。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `server/include/teleop_server.hpp` | 加可選 recording_path 參數 |
| `server/src/teleop_server.cpp` | 連接時開 .twist 文件，每 twist 寫一行（時戳 + 值） |
| `mediamtx.yml` | 加 `record: yes` 與 `recordPath: /data/recordings/...` |
| `auth-server/src/routes/recordings.ts` | 新建：列出、下載 |
| `auth-server/src/app.ts` | 掛載 /recordings 路由 |
| `auth-server/test/recordings.test.ts` | 新建 |
| `web-client/index.html` | 加「歷史」頁，列會話與下載連接 |
| `docker-compose.yml` | 共享卷 `recordings` |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：服務器端 twist 錄製
- [ ] 步驟 1：teleop_server 加 recording_path 參數；連接時開 `${path}/${session_id}.twist`
- [ ] 步驟 2：每 on_message 處理後寫 `${unix_ms}\t${lx}\t${ly}\t${az}\n`
- [ ] 步驟 3：on_close 時關文件
- [ ] 步驟 4：補 C++ 測試

### 任務 2：MediaMTX 視頻錄制
- [ ] 步驟 1：mediamtx.yml 加 `record: yes`，segment 1 分鐘 .ts 文件
- [ ] 步驟 2：docker-compose 加共享卷 `/data/recordings`
- [ ] 步驟 3：手動驗證：操作後 .ts 文件生成

### 任務 3：auth-server 路由
- [ ] 步驟 1：`/recordings` GET 返 JSON 列表（session_id, timestamp, duration, size）
- [ ] 步驟 2：`/recordings/:id/twist` 下載 twist 文件
- [ ] 步驟 3：`/recordings/:id/video` 下載 .ts 文件
- [ ] 步驟 4：認證：require 登錄
- [ ] 步驟 5：補集成測試

### 任務 4：UI 歷史頁
- [ ] 步驟 1：index.html 加路由 `/history`，列出
- [ ] 步驟 2：每行：日期、時長、大小、下載按鈕
- [ ] 步驟 3：刪除按鈕（DELETE 端點）

### 任務 5：清理策略
- [ ] 步驟 1：保留期 env 變量（默認 7 日）
- [ ] 步驟 2：auth-server 啟動時掃 recordings 刪過期
- [ ] 步驟 3：磁盤滿時拒新錄並警告

### 任務 6：文檔與交接
- [ ] 步驟 1：README 錄製存儲位置與保留期
- [ ] 步驟 2：AGENTS.md

---

## 測試要求

- C++ server 補 ≥ 3
- auth-server 補 ≥ 5
- 全套件綠

## 已知風險／決策

- 視頻錄占磁盤大：默認 7 日保留，可配
- twist 文件純文本利於分析；二進制可後續優化
- 不錄音頻（無音頻流暫無）；audio-bidirectional 計劃實後可擴
- 回放 UI 不在此範圍——下載後本地播放器看


---

## 重核附則（2026-06-15）— 對現碼校驗

- **文件引用皆存**：本計劃所引諸源文件今仍在，無改名/刪除。
- **React 遷移（關鍵 staleness）**：UI 任務原指 `web-client/index.html`（今僅 44 行 React 掛載點 `<div id="root">` + `/src/main.tsx`）；UI 須改置 React——`web-client/src/views/MissionControl.tsx`、`MissionTablet.tsx`、`web-client/src/components/`。框架無關之邏輯層（`protocol.ts`/`teleop_client.ts`/`settings.ts`、server C++）仍有效。
- **可復用基建**：`auth-server/src/app.ts` 現存；server 端為主，錄製控制 UI 置 React。
