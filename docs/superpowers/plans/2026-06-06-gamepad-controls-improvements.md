# 手柄操控精進 — 實施之規 (2026-06-06)

> gamepad controls improvements。五病待治：恆速失守、觸示失真、軸位錯置、速限不可調、E-STOP 未配肩鍵。
> 本規以 wenyan 述之；identifiers、檔名、API 名留 English。讀者零背景亦可承。

---

## 一、緣起 — 操作者所陳五病

| 號 | 病 | 操作者語 |
|---|---|---|
| 病一 | 恆速失守 | 持桿不動，robot 反停；須振幅震盪方續行。疑「app 視訊息為 stale 而止」。 |
| 病二 | 觸示失真 | 動 gamepad 桿時，螢上 touch-hint 猶在。若當在，則 hint 宜隨真象而動。 |
| 病三 | 軸位錯置 | 求：前後＋旋轉於左桿，平移於右桿。UI joystick 已正，然 gamepad 旋轉誤落右桿。 |
| 病四 | 速限不可調 | 求 UI 可調最大線速、角速。意若 volume 之 ＋／－，並顯實值。位置未定。 |
| 病五 | E-STOP 未配 | 求 E-STOP 配於左肩鍵（LB，較大者）。 |

## 二、病因勘定 (已驗於 code)

- **scale 全無**：`buildTwist` 直送 normalized −1..1 為 linear_x/y、angular_z；`command_handler.cpp`、`teleop_node.cpp` 皆原值轉發 `/cmd_vel`。故當下滿桿即 1.0 m/s、1.0 rad/s。**病四之治＝client 端加 scale**，非改 server。
- **軸 map**（`gamepad_profiles.ts` 之 `STANDARD`）：`lx`←axis 1（左桿 Y）、`ly`←axis 0（左桿 X）、`az`←axis 2（右桿 X）。標準手柄 axis 0=左X、1=左Y、2=右X、3=右Y。求者：`az`（旋轉）←axis 0、`ly`（平移）←axis 2、`lx`（前後）←axis 1 不易。即 `az` 與 `ly` 互易。
- **buttons 空**：諸 profile `buttons: {}`；`onButton` 雖經 `TeleopClient` 透 `options.onButton`，然 bridge 未接，且無 'estop' action。**病五須**：profile 加 `estop` 鍵 + `TeleopClient` 內接 onButton('estop')→`engageEstop`。
- **gamepad twist 不達 bridge**：`useTeleopBridge` 未接 `onTwist`／`onGamepadActivity`；gamepad 之 twist 僅入 `TeleopClient.gamepadHandler`→`sendTwist`，UI 不知。故螢上 joystick 無從映 gamepad（**病二之根**）。
- **病一存疑**：client 確以 20 Hz republish 持桿之 twist（`startPublisher` 取 `repeatTwist`），server 逐筆轉發，watchdog 唯真靜默 500 ms 方斷。**就 code 觀，client／server 皆不致持桿而停**。故病一為**勘查先行**之務：疑落 robot base controller 之 cmd_vel timeout，或實地 republish 未達。治以 deadzone ＋ republish 守恆之 trophy 測鎖定 client 保證，並具實證以指真因。

## 三、共通法度 — 凡務皆遵 (不得違)

