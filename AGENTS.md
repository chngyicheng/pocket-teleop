# pocket-teleop — 代理指南

> 漸進披露：所需方讀。始於**第一層**，需深者進。

---

## 舊則損益之法

**`CLAUDE.md` 為 `AGENTS.md` 之符號連結。改則改 `AGENTS.md`，勿動 `CLAUDE.md`。**

**代碼改，此文同提交。**

交接狀態節，新代理首讀之處。以零上下文讀者為對象而書：

- **Head SHA** — 更新為即將提交之 commit（暫存後提交前執行 `git rev-parse --short HEAD`）
- **任務表** — 標記 ✅ 完成；移 ⬜ 下一 至後任；Notes 記所創物或通過測試名
- **已知偏差** — 每偏差增一行，附令冷審者信服之受納理由
- **無代詞 "we" / "I" / "our"** — 第三人稱；讀如文檔，非對話

詳見 [version-control.md](memory/agent-guides/version-control.md)。

---

## 交接狀態 — 從此續

> **致下一代理：** v0.10.0 竣。測試全通（34 auth-server / 119 webclient / 19 video-bridge）。v0.8.0–v0.10.0 諸計劃里程均已實現。「Apply」按鈕在實況 MediaMTX 下之運行時驗證尚未完成。

**Head SHA：** `3f7387c`（截至 2026-04-17）

### 已竣里程

| 里程碑 | 測試數 | 標籤 |
|---|---|---|
| Server（ROS2 WebSocket、command handler、teleop node） | — | `v0.1.0-server` |
| Web client v0.1.0（protocol、connection、gamepad handler、teleop client、集成測試） | 10 | `v0.1.0-client` |
| Practical gaps（gamepad profiles、reconnection、calibration UI） | 43 | `v0.2.0` |
| Frontend UI（settings.ts、onTwist、responsive index.html 重寫） | 43 | `v0.3.0` |
| Touch joystick + UI 磨光（TouchJoystick 模塊、namespace 設置、gamepad 切換、雙指修復、UI 細化） | 60 | `v0.4.0` |
| v0.5.0（KeyboardHandler、TeleopClient 修復 retry + onPong、TouchJoystick hint、axis remap、輸入模式欄、last-seen pill） | 63 | `v0.5.0` |
| 視頻串流（mediamtx、video-bridge、WhepClient、/video proxy、WebRTC 面板） | 85 webclient / 31 auth / 19 video-bridge | `v0.6.0` |
| 視頻源選擇器（auth-server /mediamtx-api proxy、VideoSourcePicker 模塊、設置 UI）+ 404 修復 | 34 auth / 99 webclient / 19 video-bridge | `v0.7.0` |
| v0.8.0 控制可靠性（鍵盤 key-up 即時觸發、e-stop 按鈕 + 空格、calibration Ready 階段） | 34 auth / 103 webclient / 19 video-bridge | `v0.8.0` |
| v0.9.0 反饋與磨光（RTSP URL 驗證、WhepClient 串流健康徽章、TeleopClient 延遲顯示） | 34 auth / 117 webclient / 19 video-bridge | `v0.9.0` |
| v0.10.0 機器人遙測（odom 訂閱、廣播、protocol odom 類型、TeleopClient onOdom、UI 面板 + 羅盤） | 34 auth / 119 webclient / 19 video-bridge | `v0.10.0` |

### 已知偏差（後續工作仍相關）

