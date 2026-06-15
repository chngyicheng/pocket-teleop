from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, EnvironmentVariable
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue


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
                'port':                   LaunchConfiguration('port'),
                'timeout_ms':             LaunchConfiguration('timeout_ms'),
                'cmd_vel_topic':          LaunchConfiguration('cmd_vel_topic'),
                'robot_type':             LaunchConfiguration('robot_type'),
                'robot_name':             EnvironmentVariable('ROBOT_NAME',              default_value=''),
                'robot_namespace':        EnvironmentVariable('ROBOT_NAMESPACE',        default_value=''),
                'robot_length_m':         ParameterValue(EnvironmentVariable('ROBOT_LENGTH_M', default_value='0.0'), value_type=float),
                'robot_width_m':          ParameterValue(EnvironmentVariable('ROBOT_WIDTH_M', default_value='0.0'), value_type=float),
                'odom_topic':             EnvironmentVariable('ODOM_TOPIC',             default_value='/odom'),
                'map_topic':              EnvironmentVariable('MAP_TOPIC',              default_value='/map'),
                'map_window_m':           ParameterValue(EnvironmentVariable('MAP_WINDOW_M', default_value='24.0'), value_type=float),
                'scan_topic':             EnvironmentVariable('SCAN_TOPIC',             default_value='/scan'),
                'battery_topic':          EnvironmentVariable('BATTERY_TOPIC',          default_value='/battery_state'),
                'map_frame':              EnvironmentVariable('MAP_FRAME',              default_value='map'),
                'odom_frame':             EnvironmentVariable('ODOM_FRAME',             default_value='odom'),
                'base_frame':             EnvironmentVariable('BASE_FRAME',             default_value='base_link'),
                'disconnect_action':      EnvironmentVariable('DISCONNECT_ACTION',      default_value='stop'),
                'disconnect_action_param': ParameterValue(EnvironmentVariable('DISCONNECT_ACTION_PARAM', default_value='0'), value_type=int),
                'return_home_service':    EnvironmentVariable('RETURN_HOME_SERVICE',    default_value='/return_home'),
            }],
            output='screen',
        ),
    ])
