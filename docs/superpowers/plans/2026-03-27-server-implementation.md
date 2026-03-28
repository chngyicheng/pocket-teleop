# pocket-teleop Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ROS2 WebSocket server that receives velocity commands from a phone and publishes them to `/cmd_vel`, running fully inside a Docker container on a Raspberry Pi 5.

**Architecture:** A ROS2 node (`TeleopNode`) wraps a standalone WebSocket server (`TeleopServer`) via a publish callback. JSON parsing lives in a pure `CommandHandler` class. Only `TeleopNode` knows about ROS2. Everything runs inside a Docker container; the host needs only Docker and Docker Compose.

**Tech Stack:** C++17, ROS2 Humble, websocketpp + Boost.Asio, nlohmann/json, gtest + ament_cmake_gtest, Docker (ros:humble base image), Docker Compose

---

## File Map

```
.
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
└── server/
    ├── package.xml
    ├── CMakeLists.txt
    ├── launch/
    │   └── teleop.launch.py
    ├── src/
    │   ├── main.cpp
    │   ├── command_handler.hpp
    │   ├── command_handler.cpp
    │   ├── teleop_server.hpp
    │   ├── teleop_server.cpp
    │   ├── teleop_node.hpp
    │   └── teleop_node.cpp
    └── test/
        ├── test_command_handler.cpp
        ├── test_teleop_server.cpp
        └── test_teleop_node.cpp
```

**Responsibility of each file:**

| File | Responsibility |
|---|---|
| `Dockerfile` | Multi-stage build: install deps, compile workspace, run node |
| `docker-compose.yml` | Service definition, port mapping, token env var |
| `.dockerignore` | Exclude .git, web-client/, docs from build context |
| `package.xml` | ROS2 package manifest and dependency declarations |
| `CMakeLists.txt` | ament_cmake build config for executable and tests |
| `command_handler.hpp/.cpp` | Parse and validate JSON messages; no I/O |
| `teleop_server.hpp/.cpp` | WebSocket server, token auth, single-client, watchdog |
| `teleop_node.hpp/.cpp` | ROS2 node wrapper; owns TeleopServer; publishes Twist |
| `main.cpp` | Entry point; creates and spins TeleopNode |
| `teleop.launch.py` | Launch file with configurable ROS2 parameters |
| `test_command_handler.cpp` | Unit tests for CommandHandler (no ROS2, no WebSocket) |
| `test_teleop_server.cpp` | Integration tests for TeleopServer with mock callback |
| `test_teleop_node.cpp` | ROS2 integration test for full node → /cmd_vel pipeline |

---

## Task 1: Docker scaffolding ✅ DONE (commit c3ad6e2 + d240a20)

> **Deviations:** `TELEOP_TOKEN:?Error:...` guard added (hardening). `--network=host` added to build (Pi5 DNS fix, commit ed6a33f). See AGENTS.md Handoff State for details.

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [x] **Step 1: Create `.dockerignore`**

```
.git
web-client/
docs/
*.md
```

- [x] **Step 2: Create `Dockerfile`**

```dockerfile
# ---- builder stage ----
FROM ros:humble AS builder

RUN apt-get update && apt-get install -y \
    libwebsocketpp-dev \
    libboost-system-dev \
    nlohmann-json3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /ros2_ws/src/pocket_teleop
COPY server/ .

WORKDIR /ros2_ws
RUN . /opt/ros/humble/setup.sh && colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release

# ---- runtime stage ----
FROM ros:humble

RUN apt-get update && apt-get install -y \
    libboost-system1.74.0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /ros2_ws/install /ros2_ws/install

WORKDIR /ros2_ws

EXPOSE 9091

CMD ["/bin/bash", "-c", \
  ". /opt/ros/humble/setup.sh && \
   . /ros2_ws/install/setup.sh && \
   ros2 run pocket_teleop teleop_node \
     --ros-args \
     -p token:=${TELEOP_TOKEN} \
     -p port:=9091 \
     -p timeout_ms:=500 \
     -p cmd_vel_topic:=/cmd_vel \
     -p robot_type:=${ROBOT_TYPE:-diff_drive}"]
```

- [x] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  teleop-server:
    build: .
    ports:
      - "9091:9091"
    environment:
      - TELEOP_TOKEN=${TELEOP_TOKEN}
      - ROBOT_TYPE=${ROBOT_TYPE:-diff_drive}
    restart: unless-stopped