1. **trophy TDD**：先紅後綠。testing-trophy 重 integration／component（RTL＋jsdom）。純 type-only 重構無新行為者，守則＝既有 trophy suite 全綠＋`tsc` 限改檔無新誤。每務必先寫**紅**測，後實作至**綠**。
2. **git worktree 一務一樹**：控者（controller）為每務建一 worktree（branch 自 main 分），子代於樹中作業。建：於 repo root 行 `git worktree add` 於 `.claude/worktrees/<name>` 立 branch `feat/<name>`。樹中 docker 測須帶 `--env-file /home/chngyicheng/pocket-teleop/.env`（樹不繼承 .env）。
3. **Haiku 子代以 wenyan-ultra 役之**：controller↔Haiku 用 caveman wenyan-ultra；English technical terms 留 English；code／commit 文用 normal English。
4. **子代不得 commit、不得 stage、不得行任何 git；不得改所司以外之檔**。子代唯：實作所司檔、行 docker 測（`--build`）、報。控者審 `git status`（防誤掃 untracked，如 `.claude/worktrees/…`）、依 explicit path stage、commit。見 AGENTS.md「Execution mode」「Who commits」。
5. **docker 測必 `--build`**：`docker compose run` 不 `--build` 則用 stale baked image，改動失真。樹中 root-owned `node_modules` 之患，移樹前 chown 還：`docker run --rm -v <path>:/w alpine chown -R 1000:1000 /w`。
6. **收束**：測綠 → 控者更 AGENTS.md handover（milestone row、Test baseline）→ 控者 commit（code＋doc 同）→ 問操作者方 push／merge。

## 四、子代差遣之式 (每務 prompt 必含)

每 Haiku prompt 必明載：所司檔之 explicit list、紅測之旨、實作之的、docker `--build` 測令、`--env-file` 之注、「**勿 git、勿 commit、勿改他檔，留 dirty tree 而報**」之戒、wenyan-ultra 之命。控者收報後自審自 commit。

---

## 五、五務 (附序與依賴)

> **依賴**：
> - 病二、病四賴「bridge 透 gamepad twist 及 maxSpeed setters」之新管道 → **務 A 先立**。
> - **務一、務四、務五 同改 `teleop_client.ts`（sendTwist／publisher／onButton 截）** → **不可並樹**，須**序列**：各 worktree 自**前務已 merge 之 main** 分枝，免 sendTwist 衝突。務四之 scale 賴務一之 shaped-normalized，尤須在務一之後。
> - 病三（`gamepad_profiles.ts`）、務 A（`useTeleopBridge.ts`）相對獨立，然務五亦動 profiles，宜於病三後。
> **建議序（serial）**：務 A → 病一 → 病三 → 病五 → 病二 → 病四。每務 merge 入 main 後，下一務之 worktree 方自新 main 分枝。**非並行**；worktree 乃為隔離與淨測，非為同時。

### 務 A — 立 bridge 之 gamepad 管道 (基建，先行)

- **的**：使 gamepad 之 twist、activity、button 達 React 層，為病二、病四、病五之共用基。
- **治**：`useTeleopBridge` 接 `TeleopClient` 之 `onTwist`、`onGamepadActivity`、`onButton`，存於 ref／state，擴 `TeleopBridge` 介面曝 `gamepadTwist`（最新 lx/ly/az）與 `inputSource`（'touch'｜'gamepad'，依 activity 時戳判，逾時回 idle）。`TeleopClient` 已具諸 callback，僅 bridge 未接。
- **測 (trophy)**：mock `TeleopClientCtor`，觸 onTwist／onActivity，斷 bridge 曝之 `gamepadTwist`、`inputSource` 隨之變。
- **所司檔**：`web-client/src/hooks/useTeleopBridge.ts`、`web-client/test/useTeleopBridge.test.tsx`。
- **worktree**：`feat/gp-bridge-channel`。

### 務一 — 恆速失守之勘與治

- **的**：(a) 鎖定 client 之 republish 保證；(b) 加 input-shaping（deadzone＋curve）以保安全並利微操；(c) 具實證指真因。
- **治**：
  - 立一純函 **`shapeAxis(v)`**（新 util，如 `web-client/src/input_shaping.ts`）：先 **deadzone 0.1**（絕值小於 0.1 歸零，並 rescale 餘段至 0..1 免段差），後施 **cubic（或 exponential）curve**（如 `sign(v)·|v|³`，使近零細、近端疾）。deadzone 解「鬆桿微值致 robot 蠕行」，curve 予低速細操。閾、curve 之冪宜為常數（後可 option 化）。
  - 施於 **`TeleopClient.sendTwist`** 之 choke：收 normalized −1..1，先 `shapeAxis` 三軸，存 **shaped-normalized** 於 `repeatTwist`，即送。如此 gamepad、touch、keyboard 三輸入皆經之，一處而覆；螢上 joystick knob 仍 pointer 驅（顯 raw），唯**輸出** twist 受 shaping。（keyboard ±1：deadzone 不歸零、curve(1)=1，無害。）
  - 驗 `startPublisher`：持桿（repeatTwist 非空）則無窮以 publishIntervalMs republish，永不自歸零。若測 already 綠，則病一非 client；於收尾文書記之，標 robot cmd_vel_timeout 須賴此 20 Hz（已具）。
  - 勘查交付：於 handover／deviations 記實測（持桿時 wire 上 twist 之頻與值），俾操作者驗 robot 端。
