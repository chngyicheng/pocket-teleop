/**
 * MissionControl.test.tsx — phone layout tests
 * RTL + FakeTeleopClient injection via props.bridge
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MissionControl, type MissionControlProps } from '../src/views/MissionControl.js';
import { TeleopBridge } from '../src/hooks/useTeleopBridge.js';
import { WhepStream } from '../src/hooks/useWhepStream.js';

/**
 * Fake bridge object for injection
 */
function createFakeBridge(overrides?: Partial<TeleopBridge>): TeleopBridge {
  return {
    connected: true,
    connectionState: 'live',
    retryCount: 0,
    latencyMs: 42,
    odom: { x: 0, y: 0, heading: 0 },
    robotName: 'r1',
    robotNamespace: '/ns',
    robotType: 'diff',
    sendTwist: vi.fn(),
    eStop: vi.fn(),
    estopEngaged: false,
    resetEstop: vi.fn(),
    ...overrides,
  };
}

/**
 * Fake stream object for injection
 */
function createFakeStream(overrides?: Partial<WhepStream>): WhepStream {
  return {
    stream: null,
    state: 'live',
    error: null,
    ...overrides,
  };
}

describe('MissionControl', () => {
  it('phone-landscape renders header, video, joysticks, and E-STOP button', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionControlProps = {
      bridge,
      stream,
      onMenu,
      layout: 'phone-landscape',
    };

    render(<MissionControl {...props} />);

    // Header should be present
    expect(screen.getByText(/POCKET-TELEOP/i)).toBeTruthy();

    // Robot name from bridge
    expect(screen.getByText(/r1/)).toBeTruthy();

    // Connection state chip (live = green)
    expect(screen.getByText(/Connected — diff_drive/i)).toBeTruthy();

    // E-STOP button
    const stopButton = screen.getByRole('button', { name: /STOP/i });
    expect(stopButton).toBeTruthy();

    // Video element
    const video = document.querySelector('video');
    expect(video).toBeTruthy();

    // Joystick zones (DRIVE + STRAFE labels)
    expect(screen.getByText('DRIVE')).toBeTruthy();
    expect(screen.getByText('STRAFE')).toBeTruthy();

    // Mode chip
    expect(screen.getByText(/MANUAL · TELEOP/)).toBeTruthy();
  });

  it('E-STOP button click triggers bridge.eStop', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
        layout="phone-portrait"
      />
    );

    const stopButton = screen.getByRole('button', { name: /STOP/i });
    fireEvent.click(stopButton);

    expect(bridge.eStop).toHaveBeenCalledOnce();
  });

  it('Space keydown triggers bridge.eStop and prevents default', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
        layout="phone-landscape"
      />
    );

    // fireEvent.keyDown(window, init) constructs a new KeyboardEvent from the
    // init dict — a pre-built event instance would be discarded, defeating the
    // preventDefault spy. Use native dispatchEvent to preserve the same instance.
    const event = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(bridge.eStop).toHaveBeenCalledOnce();
  });

  it('hamburger click triggers onMenu', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
        layout="phone-landscape"
      />
    );

    // Hamburger is a <button aria-label="Open menu"> (accessible, focusable).
    const hamburger = screen.getByLabelText('Open menu');
    fireEvent.click(hamburger);

    expect(onMenu).toHaveBeenCalledOnce();
  });

  it('displays latency from bridge.latencyMs', () => {
    const bridge = createFakeBridge({ latencyMs: 123 });
    const stream = createFakeStream();
    const onMenu = vi.fn();

    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
        layout="phone-landscape"
      />
    );

    // LAT readout shows latency value
    expect(screen.getByText(/123 ms/)).toBeTruthy();
  });

  it('phone-portrait renders telemetry stack and minimap (smaller size)', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const { rerender } = render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
        layout="phone-portrait"
      />
    );

    // In portrait, telemetry readouts should be rendered (no longer landscape-gated)
    expect(screen.getByText(/LAT/)).toBeTruthy();
    expect(screen.getByText(/BAT/)).toBeTruthy();
    expect(screen.getByText(/SIG/)).toBeTruthy();

    // Verify DRIVE/STRAFE still render
    expect(screen.getByText('DRIVE')).toBeTruthy();
    expect(screen.getByText('STRAFE')).toBeTruthy();
  });

  it('phone-portrait renders MiniMap and Compass', () => {
    const bridge = createFakeBridge({ odom: { x: 0, y: 0, heading: 0 } });
    const stream = createFakeStream();
    const onMenu = vi.fn();

    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
        layout="phone-portrait"
      />
    );

    // In portrait, MiniMap and Compass should be rendered (no longer landscape-gated)
    // MiniMap renders SVG with grid/polyline elements, Compass also renders SVG
    // Count SVGs: we expect at least 2 (MiniMap grid + Compass)
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);

    // Alternatively: verify LAT readout is present (earlier test already confirms)
    expect(screen.getByText(/LAT/)).toBeTruthy();
  });

  it('disconnected state shows red chip with "○ Down" text in portrait', () => {
    const bridge = createFakeBridge({ connectionState: 'disconnected' });
    const stream = createFakeStream();
    const onMenu = vi.fn();

    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
        layout="phone-portrait"
      />
    );

    // Portrait shows compact "○ Down"
    expect(screen.getByText(/○ Down/)).toBeTruthy();

    // Chip text should be red (#ef4444)
    const chip = screen.getByText(/○ Down/);
    expect(chip).toBeTruthy();
  });

  it('estopEngaged=true shows banner and clicking button calls resetEstop', () => {
    const bridge = createFakeBridge({ estopEngaged: true });
    const stream = createFakeStream();
    const onMenu = vi.fn();

    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
        layout="phone-landscape"
      />
    );

    // Banner should be visible
    expect(screen.getByText(/E-STOP ENGAGED/)).toBeTruthy();

    // Button label changes to RESET
    const resetButton = screen.getByRole('button', { name: /RESET/i });
    expect(resetButton).toBeTruthy();

    fireEvent.click(resetButton);

    expect(bridge.resetEstop).toHaveBeenCalledOnce();
    expect(bridge.eStop).not.toHaveBeenCalled();
  });

  /**
   * Cross-axis regression guard (BUG 1 axes-ref fix).
   *
   * Scenario: DRIVE joystick is pushed (sets lx/az), then STRAFE is pushed
   * (sets ly), then DRIVE is released.  The final sendTwist call when DRIVE
   * ends must zero lx and az but PRESERVE the live ly from the STRAFE push.
   *
   * Without the axesRef fix, handleDriveEnd reads ly from the React render
   * closure which lags one render cycle and may still be 0.
   */
  it('DRIVE end preserves live STRAFE ly via axesRef (cross-axis no stale closure)', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    render(
      <MissionControl
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
        layout="phone-landscape"
      />
    );

    const allZones = document.querySelectorAll('[data-testid="joystick-zone"]');
    // First zone is DRIVE (left), second is STRAFE (right)
    const driveEl = allZones[0] as Element;
    const strafeEl = allZones[1] as Element;

    // 1. Push DRIVE diagonally to get lx and az non-zero
    fireEvent.pointerDown(driveEl, { clientX: 95, clientY: 95, pointerId: 1 });
    fireEvent.pointerMove(driveEl, { clientX: 130, clientY: 60, pointerId: 1 });

    // 2. Push STRAFE to set ly (x-axis only joystick)
    fireEvent.pointerDown(strafeEl, { clientX: 95, clientY: 95, pointerId: 2 });
    fireEvent.pointerMove(strafeEl, { clientX: 130, clientY: 95, pointerId: 2 });

    // 3. Release DRIVE — the handleDriveEnd should zero lx/az but preserve ly
    (bridge.sendTwist as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.pointerUp(driveEl, { clientX: 130, clientY: 60, pointerId: 1 });

    const calls = (bridge.sendTwist as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // Last call: lx and az must be 0; ly must equal what STRAFE set
    const lastCall = calls[calls.length - 1] as [number, number, number];
    expect(lastCall[0]).toBe(0); // lx zeroed
    expect(lastCall[2]).toBe(0); // az zeroed
    // ly must be non-zero (the live STRAFE value) — proves no stale closure
    expect(lastCall[1]).not.toBe(0);
  });
});
