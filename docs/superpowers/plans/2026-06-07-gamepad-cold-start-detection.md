# 手柄冷啟失偵 — 實施之規 (2026-06-07)

> gamepad cold-start detection。一病待治：**冷瀏覽器（gamepad service 未熱）首入本 UI，joystick 與 E-STOP 俱不應；須先入舊 UI（commit `94525ff`）按鍵以暖之，返本 UI 方順。** 既暖則永順，雖 gamepad off/on 反覆亦不失。
> 本規以 wenyan 述之；identifiers、檔名、API 名、commit SHA 留 English。讀者零背景亦可承。無 code block。

---

## 一、緣起 — 操作者所陳

| 項 | 陳述 |
|---|---|
| 病象 | Chrome 與 Brave 皆然：本 UI 冷啟，gamepad joystick 間歇不應、LB 之 E-STOP 亦不應。 |
| 暖機之法 | 另機跑舊版（commit `94525ff`，gamepad 改善前、video lazy-load 前）。先入該舊 UI、按 gamepad 鍵，joystick 即動。返本 UI → 一切順暢。 |
| 暖後之態 | 既暖，本 UI **完美無 jitter**；gamepad 關復開、開復關，仍順。 |

**辨**：暖後完美 → 持桿 jitter（held-stick）已於前番 rAF 改善治竟（見 2026-06-06 規務一/post-merge 務一）。**今之殘病純屬「冷啟之初，browser 未識 gamepad」之 bootstrap 失敗**，與 steady-state 無涉。

## 二、病因勘定 (已驗於 code)

勘 `web-client/src/gamepad_handler.ts`、`teleop_client.ts`、`hooks/useTeleopBridge.ts`，得四因，合而成病：

- **因一 — 偵測繫於 WebSocket 生死，非獨立**：`gamepadHandler.start()` 唯於 `TeleopClient.connect()` 內呼（line 128）；`onClose`（line 87）、`disconnect()`（line 139）、`handlePongTimeout()`（line 285）皆呼 `stop()`。故 gamepad 之 poll 唯 socket open 時行。socket 未開、reconnect 之隙、pong-timeout 之後，poll 全停。**操作者首按 gamepad 鍵之剎那若落此隙，activation 之機即失**。變動 Wi-Fi 上 socket 易 flap → 「間歇」之由。

- **因二 — 全無 `gamepadconnected`／`gamepaddisconnected` listener**：遍 `web-client/src`（含舊 `94525ff`）皆無 `window.addEventListener('gamepadconnected', …)`。偵測純賴 poll loop 之 `navigator.getGamepads()`。標準穩健之式應聽 `gamepadconnected` 事件以握 device 接入之確切時點；本 app 缺之，遂只能被動輪詢，錯失即不復得（直至 reload）。

- **因三 — rAF loop 脆，一擲即死**：新 `start()` 以 `requestAnimationFrame` 驅 poll，且**先 `poll()` 後 `this.rafId = requestAnimationFrame(loop)`**（gamepad_handler.ts line 54–60）。poll() 若擲（某些 gamepad 狀態、profile 取值異常等），則後行之 reschedule 不達，loop **永死**，須整頁 reload 方復。舊版 `setInterval(200)` 縱 poll 擲亦不害下一 tick，能自癒。此即「reload（入舊 UI 再返）後復常」之機。

- **因四 — Gamepad API 之 user-activation／anti-fingerprint 閘**：Chrome（≥81）與 Brave shields 為防 fingerprint，`navigator.getGamepads()` 於 device 經 `gamepadconnected` 派發前回 null；且部分情形須 document 已得真實 user gesture。**browser 之 gamepad service 為 process-global**：任一 page（舊 UI）一旦觸發 device 之 enumeration，該 device 即「熱」於整 browser；本 UI 次載即見之 → 故「舊 UI 暖之，本 UI 即順」「暖後 off/on 反覆亦順」。冷態下本 UI 自身未能完成此 bootstrap，遂困。

**綜病因**：偵測繫於 socket（因一）＋ 無事件 listener（因二）＋ loop 易死不自癒（因三），三者令本 UI **無法於冷態自暖 gamepad service**（因四之 bootstrap）。一旦他途暖之，殘病盡消。

