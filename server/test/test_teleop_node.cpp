#include <gtest/gtest.h>
#include <thread>
#include <chrono>
#include <rclcpp/rclcpp.hpp>
#include <geometry_msgs/msg/twist.hpp>
#include <nav_msgs/msg/occupancy_grid.hpp>
#include <sensor_msgs/msg/laser_scan.hpp>
#include <sensor_msgs/msg/battery_state.hpp>
#include <std_srvs/srv/trigger.hpp>
#include <tf2_ros/static_transform_broadcaster.h>

#include <websocketpp/config/asio_no_tls_client.hpp>
#include <websocketpp/client.hpp>
#include <nlohmann/json.hpp>

#include "teleop_node.hpp"

using WsClient = websocketpp::client<websocketpp::config::asio>;

class TeleopNodeTest : public ::testing::Test {
protected:
  void SetUp() override {
    rclcpp::init(0, nullptr);
    rclcpp::NodeOptions opts;
    opts.append_parameter_override("port", 19092);
    opts.append_parameter_override("timeout_ms", 500);
    opts.append_parameter_override("map_topic", "/test_map");
    opts.append_parameter_override("map_window_m", 4.0);
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
  auto con = client.get_connection("ws://localhost:19092/teleop", ec);
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
  auto con = client.get_connection("ws://localhost:19092/teleop", ec);
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

TEST_F(TeleopNodeTest, MapBroadcastReachesWsClient) {
  // Publish a 10x10 grid: bottom half free, top half occupied. The 4 m
  // window at 0.25 m/cell (16 cells) exceeds the grid, so the broadcast
  // carries the full grid: cells == "f50o50".
  auto map_publisher = node_->create_publisher<nav_msgs::msg::OccupancyGrid>(
    "/test_map",
    rclcpp::QoS(1).transient_local().reliable());

  nav_msgs::msg::OccupancyGrid test_map;
  test_map.header.frame_id = "map";
  test_map.info.resolution = 0.25;  // exact in binary — survives float->double->JSON
  test_map.info.width = 10;
  test_map.info.height = 10;
  test_map.info.origin.position.x = 1.0;
  test_map.info.origin.position.y = 2.0;
  test_map.data.assign(50, 0);
  test_map.data.insert(test_map.data.end(), 50, 100);
  map_publisher->publish(test_map);

  std::vector<std::string> texts;
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  client.set_message_handler([&](websocketpp::connection_hdl, WsClient::message_ptr msg) {
    texts.push_back(msg->get_payload());
  });
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19092/teleop", ec);
  client.connect(con);
  std::thread t([&]() {
    // The server watchdog (timeout_ms=500) closes silent connections, so
    // ping like a real client's keepalive while spanning two 1 Hz map ticks.
    for (int i = 0; i < 11; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(200));
      websocketpp::lib::error_code pec;
      client.send(con->get_handle(), R"({"type":"ping"})",
                  websocketpp::frame::opcode::text, pec);
    }
    client.stop();
  });
  client.run();
  t.join();

  bool found = false;
  for (const auto& text : texts) {
    auto j = nlohmann::json::parse(text, nullptr, false);
    if (j.is_discarded() || j.value("type", "") != "map") continue;
    found = true;
    EXPECT_EQ(j["width"].get<int>(),  10);
    EXPECT_EQ(j["height"].get<int>(), 10);
    EXPECT_DOUBLE_EQ(j["resolution"].get<double>(), 0.25);
    EXPECT_DOUBLE_EQ(j["origin_x"].get<double>(), 1.0);
    EXPECT_DOUBLE_EQ(j["origin_y"].get<double>(), 2.0);
    EXPECT_EQ(j["cells"].get<std::string>(), "f50o50");
  }
  EXPECT_TRUE(found) << "no map message received over WebSocket";
}

TEST_F(TeleopNodeTest, PoseBroadcastReachesWsClient) {
  // Publish static transform: map -> base_link at (1.5, -0.5, heading=0)
  auto broadcaster = std::make_shared<tf2_ros::StaticTransformBroadcaster>(node_);
  geometry_msgs::msg::TransformStamped transform;
  transform.header.frame_id = "map";
  transform.child_frame_id = "base_link";
  transform.transform.translation.x = 1.5;
  transform.transform.translation.y = -0.5;
  transform.transform.translation.z = 0.0;
  // Identity rotation (w=1, x=y=z=0)
  transform.transform.rotation.w = 1.0;
  transform.transform.rotation.x = 0.0;
  transform.transform.rotation.y = 0.0;
  transform.transform.rotation.z = 0.0;
  broadcaster->sendTransform(transform);

  std::vector<std::string> texts;
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  client.set_message_handler([&](websocketpp::connection_hdl, WsClient::message_ptr msg) {
    texts.push_back(msg->get_payload());
  });
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19092/teleop", ec);
  client.connect(con);
  std::thread t([&]() {
    // Ping like a real client for ~2 seconds to span multiple pose broadcasts
    for (int i = 0; i < 11; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(200));
      websocketpp::lib::error_code pec;
      client.send(con->get_handle(), R"({"type":"ping"})",
                  websocketpp::frame::opcode::text, pec);
    }
    client.stop();
  });
  client.run();
  t.join();

