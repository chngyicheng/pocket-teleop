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
  declare_parameter("robot_length_m",  0.0);
  declare_parameter("robot_width_m",   0.0);

  const auto port            = get_parameter("port").as_int();
  const auto timeout_ms      = get_parameter("timeout_ms").as_int();
  const auto base_topic      = get_parameter("cmd_vel_topic").as_string();
  const auto robot_type      = get_parameter("robot_type").as_string();
  const auto robot_name      = get_parameter("robot_name").as_string();
  const auto robot_namespace = get_parameter("robot_namespace").as_string();
  const auto robot_length    = get_parameter("robot_length_m").as_double();
  const auto robot_width     = get_parameter("robot_width_m").as_double();

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
    robot_length,
    robot_width,
    DisconnectAction::Stop,
    0,
    [this](double lx, double ly, double az) { publish_twist(lx, ly, az); });

  declare_parameter("odom_topic", std::string("/odom"));
  const auto odom_topic = get_parameter("odom_topic").as_string();

  odom_sub_ = create_subscription<nav_msgs::msg::Odometry>(
    odom_topic, 10,
    [this](const nav_msgs::msg::Odometry::SharedPtr msg) {
      publish_odom(msg);
    });

  // TF2 setup for pose
  tf_buffer_ = std::make_unique<tf2_ros::Buffer>(get_clock());
  tf_listener_ = std::make_unique<tf2_ros::TransformListener>(*tf_buffer_);

  declare_parameter("map_frame", std::string("map"));
  declare_parameter("odom_frame", std::string("odom"));
  declare_parameter("base_frame", std::string("base_link"));

  pose_timer_ = create_wall_timer(
    POSE_INTERVAL,
    [this]() { broadcast_pose(); });

  // Scan subscription
  declare_parameter("scan_topic", std::string("/scan"));
  const auto scan_topic = get_parameter("scan_topic").as_string();

  scan_sub_ = create_subscription<sensor_msgs::msg::LaserScan>(
    scan_topic, rclcpp::SensorDataQoS(),
    [this](const sensor_msgs::msg::LaserScan::SharedPtr msg) {
      on_scan(msg);
    });

  declare_parameter("map_topic", std::string("/map"));
  declare_parameter("map_window_m", 24.0);
  const auto map_topic = get_parameter("map_topic").as_string();
  const auto map_window_m = get_parameter("map_window_m").as_double();

  // Subscribe to map with transient_local QoS (SLAM publishes once then retains)
  rclcpp::QoS map_qos = rclcpp::QoS(1).transient_local().reliable();
  map_sub_ = create_subscription<nav_msgs::msg::OccupancyGrid>(
    map_topic, map_qos,
    [this](const nav_msgs::msg::OccupancyGrid::SharedPtr msg) {
      latest_map_ = msg;
      map_needs_update_ = true;
    });

  // Map broadcast timer. Sends when a new map arrived, when the window
  // center moved past the threshold, or periodically so a client that
  // connected after the last send still receives the map.
  map_timer_ = create_wall_timer(
    MAP_INTERVAL,
    [this, map_window_m]() {
      if (!latest_map_) return;

      // Window center: tf2 pose when available (set by later task), else map center
      double center_x = latest_map_->info.origin.position.x +
                        latest_map_->info.width * latest_map_->info.resolution / 2.0;
      double center_y = latest_map_->info.origin.position.y +
                        latest_map_->info.height * latest_map_->info.resolution / 2.0;

      if (map_window_center_) {
        center_x = map_window_center_->first;
        center_y = map_window_center_->second;
      }

      const auto now = std::chrono::steady_clock::now();
      const bool center_moved = last_sent_center_ &&
        std::hypot(center_x - last_sent_center_->first,
                   center_y - last_sent_center_->second) > MAP_CENTER_MOVE_THRESHOLD_M;
      const bool rebroadcast_due = now - last_map_sent_ >= MAP_REBROADCAST;
      if (!map_needs_update_ && !center_moved && !rebroadcast_due) return;

      // Crop and encode
      auto result = map_codec::crop_window(
        latest_map_->data,
        latest_map_->info.width,
        latest_map_->info.height,
        latest_map_->info.resolution,
        latest_map_->info.origin.position.x,
        latest_map_->info.origin.position.y,
        center_x, center_y,
        map_window_m
      );

      std::string cells_rle = map_codec::encode_rle(result.cells);

      nlohmann::json map_msg = {
        {"type", "map"},
        {"resolution", result.resolution},
        {"width", result.width},
        {"height", result.height},
        {"origin_x", result.origin_x},
        {"origin_y", result.origin_y},
        {"cells", cells_rle}
      };
      // Only mark delivered when a client actually received it — otherwise
      // keep the dirty flag so the next tick retries (e.g. client still
      // connecting, or none connected yet).
      if (server_->broadcast(map_msg.dump())) {
        map_needs_update_ = false;
        last_sent_center_ = {center_x, center_y};
        last_map_sent_ = now;
      }
    });

  server_thread_ = std::thread([this]() { server_->start(); });

  RCLCPP_INFO(get_logger(), "Teleop server listening on port %ld", port);
  RCLCPP_INFO(get_logger(), "Subscribing to odom topic: %s", odom_topic.c_str());
  RCLCPP_INFO(get_logger(), "Subscribing to map topic: %s (window: %.1f m)", map_topic.c_str(), map_window_m);
  RCLCPP_INFO(get_logger(), "Subscribing to scan topic: %s", scan_topic.c_str());
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

