# 可摺側欄 + 影像自適 — 實作謀（2026-06-05）

> 文言為文，技術詞、檔名、API、類型名皆英文。plan 內不置 code block；碼自存於 source。

## 緣起

操作者求三事：

1. **影像自適**——video 依可用之寬或高，取其小者而貼合，全幅見之不裁（letterbox），不溢出。
2. **側欄可摺**——landscape 與 tablet 二模式，左右二側資訊（STREAM、MAP）各設一小 tab，按之則滑開滑合。
3. **影像隨寬而變**——側欄摺合則中欄展寬，video 隨之縮放。

## 範圍與界限

- 涉 `web-client/src/views/MissionTablet.tsx`、`web-client/src/views/MissionControl.tsx`、新組件 `web-client/src/components/CollapsibleRail.tsx`。
- **portrait（phone-portrait）不動**——其幅過窄，不容側欄，仍存浮層 overlay 原貌。為 regression guard，須立測護之。
- 操作者已決：landscape 由浮層**重構為真側欄**（與 tablet 同制）。見 AGENTS handover 此役之決。
- E-STOP、joystick、estop banner 之既有行為不得壞。E-STOP 仍 z-index 10 常在頂。

## 設計

### 一、影像 fit（二 view 皆改）

- video element 之 inline style `objectFit: 'cover'` → `'contain'`。
- `contain` 即「取寬高之小者貼合、保 aspect ratio、餘處留黑」，正合操作者所求。中欄為 grid `1fr`，故側欄摺合中欄展寬時，contained video 自然放大，無須額外計算。

### 二、CollapsibleRail 組件（新，foundational）

presentational 組件，置於 `components/CollapsibleRail.tsx`。父 view 持 open state，本組件僅呈現。

props：
- `side: 'left' | 'right'`——決 tab 之位（內緣）與 chevron 向。
- `open: boolean`、`onToggle: () => void`。
- `title: string`、`children: React.ReactNode`。
- palette 由父傳入或自 import（與二 view 共用 MissionPalette；可抽至 shared，亦可各自 inline，從簡則 props 傳色）。

呈現：
- rail 容器 `width: 100%`、`overflow: hidden`（摺時 children 被裁）、`transition` 平滑。
- **tab button**：絕對定位於 rail 內緣（left rail 之右緣／right rail 之左緣），垂直細條，內置 chevron（left rail：開示 `◀`、合示 `▶`；right rail：開示 `▶`、合示 `◀`）。
- a11y：tab button 設 `aria-label`（如 `Collapse stream panel` / `Expand stream panel`）、`aria-expanded={open}`。設 `data-testid`（如 `rail-tab-left`/`rail-tab-right`）便測。
- 合時 children 仍 render（俾測查其在），惟 rail column 縮至僅容 tab（見下），`overflow:hidden` 裁之。

**grid 縮放之機**：column 寬不在 CollapsibleRail，而在父 view 之 `gridTemplateColumns`。父依 open 算之，置 `transition: 'grid-template-columns 0.2s ease'`：
- tablet：`` `${leftOpen ? 220 : 22}px 1fr ${rightOpen ? 240 : 22}px` ``
- 合時 column 22px，僅露 tab 之 reopen chevron。

### 三、MissionTablet 整合

- 加 state：`const [leftOpen, setLeftOpen] = useState(true)`、`rightOpen` 同。
- grid container `gridTemplateColumns` 改為上式 template literal，加 `transition`。
- 左 `<aside>`（STREAM/VELOCITY/ODOMETRY/footer）裹入 `<CollapsibleRail side="left" title=… open={leftOpen} onToggle={() => setLeftOpen(o=>!o)}>`；右 `<aside>`（MAP/HEADING/LIGHTS/HINT）裹入 `side="right"`、`rightOpen`。
- video `objectFit` → `contain`。
- joystick zone 為透明 hold-zone，既有絕對定位（left:0/right:0 bottom:0）不改；側欄摺合不礙之。

### 四、MissionControl 橫屏重構

- video `objectFit` → `contain`（landscape、portrait 皆受惠）。
- **portrait 分支不動**：仍全幅 video + 浮層 VelBars / LAT-BAT-SIG / MiniMap-Compass / reticle / mode chip / joystick。
- **landscape 分支重構**為 grid（仿 tablet，惟欄較窄）：
  - container（landscape 時）`display: grid`、`gridTemplateColumns: ${leftOpen?180:22}px 1fr ${rightOpen?180:22}px`、`gridTemplateRows: 44px 1fr`、`transition`。header 跨 `1 / -1`。
  - 左 CollapsibleRail「STREAM」：納 STREAM data（src/codec/fps/res/live，仿 tablet）+ VELOCITY（VelBars）+ LAT/BAT/SIG readouts。
  - 右 CollapsibleRail「MAP」：納 MiniMap + HEADING（Compass）。
  - 中 `<main>`：video（contain）+ reticle + mode chip + joystick 二 zone。**joystick 改置於 center `<main>` 內**（絕對定位於 main 之底左/底右），免其壓側欄。
  - estop banner top 仍 44。