> 注：E-STOP（LB，button 4）冷啟不應，與 joystick 同根 — rising-edge 偵測唯於 poll() 內行，device 未現則無從偵。治偵測即治 E-STOP，無須別治。

## 三、治法綱領 — 使偵測穩健、與連線解耦

核心：**gamepad 偵測恆開，獨立於 WebSocket；唯「送 twist／觸 button action」之行為繫於 connected/enabled。** 並聽標準事件、令 loop 不死、予操作者明確回饋以滿足 user-gesture 之需。

## 四、共通法度 — 凡務皆遵 (不得違)

1. **trophy TDD**：先紅後綠，重 component/integration（RTL＋jsdom）＋ `GamepadHandler` unit。每務先寫紅測，後實作至綠。
2. **git worktree 一務一樹**：controller 為每務建 worktree（branch 自 main 分，置 `.claude/worktrees/<name>`，branch `fix/<name>`）。樹中 docker 測帶 `--env-file /home/chngyicheng/pocket-teleop/.env`。
3. **Haiku 子代以 wenyan-ultra 役之**；English technical terms 留 English；code／commit 文用 normal English。
4. **子代不得 git、不得 commit、不得 stage、不得改所司以外之檔**；唯實作、docker 測、報，留 dirty tree。controller 審 `git status`、依 explicit path stage、commit。
5. **docker 測必 `--build`**（免 stale baked image）；移樹前 chown 還 root-owned `node_modules`：`docker run --rm -v <path>:/w alpine chown -R 1000:1000 /w`。
6. **收束**：測綠 → controller 更 AGENTS.md handover（milestone row、Test baseline）→ commit（code＋doc 同）→ 問操作者方 push／merge。

## 五、諸務 (附序與依賴)

> **依賴**：務一立「偵測解耦＋事件 listener＋loop 自癒」於 `GamepadHandler`，為根本之治，**先行**。務二調 `TeleopClient` 之生命週期接線（賴務一之新 API）。務三為 UX 回饋（賴務一/二既成之偵測狀態）。務四為文檔。**務一、務二同改近鄰，序列為宜，各自前務已 merge 之 main 分枝。**

### 務一 — `GamepadHandler` 偵測解耦、聽事件、loop 自癒

**所司檔**：`web-client/src/gamepad_handler.ts`、`web-client/test/gamepad_handler.test.ts`。

**紅測之旨**（先寫，須紅）：
- poll() 擲一回後，rAF loop **仍續**（次 frame 仍 poll）— 證 try/finally 之自癒。以 fake `requestAnimationFrame` ＋ 令 `onTwist` 擲一次驗之。
- `gamepadconnected` 事件派發 → handler 即取 profile（`matchProfile`）並標記偵得，縱 `start()` 未經 socket 亦然。
- `gamepaddisconnected` → handler 清偵得之態（prevButtons 歸零、profile 視設定保留或清），不擲。
- detection 與 enabled 解耦：`setEnabled(false)` 下仍偵 device、仍報 `onActivity`，唯不呼 `onTwist`／`onButton`（既有行為，補測固之）。

**實作之的**：
- `start()` 之 rAF loop 內 `poll()` 包以 try/finally，reschedule 置 finally，**poll 擲不殺 loop**；setInterval fallback 同理（poll 擲不斷 interval）。
- 構造時（或新 `attach()` 法）即 `window.addEventListener('gamepadconnected', …)` 與 `'gamepaddisconnected', …'`；連上即 `matchProfile` ＋（若未跑）啟 loop。提供對稱 `detach()`／`destroy()` 以除 listener、停 loop，免 React 重掛漏。守 SSR：`typeof window === 'undefined'` 時不掛。
- 暴露 `isConnected()`（或經 callback `onConnectionChange(connected, id)`）供 UI 顯「gamepad 已接」之態 — 為務三鋪路。

**docker `--build` 測**：webclient suite（重 `gamepad_handler.test.ts`），全綠且無回歸。

### 務二 — 偵測恆開，唯「送」繫於連線

**所司檔**：`web-client/src/teleop_client.ts`、`web-client/test/teleop_client*.test.ts`、必要時 `hooks/useTeleopBridge.ts` ＋其測。

