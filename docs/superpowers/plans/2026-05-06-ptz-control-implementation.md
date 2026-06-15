# PTZ 雲台控制實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** 第二觸摸搖桿（或鍵盤組合）控雲台 pan/tilt，按鈕控 zoom，發布至 `/ptz_cmd`（geometry_msgs/Vector3 或自定義）。

**動機：** 機器人有可動相機時，操作員需獨立控視角。今機器人運動 = 視角變，受限。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `server/src/teleop_node.cpp` | 加 ptz_pub 發 `/ptz_cmd` |
| `server/src/teleop_server.cpp` | command_handler 加 PtzCommand |
| `server/src/command_handler.cpp` | 解析 ptz 消息 |
| `web-client/src/protocol.ts` | 加 buildPtz 消息 |
| `web-client/src/teleop_client.ts` | 加 sendPtz(pan, tilt, zoom) |
| `web-client/src/touch_joystick.ts` | 支持第二搖桿實例 |
| `web-client/src/keyboard_handler.ts` | 加 PTZ 按鍵組合（如 Shift+方向鍵） |
| `web-client/src/gamepad_profiles.ts` | 加 PTZ 按鈕映射（右搖桿） |
| `web-client/index.html` | 第二搖桿 UI，zoom +/- 按鈕；設置開關 |
| `data-schema.md` | 加 PtzCommand 消息 |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：服務器端 PTZ
- [ ] 步驟 1：command_handler 加 PtzCommand 類型，解析 `{type:"ptz", pan, tilt, zoom}`
- [ ] 步驟 2：teleop_node 加 `/ptz_cmd` publisher
- [ ] 步驟 3：teleop_server 收到 PtzCommand 調 ptz_callback
- [ ] 步驟 4：補 C++ 測試 ≥ 3

### 任務 2：協議
- [ ] 步驟 1：protocol.ts 加 buildPtz
- [ ] 步驟 2：TeleopClient.sendPtz
- [ ] 步驟 3：補 protocol 測試

### 任務 3：第二觸摸搖桿
- [ ] 步驟 1：TouchJoystick 已支持多實例；index.html 加右側搖桿 zone
- [ ] 步驟 2：onMove 調 sendPtz(pan, tilt, 0)
- [ ] 步驟 3：補測

### 任務 4：鍵盤 PTZ
- [ ] 步驟 1：KeyboardHandler 加 PTZ 模式（`P` 鍵切換）；Shift+方向鍵 = 雲台
- [ ] 步驟 2：`+`/`-` 鍵 = zoom
- [ ] 步驟 3：補測

### 任務 5：Gamepad PTZ
- [ ] 步驟 1：gamepad_profiles 加右搖桿映射至 PTZ
- [ ] 步驟 2：左/右肩鍵 = zoom in/out
- [ ] 步驟 3：補測

### 任務 6：設置開關
- [ ] 步驟 1：settings 加 `ptzEnabled: boolean`
- [ ] 步驟 2：開關控 UI 元素顯示
- [ ] 步驟 3：AGENTS.md 交接

---

## 測試要求

- C++ server 補 ≥ 3
- protocol 補 ≥ 2
- 各輸入模塊補 ≥ 3
- 全套件綠

## 已知風險／決策

- 機器人無雲台——禁用設置開關，無 UI 元素
- pan/tilt 可為位置或速度命令；選速度（簡單，類似 twist）
- zoom 為比例或步進；選步進（按鈕事件）
- 命名空間：`/ptz_cmd` 默認，可參數化


---

## 重核附則（2026-06-15）— 對現碼校驗

- **文件引用皆存**：本計劃所引諸源文件今仍在，無改名/刪除。
- **React 遷移（關鍵 staleness）**：UI 任務原指 `web-client/index.html`（今僅 44 行 React 掛載點 `<div id="root">` + `/src/main.tsx`）；UI 須改置 React——`web-client/src/views/MissionControl.tsx`、`MissionTablet.tsx`、`web-client/src/components/`。框架無關之邏輯層（`protocol.ts`/`teleop_client.ts`/`settings.ts`、server C++）仍有效。
- **可復用基建**：`command_handler.cpp`/`protocol.ts`/`teleop_client.ts` 現存；PTZ 控制置 React。
