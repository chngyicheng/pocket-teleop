# Robot footprint outline ＋ service worker precache — 實施之規 (2026-06-11)

> AGENTS.md handover「Next」之二懸案，唯此二者無 plan：minimap 之 **robot footprint outline**（env 定長寬、zoom-gated、虛線 accent 於箭下）、**service worker** app-shell precache（離線殼、載速）。本規併治之。
> 本規以 wenyan 述之；identifiers、檔名、API 名留 English。讀者零背景亦可承。

---

## 一、緣起

| 號 | 求 | 出處 |
|---|---|---|
| 求一 | minimap 顯 robot 實體輪廓——操作者度孔隙、近障時知車身所及 | AGENTS.md handover「robot footprint outline」 |
| 求二 | 輪廓由 deployer 配（robot 異形異尺），env 直通如 `MAP_TOPIC` 之例 | 同上「env length/width」 |
| 求三 | zoom 遠則輪廓微如點——噪也，gate 之 | 同上「zoom-gated」 |
| 求四 | 虛線 accent 風、置箭之下層，不奪 HUD 主次 | 同上「dashed accent under the arrow」 |
| 求五 | app shell（HTML/JS/CSS/icon）precache——重訪即開，Wi-Fi 弱亦達 login 殼 | AGENTS.md handover「service worker for app-shell precaching」 |

## 二、現狀勘定 (已驗於 code)

- **MiniMap**（`web-client/src/components/shared.tsx`）：canvas 化既成，base_link 定 frame（map mode 箭恆向上、map 旋）、odom 退路（grid 靜、箭隨 heading 旋）、pinch-to-zoom（scale 可變，1 m … 1.2× map extent）。輪廓無。
- **robot 身份既有管道**：`status` 訊息（`protocol.ts` 行 3）既載 `robot_type`/`robot_name`/`robot_namespace`——server params ← env（`ROBOT_TYPE` 等，`.env.example` 行 12–14）。**輪廓尺寸可循同路**，不另立訊息。
- **env 直通之式既立**：`.env` → `docker-compose.yml` environment → Dockerfile CMD 條件注入 → ROS param → launch file `EnvironmentVariable` 條。SLAM minimap plan〈部署者易配〉節為範。
- **web-client build**：vite 5 ＋ React，`Dockerfile.webclient` 兩段（vite build → nginx）。`nginx.conf` 司靜態與 proxy。service worker 無、manifest 無。
- **jsdom 無 canvas 無 serviceWorker**：渲染算術、SW 註冊邏輯皆須抽純函數／薄 wrapper 測之。

## 三、設計總綱 — footprint outline

### 數據流

`.env`（`ROBOT_LENGTH_M`、`ROBOT_WIDTH_M`）→ teleop_node params（`robot_length_m`、`robot_width_m`，default 0＝未配）→ 既有 `status` 訊息增 `robot_length`、`robot_width` 欄 → `protocol.ts` parse → `useTeleopBridge` 曝 → `MiniMap` 渲染。

不另立訊息——status 既為 robot 身份之器，延之最簡。未配（0 或缺）→ client 不繪，今態如故。

### 渲染

- 純函數入 `map_render.ts`：受 length、width、scale（px/m）、canvas size，出輪廓矩形之螢幕幾何。robot 居中——map mode 箭不旋，矩形亦軸正（長軸縱）；odom 退路箭隨 heading 旋，矩形同旋。**輪廓恆隨箭**，二者一體。
- **zoom gate**：長軸螢幕長 ＜ 14 px → 不繪（遠 zoom 之噪）。gate 算術純函數，vitest 鎖閾。
- 層序：輪廓繪於 robot 箭之**下**、scan 點之上——求四。虛線 accent `#4ec9d6`，1 px，opacity ~0.5，`setLineDash` 之屬；不填。
- ROS 慣例：length＝x 向（前後）、width＝y 向（左右）。螢幕 robot 前向上 → length 縱、width 橫。

### env 直通

| env var | ROS param | default | 注 |
|---|---|---|---|
| `ROBOT_LENGTH_M` | `robot_length_m` | `0.0`（未配） | bumper 至 bumper 全長 |
| `ROBOT_WIDTH_M` | `robot_width_m` | `0.0`（未配） | 輪外緣至輪外緣全寬 |

