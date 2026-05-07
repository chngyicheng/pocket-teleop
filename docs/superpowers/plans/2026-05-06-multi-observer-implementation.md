# 多觀察者模式實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 服務器允許多個只讀 WebSocket 訂閱（觀察者），收狀態與遙測但無控制權。一名操作員，多名觀察者。

**動機：** 訓練、遠程協助、上級監督場景。今單操作員獨佔，無人可旁觀。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `server/include/teleop_server.hpp` | 區分 active_client（一）與 observers（多） |
| `server/src/teleop_server.cpp` | on_open 接受多觀察者；on_message 觀察者發送被忽略並警告 |
| `server/src/command_handler.cpp` | 加 OBSERVE 命令類型 |
| `web-client/src/protocol.ts` | 加 observe 消息 + role 字段 status 回應 |
| `web-client/src/teleop_client.ts` | 加 observeMode 選項；觀察者不啟用 keepalive twist |
| `web-client/index.html` | 設置加「觀察者模式」開關；UI 觀察狀態指示 |
| `auth-server/src/routes/auth.ts` | 加角色概念（admin/operator/observer），observer 登錄走 /auth/observe |
| `data-schema.md` | 更新協議 |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：服務器端角色區分
- [ ] 步驟 1：on_open 後 client 須首發 `{type:"hello", role:"operator"|"observer"}`
- [ ] 步驟 2：operator：若 has_active_client 拒絕；否則設為 active；observers list 加之
- [ ] 步驟 3：observer：直接加入 observers list，無上限或限 N
- [ ] 步驟 4：補 C++ 測試

### 任務 2：消息分發
- [ ] 步驟 1：broadcast 發送至 active + 所有 observers
- [ ] 步驟 2：on_message：observer 發 twist 被忽略並回 error
- [ ] 步驟 3：observer 可發 ping（用於 keepalive）
- [ ] 步驟 4：補 C++ 測試

### 任務 3：客戶端集成
- [ ] 步驟 1：TeleopClient 加 `role: 'operator' | 'observer'`，連接後發 hello
- [ ] 步驟 2：observer 模式 disable sendTwist（拋錯或 noop）
- [ ] 步驟 3：UI 顯示「觀察中（N 名觀察者）」徽章

### 任務 4：認證角色
- [ ] 步驟 1：auth-server 加 observer 用戶類別（憑據文件多用戶）
- [ ] 步驟 2：登錄後 session 含 role
- [ ] 步驟 3：WebSocket upgrade 時注入 role 至 hello

### 任務 5：文檔
- [ ] 步驟 1：data-schema.md 協議更新
- [ ] 步驟 2：README 觀察者用法
- [ ] 步驟 3：AGENTS.md

---

## 測試要求

- C++ server 補 ≥ 5
- protocol 補 ≥ 3
- auth-server 補 ≥ 3
- 全套件綠

## 已知風險／決策

- 多觀察者增加帶寬——限 N=5 默認
- 角色注入需可信路徑：auth-server 注入勝客戶端聲明
- 觀察者無音頻權；視頻同主流訂
- 操作權移交（operator handoff）暫不支持；後續可加