  bool found = false;
  for (const auto& text : texts) {
    auto j = nlohmann::json::parse(text, nullptr, false);
    if (j.is_discarded() || j.value("type", "") != "pose") continue;
    found = true;
    EXPECT_EQ(j["frame"].get<std::string>(), "map");
    EXPECT_DOUBLE_EQ(j["x"].get<double>(), 1.5);
    EXPECT_DOUBLE_EQ(j["y"].get<double>(), -0.5);
    EXPECT_DOUBLE_EQ(j["heading"].get<double>(), 0.0);
  }
  EXPECT_TRUE(found) << "no pose message received over WebSocket";
}

TEST_F(TeleopNodeTest, ScanBroadcastReachesWsClient) {
  // Note: use the default node_ which subscribes to /scan. This test just
  // validates that scan messages are correctly decimated and broadcast.
  // Publish multiple scans to ensure one makes it through the 200ms throttle.

  // Publish a laser scan
  auto scan_publisher = node_->create_publisher<sensor_msgs::msg::LaserScan>(
    "/scan", rclcpp::SensorDataQoS());

  std::vector<std::string> texts;
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  client.set_message_handler([&](websocketpp::connection_hdl, WsClient::message_ptr msg) {
    texts.push_back(msg->get_payload());
  });
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19092/teleop", ec);
  client.connect(con);

  std::thread t([&]() {
    // Publish multiple scans spanning 2+ seconds
    for (int i = 0; i < 11; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(200));

      sensor_msgs::msg::LaserScan test_scan;
      test_scan.header.frame_id = "base_link";
      test_scan.angle_min = 0.0;
      test_scan.angle_max = 6.28;  // 2*pi
      test_scan.angle_increment = 0.0175;  // ~360 ranges
      test_scan.time_increment = 0.0;
      test_scan.scan_time = 0.0;
      test_scan.range_min = 0.1;
      test_scan.range_max = 10.0;

      // Create 360 ranges with a fixed value
      test_scan.ranges.assign(360, 2.0f);
      // Insert some NaN and out-of-range values
      test_scan.ranges[0] = std::numeric_limits<float>::quiet_NaN();
      test_scan.ranges[180] = 15.0f;  // > range_max

      scan_publisher->publish(test_scan);

      // Also send ping to keep connection alive
      websocketpp::lib::error_code pec;
      client.send(con->get_handle(), R"({"type":"ping"})",
                  websocketpp::frame::opcode::text, pec);
    }
    client.stop();
  });
  client.run();
  t.join();

  bool found = false;
  for (const auto& text : texts) {
    auto j = nlohmann::json::parse(text, nullptr, false);
    if (j.is_discarded() || j.value("type", "") != "scan") continue;
    found = true;
    EXPECT_DOUBLE_EQ(j["angle_min"].get<double>(), 0.0);
    EXPECT_DOUBLE_EQ(j["range_max"].get<double>(), 10.0);

    auto ranges = j["ranges"].get<std::vector<double>>();
    EXPECT_LE(ranges.size(), 120);  // decimated to <= 120
    // First should be 0 (was NaN)
    EXPECT_DOUBLE_EQ(ranges[0], 0.0);
  }
  EXPECT_TRUE(found) << "no scan message received over WebSocket";
}