```

- [x] **Step 4: Verify `.dockerignore`, `Dockerfile`, and `docker-compose.yml` are present**

- [x] **Step 5: Commit**

---

## Task 2: ROS2 package scaffolding ✅ DONE (commit a11a3cf)

> **Note:** `main.cpp` stub contains `int main() { return 0; }` (not empty — linker requires it). All other stubs are empty. Docker build verified with `--network=host`.
> **Pending fix for Task 3 start:** Add `CMAKE_CXX_STANDARD_REQUIRED ON` and `CMAKE_CXX_EXTENSIONS OFF` to `CMakeLists.txt`.

**Files:**
- Create: `server/package.xml`
- Create: `server/CMakeLists.txt`
- Create: `server/src/` (directory placeholder)
- Create: `server/test/` (directory placeholder)
- Create: `server/launch/` (directory placeholder)

- [x] **Step 1: Create `server/package.xml`**

```xml
<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>pocket_teleop</name>
  <version>0.1.0</version>
  <description>Mobile-first robot teleoperation over WebSocket</description>
  <maintainer email="yiichengg@gmail.com">chngyicheng</maintainer>
  <license>MIT</license>

  <buildtool_depend>ament_cmake</buildtool_depend>

  <depend>rclcpp</depend>
  <depend>geometry_msgs</depend>

  <build_depend>libwebsocketpp-dev</build_depend>
  <build_depend>libboost-system-dev</build_depend>
  <build_depend>nlohmann-json3-dev</build_depend>

  <test_depend>ament_cmake_gtest</test_depend>
  <test_depend>ament_lint_auto</test_depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
```

- [ ] **Step 2: Create `server/CMakeLists.txt`**

```cmake
cmake_minimum_required(VERSION 3.8)
project(pocket_teleop)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

set(CMAKE_CXX_STANDARD 17)

# Dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(nlohmann_json 3.2.0 REQUIRED)
find_package(Boost REQUIRED COMPONENTS system)
find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/server.hpp REQUIRED)

# Main executable
add_executable(teleop_node
  src/main.cpp
  src/teleop_node.cpp
  src/teleop_server.cpp
  src/command_handler.cpp
)

target_include_directories(teleop_node PRIVATE
  src/
  ${WEBSOCKETPP_INCLUDE_DIR}
)

target_link_libraries(teleop_node
  nlohmann_json::nlohmann_json
  Boost::system
)

ament_target_dependencies(teleop_node rclcpp geometry_msgs)

install(TARGETS teleop_node DESTINATION lib/${PROJECT_NAME})
install(DIRECTORY launch/ DESTINATION share/${PROJECT_NAME}/launch)

# Tests
if(BUILD_TESTING)
  find_package(ament_cmake_gtest REQUIRED)

  # test_command_handler — no ROS2, no WebSocket
  ament_add_gtest(test_command_handler
    test/test_command_handler.cpp
    src/command_handler.cpp
  )
  target_include_directories(test_command_handler PRIVATE src/)
  target_link_libraries(test_command_handler nlohmann_json::nlohmann_json)

  # test_teleop_server — WebSocket + mock callback, no ROS2
  ament_add_gtest(test_teleop_server
    test/test_teleop_server.cpp
    src/teleop_server.cpp
    src/command_handler.cpp
  )
  target_include_directories(test_teleop_server PRIVATE
    src/
    ${WEBSOCKETPP_INCLUDE_DIR}
  )
  target_link_libraries(test_teleop_server
    nlohmann_json::nlohmann_json
    Boost::system
  )

  # test_teleop_node — full ROS2 integration
  ament_add_gtest(test_teleop_node
    test/test_teleop_node.cpp
    src/teleop_node.cpp
    src/teleop_server.cpp
    src/command_handler.cpp
  )
  target_include_directories(test_teleop_node PRIVATE
    src/
    ${WEBSOCKETPP_INCLUDE_DIR}
  )
  target_link_libraries(test_teleop_node
    nlohmann_json::nlohmann_json
    Boost::system
  )
  ament_target_dependencies(test_teleop_node rclcpp geometry_msgs)
endif()

ament_package()
```

- [x] **Step 3: Create stub source files so the package compiles**

- [x] **Step 4: Verify the Docker image builds (package scaffolding compiles)**

- [x] **Step 5: Commit**

---

## Task 3: CommandHandler — data types and header ✅ DONE (commits adf3133 + 00301e0)

> **Deviations:** Testing trophy philosophy adopted — `test_command_handler.cpp` left empty. Parsing behavior will be covered by `test_teleop_server` integration tests in Tasks 5–9. CMakeLists C++17 fix committed separately (adf3133).

**Files:**
- Modified: `server/src/command_handler.hpp`
- Modified: `server/src/command_handler.cpp`
- `server/test/test_command_handler.cpp` — intentionally left empty (see deviation above)

- [x] **Step 1: Apply CMakeLists fix** — add `CMAKE_CXX_STANDARD_REQUIRED ON` and `CMAKE_CXX_EXTENSIONS OFF`

- [x] **Step 2: Write `command_handler.hpp`**

- [x] **Step 3: Write stub `command_handler.cpp`** — returns `ParseError{"not implemented"}` after type check; JSON exceptions caught

- [x] **Step 4: Build verification** — `docker build --target builder` passed; `colcon build` clean

- [x] **Step 5: Commit** — `feat: add CommandHandler types and header with stub implementation`

---

## Task 4: CommandHandler — ping and twist parsing ✅ DONE (commit da3893d)

> **Testing trophy deviation:** No unit tests written for this task. Parsing correctness is verified end-to-end via `test_teleop_server` in Tasks 5–9 (real WebSocket messages → real parse paths). Only `command_handler.cpp` is modified here.

**Files:**
- Modify: `server/src/command_handler.cpp`

- [x] **Step 1: Implement full parsing in `command_handler.cpp`**

```cpp
#include "command_handler.hpp"
#include <nlohmann/json.hpp>

