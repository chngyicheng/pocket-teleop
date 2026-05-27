# Mission Control UI — React 移植計劃（2026-05-28）

## 旨

棄 vanilla TS Mission UI 之諸文件（`mission_hud.ts`、`mission_joystick.ts`、`mission_header.ts`、`mission_app.ts` 及測試），改以 **React + Vite** 重建。設計圖 `design_handoff_pocket_teleop/` 本為 JSX，可近 1:1 移植；CSS 細節與 layout 不再 reinvent。

## 緣由

vanilla TS 港存三結構性缺：
- Tablet 三欄 layout（220px / 1fr / 240px 側欄）未實——設計 `MissionTablet` 全棄
- hold-zone joystick 於真實觸控未驗
- Hamburger 設置抽屜未繫——`onMenu: () => {}`

修需手寫側欄組件、設置抽屜、debug pointer 行為——估 4–6 時。React 路徑：移植 `shared.jsx` 與 `mission.jsx` 近 1:1，估 3–4 時，且設計擬合確保。詳見 commit `4266279` body 與用戶討論。

## 保留 vs 棄

**棄（feat/mission-ui 既有）：**
- `web-client/src/mission_hud.ts`、`mission_joystick.ts`、`mission_header.ts`、`mission_app.ts`
- `web-client/test/mission_hud.test.ts`、`mission_joystick.test.ts`、`mission_header.test.ts`、`mission_app.test.ts`
- `web-client/index.html` 之 inline CSS shell（重寫）

**保（不動，僅 import）：**
- 數據層：`teleop_client.ts`、`whep_client.ts`、`protocol.ts`、`connection.ts`、`settings.ts`、`gamepad_profiles.ts`、`gamepad_handler.ts`、`keyboard_handler.ts`、`video_source.ts`
- 其測：`gamepad_profiles.test.ts`、`integration.test.ts`、`keyboard_handler.test.ts`、`protocol.test.ts`、`settings.test.ts`、`whep_client.test.ts`、`video_source.test.ts`
- 後台容器：auth-server、teleop-server、video-bridge、mediamtx
- `touch_joystick.ts` + 其測：暫留（不用即可，後續可清）

## 設計決議

| 議題 | 決議 |
|---|---|
| 框架 | React 18 + Vite 5 |
| 語言 | TypeScript（`.tsx` for components, `.ts` for hooks/utils） |
| 測試框架 | vitest（已存）+ `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` |
| Joystick 默認 | `zone`（hold-zone），符 design README 推薦 |
| 字體 | Inter + JetBrains Mono via Google Fonts CDN |
| Layout 切換 | `useMediaQuery` hook 或直接 `window.matchMedia` 監聽——tablet ≥ 900px，portrait phone vs landscape phone |
| State 管理 | 局部 useState + 自製 `useTeleopBridge` hook；無 Redux/Zustand |
| 設置抽屜 | 漢堡點擊開 `<SettingsDrawer>`——含 gamepad profile / video source URL / robot namespace；複用 `settings.ts` API |

## 工作流

**Worktree：** 自 `feat/mission-ui` HEAD（`4266279`）branch 新 `feat/mission-ui-react`，於 `.worktrees/feat-mission-ui-react/`。**舊 worktree `feat-mission-ui` 不動。**

### Phase 0 — 設置（控制器親為，順序執行）

1. `git worktree add .worktrees/feat-mission-ui-react -b feat/mission-ui-react feat/mission-ui`
2. 刪舊文件：`mission_hud.ts`/`.test.ts`、`mission_joystick.ts`/`.test.ts`、`mission_header.ts`/`.test.ts`、`mission_app.ts`/`.test.ts`
3. 加依賴於 `web-client/package.json`：
   - 生產：`react@^18`、`react-dom@^18`
   - 開發：`@types/react`、`@types/react-dom`、`@vitejs/plugin-react`、`vite`、`@testing-library/react`、`@testing-library/jest-dom`、`@testing-library/user-event`
