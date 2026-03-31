# Robot Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server declares its own `robot_name` (display) and `robot_namespace` (topic prefix) via env vars, reports them to the client on connect, and the client shows them read-only in the UI.

**Architecture:** Two new ROS2 parameters flow through `TeleopServer` constructor → `on_open` status JSON → `parseMessage` (protocol.ts) → `TeleopClient.onStatus` callback → `applyRobotIdentity()` in `index.html`. The Connection settings page replaces the namespace input/apply/clear controls with two read-only display rows. `buildWsUrl` drops the `&ns=` param — the server is now authoritative.

**Tech Stack:** C++17 / ROS2 Humble (server), TypeScript + Vitest (web client), Docker Compose (integration). Tests run in Docker only — never bare `npm`.

---

## File Map

| File | Change |
|---|---|
| `server/include/teleop_server.hpp` | Add `robot_name_`, `robot_namespace_` members; update constructor signature |
| `server/src/teleop_server.cpp` | Update constructor initialiser list; add fields to `on_open` status JSON |
| `server/src/teleop_node.cpp` | Declare two new ROS2 params; build topic from namespace; pass both to `TeleopServer` |
| `server/launch/teleop.launch.py` | Add two params wired to `EnvironmentVariable` |
| `docker-compose.yml` | Add `ROBOT_NAME` and `ROBOT_NAMESPACE` env vars to `teleop-server` service |
| `web-client/src/protocol.ts` | Add `robot_name`, `robot_namespace` to `status` variant; update `parseMessage` |
| `web-client/test/protocol.test.ts` | Update status tests; add backwards-compat test |
| `web-client/src/teleop_client.ts` | Extend `onStatus` to 4 args; pass new fields from parsed status message |
| `web-client/test/integration.test.ts` | Add test asserting new status fields are passed through |
| `web-client/index.html` | Replace Connection page controls; replace `applyNamespace` with `applyRobotIdentity`; update `onStatus`; drop `&ns=` from `buildWsUrl` |

---

### Task 1: Server parameters, topic routing, and status message

**Files:**
- Modify: `server/include/teleop_server.hpp`
- Modify: `server/src/teleop_server.cpp`
- Modify: `server/src/teleop_node.cpp`
- Modify: `server/launch/teleop.launch.py`
- Modify: `docker-compose.yml`

There are no C++ unit tests — the integration test run at the end of this task is the gate.

- [ ] **Step 1: Update `server/include/teleop_server.hpp`**

Replace the entire file:

```cpp
#pragma once
#include <functional>
#include <string>
#include <atomic>
#include <thread>
#include <mutex>
#include <chrono>

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include "command_handler.hpp"

using WsServer = websocketpp::server<websocketpp::config::asio>;
using ConnectionHdl = websocketpp::connection_hdl;

class TeleopServer {
public:
  using PublishCallback = std::function<void(double, double, double)>;

  TeleopServer(const std::string& token,
               int port,
               int timeout_ms,
               const std::string& robot_type,
               const std::string& robot_name,
               const std::string& robot_namespace,
               PublishCallback callback);
  ~TeleopServer();

  void start();  // blocks until stop() is called
  void stop();

private:
  bool on_validate(ConnectionHdl hdl);
  void on_open(ConnectionHdl hdl);
  void on_close(ConnectionHdl hdl);
  void on_message(ConnectionHdl hdl, WsServer::message_ptr msg);
  void watchdog_loop();
  void reset_watchdog();

  const std::string token_;
  const int port_;
  const int timeout_ms_;
  const std::string robot_type_;
  const std::string robot_name_;
  const std::string robot_namespace_;
  PublishCallback publish_callback_;

  WsServer ws_server_;
  CommandHandler command_handler_;

  std::mutex client_mutex_;
  ConnectionHdl active_client_;
  bool has_client_{false};

  std::atomic<bool> running_{false};
  std::atomic<bool> timed_out_{false};
  std::thread watchdog_thread_;
  std::atomic<int64_t> last_message_ms_{0};
};
```

- [ ] **Step 2: Update `server/src/teleop_server.cpp` — constructor and `on_open`**

Change the constructor signature and initialiser list (top of the file):

