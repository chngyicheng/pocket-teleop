# 預設動作宏實現計劃

> **致代理工作者：** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任務實現。

**目標：** UI 可保存命令序列（如「前進 2 秒 → 左轉 90° → 前進 1 秒」），按鈕一鍵執行。

**動機：** 重複任務（巡邏路線、停泊位、回站）每次手動操作費力。宏縮短動作序列至一鍵。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `web-client/src/macros.ts` | 新建：宏執行引擎 |
| `web-client/src/settings.ts` | 加 `macros: Macro[]` |
| `web-client/test/macros.test.ts` | 新建 |
| `web-client/index.html` | 宏按鈕陣列；編輯模態 |
| `AGENTS.md` | 交接 |

**注：** 純客戶端執行，無服務器改動。每步發 twist 維持原 watchdog 機制。

---

## 任務

### 任務 1：Macros 模塊
- [ ] 步驟 1：`Macro = { name, steps: Step[] }`，`Step = { lx, ly, az, durationMs }` 或 `{ wait: ms }` 或 `{ aux: name, value }`
- [ ] 步驟 2：MacroRunner 類：`run(macro, teleopClient): Promise`，逐步執行
- [ ] 步驟 3：執行中可中止（abort 信號）
- [ ] 步驟 4：補測 ≥ 6

### 任務 2：settings 持久化
- [ ] 步驟 1：settings 加 macros 列表
- [ ] 步驟 2：save/load JSON 序列化
- [ ] 步驟 3：補測

### 任務 3：UI 按鈕陣列
- [ ] 步驟 1：頂部欄加宏按鈕（每宏一鈕）
- [ ] 步驟 2：點擊執行；執行中顯示進度與「停止」按鈕
- [ ] 步驟 3：任何輸入（搖桿、鍵盤）自動中止宏

### 任務 4：宏編輯器
- [ ] 步驟 1：模態列出步驟，可加/刪/重排
- [ ] 步驟 2：「錄制」按鈕：開始錄，記錄後續操作至「停止錄」
- [ ] 步驟 3：保存與重命名

### 任務 5：安全
- [ ] 步驟 1：執行宏時 e-stop 按鈕仍即時生效
- [ ] 步驟 2：連接斷開自動中止宏
- [ ] 步驟 3：宏執行期間 UI 醒目橫幅警告

### 任務 6：文檔
- [ ] 步驟 1：README 宏用法
- [ ] 步驟 2：AGENTS.md

---

## 測試要求

- macros 模塊測試 ≥ 8（執行、中止、錄制、序列化）
- settings 補 ≥ 2
- 全套件綠

## 已知風險／決策

- 純開環時序執行；不查 odom 是否到達——簡單但易漂移
- 宏執行為「自動駕駛」狀態，安全責任移至宏設計者；UI 警告不可省
- 不支持條件分支（if/else）或循環——保持簡單
- 任何手動輸入立即中止——避免衝突


---

## 重核附則（2026-06-15）— 對現碼校驗

- **文件引用皆存**：本計劃所引諸源文件今仍在，無改名/刪除。
- **React 遷移（關鍵 staleness）**：UI 任務原指 `web-client/index.html`（今僅 44 行 React 掛載點 `<div id="root">` + `/src/main.tsx`）；UI 須改置 React——`web-client/src/views/MissionControl.tsx`、`MissionTablet.tsx`、`web-client/src/components/`。框架無關之邏輯層（`protocol.ts`/`teleop_client.ts`/`settings.ts`、server C++）仍有效。
- **可復用基建**：邏輯有效；macro 按鈕置 React（非 index.html）。