4. 創 `web-client/vite.config.ts`：React plugin、build outDir `dist`、root `.`、serve from `index.html`
5. 改 `web-client/tsconfig.json`：`jsx: "react-jsx"`、`module: "ESNext"`、`moduleResolution: "bundler"`、`target: "ES2020"`、`lib: ["ES2020", "DOM", "DOM.Iterable"]`、`types: ["@testing-library/jest-dom"]`
6. 改 `web-client/package.json` scripts：`"build": "vite build"`、`"dev": "vite"`、`"test": "vitest run"`
7. 改 `web-client/Dockerfile.webclient` builder 階段：`RUN npm run build` 仍走（vite 出 `dist/`），COPY `--from=builder /app/dist /usr/share/nginx/html/`——而 `index.html` 由 vite build 出於 `dist/`，故不再單獨 COPY index.html。**驗證：build 後 `dist/index.html` 與 `dist/assets/*.js` 皆存。**
8. 改 `web-client/vitest.config.ts`：加 `environment: 'jsdom'`、`setupFiles: ['./test/setup.ts']`（`./test/setup.ts` 內 `import '@testing-library/jest-dom'`）。`fileParallelism: false` 留（既有原因）。
9. 創 `web-client/index.html` 於 vite root：標準 vite shell，`<div id="app"></div>`，`<script type="module" src="/src/main.tsx"></script>`
10. 提交 `chore: scaffold React + Vite for mission UI rewrite`

### Wave 1（並行三 Haiku；disjoint 文件域；wenyan-ultra 提示）

各 agent **不提交**——控制器於 Wave 1 末合一提交。各跑 docker 測，匯報。

**Agent A — `shared.tsx` 移植**
- 唯動：`web-client/src/components/shared.tsx`、`web-client/test/shared.test.tsx`
- 自 `design_handoff_pocket_teleop/shared.jsx` 移以下組件，加 TS 類型：
  - `Joystick`（含 `variant: 'classic'|'edge'|'zone'`、`axes`、theming props、`onMove`/`onEnd`）——math 1:1 移
  - `MiniMap`（trail polyline、grid、ranges、arrow）
  - `Compass`（小 SVG dial）
  - `CompassTape`（橫 heading tape）
  - `VelBars`（lx/ly/az 三條，中心 tick）
  - `Readout`（pill 形 label + value）
- 棄 `VideoScene` / `VideoSceneWire` / `PillarStream`——production 用真 `<video>`
- 棄 `useTeleopState`——dead-reckoning 不要，真 odom 自 hook 供
- 導出 `CONNECTION_LABELS` 常量（三狀態 text + color）
- **不 import** TeleopClient / WhepClient——本 module 純表現組件
- 測（vitest + RTL，輕單元 5–8 個）：Joystick zone 變體 base 生於 finger 落點、Joystick `axes='x'` 鎖 y、VelBars value 致 fill 寬正、Compass label `padStart(3, '0')`、MiniMap polyline 點數隨 update 累積

**Agent B — Bridge hooks**
- 唯動：`web-client/src/hooks/useTeleopBridge.ts`、`web-client/src/hooks/useWhepStream.ts`、`web-client/test/useTeleopBridge.test.tsx`、`web-client/test/useWhepStream.test.tsx`
- `useTeleopBridge({ url, TeleopClientCtor? })` 返：
  - state：`connected: boolean`、`connectionState: 'live'|'reconnecting'|'disconnected'`、`retryCount: number`、`latencyMs: number|null`、`odom: {x, y, heading} | null`、`robotName: string`、`robotNamespace: string`、`robotType: string`
  - actions：`sendTwist(lx, ly, az)`、`eStop()`（永通——E-STOP 不檢 connected）
- 內部：`useEffect` 創 TeleopClient、繫 callbacks 至 useState setters、`connect(url)`、cleanup 時 `disconnect()`
- `useWhepStream({ url, WhepClientCtor? })` 返：
  - `stream: MediaStream | null`、`state: 'connecting'|'live'|'retrying'|'error'`、`error: string | null`
- 內部：`useEffect` 創 WhepClient、繫 `onStream`/`onStateChange`/`onError`、`start()`、cleanup 時 `stop()`
- **不 import** React 組件
- 測（vitest + `@testing-library/react`'s `renderHook`，輕單元 4–6 個）：FakeTeleopClient 注入後 sendTwist 透傳、onStatus callback → connected state 更、onOdom → odom state 更、E-STOP 即使 disconnected 也呼 `sendTwist(0,0,0)`、useWhepStream 之 onStream → stream state 設

