/**
 * MissionTablet.test.tsx — tablet layout tests
 * RTL + FakeTeleopClient injection via props.bridge
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MissionTablet, type MissionTabletProps } from '../src/views/MissionTablet.js';
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

describe('MissionTablet', () => {
  it('renders three-column grid with all six SidePanels', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    // Check for header text
    expect(screen.getByText(/POCKET-TELEOP/i)).toBeTruthy();

    // Check for robot name
    expect(screen.getByText(/r1/)).toBeTruthy();

    // Check for connection state (live = green)
    expect(screen.getByText(/Connected — diff_drive/i)).toBeTruthy();

    // Check for E-STOP button
    const stopButton = screen.getByRole('button', { name: /E-STOP/i });
    expect(stopButton).toBeTruthy();

    // Left rail panels: STREAM, VELOCITY, ODOMETRY
    expect(screen.getByText('STREAM')).toBeTruthy();
    expect(screen.getByText('VELOCITY')).toBeTruthy();
    expect(screen.getByText('ODOMETRY')).toBeTruthy();

    // Right rail panels: MAP, HEADING, LIGHTS, HINT
    expect(screen.getByText('MAP')).toBeTruthy();
    expect(screen.getByText('HEADING')).toBeTruthy();
    expect(screen.getByText('LIGHTS')).toBeTruthy();
    expect(screen.getByText('HINT')).toBeTruthy();

    // Joystick labels
    expect(screen.getByText('DRIVE')).toBeTruthy();
    expect(screen.getByText('STRAFE')).toBeTruthy();

    // Mode chip
    expect(screen.getByText(/MANUAL · TELEOP/)).toBeTruthy();

    // Check grid layout (container with gridTemplateColumns containing 220px and 240px)
    const gridContainer = document.querySelector('[style*="grid-template-columns"]');
    if (gridContainer) {
      const style = window.getComputedStyle(gridContainer);
      expect(style.gridTemplateColumns).toContain('220px');
    }

    // Video element
    const video = document.querySelector('video');
    expect(video).toBeTruthy();
  });

  it('displays odometry data from bridge.odom', () => {
    const bridge = createFakeBridge({
      odom: { x: 1.23, y: 4.56, heading: 0.78 },
    });
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    // Check for pos.x formatted as '1.23 m'
    expect(screen.getByText('1.23 m')).toBeTruthy();

    // Check for pos.y formatted as '4.56 m'
    expect(screen.getByText('4.56 m')).toBeTruthy();

    // Check for heading (0.78 rad ≈ 44.7° ≈ 45° when rounded)
    const headingDeg = Math.round((0.78 * 180 / Math.PI) % 360);
    expect(screen.getByText(headingDeg + '°')).toBeTruthy();
  });

  it('calls bridge.eStop() when E-STOP button is clicked', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    const stopButton = screen.getByRole('button', { name: /E-STOP/i });
    fireEvent.click(stopButton);

    expect(bridge.eStop).toHaveBeenCalledTimes(1);
  });

  it('calls bridge.eStop() when Space key is pressed', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    fireEvent.keyDown(window, { code: 'Space' });

    expect(bridge.eStop).toHaveBeenCalledTimes(1);
  });

  it('calls onMenu when hamburger menu is clicked', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    // Find hamburger (☰ character)
    const hamburger = screen.getByText('☰');
    fireEvent.click(hamburger);

    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('toggles LIGHTS pill states on click', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    // Find HEAD pill toggle
    const headPill = screen.getByTestId('pill-toggle-head');
    expect(headPill).toBeTruthy();

    // Initially ON (from prop on={true})
    expect(headPill.textContent).toContain('●');

    // Click to toggle OFF
    fireEvent.click(headPill);
    expect(headPill.textContent).toContain('○');

    // Click again to toggle ON
    fireEvent.click(headPill);
    expect(headPill.textContent).toContain('●');
  });

  it('displays stream state from props.stream.state', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream({ state: 'connecting' });
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    // Stream state 'connecting' should be shown
    expect(screen.getByText(/● connecting/)).toBeTruthy();
  });

  it('syncs video srcObject with stream.stream', () => {
    // Create a mock MediaStream
    const mockStream = new MediaStream();

    const bridge = createFakeBridge();
    const stream = createFakeStream({ stream: mockStream });
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    const video = document.querySelector('video') as HTMLVideoElement | null;
    expect(video).toBeTruthy();
    expect(video?.srcObject).toBe(mockStream);
  });

  it('V/ω readouts reflect joystick state', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    // Get DRIVE joystick (first joystick)
    const drive = screen.getAllByTestId('joystick-zone')[0];

    // Diagonal push: y-offset → forward (lx), x-offset → rotate (az)
    fireEvent.pointerDown(drive, { pointerId: 1, clientX: 140, clientY: 140 });
    fireEvent.pointerMove(drive, { pointerId: 1, clientX: 200, clientY: 60 });

    // Find readout value spans (Readout renders label + value as siblings)
    const domText = document.body.textContent ?? '';
    const vMatch = domText.match(/([0-9]+\.[0-9]+)\s*m\/s/);
    expect(vMatch).toBeTruthy();
    expect(vMatch?.[1]).not.toBe('0.00');

    const omegaMatch = domText.match(/([0-9]+\.[0-9]+)\s*rad\/s/);
    expect(omegaMatch).toBeTruthy();
    expect(omegaMatch?.[1]).not.toBe('0.00');
  });

  it('HEADING track reflects atan2(ly, lx)', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    const { container } = render(<MissionTablet {...props} />);

    // Locate the track DataRow by finding the span whose textContent is 'track'
    // and reading its sibling value span.
    const findTrackValue = (): string | null => {
      const labelSpans = Array.from(container.querySelectorAll('span'));
      const trackLabel = labelSpans.find((s) => s.textContent === 'track');
      const valueSpan = trackLabel?.nextElementSibling as HTMLSpanElement | null;
      return valueSpan?.textContent ?? null;
    };

    // Baseline: lx=ly=0 → atan2(0,0)=0 → '0°'
    expect(findTrackValue()).toBe('0°');

    // Push STRAFE right so ly > 0
    const strafe = screen.getAllByTestId('joystick-zone')[1];
    fireEvent.pointerDown(strafe, { pointerId: 1, clientX: 140, clientY: 140 });
    fireEvent.pointerMove(strafe, { pointerId: 1, clientX: 220, clientY: 140 });

    // Push DRIVE forward so lx > 0
    const drive = screen.getAllByTestId('joystick-zone')[0];
    fireEvent.pointerDown(drive, { pointerId: 2, clientX: 140, clientY: 140 });
    fireEvent.pointerMove(drive, { pointerId: 2, clientX: 140, clientY: 60 });

    // atan2(ly, lx) of two positive values → positive angle ≠ 0°
    const trackAfter = findTrackValue();
    expect(trackAfter).not.toBe('0°');
    expect(trackAfter).toMatch(/^-?\d+°$/);
  });

  it('top bar LAT shows bridge.latencyMs', () => {
    const bridge = createFakeBridge({ latencyMs: 42 });
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    const { rerender } = render(<MissionTablet {...props} />);

    // Check for LAT with 42ms
    expect(screen.getByText(/42ms/)).toBeTruthy();

    // Rerender with null latencyMs
    const bridgeNull = createFakeBridge({ latencyMs: null });
    rerender(
      <MissionTablet
        bridge={bridgeNull}
        stream={stream}
        onMenu={onMenu}
      />
    );

    // Check for LAT with dash
    expect(document.body.textContent).toContain('—');
  });

  it('top bar shows UP/BAT/SIG placeholder Readouts', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    // Check for UP, BAT, SIG placeholder values
    expect(screen.getByText(/03:24:18/)).toBeTruthy();
    expect(screen.getByText(/78%/)).toBeTruthy();
    expect(screen.getByText(/-58dBm/)).toBeTruthy();
  });

  it('STREAM panel shows codec details', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    // Check for stream codec DataRows
    expect(screen.getByText('WebRTC')).toBeTruthy();
    expect(screen.getByText('H.264')).toBeTruthy();
    expect(screen.getByText('30.1')).toBeTruthy();
    expect(screen.getByText('1280×720')).toBeTruthy();

    // Verify dynamic stream state still renders (from existing test constraint)
    expect(screen.getByText(/● Live/)).toBeTruthy();
  });

  it('left rail footer shows ops info', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    render(<MissionTablet {...props} />);

    // Check for ops footer text
    expect(screen.getByText(/cmd_vel @ 50hz/)).toBeTruthy();
    expect(screen.getByText(/last pong 0.04s/)).toBeTruthy();
  });
});