```cpp
TeleopServer::TeleopServer(const std::string& token,
                           int port,
                           int timeout_ms,
                           const std::string& robot_type,
                           const std::string& robot_name,
                           const std::string& robot_namespace,
                           PublishCallback callback)
  : token_(token),
    port_(port),
    timeout_ms_(timeout_ms),
    robot_type_(robot_type),
    robot_name_(robot_name),
    robot_namespace_(robot_namespace),
    publish_callback_(std::move(callback)) {
```

In `on_open`, replace the `status` JSON block:

```cpp
  nlohmann::json status = {
    {"type",            "status"},
    {"connected",       true},
    {"robot_type",      robot_type_},
    {"robot_name",      robot_name_},
    {"robot_namespace", robot_namespace_}
  };
```

- [ ] **Step 3: Update `server/src/teleop_node.cpp`**

Replace the entire file:

```cpp
#include "teleop_node.hpp"

TeleopNode::TeleopNode(const rclcpp::NodeOptions& options)
  : Node("teleop_node", options) {

  declare_parameter("port",            9091);
  declare_parameter("token",           std::string(""));
  declare_parameter("timeout_ms",      500);
  declare_parameter("cmd_vel_topic",   std::string("/cmd_vel"));
  declare_parameter("robot_type",      std::string("diff_drive"));
  declare_parameter("robot_name",      std::string(""));
  declare_parameter("robot_namespace", std::string(""));

  const auto token = get_parameter("token").as_string();
  if (token.empty()) {
    RCLCPP_FATAL(get_logger(), "Parameter 'token' is required but not set. Exiting.");
    throw std::runtime_error("token parameter is required");
  }

  const auto port            = get_parameter("port").as_int();
  const auto timeout_ms      = get_parameter("timeout_ms").as_int();
  const auto base_topic      = get_parameter("cmd_vel_topic").as_string();
  const auto robot_type      = get_parameter("robot_type").as_string();
  const auto robot_name      = get_parameter("robot_name").as_string();
  const auto robot_namespace = get_parameter("robot_namespace").as_string();

  const auto topic = robot_namespace.empty()
    ? base_topic
    : "/" + robot_namespace + "/cmd_vel";

  publisher_ = create_publisher<geometry_msgs::msg::Twist>(topic, 10);

  server_ = std::make_unique<TeleopServer>(
    token,
    static_cast<int>(port),
    static_cast<int>(timeout_ms),
    robot_type,
    robot_name,
    robot_namespace,
    [this](double lx, double ly, double az) { publish_twist(lx, ly, az); });

  server_thread_ = std::thread([this]() { server_->start(); });

  RCLCPP_INFO(get_logger(), "Teleop server listening on port %ld", port);
  RCLCPP_INFO(get_logger(), "Publishing to topic: %s", topic.c_str());
}

TeleopNode::~TeleopNode() {
  server_->stop();
  if (server_thread_.joinable()) server_thread_.join();
}

void TeleopNode::publish_twist(double lx, double ly, double az) {
  geometry_msgs::msg::Twist msg;
  msg.linear.x  = lx;
  msg.linear.y  = ly;
  msg.angular.z = az;
  publisher_->publish(msg);
}
```

- [ ] **Step 4: Update `server/launch/teleop.launch.py`**

Replace the entire file:

```python
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, EnvironmentVariable
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('port',          default_value='9091'),
        DeclareLaunchArgument('timeout_ms',    default_value='500'),
        DeclareLaunchArgument('cmd_vel_topic', default_value='/cmd_vel'),
        DeclareLaunchArgument('robot_type',    default_value='diff_drive'),

        Node(
            package='pocket_teleop',
            executable='teleop_node',
            name='teleop_node',
            parameters=[{
                'port':            LaunchConfiguration('port'),
                'token':           EnvironmentVariable('TELEOP_TOKEN'),
                'timeout_ms':      LaunchConfiguration('timeout_ms'),
                'cmd_vel_topic':   LaunchConfiguration('cmd_vel_topic'),
                'robot_type':      LaunchConfiguration('robot_type'),
                'robot_name':      EnvironmentVariable('ROBOT_NAME',      default_value=''),
                'robot_namespace': EnvironmentVariable('ROBOT_NAMESPACE', default_value=''),
            }],
            output='screen',
        ),
    ])
```

