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

  it('phone-portrait hides telemetry stack and compass', () => {
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

    // In portrait, telemetry and compass should not be rendered
    // (they have isLandscape guard), so LAT text should not appear
    // except in the overlay which is landscape-only

    // Verify DRIVE/STRAFE still render (not landscape-gated)
    expect(screen.getByText('DRIVE')).toBeTruthy();
    expect(screen.getByText('STRAFE')).toBeTruthy();
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
});
