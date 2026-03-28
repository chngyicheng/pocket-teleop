from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, EnvironmentVariable
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('port',          default_value='9091'),
        DeclareLaunchArgument('timeout_ms',    default_value='500'),
        DeclareLaunchArgument('cmd_vel_topic', default_value='/cmd_vel'),
        DeclareLaunchArgument('robot_type',    default_value='diff_drive'),

        Node(
            package='pocket_teleop',
            executable='teleop_node',
            name='teleop_node',
            parameters=[{
                'port':          LaunchConfiguration('port'),
                'token':         EnvironmentVariable('TELEOP_TOKEN'),
                'timeout_ms':    LaunchConfiguration('timeout_ms'),
                'cmd_vel_topic': LaunchConfiguration('cmd_vel_topic'),
                'robot_type':    LaunchConfiguration('robot_type'),
            }],
            output='screen',
        ),
    ])