TEST_F(TeleopNodeTest, DisconnectActionParameterization) {
  // Test that disconnect_action parameter is correctly parsed and wired.
  // This verifies the node correctly sets up the disconnect behavior.
  rclcpp::NodeOptions opts;
  opts.append_parameter_override("port", 19093);
  opts.append_parameter_override("timeout_ms", 200);
  opts.append_parameter_override("disconnect_action", "hold");
  opts.append_parameter_override("disconnect_action_param", 300);
  opts.append_parameter_override("map_topic", "/test_map");
  opts.append_parameter_override("map_window_m", 4.0);

  auto test_node = std::make_shared<TeleopNode>(opts);

  // Verify node was created successfully with disconnect parameters
  ASSERT_TRUE(test_node != nullptr);

  std::thread spin_thread([&test_node]() {
    rclcpp::spin(test_node);
  });

  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  // Test that the status message includes disconnect_action
  std::vector<std::string> messages;
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  client.set_message_handler([&](websocketpp::connection_hdl, WsClient::message_ptr msg) {
    messages.push_back(msg->get_payload());
  });

  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19093/teleop", ec);
  client.connect(con);

  std::thread t([&]() {
    // Keep connection alive briefly
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    client.stop();
  });

  client.run();
  t.join();

  rclcpp::shutdown();
  if (spin_thread.joinable()) spin_thread.join();

  // Check that status message was received with disconnect_action field
  bool found_status = false;
  for (const auto& text : messages) {
    auto j = nlohmann::json::parse(text, nullptr, false);
    if (!j.is_discarded() && j.value("type", "") == "status") {
      found_status = true;
      EXPECT_EQ(j["disconnect_action"].get<std::string>(), "hold");
      break;
    }
  }

  EXPECT_TRUE(found_status) << "No status message with disconnect_action received";
}

TEST_F(TeleopNodeTest, ReturnHomeAutoTriggerDisabled) {
  // Auto-trigger is intentionally disabled for now: return_home mode must NOT
  // call the Trigger service on disconnect; it falls through to stop instead.
  rclcpp::NodeOptions opts;
  opts.append_parameter_override("port", 19094);
  opts.append_parameter_override("timeout_ms", 200);
  opts.append_parameter_override("disconnect_action", "return_home");
  opts.append_parameter_override("return_home_service", "/test_return_home");
  opts.append_parameter_override("map_topic", "/test_map");
  opts.append_parameter_override("map_window_m", 4.0);

  auto test_node = std::make_shared<TeleopNode>(opts);

  std::vector<geometry_msgs::msg::Twist> msgs;
  auto sub = test_node->create_subscription<geometry_msgs::msg::Twist>(
    "/cmd_vel", 10,
    [&msgs](geometry_msgs::msg::Twist::SharedPtr msg) {
      msgs.push_back(*msg);
    });

  // Create a service server to receive return_home calls
  bool service_called = false;
  auto service = test_node->create_service<std_srvs::srv::Trigger>(
    "/test_return_home",
    [&service_called](const std::shared_ptr<std_srvs::srv::Trigger::Request>&,
                      std::shared_ptr<std_srvs::srv::Trigger::Response> response) {
      service_called = true;
      response->success = true;
      response->message = "home";
    });

  std::thread spin_thread([&test_node]() {
    rclcpp::spin(test_node);
  });

  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  // Connect and let it timeout
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19094/teleop", ec);
  client.connect(con);

  std::thread t([&]() {
    // Connect silently for longer than timeout
    std::this_thread::sleep_for(std::chrono::milliseconds(400));
    client.stop();
  });

  client.run();
  t.join();

  std::this_thread::sleep_for(std::chrono::milliseconds(200));
  rclcpp::shutdown();
  if (spin_thread.joinable()) spin_thread.join();

  // Auto-trigger disabled: the service must NOT have been called.
  EXPECT_FALSE(service_called) << "return_home auto-trigger should be disabled";

  // Still stops: should eventually see zero velocity
  ASSERT_FALSE(msgs.empty());
  EXPECT_DOUBLE_EQ(msgs.back().linear.x, 0.0);
  EXPECT_DOUBLE_EQ(msgs.back().linear.y, 0.0);
  EXPECT_DOUBLE_EQ(msgs.back().angular.z, 0.0);
}

