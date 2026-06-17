# 輸入仲裁實現計劃（input arbitration）

> **致代理工作者：** 用 superpowers:subagent-driven-development 逐任務實現。每任務一 worktree branch，鏈式相承，末了一併 merge。

**目標：** 多輸入源（gamepad／keyboard／touch）並存時，唯一源主宰機器人，互不相爭。仲裁置於唯一彙流點 `TeleopClient.sendTwist`。

**動機：** 今 gamepad（`GamepadHandler.onTwist`）與 touch（`bridge.sendTwist`）皆無條件呼 `TeleopClient.sendTwist`，continuous publisher 復其末值（`repeatTwist`），二源交替覆寫 → 互爭奪控。實機表現：搖桿與觸屏同時生效，機器人抖擺。

**仲裁模型（要義）：** 「現役源主之，priority 唯破同時」。

- priority：gamepad `3` > keyboard `2` > touch `1`。
- 現役（active）＝某源於 `ACTIVE_WINDOW_MS` 內曾發輸入。
- **非** 嚴格靜態優先：連而閒之 gamepad（搖桿歸中、送零）不得鎖死 touch。要點在「連續送零之 owner 每次即釋 ownership」，故閒置高源不擋低源。

---

## 影響範圍

| 文件 | 變更 |
|---|---|
| `web-client/src/teleop_client.ts` | `sendTwist` 增 `source` 參；仲裁狀態 `activeSource`/`lastActiveAt`；priority map；`onTwist` callback 加 `source` 且唯 accepted 方發；（末務）建 `KeyboardHandler` |
| `web-client/src/hooks/useTeleopBridge.ts` | touch path 傳 `'touch'`；HUD `inputSource` 改取仲裁之 active source（去舊 recency interval）；`gamepadTwist` 取自帶 source 之 `onTwist` |
| `web-client/src/keyboard_handler.ts` | （末務）editable-field 守衛 |
| `web-client/test/*` | 新測 |
| `AGENTS.md`／`web-client/AGENTS.md`／`milestones.md`／`deviations.md` | 交接 + 契約 |

---

## 任務

### 任務一：仲裁核心於 TeleopClient

- [ ] 步驟一：定 `type InputSource = 'gamepad' | 'keyboard' | 'touch'`；priority map（gamepad 3、keyboard 2、touch 1）；常數 `ACTIVE_WINDOW_MS`（取 `400`）。
- [ ] 步驟二：`sendTwist` 增末參 `source: InputSource`，默認 `'touch'`（保既有 caller 不破）；`GamepadHandler` 之 `onTwist` 接線改傳 `'gamepad'`。
- [ ] 步驟三：private 仲裁狀態 `activeSource: InputSource | null`（初 null）、`lastActiveAt: number`（初 0）。
- [ ] 步驟四：仲裁規則，置於既有 e-stop 早返之後、input shaping 之前。先判入為零否（三軸皆零即「釋」）：
  - **非零入**：令 `owner = activeSource`。
    - 若 `owner` 為 null，或 `now - lastActiveAt ≥ ACTIVE_WINDOW_MS`（owner 已閒）→ `source` 取得 ownership。
    - 否則若 `source === owner` → 續持。
    - 否則若 `priority(source) ≥ priority(owner)` → `source` 奪 ownership（同級亦奪，最新者勝）。
    - 否則（priority 低且 owner 仍現役）→ **棄**：即 return，不送、不更 `repeatTwist`、不發 `onTwist`。
    - 凡取得／續持／奪者：`activeSource = source`、`lastActiveAt = now`，續行原 shaping + send + repeatTwist 邏輯。
  - **零入（釋）**：
    - 若 `source === owner` → 照送（觸發既有 zero-burst 停車），並釋 ownership（`activeSource = null`）。
    - 否則 → **棄**（低源之釋不得停高源之動，如 touch 鬆指不得令 gamepad 停）。
- [ ] 步驟五：`onTwist` callback 簽名加 `source: InputSource`，且唯 accepted（未被棄）方發（HUD 方顯真正主控源之值）。
- [ ] 步驟六：`connect()` 與 `reconnectNow()` 重置 `activeSource = null`、`lastActiveAt = 0`（重連不續舊主）。
- [ ] 步驟七：補測（≥6）—— 仲裁矩陣：gamepad 非零奪 touch；touch 於 gamepad 閒（逾 window）後得控；同源續持刷新；owner 釋後低源即可得；低源零不停 owner；priority 同級最新者勝。

### 任務二：touch 接線 + HUD 源一統