- **測 (trophy)**：`shapeAxis` 純函：|v|<0.1→0；v=0.1→≈0（段界）；v=1→1；中段循 cubic（如 0.5→0.5³≈0.125，依 rescale 後計）；負對稱。`sendTwist`：sendTwist(0.05,0,0)→buildTwist linear_x=0（deadzone）；sendTwist(1,0,0)→1。fake timers：持一非零 axis，run 多 publish tick，斷送出 twist **穩定非零、不間斷、不自歸零**；鬆桿則 STOP_REPEATS 後靜默。
- **所司檔**：新 `web-client/src/input_shaping.ts`、`web-client/src/teleop_client.ts`、`web-client/test/input_shaping.test.ts`、`web-client/test/teleop_client_continuous_publish.test.ts`。（deadzone 既於 sendTwist，`gamepad_handler.ts` 不另設。）
- **worktree**：`feat/gp-constant-velocity`。

### 務三 — 軸位重配

- **的**：旋轉歸左桿、平移歸右桿。
- **治**：`gamepad_profiles.ts` 之 `STANDARD` 改為 `lx`←axis 1（不易）、`az`←axis 0、`ly`←axis 2。invert 之正負待**硬件驗**（plan 標：子代依現有 invert 語意設初值，操作者於 DevTools 觀 "Gamepad detected" 後校正方向；如反，翻 invert）。`DualShock` profile（az 用 axis 3）軸序異，本務**不動**，留註待另驗。
- **測 (trophy)**：以 fake gamepad（諸 axis 設定值）入 `GamepadHandler.poll`，斷 onTwist 收之 `az` 源自 axis 0、`ly` 源自 axis 2、`lx` 源自 axis 1。
- **所司檔**：`web-client/src/gamepad_profiles.ts`、`web-client/test/gamepad_profiles.test.ts`（或 `gamepad_handler.test.ts`）。
- **worktree**：`feat/gp-axis-remap`。

### 務五 — E-STOP 配左肩鍵 (LB)

- **的**：按 LB（標準 button index 4）**切換** E-STOP；與 touch／UI 共一 latch，互不相鎖。
- **治**：
  - `gamepad_profiles.ts` 之 `STANDARD`（及 Generic、GameSir）`buttons` 加 `{ estop: 4 }`。button index 4 = LB（bumper，較大者）；LT trigger = 6，勿混。
  - **「若鍵存」之守**：`gamepad_handler.poll` 於讀 button 前驗 `gp.buttons[idx]` 存在（index 在界）；不存則略過該 action，不誤觸。
  - **cross-source toggle**：`TeleopClient` 內截 gamepad `onButton('estop')`（現唯透 `options.onButton`，須加內截），依**當前 `estopEngaged`** 切換 — engaged 則 `resetEstop()`、否則 `engageEstop()`。estop 乃單一共享 latch（`estopEngaged` ＋ server `estop_state` 為準），故 touch engage 之，gamepad 可 reset 之；gamepad engage 之，touch（UI STOP/RESET 鈕、Space）可 reset 之 — 二源互不相鎖。（答未決 #3：reset **已**配 gamepad，即此同一 toggle 鍵。）
  - 注：rising-edge only（持按不連觸）；toggle 之態取自 client 之 `estopEngaged`，故 server 之 `estop_state` 回報亦令二源同步。