TEST_F(TeleopNodeTest, BatteryBroadcastReachesWsClient) {
  // Publish a BatteryState message and verify it reaches the WS client.
  // Use the default node_ which subscribes to /battery_state.
  auto battery_publisher = node_->create_publisher<sensor_msgs::msg::BatteryState>(
    "/battery_state", 10);

  std::vector<std::string> texts;
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  client.set_message_handler([&](websocketpp::connection_hdl, WsClient::message_ptr msg) {
    texts.push_back(msg->get_payload());
  });
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19092/teleop", ec);
  client.connect(con);

  std::thread t([&]() {
    // Publish a battery state message
    sensor_msgs::msg::BatteryState test_battery;
    test_battery.header.stamp = node_->now();
    test_battery.percentage = 0.84;  // 84%
    test_battery.voltage = 12.6;
    test_battery.current = -1.5;  // negative = discharging
    test_battery.power_supply_status = sensor_msgs::msg::BatteryState::POWER_SUPPLY_STATUS_DISCHARGING;
    battery_publisher->publish(test_battery);

    // Ping like a real client for ~2 seconds to span multiple 1 Hz battery broadcasts
    for (int i = 0; i < 11; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(200));
      websocketpp::lib::error_code pec;
      client.send(con->get_handle(), R"({"type":"ping"})",
                  websocketpp::frame::opcode::text, pec);
    }
    client.stop();
  });
  client.run();
  t.join();

  bool found = false;
  for (const auto& text : texts) {
    auto j = nlohmann::json::parse(text, nullptr, false);
    if (j.is_discarded() || j.value("type", "") != "battery") continue;
    found = true;
    EXPECT_NEAR(j["percentage"].get<double>(), 84.0, 0.01);
    EXPECT_NEAR(j["voltage"].get<double>(), 12.6, 0.01);
    EXPECT_NEAR(j["current"].get<double>(), -1.5, 0.01);
    EXPECT_FALSE(j["charging"].get<bool>());
  }
  EXPECT_TRUE(found) << "no battery message received over WebSocket";
}

TEST_F(TeleopNodeTest, BatteryChargingFlag) {
  // Verify that the charging flag is correctly set based on power_supply_status.
  auto battery_publisher = node_->create_publisher<sensor_msgs::msg::BatteryState>(
    "/battery_state", 10);

  std::vector<std::string> texts;
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  client.set_message_handler([&](websocketpp::connection_hdl, WsClient::message_ptr msg) {
    texts.push_back(msg->get_payload());
  });
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19092/teleop", ec);
  client.connect(con);

  std::thread t([&]() {
    // Publish a battery state with CHARGING status
    sensor_msgs::msg::BatteryState test_battery;
    test_battery.header.stamp = node_->now();
    test_battery.percentage = 0.50;
    test_battery.voltage = 12.0;
    test_battery.current = 2.0;  // positive = charging
    test_battery.power_supply_status = sensor_msgs::msg::BatteryState::POWER_SUPPLY_STATUS_CHARGING;
    battery_publisher->publish(test_battery);

    // Ping like a real client for ~2 seconds to span multiple 1 Hz battery broadcasts
    for (int i = 0; i < 11; ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(200));
      websocketpp::lib::error_code pec;
      client.send(con->get_handle(), R"({"type":"ping"})",
                  websocketpp::frame::opcode::text, pec);
    }
    client.stop();
  });
  client.run();
  t.join();

  bool found = false;
  for (const auto& text : texts) {
    auto j = nlohmann::json::parse(text, nullptr, false);
    if (j.is_discarded() || j.value("type", "") != "battery") continue;
    found = true;
    EXPECT_TRUE(j["charging"].get<bool>());
    EXPECT_NEAR(j["percentage"].get<double>(), 50.0, 0.01);
  }
  EXPECT_TRUE(found) << "no battery message with charging=true received over WebSocket";
}