ParseResult CommandHandler::parse(const std::string& json_message) {
  try {
    auto j = nlohmann::json::parse(json_message);

    if (!j.contains("type") || !j["type"].is_string()) {
      return ParseError{"missing or invalid 'type' field"};
    }

    const std::string type = j["type"];

    if (type == "ping") {
      return PingCommand{};
    }

    if (type == "twist") {
      for (const char* field : {"linear_x", "linear_y", "angular_z"}) {
        if (!j.contains(field) || !j[field].is_number()) {
          return ParseError{std::string("missing or invalid field: ") + field};
        }
      }
      const double lx = j["linear_x"];
      const double ly = j["linear_y"];
      const double az = j["angular_z"];

      for (auto [name, val] : std::initializer_list<std::pair<const char*, double>>{
             {"linear_x", lx}, {"linear_y", ly}, {"angular_z", az}}) {
        if (val < -1.0 || val > 1.0) {
          return ParseError{std::string("field out of range [-1.0, 1.0]: ") + name};
        }
      }
      return TwistCommand{lx, ly, az};
    }

    return ParseError{"unknown type: " + type};

  } catch (const nlohmann::json::exception& e) {
    return ParseError{std::string("JSON parse error: ") + e.what()};
  }
}
```

- [x] **Step 2: Build verification** — `docker build --target builder` must pass

- [x] **Step 3: Commit**

```bash
git add server/src/command_handler.cpp
git commit -m "feat: implement CommandHandler ping/twist parsing and range validation"
```

---

## Task 5: TeleopServer — skeleton and start/stop ✅ DONE (commit a97d4bb)

**Files:**
- Modify: `server/src/teleop_server.hpp`
- Modify: `server/src/teleop_server.cpp`
- Modify: `server/test/test_teleop_server.cpp`

- [x] **Step 1: Write `server/src/teleop_server.hpp`**

```cpp
#pragma once
#include <functional>
#include <string>
#include <atomic>
#include <thread>
#include <mutex>
#include <chrono>

#define ASIO_STANDALONE
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

- [x] **Step 2: Write `server/src/teleop_server.cpp` (start/stop only)**

```cpp
#include "teleop_server.hpp"
#include <nlohmann/json.hpp>
#include <sstream>
#include <iostream>

using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;
using websocketpp::lib::bind;

TeleopServer::TeleopServer(const std::string& token,
                           int port,
                           int timeout_ms,
                           const std::string& robot_type,
                           PublishCallback callback)
  : token_(token),
    port_(port),
    timeout_ms_(timeout_ms),
    robot_type_(robot_type),
    publish_callback_(std::move(callback)) {
  ws_server_.set_access_channels(websocketpp::log::alevel::none);
  ws_server_.set_error_channels(websocketpp::log::elevel::none);
  ws_server_.init_asio();
  ws_server_.set_reuse_addr(true);

  ws_server_.set_validate_handler(bind(&TeleopServer::on_validate, this, _1));
  ws_server_.set_open_handler(bind(&TeleopServer::on_open, this, _1));
  ws_server_.set_close_handler(bind(&TeleopServer::on_close, this, _1));
  ws_server_.set_message_handler(bind(&TeleopServer::on_message, this, _1, _2));
}

TeleopServer::~TeleopServer() {
  stop();
}

void TeleopServer::start() {
  running_ = true;
  reset_watchdog();

  ws_server_.listen(port_);
  ws_server_.start_accept();

  watchdog_thread_ = std::thread(&TeleopServer::watchdog_loop, this);
  ws_server_.run();
}

void TeleopServer::stop() {
  if (!running_.exchange(false)) return;
  ws_server_.stop_listening();
  ws_server_.stop();
  if (watchdog_thread_.joinable()) watchdog_thread_.join();
}

void TeleopServer::reset_watchdog() {
  auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::steady_clock::now().time_since_epoch()).count();
  last_message_ms_.store(now);
  timed_out_ = false;
}

bool TeleopServer::on_validate(ConnectionHdl hdl) {
  // Implemented in Task 6
  (void)hdl;
  return true;
}

void TeleopServer::on_open(ConnectionHdl hdl) {
  // Implemented in Task 7
  (void)hdl;
}

void TeleopServer::on_close(ConnectionHdl hdl) {
  std::lock_guard<std::mutex> lock(client_mutex_);
  (void)hdl;
  has_client_ = false;
}

void TeleopServer::on_message(ConnectionHdl hdl, WsServer::message_ptr msg) {
  // Implemented in Task 8
  (void)hdl;
  (void)msg;
}

void TeleopServer::watchdog_loop() {
  // Implemented in Task 9
  while (running_) {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }
}
```

