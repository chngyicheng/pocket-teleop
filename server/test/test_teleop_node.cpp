#include <gtest/gtest.h>
#include <thread>
#include <chrono>
#include <rclcpp/rclcpp.hpp>
#include <geometry_msgs/msg/twist.hpp>
#include <nav_msgs/msg/occupancy_grid.hpp>

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