TEST_F(TeleopNodeTest, BuildGoalPoseSetsPositionFrameAndQuaternion) {
  // heading = pi/2 -> z = sin(pi/4) ~ 0.7071, w = cos(pi/4) ~ 0.7071
  const double heading = M_PI / 2.0;
  rclcpp::Time stamp(123, 456, RCL_ROS_TIME);
  auto pose = node_->build_goal_pose(1.5, -2.0, heading, "map", stamp);

  EXPECT_EQ(pose.header.frame_id, "map");
  EXPECT_EQ(pose.header.stamp.sec, 123);
  EXPECT_EQ(pose.header.stamp.nanosec, 456u);

  EXPECT_DOUBLE_EQ(pose.pose.position.x, 1.5);
  EXPECT_DOUBLE_EQ(pose.pose.position.y, -2.0);
  EXPECT_DOUBLE_EQ(pose.pose.position.z, 0.0);

  EXPECT_DOUBLE_EQ(pose.pose.orientation.x, 0.0);
  EXPECT_DOUBLE_EQ(pose.pose.orientation.y, 0.0);
  EXPECT_NEAR(pose.pose.orientation.z, 0.70710678, 1e-6);
  EXPECT_NEAR(pose.pose.orientation.w, 0.70710678, 1e-6);
}

TEST_F(TeleopNodeTest, BuildGoalPoseZeroHeadingIsIdentityQuaternion) {
  rclcpp::Time stamp(0, 0, RCL_ROS_TIME);
  auto pose = node_->build_goal_pose(0.0, 0.0, 0.0, "odom", stamp);

  EXPECT_EQ(pose.header.frame_id, "odom");
  EXPECT_DOUBLE_EQ(pose.pose.orientation.z, 0.0);
  EXPECT_DOUBLE_EQ(pose.pose.orientation.w, 1.0);
}

TEST_F(TeleopNodeTest, NavGoalRejectedBroadcastsFailedState) {
  // When no action server exists and nav_goal is sent, the server should:
  // 1. Attempt to send the goal (but it gets rejected)
  // 2. on_nav_goal_response receives null goal_handle
  // 3. Broadcast {"type":"nav_state","state":"failed"}

  std::vector<std::string> texts;
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();
  client.set_message_handler([&](websocketpp::connection_hdl, WsClient::message_ptr msg) {
    texts.push_back(msg->get_payload());
  });
  websocketpp::lib::error_code ec;
  auto con = client.get_connection("ws://localhost:19092/teleop", ec);
  client.connect(con);

  std::thread t([&]() {
    // Send a nav_goal; no action server means it will be rejected
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    websocketpp::lib::error_code pec;
    client.send(con->get_handle(),
      R"({"type":"nav_goal","x":1.0,"y":2.0,"heading":0.5})",
      websocketpp::frame::opcode::text, pec);

    // Wait a bit for the response/rejection to process
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    client.stop();
  });
  client.run();
  t.join();

  // Look for the failed nav_state
  bool found_failed = false;
  for (const auto& text : texts) {
    auto j = nlohmann::json::parse(text, nullptr, false);
    if (j.is_discarded() || j.value("type", "") != "nav_state") continue;
    auto state = j.value("state", "");
    if (state == "failed") {
      found_failed = true;
      break;
    }
  }
  EXPECT_TRUE(found_failed) << "expected nav_state with state='failed' when action server unavailable";
}

