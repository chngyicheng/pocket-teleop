#pragma once
#include <memory>
#include <thread>
#include <chrono>
#include <optional>
#include <mutex>
#include <rclcpp/rclcpp.hpp>
#include <rclcpp_action/rclcpp_action.hpp>
#include <geometry_msgs/msg/twist.hpp>
#include <geometry_msgs/msg/pose_stamped.hpp>
#include <nav_msgs/msg/odometry.hpp>
#include <nav_msgs/msg/occupancy_grid.hpp>
#include <nav_msgs/msg/path.hpp>
#include <nav2_msgs/action/navigate_to_pose.hpp>
#include <sensor_msgs/msg/laser_scan.hpp>
#include <sensor_msgs/msg/battery_state.hpp>
#include <std_srvs/srv/trigger.hpp>
#include <tf2_ros/buffer.h>
#include <tf2_ros/transform_listener.h>
#include "teleop_server.hpp"
#include "map_codec.hpp"

class TeleopNode : public rclcpp::Node {
public:
  explicit TeleopNode(const rclcpp::NodeOptions& options = rclcpp::NodeOptions());
  ~TeleopNode();

private:
  void publish_twist(double lx, double ly, double az);
  void publish_odom(const nav_msgs::msg::Odometry::SharedPtr& msg);
  void broadcast_pose();
  void on_scan(const sensor_msgs::msg::LaserScan::SharedPtr& msg);

  rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr publisher_;
  rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odom_sub_;
  rclcpp::Subscription<nav_msgs::msg::OccupancyGrid>::SharedPtr map_sub_;
  rclcpp::Client<std_srvs::srv::Trigger>::SharedPtr return_home_client_;
  rclcpp::TimerBase::SharedPtr map_timer_;
  std::unique_ptr<TeleopServer> server_;
  std::thread server_thread_;
  std::chrono::steady_clock::time_point last_odom_sent_{};
  static constexpr std::chrono::milliseconds ODOM_INTERVAL{100}; // 10 Hz

  // Map data and processing
  nav_msgs::msg::OccupancyGrid::SharedPtr latest_map_;
  std::optional<std::pair<double, double>> map_window_center_{};   // nullopt = use map center
  std::optional<std::pair<double, double>> last_sent_center_{};
  bool map_needs_update_ = false;
  std::chrono::steady_clock::time_point last_map_sent_{};
  static constexpr std::chrono::milliseconds MAP_INTERVAL{1000};    // timer tick
  static constexpr std::chrono::milliseconds MAP_REBROADCAST{5000}; // late-joiner fallback
  static constexpr double MAP_CENTER_MOVE_THRESHOLD_M{2.0};

  // TF2 for pose
  std::unique_ptr<tf2_ros::Buffer> tf_buffer_;
  std::unique_ptr<tf2_ros::TransformListener> tf_listener_;
  rclcpp::TimerBase::SharedPtr pose_timer_;
  static constexpr std::chrono::milliseconds POSE_INTERVAL{200};   // 5 Hz
  std::chrono::steady_clock::time_point last_pose_sent_{};

  // Scan data
  rclcpp::Subscription<sensor_msgs::msg::LaserScan>::SharedPtr scan_sub_;
  std::chrono::steady_clock::time_point last_scan_sent_{};
  static constexpr std::chrono::milliseconds SCAN_INTERVAL{200};   // 5 Hz

  // Battery data
  rclcpp::Subscription<sensor_msgs::msg::BatteryState>::SharedPtr battery_sub_;
  sensor_msgs::msg::BatteryState::SharedPtr latest_battery_;
  rclcpp::TimerBase::SharedPtr battery_timer_;
  static constexpr std::chrono::milliseconds BATTERY_INTERVAL{1000}; // 1 Hz

  // Navigation goal state machine
  using NavigateToPoseClient = rclcpp_action::Client<nav2_msgs::action::NavigateToPose>;
  NavigateToPoseClient::SharedPtr nav_action_client_;

  std::mutex nav_mutex_;
  NavigateToPoseClient::GoalHandle::SharedPtr active_goal_handle_;
  std::optional<geometry_msgs::msg::PoseStamped> stored_goal_;
  bool paused_{false};

  // Navigation path
  rclcpp::Subscription<nav_msgs::msg::Path>::SharedPtr nav_path_sub_;
  std::chrono::steady_clock::time_point last_nav_path_sent_{};
  static constexpr std::chrono::milliseconds NAV_PATH_INTERVAL{200}; // 5 Hz
  static constexpr int NAV_PATH_MAX_POINTS{64};

  // Navigation goal callback wrappers
  void nav_goal_callback(double x, double y, double heading);
  void nav_pause_callback();
  void nav_resume_callback();
  void nav_cancel_callback();
  void on_nav_path(const nav_msgs::msg::Path::SharedPtr& msg);

  // Pure function for building goal pose (gtest seam)
public:
  geometry_msgs::msg::PoseStamped build_goal_pose(double x, double y, double heading,
                                                  const std::string& frame,
                                                  rclcpp::Time stamp);

private:
  void send_stored_goal_();
  void on_nav_goal_response(
    NavigateToPoseClient::GoalHandle::SharedPtr goal_handle);
  void on_nav_goal_result(
    const NavigateToPoseClient::WrappedResult& result);
};
