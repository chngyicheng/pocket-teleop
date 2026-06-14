import { describe, it, expect, vi } from 'vitest';
import { TeleopClient, type TeleopClientOptions } from '../src/teleop_client.js';

// Mock Connection to avoid WebSocket setup
vi.mock('../src/connection.js', () => {
  return {
    Connection: class {
      constructor(opts: any) {
        this.opts = opts;
      }
      opts: any;
      connect(_url: string) {
        // No-op
      }
      disconnect() {
        // No-op
      }
      send(_msg: string) {
        // No-op
      }
    },
  };
});

// Mock GamepadHandler
vi.mock('../src/gamepad_handler.js', () => {
  return {
    GamepadHandler: class {
      constructor(_opts: any) {}
      attach() {}
      detach() {}
      start() {}
      stop() {}
      setProfile(_profile: any) {}
      setEnabled(_enabled: boolean) {}
    },
  };
});

describe('TeleopClient map/pose/scan callbacks', () => {
  it('calls onMap when receiving map message', () => {
    let capturedOnMap: any = null;
    const client = new TeleopClient({
      onMap: (map) => {
        capturedOnMap = map;
      },
    });

    // Simulate receiving a map message
    const mapMsg = JSON.stringify({
      type: 'map',
      resolution: 0.05,
      width: 100,
      height: 100,
      origin_x: -2.5,
      origin_y: -2.5,
      cells: '0f1e2a',
    });

    // Manually trigger handleMessage via the connection's onMessage callback
    const connCallback = (client as any).connection.opts.onMessage;
    connCallback(mapMsg);

    expect(capturedOnMap).not.toBeNull();
    expect(capturedOnMap.resolution).toBe(0.05);
    expect(capturedOnMap.width).toBe(100);
    expect(capturedOnMap.height).toBe(100);
    expect(capturedOnMap.origin_x).toBe(-2.5);
    expect(capturedOnMap.origin_y).toBe(-2.5);
    expect(capturedOnMap.cells).toBe('0f1e2a');
  });

  it('does not call onMap if callback is not provided', () => {
    const client = new TeleopClient({}); // No onMap callback

    const mapMsg = JSON.stringify({
      type: 'map',
      resolution: 0.05,
      width: 100,
      height: 100,
      origin_x: -2.5,
      origin_y: -2.5,
      cells: '0f1e2a',
    });

    const connCallback = (client as any).connection.opts.onMessage;
    expect(() => connCallback(mapMsg)).not.toThrow();
  });

  it('calls onPose when receiving pose message with map frame', () => {
    let capturedOnPose: any = null;
    const client = new TeleopClient({
      onPose: (frame, x, y, heading) => {
        capturedOnPose = { frame, x, y, heading };
      },
    });

    const poseMsg = JSON.stringify({
      type: 'pose',
      frame: 'map',
      x: 1.5,
      y: 2.3,
      heading: 0.785,
    });

    const connCallback = (client as any).connection.opts.onMessage;
    connCallback(poseMsg);

    expect(capturedOnPose).not.toBeNull();
    expect(capturedOnPose.frame).toBe('map');
    expect(capturedOnPose.x).toBe(1.5);
    expect(capturedOnPose.y).toBe(2.3);
    expect(capturedOnPose.heading).toBe(0.785);
  });

  it('calls onPose when receiving pose message with odom frame', () => {
    let capturedOnPose: any = null;
    const client = new TeleopClient({
      onPose: (frame, x, y, heading) => {
        capturedOnPose = { frame, x, y, heading };
      },
    });

    const poseMsg = JSON.stringify({
      type: 'pose',
      frame: 'odom',
      x: 0.5,
      y: -0.1,
      heading: 1.57,
    });

    const connCallback = (client as any).connection.opts.onMessage;
    connCallback(poseMsg);

    expect(capturedOnPose).not.toBeNull();
    expect(capturedOnPose.frame).toBe('odom');
    expect(capturedOnPose.x).toBe(0.5);
    expect(capturedOnPose.y).toBe(-0.1);
    expect(capturedOnPose.heading).toBe(1.57);
  });

  it('calls onScan when receiving scan message', () => {
    let capturedOnScan: any = null;
    const client = new TeleopClient({
      onScan: (scan) => {
        capturedOnScan = scan;
      },
    });

    const scanMsg = JSON.stringify({
      type: 'scan',
      angle_min: -1.57,
      angle_increment: 0.01,
      range_max: 5.0,
      ranges: [1.0, 1.5, 2.0, 5.0],
    });

    const connCallback = (client as any).connection.opts.onMessage;
    connCallback(scanMsg);

    expect(capturedOnScan).not.toBeNull();
    expect(capturedOnScan.angle_min).toBe(-1.57);
    expect(capturedOnScan.angle_increment).toBe(0.01);
    expect(capturedOnScan.range_max).toBe(5.0);
    expect(capturedOnScan.ranges).toEqual([1.0, 1.5, 2.0, 5.0]);
  });

  it('does not crash when onMap callback is not provided', () => {
    const client = new TeleopClient({});

    const mapMsg = JSON.stringify({
      type: 'map',
      resolution: 0.05,
      width: 100,
      height: 100,
      origin_x: -2.5,
      origin_y: -2.5,
      cells: '0f1e2a',
    });

    const connCallback = (client as any).connection.opts.onMessage;
    expect(() => connCallback(mapMsg)).not.toThrow();
  });

  it('does not crash when onPose callback is not provided', () => {
    const client = new TeleopClient({});

    const poseMsg = JSON.stringify({
      type: 'pose',
      frame: 'map',
      x: 1.5,
      y: 2.3,
      heading: 0.785,
    });

    const connCallback = (client as any).connection.opts.onMessage;
    expect(() => connCallback(poseMsg)).not.toThrow();
  });

  it('does not crash when onScan callback is not provided', () => {
    const client = new TeleopClient({});

    const scanMsg = JSON.stringify({
      type: 'scan',
      angle_min: -1.57,
      angle_increment: 0.01,
      range_max: 5.0,
      ranges: [1.0, 1.5, 2.0],
    });

    const connCallback = (client as any).connection.opts.onMessage;
    expect(() => connCallback(scanMsg)).not.toThrow();
  });

  it('handles multiple map messages in sequence', () => {
    const mapUpdates: any[] = [];
    const client = new TeleopClient({
      onMap: (map) => {
        mapUpdates.push(map);
      },
    });

    const connCallback = (client as any).connection.opts.onMessage;

    const map1 = JSON.stringify({
      type: 'map',
      resolution: 0.05,
      width: 100,
      height: 100,
      origin_x: -2.5,
      origin_y: -2.5,
      cells: '0f',
    });

    const map2 = JSON.stringify({
      type: 'map',
      resolution: 0.1,
      width: 50,
      height: 50,
      origin_x: -2.5,
      origin_y: -2.5,
      cells: '1f',
    });

    connCallback(map1);
    connCallback(map2);

    expect(mapUpdates).toHaveLength(2);
    expect(mapUpdates[0].resolution).toBe(0.05);
    expect(mapUpdates[1].resolution).toBe(0.1);
  });

  it('handles mixed message types (map, pose, scan)', () => {
    const events: any[] = [];
    const client = new TeleopClient({
      onMap: (map) => events.push({ type: 'map', data: map }),
      onPose: (frame, x, y, heading) => events.push({ type: 'pose', frame, x, y, heading }),
      onScan: (scan) => events.push({ type: 'scan', data: scan }),
    });

    const connCallback = (client as any).connection.opts.onMessage;

    const mapMsg = JSON.stringify({
      type: 'map',
      resolution: 0.05,
      width: 100,
      height: 100,
      origin_x: -2.5,
      origin_y: -2.5,
      cells: '0f',
    });

    const poseMsg = JSON.stringify({
      type: 'pose',
      frame: 'map',
      x: 1.5,
      y: 2.3,
      heading: 0.785,
    });

    const scanMsg = JSON.stringify({
      type: 'scan',
      angle_min: -1.57,
      angle_increment: 0.01,
      range_max: 5.0,
      ranges: [1.0, 1.5, 2.0],
    });

    connCallback(mapMsg);
    connCallback(poseMsg);
    connCallback(scanMsg);

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('map');
    expect(events[1].type).toBe('pose');
    expect(events[2].type).toBe('scan');
  });
});
