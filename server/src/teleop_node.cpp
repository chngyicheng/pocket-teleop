#include "teleop_node.hpp"
#include <nlohmann/json.hpp>
#include <cmath>

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

  std::string topic;
  if (robot_namespace.empty()) {
    topic = base_topic;
  } else {
    // Strip leading "/" from base_topic if present
    std::string base_without_slash = base_topic;
    if (!base_without_slash.empty() && base_without_slash[0] == '/') {
      base_without_slash = base_without_slash.substr(1);
    }
    topic = "/" + robot_namespace + "/" + base_without_slash;
  }

  publisher_ = create_publisher<geometry_msgs::msg::Twist>(topic, 10);

  server_ = std::make_unique<TeleopServer>(
    static_cast<int>(port),
    static_cast<int>(timeout_ms),
    robot_type,
    robot_name,
    robot_namespace,
    [this](double lx, double ly, double az) { publish_twist(lx, ly, az); });

  declare_parameter("odom_topic", std::string("/odom"));
  const auto odom_topic = get_parameter("odom_topic").as_string();

  odom_sub_ = create_subscription<nav_msgs::msg::Odometry>(
    odom_topic, 10,
    [this](const nav_msgs::msg::Odometry::SharedPtr msg) {
      publish_odom(msg);
    });

  server_thread_ = std::thread([this]() { server_->start(); });

  RCLCPP_INFO(get_logger(), "Teleop server listening on port %ld", port);
  RCLCPP_INFO(get_logger(), "Subscribing to odom topic: %s", odom_topic.c_str());
  RCLCPP_INFO(get_logger(), "Publishing to topic: %s", topic.c_str());
}

TeleopNode::~TeleopNode() {
  server_->stop();
  if (server_thread_.joinable()) server_thread_.join();
}

void TeleopNode::publish_odom(const nav_msgs::msg::Odometry::SharedPtr& msg) {
  const auto now = std::chrono::steady_clock::now();
  if (now - last_odom_sent_ < ODOM_INTERVAL) return;
  last_odom_sent_ = now;

  const auto& pos = msg->pose.pose.position;
  const auto& q   = msg->pose.pose.orientation;
  // Quaternion → yaw (rotation around Z axis)
  const double yaw = std::atan2(
    2.0 * (q.w * q.z + q.x * q.y),
    1.0 - 2.0 * (q.y * q.y + q.z * q.z));

  nlohmann::json odom = {
    {"type",    "odom"},
    {"x",       pos.x},
    {"y",       pos.y},
    {"heading", yaw},
  };
  server_->broadcast(odom.dump());
}

void TeleopNode::publish_twist(double lx, double ly, double az) {
  geometry_msgs::msg::Twist msg;
  msg.linear.x  = lx;
  msg.linear.y  = ly;
  msg.angular.z = az;
  publisher_->publish(msg);
}