- [ ] **Step 5: Update `docker-compose.yml` — add two env vars**

In the `teleop-server` service `environment` block, add after `ROBOT_TYPE`:

```yaml
      - ROBOT_NAME=${ROBOT_NAME:-}
      - ROBOT_NAMESPACE=${ROBOT_NAMESPACE:-}
```

The full environment block becomes:

```yaml
    environment:
      - "TELEOP_TOKEN=${TELEOP_TOKEN:?Error: TELEOP_TOKEN must be set before starting the server}"
      - ROBOT_TYPE=${ROBOT_TYPE:-diff_drive}
      - ROBOT_NAME=${ROBOT_NAME:-}
      - ROBOT_NAMESPACE=${ROBOT_NAMESPACE:-}
```

- [ ] **Step 6: Build and run integration tests**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected: all 10 existing integration tests pass.

- [ ] **Step 7: Smoke test topic routing**

```bash
TELEOP_TOKEN=testtoken ROBOT_NAME="Test Bot" ROBOT_NAMESPACE=test_ns docker compose up --build teleop-server
```

Confirm server log contains:

```
[INFO] [teleop_node]: Publishing to topic: /test_ns/cmd_vel
```

Then `Ctrl-C`.

- [ ] **Step 8: Commit**

```bash
git add server/include/teleop_server.hpp server/src/teleop_server.cpp \
        server/src/teleop_node.cpp server/launch/teleop.launch.py docker-compose.yml
git commit -m "feat: server declares robot_name and robot_namespace; topic routed by namespace"
```

---

### Task 2: `protocol.ts` — extend status type and parser

**Files:**
- Modify: `web-client/src/protocol.ts`
- Modify: `web-client/test/protocol.test.ts`

`parseMessage` currently only extracts `robot_type` from status messages. `robot_name` and `robot_namespace` must be added to the `InboundMessage` type and extracted in the parser so `TeleopClient` can read them as typed strings.

- [ ] **Step 1: Write the failing tests**

In `web-client/test/protocol.test.ts`, update the existing status tests and add a backwards-compat test.

Replace the two existing `parseMessage` status tests:

```typescript
  it('parses status message with connected=true', () => {
    const result = parseMessage(
      '{"type":"status","connected":true,"robot_type":"diff_drive","robot_name":"Test Bot","robot_namespace":"test_ns"}'
    );
    expect(result).toEqual({
      type: 'status',
      connected: true,
      robot_type: 'diff_drive',
      robot_name: 'Test Bot',
      robot_namespace: 'test_ns',
    });
  });

  it('parses status message with connected=false', () => {
    const result = parseMessage(
      '{"type":"status","connected":false,"robot_type":"ackermann","robot_name":"","robot_namespace":""}'
    );
    expect(result).toEqual({
      type: 'status',
      connected: false,
      robot_type: 'ackermann',
      robot_name: '',
      robot_namespace: '',
    });
  });

  it('status message without robot_name or robot_namespace defaults to empty string', () => {
    const result = parseMessage('{"type":"status","connected":true,"robot_type":"diff_drive"}');
    expect(result).toEqual({
      type: 'status',
      connected: true,
      robot_type: 'diff_drive',
      robot_name: '',
      robot_namespace: '',
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected: 3 failures — the updated status tests fail because `robot_name` and `robot_namespace` are not on the parsed result.

- [ ] **Step 3: Update `web-client/src/protocol.ts`**

Replace the entire file:

```typescript
export type InboundMessage =
  | { type: 'pong' }
  | { type: 'status'; connected: boolean; robot_type: string; robot_name: string; robot_namespace: string }
  | { type: 'error'; message: string }
  | { type: 'unknown'; raw: string };

export function buildTwist(lx: number, ly: number, az: number): string {
  return JSON.stringify({ type: 'twist', linear_x: lx, linear_y: ly, angular_z: az });
}

export function buildPing(): string {
  return JSON.stringify({ type: 'ping' });
}