| 偏差 | 位置 | 受納理由 |
|---|---|---|
| 一切建置須 `--network=host` | `docker-compose.yml`、建置指令 | Pi5 於 Docker bridge 網絡中不能解析 DNS — 省略則建置靜默失敗 |
| `#define ASIO_STANDALONE` 禁用 | `teleop_server.hpp` 及一切新服務器 WebSocket 代碼 | Dockerfile 安裝 `libboost-system-dev`（Boost ASIO）；standalone ASIO（`libasio-dev`）未安裝 |
| `docker-compose.yml` 環境值須加引號 | `docker-compose.yml` | Docker Compose v2.35+ 無法解析 `${VAR:?msg: with colon}` 中之未加引號 YAML 字符串 |
| `moduleResolution: node16`（非 `bundler`） | `web-client/tsconfig.json` | `bundler` 允許無擴展名導入，於 nginx 服務之 ES 模塊中 404；`node16` 強制 `.js` 擴展名 |
| `module: Node16`（非 `ESNext`） | `web-client/tsconfig.json` | TypeScript 5 拒絕 `module: ESNext` + `moduleResolution: node16`，報 TS5110 |
| `node:22-slim`（非 `node:20-slim`） | `web-client/Dockerfile.webclient` | Node 20 無原生 `WebSocket` 全局對象；連接嘗試靜默失敗 |
| `navigator` 守衛須查 `getGamepads`，非僅 `navigator` | `web-client/src/gamepad_handler.ts` | Node 22 全局定義 `navigator` 但無 `getGamepads`；裸 `typeof navigator` 守衛崩潰 |
| `TeleopClient` 從 `onError` 和 `onclose` 雙觸 retry | `web-client/src/teleop_client.ts` | Node.js 22 原生 WebSocket 對被拒連接僅觸 `onerror`；`retryPending` 守衛防止瀏覽器雙觸時重複調度 |
| `Touch` 構造函數在測試中 shimmed；`jsdom` 加入 devDeps | `web-client/test/touch_joystick.test.ts`、`web-client/package.json` | jsdom 24 暴露 `TouchEvent` 但非 `Touch` 全局構造函數；shim 定義最小類滿足構造調用 |
| `.drawer-page[hidden] { display: none }` 與 `[hidden]` 並用 | `web-client/index.html` | 作者 CSS `.drawer-page { display: flex }` 通過層疊覆蓋 UA `[hidden] { display: none }`；複合選擇器優先級更高，恢復正確行為 |
| `TouchJoystick` 用文檔級 Pointer Event 監聽器，無 `setPointerCapture` | `web-client/src/touch_joystick.ts` | Brave 在 `setPointerCapture` 啟用時將第二指的 `pointerdown` 路由至捕獲元素，損壞第二操縱桿的原點。修復：在 `document` 監聽；用 `e.target` 路由各 `pointerdown` 至正確區域；`_activeTouchIds` 模塊級集合防止瀏覽器復用 ID 時兩區域認領同一 `pointerId`。`touch-action: none` 仍須於區域元素設置。 |
| `PointerEvent` 在測試中 shimmed；復用 jsdom shim 模式 | `web-client/test/touch_joystick.test.ts` | jsdom 24 不暴露 `PointerEvent` 全局構造函數；shim 鏡像早前 `Touch` shim |
| `style.display = ''` 不能顯示帶 CSS `display:none` 之元素 | `web-client/index.html` applyNamespace | 設內聯 display 為 '' 移除內聯覆蓋，CSS display:none 勝出；用 'block' 顯式顯示 |
| `Dockerfile` CMD 用 `${VAR:+-p name:=val}` 處理可選機器人參數 | `Dockerfile` CMD | ROS2 拒絕 `-p robot_name:=`（空值）；未加引號的含空格值引致詞分割；修復：`${ROBOT_NAME:+-p \"robot_name:=${ROBOT_NAME}\"}`——未設時跳過，設置時加引號；計劃僅更新 `teleop.launch.py` — Dockerfile 為計劃遺漏之獨立調用路徑 |
| `navigator.maxTouchPoints` 在 Brave 中返回 0（指紋保護） | `web-client/src/touch_joystick.ts` | Brave 無論設備均將 `maxTouchPoints` 置零；改用 `matchMedia('(pointer: coarse)')` 不被 Brave 抑制。Brave on Android 仍不顯示操縱桿提示——根因未知，待查。 |
| `vitest.config.ts` 加入顯式 `include: ['test/**/*.test.ts']` | `auth-server/vitest.config.ts` | Vitest 默認 glob 未發現 `test/` 子目錄中的測試；顯式配置無副作用 |
| `(FileStoreCreator as any)(session)` 強制轉型 | `auth-server/src/app.ts` | session-file-store 類型定義將導出聲明為類而非工廠；`as any` 強制轉型為社區公認做法 |
| `store.reapAsync` 調用在 `createApp` 中省略 | `auth-server/src/app.ts` | `reapAsync` 為可選維護；定期清理仍通過 `reapInterval: 3600` 運行；省略無正確性影響 |
| `(wsProxy as any).upgrade!` 非空斷言 | `auth-server/src/proxy.ts` | http-proxy-middleware v2 類型定義將 `upgrade` 標為可選，但構造函數始終賦值；外部審查後移除守衛 |
| `TELEOP_SERVER_URL` 默認 `http://` 非 `ws://` | `auth-server/src/index.ts` | http-proxy-middleware 需要 HTTP 目標 URL 用於 WebSocket 代理；`ws://` 引致協議錯誤 |
| `auth-server/Dockerfile.auth` 以應用所有權創建 `/data` | `auth-server/Dockerfile.auth` | 無顯式 `mkdir + chown`，卷掛載 `/data` 默認 root 所有，`app` 用戶不能寫入憑據 |
| `webclient-test` 通過 auth-server 代理路由 | `docker-compose.yml` | 集成測試走完整路徑（瀏覽器→auth-server→teleop-server），匹配生產拓撲；在 Task 8 中發現 |
| `Dockerfile`（C++ 服務器）移除 `token` 啟動參數 | `Dockerfile` | TELEOP_TOKEN 在 Task 7 退役後須移除 token 參數；Dockerfile CMD 為計劃遺漏之獨立調用路徑 |
| `.accordion-body[hidden] { display: none }` 必備 | `web-client/index.html` | 作者 CSS `.accordion-body { display: flex }` 覆蓋 UA `[hidden]` 屬性；複合選擇器恢復正確行為（與 `.drawer-page[hidden]` 同模式） |
| Eyeball SVG 在三文件中重複 | `login.html`、`change-password.html`、`index.html` | 各為獨立服務端渲染 HTML；共享提取不值複雜度；每份 SVG 約 500 字節 |
| Change-password 路由按上下文行為不同 | `auth-server/src/routes/auth.ts` | 強制首次登錄（mustChangePassword=true）保持 session 並重定向至 `/`；自願賬戶頁修改銷毀 session 並重定向至 `/auth/login` 強制重新認證 |
| `Cache-Control: no-store` 設於所有已認證代理響應 | `auth-server/src/app.ts` | 防止瀏覽器磁盤緩存和 bfcache（Chrome/Firefox）在登出後提供舊頁面；取捨：代理靜態資產無緩存——可接受，因 nginx 在生產中直接提供資產 |
| 賬戶頁表單用 `fetch()` 非原生 HTML POST | `web-client/index.html` | 原生表單 POST 將瀏覽器導航至純文本錯誤響應（如 `res.status(401).send('...')`）；fetch 允許在現有 `.form-error` 元素中內聯顯示錯誤 |
| Auth 在 `visibilitychange` 上的檢查每次切換標籤均觸發 fetch | `web-client/index.html` | `/auth/me` 為微小 JSON 響應（約 50 字節）；頻率受用戶操作限制（切換標籤、手機喚醒），非輪詢；取捨：每次可見性更改一次額外請求——對 session 安全可接受 |
| Docker healthcheck for auth-server 用內聯 `node -e` | `docker-compose.yml` | `node:22-slim` 基礎鏡像無 `wget` 或 `curl`；內聯 Node.js HTTP 請求零依賴 |
| Docker healthcheck for teleop-server 用 `bash /dev/tcp` | `docker-compose.yml` | ROS humble 基礎鏡像有 `bash` 無 HTTP 客戶端工具；`/dev/tcp` 為 bash 內置，無需額外依賴測試 TCP 連通性 |
| `TELEOP_SERVER_URL` 可從 `.env` 配置 | `docker-compose.yml` | `host-gateway`（解析 `host.docker.internal`）需 Docker >= 20.10；舊版 Docker 靜默失敗；URL 可通過 `.env` 覆蓋，用戶無需編輯 compose 即可替換 LAN IP |
| `fastrtps_profiles_observer.xml` 加入用於跨機器 ROS2 觀測 | `server/fastrtps_profiles_observer.xml` | 多播損壞之機器（`[Errno 19] No such device`）無法通過默認 SPDP 多播發現 ROS2 參與者；需要 `useBuiltinTransports=false` + `initialPeersList` 指向機器人 IP 的純單播配置；主服務器配置不變，因其已接受任何白名單接口上的單播 SPDP |
| `auth-server` 改為 `network_mode: host`；`webclient` 在迴環上暴露端口 18080 | `docker-compose.yml` | UFW（主機上啟用）通過 INPUT 鏈阻止從 Docker bridge 網絡到主機 bridge-gateway IP（`172.18.0.1`）的入站 TCP；`host.docker.internal` 映射到不同 bridge 上的 docker0（`172.17.0.1`），同樣被阻止；auth-server 到 teleop-server（主機網絡）的唯一可靠路徑是 host 模式網絡，兩者均見 `localhost:9091`；webclient 在 `127.0.0.1` 暴露端口 18080，auth-server 可代理而不跨 bridge 邊界；`webclient-test` 亦切換至 host 網絡以達 `localhost:8080` |
| `auth-server/src/index.ts` 的 `PORT` 環境變量和 `detectGateway()` 移除 | `auth-server/src/index.ts` | `PORT` 為 host 網絡部署在端口 8080 上而添加；`detectGateway()` 為 UFW 阻止 bridge→host 流量的變通方案，一旦使用 host 網絡則無需 |
| `WhepClient` 通過 mocked `RTCPeerConnection` shim 測試 | `web-client/test/whep_client.test.ts` | jsdom 24 無 `RTCPeerConnection`；shim 在測試文件中定義（與 `Touch` 和 `PointerEvent` shim 同模式）；13 個測試覆蓋 connect、retry、stop、back-off、onStream、onClose |
| `video-bridge` 通過 pytest 在純 pipeline 函數上測試 | `video-bridge/test_video_bridge.py` | 無硬件無法測試 GStreamer 管道；pipeline 字符串構建函數（`_compressed_pipeline`、`_raw_pipeline`、`_FORMAT_MAP`）為純函數，19 個 pytest 測試完整覆蓋 |
| `<img id="video-img">` 移除無替換 | `web-client/index.html` | 手動 MJPEG URL 輸入無用戶（流 URL 從不在會話間持久化）；WebRTC/WHEP 取代之；MJPEG URL 支持可在實現 RTSP/UDP 輸入源時重加 |
| `loadVideoUrl` / `saveVideoUrl` / `clearVideoUrl` 從 settings.ts 導入中移除 | `web-client/index.html` | MJPEG 路徑移除後不再需要；`settings.ts` 函數仍在源中供將來使用 |
| `vi.runAllMicrotasksAsync` 替換為 `flushPromises` 循環 | `web-client/test/whep_client.test.ts` | `vi.runAllMicrotasksAsync` 在 Vitest 2.x 加入；本項目用 Vitest 1.6.1；十個連續 `await Promise.resolve()` 調用可靠地刷新所有待處理微任務 |
| `monkeypatch.setattr(vb, 'MEDIAMTX_RTSP', ...)` 替代 `importlib.reload` | `video-bridge/test_video_bridge.py` | `importlib.reload` 就地重寫模塊字典，測試後不恢復；`monkeypatch.setattr` 干淨地修補和恢復模塊級常量 |
| `video-bridge-test` compose 服務運行 `python3 -m pytest`（非 `pytest`） | `docker-compose.yml`、`video-bridge/Dockerfile.video_bridge` | ROS Humble 基礎鏡像中 `pip3 install pytest` 將二進制放在非 `$PATH` 位置；`python3 -m pytest` 通過安裝模塊始終有效 |
| `/mediamtx-api` 前綴在代理層剝離至 `/v3` | `auth-server/src/app.ts` | 避免在公開 auth-server 暴露原始 `/v3` 路徑；在 `/video`（WHEP 媒體）和 `/mediamtx-api`（配置 API）之間清晰分離 |
| Body parsers 僅作用於 `/auth`（非全局） | `auth-server/src/app.ts` | 全局 `express.json()` 在代理管道之前消耗請求流；代理請求無限期掛起（永不結束）；限定於 `/auth` 使流對代理路由保持完整 |
| `pathRewrite: { '^/mediamtx-api': '/v3' }` 替代手動 `req.url` 變更 | `auth-server/src/app.ts`、`auth-server/src/proxy.ts` | http-proxy-middleware v2 在 `prepareProxyRequest` 中重置 `req.url = req.originalUrl`，丟棄任何先前變更；`pathRewrite` 在重置後運行，因此正確生效 |
| 診斷 PATCH 測試加入 auth-server 測試套件 | `auth-server/test/auth.test.ts` | 現有 `/mediamtx-api` 測試僅查「非 302」且未向 mock 傳遞 `mediaMtxApiUrl`——未能驗證任何事；新測試確認 PATCH 方法、`/v3` 路徑和 body 均正確到達 mock |
| `source: redirect` 至不存在路徑用于禁用流 | `web-client/src/video_source.ts` | MediaMTX 無顯式「禁用」狀態；重定向至虛空路徑使 WHEP 客戶端收到 404，WhepClient 處理此情況並顯示佔位符 |
| 視頻源狀態存於 `localStorage` 並在加載時重新應用 | `web-client/src/video_source.ts` | MediaMTX 運行時配置易失（重啟即丟）；頁面加載時重新應用可修正漂移，無需添加服務端持久化層 |
| `VideoSourcePicker` 以 `fetchFn` 為構造器選項 | `web-client/src/video_source.ts` | 無需 `vi.stubGlobal` 副作用即可進行純 vitest 測試；與 `WhepClient` 回調相同的依賴注入模式 |
| `boundKeyUp` 即時觸發 twist（非輪詢驅動） | `web-client/src/keyboard_handler.ts` | 輪詢間隔（200ms）產生滑行窗口；key-up 處理器原子地重新計算並觸發更新後的 twist，無需複製輪詢邏輯 |
| 空格 e-stop 在 `activeElement` 為 input/textarea/select 時跳過 | `web-client/index.html` | 空格為文本域中的有效字符；標籤檢查防止在輸入 RTSP URL 或配置文件名時意外停止 |
| Gamepad calibration 分為提示 + 採樣兩個階段 | `web-client/index.html` | 原始單階段採樣在指令顯示後立即開始；用戶無時間在採樣開始前調整搖桿位置 |
| `validate()` 在 `VideoSourcePicker` 上，非 `buildMtxSource` | `web-client/src/video_source.ts` | `buildMtxSource` 為純數據函數；驗證為策略關注點，屬於有狀態類 |
| 延遲更新僅在閒置時（無主動駕駛） | `web-client/src/teleop_client.ts` | Keepalive ping 僅在 200ms 內無 twist 發送時觸發；主動駕駛時連續 twist 抑制 ping；此為正確取捨——閒置時的延遲比駕駛時更有用 |
| `WhepState` `'error'` 與 `'retrying'` 不同 | `web-client/src/whep_client.ts` | `onError` 觸發於觸發 retry 的瞬態流錯誤（如源不可用）；真正的 error 狀態保留給不重試的 fetch/網絡故障 |
| Odom 在服務端以 10 Hz 節流 | `server/src/teleop_node.cpp` | `/odom` 常以 50+ Hz 發布；每條消息通過 WebSocket 發送將飽和 Raspberry Pi 的上行鏈路；10 Hz 足夠顯示 |
| 航向以弧度發送；UI 轉換為度 | Protocol、`web-client/index.html` | 弧度為原生 ROS2 單位；UI 中轉換保持協議整潔，避免服務端度轉換的浮點精度損失 |
| Odom 面板在收到首條消息前隱藏 | `web-client/index.html` | 不發布 `/odom` 的機器人不應顯示陳舊或空白面板；默認隱藏防止混淆 |
| `broadcast()` 忽略 `ws_server_.send` 的 `error_code` | `server/src/teleop_server.cpp` | 客戶端斷開通過 `on_close` 將 `has_client_` 置 false；對陳舊 send 的靜默錯誤無害，避免競態條件檢查 |