**Agent C — `SettingsDrawer.tsx`**
- 唯動：`web-client/src/components/SettingsDrawer.tsx`、`web-client/test/SettingsDrawer.test.tsx`
- 抽屜 slide-in from left，含三欄：
  - Gamepad — 列 `loadGamepadProfiles()` 結果（`gamepad_profiles.ts`）、選擇器設活躍 profile
  - Video — 文本框輸 RTSP/SRT/UDP/MJPEG URL，apply 按鈕呼 `applyVideoSource()`（`video_source.ts`）；URL validate 顯示
  - Connection — robot namespace 文本框、`saveRobotNamespace()`（`settings.ts`）
- Props：`open: boolean`、`onClose: () => void`
- 樣式：dark palette、CSS module 或 tagged-template literal（無 styled-components 依賴）
- 測（vitest + RTL，輕單元 3–5 個）：open=true 時抽屜可見、點 close button 觸 onClose、video URL 文本框接受輸入並呼 apply、settings 三欄渲染

### Wave 1 結

控制器：
1. 跑全套 webclient 測——零失敗（pre-existing whep_client flake 容忍）
2. 提交 `feat: add React shared components, bridge hooks, settings drawer`

### Wave 2（並行二 Haiku；wenyan-ultra 提示）

**Agent D — `MissionControl.tsx`（phone）**
- 唯動：`web-client/src/views/MissionControl.tsx`、`web-client/test/MissionControl.test.tsx`
- 自 `design_handoff_pocket_teleop/directions/mission.jsx` 之 `MissionControl` 函數 1:1 移（含 `MissionHeader`、`Readout` 子組件——inline 於同文件可）
- Props：`bridge`（自 `useTeleopBridge`）、`stream`（自 `useWhepStream`）、`onMenu: () => void`、`layout: 'phone-landscape' | 'phone-portrait'`
- 替換：
  - `useTeleopState` → 直用 props.bridge
  - `<VideoScene>` → `<video autoPlay muted playsInline ref={videoRef}>` 含 useEffect 設 `srcObject = stream`
  - joystick `onMove` → 呼 `bridge.sendTwist(...)`；`onEnd` → `bridge.sendTwist(0, 0, 0)` 或維 strafe ly
  - E-STOP click → `bridge.eStop()`
  - 加 `useEffect` 監聽 keydown Space → `bridge.eStop()`、`e.preventDefault()`
- import `Joystick`、`MiniMap`、`Compass`、`VelBars`、`Readout`、`CONNECTION_LABELS` 自 `shared.tsx`
- 測（RTL + FakeTeleopClient 通過 props.bridge 注入，3–5 個輕單元）：phone-landscape 渲含 header/video/二 joystick、E-STOP click 觸 bridge.eStop、Space 觸 bridge.eStop、Hamburger click 觸 onMenu

**Agent E — `MissionTablet.tsx`（tablet）**
- 唯動：`web-client/src/views/MissionTablet.tsx`、`web-client/test/MissionTablet.test.tsx`
- 自 `design_handoff_pocket_teleop/directions/mission.jsx` 之 `MissionTablet` 函數 1:1 移
- 三欄 grid（220px / 1fr / 240px）+ 52px top bar 跨全
- 左欄：`SidePanel "STREAM"`、`"VELOCITY"` 含 `VelBars`、`"ODOMETRY"` 含 pos.x/y/heading rows
- 中欄：`<video>`、reticle 80×80 SVG、MANUAL · TELEOP chip + REC indicator、底部 V/ω readouts
- 右欄：`SidePanel "MAP"` 含 200×200 `MiniMap`、`"HEADING"` 含 44px Compass + course/track、`"LIGHTS"` 含 `MissionPillToggle` 三（HEAD/AUX/LASER；UI-only，繫 console.log）、`"HINT"` 含文字
- joystick overlays 於視口邊角（`position: absolute; bottom: 0; left/right: 0; z-index: 5`），size 280
- import 與 Agent D 同
- 測（RTL，3–5 個輕單元）：tablet 渲三欄、左欄 ODOMETRY rows 隨 odom 更、E-STOP + Space 觸 bridge.eStop、LIGHTS toggles click 切 on/off class

### Wave 2 結

控制器：
1. 跑全套 webclient 測——零失敗
2. 提交 `feat: add MissionControl phone + MissionTablet React views`

### Wave 3（單 Haiku；wenyan-ultra 提示）

