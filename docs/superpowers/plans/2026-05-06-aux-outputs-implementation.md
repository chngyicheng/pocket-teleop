# 輔助輸出（燈／喇叭）按鈕實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** UI 加可配置按鈕陣列，每按鈕發布至 ROS topic（std_msgs/Bool 或 String），用於燈、喇叭、繼電器等輔助輸出。

**動機：** 機器人常有 GPIO 控件（前燈、警示燈、喇叭、夾爪 open/close）。今無接口，須重編控制節點。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `server/src/teleop_node.cpp` | 動態 publisher 池：按配置創建 N 個 publisher |
| `server/src/teleop_server.cpp` | command_handler 加 AuxCommand |
| `server/src/command_handler.cpp` | 解析 aux 消息 |
| `web-client/src/protocol.ts` | 加 buildAux |
| `web-client/src/teleop_client.ts` | sendAux(name, value) |
| `web-client/src/settings.ts` | 加 `auxButtons: AuxButtonConfig[]` |
| `web-client/index.html` | 渲染按鈕陣列（依配置） |
| `data-schema.md` | 加 AuxCommand |
| `AGENTS.md` | 交接 |

---

## 任務

### 任務 1：服務器配置與發布
- [ ] 步驟 1：teleop_node ROS 參數 `aux_topics` 為字符串列表（如 `["lights:bool", "horn:bool", "gripper:string"]`）
- [ ] 步驟 2：構造時 parse 並創建對應 publisher
- [ ] 步驟 3：command_handler 加 AuxCommand 類型 `{type:"aux", name, value}`
- [ ] 步驟 4：teleop_server 收 AuxCommand → 找對應 publisher 發布
- [ ] 步驟 5：補 C++ 測試 ≥ 3

### 任務 2：協議
- [ ] 步驟 1：protocol.ts buildAux(name, value)
- [ ] 步驟 2：TeleopClient.sendAux
- [ ] 步驟 3：補測

### 任務 3：客戶端配置與 UI
- [ ] 步驟 1：settings 加 auxButtons 配置（label, topic, type, momentary/toggle）
- [ ] 步驟 2：index.html 渲按鈕陣列
- [ ] 步驟 3：momentary：按下發 true，鬆開發 false；toggle：點擊翻轉

### 任務 4：服務器告知客戶端可用 aux
- [ ] 步驟 1：status 消息加 `aux_topics: AuxConfig[]`
- [ ] 步驟 2：客戶端 onStatus 自動填充 settings.auxButtons（若空）
- [ ] 步驟 3：用戶可改 label

### 任務 5：文檔
- [ ] 步驟 1：data-schema.md
- [ ] 步驟 2：README 配置示例
- [ ] 步驟 3：AGENTS.md

---

## 測試要求

- C++ server 補 ≥ 3
- protocol 補 ≥ 2
- settings 補 ≥ 2
- 全套件綠

## 已知風險／決策

- 動態 publisher：須 ROS2 支持運行時創建（rclcpp 支持）
- 按鈕安全：toggle 類默認應為「關」
- 不限按鈕數量但 UI 上限約 8（手機屏寬限）
- 命令注入：name 須在配置白名單內，server 拒未知 name


---

## 重核附則（2026-06-15）— 對現碼校驗

- **文件引用皆存**：本計劃所引諸源文件今仍在，無改名/刪除。
- **React 遷移（關鍵 staleness）**：UI 任務原指 `web-client/index.html`（今僅 44 行 React 掛載點 `<div id="root">` + `/src/main.tsx`）；UI 須改置 React——`web-client/src/views/MissionControl.tsx`、`MissionTablet.tsx`、`web-client/src/components/`。框架無關之邏輯層（`protocol.ts`/`teleop_client.ts`/`settings.ts`、server C++）仍有效。
- **可復用基建**：同 ptz——`command_handler`/`protocol`/`teleop_client` 現存；toggle UI 置 React。
