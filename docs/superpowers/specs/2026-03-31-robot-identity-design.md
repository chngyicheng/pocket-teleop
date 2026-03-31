# Robot Identity Design Spec

**Goal:** The server is authoritative for its own identity. It reports a display name and ROS2 namespace to the client on connection. The client shows the display name in the UI and no longer configures namespace itself.

---

## Parameters

Two new environment variables and corresponding ROS2 parameters, both optional (empty default):

| Env var | ROS2 parameter | Default | Purpose |
|---|---|---|---|
| `ROBOT_NAME` | `robot_name` | `""` | Free-form display string shown in the UI (e.g. `"Living Room Bot"`) |
| `ROBOT_NAMESPACE` | `robot_namespace` | `""` | ROS2-valid prefix for the cmd_vel topic (e.g. `lr_bot`) |

These are independent. A robot may have a name without a namespace (display only), a namespace without a name (topic scoping only), both, or neither.

---

## Server Changes

### `server/src/teleop_node.cpp`

Declare two new parameters after the existing ones:

```cpp
declare_parameter("robot_name",      std::string(""));
declare_parameter("robot_namespace", std::string(""));
```

Build the publisher topic:

```cpp
const auto robot_name      = get_parameter("robot_name").as_string();
const auto robot_namespace = get_parameter("robot_namespace").as_string();
const auto base_topic      = get_parameter("cmd_vel_topic").as_string();
const auto topic = robot_namespace.empty()
  ? base_topic
  : "/" + robot_namespace + "/cmd_vel";
```

Pass both to `TeleopServer` constructor alongside the existing `robot_type`.

### `server/include/teleop_server.hpp`

Add `robot_name` and `robot_namespace` to the constructor signature and as private members:

```cpp
TeleopServer(const std::string& token,
             int port,
             int timeout_ms,
             const std::string& robot_type,
             const std::string& robot_name,
             const std::string& robot_namespace,
             PublishCallback callback);
```

Add private members:
```cpp
const std::string robot_name_;
const std::string robot_namespace_;
```

### `server/src/teleop_server.cpp`

Update `on_open` to include both new fields in the status message:

```cpp
nlohmann::json status = {
  {"type",             "status"},
  {"connected",        true},
  {"robot_type",       robot_type_},
  {"robot_name",       robot_name_},
  {"robot_namespace",  robot_namespace_}
};
```

### `docker-compose.yml`

Add two env vars to the `teleop-server` service (empty defaults are safe — no namespace/name = original behaviour):

```yaml
environment:
  - "TELEOP_TOKEN=${TELEOP_TOKEN:?Error: TELEOP_TOKEN must be set before starting the server}"
  - ROBOT_TYPE=${ROBOT_TYPE:-diff_drive}
  - ROBOT_NAME=${ROBOT_NAME:-}
  - ROBOT_NAMESPACE=${ROBOT_NAMESPACE:-}
```

### `server/launch/teleop.launch.py`

Add two new launch arguments and parameter entries alongside the existing ones.

---

## Client Changes

### `web-client/src/teleop_client.ts`

Extend `TeleopClientOptions.onStatus` to include the two new fields:

```typescript
onStatus?: (connected: boolean, robotType: string, robotName: string, robotNamespace: string) => void;
```

Update the status message handler to pass them through (defaulting to empty string if absent — backwards compatible with older server versions):

```typescript
this.options.onStatus?.(
  msg.connected,
  msg.robot_type,
  msg.robot_name      ?? '',
  msg.robot_namespace ?? ''
);
```

### `web-client/index.html` — inline script

**Remove** the `applyNamespace(loadRobotNamespace())` call and the namespace input/apply/clear wiring entirely.

**Update** the `onStatus` callback to store and display the server-reported values:

```javascript
onStatus: (_connected, robotType, robotName, robotNamespace) => {
  setStatus('connected', `● Connected — ${robotType}`);
  applyRobotIdentity(robotName, robotNamespace);
},
```

**Replace** `applyNamespace` with `applyRobotIdentity`:

```javascript
function applyRobotIdentity(name, namespace) {
  robotNameStrip.textContent   = name || '';
  robotNameStrip.style.display = name ? 'block' : 'none';
  document.getElementById('robot-name-display').textContent  = name      || '—';
  document.getElementById('robot-ns-display').textContent    = namespace || '—';
}
```

**Remove** `&ns=...` from `buildWsUrl`.

**Remove** calls to `loadRobotNamespace`, `saveRobotNamespace`, `clearRobotNamespace` from the inline script (the functions remain in `settings.ts` for future use).

### `web-client/index.html` — Connection settings page HTML

Replace the current namespace input + apply/clear buttons with two read-only rows:

```html
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

A `field-value` CSS class (styled like `field-label` but normal weight, using `--text`) is added to the stylesheet.

---

## What Is Not Changed

- `settings.ts` — `loadRobotNamespace`, `saveRobotNamespace`, `clearRobotNamespace` stay in place (not called, not deleted)
- `TeleopServer` single-client constraint — unchanged
- WebSocket URL — `token` param retained; `ns` param dropped (was sent but never used server-side)
- Watchdog, command handling, all other behaviour — unchanged

---

## Testing

**Server unit tests:** None exist for C++ — covered by integration test.

**Integration test** (`web-client/test/integration.test.ts`): the test connects to a real server; the status message assertion needs updating to expect `robot_name` and `robot_namespace` fields (both empty string in the test environment).

**`teleop_client.ts` tests** (`web-client/test/integration.test.ts`): `onStatus` mock needs to accept four arguments. Verify the two new fields are passed through correctly.

**Manual smoke test:** Set `ROBOT_NAME="Test Bot"` and `ROBOT_NAMESPACE="test_ns"` in `.env`, rebuild, connect — confirm robot name strip shows "Test Bot", Connection page shows both values, ROS2 topic is `/test_ns/cmd_vel`.