**Agent F — App root + crown jewel 集成測**
- 唯動：
  - 新：`web-client/src/main.tsx`、`web-client/src/App.tsx`、`web-client/test/App.test.tsx`
  - 改：`web-client/index.html`（簡 shell，唯 `<div id="app"></div>` + `<script type="module" src="/src/main.tsx"></script>`）
- `App.tsx`：
  - 用 `useMediaQuery` 或 `window.matchMedia` 監聽——tablet（min-width: 900px）vs phone（orientation portrait 或 landscape）
  - 用 `useTeleopBridge({ url: \`ws://\${location.host}/teleop\` })`
  - 用 `useWhepStream({ url: \`http://\${location.host}/video/teleop/whep\` })`
  - state `drawerOpen: boolean`
  - 條件渲：`layout === 'tablet'` → `<MissionTablet>`；否 → `<MissionControl>`
  - `<SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />`
  - `onMenu={() => setDrawerOpen(true)}` 透傳
- `main.tsx`：標準 React 18 `createRoot(document.getElementById('app')!).render(<App />)`
- Crown jewel 集成測（`App.test.tsx`，RTL）≥ 6 個：
  - 渲含 header
  - FakeTeleopClient onStatus(true) → chip 變綠色 + 含 "Connected" / "Live"
  - FakeTeleopClient onOdom → MiniMap polyline 增點
  - 模擬 pointer down/move on DRIVE 區（用 `@testing-library/user-event`'s pointer API）→ FakeTeleopClient.twists 含非零記
  - 模擬 STRAFE 區 pointer down/move → ly axis 設、lx/az 0
  - 點 E-STOP → twists 末為 `[0, 0, 0]`
  - 按 Space → twists 末為 `[0, 0, 0]`
  - 點 hamburger → drawer 開
  - viewport ≥ 900px → tablet layout 渲（matchMedia mock）
- `index.html` 重寫：vite-style，head 含 Google Fonts、`<body><div id="app"></div></body>`，Mission palette CSS 移入組件或 `index.css` import 自 `main.tsx`

### Wave 3 結

控制器：
1. 跑全套 webclient 測——零失敗
2. 跑 `docker compose --env-file ... build webclient` 確 vite build 成
3. `docker compose up -d webclient` 重起
4. **手動煙測（告用戶 manual verify）**：訪 `http://localhost:8080`，確認手機橫向 / 豎向 / tablet 三 layout 切、hamburger 開抽屜、E-STOP + Space 雙觸、joystick hold-zone 於 finger 落點生 base
5. 更新 `AGENTS.md`：交接表加里程行、Head SHA 更、註 `feat/mission-ui` 棄而 `feat/mission-ui-react` 為新 head
6. 提交 `feat: wire React App root + crown jewel integration test`

## TDD 規格 — trophy 範式

依 `memory/agent-guides/project-skills.md`：「heavy integration tests, light unit tests」。

**輕單元（Wave 1 + 2 各組件）：**
- 每 component / hook 2–6 個用例，僅驗 user-visible behavior（DOM、callback 觸發、accessible name），勿釘 internal helper return
- 各 agent stub-first：先創 export 含 `throw new Error('not implemented')` 之函數，再寫測驗紅，再實——同 vanilla 港之 TDD 規

**Crown jewel（Wave 3）：**
- `<App>` 整體渲入 RTL container
- FakeTeleopClient / FakeWhepClient 注入 via React Context 或 prop 提升
- 用 `@testing-library/user-event` 之 pointer API 模真觸控
- 驗連線芯片色、joystick 觸 sendTwist、E-STOP、Space、hamburger、layout 切

## 不變式（Haiku 不得違）

- 不引除上列以外之 npm 依賴
- 不動 `teleop_client.ts`、`whep_client.ts`、`protocol.ts`、`connection.ts`、`settings.ts`、`gamepad_*`、`keyboard_handler.ts`、`video_source.ts` 之 API
- 不 import `touch_joystick.ts`（並存留待清）
- 不破既存 154 數據層測——agent 完工前跑全套確零失敗（容忍 pre-existing whep_client ICE-timer flake）
- E-STOP z-index 永最高（≥ 10），無 modal/drawer 可遮——Settings drawer z-index ≤ 9
- E-STOP `bridge.eStop()` **不檢 connected**——即使 disconnect 亦呼 `sendTwist(0,0,0)`（依賴 server-side watchdog）
- 各 Wave 1 / 2 agent 唯動自身文件域；不 `git add -A`、不提交
- 測命名 `*.test.tsx` 或 `*.test.ts`，vitest 自掃
- TDD 紅階段必為 behavior failure，非 module-not-found（stub 先存）
- Haiku 提示用 `wenyan-ultra`——技術術語英文不譯
- Haiku 不跑 docker（無權）；唯寫文件 + 報文件路徑與測試名。控制器跑 docker 驗。