- **測 (trophy)**：fake gamepad，button 4 rising-edge 且 `estopEngaged=false`→斷送 buildEstop（engage）一次；再觸且 `estopEngaged=true`→斷送 buildEstopReset（reset）；持按不重複（rising-edge）；`gp.buttons` 無 index 4 時觸之→無 estop 動作（守驗）。cross-source：touch 觸 engage 後 gamepad 觸→reset，反之亦然。
- **所司檔**：`web-client/src/gamepad_profiles.ts`、`web-client/src/teleop_client.ts`、`web-client/src/gamepad_handler.ts`（button-exists 守）、`web-client/test/teleop_client*.test.ts`、`web-client/test/gamepad_handler.test.ts`。
- **worktree**：`feat/gp-estop-shoulder`。

### 務二 — 觸示映真象 (依務 A)

- **的**：gamepad 動桿時，螢上 joystick knob 隨 gamepad 真值而移，hint／label 隱；無輸入時 hint 復現。touch 操作不變。
- **治**：`components/shared.tsx` 之 `Joystick` 加可選 **controlled** props：`externalValue`（{x,y}，−1..1）與 `externalActive`（bool）。當 `externalActive` 真，knob 依 externalValue 置位、hint／label 隱、pointer 互動仍可（gamepad 與 touch 互不奪）。`views/MissionControl.tsx`、`views/MissionTablet.tsx`（及 `JoystickZone`）自 bridge 取 `gamepadTwist`＋`inputSource`，於 `inputSource==='gamepad'` 時傳 externalValue／externalActive 予對應 DRIVE／STRAFE joystick（依軸位重配後之語意分配）。
  - **答操作者問**：hint 動 gamepad 時**宜隱**（誤導故）；若顯，則須映真象 — 本務取「映真象」之上策：active 時 knob 即真象，hint 自隱。
- **測 (trophy)**：render `Joystick` 予 `externalActive`＋`externalValue`，斷 knob transform／位移反映之、hint testid 不現；`externalActive` 偽則 hint 復現。component 級：render view 注 bridge fake（gamepadTwist 非零、inputSource='gamepad'），斷對應 joystick knob 移。
- **所司檔**：`web-client/src/components/shared.tsx`、`web-client/src/views/MissionControl.tsx`、`web-client/src/views/MissionTablet.tsx`、`web-client/test/shared.test.tsx`、`web-client/test/MissionControl.test.tsx`、`web-client/test/MissionTablet.test.tsx`。
- **worktree**：`feat/gp-hint-truth`。

### 務四 — 速限可調 (依務 A)

- **的**：UI 可調 maxLinear、maxAngular；volume 式 ＋／－，顯實值；存 localStorage；即時生效。
- **治**：
  - **scale 之所**：`repeatTwist` 存 **shaped-normalized**（務一所定，已過 deadzone＋curve），於每 `buildTwist` 之際（即送＋publisher tick）乘 scale（`lx,ly × maxLinear`、`az × maxAngular`），俾持桿時改速即時生效（repeatTwist 不 stale）。`setMaxSpeed(maxLinear, maxAngular)` 新 method；預設皆 1.0 以保現狀。**唯一 choke point**，三輸入皆經 sendTwist→shaping→scale，一改俱覆。
  - **bounds 即 ± 本身**：輸出實速之界由操作者經 SPEED ± 自調（maxLinear／maxAngular 即上限）；stepper 另設一**硬安全頂**（hard clamp ceiling，如 linear ≤2.0、angular ≤3.0）防誤設過巨，下限如 0.1 免歸零失控。
  - **持久**：`settings.ts` 加 `loadMaxSpeed`／`saveMaxSpeed`（localStorage，含 clamp 至硬界，step 0.1）。
  - **bridge**：`useTeleopBridge` 曝 `maxLinear`、`maxAngular`、`setMaxLinear`、`setMaxAngular`（呼 `client.setMaxSpeed`，並 saveMaxSpeed）。初值自 settings 載。
  - **UI control（volume 式 stepper）**：一 component `SpeedStepper`（顯 label、實值＋單位、＋／－鈕，逾界 disable）。linear、angular 各一（或一 component 含二行）。