- [x] **Step 3: Write failing start/stop test**

`server/test/test_teleop_server.cpp`:
```cpp
#include <gtest/gtest.h>
#include <thread>
#include <chrono>
#include <vector>
#include <string>

#define ASIO_STANDALONE
#include <websocketpp/config/asio_no_tls_client.hpp>
#include <websocketpp/client.hpp>
#include <nlohmann/json.hpp>

#include "teleop_server.hpp"

using WsClient = websocketpp::client<websocketpp::config::asio>;

class TeleopServerTest : public ::testing::Test {
protected:
  void SetUp() override {
    callback_count_ = 0;
    last_lx_ = last_ly_ = last_az_ = 0.0;
    server_ = std::make_unique<TeleopServer>(
      "testtoken", 19091, 300, "diff_drive",
      [this](double lx, double ly, double az) {
        ++callback_count_;
        last_lx_ = lx; last_ly_ = ly; last_az_ = az;
      });
    server_thread_ = std::thread([this]() { server_->start(); });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }

  void TearDown() override {
    server_->stop();
    if (server_thread_.joinable()) server_thread_.join();
  }

  std::unique_ptr<TeleopServer> server_;
  std::thread server_thread_;
  int callback_count_;
  double last_lx_, last_ly_, last_az_;
};

TEST_F(TeleopServerTest, ServerStartsAndStops) {
  // If we reach here, start/stop worked
  SUCCEED();
}
```

- [x] **Step 4: Run test**

```bash
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  $(docker build --target builder -q .) \
  /bin/bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon build --packages-select pocket_teleop && colcon test --packages-select pocket_teleop --event-handlers console_direct+ 2>&1 | grep -E 'ServerStartsAndStops|PASSED|FAILED|error'"
```
Expected: `ServerStartsAndStops` PASSED.

- [x] **Step 5: Commit**

```bash
git add server/src/teleop_server.hpp server/src/teleop_server.cpp server/test/test_teleop_server.cpp
git commit -m "feat: add TeleopServer skeleton with start/stop"
```

---

## Task 6: TeleopServer — token validation ✅ DONE (commit f6325de)

**Files:**
- Modify: `server/src/teleop_server.cpp`
- Modify: `server/test/test_teleop_server.cpp`

- [x] **Step 1: Write failing tests**

Append to `server/test/test_teleop_server.cpp`:
```cpp
// Helper: attempt a WebSocket connection and return the HTTP status code
// Returns 101 on successful upgrade, 401/503 on rejection
static int attempt_connect(const std::string& uri) {
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  int status_code = 0;
  client.set_fail_handler([&](websocketpp::connection_hdl hdl) {
    auto con = client.get_con_from_hdl(hdl);
    status_code = con->get_response_code();
  });
  client.set_open_handler([&](websocketpp::connection_hdl hdl) {
    status_code = 101;
    client.close(hdl, websocketpp::close::status::normal, "");
  });

  websocketpp::lib::error_code ec;
  auto con = client.get_connection(uri, ec);
  if (ec) return -1;
  client.connect(con);
  client.run();
  return status_code;
}

TEST_F(TeleopServerTest, ValidTokenAccepted) {
  int code = attempt_connect("ws://localhost:19091/teleop?token=testtoken");
  EXPECT_EQ(code, 101);
}

TEST_F(TeleopServerTest, InvalidTokenRejectedWith401) {
  int code = attempt_connect("ws://localhost:19091/teleop?token=wrongtoken");
  EXPECT_EQ(code, 401);
}

TEST_F(TeleopServerTest, MissingTokenRejectedWith401) {
  int code = attempt_connect("ws://localhost:19091/teleop");
  EXPECT_EQ(code, 401);
}
```

- [x] **Step 2: Implement `on_validate` in `teleop_server.cpp`**

Replace the stub `on_validate`:
```cpp
bool TeleopServer::on_validate(ConnectionHdl hdl) {
  auto con = ws_server_.get_con_from_hdl(hdl);
  const std::string resource = con->get_resource();

  // Extract token from query string (/teleop?token=xxx)
  std::string token;
  const auto q = resource.find('?');
  if (q != std::string::npos) {
    std::istringstream ss(resource.substr(q + 1));
    std::string pair;
    while (std::getline(ss, pair, '&')) {
      const auto eq = pair.find('=');
      if (eq != std::string::npos && pair.substr(0, eq) == "token") {
        token = pair.substr(eq + 1);
        break;
      }
    }
  }

  if (token != token_) {
    con->set_status(websocketpp::http::status_code::unauthorized);
    return false;
  }

  return true;
}
```

- [x] **Step 3: Run tests**

```bash
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  $(docker build --target builder -q .) \
  /bin/bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon build --packages-select pocket_teleop && colcon test --packages-select pocket_teleop --event-handlers console_direct+ 2>&1 | grep -E 'Token|PASSED|FAILED|error'"
```
Expected: `ValidTokenAccepted`, `InvalidTokenRejectedWith401`, `MissingTokenRejectedWith401` all PASSED.

