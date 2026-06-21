#include "teleop_node.hpp"
#include <nlohmann/json.hpp>
#include <cmath>

TeleopNode::TeleopNode(const rclcpp::NodeOptions& options)
  : Node("teleop_node", options) {

  declare_parameter("port",                   9091);
  declare_parameter("timeout_ms",             500);
  declare_parameter("cmd_vel_topic",          std::string("/cmd_vel"));
  declare_parameter("robot_type",             std::string("diff_drive"));
  declare_parameter("robot_name",             std::string(""));
  declare_parameter("robot_namespace",        std::string(""));
  declare_parameter("robot_length_m",         0.0);
  declare_parameter("robot_width_m",          0.0);
  declare_parameter("disconnect_action",      std::string("stop"));
  declare_parameter("disconnect_action_param", 0);
  declare_parameter("return_home_service",    std::string("/return_home"));

  const auto port                   = get_parameter("port").as_int();
  const auto timeout_ms             = get_parameter("timeout_ms").as_int();
  const auto base_topic             = get_parameter("cmd_vel_topic").as_string();
  const auto robot_type             = get_parameter("robot_type").as_string();
  const auto robot_name             = get_parameter("robot_name").as_string();
  const auto robot_namespace        = get_parameter("robot_namespace").as_string();
  const auto robot_length           = get_parameter("robot_length_m").as_double();
  const auto robot_width            = get_parameter("robot_width_m").as_double();
  const auto disconnect_action_str  = get_parameter("disconnect_action").as_string();
  const auto disconnect_action_param = get_parameter("disconnect_action_param").as_int();
  const auto return_home_service_name = get_parameter("return_home_service").as_string();
  const auto disconnect_action = parse_disconnect_action(disconnect_action_str);

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

  // Create return_home service client
  return_home_client_ = create_client<std_srvs::srv::Trigger>(return_home_service_name);

  // Declare nav parameters
  declare_parameter("nav_action", std::string("/navigate_to_pose"));
  declare_parameter("goal_frame", std::string("map"));
  declare_parameter("nav_path_topic", std::string("/plan"));

  server_ = std::make_unique<TeleopServer>(
    static_cast<int>(port),
    static_cast<int>(timeout_ms),
    robot_type,
    robot_name,
    robot_namespace,
    robot_length,
    robot_width,
    disconnect_action,
    disconnect_action_param,
    [this](double lx, double ly, double az) { publish_twist(lx, ly, az); },
    [this]() {
      // return_home auto-trigger is intentionally DISABLED for now: on a
      // disconnect we only log and let the server fall through to stop
      // (zero cmd_vel + close). The Trigger client is still created so
      // re-enabling is a one-line change — restore the async_send_request
      // call here (see git history / AGENTS.md "Disconnect-after behavior").
      RCLCPP_WARN(get_logger(),
        "disconnect=return_home: auto-trigger disabled; stopping instead");
    },
    [this](double x, double y, double h) { nav_goal_callback(x, y, h); },
    [this]() { nav_pause_callback(); },
    [this]() { nav_resume_callback(); },
    [this]() { nav_cancel_callback(); });

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

  // Battery subscription
  declare_parameter("battery_topic", std::string("/battery_state"));
  const auto battery_topic = get_parameter("battery_topic").as_string();

  battery_sub_ = create_subscription<sensor_msgs::msg::BatteryState>(
    battery_topic, 10,
    [this](const sensor_msgs::msg::BatteryState::SharedPtr msg) {
      latest_battery_ = msg;
    });

  // Battery broadcast timer (1 Hz)
  battery_timer_ = create_wall_timer(
    BATTERY_INTERVAL,
    [this]() {
      if (!latest_battery_) return;

      nlohmann::json battery = {
        {"type", "battery"},
        {"percentage", latest_battery_->percentage * 100.0},
        {"voltage", latest_battery_->voltage},
        {"current", latest_battery_->current},
        {"charging", latest_battery_->power_supply_status ==
                     sensor_msgs::msg::BatteryState::POWER_SUPPLY_STATUS_CHARGING}
      };
      server_->broadcast(battery.dump());
    });

  // Navigation action client
  const auto nav_action = get_parameter("nav_action").as_string();
  const auto goal_frame = get_parameter("goal_frame").as_string();
  nav_action_client_ = rclcpp_action::create_client<nav2_msgs::action::NavigateToPose>(
    this, nav_action);

  // Navigation path subscription
  const auto nav_path_topic = get_parameter("nav_path_topic").as_string();
  nav_path_sub_ = create_subscription<nav_msgs::msg::Path>(
    nav_path_topic, 10,
    [this](const nav_msgs::msg::Path::SharedPtr msg) {
      on_nav_path(msg);
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
  RCLCPP_INFO(get_logger(), "Subscribing to battery topic: %s", battery_topic.c_str());
  RCLCPP_INFO(get_logger(), "Publishing to topic: %s", topic.c_str());
  RCLCPP_INFO(get_logger(), "Navigation action: %s, frame: %s", nav_action.c_str(), goal_frame.c_str());
  RCLCPP_INFO(get_logger(), "Subscribing to nav path topic: %s", nav_path_topic.c_str());
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

geometry_msgs::msg::PoseStamped TeleopNode::build_goal_pose(
    double x, double y, double heading,
    const std::string& frame,
    rclcpp::Time stamp) {
  geometry_msgs::msg::PoseStamped pose;
  pose.header.frame_id = frame;
  pose.header.stamp = stamp;
  pose.pose.position.x = x;
  pose.pose.position.y = y;
  pose.pose.position.z = 0.0;

  // Heading (yaw) → quaternion: z = sin(heading/2), w = cos(heading/2), x = y = 0
  const double h_half = heading / 2.0;
  pose.pose.orientation.x = 0.0;
  pose.pose.orientation.y = 0.0;
  pose.pose.orientation.z = std::sin(h_half);
  pose.pose.orientation.w = std::cos(h_half);

  return pose;
}

void TeleopNode::nav_goal_callback(double x, double y, double heading) {
  const auto goal_frame = get_parameter("goal_frame").as_string();
  const auto now = this->get_clock()->now();

  {
    std::lock_guard<std::mutex> lock(nav_mutex_);
    stored_goal_ = build_goal_pose(x, y, heading, goal_frame, now);
    paused_ = false;
  }

  send_stored_goal_();

  nlohmann::json nav_state = {
    {"type", "nav_state"},
    {"state", "active"}
  };
  server_->broadcast(nav_state.dump());
}

void TeleopNode::nav_pause_callback() {
  NavigateToPoseClient::GoalHandle::SharedPtr goal;
  {
    std::lock_guard<std::mutex> lock(nav_mutex_);
    if (!active_goal_handle_) return;
    goal = active_goal_handle_;   // keep stored_goal_ for resume
    paused_ = true;
    active_goal_handle_ = nullptr;
  }

  // async_cancel_goal outside lock to avoid deadlock
  if (goal && nav_action_client_ && nav_action_client_->action_server_is_ready()) {
    nav_action_client_->async_cancel_goal(goal);
  }

  nlohmann::json nav_state = {
    {"type", "nav_state"},
    {"state", "paused"}
  };
  server_->broadcast(nav_state.dump());
}

void TeleopNode::nav_resume_callback() {
  {
    std::lock_guard<std::mutex> lock(nav_mutex_);
    if (!paused_ || !stored_goal_) return;
    paused_ = false;
  }

  send_stored_goal_();

  nlohmann::json nav_state = {
    {"type", "nav_state"},
    {"state", "active"}
  };
  server_->broadcast(nav_state.dump());
}

void TeleopNode::nav_cancel_callback() {
  {
    std::lock_guard<std::mutex> lock(nav_mutex_);
    if (active_goal_handle_) {
      if (nav_action_client_ && nav_action_client_->action_server_is_ready()) {
        nav_action_client_->async_cancel_goal(active_goal_handle_);
      }
      active_goal_handle_ = nullptr;
    }
    stored_goal_ = std::nullopt;
    paused_ = false;
  }

  nlohmann::json nav_state = {
    {"type", "nav_state"},
    {"state", "idle"}
  };
  server_->broadcast(nav_state.dump());
}

void TeleopNode::send_stored_goal_() {
  std::lock_guard<std::mutex> lock(nav_mutex_);

  if (!stored_goal_ || !nav_action_client_) return;
  if (!nav_action_client_->action_server_is_ready()) {
    RCLCPP_WARN(get_logger(), "NavigateToPose action server not ready; discarding goal");
    return;
  }

  auto goal_msg = nav2_msgs::action::NavigateToPose::Goal();
  goal_msg.pose = *stored_goal_;

  auto goal_options = rclcpp_action::Client<nav2_msgs::action::NavigateToPose>::SendGoalOptions();
  goal_options.goal_response_callback =
    [this](NavigateToPoseClient::GoalHandle::SharedPtr goal_handle) {
      on_nav_goal_response(goal_handle);
    };
  goal_options.result_callback =
    [this](const NavigateToPoseClient::WrappedResult& result) {
      on_nav_goal_result(result);
    };

  nav_action_client_->async_send_goal(goal_msg, goal_options);
}

void TeleopNode::on_nav_goal_response(
    NavigateToPoseClient::GoalHandle::SharedPtr goal_handle) {
  if (!goal_handle) {
    RCLCPP_WARN(get_logger(), "NavigateToPose goal rejected");
    return;
  }

  std::lock_guard<std::mutex> lock(nav_mutex_);
  active_goal_handle_ = goal_handle;
}

void TeleopNode::on_nav_goal_result(
    const NavigateToPoseClient::WrappedResult& result) {
  {
    std::lock_guard<std::mutex> lock(nav_mutex_);
    if (result.code == rclcpp_action::ResultCode::SUCCEEDED) {
      RCLCPP_INFO(get_logger(), "NavigateToPose goal succeeded");
      active_goal_handle_ = nullptr;
      stored_goal_ = std::nullopt;
      paused_ = false;
    } else if (result.code == rclcpp_action::ResultCode::ABORTED) {
      RCLCPP_WARN(get_logger(), "NavigateToPose goal aborted");
      active_goal_handle_ = nullptr;
      stored_goal_ = std::nullopt;
      paused_ = false;
    } else if (result.code == rclcpp_action::ResultCode::CANCELED) {
      // Do not update state — let pause/cancel callback handle it
      return;
    }
  }

  nlohmann::json nav_state = {
    {"type", "nav_state"},
    {"state", "idle"}
  };
  server_->broadcast(nav_state.dump());
}

void TeleopNode::on_nav_path(const nav_msgs::msg::Path::SharedPtr& msg) {
  const auto now = std::chrono::steady_clock::now();
  if (now - last_nav_path_sent_ < NAV_PATH_INTERVAL) return;

  // Decimate path
  std::vector<std::pair<double, double>> points;
  for (const auto& pose_stamped : msg->poses) {
    points.push_back({pose_stamped.pose.position.x, pose_stamped.pose.position.y});
  }

  // Simple decimation: keep first, last, and evenly space in between
  std::vector<std::pair<double, double>> decimated;
  if (points.empty()) {
    // Empty path → broadcast empty points to clear line
  } else if (points.size() <= NAV_PATH_MAX_POINTS) {
    decimated = points;
  } else {
    decimated.push_back(points.front());
    const int step = static_cast<int>(points.size()) / (NAV_PATH_MAX_POINTS - 1);
    for (int i = step; i < static_cast<int>(points.size()) - 1; i += step) {
      decimated.push_back(points[i]);
    }
    decimated.push_back(points.back());
  }

  nlohmann::json nav_path = {
    {"type", "nav_path"},
    {"points", nlohmann::json::array()}
  };
  for (const auto& [x, y] : decimated) {
    nav_path["points"].push_back(nlohmann::json::array({x, y}));
  }

  server_->broadcast(nav_path.dump());
  last_nav_path_sent_ = now;
}
