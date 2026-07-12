# 2026-07-10 — nav-feedback 實施之策

## 緣起

nav2 waypoint 既成於 v1.1.0,然其果無以告操者。今有三失:

- 其一:goal 至也(SUCCEEDED)、敗也(ABORTED),server 皆廣播 nav_state idle,UI 默然復原。操者不能辨「至矣」與「棄矣」。
- 其二:goal 見拒(on_nav_goal_response 得空 handle)、或 action server 未備(send_stored_goal_ 內棄 goal),server 竟無所廣播 —— UI 懸於 active,永不復。此 bug 也。
- 其三:estop 既鎖而操者按 Send,teleop_client.sendNavGoal 唯 console.warn,手機操者無由見之。按鈕似成而實未發。

## 方略

wire protocol 增 nav_state 二態:succeeded 與 failed(唯 server→client)。bridge 化此二態為瞬時 navNotice,而 navState 復歸 idle —— MiniMap 三態 enum 不動,controls 邏輯無所改。二失與三失同歸一途:HudToast 一件,置於 shared.tsx,二 view 各繪其一。

- server(teleop_node.cpp on_nav_goal_result):SUCCEEDED 廣播 succeeded;ABORTED 廣播 failed;CANCELED 依舊不動。
- server(on_nav_goal_response):handle 空則廣播 failed,兼清 stored_goal_ 與 paused_。
- server(send_stored_goal_):action server 未備,則廣播 failed,兼清 stored_goal_。
- protocol.ts:nav_state parser 納五態(idle、active、paused、succeeded、failed),他值仍拒。
- teleop_client.ts:onNavState type 廣之;sendNavGoal 改返 boolean,estop 鎖則返 false(warn 存之亦可)。
- useTeleopBridge.ts:onNavState 遇 succeeded 者,setNavState idle,立 navNotice(文曰 Goal reached,tone ok);遇 failed 者同理(文曰 Navigation failed,tone error)。sendNavGoal 包之:返 false 則立 navNotice(文曰 E-STOP engaged — reset before navigating,tone warn)。navNotice 四秒自滅(setTimeout,新 notice 至則舊 timer 清)。bridge 出 navNotice 於其 interface。
- shared.tsx:增 HudToast 純示件 —— 受 notice(text 與 tone)或 null,null 則不繪;position fixed,bottom 居中,zIndex 高於 expanded map(300),pointerEvents none;tone 定色(ok 綠、warn 琥珀、error 紅)。
- MissionControl.tsx 與 MissionTablet.tsx:各繪 HudToast 一行,飼以 bridge.navNotice。

## 任務三分

### 任務甲 — C++ server(可與乙並行)

治 teleop_node.cpp 三處廣播(果、拒、未備)。test_teleop_node.cpp 增試:偽 action server 返 SUCCEEDED 則聞 succeeded;返 ABORTED 則聞 failed;拒 goal 則聞 failed。舊試中凡候 idle 於果者,改候其新態。Docker builder stage 內 106 試全綠為準。

### 任務乙 — web transport(可與甲並行)

protocol.ts parser 納五態,增試(succeeded/failed 過、他字拒)。teleop_client.ts sendNavGoal 返 boolean 並增試(estop 鎖返 false 且不發;未鎖返 true 且發)。onNavState type 廣之。舊試不得壞。

### 任務丙 — bridge 與 UI(待乙成)

useTeleopBridge.ts 增 navNotice state 與二源(nav 果、estop 鎖)及四秒自滅;試以 fake client 驗三徑與 timer。shared.tsx 增 HudToast 並試(null 不繪、三 tone 色、文現)。二 view 各繪一行,view 試各增其一(notice 立則 toast 見)。

## 驗證

- C++:docker build(builder stage 自跑 ctest),106+ 全綠。
- webclient:docker compose --profile test run --rm webclient-test,856+ 全綠。
- 手驗(操者他日行之):真機 nav goal 至而見綠 toast;E-STOP 鎖而按 Send 見琥珀 toast。

## 執行規約

- controller 遣 Haiku subagent(wenyan-ultra 諭之),trophy TDD。
- subagent 永不行 git;樹留 dirty,報所改之檔與試果;遇 permission 拒則止而報。
- 試唯 Docker,毋裸 npm。
- controller 每任務後察 git status(主樹與 worktree 兩處)、閱其 spec 合否、code quality,乃以明路 stage 而 commit。
- branch 一枝 feat/nav-feedback,諸任務畢乃併入 main;push 必先請。
