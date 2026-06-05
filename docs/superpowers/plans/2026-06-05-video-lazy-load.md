# 視頻延遲載入 + NO SIGNAL 狀態 — 控制 UI 先繪，視頻後至且狀態清晰（2026-06-05）

> 文言為文；技術詞、檔名、API、類型名、識別符英文。plan 內不置 code block；碼自存於 source。
> 操作者願：合併後白屏已自 15s 降至約 4s，然仍欲更「snappy」。決策：視頻可後載，控制 UI 先繪先可互動，視頻晚至無妨。
> 二事併行（同動 `stream.state` 路徑，故合於一 plan）：
> **甲、視頻延遲載入**（snappier 首繪）；**乙、視頻未連時之 NO SIGNAL placeholder**（令空白視頻區之狀態可讀，操作者不疑「壞了還是本就無」）。
> 大前提（安全）：joystick 與其 hint 為控制面，**永不**隨視頻連線狀態隱沒——視頻為情境感知（situational awareness），非控制之前提；direct 與 remote 二模式共用同一畫面，控制恆在。本役**不**動 joystick 之顯隱。

## 根因（已查證）

- nginx 出之 asset 皆瞬達：built `index.html` 516B、CSS 646B、JS bundle 191031B 皆 `total < 0.5ms`（經 `curl` 量於 `localhost:18080`）。故 **4s 非網路、非 asset 傳輸**——offline 之外網 font stall 已除（bundle 內已無 googleapis 等外部呼叫，僅 React 內一 `reactjs.org` 字串，非請求）。
- 殘餘 4s 屬 **client 端 JS boot + connect**：(1) 解析/執行 191KB 單一未切分 chunk（含 React ~130KB + 全 app）；(2) mount 時 `useWhepStream` 之 effect 即呼 `WhepClient.start()`，於主執行緒啟 WebRTC `RTCPeerConnection` + ICE 協商（手機上耗時且佔主執行緒），與控制 UI 之首繪爭用主執行緒。
- `useTeleopBridge`（WebSocket → `/teleop`）為控制必需（送 twist），**不可延**。唯 **視頻（WHEP）可延**——其首繪本即顯 placeholder（`stream.stream` 為 null 時 `<video>` 空），晚數百毫秒接上無損操作。

## 範圍

- `web-client/src/hooks/useWhepStream.ts`（延遲 start + production 路徑改 dynamic import）。
- `web-client/src/whep_client.ts`（不改邏輯，僅令其落入獨立 chunk——由 dynamic import 觸發 Vite code-split）。
- `web-client/test/useWhepStream.test.tsx`（新增延遲 + 注入工廠仍同步之測）。
- 視圖（`MissionControl.tsx`／`MissionTablet.tsx`）：**乙役**增一 `stream.state` 驅動之 NO SIGNAL overlay 於視頻區（`<video>`、stats `DataRow`、srcObject effect 之結構不動，僅疊一非互動 label）；joystick 結構與顯隱不動。
- `App.tsx` 不改 wiring（`useWhepStream` 仍於頂層呼，唯其內部延遲）。
- 不涉 auth-server、server、video-bridge。

## 設計

### 甲役 — 視頻延遲載入（snappier）

核心二手段並用，皆只動 `useWhepStream`：

#### 一、延遲 WHEP start 至首繪之後（主效益）

- `useWhepStream` 之 effect 內，不再同步即呼 `client.start()`。改以 **首繪後排程**：用 `requestIdleCallback`（不支援則 fallback `setTimeout(…, 0)`），令控制 UI（top bar、joystick、telemetry）先繪先可互動，WHEP 協商讓位於其後一拍。
- 初始 `state` 仍 `'connecting'`（既有預設），視圖顯 placeholder 不變。
- cleanup 須能取消未觸發之排程（存 idle/timeout handle，unmount 時 `cancelIdleCallback`／`clearTimeout`），且若已 start 則照舊 `client.stop()`。避免 race：以一 `cancelled` flag 守衛，排程回呼觸發前若已 unmount 則不 start。

#### 二、dynamic import 令 WhepClient 自成 chunk（次效益，減初始解析）

- production 路徑（無注入工廠時）改 `const { WhepClient } = await import('../whep_client.js')`，於排程回呼內 await 後方建 client。Vite 見 dynamic import 即將 `whep_client` 及其私有相依切為獨立 chunk，**自初始 bundle 移除**，縮小首載解析量。
- **注入工廠路徑保持同步**：若 `opts.WhepClientCtor` 已給（測試用），直接用之、**不**走 dynamic import。如此既有 `useWhepStream.test.tsx`、`App.test.tsx` 等以工廠注入 fake 之測全不破，dynamic import 僅施於 production 預設。
- 頂部 `import` 改為 `import type { WhepState, WhepCallbacks, VideoStats } from '../whep_client.js'`（純型別 import，編譯時抹除，不致 runtime 靜態相依，故不阻 code-split）。

#### 何以不用 React.lazy 切視圖

視頻已織入二視圖深處（多 `<video>`、stats `DataRow`、state badge、srcObject effect），非一可整體抽離之 panel；React.lazy 須大幅重構視圖、churn 高、回歸風險大。`<video>` element 本身極輕，重者為 `WhepClient` 之 WebRTC 邏輯與其 start——故只切 `WhepClient` chunk + 延其 start，即得「UI 先、視頻後」之實效，而視圖零改。

### 乙役 — NO SIGNAL placeholder（視頻區狀態可讀）

