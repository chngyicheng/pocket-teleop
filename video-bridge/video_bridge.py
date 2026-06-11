#!/usr/bin/env python3
"""
video_bridge — ROS2 → GStreamer → RTMP → MediaMTX

Environment variables
---------------------
VIDEO_TOPIC       Full topic path, e.g. /camera/image_raw/compressed.
                  If empty the node sleeps without subscribing.
VIDEO_TOPIC_TYPE  'compressed' (default) or 'raw'.
MEDIAMTX_RTMP     RTMP push URL (default: rtmp://127.0.0.1:1935/teleop).
"""
import os
import sys
import threading
import time

import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib  # noqa: E402

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage, Image  # noqa: E402


Gst.init(None)

MEDIAMTX_RTMP = os.environ.get('MEDIAMTX_RTMP', 'rtmp://127.0.0.1:1935/teleop')

# ROS2 encoding string → GStreamer video/x-raw format string
_FORMAT_MAP: dict[str, str] = {
    'rgb8':  'RGB',
    'bgr8':  'BGR',
    'mono8': 'GRAY8',
    'rgba8': 'RGBA',
    'bgra8': 'BGRA',
}


def _compressed_pipeline() -> str:
    """GStreamer pipeline for sensor_msgs/CompressedImage (JPEG frames)."""
    return (
        'appsrc name=src is-live=true block=false format=time '
        'caps=image/jpeg '
        '! jpegparse '
        '! avdec_mjpeg '
        '! videoconvert '
        '! video/x-raw,format=I420 '
        '! x264enc tune=zerolatency speed-preset=ultrafast key-int-max=30 bitrate=2000 '
        '! h264parse '
        '! flvmux streamable=true '
        f'! rtmpsink location={MEDIAMTX_RTMP} sync=false'
    )


def _raw_pipeline(width: int, height: int, gst_format: str) -> str:
    """GStreamer pipeline for sensor_msgs/Image (raw pixel frames)."""
    caps = (
        f'video/x-raw,format={gst_format},'
        f'width={width},height={height},framerate=15/1'
    )
    return (
        f'appsrc name=src is-live=true block=false format=time caps={caps} '
        '! videoconvert '
        '! video/x-raw,format=I420 '
        '! x264enc tune=zerolatency speed-preset=ultrafast key-int-max=30 bitrate=2000 '
        '! h264parse '
        '! flvmux streamable=true '
        f'! rtmpsink location={MEDIAMTX_RTMP} sync=false'
    )


class VideoBridgeNode(Node):
    def __init__(self, topic: str, topic_type: str) -> None:
        super().__init__('video_bridge')
        self._topic_type = topic_type
        self._pipeline: Gst.Pipeline | None = None
        self._src: Gst.Element | None = None
        self._pipeline_started = False
        self._retry_timer = None
        self._lock = threading.Lock()

        msg_type = CompressedImage if topic_type == 'compressed' else Image
        self.subscription = self.create_subscription(
            msg_type, topic, self._on_message, 10
        )
        self.get_logger().info(
            f'video_bridge: subscribing to {topic} '
            f'(type={topic_type}, rtmp={MEDIAMTX_RTMP})'
        )

    # ------------------------------------------------------------------
    # Pipeline lifecycle
    # ------------------------------------------------------------------

    def _build_pipeline(self, msg) -> None:
        """Build and start the GStreamer pipeline on first message."""
        with self._lock:
            # Double-checked locking: another thread may have already built the pipeline.
            if self._pipeline_started:
                return

            if self._topic_type == 'compressed':
                pipeline_str = _compressed_pipeline()
            else:
                gst_format = _FORMAT_MAP.get(getattr(msg, 'encoding', 'bgr8'), 'BGR')
                pipeline_str = _raw_pipeline(msg.width, msg.height, gst_format)

            self.get_logger().info(f'Starting GStreamer pipeline: {pipeline_str}')
            self._pipeline = Gst.parse_launch(pipeline_str)
            self._src = self._pipeline.get_by_name('src')

            bus = self._pipeline.get_bus()
            bus.add_signal_watch()
            bus.connect('message::error', self._on_bus_error)

            ret = self._pipeline.set_state(Gst.State.PLAYING)
            if ret == Gst.StateChangeReturn.FAILURE:
                self.get_logger().error('GStreamer pipeline failed to start — will retry in 5s')
                self._schedule_pipeline_restart()
            else:
                self._pipeline_started = True

    def _stop_pipeline_unlocked(self) -> None:
        """Stop pipeline; assumes lock is already held."""
        if self._pipeline is not None:
            self._pipeline.set_state(Gst.State.NULL)
            self._pipeline = None
            self._src = None
        self._pipeline_started = False

    def _stop_pipeline(self) -> None:
        with self._lock:
            self._stop_pipeline_unlocked()

    def _schedule_pipeline_restart(self) -> None:
        with self._lock:
            self._stop_pipeline_unlocked()
            self._retry_timer = self.create_timer(5.0, self._retry_pipeline)

    def _retry_pipeline(self) -> None:
        with self._lock:
            if self._retry_timer:
                self._retry_timer.cancel()
                self._retry_timer = None
        self.get_logger().info('Retrying GStreamer pipeline…')
        # Pipeline will be rebuilt on next message

    def _on_bus_error(self, _bus, msg) -> None:
        err, debug = msg.parse_error()
        self.get_logger().error(f'GStreamer error: {err.message} ({debug})')
        self._schedule_pipeline_restart()

    # ------------------------------------------------------------------
    # ROS2 message callback
    # ------------------------------------------------------------------

    def _on_message(self, msg) -> None:
        if not self._pipeline_started:
            self._build_pipeline(msg)
            return  # first message used only to build pipeline; push on next

        if self._src is None:
            return

        data = bytes(msg.data)
        buf = Gst.Buffer.new_wrapped(data)
        ret = self._src.emit('push-buffer', buf)
        if ret != Gst.FlowReturn.OK:
            self.get_logger().warning(f'push-buffer returned {ret} — restarting pipeline')
            self._schedule_pipeline_restart()

    def destroy_node(self) -> None:
        if self._retry_timer is not None:
            self._retry_timer.cancel()
            self._retry_timer = None
        self._stop_pipeline()
        super().destroy_node()


def main() -> None:
    topic = os.environ.get('VIDEO_TOPIC', '').strip()
    if not topic:
        print('video_bridge: VIDEO_TOPIC not set — sleeping (video disabled)', flush=True)
        # Stay alive without spinning so Docker reports healthy, but do nothing.
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
        return

    topic_type = os.environ.get('VIDEO_TOPIC_TYPE', 'compressed').strip()
    if topic_type not in ('compressed', 'raw'):
        print(f'video_bridge: unknown VIDEO_TOPIC_TYPE={topic_type!r}, defaulting to compressed',
              flush=True)
        topic_type = 'compressed'

    # Run a GLib main loop in a background thread for GStreamer bus watch callbacks.
    loop = GLib.MainLoop()
    glib_thread = threading.Thread(target=loop.run, daemon=True)
    glib_thread.start()

    rclpy.init()
    node = VideoBridgeNode(topic, topic_type)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
        loop.quit()


if __name__ == '__main__':
    main()
