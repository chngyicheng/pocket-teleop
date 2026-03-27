cmake_minimum_required(VERSION 3.8)
project(pocket_teleop)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(nlohmann_json 3.2.0 REQUIRED)
find_package(Boost REQUIRED COMPONENTS system)
find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/server.hpp REQUIRED)

# Main executable
add_executable(teleop_node
  src/main.cpp
  src/teleop_node.cpp
  src/teleop_server.cpp
  src/command_handler.cpp
)

target_include_directories(teleop_node PRIVATE
  include/
  ${WEBSOCKETPP_INCLUDE_DIR}
)

target_link_libraries(teleop_node
  nlohmann_json::nlohmann_json
  Boost::system
)

ament_target_dependencies(teleop_node rclcpp geometry_msgs)

install(TARGETS teleop_node DESTINATION lib/${PROJECT_NAME})
install(DIRECTORY launch/ DESTINATION share/${PROJECT_NAME}/launch)

# Tests
if(BUILD_TESTING)
  find_package(ament_cmake_gtest REQUIRED)

  # test_command_handler — no ROS2, no WebSocket
  ament_add_gtest(test_command_handler
    test/test_command_handler.cpp
    src/command_handler.cpp
  )
  target_include_directories(test_command_handler PRIVATE include/)
  target_link_libraries(test_command_handler nlohmann_json::nlohmann_json)

  # test_teleop_server — WebSocket + mock callback, no ROS2
  ament_add_gtest(test_teleop_server
    test/test_teleop_server.cpp
    src/teleop_server.cpp
    src/command_handler.cpp
  )
  target_include_directories(test_teleop_server PRIVATE
    include/
    ${WEBSOCKETPP_INCLUDE_DIR}
  )
  target_link_libraries(test_teleop_server
    nlohmann_json::nlohmann_json
    Boost::system
  )

  # test_teleop_node — full ROS2 integration
  ament_add_gtest(test_teleop_node
    test/test_teleop_node.cpp
    src/teleop_node.cpp
    src/teleop_server.cpp
    src/command_handler.cpp
  )
  target_include_directories(test_teleop_node PRIVATE
    include/
    ${WEBSOCKETPP_INCLUDE_DIR}
  )
  target_link_libraries(test_teleop_node
    nlohmann_json::nlohmann_json
    Boost::system
  )
  ament_target_dependencies(test_teleop_node rclcpp geometry_msgs)
endif()

ament_package()
