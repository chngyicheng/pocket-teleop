# 修補計劃 — Codebase Review Fixes (2026-05-27)

> 緣起：依 `docs/2026-05-27-codebase-review.md` 所列三十條缺陷，分六斥候並修。各斥候嚴限其域，毋越雷池。

---

## 凡例

- 每斥候惟改其「許入文件」之屬。許入之外，雖一字勿動。
- 不更 AGENTS.md。不更 MEMORY 索引。不寫新文檔。架構師後統整。
- 不運 docker compose 測。架構師末路統運。
- 改既訖，回報：所改文件、所改行範圍、所應對之 finding 編號、所未解之事（若有）。
- 文件已存者用 Edit。新文件用 Write。讀必先於改。

---

## 斥候一 — 前端 UI 急修與 WHEP 競態

**目標 findings:** #1（critical 筆誤）、#13（WHEP start 重入）、#14（校準 setInterval 競）、#15（gamepad 探測 setInterval 不釋）、#19（MJPEG localStorage 防禦驗證）、#20（ICE timer 不釋）、#30（WHEP 雙啟測補）

**許入文件:**
- `web-client/index.html`
- `web-client/src/whep_client.ts`
- `web-client/test/whep_client.test.ts`

**禁觸:**
- `web-client/src/` 其餘文件
- `web-client/test/` 其餘文件
- 任何非 `web-client/` 之文件

**要點:**
- #1 — 第 951、952 兩行 `mjpegImgElEl` 改為 `mjpegImgEl`。一行一字。
- #13 — `whep_client.ts` 之 `_connect` 內每 `await` 後檢 `this.pc === pc`，否則 return；防舊次 _connect 完成於新 _connect 啟後。
- #14 — `index.html` 之 `beginSampling` 首句加守：`calSampleInterval !== null` 即 return。
- #15 — `index.html` 第 1244 setInterval 之 handle 存於變量，探得 gamepad 則 clearInterval。
- #19 — `index.html` 之啟動 IIFE 載 localStorage 設值前，調 `picker.validate(mode, url)`；不合則回 ros2 默設。
- #20 — `whep_client.ts` `_waitForIceGathering` 存 setTimeout handle，gathering 完即 clearTimeout。
- #30 — `whep_client.test.ts` 補測：`start(); start();` 僅一次 fetch；亦補 `showVideoStream` 之單元測（mock MediaStream，verify `videoEl.srcObject` 設、`mjpegImgEl.style.display === 'none'`），但 showVideoStream 為 inline JS，難測。若實難，惟補 WHEP 雙啟與 ICE timer 釋之測即可，並於回報註明。

---

## 斥候二 — MediaMTX 端口綁定加固

**目標 findings:** #6（config API 公曝）、#7（RTSP ingest 公曝）

**許入文件:**
- `mediamtx.yml`
- `mediamtx-test-config.yml`

**禁觸:**
- `docker-compose.yml`
- 任何 `mediamtx*.yml` 以外之文件

**要點:**
- `apiAddress: :9997` 改 `apiAddress: 127.0.0.1:9997`
- `rtspAddress: :8554` 改 `rtspAddress: 127.0.0.1:8554`
- video-bridge 與 mediamtx 同 host network，loopback 通；auth-server 亦同 host network，亦通。
- `mediamtx-test-config.yml` 同理改。但若集成測之 `mediamtx-integration-test` 容器依 0.0.0.0 綁，須驗。讀該文件首察結構，若僅複用 `paths`、不變綁，則保 `rtspAddress`、`apiAddress` 為 loopback；若集成測必須跨容器（不太可能，因皆 host network），則保留 test-config 之 `0.0.0.0`、僅改正式 `mediamtx.yml`。回報定論。

---

## 斥候三 — C++ Server 全域修補

**目標 findings:** #2（teleop-server 9091 公曝）、#4（test_command_handler.cpp 空）、#5（NaN bypass）、#11（namespace 默蓋）、#21（broadcast 錯靜默）、#22（watchdog race）

**許入文件:**
- `server/src/command_handler.cpp`
- `server/include/command_handler.hpp`
- `server/src/teleop_server.cpp`
- `server/include/teleop_server.hpp`
- `server/src/teleop_node.cpp`
- `server/include/teleop_node.hpp`
- `server/test/test_command_handler.cpp`
- `server/test/test_teleop_server.cpp`
- `server/test/test_teleop_node.cpp`

**禁觸:**
- `server/CMakeLists.txt`（除非新測文件需新加目標——查既有 CMakeLists.txt 看是否已有 test_command_handler 目標；若已有，毋動）
- `server/package.xml`
- `server/launch/`
- `Dockerfile`