- **位置（已定）**：納入**左 CollapsibleRail**（title STREAM）內，新增 `SidePanel title="SPEED"`，置於 **VELOCITY 之下、ODOMETRY 之上**（ODOMETRY 順移下移）。
  - `MissionTablet`：左 rail 現有 `SidePanel "VELOCITY"`→`SidePanel "ODOMETRY"`；於二者間插 `SidePanel "SPEED"`（內含 `SpeedStepper`）。
  - `MissionControl`（phone）：左 rail（STREAM）現有 VELOCITY＋LAT/BAT/SIG，無 ODOMETRY tab；為一致，亦於 VELOCITY 之下插同一 SPEED 區。
  - **不**用 `SettingsDrawer`（右）、**不**用 on-screen floating chip。state 自 bridge 取（務 A／本務所曝之 maxLinear／maxAngular／setters），two views 共用同 `SpeedStepper`＋bridge state，故行進中（rail 展開時）即可調，值常顯。
- **測 (trophy)**：`TeleopClient`：set maxLinear=0.5，sendTwist(1,0,0)，斷 buildTwist 之 linear_x=0.5；持桿改 maxSpeed，斷下一 publish tick 之值隨之變。`settings`：save／load／clamp。`SpeedStepper`：＋／－改值、逾界 disable、顯實值＋單位。bridge：setMaxLinear 既呼 client 又 persist。view（component 級）：左 rail 展開時 SPEED 區現於 VELOCITY 與 ODOMETRY（tablet）之間，序正。
- **所司檔**：`web-client/src/teleop_client.ts`、`web-client/src/settings.ts`、`web-client/src/hooks/useTeleopBridge.ts`、新 `web-client/src/components/SpeedStepper.tsx`、`web-client/src/views/MissionControl.tsx`、`web-client/src/views/MissionTablet.tsx`、各對應 `test/*`。
- **worktree**：`feat/gp-speed-limit`。

---

## 六、收束與驗收 (controller 之責)

- 每務：子代報畢 → 控者審 `git status`（無誤掃）→ 審 diff（合 spec）→ 質量複審 → 依 path stage → commit（code＋AGENTS.md row 同）→ worktree 測綠（webclient 全套，`--build`）。
- 全務畢：合各 branch 入 main（控者 merge，no-ff），更 Test baseline，清各 worktree／branch。
- **病一勘果**須書於 [deviations.md](../../../memory/agent-guides/deviations.md)：若證 client republish 已穩，則標真因疑在 robot cmd_vel_timeout，附實測為據。
- **硬件待驗**二事須記 handover：軸 invert 方向（務三）、gamepad id pattern（GameSir）、LB index（務五）。皆俟操作者實機校。

## 七、決策誌 (皆已定)

1. **速限 control 位置** — 左 CollapsibleRail（STREAM）內，新 `SidePanel "SPEED"`，置 VELOCITY 之下、ODOMETRY 之上。見務四。
2. **bounds／step** — bounds 即 SPEED ± 本身（操作者自調 maxLinear／maxAngular）；另設硬安全頂（暫定 linear ≤2.0、angular ≤3.0，下限 0.1，step 0.1）。實機若需，調此常數即可。
3. **E-STOP reset 配 gamepad？** — **配**。LB 為 cross-source toggle：engaged 則 reset、否則 engage；與 touch／UI／Space 共一 latch，互不相鎖。見務五。
4. **input shaping** — deadzone 0.1（rescale 餘段）＋ cubic curve（`sign(v)·|v|³`），施於 sendTwist choke，覆 gamepad＋touch（keyboard 無害）。見病一。

> 餘待**實機校**（非阻塞，記 handover）：軸 invert 方向（務三）、GameSir id pattern、LB 確為 index 4（務五）、curve 取 cubic 抑 exponential 之手感、硬安全頂是否合 robot 實能。