void TeleopNode::broadcast_pose() {
  const auto map_frame = get_parameter("map_frame").as_string();
  const auto odom_frame = get_parameter("odom_frame").as_string();
  const auto base_frame = get_parameter("base_frame").as_string();

  try {
    // Try map → base_link
    auto transform = tf_buffer_->lookupTransform(map_frame, base_frame, tf2::TimePointZero);
    const auto& pos = transform.transform.translation;
    const auto& q = transform.transform.rotation;

    double yaw = std::atan2(
      2.0 * (q.w * q.z + q.x * q.y),
      1.0 - 2.0 * (q.y * q.y + q.z * q.z));

    nlohmann::json pose_msg = {
      {"type", "pose"},
      {"frame", "map"},
      {"x", pos.x},
      {"y", pos.y},
      {"heading", yaw}
    };

    server_->broadcast(pose_msg.dump());
    map_window_center_ = {pos.x, pos.y};

  } catch (const tf2::TransformException& ex) {
    try {
      // Fallback to odom → base_link
      auto transform = tf_buffer_->lookupTransform(odom_frame, base_frame, tf2::TimePointZero);
      const auto& pos = transform.transform.translation;
      const auto& q = transform.transform.rotation;

      double yaw = std::atan2(
        2.0 * (q.w * q.z + q.x * q.y),
        1.0 - 2.0 * (q.y * q.y + q.z * q.z));

      nlohmann::json pose_msg = {
        {"type", "pose"},
        {"frame", "odom"},
        {"x", pos.x},
        {"y", pos.y},
        {"heading", yaw}
      };

      server_->broadcast(pose_msg.dump());

    } catch (const tf2::TransformException& ex2) {
      RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 10000,
        "Could not get transform: %s", ex2.what());
    }
  }
}

void TeleopNode::on_scan(const sensor_msgs::msg::LaserScan::SharedPtr& msg) {
  const auto now = std::chrono::steady_clock::now();
  if (now - last_scan_sent_ < SCAN_INTERVAL) return;
  last_scan_sent_ = now;

  const auto base_frame = get_parameter("base_frame").as_string();
  double angle_min = msg->angle_min;

  // Try to get frame transform if frame_id != base_frame
  if (!msg->header.frame_id.empty() && msg->header.frame_id != base_frame) {
    try {
      auto transform = tf_buffer_->lookupTransform(base_frame, msg->header.frame_id, tf2::TimePointZero);
      const auto& q = transform.transform.rotation;
      double yaw = std::atan2(
        2.0 * (q.w * q.z + q.x * q.y),
        1.0 - 2.0 * (q.y * q.y + q.z * q.z));
      angle_min += yaw;
    } catch (const tf2::TransformException&) {
      // Use original angle_min
    }
  }

  auto decimated = map_codec::decimate_scan(
    msg->ranges,
    angle_min,
    msg->angle_increment,
    msg->range_min,
    msg->range_max,
    120
  );

  // Try to get capture pose at scan time
  std::optional<map_codec::ScanPose> scan_pose;
  const auto map_frame = get_parameter("map_frame").as_string();
  const auto odom_frame = get_parameter("odom_frame").as_string();

  try {
    // Try map → base_link first
    auto transform = tf_buffer_->lookupTransform(map_frame, base_frame, msg->header.stamp);
    const auto& pos = transform.transform.translation;
    const auto& q = transform.transform.rotation;

    double yaw = std::atan2(
      2.0 * (q.w * q.z + q.x * q.y),
      1.0 - 2.0 * (q.y * q.y + q.z * q.z));

    scan_pose = map_codec::ScanPose{pos.x, pos.y, yaw, "map"};

  } catch (const tf2::TransformException&) {
    try {
      // Fallback to odom → base_link
      auto transform = tf_buffer_->lookupTransform(odom_frame, base_frame, msg->header.stamp);
      const auto& pos = transform.transform.translation;
      const auto& q = transform.transform.rotation;

      double yaw = std::atan2(
        2.0 * (q.w * q.z + q.x * q.y),
        1.0 - 2.0 * (q.y * q.y + q.z * q.z));

      scan_pose = map_codec::ScanPose{pos.x, pos.y, yaw, "odom"};

    } catch (const tf2::TransformException&) {
      // Both lookups failed; pose remains nullopt (backward compatible)
    }
  }

  auto scan_msg = map_codec::build_scan_message(decimated, msg->range_max, scan_pose);
  server_->broadcast(scan_msg.dump());
}