循 `ROBOT_NAME` 之路四檔齊改：`Dockerfile`、`docker-compose.yml`、`.env.example`（附注：量法、未配則 minimap 不顯輪廓）、`server/launch/teleop.launch.py`。data-schema.md env 表併更。

## 四、設計總綱 — service worker precache

### 取徑

`vite-plugin-pwa`（generateSW 式，workbox 內藏）——vite 出 hashed assets，manifest 注入自動，手書 SW 之 asset 清單維護之苦免矣。

- **precache**：app shell——`index.html`、hashed JS/CSS、favicon。
- **runtime**：hashed assets cache-first（hash 即版本）；navigation network-first 退 cache（離線達殼）。
- **絕不攔**：WS upgrade、`/api/`、`/whep`、video 流、一切非 GET。`navigateFallbackDenylist` ＋ runtime 規則明列之。teleop 實時流不得過 SW 之手。
- **更新**：`registerType: 'autoUpdate'`——舊 SW 即廢，operator 不困於 stale shell。
- **註冊**：薄 wrapper 模組（如 `sw_register.ts`）——`navigator.serviceWorker` 缺則靜默不為；唯 production build 註冊。wrapper 純邏輯 vitest 以 mock 測之。
- **nginx**：`sw.js` 應 `Cache-Control: no-cache`——SW 自體不得被 HTTP cache 釘死，否則更新癱。`nginx.conf` 增 location 條。
- **疆界**：full offline 操作非的也——robot 不在則 teleop 無義。的唯殼速＋弱網達 login。

## 五、共通法度 — 凡務皆遵 (不得違)

1. **trophy TDD**：先紅後綠。C++ 純函數＝gtest；TS 純函數＝vitest 單測；component/hook＝RTL＋jsdom。
2. **git worktree 一務一樹，branch 鏈式**：務一自 main 分；每後務自前務之 branch 分。**終端一次 merge 入 main**（操作者既定之法），非每務一 merge。樹中 docker 須 `--env-file /home/chngyicheng/pocket-teleop/.env`。
3. **Haiku 子代役之，prompt 以 caveman wenyan-ultra**（English technical terms 留 English）；code／commit／test 名用 normal English。
4. **子代不得 commit、不得 stage、不得行任何 git；不得改所司以外之檔**。prompt 必書「do not stage or commit; leave changes in the working tree and report」「on permission denial, stop and report」。留 dirty tree 而報。控者審 `git status`（main repo **與** worktree 兩處——cwd 釘錯之戒）、explicit path stage、commit。
5. **docker 測必 `--build`**；C++ 測循 repository-structure.md 之 volume-mount 式。樹移前 chown 還 root-owned `node_modules`（alpine chown 之法見 AGENTS.md gotchas）。
6. **收束**：測綠 → 控者更 AGENTS.md handover → commit（code＋doc 同）→ 問操作者方 push／merge。

## 六、諸務 (serial，依賴有序)

> **序**：務一 → 務二 → 務三 → 務四 → 務五。footprint（一至三）先，SW（四）獨立而續鏈，docs 收束（五）終。

### 務一 — C++ status 增輪廓尺寸＋env 直通

- **的**：robot 長寬自 env 達 WS status 訊息。
- **治**：teleop_node 增 params `robot_length_m`/`robot_width_m`（double，default 0.0）；status JSON 增 `robot_length`/`robot_width` 欄（恆出，未配＝0）。env 直通四檔（〈三〉表）。
- **測**：gtest：status broadcast 含二欄；param 未設＝0；設則值達。
- **所司檔**：`server/src/teleop_node.cpp`、`server/include/teleop_node.hpp`、`server/test/test_teleop_node.cpp`、`Dockerfile`、`docker-compose.yml`、`.env.example`、`server/launch/teleop.launch.py`。
- **worktree**：`feat/footprint-server`。

### 務二 — client protocol＋bridge 曝尺寸

- **的**：尺寸達 React 層。
- **治**：`protocol.ts` status parse 增二欄（`Number.isFinite` 守，缺或非正 → 0）；`useTeleopBridge` 曝（既有 status state 延之，循現行欄之例）。
- **測**：parse 正例反例（缺欄、負、NaN、string）；bridge 曝值隨 status 變。
- **所司檔**：`web-client/src/protocol.ts`、`web-client/src/hooks/useTeleopBridge.ts`、`web-client/test/protocol.test.ts`、`web-client/test/useTeleopBridge.test.tsx`。
- **worktree**：`feat/footprint-bridge`，自 `feat/footprint-server` 分。