- [x] **Step 4: Commit**

```bash
git add server/src/teleop_server.cpp server/test/test_teleop_server.cpp
git commit -m "feat: implement token validation on WebSocket handshake"
```

---

## Task 7: TeleopServer — single-client enforcement and status message ✅ DONE (commit 49b4621)

**Files:**
- Modify: `server/src/teleop_server.cpp`
- Modify: `server/test/test_teleop_server.cpp`

- [x] **Step 1: Write failing test**

Append to `server/test/test_teleop_server.cpp`:
```cpp
// Helper: connect, collect messages for up to wait_ms, then close
static std::vector<std::string> connect_and_collect(
    const std::string& uri, int wait_ms = 200) {
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  std::vector<std::string> messages;
  client.set_message_handler(
    [&](websocketpp::connection_hdl, WsClient::message_ptr msg) {
      messages.push_back(msg->get_payload());
    });

  websocketpp::lib::error_code ec;
  auto con = client.get_connection(uri, ec);
  client.connect(con);

  // Run async for wait_ms then stop
  std::thread t([&]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(wait_ms));
    client.stop();
  });
  client.run();
  t.join();
  return messages;
}

TEST_F(TeleopServerTest, ConnectReceivesStatusMessage) {
  auto msgs = connect_and_collect("ws://localhost:19091/teleop?token=testtoken");
  ASSERT_FALSE(msgs.empty());
  auto j = nlohmann::json::parse(msgs[0]);
  EXPECT_EQ(j["type"], "status");
  EXPECT_EQ(j["connected"], true);
  EXPECT_EQ(j["robot_type"], "diff_drive");
}

TEST_F(TeleopServerTest, SecondClientReceivesAlreadyConnectedError) {
  // First client stays connected in background
  WsClient client1;
  client1.set_access_channels(websocketpp::log::alevel::none);
  client1.set_error_channels(websocketpp::log::elevel::none);
  client1.init_asio();
  client1.set_open_handler([](websocketpp::connection_hdl) {});
  websocketpp::lib::error_code ec1;
  auto con1 = client1.get_connection("ws://localhost:19091/teleop?token=testtoken", ec1);
  client1.connect(con1);
  std::thread t1([&]() { client1.run(); });

  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  // Second client
  auto msgs = connect_and_collect("ws://localhost:19091/teleop?token=testtoken", 300);

  client1.stop();
  t1.join();

  bool found_error = false;
  for (auto& m : msgs) {
    try {
      auto j = nlohmann::json::parse(m);
      if (j.value("type", "") == "error" &&
          j.value("message", "").find("already connected") != std::string::npos) {
        found_error = true;
      }
    } catch (...) {}
  }
  EXPECT_TRUE(found_error);
}
```

- [x] **Step 2: Implement `on_open` in `teleop_server.cpp`**

Replace the stub `on_open`:
```cpp
void TeleopServer::on_open(ConnectionHdl hdl) {
  std::lock_guard<std::mutex> lock(client_mutex_);

  if (has_client_) {
    nlohmann::json err = {{"type", "error"}, {"message", "already connected"}};
    ws_server_.send(hdl, err.dump(), websocketpp::frame::opcode::text);
    ws_server_.close(hdl, websocketpp::close::status::normal, "already connected");
    return;
  }

  active_client_ = hdl;
  has_client_ = true;
  reset_watchdog();

  nlohmann::json status = {
    {"type", "status"},
    {"connected", true},
    {"robot_type", robot_type_}
  };
  ws_server_.send(hdl, status.dump(), websocketpp::frame::opcode::text);
}
```

- [x] **Step 3: Run tests**

```bash
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  $(docker build --target builder -q .) \
  /bin/bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon build --packages-select pocket_teleop && colcon test --packages-select pocket_teleop --event-handlers console_direct+ 2>&1 | grep -E 'Connect|Second|PASSED|FAILED|error'"
```
Expected: `ConnectReceivesStatusMessage`, `SecondClientReceivesAlreadyConnectedError` PASSED.

- [x] **Step 4: Commit**

```bash
git add server/src/teleop_server.cpp server/test/test_teleop_server.cpp
git commit -m "feat: enforce single-client and send status on connect"
```

---

## Task 8: TeleopServer — message handling (twist and ping)

**Files:**
- Modify: `server/src/teleop_server.cpp`
- Modify: `server/test/test_teleop_server.cpp`

- [ ] **Step 1: Write failing tests**

