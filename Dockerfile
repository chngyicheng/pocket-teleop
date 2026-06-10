# ---- builder stage ----
FROM ros:humble AS builder

RUN apt-get update && apt-get install -y \
    libwebsocketpp-dev \
    libboost-system-dev \
    nlohmann-json3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /ros2_ws/src/pocket_teleop
COPY server/ .

WORKDIR /ros2_ws
RUN . /opt/ros/humble/setup.sh && MAKEFLAGS="-j10" colcon build --parallel-workers 5 --cmake-args -DCMAKE_BUILD_TYPE=Release

# ---- runtime stage ----
FROM ros:humble

RUN apt-get update && apt-get install -y \
    libboost-system1.74.0 \
    # Pinned to 1.74 — the Boost soname shipped with ros:humble (Ubuntu 22.04 Jammy).
    # If the base image is ever changed, verify and update this pin to avoid runtime soname mismatches.
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /ros2_ws/install /ros2_ws/install
COPY server/fastrtps_profiles.xml /fastrtps_profiles.xml

WORKDIR /ros2_ws

EXPOSE 9091

CMD ["/bin/bash", "-c", \
  ". /opt/ros/humble/setup.sh && \
   . /ros2_ws/install/setup.sh && \
   sed \"s|\\$ENV{ROS_NETWORK_INTERFACE}|${ROS_NETWORK_INTERFACE:-eth0}|g\" \
     /fastrtps_profiles.xml > /tmp/fastrtps_resolved.xml && \
   export FASTRTPS_DEFAULT_PROFILES_FILE=/tmp/fastrtps_resolved.xml && \
   ros2 run pocket_teleop teleop_node \
     --ros-args \
     -p port:=9091 \
     -p timeout_ms:=500 \
     -p cmd_vel_topic:=/cmd_vel \
     -p robot_type:=${ROBOT_TYPE:-diff_drive} \
     ${ROBOT_NAME:+-p \"robot_name:=${ROBOT_NAME}\"} \
     ${ROBOT_NAMESPACE:+-p \"robot_namespace:=${ROBOT_NAMESPACE}\"} \
     ${ODOM_TOPIC:+-p \"odom_topic:=${ODOM_TOPIC}\"} \
     ${MAP_TOPIC:+-p \"map_topic:=${MAP_TOPIC}\"} \
     ${MAP_WINDOW_M:+-p \"map_window_m:=${MAP_WINDOW_M}\"} \
     ${SCAN_TOPIC:+-p \"scan_topic:=${SCAN_TOPIC}\"} \
     ${MAP_FRAME:+-p \"map_frame:=${MAP_FRAME}\"} \
     ${ODOM_FRAME:+-p \"odom_frame:=${ODOM_FRAME}\"} \
     ${BASE_FRAME:+-p \"base_frame:=${BASE_FRAME}\"}"]
