# env 設定頁實作計畫 — operator 由 frontend 改 robot config

> 日期 2026-06-13。旨：使 operator 於 web 設定頁改動部分 robot 設定，免登 host 手改 `.env`。

## 旨

今 robot identity、footprint、video source 皆藏於 `.env`，欲改須登 host、改檔、重起 stack。此計畫立一 settings 頁，經 auth-server 認證之 endpoint，寫入一 **secret-free overrides file**，operator 重起後生效。

## 現狀（已查證）

- `.env` 不 mount 入任何 container；Compose 於 `up` 時讀之，注為 env var。故 container 今不能讀寫 host `.env`。
- env var 僅於 container 起時讀入；改檔後須重起方生效。
- `teleop_node` constructor 一次性讀 ROS2 param（`teleop_node.cpp` 8–24 行），publisher/subscription 皆據此建立；今無 runtime reconfigure。
- auth-server `restart: unless-stopped`，且無 docker socket（不可有 — web tier 持 socket 等同 host root）。
- `.env` 中 secret（`SESSION_SECRET`、`TELEOP_ADMIN_PASSWORD`）與可調欄並列，此為直改 `.env` 之安全患。
- 既有 precedent：`SettingsDrawer` 已有 Connection 區之 namespace 輸入（僅 localStorage）與 Video 區之 Apply（打 MediaMTX runtime config API）。

## 決定（operator 已擇）

1. **儲存**：另立 secret-free overrides file，rw bind-mount 入 auth-server，Compose 以 `env_file` 載之。secret 仍居 `.env`，web tier 永不可及。
2. **生效**：寫檔 + 顯「restart required」提示；operator 自行 `docker compose ... up -d`。不動 docker socket。
3. **欄位範圍**：robot identity（`ROBOT_TYPE`、`ROBOT_NAME`、`ROBOT_NAMESPACE`）、footprint（`ROBOT_LENGTH_M`、`ROBOT_WIDTH_M`）、video source（`VIDEO_TOPIC`、`VIDEO_TOPIC_TYPE`）。**不含** topics/frames、ROS network iface、TLS、`BIND_HOST`、一切 secret。

## 範圍

**入**：overrides file 機制、auth-server 之 `GET`/`PUT` config endpoint、settings 頁表單與 restart 提示、文件更新。
**出**：live runtime apply（須 `teleop_node` param callback + 重建 pub/sub，列為後續）、topics/frames 編輯、secret 或 network/TLS 編輯、auto-restart。

## 架構

### overrides file

- 立目錄 `config/`，內置 `config/robot.env`（`KEY=VALUE` literal，Compose env_file 格式，無 interpolation、無 shell eval）。gitignore 之，另 commit `config/robot.env.example`。
- **bind-mount 目錄**（非單檔）`./config:/config` rw 入 auth-server，俾 atomic temp-write + rename 於同 mount 內可行（單檔 mount 無法跨 rename）。
- teleop-server 與 video-bridge 各加 `env_file` 指 `./config/robot.env`，並設 `required: false`，缺檔不致 Compose 報錯。
- **去重**：將上述七鍵自 compose 之顯式 `environment:` map 移除（`environment` 優先於 `env_file`，留之則 shadow overrides）。同時自 `.env.example` 移此七鍵入 `config/robot.env.example`，並註明遷移。

### auth-server endpoint

- 新 `auth-server/src/robot_config.ts`：讀寫 `/config/robot.env`，含 key allowlist、逐欄 validate、atomic write（temp + `fs.rename`）。
- `GET /auth/robot-config`：回現值（僅 allowlist 七鍵），永不回 secret。
- `PUT /auth/robot-config`：validate → 原子寫 → 回新值 + `restartRequired: true`。未列之 key 一律拒。
- session-authed（沿用既有 auth middleware）；此為真實 input，當計入 idle activity（沿用 `lastActivity`）。
- 接入 `app.ts`，config 路徑經 `AppOptions` 注入以利測試。

### validate 規則（逐欄）

- `ROBOT_TYPE` ∈ {`diff_drive`, `holonomic`}。
- `ROBOT_NAME`：字串，長度上限（如 64），去 control char，禁 newline 與 `=`（防壞 env-file 格式）。
- `ROBOT_NAMESPACE`：ROS name 規則（alnum + underscore，首字非數字，無 `/`）；空字允許。喂 `cmd_vel` topic，須嚴。
- `ROBOT_LENGTH_M`/`ROBOT_WIDTH_M`：finite、≥ 0、上限合理（如 ≤ 10）；`0` = unconfigured。
- `VIDEO_TOPIC`：ROS topic path 或空。
- `VIDEO_TOPIC_TYPE` ∈ {`compressed`, `raw`}。

### frontend