**要點:**
- #2 — `teleop_server.cpp` 第 38 `ws_server_.listen(port_)` 改為 `ws_server_.listen("127.0.0.1", port_)`（或 `ws_server_.listen(asio::ip::tcp::endpoint(asio::ip::address::from_string("127.0.0.1"), port_))`，依 websocketpp API 而定）。先讀 websocketpp 之 `listen` 重載：若不支字符串重載，則用 asio endpoint。`test_teleop_server.cpp` 必驗該端口仍可由 localhost 連接，故測無須改。
- #5 — `command_handler.cpp` 第 24-26 取 lx/ly/az 後、第 28-33 範圍檢前，加 `std::isfinite` 守。include `<cmath>`。
- #4 — `test_command_handler.cpp` 補測。讀 `test_teleop_server.cpp` 識其用 gtest 之風（include、TEST 宏、main）。補測：valid twist、邊界 ±1.0、越界（+1.01、-1.01）、NaN（quiet_NaN）、Infinity、missing fields、wrong type（字符串值）、ping、unknown type、malformed JSON、deeply nested。亦驗 `CMakeLists.txt` 是否已含 test_command_handler 目標；若無，亦補（此唯一可改 CMakeLists.txt 之情）。
- #11 — `teleop_node.cpp` 第 22-24，namespace 非空時，當以 `cmd_vel_topic` 為基（去前導 `/`，前綴 namespace）。例：base=`/cmd_vel` ns=`robot1` → `/robot1/cmd_vel`；base=`/something_else` ns=`robot1` → `/robot1/something_else`。改後測 `test_teleop_node.cpp` 須驗。
- #21 — `teleop_server.cpp` 第 113-116 `broadcast` 加 `if (ec) { /* RCLCPP_WARN 無 ROS 引用，惟用 std::cerr 或抑或入 callback 報於 TeleopNode */ }`。最簡：靜記入 stderr 即可，附 ec.message()。
- #22 — `watchdog_loop` 內，超時時序：先持 `client_mutex_`，set `has_client_ = false` 同步，然後 post 到 io_service 行 close。觀現邏輯：lambda 內仍持 `client_mutex_` 後 close——析其競窗，重排為先清 flag 後 schedule close。

---

## 斥候四 — Web Client TS 核心

**目標 findings:** #3（exponential backoff 缺）、#23（keyboard DRY）、#24（keyboard activity 不對稱）、#25（settings.ts localStorage try/catch）、#29（protocol 連通 boolean 守）

**許入文件:**
- `web-client/src/teleop_client.ts`
- `web-client/src/keyboard_handler.ts`
- `web-client/src/settings.ts`
- `web-client/src/protocol.ts`
- `web-client/test/keyboard_handler.test.ts`
- `web-client/test/settings.test.ts`
- `web-client/test/protocol.test.ts`

**禁觸:**
- `web-client/src/` 其餘文件（特別：`whep_client.ts`、`connection.ts`、`gamepad_handler.ts`、`gamepad_profiles.ts`、`touch_joystick.ts`、`video_source.ts`）由他斥候掌之
- `web-client/index.html`
- `web-client/test/integration.test.ts`、`web-client/test/whep_client.test.ts`、其餘測文件

**要點:**
- #3 — `teleop_client.ts` 第 127-137 `scheduleRetry`，delay 改為 `Math.min(this.retryIntervalMs * 2 ** (this.retryAttempt - 1), 30_000)`。上限 30 秒。retryAttempt 既已遞增於 setTimeout 之外，無須他變。
- #23 — `keyboard_handler.ts` 第 36-40 與第 71-74 之 twist compute 提取為私法 `private computeTwist(): { lx: number; ly: number; az: number }`，兩處皆調之。
- #24 — `keyboard_handler.ts` 第 28 onActivity 觸於 keydown 不檢 enabled，第 34 onTwist 觸於 keyup 檢 enabled。一律加 `if (!this.enabled) return;` 守於兩 handler 之首，使其行為對稱。
- #25 — `settings.ts` 第 17 `loadVideoUrl` 與第 24 `clearVideoUrl`（若仍存）之 localStorage 調以 try/catch 包，效法 `gamepad_profiles.ts` 之 pattern。讀 `gamepad_profiles.ts` 第 62-68 觀其風。
- #29 — `protocol.ts` parseMessage 之 status 分支：加 `typeof msg['connected'] === 'boolean'` 守；非 boolean 則回 ParseError。讀現行 protocol.ts 觀 parseMessage 返回類型，須一致。
- 三測文件補：keyboard DRY 重構勿改測之預期（行為不變）；settings localStorage 之 throw 用 `vi.stubGlobal` 模擬；protocol 加一例 `{type:"status"}` 缺 connected 字段，驗回 ParseError 或設默。

---

## 斥候五 — video_bridge 並發與清理

**目標 findings:** #10（鎖併發）、#26（retry_timer 不釋）

**許入文件:**
- `video-bridge/video_bridge.py`
- `video-bridge/test_video_bridge.py`

**禁觸:**
- `video-bridge/Dockerfile.video_bridge`
- 他文件