Append to `server/test/test_teleop_server.cpp`:
```cpp
// Helper: connect, send a message, collect responses for wait_ms
static std::vector<std::string> connect_send_collect(
    const std::string& uri, const std::string& payload, int wait_ms = 200) {
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  std::vector<std::string> messages;
  client.set_open_handler([&](websocketpp::connection_hdl hdl) {
    client.send(hdl, payload, websocketpp::frame::opcode::text);
  });
  client.set_message_handler(
    [&](websocketpp::connection_hdl, WsClient::message_ptr msg) {
      messages.push_back(msg->get_payload());
    });

  websocketpp::lib::error_code ec;
  auto con = client.get_connection(uri, ec);
  client.connect(con);
  std::thread t([&]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(wait_ms));
    client.stop();
  });
  client.run();
  t.join();
  return messages;
}

TEST_F(TeleopServerTest, TwistFiresCallback) {
  auto msgs = connect_send_collect(
    "ws://localhost:19091/teleop?token=testtoken",
    R"({"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":-0.3})");
  EXPECT_GE(callback_count_, 1);
  EXPECT_DOUBLE_EQ(last_lx_, 0.5);
  EXPECT_DOUBLE_EQ(last_ly_, 0.0);
  EXPECT_DOUBLE_EQ(last_az_, -0.3);
}

TEST_F(TeleopServerTest, PingReturnsPongCallbackNotFired) {
  int before = callback_count_;
  auto msgs = connect_send_collect(
    "ws://localhost:19091/teleop?token=testtoken",
    R"({"type":"ping"})");
  EXPECT_EQ(callback_count_, before);
  bool got_pong = false;
  for (auto& m : msgs) {
    try {
      auto j = nlohmann::json::parse(m);
      if (j.value("type", "") == "pong") got_pong = true;
    } catch (...) {}
  }
  EXPECT_TRUE(got_pong);
}

TEST_F(TeleopServerTest, MalformedMessageReturnsErrorCallbackNotFired) {
  int before = callback_count_;
  auto msgs = connect_send_collect(
    "ws://localhost:19091/teleop?token=testtoken",
    "not json at all");
  EXPECT_EQ(callback_count_, before);
  bool got_error = false;
  for (auto& m : msgs) {
    try {
      auto j = nlohmann::json::parse(m);
      if (j.value("type", "") == "error") got_error = true;
    } catch (...) {}
  }
  EXPECT_TRUE(got_error);
}
```

- [ ] **Step 2: Implement `on_message` in `teleop_server.cpp`**

Replace the stub `on_message`:
```cpp
void TeleopServer::on_message(ConnectionHdl hdl, WsServer::message_ptr msg) {
  auto result = command_handler_.parse(msg->get_payload());

  if (std::holds_alternative<TwistCommand>(result)) {
    reset_watchdog();
    auto cmd = std::get<TwistCommand>(result);
    publish_callback_(cmd.linear_x, cmd.linear_y, cmd.angular_z);

  } else if (std::holds_alternative<PingCommand>(result)) {
    reset_watchdog();
    nlohmann::json pong = {{"type", "pong"}};
    ws_server_.send(hdl, pong.dump(), websocketpp::frame::opcode::text);

  } else {
    auto err = std::get<ParseError>(result);
    nlohmann::json error = {{"type", "error"}, {"message", err.message}};
    ws_server_.send(hdl, error.dump(), websocketpp::frame::opcode::text);
  }
}
```

- [ ] **Step 3: Run tests**

```bash
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  $(docker build --target builder -q .) \
  /bin/bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon build --packages-select pocket_teleop && colcon test --packages-select pocket_teleop --event-handlers console_direct+ 2>&1 | grep -E 'Twist|Ping|Malformed|PASSED|FAILED|error'"
```
Expected: `TwistFiresCallback`, `PingReturnsPongCallbackNotFired`, `MalformedMessageReturnsErrorCallbackNotFired` all PASSED.

- [ ] **Step 4: Commit**

```bash
git add server/src/teleop_server.cpp server/test/test_teleop_server.cpp
git commit -m "feat: implement message handling for twist and ping"
```

---

## Task 9: TeleopServer — safety watchdog

**Files:**
- Modify: `server/src/teleop_server.cpp`
- Modify: `server/test/test_teleop_server.cpp`

- [ ] **Step 1: Write failing test**

Append to `server/test/test_teleop_server.cpp`:
```cpp
TEST_F(TeleopServerTest, WatchdogFiresZeroVelocityOnTimeout) {
  // Connect (resets watchdog), then go silent for longer than timeout_ms (300ms)
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19091/teleop?token=testtoken", ec);
  client.connect(con);
  std::thread t([&]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    client.stop();
  });
  client.run();
  t.join();

  // Watchdog should have fired with (0,0,0)
  EXPECT_GE(callback_count_, 1);
  EXPECT_DOUBLE_EQ(last_lx_, 0.0);
  EXPECT_DOUBLE_EQ(last_ly_, 0.0);
  EXPECT_DOUBLE_EQ(last_az_, 0.0);
}
```

- [ ] **Step 2: Implement `watchdog_loop` in `teleop_server.cpp`**

