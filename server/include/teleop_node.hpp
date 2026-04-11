#pragma once
#include <memory>
#include <thread>
#include <chrono>
#include <rclcpp/rclcpp.hpp>
#include <geometry_msgs/msg/twist.hpp>
#include <nav_msgs/msg/odometry.hpp>
#include "teleop_server.hpp"

class TeleopNode : public rclcpp::Node {
public:
  explicit TeleopNode(const rclcpp::NodeOptions& options = rclcpp::NodeOptions());
  ~TeleopNode();

private:
  void publish_twist(double lx, double ly, double az);
  void publish_odom(const nav_msgs::msg::Odometry::SharedPtr& msg);

  rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr publisher_;
  rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odom_sub_;
  std::unique_ptr<TeleopServer> server_;
  std::thread server_thread_;
  std::chrono::steady_clock::time_point last_odom_sent_{};
  static constexpr std::chrono::milliseconds ODOM_INTERVAL{100}; // 10 Hz
};