**紅測之旨**：
- `onClose`／`handlePongTimeout`／reconnect 之隙，gamepad **偵測不停**（poll 仍行、`gamepadconnected` 仍能握）；唯 `onTwist` 之送被抑（連線斷則不送 cmd_vel）。改以 `setEnabled(false)` 替 `stop()`。
- `connect()` 重入不致重複掛 listener（冪等）。
- `disconnect()`（操作者主動離）方真 `stop()`／`detach()`，除 listener。

**實作之的**：
- 構造 `TeleopClient` 即令 `gamepadHandler` `attach()`（掛 window listener、啟偵測 loop），**不待 socket**。
- `onClose`／`handlePongTimeout`／reconnect 隙：改呼 `gamepadHandler.setEnabled(false)`（停送，續偵）；`connect()`／reconnect 成功 onStatus：`setEnabled(true)`。
- 唯 `disconnect()`（line 131）真 `detach()`／`stop()`。
- 確 E-STOP 之 rising-edge：device 既現即偵，縱連線方建立亦能觸（engage 經 `engageEstop` 送，斷線則 queue 或忽略 — 守既有 buildEstop 送法，不新增離線 buffer 除非測需）。

**docker `--build` 測**：webclient suite 全綠。

### 務三 — UX 回饋：明示 gamepad 接入、提示按鍵以啟

**所司檔**：`web-client/src/components/shared.tsx` 或相關 view（`MissionControl.tsx`／`MissionTablet.tsx`）、`hooks/useTeleopBridge.ts`（透 `gamepadConnected` 之態）＋其測。

**旨**：滿足 user-gesture 閘並予操作者明確回饋，免「靜默不應」之惑。
- bridge 增 `gamepadConnected: boolean`（源自務一之 `onConnectionChange`）。
- UI：gamepad 接入顯一小 indicator（如 top-bar 「🎮」或 inputSource chip）；**未接而 touch 在線**時，可顯極輕之「press a gamepad button to enable」之 hint（不擾觸控操作；既有 touch-hint 不衝）。
- 不改既有 inputSource（touch/gamepad/idle）之語意，唯加「device 已接」之獨立訊。

**docker `--build` 測**：component/integration 測驗 indicator 隨 `gamepadConnected` 現隱；既有 suite 不回歸。

### 務四 — 文檔

**所司檔**：`TROUBLESHOOTING.md`、`AGENTS.md`（handover ＋ milestone row ＋ 本規入 Document index）、`deviations.md`（如有取捨）。

**旨**：
- TROUBLESHOOTING 補「gamepad 冷啟不應」之條：成因（user-activation／process-global service）、自助（先按一鍵並點一下頁面以授 gesture；Brave 須關該站 shields/fingerprinting）、本修如何解之。既有 Brave fingerprinting／held-stick 條保留並交叉指引。
- AGENTS.md：handover 述本修、milestone row 記新測數、Document index 加本規。

## 六、驗收 — 冷瀏覽器實機 (operator 行)

> 關鍵：須於**真冷態**驗，否則 process-global service 已熱、病不現。

1. 全閉 browser（或用全新 profile／guest window），確 gamepad service 未熱。
2. **直入本 UI**（勿經舊 `94525ff` 暖之），登入。
3. 按 gamepad 任一鍵 → joystick knob 應隨動、UI 顯「gamepad 接入」。
4. 推桿 → robot 行；持桿不動 → 續行無 jitter（驗 held-stick 未回歸）。
5. 按 LB → E-STOP engage（顯 ENGAGED）；再按 → reset。
6. gamepad 拔插、關復開數回 → 每回皆能復偵、復用。
7. 驗 axis 方向、持桿連續驅動於真 robot（承前番 hardware-verify 之未了項）。
8. Brave：關該站 shields 後重驗 3–6。

## 七、收束後

四務畢、suite 綠、operator 冷態驗訖 → controller 更 AGENTS.md（milestone row、Test baseline、handover）→ commit（一務一 commit，code＋doc 同）→ 問 operator 方 push／merge。若冷態驗證通過，可併入「考 `v1.0.0` tag」之議（連同既有 hardware-verify 項）。
