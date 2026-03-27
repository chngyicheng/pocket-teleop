#include <gtest/gtest.h>
#include <thread>
#include <chrono>
#include <rclcpp/rclcpp.hpp>
#include <geometry_msgs/msg/twist.hpp>

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