---

## 文檔索引

| 所需 | 查閱 |
|---|---|
| 立即運行堆棧 | 第一層（下） |
| 構建、測試、docker 指令 | [repository-structure.md](memory/agent-guides/repository-structure.md) |
| 技術棧與依賴 | [techstack.md](memory/agent-guides/techstack.md) |
| 消息協議與數據類型 | [data-schema.md](memory/agent-guides/data-schema.md) |
| Git 工作流與文檔更新規則 | [version-control.md](memory/agent-guides/version-control.md) |
| TDD 標準、護欄、任務導向 | [project-skills.md](memory/agent-guides/project-skills.md) |
| Server 實現計劃 | `docs/superpowers/plans/2026-03-27-server-implementation.md` |
| Server 設計規格 | `docs/superpowers/specs/2026-03-27-server-design.md` |
| Web client 實現計劃 | `docs/superpowers/plans/2026-03-28-client-implementation.md` |
| Web client 設計規格 | `docs/superpowers/specs/2026-03-28-client-design.md` |
| Practical gaps 實現計劃 | `docs/superpowers/plans/2026-03-28-practical-gaps-implementation.md` |
| Practical gaps 設計規格 | `docs/superpowers/specs/2026-03-28-practical-gaps-design.md` |
| Frontend UI 實現計劃 | `docs/superpowers/plans/2026-03-28-frontend-ui-implementation.md` |
| Frontend UI 設計規格 | `docs/superpowers/specs/2026-03-28-frontend-ui-design.md` |
| Touch joystick 實現計劃 | `docs/superpowers/plans/2026-03-29-touch-joystick-implementation.md` |
| Touch joystick 設計規格 | `docs/superpowers/specs/2026-03-28-touch-joystick-design.md` |
| **v0.5.0 實現計劃** | `docs/superpowers/plans/2026-03-30-v0.5.0-implementation.md` |
| v0.5.0 設計規格 | `docs/superpowers/specs/2026-03-30-v0.5.0-design.md` |
| **Auth server 實現計劃** | `docs/superpowers/plans/2026-04-03-auth-server-implementation.md` |
| Auth server 設計規格 | `docs/superpowers/specs/2026-04-03-auth-server-design.md` |
| **視頻串流實現計劃** | `docs/superpowers/plans/2026-04-09-video-streaming-implementation.md` |
| **視頻源選擇器實現計劃** | `docs/superpowers/plans/2026-04-09-video-source-picker-implementation.md` |
| **v0.8.0 控制可靠性計劃** | `docs/superpowers/plans/2026-04-11-v0.8.0-control-reliability.md` |
| **v0.9.0 反饋與磨光計劃** | `docs/superpowers/plans/2026-04-11-v0.9.0-feedback-polish.md` |
| **v0.10.0 機器人遙測計劃** | `docs/superpowers/plans/2026-04-11-v0.10.0-robot-telemetry.md` |

