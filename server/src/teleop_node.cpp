#include "teleop_node.hpp"

TeleopNode::TeleopNode(const rclcpp::NodeOptions& options)
  : Node("teleop_node", options) {

  declare_parameter("port",            9091);
  declare_parameter("timeout_ms",      500);
  declare_parameter("cmd_vel_topic",   std::string("/cmd_vel"));
  declare_parameter("robot_type",      std::string("diff_drive"));
  declare_parameter("robot_name",      std::string(""));
  declare_parameter("robot_namespace", std::string(""));

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