- state `leftOpen`/`rightOpen` 僅 landscape 用；portrait 不引。

### 五、狀態與持久

- open state 為組件內 `useState`，默認 `true`（開）。**不**入 localStorage（從簡、減測面）；持久化列為 out-of-scope，他日可補。

## Trophy TDD 測試計畫

trophy：重 integration（RTL on view），輔 light unit。先紅後綠。

**light unit — `test/CollapsibleRail.test.tsx`**
1. render title + children + tab button（查文字、`data-testid`）。
2. 按 tab → `onToggle` 被呼一次（`vi.fn`）。
3. `aria-expanded` 隨 `open` prop 而異（true/false 二 case）。
4. chevron 字符隨 side+open 而正（left 開 `◀` 合 `▶`；right 開 `▶` 合 `◀`）。

**heavy integration — `test/MissionTablet.test.tsx`（增）**
5. 二 rail tab 皆 render（`rail-tab-left`/`rail-tab-right` 在）。
6. 初始 STREAM、MAP 內容可見。
7. 按左 tab → grid container style `gridTemplateColumns` 含 `22px`（左合）；再按 → 復含 `220px`。
8. 按右 tab → 同理驗 240↔22。
9. video element `objectFit: contain`（查 style）。

**heavy integration — `test/MissionControl.test.tsx`（增）**
10. landscape：rail tab 二者 render；STREAM、MAP 內容在。
11. landscape：按左 tab → grid template 變（含 22px）；再按復原。
12. landscape：video `objectFit: contain`。
13. **portrait regression**：layout=`phone-portrait` 時，**無** rail tab（`queryBy…` 得 null），浮層 VelBars / MiniMap 仍在，video `objectFit: contain`。

**App-level（`test/App.test.tsx` 既有 9 jewel 不可壞）**：layout switch 仍運。run 既有全套確無 regression。

jsdom 無 layout/animation，故「video 放大」不直測；以 `gridTemplateColumns` 字串之變證其機，足矣。

## 任務分解（worktree + Haiku subagents，subagent-driven-development）

controller 先立 worktree + branch `feat/collapsible-rails-video-fit`（自 `main`）。各 subagent 嚴遵 plan、Docker 內跑測（不裸 npm）、同 commit 更 AGENTS.md handover。

- **T1（Haiku，先行，foundational）**：撰 `CollapsibleRail.tsx` + `CollapsibleRail.test.tsx`（unit 測 1–4）。先紅後綠。後 T2/T3 依之。
- **T2（Haiku，T1 後）**：MissionTablet 整合（設計三）+ 測 5–9。
- **T3（Haiku，T1 後，與 T2 並行）**：MissionControl 重構（設計一、四）+ 測 10–13。T2/T3 各動己檔（MissionTablet.tsx vs MissionControl.tsx），共用之 CollapsibleRail 已唯讀，故並行安全。
- **T4（controller）**：二 review round（spec 合規 → 碼質）、跑全 webclient 測（Docker，target file list）、更 AGENTS handover 表 + deviations（若有）、合 worktree、撰 commit。

每 task 畢：tests 全綠方進；一 task 一 commit，碼與 doc 同 commit。

## 測試基線

須保：webclient 既有 306 unit+component pass（見 AGENTS）。本役增 light unit ~4、integration ~9，期升至 ~319。既有 reds（9 adversarial-hypothesis + 1 whep timer flake + integration.test.ts 需 live server）非 regression，仍紅可也。

run：`docker compose --env-file /home/chngyicheng/pocket-teleop/.env --profile test run --rm webclient-test`（worktree 須顯傳 `--env-file`）；或 unit-only 之 `node:22-alpine` 法。port 18080 須空——主 stack 運則先 `docker compose down`。

## 風險與已知偏差

- grid-template-columns transition 於老 browser 或不平滑；於目標（Chromium/Fold 6 inner display）可。退路：改 transition rail 內 width，惟 video 不展。取 grid 法。
- landscape 重構動 MissionControl 結構大，須護 portrait 不壞（測 13 為 guard）。
- joystick 改入 main，須驗 onMove/onEnd 仍經 axesRef → bridge.sendTwist（既有 BUG 1 cross-axis 行為不可壞）。
- 偏差若生，逐條補 `memory/agent-guides/deviations.md`。

## 文檔更新

- AGENTS.md handover：Milestones done 增一列；handover 頭塊更「what just shipped」。
- deviations.md：若有。
- 本 plan 列入 AGENTS Document index。