- `SettingsDrawer` 增「Robot」區（或擴 Connection 區），表單綁上述七欄，初值取自 `GET /auth/robot-config`。
- Save → `PUT`；成功則顯 restart-required toast（沿用 `SessionBanner` 底部 toast 樣式），明示「重起 stack 方生效」。
- validate 失敗回 4xx，逐欄錯顯於表單。
- **調和**：既有 Connection 區 namespace 之 localStorage save 與此 server-side config 重疊；改以此 endpoint 為準，localStorage namespace 退役（列 deviation）。

## 任務（chain branch，trophy TDD，Haiku）

1. **Compose + overrides 管路**：建 `config/robot.env.example` + gitignore；teleop-server/video-bridge 加 `env_file`（`required: false`）；自顯式 `environment` 去七鍵；auth-server bind-mount `./config:/config` rw；`.env.example` 遷七鍵並註。驗證：`docker compose config` 綠；container 確讀 overrides 值。docs：`.env.example`、`docker-compose.yml` 註、repository-structure。
2. **auth-server config module + endpoint**：`robot_config.ts`（parse/serialize env-file、allowlist、validate、atomic write）；`GET`+`PUT /auth/robot-config`；接入 `app.ts`（路徑經 `AppOptions`）。trophy：supertest 整合 — GET 回現值；PUT 過 validate 則持久化；惡值見拒；secret 永不外露；回 `restartRequired`。docs：data-schema endpoint + robot.env、auth-server/AGENTS.md local contract。
3. **web-client settings UI**：`SettingsDrawer` Robot 區綁 endpoint；restart toast；調和既有 namespace localStorage。trophy：RTL — render、編輯、save、顯 restart banner、validate 錯上浮。docs：web-client/AGENTS.md。
4. **doc 收束**：AGENTS.md handover、milestones、deviations（namespace localStorage 退役、live-apply 暫緩）統一更新。

> 各任務 code 與 doc 同 commit（DOX 規）；task 4 僅收束跨檔 handover。

## 安全

- secret 永不寫入、不外露；overrides file 僅 allowlist 七鍵。
- 嚴格 allowlist，未列 key 一律拒；逐欄 validate；atomic write 防半截檔。
- env-file 為 literal，Compose 不 shell-eval，但仍須禁 newline/control char 以保格式。
- 路徑固定，無 user 控之路徑（防 traversal）。
- 無 docker socket；重起為 operator 手動之舉。
- endpoint session-authed，計入 idle activity。

## 驗證

- auth-server：`docker compose -p pocket-teleop run --rm --no-deps --build auth-server-test npm test`（新增 supertest 整合）。
- web-client：`docker compose -p pocket-teleop run --rm --no-deps --build webclient-test npm test`（新增 RTL）。
- Compose：`docker compose -p pocket-teleop config` 綠；起 stack 後改 overrides + 重起，確認新值入 `status` JSON（robot dims/name）與 video bridge。
- baseline 沿 AGENTS.md「Test baseline」。

## 風險與待決

- **env_file 優先序**：必自顯式 `environment` 去七鍵，否則 shadow overrides — task 1 須驗。
- **單檔 vs 目錄 mount**：用目錄 mount 方可 atomic rename。
- **遷移**：既有部署 `.env` 持七鍵者，遷至 `config/robot.env`；`.env.example` 明示。`env_file: required: false` 保缺檔不崩。
- **live apply 暫緩**：欲免重起，`teleop_node` 須加 param callback 並重建 publisher/subscription（namespace→topic remap 尤須重建 pub）；列後續計畫。
- **namespace 雙寫**：localStorage 退役後，確保 UI 無殘留二處事實源。
- **frontend restart 按鈕 — 駁回（勿再議）**：欲於前端設「重起 app」鈕，須令 web-facing container 控 Docker（mount `docker.sock` 或 privileged sidecar），等同授其 host-root，乃全 stack 最劣 blast radius，不值此便。且 config 僅關 teleop-server/video-bridge，auth-server 自我重起無益，終須跨 container 控制。正解為上「live runtime apply」（`teleop_node` param callback，免重起），非重起鈕。若實需鈕，最不劣者為一無 network 之 privileged sidecar，僅監 trigger 檔而 `compose restart teleop-server video-bridge`，與 web tier 隔離 socket — 然仍較 live apply 為險。本計畫先出 restart-required banner；live apply 列後續，取代重起鈕。

## 執行附則（2026-06-11 規）

- chain branch，末次一併 merge；trophy TDD（先 red 行為失敗，非 missing module）。
- Haiku subagent，prompt 以 wenyan-ultra；subagent 不執 git，controller 按顯式路徑 stage + commit。
- 測試僅經 Docker，編輯後必 `--build`。
- 採用前 re-verify 此計畫所引檔路徑（行號）對現 code，防 staleness。
