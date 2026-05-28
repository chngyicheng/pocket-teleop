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
});