## 驗收

- 全 154 既數據層測通
- 新單元測 ≥ 20（Wave 1 約 13–17 + Wave 2 約 6–10）
- Crown jewel 集成測 ≥ 8 個通
- `docker compose up -d webclient` 起動正常
- 瀏覽器手動煙測：三 layout 切、hamburger 抽屜、E-STOP + Space、hold-zone joystick 於 finger 落點生 base、connection chip 三狀態色正
- `AGENTS.md` 交接表 + Head SHA 更新

## 已知偏差（預期接受）

- 設計 LIGHTS toggles UI-only，無對應後端訊號——點擊唯本地 state 切 + console.log
- 設計 REC indicator 默認隱藏（無 recording 訊號）
- E-STOP 於 disconnect 時 sendTwist 仍呼但 TeleopClient.send 內部丟（WS 未開）——server-side watchdog 兜底
- `touch_joystick.ts` 並存未除——後續 cleanup commit

## 文件總圖（移植畢）

```
web-client/
├── index.html                          # vite shell, 簡
├── vite.config.ts                      # Phase 0
├── tsconfig.json                       # Phase 0 改
├── package.json                        # Phase 0 改
├── Dockerfile.webclient                # Phase 0 改
├── vitest.config.ts                    # Phase 0 改
├── src/
│   ├── main.tsx                        # Wave 3
│   ├── App.tsx                         # Wave 3
│   ├── index.css                       # Wave 3（palette）
│   ├── components/
│   │   ├── shared.tsx                  # Wave 1 Agent A
│   │   └── SettingsDrawer.tsx          # Wave 1 Agent C
│   ├── hooks/
│   │   ├── useTeleopBridge.ts          # Wave 1 Agent B
│   │   └── useWhepStream.ts            # Wave 1 Agent B
│   ├── views/
│   │   ├── MissionControl.tsx          # Wave 2 Agent D
│   │   └── MissionTablet.tsx           # Wave 2 Agent E
│   ├── teleop_client.ts                # 不動
│   ├── whep_client.ts                  # 不動
│   ├── protocol.ts                     # 不動
│   ├── connection.ts                   # 不動
│   ├── settings.ts                     # 不動
│   ├── gamepad_profiles.ts             # 不動
│   ├── gamepad_handler.ts              # 不動
│   ├── keyboard_handler.ts             # 不動
│   ├── video_source.ts                 # 不動
│   └── touch_joystick.ts               # 不動（並存）
└── test/
    ├── setup.ts                        # Phase 0
    ├── shared.test.tsx                 # Wave 1 A
    ├── useTeleopBridge.test.tsx        # Wave 1 B
    ├── useWhepStream.test.tsx          # Wave 1 B
    ├── SettingsDrawer.test.tsx         # Wave 1 C
    ├── MissionControl.test.tsx         # Wave 2 D
    ├── MissionTablet.test.tsx          # Wave 2 E
    ├── App.test.tsx                    # Wave 3 F
    └── ...既有測（不動）
```

## 控制器執行序

| 序 | 動 |
|---|---|
| 1 | Phase 0 全（手） |
| 2 | 並派 Wave 1 三 Haiku（wenyan-ultra prompts） |
| 3 | 三 Haiku 畢，控制器跑全測，提交 Wave 1 |
| 4 | 並派 Wave 2 二 Haiku |
| 5 | 二 Haiku 畢，控制器跑全測，提交 Wave 2 |
| 6 | 派 Wave 3 一 Haiku |
| 7 | Haiku 畢，控制器跑全測 + docker build + up -d + 手動煙測 |
| 8 | 更 `AGENTS.md` 交接表，提交 Wave 3 |
| 9 | 報用戶：`"Committed as <hash>. Ready to push — shall I?"` |
