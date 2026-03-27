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
RUN . /opt/ros/humble/setup.sh && colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release

# ---- runtime stage ----
FROM ros:humble

RUN apt-get update && apt-get install -y \
    libboost-system1.74.0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /ros2_ws/install /ros2_ws/install

WORKDIR /ros2_ws

EXPOSE 9091

CMD ["/bin/bash", "-c", \
  ". /opt/ros/humble/setup.sh && \
   . /ros2_ws/install/setup.sh && \
   ros2 run pocket_teleop teleop_node \
     --ros-args \
     -p token:=${TELEOP_TOKEN} \
     -p port:=9091 \
     -p timeout_ms:=500 \
     -p cmd_vel_topic:=/cmd_vel \
     -p robot_type:=${ROBOT_TYPE:-diff_drive}"]