**要點:**
- #10 — 加 `self._lock = threading.Lock()` 於 `__init__`。`_build_pipeline`、`_stop_pipeline`、`_schedule_pipeline_restart`、`_retry_pipeline` 皆於入口 `with self._lock:`。注：`_on_message` 調 `_build_pipeline` 而 `_on_bus_error` 調 `_schedule_pipeline_restart`；皆於 callback 內，可直入 lock。`push-buffer` 之 emit 不入 lock（高頻路徑）。`_on_message` 之 first-message-build 路徑須護於 lock。
- #26 — `destroy_node` 內 super().destroy_node() 前先 `if self._retry_timer: self._retry_timer.cancel()`、`self._retry_timer = None`。
- 測 — `test_video_bridge.py` 若已測 pipeline-string 函數，補一測：模並發調 `_schedule_pipeline_restart` 兩線程不致 corrupt（用 threading + Lock 之 happy path 驗）。若難，僅補 destroy_node 清 timer 之測即可。

---

## 斥候六 — Auth Server 加固（非 CSRF、非速率限）

**目標 findings:** #8（cookie secure env-gated）、#12（proxy timeout）、#16（timing-safe username）、#17（atomic credential write）

**範圍外:** #9（rate-limit）、#18（CSRF）皆有獨立計劃（前者為 `2026-05-06-login-rate-limit-implementation.md`），此役不涉。

**許入文件:**
- `auth-server/src/credentials.ts`
- `auth-server/src/routes/auth.ts`
- `auth-server/src/app.ts`
- `auth-server/src/proxy.ts`
- `auth-server/test/credentials.test.ts`
- `auth-server/test/auth.test.ts`

**禁觸:**
- `auth-server/views/`
- `auth-server/test/mediamtx_integration.test.ts`
- `auth-server/Dockerfile.auth`
- `auth-server/package.json`（除非須加新依，本役無新依）

**要點:**
- #8 — `app.ts` 第 55-59 cookie config 加 `secure: process.env['NODE_ENV'] === 'production'`。亦可考量加 `secure: !!process.env['HTTPS_ENABLED']`——擇可由 docker-compose env 控者。即用 NODE_ENV 即可，留待 HTTPS 計劃決最終法。
- #12 — `proxy.ts` `createProxyMiddleware` 配置加 `proxyTimeout: 10_000` 與 `timeout: 10_000`。
- #16 — `auth.ts` 第 23 改：先讀 creds，無條件調 `verifyPassword`。實作：若 `username !== creds.username`，調 `verifyPassword(password, DUMMY_HASH)` 以耗等時，後返 invalid；否則調 `verifyPassword(password, creds.passwordHash)`。DUMMY_HASH 為一固定 bcrypt hash（可寫於模塊頂常量，或於啟動時 hash 隨意字符串）。
- #17 — `credentials.ts` 第 44-49 `saveCredentials` 改為：寫至 `credPath + '.tmp'`，後 `fs.rename(tmp, credPath)`（原子）。捕 rename 失敗則拋。
- 測 — `credentials.test.ts` 加一測：寫中模擬崩潰（unlink .tmp 後驗 credPath 仍為舊值）——若難，惟驗連兩 saveCredentials 後讀回為後者即可。`auth.test.ts` 加一測：錯 username + 正 password 與 正 username + 錯 password 之耗時應同階（不必確切，惟 supertest 之 t1/t2 比值在 0.5~2 區間即可，或惟驗兩請求皆 invoke verifyPassword）。

---

## 護欄總綱

各斥候皆須：
1. 改既訖，記所改文件、所改行範圍、所對應 finding 編號。
2. 不更 `AGENTS.md`、`MEMORY.md`、`docs/2026-05-27-codebase-review.md`。
3. 不運 `docker compose`（測由架構師統運）。
4. 不裝新 npm/pip 依賴。
5. 不重組目錄、不重命名既有函數（除非 finding 明指）。
6. 註釋從少；惟 WHY 非顯者加之。
7. 回報限 300 字內，述：所改文件、findings 解決狀（完/部分/未）、未解之疑。

---

## 驗證次第（架構師末路）

各斥候訖後，架構師：
1. 運 `docker compose --profile test run --rm webclient-test`（157 測之外，斥候四補測或增）
2. 運 `docker compose --profile test run --rm auth-server-test`（34 測 + 斥候六補測）
3. 運 `docker compose --profile test run --rm video-bridge-test`（19 測 + 斥候五補測）
4. 運 C++ 測（依 `repository-structure.md` 之指令；斥候三補 test_command_handler.cpp 後測數應增）
5. 若集成測未壞，運 `docker compose --profile integration run --rm mediamtx-integration-test`（3 測）
6. 全綠後，造 commit；更 `AGENTS.md` 交接、Head SHA、里程表追加「codebase review fixes」一行。
7. 末求用戶許推。

若某測敗，責歸對應斥候之域；架構師讀其改，自修或派斥候再進。

---

## 不在此役之事

- #9（login rate-limit）— 待 `2026-05-06-login-rate-limit-implementation.md` 獨立施行
- #18（CSRF）— 待 HTTPS 役合並施行
- #27、#28（Dockerfile EXPOSE 與 .env.example 自動探測注）— 純美觀，後役順手清
- 文檔同步（#28 之 AGENTS.md 與 CLAUDE.md 同步）— 架構師末路為之