- **何為**：視頻未 `live` 時，於視頻區疊一居中、非互動（`pointerEvents: 'none'`）之 overlay label，由 `stream.state` 驅動，令空白視頻區之狀態明確（避免「壞了／本就無／仍在連」之歧義）。
- **state → label 對映**（`WhepState`：`connecting`／`live`／`retrying`／`error`，外加 stream null 之未連態）：
  - `live` → **不渲** overlay（視頻已現）。
  - `connecting` → `CONNECTING…`
  - `retrying` → `RECONNECTING…`
  - `error`（或其他非 live 之終態） → `NO SIGNAL`
- **置於**：`MissionControl.tsx`（phone：landscape rail 視頻 + portrait 浮層視頻二處）與 `MissionTablet.tsx`（中央 STREAM 視頻）之 `<video>` 同一容器內，絕對定位居中、`zIndex` 低於 joystick（joystick hold-zone z 5；overlay 取 z 1～2，必在 joystick 之下，且 `pointerEvents:'none'` 不奪觸）。Mission palette：`text-muted` 灰字（`#8b92a0`）、JetBrains Mono、letter-spacing、半透明，與既有 `● Live`／`—` 風一致。
- **不涉**：joystick 與其 hint 之顯隱（大前提：控制恆在）；亦不改 stats `DataRow`（`fps`/`res` 仍 `—` fallback）。stream badge（`● {state}`）保留——overlay 為視頻區之大字狀態，badge 為角落小字，二者不悖。
- **direct vs remote**：今無顯式 mode flag，故一律以 `stream.state` 表狀態，未連即 `NO SIGNAL`（非 `DIRECT CONTROL`，因系統無從辨「刻意不接視頻」與「接不上」）。日後若加顯式 direct-mode toggle（屬另役），可令該 mode 下 label 改顯 `DIRECT CONTROL` 並預設收起 STREAM rail——本役不做，僅留註。

## 任務分解（單 subagent 或 controller 直作，worktree + branch）

- **T1**：改 `useWhepStream`——延遲 start（requestIdleCallback/setTimeout + 可取消 cleanup + cancelled 守衛）；production 路徑 dynamic import `WhepClient`，注入工廠路徑保持同步；頂部改純型別 import。
- **T2**：測——`useWhepStream.test.tsx` 增：(a) mount 後**未即** start（以注入工廠之 spy 驗 start 於排程觸發前未呼，fake timers 推進後方呼）；(b) 注入工廠仍同步不走 dynamic import；(c) unmount 於排程未觸發前不 start、無 leak。既有 stream/state/stats 測續綠。
- **T3**：驗 production code-split——build 後確 `dist/assets/` 多一 `whep_client` 獨立 chunk，且初始 `index-*.js` 小於原 191KB（量差記於 handover）；browser/stack 重建後肉眼確認控制 UI 先現、視頻數拍後接上、無雙流/無回歸。
- **T5（乙役）**：於 `MissionControl.tsx`／`MissionTablet.tsx` 之視頻區增 `stream.state` 驅動之 NO SIGNAL overlay（state→label 對映如上；`pointerEvents:'none'`、z 低於 joystick、Mission palette）。joystick 顯隱不動。
- **T6（乙役測）**：`MissionTablet.test.tsx`／`MissionControl.test.tsx` 增——(a) `state==='live'` 時無 overlay；(b) `connecting`/`retrying`/`error` 各顯對映文案；(c) overlay 不奪觸（`pointerEvents:'none'`）且 joystick zone 仍在（回歸護 joystick 恆顯，不隨 state 隱）。
- **T4（controller）**：二 review round、跑全 webclient 測（Docker `--profile test`）、更 AGENTS.md handover + Milestones + deviations + Document index、commit。畢問 push。

## Trophy TDD 測試基線

須保：webclient **343 pass**（甲役 + 新 useWhepStream 延遲測 ~3；乙役 + NO SIGNAL overlay 測 ~4，計 ~7 新）、auth 46、video-bridge 19、C++ 44。既有 pre-existing reds（9 webclient adversarial + 1 whep timer flake + integration 需 live server；2 auth adversarial）非 regression。Docker 內跑（`webclient-test`）。注意 `whep_client.test.ts` 之既有 13 測直測 `WhepClient` class，不經 hook，dynamic import 不影響之。

## 風險

- `requestIdleCallback` 於 jsdom 測環境或缺；測須以 fake timers 或 polyfill/注入處理，或令延遲機制可注入（如 `deferFn` opt 預設 `requestIdleCallback`，測時注入同步函數）。傾向：production 用 `requestIdleCallback ?? setTimeout`，測以注入工廠 + fake timers 驗「非同步」即足，不必精測 idle callback 本身。
- dynamic import 之 chunk 於極慢裝置可能令視頻接上更遲——屬可接受取捨（操作者已定：UI 優先）；唯 `state` 須仍正確過渡（connecting → live），placeholder 期間 UI 完整可用。
- 注入工廠路徑若誤走 dynamic import，將破數十既有測——T2 須顯式守此分支。
- code-split 之實際省量有限（WhepClient 為純 WebRTC，相對 React 130KB 為小頭）；主效益在**延 start 釋主執行緒**，非 bundle 縮量。handover 須誠實記實測 chunk 差，勿誇大。
- 乙役 overlay 之 `zIndex`/`pointerEvents` 若誤，恐遮或奪 joystick 觸控——安全要害。T6 須顯式驗 overlay `pointerEvents:'none'` 且 joystick zone 觸控不受擾；z 必低於 joystick hold-zone（z 5）。
- 乙役切忌牽連 joystick 之顯隱：大前提為控制恆在；overlay 僅施於視頻區，不得令 joystick 隨 `stream.state` 隱沒（remote 視頻掉線時尤須控制猶在）。回歸測護之。
