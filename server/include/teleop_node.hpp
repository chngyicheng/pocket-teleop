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