Replace the stub `watchdog_loop`:
```cpp
void TeleopServer::watchdog_loop() {
  while (running_) {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    bool client_connected;
    {
      std::lock_guard<std::mutex> lock(client_mutex_);
      client_connected = has_client_;
    }

    if (!client_connected || timed_out_) continue;

    const auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count();

    if (now_ms - last_message_ms_.load() > timeout_ms_) {
      timed_out_ = true;
      // Post to io_service so close() runs on the correct thread
      ws_server_.get_io_service().post([this]() {
        publish_callback_(0.0, 0.0, 0.0);
        std::lock_guard<std::mutex> lock(client_mutex_);
        if (has_client_) {
          websocketpp::lib::error_code ec;
          ws_server_.close(active_client_,
            websocketpp::close::status::normal, "timeout", ec);
          has_client_ = false;
        }
      });
    }
  }
}
```

- [ ] **Step 3: Run all TeleopServer tests**

```bash
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  $(docker build --target builder -q .) \
  /bin/bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon build --packages-select pocket_teleop && colcon test --packages-select pocket_teleop --event-handlers console_direct+ 2>&1 | grep -E 'test_teleop_server|PASSED|FAILED|error'"
```
Expected: all `test_teleop_server` tests PASSED.

- [ ] **Step 4: Commit**

```bash
git add server/src/teleop_server.cpp server/test/test_teleop_server.cpp
git commit -m "feat: implement safety watchdog timeout"
```

---

## Task 10: TeleopNode — ROS2 wrapper

**Files:**
- Modify: `server/src/teleop_node.hpp`
- Modify: `server/src/teleop_node.cpp`
- Modify: `server/test/test_teleop_node.cpp`

- [ ] **Step 1: Write `server/src/teleop_node.hpp`**

```cpp
#pragma once
#include <memory>
#include <thread>
#include <rclcpp/rclcpp.hpp>
#include <geometry_msgs/msg/twist.hpp>
#include "teleop_server.hpp"

class TeleopNode : public rclcpp::Node {
public:
  explicit TeleopNode(const rclcpp::NodeOptions& options = rclcpp::NodeOptions());
  ~TeleopNode();

private:
  void publish_twist(double lx, double ly, double az);

  rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr publisher_;
  std::unique_ptr<TeleopServer> server_;
  std::thread server_thread_;
};
```

- [ ] **Step 2: Write `server/src/teleop_node.cpp`**

```cpp
#include "teleop_node.hpp"

TeleopNode::TeleopNode(const rclcpp::NodeOptions& options)
  : Node("teleop_node", options) {

  declare_parameter("port",          9091);
  declare_parameter("token",         std::string(""));
  declare_parameter("timeout_ms",    500);
  declare_parameter("cmd_vel_topic", std::string("/cmd_vel"));
  declare_parameter("robot_type",    std::string("diff_drive"));

  const auto token = get_parameter("token").as_string();
  if (token.empty()) {
    RCLCPP_FATAL(get_logger(), "Parameter 'token' is required but not set. Exiting.");
    throw std::runtime_error("token parameter is required");
  }

  const auto port       = get_parameter("port").as_int();
  const auto timeout_ms = get_parameter("timeout_ms").as_int();
  const auto topic      = get_parameter("cmd_vel_topic").as_string();
  const auto robot_type = get_parameter("robot_type").as_string();

  publisher_ = create_publisher<geometry_msgs::msg::Twist>(topic, 10);

  server_ = std::make_unique<TeleopServer>(
    token,
    static_cast<int>(port),
    static_cast<int>(timeout_ms),
    robot_type,
    [this](double lx, double ly, double az) { publish_twist(lx, ly, az); });

  server_thread_ = std::thread([this]() { server_->start(); });

  RCLCPP_INFO(get_logger(), "Teleop server listening on port %ld", port);
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

- [ ] **Step 3: Write integration test**

`server/test/test_teleop_node.cpp`:
```cpp
#include <gtest/gtest.h>
#include <thread>
#include <chrono>
#include <rclcpp/rclcpp.hpp>
#include <geometry_msgs/msg/twist.hpp>

#define ASIO_STANDALONE
#include <websocketpp/config/asio_no_tls_client.hpp>
#include <websocketpp/client.hpp>

#include "teleop_node.hpp"

using WsClient = websocketpp::client<websocketpp::config::asio>;