**何時更深：** 指南文件不能解答 → 讀相關規格。規格不能解答 → 讀計劃。勿預先讀取三者。

---

## 第一層 — 何物，如何運行

**pocket-teleop** 通過 WebSocket 從手機瀏覽器駕駛 ROS2 機器人。Auth server 處理登錄、代理 web client 和 WebSocket，通過 ROS2 向 `/cmd_vel` 發布速度指令。

**ROS2 在 Docker 內運行。主機僅需 Docker 和 Docker Compose。**

```bash
# 先複製 .env.example 至 .env 並填入所有值：
cp .env.example .env
# 編輯 .env：設置 TELEOP_ADMIN_USER、TELEOP_ADMIN_PASSWORD、SESSION_SECRET

docker compose up --build

# 停止
docker compose down
```

Web client（手機瀏覽器）：`http://<robot-ip>:8080` — 首次訪問顯示登錄提示。

**憑據：** 每機器人單一操作員。首次運行：用 `.env` 值登錄——服務器強制立即更改密碼。新憑據存於 `auth-data` Docker 卷，跨重啟和鏡像重建持久。重置：`docker compose down -v`（刪除卷）後重啟。

構建指令、測試指令、文件結構 → [repository-structure.md](memory/agent-guides/repository-structure.md)

---