- [ ] 步驟一：`useTeleopBridge` 之 `sendTwist` 呼 `clientRef.current.sendTwist(lx, ly, az, 'touch')`。
- [ ] 步驟二：去 bridge 中以 `lastGamepadActivityRef`/`lastTouchActivityRef` 算 `inputSource` 之 recency idle interval。改：`TeleopClientOptions` 增 `onInputSource?: (source: InputSource | 'idle') => void`，`TeleopClient` 於 `activeSource` 變時發之（含轉 `'idle'`，即 owner 釋為 null 時）；bridge 之 `inputSource` state 直取自此 callback。
- [ ] 步驟三：`gamepadTwist`（HUD VelBars）—— `onTwist` 既帶 source，bridge 唯 `source === 'gamepad'` 時更 `gamepadTwist`，去既有 `ACTIVITY_WINDOW` 推算法。
- [ ] 步驟四：補測（≥3）—— bridge：gamepad 動則 `inputSource==='gamepad'`；touch 動則 `'touch'`；皆閒則 `'idle'`。注既有 `useTeleopBridge.test.tsx` 之 `FakeTeleopClient` 須補 `sendTwist` 之 source 參與 `onInputSource` 之驅動（vitest 為綠之 gate，tsc 非 gate）。

### 任務三（末務）：re-wire keyboard

> 此務最後行，獨立可棄。keyboard 今未接於 UI（`KeyboardHandler` class 在，wiring 無）。Space-estop 由 views（`MissionControl`/`MissionTablet` 之 keydown effect）自掌，與此無涉——`KeyboardHandler` 不理 Space。

- [ ] 步驟一：`keyboard_handler.ts` 之 `boundKeyDown`/`boundKeyUp` 加 editable-field 守衛——若 `document.activeElement` 為 input／textarea／select 或 `isContentEditable`，則略過該鍵（免於填 robot name／RTSP URL 等欄時 WASD 誤駛機器人）。仿 views 既有 Space-estop 之 focus 守衛。
- [ ] 步驟二：`TeleopClient` ctor 建 `KeyboardHandler`（倣 `GamepadHandler` 之生命週期）：`onTwist` → `this.sendTwist(lx, ly, az, 'keyboard')`；`connect()`/`reconnectNow()` → `keyboard.start()`/`setEnabled(true)`；`onClose`/`handlePongTimeout` → `setEnabled(false)`；`disconnect()` → `keyboard.stop()`。
- [ ] 步驟三：補測（≥4）—— WASD → twist 標 `'keyboard'`；editable field focus 時 WASD 不送；gamepad 同時動則 keyboard 讓（priority 3 > 2）；keyboard 動則勝 touch（2 > 1）。

### 任務四：文檔

- [ ] 步驟一：root `AGENTS.md` handover（LATEST + Test baseline）；`web-client/AGENTS.md` 加仲裁 Local Contract（單一彙流點、現役源主之、priority 破同時）；`milestones.md` 增行；`deviations.md` 錄非顯之決（active-source 而非嚴格靜態優先、低源零不停高源）。

---

## 測試要求

- 全套件綠，baseline **768 / 96 / 20 / 88** 不退。
- 新測：arbiter ≥ 6、bridge ≥ 3、keyboard ≥ 4。

## 已知風險／決策

- `ACTIVE_WINDOW_MS` 取 `400`（與既有 `IDLE_MS` 同感）。過短則持桿而靜（touch 指不動、無新 pointermove）之 owner 失 ownership，致高源微漂奪控；過長則切源遲鈍。publisher 仍以末 accepted 值續送，故 window 內無控制空窗。
- 連而閒之 gamepad 每幀送零 → 每幀釋 ownership → 不鎖 touch（**核心取捨**）。此勝嚴格靜態優先（彼令僅配對而未動之手柄即殺觸屏）。
- keyboard velocity（`KeyboardHandler` 默認 0.5）未動；Space-estop 留 views 掌，re-wire 不涉。
- 任務三可獨立棄置而任務一二仍成立（gamepad-vs-touch 即活 bug）。

---

## 補遺 — 執行法度，凡務皆遵（不得違）

1. **trophy TDD**：先紅後綠。TS 純函數／class＝vitest 單測；hook／component＝RTL + jsdom。
2. **git worktree 一務一樹，branch 鏈式**：務一自 `main` 分；每後務自前務之 branch 分。終端一次 merge 入 `main`，非每務一 merge。樹中 docker 須 `--env-file /home/chngyicheng/pocket-teleop/.env`。
3. **Haiku 子代役之，prompt 以 caveman wenyan-ultra**（English technical terms 留 English）；code／commit／test 名用 normal English。
4. **子代不得 commit、不得 stage、不得行任何 git；不得改所司以外之檔**。prompt 必書「do not stage or commit; leave changes in the working tree and report」「on permission denial, stop and report」。留 dirty tree 而報。控者審 `git status`（main repo 與 worktree 兩處——cwd-pinning gotcha）、explicit path stage、commit。
5. **docker 測必 `--build --no-deps`**（免 port 衝突，沿用主 stack）：`cd <worktree> && docker compose -p <uniq> --env-file /home/chngyicheng/pocket-teleop/.env --profile test run --rm --build --no-deps webclient-test`。樹移前 chown 還 root-owned `node_modules`（若有）。
6. **收束**：測綠（baseline 768/96/20/88 不退）→ 控者更 AGENTS.md handover + 契約 → commit（code + doc 同）→ 問操作者方 push／merge。
