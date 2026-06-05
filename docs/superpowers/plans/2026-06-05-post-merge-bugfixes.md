# 合併後三疾修復 — 實作謀（2026-06-05）

> 文言為文；技術詞、檔名、API、類型名英文。plan 內不置 code block；碼自存於 source。
> 三疾乃操作者真機所報：① 登入後白屏約 15s；② 登入頁仍舊樣（白底藍，未合 Mission 設計）；③ admin/admin 登入不再強制改帳密。

## 根因（已查證，非臆測）

**疾一：登入後 15s 白屏。**
- 本機實測：app `index.html` 出極快（1.6ms／810B），JS bundle 191KB／2.6ms、CSS 358B 皆瞬出，外網 `fonts.googleapis.com` 0.11s 可達——本機皆快。
- 真因在**無外網之機器人 LAN**：built `web-client/index.html` 留有 render-blocking 外部 Google Fonts `<link rel="stylesheet">`（Inter + JetBrains Mono）+ 二 `preconnect`。無網則瀏覽器連 googleapis 逾時方棄，SPA `#app` 在 render-blocking stylesheet 解析前不繪 → 白屏至逾時（約 15s）。登入頁為靜態且 `display=swap`，感知較輕，故操作者覺其「快」。
- 證：`web-client/index.html` line 6–8 三外部 font 連結；built dist 仍保留之。

**疾二：登入頁舊樣。**
- `auth-server/views/login.html`、`change-password.html` 自具樣式：白底（`--bg:#fff`）、藍 accent（`#0070f3`）、`Press Start 2P` 像素字、system-ui——與全 app 已改之 Mission palette（dark `#0c0e12`/surface `#14171e`/amber `#f0a92a`/JetBrains Mono）走樣。SettingsDrawer 役已統一 app 樣式，唯 auth 二頁未隨。

**疾三：admin/admin 不再強制改密。**
- `credentials.ts:initCredentials` 僅當 `credentials.json` **不存**時方寫（`mustChangePassword:true`）。`-p pocket-teleop` 復用持久 `auth-data` volume，故舊檔永存。
- 實測 volume 內現存：`{username:'admin', mustChangePassword:false}`——密碼仍 admin 而 flag 已 false，故登入直入 app，不觸改密。持久 volume 留存不安全之預設態，首次強制流程遂失效。

## 範圍

涉 `web-client/index.html`、`web-client/src/index.css`、新 `web-client/public/fonts/`；`auth-server/views/login.html`、`change-password.html`、新 auth 靜態字型/樣式路由、`auth-server/src/app.ts`、`credentials.ts`、`index.ts`；README + handover docs。三疾各自獨立，可分 task 並行（各動己檔）。

## 設計

### Task A — 字型本地化（修疾一，offline-first）

- 取 Inter（400/500/600/700）與 JetBrains Mono（400/500）之 `.woff2`，置於 `web-client/public/fonts/`（Vite 將 `public/` 原樣出於 dist 根）。
- `web-client/src/index.css` 增 `@font-face`（各 weight 指向本地 woff2、`font-display: swap`）。
- 刪 `web-client/index.html` 三外部連結（二 `preconnect` + 一 Google Fonts stylesheet）。
- 驗：阻斷外網（如 DevTools offline 或 `/etc/hosts` 黑洞 googleapis）後重載，app 當即繪、不白屏 15s。
- trophy TDD（webclient）：light unit/asset 測——斷言 `index.html` 不含 `fonts.googleapis.com`；`index.css` 含 `@font-face` 且 `src` 指 `/fonts/`。

### Task B — Auth 二頁 offline + 改 Mission 樣（修疾二，並修其外部字型）

- auth-server 增**未授權可達**之靜態路由（mount 於 auth gate 之前）出字型與共用 css：如 `app.use('/auth-static', express.static(...))`，置 JetBrains Mono woff2（與 web-client 同檔，或 auth 自存一份）。
- `login.html`、`change-password.html`：刪外部 Google Fonts 連結；改樣式至 Mission palette（bg `#0c0e12`、surface `#14171e`、border `#2a2f3a`、text `#e6e9ef`、accent amber `#f0a92a`、JetBrains Mono 標題與輸入）；`@font-face` 指 `/auth-static/fonts/`。保留既有表單行為（error 顯示、eyeball 切換、POST action）。
- trophy TDD（auth）：測 `/auth-static/...` 字型 200 且**無**需 session；測二頁 body 不含 `fonts.googleapis.com`。

### Task C — 首次強制改密之穩健化（修疾三）

- 於啟動（`index.ts` 呼 `initCredentials` 後，或併入之新 `enforceDefaultCredentialChange`）增一檢：讀現存 creds，若 `verifyPassword(TELEOP_ADMIN_PASSWORD, creds.passwordHash)` 為真（即操作者仍用 .env 預設密碼），則令 `mustChangePassword=true` 並 atomic `saveCredentials`。如此縱持久 volume 留存預設態，每次啟動皆重新強制改密；操作者改為非預設後，此檢不再觸發。
- 文檔補：硬重置（清憑證）為 `docker compose down -v`（毀 volume）後重啟。
- trophy TDD（auth credentials）：
  - 存 creds 之密碼 = 預設且 `mustChangePassword:false` → 經啟動檢後 flag 回 true。
  - 存 creds 之密碼 ≠ 預設 → flag 不動（不誤擾已改密之操作者）。
  - 新建（檔不存）→ 仍 `mustChangePassword:true`（原行為不破）。

## Trophy TDD 測試基線

須保：auth 34 / webclient 323 / video-bridge 19 / C++ 44。本役增 webclient 字型 asset 測 ~2、auth offline+樣式+憑證測 ~5。既有 pre-existing reds（9 webclient adversarial + 1 whep flake + integration 需 live server）非 regression。Docker 內跑（webclient 之 `--profile test`；auth 之 `auth-server-test`）。

## 任務分解（worktree + Haiku subagents，subagent-driven-development）

controller 先立 worktree + branch `fix/post-merge-bugs`（自 `main`）。各 subagent：嚴遵 plan、Docker 跑測、commit（碼+測），**不**動 AGENTS.md（handover 由 controller 末了統一更，免並行衝突，見前役 deviation）。

- **T-A（Haiku）**：字型本地化（web-client）。需取 woff2 入 `public/fonts/`（自 Google Fonts 下載 6 檔），改 index.html/index.css，加 asset 測。
- **T-B（Haiku）**：auth 二頁 offline + Mission 樣 + auth 靜態字型路由 + 測。
- **T-C（Haiku）**：憑證啟動強制改密檢 + 測 + README 硬重置註。
- 三者各動己檔，並行安全；惟 woff2 檔 T-A 與 T-B 可共用（T-A 先落 web-client/public/fonts，T-B 複用同檔入 auth），故 T-A 先行半步或各自下載。
- **T-D（controller）**：二 review round、跑全 webclient+auth 測、合 worktree、更 handover 表 + Milestones + deviations、撰 commit。畢則問 push。

## 風險

- woff2 vendoring 須真檔（非佔位），否則 @font-face 失效退回 system-ui（功能不破，僅失字型美感）。驗 dist 內 `/fonts/*.woff2` 200。
- 疾三之預設密碼檢：若操作者刻意設密碼 = .env 之 admin 值，將每啟動被迫再改——屬極端邊角，可接受（且本即不安全用法）。
- auth 靜態字型路由須置於 auth-redirect middleware **之前**，否則未授權取字型遭重導至 login，登入頁字型仍失。