## 執行模式 — 子代理驅動開發

**所有實現工作使用 `superpowers:subagent-driven-development` 技能。**

控制器每任務派遣新子代理。各子代理：
1. 嚴格按計劃實現
2. 運行測試（僅 Docker — 絕不裸 `npm`）
3. 在與代碼同一 commit 中更新 `AGENTS.md` 交接表
4. 提交並匯報

每個子代理完成後，控制器進行兩輪審查（規格合規，然後代碼質量）後標記任務完成並繼續。

見 `docs/superpowers/plans/` 獲取當前實現計劃。

---

## 任務完成典則 — 每任務強制執行

**每任務、每次、無例外。**

1. **運行所有測試** — 零失敗方可繼續。先修失敗。套件綠燈前勿進行第 2 步。
2. **更新所有文檔** — 與代碼同一 commit：
   - `AGENTS.md` 交接表：標記任務 ✅ 完成，推進 ⬜ 下一，更新 Notes 和 Head SHA
   - 任何已更改的指南文件（見 [version-control.md](memory/agent-guides/version-control.md) 中「文檔持續更新」表）
3. **提交** — 每任務一個 commit，代碼 + 文檔合併
4. **請求推送** — 精確說：`"Committed as <hash>. Ready to push — shall I?"`
5. **等待** — 用戶明確確認推送並給予許可前勿開始下一任務

跳過任何步驟違反工作流。測試為門——通過前一切停止。

---

## 第二層 — 開發工作流

構建和測試指令見 [repository-structure.md](memory/agent-guides/repository-structure.md)。

分支策略、提交約定、文檔更新規則見 [version-control.md](memory/agent-guides/version-control.md)。

TDD 標準、代碼質量標準、執行規則見 [project-skills.md](memory/agent-guides/project-skills.md)。

---

## 第三層 — 架構與數據

語言、運行時、依賴詳情見 [techstack.md](memory/agent-guides/techstack.md)。

組件層圖和關鍵文件映射見 [repository-structure.md](memory/agent-guides/repository-structure.md)。

消息協議、C++ 結果類型、ROS2 參數、環境變量見 [data-schema.md](memory/agent-guides/data-schema.md)。

---

## 第四層 — 任務指引

任務導向表（各任務創建何物及須通過哪些測試）見 [project-skills.md](memory/agent-guides/project-skills.md)。

完整逐步代碼：`docs/superpowers/plans/2026-03-27-server-implementation.md`

完整協議和組件規格：`docs/superpowers/specs/2026-03-27-server-design.md`