export function parseMessage(raw: string): InboundMessage {
  try {
    const msg = JSON.parse(raw) as Record<string, unknown>;
    if (msg['type'] === 'pong') {
      return { type: 'pong' };
    }
    if (msg['type'] === 'status') {
      return {
        type:           'status',
        connected:      msg['connected']      as boolean,
        robot_type:     msg['robot_type']     as string,
        robot_name:     (msg['robot_name']     as string | undefined) ?? '',
        robot_namespace:(msg['robot_namespace'] as string | undefined) ?? '',
      };
    }
    if (msg['type'] === 'error') {
      return { type: 'error', message: msg['message'] as string };
    }
    return { type: 'unknown', raw };
  } catch {
    return { type: 'unknown', raw };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected: all tests pass (was 10 unit + integration; now 10 + 1 new protocol test = 11 unit + 10 integration = ... confirm exact count from output). The important thing: 0 failures.

- [ ] **Step 5: Commit**

```bash
git add web-client/src/protocol.ts web-client/test/protocol.test.ts
git commit -m "feat: extend protocol status type with robot_name and robot_namespace"
```

---

### Task 3: `TeleopClient` — extend `onStatus` + integration test

**Files:**
- Modify: `web-client/src/teleop_client.ts`
- Modify: `web-client/test/integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Add to `web-client/test/integration.test.ts`, inside the `describe('Connection', ...)` block after the two existing tests:

```typescript
  it('status message passes robot_name and robot_namespace to onStatus', async () => {
    const result = await new Promise<{ robotName: string; robotNamespace: string }>(
      (resolve, reject) => {
        const client = new TeleopClient({
          onStatus: (_connected, _robotType, robotName, robotNamespace) => {
            client.disconnect();
            resolve({ robotName, robotNamespace });
          },
          onClose: () => reject(new Error('closed before status')),
          onError: (msg) => reject(new Error(msg)),
        });
        client.connect(VALID_URL);
        setTimeout(() => reject(new Error('timeout')), 4000);
      }
    );

    expect(typeof result.robotName).toBe('string');
    expect(typeof result.robotNamespace).toBe('string');
  });
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected: 1 failure — TypeScript error because `onStatus` still only declares 2 params.

- [ ] **Step 3: Update `TeleopClientOptions` in `web-client/src/teleop_client.ts`**

Change line 7:

```typescript
  onStatus?: (connected: boolean, robotType: string, robotName: string, robotNamespace: string) => void;
```

- [ ] **Step 4: Update `handleMessage` in `web-client/src/teleop_client.ts`**

Change line 112:

```typescript
      this.options.onStatus?.(msg.connected, msg.robot_type, msg.robot_name, msg.robot_namespace);
```

No `?? ''` needed — `protocol.ts` now guarantees these are always strings.

- [ ] **Step 5: Run tests to verify they pass**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected: all tests pass. The existing `onStatus: (connected, robotType) =>` lambdas elsewhere in the test file remain valid — TypeScript allows callbacks with fewer parameters than the declared type.

- [ ] **Step 6: Commit**

```bash
git add web-client/src/teleop_client.ts web-client/test/integration.test.ts
git commit -m "feat: extend TeleopClient onStatus with robot_name and robot_namespace"
```

---

### Task 4: `index.html` — robot identity UI

**Files:**
- Modify: `web-client/index.html`

No new unit tests — the integration tests from Task 3 remain the gate.

- [ ] **Step 1: Add `field-value` CSS class**

In the `<style>` block, after the `.field-row input { flex: 1; }` rule (line 231):

```css
    .field-value { font-size: 14px; color: var(--text); }
```

- [ ] **Step 2: Replace the Connection settings page HTML**

Replace the entire `<!-- Connection page -->` block (lines 334–346):

```html
    <!-- Connection page -->
    <div id="page-connection" class="drawer-page" hidden>
      <div class="field-group">
        <span class="field-label">Robot name</span>
        <span id="robot-name-display" class="field-value">—</span>
      </div>
      <div class="field-group">
        <span class="field-label">ROS namespace</span>
        <span id="robot-ns-display" class="field-value">—</span>
      </div>
    </div>
```

- [ ] **Step 3: Remove the namespace import from the inline script**

Change the `settings.js` import line (around line 387):

```javascript
    import { SettingsRouter, loadVideoUrl, saveVideoUrl, clearVideoUrl } from '/dist/settings.js';
```

(Remove `loadRobotNamespace, saveRobotNamespace, clearRobotNamespace` — they are no longer called.)

- [ ] **Step 4: Update `buildWsUrl` — remove `&ns=` param**

Replace (around line 424):

```javascript
    function buildWsUrl() {
      const ns   = loadRobotNamespace();
      const base = `ws://${window.location.hostname}:9091/teleop?token=${encodeURIComponent(token)}`;
      return ns ? `${base}&ns=${encodeURIComponent(ns)}` : base;
    }
```

With:

```javascript
    function buildWsUrl() {
      return `ws://${window.location.hostname}:9091/teleop?token=${encodeURIComponent(token)}`;
    }
```

- [ ] **Step 5: Replace `applyNamespace` with `applyRobotIdentity`**

Replace (lines 482–489):

```javascript
    const robotNameStrip = document.getElementById('robot-name-strip');

    function applyNamespace(ns) {
      robotNameStrip.textContent   = ns || '';
      robotNameStrip.style.display = ns ? 'block' : 'none';
    }

    applyNamespace(loadRobotNamespace());
```

With:

```javascript
    const robotNameStrip = document.getElementById('robot-name-strip');

    function applyRobotIdentity(name, namespace) {
      robotNameStrip.textContent   = name || '';
      robotNameStrip.style.display = name ? 'block' : 'none';
      document.getElementById('robot-name-display').textContent = name      || '—';
      document.getElementById('robot-ns-display').textContent   = namespace || '—';
    }
```

- [ ] **Step 6: Update the `onStatus` callback**

Replace (around line 534):

```javascript
      onStatus: (_connected, robotType) => {
        setStatus('connected', `● Connected — ${robotType}`);
      },
```

With:

```javascript
      onStatus: (_connected, robotType, robotName, robotNamespace) => {
        setStatus('connected', `● Connected — ${robotType}`);
        applyRobotIdentity(robotName, robotNamespace);
      },
```

- [ ] **Step 7: Remove the namespace settings wiring block**

Find and delete the entire section (around lines 637–653):

```javascript
    // ── Namespace settings ────────────────────────────────────────────────────

    const namespaceInput = document.getElementById('namespace-input');
    const savedNs = loadRobotNamespace();
    if (savedNs) namespaceInput.value = savedNs;

    document.getElementById('namespace-apply-btn').addEventListener('click', () => {
      const ns = namespaceInput.value.trim();
      if (ns) saveRobotNamespace(ns); else clearRobotNamespace();
      applyNamespace(ns);
    });

    document.getElementById('namespace-clear-btn').addEventListener('click', () => {
      namespaceInput.value = '';
      clearRobotNamespace();
      applyNamespace('');
    });
```

- [ ] **Step 8: Build and run all tests**

```bash
TELEOP_TOKEN=testtoken docker compose --profile test run --rm webclient-test
```

Expected: all tests pass, 0 failures.

- [ ] **Step 9: Rebuild full stack and smoke test**

```bash
TELEOP_TOKEN=testtoken ROBOT_NAME="Test Bot" ROBOT_NAMESPACE=test_ns docker compose up --build
```

Open `http://<pi-ip>:8080?token=testtoken`. Verify:
1. Status pill shows `● Connected — diff_drive`
2. Robot name strip above the video panel shows `Test Bot`
3. Settings → Connection shows `Robot name: Test Bot` and `ROS namespace: test_ns`

Then `Ctrl-C`, restart without identity env vars:

```bash
TELEOP_TOKEN=testtoken docker compose up --build
```

Verify: robot name strip is hidden, Connection page shows `—` for both fields.

- [ ] **Step 10: Update AGENTS.md**

Edit `AGENTS.md` directly (it is a symlink — `CLAUDE.md` is the symlink, `AGENTS.md` is the real file):
- Update Head SHA to the commit hash of this task's commit
- Update the Handoff State summary line to note robot identity is implemented
- Add a Known deviations row if anything unexpected was required during implementation

- [ ] **Step 11: Commit**

```bash
git add web-client/index.html AGENTS.md
git commit -m "feat: robot identity UI — read-only name/namespace display from server status"
```