### 務三 — 輪廓幾何＋MiniMap 繪＋view 接線

- **的**：虛線輪廓現於 minimap，zoom-gated，箭下層。
- **治**：`map_render.ts` 增輪廓幾何純函數＋zoom gate（〈三〉渲染節）；`MiniMap` 增 props（length/width），canvas 繪虛線矩形於箭下；map mode 軸正、odom mode 隨 heading；未配或 gate 閉 → 不繪，舊測不破。`MissionControl`（兩處）＋`MissionTablet` 傳新 props。
- **測**：幾何單測鎖向（length→縱、width→橫、heading 旋之向量例）；gate 閾正反；MiniMap RTL：未配→無輪廓且舊 testid 存、配且近 zoom→繪呼發；view 測斷 props 達。
- **所司檔**：`web-client/src/map_render.ts`、`web-client/src/components/shared.tsx`、`web-client/src/views/MissionControl.tsx`、`web-client/src/views/MissionTablet.tsx`、`web-client/test/map_render.test.ts`、`web-client/test/shared.test.tsx`、相應 view 測檔。
- **worktree**：`feat/footprint-render`，自 `feat/footprint-bridge` 分。

### 務四 — service worker precache

- **的**：app shell precache，實時流毫不經 SW。
- **治**：`vite-plugin-pwa` 入 devDependencies（lockfile 併更）；`vite.config.ts` 配 generateSW（precache 殼、denylist〈四〉所列、autoUpdate）；新 `sw_register.ts` 薄 wrapper（production 唯、serviceWorker 缺則默）；`main.tsx` 呼之；`nginx.conf` 增 `sw.js` no-cache 條。
- **測**：wrapper vitest（mock navigator：缺→不擲不呼、有→register 呼以正 path、非 production→不呼）；vite build 於 docker 內成且 `sw.js` 出（build 驗，非單測）。
- **所司檔**：`web-client/package.json`、`web-client/package-lock.json`、`web-client/vite.config.ts`、`web-client/src/sw_register.ts`、`web-client/src/main.tsx`、`web-client/test/sw_register.test.ts`、`web-client/nginx.conf`。
- **worktree**：`feat/sw-precache`，自 `feat/footprint-render` 分。

### 務五 — docs 收束

- **的**：docs 與實況齊。
- **治**：README 增輪廓配法＋SW 注；`memory/agent-guides/data-schema.md` env 表增二 var＋status 欄注；TROUBLESHOOTING 增「stale shell 之察」條（SW 更新滯之 hard-reload 法）；AGENTS.md handover＋Milestones 更。
- **測**：全四 suite 綠（webclient／auth／video-bridge／C++ 對 baseline 556/51/19/69 不退）。
- **所司檔**：`README.md`、`TROUBLESHOOTING.md`、`memory/agent-guides/data-schema.md`、`AGENTS.md`。
- **worktree**：`feat/footprint-sw-docs`，自 `feat/sw-precache` 分；終端控者一次 merge 鏈入 main。

## 七、險與未決

| 險 | 度 |
|---|---|
| SW cache 釘死舊殼——operator 見舊 UI 而不自知 | autoUpdate ＋ nginx no-cache on `sw.js`；TROUBLESHOOTING 載 hard-reload 法 |
| SW 誤攔 WS／WHEP——teleop 實時流斷 | denylist 明列＋runtime 規則唯 GET 靜態；務四測斷 denylist 配在 |
| vite-plugin-pwa 版本與 vite 5 合否 | 子代於 docker build 內驗；不合則退 vite 5 相容版 |
| 輪廓向之誤（length/width 顛倒、旋向反） | 幾何單測鎖向量例；hardware-verify 條入 deviations.md（既有 screen-direction 條之側） |
| status 訊息欄增——舊 client 緩存頁遇新 server | parse 守缺欄（0 退），雙向相容 |
| 未配尺寸之 robot | default 0 → 不繪，今態如故，無一測破 |

## 八、與 backlog 之界

- **不涉**：hardware-verify screen-direction（操作者實機務，deviations.md 既載）、`v1.0.0` tag（gated on operator checks）、full offline PWA（manifest icon install 之屬——殼速唯的）。
- Feature pool 之 Map view 他日承 minimap 管道時，輪廓 props 可併傳——彼 plan 屆時自引。
