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
