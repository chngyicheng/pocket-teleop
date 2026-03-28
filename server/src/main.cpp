#include <rclcpp/rclcpp.hpp>
#include "teleop_node.hpp"

int main(int argc, char* argv[]) {
  rclcpp::init(argc, argv);
  try {
    rclcpp::spin(std::make_shared<TeleopNode>());
  } catch (const std::exception& e) {
    RCLCPP_FATAL(rclcpp::get_logger("main"), "Fatal error: %s", e.what());
    rclcpp::shutdown();
    return 1;
  }
  rclcpp::shutdown();
  return 0;
}
