#include <gtest/gtest.h>
#include <thread>
#include <chrono>
#include <vector>
#include <string>

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
      19091, 300, "diff_drive", "", "", 0.0, 0.0,
      DisconnectAction::Stop, 0,
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
  auto msgs = connect_and_collect("ws://localhost:19091/teleop");
  ASSERT_FALSE(msgs.empty());
  auto j = nlohmann::json::parse(msgs[0]);
  EXPECT_EQ(j["type"], "status");
  EXPECT_EQ(j["connected"], true);
  EXPECT_EQ(j["robot_type"], "diff_drive");
}

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
    "ws://localhost:19091/teleop",
    R"({"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":-0.3})");
  EXPECT_GE(callback_count_, 1);
  EXPECT_DOUBLE_EQ(last_lx_, 0.5);
  EXPECT_DOUBLE_EQ(last_ly_, 0.0);
  EXPECT_DOUBLE_EQ(last_az_, -0.3);
}

TEST_F(TeleopServerTest, PingReturnsPongCallbackNotFired) {
  int before = callback_count_;
  auto msgs = connect_send_collect(
    "ws://localhost:19091/teleop",
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
    "ws://localhost:19091/teleop",
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

TEST_F(TeleopServerTest, WatchdogFiresZeroVelocityOnTimeout) {
  // Connect (resets watchdog), then go silent for longer than timeout_ms (300ms)
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19091/teleop", ec);
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

TEST_F(TeleopServerTest, SecondClientReceivesAlreadyConnectedError) {
  // First client stays connected in background
  WsClient client1;
  client1.set_access_channels(websocketpp::log::alevel::none);
  client1.set_error_channels(websocketpp::log::elevel::none);
  client1.init_asio();
  client1.set_open_handler([](websocketpp::connection_hdl) {});
  websocketpp::lib::error_code ec1;
  auto con1 = client1.get_connection("ws://localhost:19091/teleop", ec1);
  client1.connect(con1);
  std::thread t1([&]() { client1.run(); });

  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  // Second client
  auto msgs = connect_and_collect("ws://localhost:19091/teleop", 300);

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

// ---------------------------------------------------------------------------
// Helper: connect, send multiple ordered payloads, collect responses
// ---------------------------------------------------------------------------
static std::vector<std::string> connect_send_many_collect(
    const std::string& uri,
    const std::vector<std::string>& payloads,
    int wait_ms = 300) {
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  std::vector<std::string> messages;
  client.set_open_handler([&](websocketpp::connection_hdl hdl) {
    for (const auto& p : payloads) {
      client.send(hdl, p, websocketpp::frame::opcode::text);
    }
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

// ---------------------------------------------------------------------------
// E-STOP tests
// ---------------------------------------------------------------------------

// After estop, a subsequent twist must NOT update the published values —
// last published must remain (0,0,0) from the estop itself.
TEST_F(TeleopServerTest, EstopIgnoresSubsequentTwist) {
  connect_send_many_collect(
    "ws://localhost:19091/teleop",
    {
      R"({"type":"estop"})",
      R"({"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":0.0})"
    });
  // The estop published (0,0,0); the twist must have been suppressed.
  EXPECT_DOUBLE_EQ(last_lx_, 0.0);
  EXPECT_DOUBLE_EQ(last_ly_, 0.0);
  EXPECT_DOUBLE_EQ(last_az_, 0.0);
  // At least one publish (the estop zero) must have happened.
  EXPECT_GE(callback_count_, 1);
}

// After estop then estop_reset, the next twist must publish normally.
TEST_F(TeleopServerTest, EstopResetResumesTwist) {
  connect_send_many_collect(
    "ws://localhost:19091/teleop",
    {
      R"({"type":"estop"})",
      R"({"type":"estop_reset"})",
      R"({"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":0.0})"
    });
  EXPECT_DOUBLE_EQ(last_lx_, 0.5);
}

// Sending estop must produce a reply with type=="estop_state" and engaged==true.
TEST_F(TeleopServerTest, EstopRepliesWithEngagedState) {
  auto msgs = connect_send_many_collect(
    "ws://localhost:19091/teleop",
    { R"({"type":"estop"})" });

  bool found = false;
  for (auto& m : msgs) {
    try {
      auto j = nlohmann::json::parse(m);
      if (j.value("type", "") == "estop_state" &&
          j.value("engaged", false) == true) {
        found = true;
      }
    } catch (...) {}
  }
  EXPECT_TRUE(found);
}

// Sending estop_reset must produce a reply with type=="estop_state" and engaged==false.
TEST_F(TeleopServerTest, EstopResetRepliesWithDisengagedState) {
  auto msgs = connect_send_many_collect(
    "ws://localhost:19091/teleop",
    {
      R"({"type":"estop"})",
      R"({"type":"estop_reset"})"
    });

  bool found = false;
  for (auto& m : msgs) {
    try {
      auto j = nlohmann::json::parse(m);
      if (j.value("type", "") == "estop_state" &&
          j.value("engaged", true) == false) {
        found = true;
      }
    } catch (...) {}
  }
  EXPECT_TRUE(found);
}

// ---------------------------------------------------------------------------
// Robot footprint tests
// ---------------------------------------------------------------------------

TEST_F(TeleopServerTest, StatusMessageIncludesRobotDimensions) {
  auto msgs = connect_and_collect("ws://localhost:19091/teleop");
  ASSERT_FALSE(msgs.empty());
  auto j = nlohmann::json::parse(msgs[0]);
  EXPECT_EQ(j["type"], "status");
  EXPECT_TRUE(j.contains("robot_length"));
  EXPECT_TRUE(j.contains("robot_width"));
  EXPECT_DOUBLE_EQ(j["robot_length"], 0.0);
  EXPECT_DOUBLE_EQ(j["robot_width"], 0.0);
}

TEST_F(TeleopServerTest, RobotDimensionsPassedToStatusMessage) {
  // Create server with non-zero dimensions
  auto callback = [](double, double, double) {};
  auto test_server = std::make_unique<TeleopServer>(
    19094, 300, "diff_drive", "test_bot", "", 0.281, 0.306,
    DisconnectAction::Stop, 0, callback);
  auto test_thread = std::thread([&test_server]() { test_server->start(); });
  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  auto msgs = connect_and_collect("ws://localhost:19094/teleop");
  test_server->stop();
  test_thread.join();

  ASSERT_FALSE(msgs.empty());
  auto j = nlohmann::json::parse(msgs[0]);
  EXPECT_EQ(j["type"], "status");
  EXPECT_DOUBLE_EQ(j["robot_length"], 0.281);
  EXPECT_DOUBLE_EQ(j["robot_width"], 0.306);
}

TEST_F(TeleopServerTest, DefaultRobotDimensionsAreZero) {
  auto callback = [](double, double, double) {};
  auto test_server = std::make_unique<TeleopServer>(
    19095, 300, "diff_drive", "", "", 0.0, 0.0,
    DisconnectAction::Stop, 0, callback);
  auto test_thread = std::thread([&test_server]() { test_server->start(); });
  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  auto msgs = connect_and_collect("ws://localhost:19095/teleop");
  test_server->stop();
  test_thread.join();

  ASSERT_FALSE(msgs.empty());
  auto j = nlohmann::json::parse(msgs[0]);
  EXPECT_DOUBLE_EQ(j["robot_length"], 0.0);
  EXPECT_DOUBLE_EQ(j["robot_width"], 0.0);
}

// ---------------------------------------------------------------------------
// Disconnect behavior tests
// ---------------------------------------------------------------------------

TEST(DisconnectActionParseTest, ParseValidActions) {
  EXPECT_EQ(parse_disconnect_action("stop"), DisconnectAction::Stop);
  EXPECT_EQ(parse_disconnect_action("hold"), DisconnectAction::Hold);
  EXPECT_EQ(parse_disconnect_action("return_home"), DisconnectAction::ReturnHome);
  EXPECT_EQ(parse_disconnect_action("continue"), DisconnectAction::Continue);
}

TEST(DisconnectActionParseTest, ParseUnknownDefaultsToStop) {
  EXPECT_EQ(parse_disconnect_action("unknown"), DisconnectAction::Stop);
  EXPECT_EQ(parse_disconnect_action(""), DisconnectAction::Stop);
}

TEST(DisconnectActionStringTest, StringRoundTrip) {
  std::vector<DisconnectAction> actions = {
    DisconnectAction::Stop,
    DisconnectAction::Hold,
    DisconnectAction::ReturnHome,
    DisconnectAction::Continue
  };
  for (auto action : actions) {
    auto str = disconnect_action_to_string(action);
    EXPECT_EQ(parse_disconnect_action(str), action);
  }
}

TEST_F(TeleopServerTest, StatusMessageIncludesDisconnectAction) {
  auto msgs = connect_and_collect("ws://localhost:19091/teleop");
  ASSERT_FALSE(msgs.empty());
  auto j = nlohmann::json::parse(msgs[0]);
  EXPECT_EQ(j["type"], "status");
  EXPECT_TRUE(j.contains("disconnect_action"));
  EXPECT_EQ(j["disconnect_action"], "stop");
}

TEST_F(TeleopServerTest, StopModeTimeoutClosesImmediately) {
  // Already using Stop mode in SetUp. Verify it publishes (0,0,0) on timeout.
  // (This test already exists as WatchdogFiresZeroVelocityOnTimeout)
  SUCCEED();
}

TEST(HoldModeTest, HoldModeRepublishesLastCommand) {
  // Create server with Hold mode, timeout 200ms, hold 400ms
  int callback_count = 0;
  double last_lx = 0, last_ly = 0, last_az = 0;
  auto callback = [&](double lx, double ly, double az) {
    ++callback_count;
    last_lx = lx;
    last_ly = ly;
    last_az = az;
  };

  auto server = std::make_unique<TeleopServer>(
    19096, 200, "diff_drive", "", "", 0.0, 0.0,
    DisconnectAction::Hold, 400, callback);
  auto server_thread = std::thread([&server]() { server->start(); });
  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  // Connect and send twist, then go silent
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19096/teleop", ec);
  client.set_open_handler([&](websocketpp::connection_hdl hdl) {
    client.send(hdl, R"({"type":"twist","linear_x":0.5,"linear_y":0.0,"angular_z":0.2})",
                websocketpp::frame::opcode::text);
  });

  client.connect(con);
  std::thread t([&]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(700));
    client.stop();
  });
  client.run();
  t.join();

  server->stop();
  server_thread.join();

  // Expect: twist (0.5, 0, 0.2) published, then held for 400ms,
  // then eventually (0, 0, 0) after deadline
  EXPECT_GE(callback_count, 3);  // twist, at least 1 hold republish, final zero
  // The final zero should be the last call
  EXPECT_DOUBLE_EQ(last_lx, 0.0);
  EXPECT_DOUBLE_EQ(last_ly, 0.0);
  EXPECT_DOUBLE_EQ(last_az, 0.0);
}

TEST(ContinueModeTest, ContinueModeRepublishesLastCommand) {
  // Continue mode should behave identically to Hold mode
  int callback_count = 0;
  double last_lx = 0, last_ly = 0, last_az = 0;
  auto callback = [&](double lx, double ly, double az) {
    ++callback_count;
    last_lx = lx;
    last_ly = ly;
    last_az = az;
  };

  auto server = std::make_unique<TeleopServer>(
    19097, 200, "diff_drive", "", "", 0.0, 0.0,
    DisconnectAction::Continue, 400, callback);
  auto server_thread = std::thread([&server]() { server->start(); });
  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19097/teleop", ec);
  client.set_open_handler([&](websocketpp::connection_hdl hdl) {
    client.send(hdl, R"({"type":"twist","linear_x":0.3,"linear_y":0.1,"angular_z":-0.1})",
                websocketpp::frame::opcode::text);
  });

  client.connect(con);
  std::thread t([&]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(700));
    client.stop();
  });
  client.run();
  t.join();

  server->stop();
  server_thread.join();

  EXPECT_GE(callback_count, 3);
  EXPECT_DOUBLE_EQ(last_lx, 0.0);
  EXPECT_DOUBLE_EQ(last_ly, 0.0);
  EXPECT_DOUBLE_EQ(last_az, 0.0);
}

TEST(ReturnHomeTest, ReturnHomeModeCallsCallback) {
  // Create server with ReturnHome mode and a flag callback
  bool return_home_called = false;
  int callback_count = 0;
  double last_lx = 0, last_ly = 0, last_az = 0;

  auto callback = [&](double lx, double ly, double az) {
    ++callback_count;
    last_lx = lx;
    last_ly = ly;
    last_az = az;
  };

  auto return_home_callback = [&]() { return_home_called = true; };

  auto server = std::make_unique<TeleopServer>(
    19098, 200, "diff_drive", "", "", 0.0, 0.0,
    DisconnectAction::ReturnHome, 0, callback, return_home_callback);
  auto server_thread = std::thread([&server]() { server->start(); });
  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19098/teleop", ec);
  client.connect(con);

  std::thread t([&]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(400));
    client.stop();
  });
  client.run();
  t.join();

  server->stop();
  server_thread.join();

  EXPECT_TRUE(return_home_called);
  EXPECT_GE(callback_count, 1);
  // Final publish should be (0, 0, 0)
  EXPECT_DOUBLE_EQ(last_lx, 0.0);
  EXPECT_DOUBLE_EQ(last_ly, 0.0);
  EXPECT_DOUBLE_EQ(last_az, 0.0);
}

TEST(ReturnHomeTest, ReturnHomeWithNullCallbackFallsBackToStop) {
  // ReturnHome mode with no callback should behave like Stop
  int callback_count = 0;
  double last_lx = 0, last_ly = 0, last_az = 0;

  auto callback = [&](double lx, double ly, double az) {
    ++callback_count;
    last_lx = lx;
    last_ly = ly;
    last_az = az;
  };

  auto server = std::make_unique<TeleopServer>(
    19099, 200, "diff_drive", "", "", 0.0, 0.0,
    DisconnectAction::ReturnHome, 0, callback, nullptr);
  auto server_thread = std::thread([&server]() { server->start(); });
  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19099/teleop", ec);
  client.connect(con);

  std::thread t([&]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(400));
    client.stop();
  });
  client.run();
  t.join();

  server->stop();
  server_thread.join();

  EXPECT_GE(callback_count, 1);
  EXPECT_DOUBLE_EQ(last_lx, 0.0);
  EXPECT_DOUBLE_EQ(last_ly, 0.0);
  EXPECT_DOUBLE_EQ(last_az, 0.0);
}
