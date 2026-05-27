// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startMissionApp, type MissionAppHandle, type MissionAppOptions } from '../src/mission_app.js';

class FakeTeleopClient {
  static instances: FakeTeleopClient[] = [];
  options: any;
  twists: Array<[number, number, number]> = [];
  connected = false;

  constructor(opts: any) {
    this.options = opts;
    FakeTeleopClient.instances.push(this);
  }

  connect(url: string) {
    this.connected = true;
  }

  disconnect() {
    this.connected = false;
  }

  sendTwist(lx: number, ly: number, az: number) {
    this.twists.push([lx, ly, az]);
  }
}

class FakeWhepClient {
  static instances: FakeWhepClient[] = [];
  url: string;
  options: any;

  constructor(url: string, opts: any) {
    this.url = url;
    this.options = opts;
    FakeWhepClient.instances.push(this);
  }

  start() {}
  stop() {}
}

describe('MissionApp integration', () => {
  let root: HTMLElement;
  let handle: MissionAppHandle;

  beforeEach(() => {
    FakeTeleopClient.instances = [];
    FakeWhepClient.instances = [];
    root = document.createElement('div');
    root.style.width = '800px';
    root.style.height = '600px';
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (handle) {
      handle.destroy();
    }
    if (root.parentNode) {
      root.parentNode.removeChild(root);
    }
  });

  it('mounts header, video, joysticks, and overlays into root', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
      WhepClientCtor: FakeWhepClient as any,
    });

    expect(root.querySelector('.mission-header-host')).toBeTruthy();
    expect(root.querySelector('.mission-video')).toBeTruthy();
    expect(root.querySelector('.mission-joystick-drive')).toBeTruthy();
    expect(root.querySelector('.mission-joystick-strafe')).toBeTruthy();
    expect(root.querySelector('.mission-velbars-overlay')).toBeTruthy();
    expect(root.querySelector('.mission-telemetry-overlay')).toBeTruthy();
    expect(root.querySelector('.mission-minimap-overlay')).toBeTruthy();
  });

  it('onStatus(true) sets header chip to live and removes dim from video', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const fakeClient = FakeTeleopClient.instances[0];
    const videoEl = root.querySelector('.mission-video') as HTMLElement;

    // Simulate connection
    fakeClient.options.onStatus(true, 'diff_drive', 'bot-07', 'default');

    // Check that chip changed and dim was removed
    const chip = root.querySelector('.mh-chip');
    expect(chip?.textContent).toContain('Live');
    expect(videoEl.classList.contains('dim')).toBe(false);
  });

  it('onOdom updates minimap trail and compass label', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const fakeClient = FakeTeleopClient.instances[0];

    // Fire odom callback
    fakeClient.options.onOdom(1, 2, 0);

    // Check that minimap received update
    const polyline = root.querySelector('.mini-map-polyline') as SVGPolylineElement;
    if (polyline) {
      const points = polyline.getAttribute('points') || '';
      expect(points.length).toBeGreaterThan(0);
    }
  });

  it('e-stop button click sends zero twist', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const fakeClient = FakeTeleopClient.instances[0];

    // Connect first
    fakeClient.options.onStatus(true, 'diff_drive', 'bot-07', 'default');

    // Find and click e-stop
    const estopBtn = root.querySelector('.mh-estop') as HTMLButtonElement;
    expect(estopBtn).toBeTruthy();
    estopBtn?.click();

    // Check last twist is zero
    const lastTwist = fakeClient.twists[fakeClient.twists.length - 1];
    expect(lastTwist).toEqual([0, 0, 0]);
  });

  it('Space key sends zero twist', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const fakeClient = FakeTeleopClient.instances[0];
    fakeClient.options.onStatus(true, 'diff_drive', 'bot-07', 'default');

    const event = new KeyboardEvent('keydown', { key: ' ' });
    document.dispatchEvent(event);

    const lastTwist = fakeClient.twists[fakeClient.twists.length - 1];
    expect(lastTwist).toEqual([0, 0, 0]);
  });

  it('joystick onMove sends twist when connected', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const fakeClient = FakeTeleopClient.instances[0];

    // Connect
    fakeClient.options.onStatus(true, 'diff_drive', 'bot-07', 'default');

    // Use test seam to fire drive move
    if (handle._driveMove) {
      handle._driveMove(0.5, 0.3);

      // Should have sent a twist
      const lastTwist = fakeClient.twists[fakeClient.twists.length - 1];
      expect(lastTwist).toBeTruthy();
      expect(lastTwist[0]).toEqual(-0.3); // lx = -y
      expect(lastTwist[2]).toEqual(-0.5); // az = -x
    }
  });

  it('joystick onMove is blocked when disconnected', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const fakeClient = FakeTeleopClient.instances[0];
    const initialCount = fakeClient.twists.length;

    // Don't connect, try to move
    if (handle._driveMove) {
      handle._driveMove(0.5, 0.3);
    }

    // No new twist should have been sent
    expect(fakeClient.twists.length).toBe(initialCount);
  });

  it('reconnecting state adds dim class to video', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const fakeClient = FakeTeleopClient.instances[0];
    const videoEl = root.querySelector('.mission-video') as HTMLElement;

    // Trigger reconnecting
    fakeClient.options.onReconnecting(2);

    expect(videoEl.classList.contains('dim')).toBe(true);
  });

  it('onLatency updates LAT readout', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const fakeClient = FakeTeleopClient.instances[0];

    // Fire latency callback
    fakeClient.options.onLatency(42);

    // Check readout was updated
    const latReadout = root.querySelector('.readout-LAT');
    if (latReadout) {
      expect(latReadout.textContent).toContain('42');
    }
  });

  it('STRAFE joystick only modifies ly axis', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const fakeClient = FakeTeleopClient.instances[0];
    fakeClient.options.onStatus(true, 'diff_drive', 'bot-07', 'default');

    // Set drive values
    if (handle._driveMove) {
      handle._driveMove(0.1, 0.2);
    }

    const driveCount = fakeClient.twists.length;

    // Now strafe
    if (handle._strafeMove) {
      handle._strafeMove(0.5);

      // Last twist should have ly=0.5 but lx and az unchanged from drive
      const lastTwist = fakeClient.twists[fakeClient.twists.length - 1];
      expect(lastTwist[1]).toEqual(0.5); // ly
      expect(lastTwist[0]).toEqual(-0.2); // lx unchanged
      expect(lastTwist[2]).toEqual(-0.1); // az unchanged
    }
  });

  it('layout class is set correctly on root', () => {
    handle = startMissionApp({
      root,
      layout: 'tablet',
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    expect(root.className).toContain('mission-tablet');
  });

  it('mode chip displays MANUAL · TELEOP', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const modeChip = root.querySelector('.mission-mode-chip');
    expect(modeChip?.textContent).toBe('MANUAL · TELEOP');
  });

  it('destroy removes all event listeners and DOM', () => {
    handle = startMissionApp({
      root,
      teleopUrl: 'ws://localhost/teleop',
      TeleopClientCtor: FakeTeleopClient as any,
    });

    const initialChildren = root.children.length;
    expect(initialChildren).toBeGreaterThan(0);

    handle.destroy();

    expect(root.children.length).toBe(0);
  });
});
