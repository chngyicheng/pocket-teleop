# 速度上限滑桿實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 設置欄加滑桿（10%–100%），即時乘所有 twist 之線速與角速，提供軟性速度上限。

**動機：** 新手或近障時應降速。今全速控不可調，誤操作後果重。一行 UI 換大量安全。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `web-client/src/settings.ts` | 加 `speedLimit: number`（0.1–1.0） persist localStorage |
| `web-client/src/teleop_client.ts` | sendTwist 內乘 speedLimit |
| `web-client/test/settings.test.ts` | 補測 speedLimit 持久 |
| `web-client/test/teleop_client.test.ts` | 新建：speedLimit 0.5 時 twist 減半 |
| `web-client/index.html` | 設置欄加 `<input type="range">` + 數值顯示；綁定至 settings |
| `AGENTS.md` | 交接更新 |

---

## 任務

### 任務 1：settings 加 speedLimit
- [ ] 步驟 1：`Settings` 接口加 `speedLimit: number`，默認 1.0
- [ ] 步驟 2：load/save 包含 speedLimit；驗證範圍 [0.1, 1.0]
- [ ] 步驟 3：補測 settings.test.ts：默認、保存、加載、超範圍 clamp

### 任務 2：teleop_client 應用速度限
- [ ] 步驟 1：TeleopClient 構造加 `speedLimit?: number` 選項，默認 1.0
- [ ] 步驟 2：sendTwist 之 lx/ly/az 各乘 speedLimit
- [ ] 步驟 3：加 setSpeedLimit setter 用於運行時改

### 任務 3：UI 滑桿
- [ ] 步驟 1：index.html 設置欄加滑桿，min=0.1 max=1.0 step=0.05
- [ ] 步驟 2：旁顯示百分比（"50%"）
- [ ] 步驟 3：input 事件即時調 `teleopClient.setSpeedLimit(val)` 並 `settings.save()`

### 任務 4：測試與文檔
- [ ] 步驟 1：teleop_client 測試：setSpeedLimit 後 sendTwist 縮放
- [ ] 步驟 2：README 提及速度滑桿用法
- [ ] 步驟 3：AGENTS.md 交接更新

---

## 測試要求

- settings.test.ts 補 ≥ 3
- teleop_client 測試補 ≥ 2
- 全套件綠

## 已知風險／決策

- 限制僅客戶端應用——服務器仍接全速指令；惡意客戶端可繞。接受：teleop 信任 session
- 0.1 為下限（10%）——更低易致機器人停滯；用戶仍可徑直 e-stop
- 不影響 e-stop（直發 0,0,0）