class TeleopNodeTest : public ::testing::Test {
protected:
  void SetUp() override {
    rclcpp::init(0, nullptr);
    rclcpp::NodeOptions opts;
    opts.append_parameter_override("token", "nodetest");
    opts.append_parameter_override("port", 19092);
    opts.append_parameter_override("timeout_ms", 500);
    node_ = std::make_shared<TeleopNode>(opts);

    received_msgs_.clear();
    auto sub = node_->create_subscription<geometry_msgs::msg::Twist>(
      "/cmd_vel", 10,
      [this](geometry_msgs::msg::Twist::SharedPtr msg) {
        received_msgs_.push_back(*msg);
      });
    subscription_ = sub;

    spin_thread_ = std::thread([this]() {
      rclcpp::spin(node_);
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }

  void TearDown() override {
    rclcpp::shutdown();
    if (spin_thread_.joinable()) spin_thread_.join();
  }

  std::shared_ptr<TeleopNode> node_;
  rclcpp::Subscription<geometry_msgs::msg::Twist>::SharedPtr subscription_;
  std::thread spin_thread_;
  std::vector<geometry_msgs::msg::Twist> received_msgs_;
};

TEST_F(TeleopNodeTest, TwistPublishedToCmdVel) {
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  client.set_open_handler([&](websocketpp::connection_hdl hdl) {
    client.send(hdl,
      R"({"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":-0.3})",
      websocketpp::frame::opcode::text);
  });
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19092/teleop?token=nodetest", ec);
  client.connect(con);
  std::thread t([&]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    client.stop();
  });
  client.run();
  t.join();

  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  ASSERT_FALSE(received_msgs_.empty());
  EXPECT_DOUBLE_EQ(received_msgs_.back().linear.x,  0.5);
  EXPECT_DOUBLE_EQ(received_msgs_.back().linear.y,  0.0);
  EXPECT_DOUBLE_EQ(received_msgs_.back().angular.z, -0.3);
}

TEST_F(TeleopNodeTest, DisconnectPublishesZeroVelocity) {
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19092/teleop?token=nodetest", ec);
  client.connect(con);
  std::thread t([&]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(700)); // > timeout_ms
    client.stop();
  });
  client.run();
  t.join();

  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  ASSERT_FALSE(received_msgs_.empty());
  auto last = received_msgs_.back();
  EXPECT_DOUBLE_EQ(last.linear.x,  0.0);
  EXPECT_DOUBLE_EQ(last.linear.y,  0.0);
  EXPECT_DOUBLE_EQ(last.angular.z, 0.0);
}
```

- [ ] **Step 4: Run all tests**

```bash
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  $(docker build --target builder -q .) \
  /bin/bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon build --packages-select pocket_teleop && colcon test --packages-select pocket_teleop --event-handlers console_direct+ 2>&1 | grep -E 'test_teleop_node|PASSED|FAILED|error'"
```
Expected: `TwistPublishedToCmdVel`, `DisconnectPublishesZeroVelocity` PASSED.

- [ ] **Step 5: Commit**

```bash
git add server/src/teleop_node.hpp server/src/teleop_node.cpp server/test/test_teleop_node.cpp
git commit -m "feat: implement TeleopNode ROS2 wrapper"
```

---

## Task 11: main.cpp and launch file ✅ DONE (commit 18bba31)

> **Deviation:** `docker-compose.yml` environment value quoted to fix Docker Compose v2.35 YAML parse error on `:?` error message containing a colon.

**Files:**
- Modify: `server/src/main.cpp`
- Modify: `server/launch/teleop.launch.py`

- [x] **Step 1: Write `server/src/main.cpp`**

```cpp
#include <rclcpp/rclcpp.hpp>
#include "teleop_node.hpp"

int main(int argc, char* argv[]) {
  rclcpp::init(argc, argv);
  try {
    rclcpp::spin(std::make_shared<TeleopNode>());
  } catch (const std::exception& e) {
    RCLCPP_FATAL(rclcpp::get_logger("main"), "Fatal error: %s", e.what());
    rclcpp::shutdown();
    return 1;
  }
  rclcpp::shutdown();
  return 0;
}
```

- [x] **Step 2: Write `server/launch/teleop.launch.py`**

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
                'port':          LaunchConfiguration('port'),
                'token':         EnvironmentVariable('TELEOP_TOKEN'),
                'timeout_ms':    LaunchConfiguration('timeout_ms'),
                'cmd_vel_topic': LaunchConfiguration('cmd_vel_topic'),
                'robot_type':    LaunchConfiguration('robot_type'),
            }],
            output='screen',
        ),
    ])
```

- [x] **Step 3: Do a full build inside Docker to verify everything compiles**

```bash
docker build -t pocket-teleop:latest .
```
Expected: build completes with no errors.

- [x] **Step 4: Smoke-test the container (token required)**

```bash
TELEOP_TOKEN=mytoken docker compose up -d
docker compose logs teleop-server
```
Expected: log line `Teleop server listening on port 9091`.

```bash
docker compose down
```

- [x] **Step 5: Commit**

```bash
git add server/src/main.cpp server/launch/teleop.launch.py
git commit -m "feat: add main.cpp entry point and launch file"
```

---

## Task 12: Run full test suite and verify

- [ ] **Step 1: Run all tests inside Docker**

```bash
docker run --rm \
  -v $(pwd)/server:/ros2_ws/src/pocket_teleop \
  $(docker build --target builder -q .) \
  /bin/bash -c ". /opt/ros/humble/setup.sh && cd /ros2_ws && colcon build --packages-select pocket_teleop && colcon test --packages-select pocket_teleop --event-handlers console_direct+ && colcon test-result --verbose"
```
Expected: all tests in `test_command_handler`, `test_teleop_server`, `test_teleop_node` PASSED. Zero failures.

- [ ] **Step 2: Tag the working state**

```bash
git tag v0.1.0-server
```

- [ ] **Step 3: Final commit if any loose files remain**

```bash
git status
# commit anything unstaged
```
