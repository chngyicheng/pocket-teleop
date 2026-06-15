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
    mapGrid: null,
    mapPose: null,
    scan: null,
    battery: null,
    batteryEstimateMinutes: null,
    robotName: 'r1',
    robotNamespace: '/ns',
    robotType: 'diff',
    robotLength: 0,
    robotWidth: 0,
    gamepadTwist: { lx: 0, ly: 0, az: 0 },
    inputSource: 'idle',
    sendTwist: vi.fn(),
    eStop: vi.fn(),
    estopEngaged: false,
    resetEstop: vi.fn(),
    maxLinear: 1.0,
    maxAngular: 1.0,
    setMaxLinear: vi.fn(),
    setMaxAngular: vi.fn(),
    gamepadConnected: false,
    disconnectAction: 'stop',
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
    stats: null,
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
    const stopButton = screen.getByRole('button', { name: /STOP/i });
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

    const stopButton = screen.getByRole('button', { name: /STOP/i });
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

  it('top bar shows UP/BAT/SIG as dashes (placeholder Readouts)', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    const { container } = render(<MissionTablet {...props} />);

    // Check for UP, BAT, SIG with '—' values
    const findReadoutValue = (label: string): string | null => {
      const labelSpans = Array.from(container.querySelectorAll('span'));
      const labelSpan = labelSpans.find((s) => s.textContent === label);
      const valueSpan = labelSpan?.nextElementSibling as HTMLSpanElement | null;
      return valueSpan?.textContent ?? null;
    };

    expect(findReadoutValue('UP')).toBe('—');
    expect(findReadoutValue('BAT')).toBe('—');
    expect(findReadoutValue('SIG')).toBe('—');
  });

  it('STREAM panel shows codec details; fps/res show — when stats=null', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream({ stats: null });
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    const { container } = render(<MissionTablet {...props} />);

    // Check for static source/codec (always WebRTC/H.264)
    expect(screen.getByText('WebRTC')).toBeTruthy();
    expect(screen.getByText('H.264')).toBeTruthy();

    // Check for fps/res rows with '—' when stats=null
    const findDataRowValue = (key: string): string | null => {
      const labelSpans = Array.from(container.querySelectorAll('span'));
      const keySpan = labelSpans.find((s) => s.textContent === key);
      const valueSpan = keySpan?.nextElementSibling as HTMLSpanElement | null;
      return valueSpan?.textContent ?? null;
    };

    expect(findDataRowValue('fps')).toBe('—');
    expect(findDataRowValue('res')).toBe('—');

    // Verify dynamic stream state still renders
    expect(screen.getByText(/● Live/)).toBeTruthy();
  });

  it('STREAM panel shows fps/res from stream.stats when available', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream({ stats: { fps: 15, width: 1920, height: 1080 } });
    const onMenu = vi.fn();

    const props: MissionTabletProps = {
      bridge,
      stream,
      onMenu,
    };

    const { container } = render(<MissionTablet {...props} />);

    // Check static codec
    expect(screen.getByText('WebRTC')).toBeTruthy();
    expect(screen.getByText('H.264')).toBeTruthy();

    // Check fps/res from stats
    const findDataRowValue = (key: string): string | null => {
      const labelSpans = Array.from(container.querySelectorAll('span'));
      const keySpan = labelSpans.find((s) => s.textContent === key);
      const valueSpan = keySpan?.nextElementSibling as HTMLSpanElement | null;
      return valueSpan?.textContent ?? null;
    };

    expect(findDataRowValue('fps')).toBe('15.0');
    expect(findDataRowValue('res')).toBe('1920×1080');
  });

  it('estopEngaged=true shows banner and clicking button calls resetEstop', () => {
    const bridge = createFakeBridge({ estopEngaged: true });
    const stream = createFakeStream();
    const onMenu = vi.fn();

    render(<MissionTablet bridge={bridge} stream={stream} onMenu={onMenu} />);

    // Banner should be visible
    expect(screen.getByText(/E-STOP ENGAGED/)).toBeTruthy();

    // Button label changes to RESET
    const resetButton = screen.getByRole('button', { name: /RESET/i });
    expect(resetButton).toBeTruthy();

    fireEvent.click(resetButton);

    expect(bridge.resetEstop).toHaveBeenCalledOnce();
    expect(bridge.eStop).not.toHaveBeenCalled();
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

  it('disables joystick interaction when controlsDisabled, keeping the zones rendered', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();

    render(
      <MissionTablet bridge={bridge} stream={stream} onMenu={vi.fn()} controlsDisabled />
    );

    const zones = screen.getAllByTestId('joystick-zone');
    expect(zones.length).toBe(2);
    for (const z of zones) {
      expect((z.parentElement as HTMLElement).style.pointerEvents).toBe('none');
    }
  });

  it('keeps joysticks interactive when controlsDisabled is false', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();

    render(
      <MissionTablet bridge={bridge} stream={stream} onMenu={vi.fn()} controlsDisabled={false} />
    );

    for (const z of screen.getAllByTestId('joystick-zone')) {
      expect((z.parentElement as HTMLElement).style.pointerEvents).toBe('auto');
    }
  });

  // Trophy TDD — collapsible rails tests 5–9
  describe('collapsible rails (tests 5–9)', () => {
    it('renders two rail tab buttons (rail-tab-left and rail-tab-right)', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream();
      const onMenu = vi.fn();

      render(
        <MissionTablet bridge={bridge} stream={stream} onMenu={onMenu} />
      );

      // Test 5: verify both rail tabs exist
      const leftTab = screen.getByTestId('rail-tab-left');
      const rightTab = screen.getByTestId('rail-tab-right');
      expect(leftTab).toBeTruthy();
      expect(rightTab).toBeTruthy();
    });

    it('displays STREAM and MAP content initially', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream();
      const onMenu = vi.fn();

      render(
        <MissionTablet bridge={bridge} stream={stream} onMenu={onMenu} />
      );

      // Test 6: verify STREAM and MAP panels are visible
      expect(screen.getByText('STREAM')).toBeTruthy();
      expect(screen.getByText('MAP')).toBeTruthy();
      // Also verify some content is visible
      expect(screen.getByText('WebRTC')).toBeTruthy();
      expect(screen.getByText('HEADING')).toBeTruthy();
    });

    it('toggles left rail collapse/expand state via gridTemplateColumns', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream();
      const onMenu = vi.fn();

      const { container } = render(
        <MissionTablet bridge={bridge} stream={stream} onMenu={onMenu} />
      );

      const leftTab = screen.getByTestId('rail-tab-left');
      const gridContainer = container.querySelector('[style*="grid-template-columns"]') as HTMLElement;

      // Test 7a: initially left should be open (220px)
      let gridStyle = gridContainer.style.gridTemplateColumns;
      expect(gridStyle).toContain('220px');

      // Click left tab to collapse
      fireEvent.click(leftTab);
      gridStyle = gridContainer.style.gridTemplateColumns;
      expect(gridStyle).toMatch(/^0px /); // left collapsed → first column 0

      // Click again to expand
      fireEvent.click(leftTab);
      gridStyle = gridContainer.style.gridTemplateColumns;
      expect(gridStyle).toContain('220px'); // left expanded
    });

    it('toggles right rail collapse/expand state via gridTemplateColumns', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream();
      const onMenu = vi.fn();

      const { container } = render(
        <MissionTablet bridge={bridge} stream={stream} onMenu={onMenu} />
      );

      const rightTab = screen.getByTestId('rail-tab-right');
      const gridContainer = container.querySelector('[style*="grid-template-columns"]') as HTMLElement;

      // Test 8a: initially right should be open (240px)
      let gridStyle = gridContainer.style.gridTemplateColumns;
      expect(gridStyle).toContain('240px');

      // Click right tab to collapse
      fireEvent.click(rightTab);
      gridStyle = gridContainer.style.gridTemplateColumns;
      expect(gridStyle).toMatch(/ 0px$/); // right collapsed → last column 0

      // Click again to expand
      fireEvent.click(rightTab);
      gridStyle = gridContainer.style.gridTemplateColumns;
      expect(gridStyle).toContain('240px'); // right expanded
    });

    it('video element uses objectFit: contain', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream();
      const onMenu = vi.fn();

      const { container } = render(
        <MissionTablet bridge={bridge} stream={stream} onMenu={onMenu} />
      );

      // Test 9: verify video objectFit is contain
      const video = container.querySelector('video') as HTMLVideoElement;
      expect(video).toBeTruthy();
      const style = window.getComputedStyle(video);
      expect(style.objectFit).toBe('contain');
    });
  });

  // BUG 3 — top-bar overflow + label unification
  describe('top bar (BUG 3)', () => {
    it('renders the E-STOP button with the unified "■ STOP" label', () => {
      render(<MissionTablet bridge={createFakeBridge()} stream={createFakeStream()} onMenu={vi.fn()} />);

      const btn = screen.getByRole('button', { name: /STOP/i });
      expect(btn.textContent).toBe('■ STOP');
      expect(btn.textContent).not.toContain('E-STOP');
    });

    it('pins the E-STOP button so it never shrinks off the top bar', () => {
      render(<MissionTablet bridge={createFakeBridge()} stream={createFakeStream()} onMenu={vi.fn()} />);

      const btn = screen.getByRole('button', { name: /STOP/i });
      expect(btn.style.flexShrink).toBe('0');
    });

    it('makes the robot-name label the sole shrink target and clips top-bar overflow', () => {
      render(<MissionTablet bridge={createFakeBridge()} stream={createFakeStream()} onMenu={vi.fn()} />);

      // Top bar is the parent of the hamburger button.
      const topBar = screen.getByLabelText('Open menu').parentElement as HTMLElement;
      expect(topBar.style.overflow).toBe('hidden');

      // The robot-name label truncates (minWidth:0 + ellipsis) to give up space first.
      // Read the serialized style: jsdom's CSSOM drops the unitless `0` of
      // min-width when read via the typed `.style` accessor, so assert the attribute.
      const nameEl = screen.getByText(/POCKET-TELEOP/i) as HTMLElement;
      const nameStyle = nameEl.getAttribute('style') ?? '';
      expect(nameStyle).toContain('min-width: 0');
      expect(nameStyle).toContain('text-overflow: ellipsis');
    });
  });

  it('gamepad input drives joystick knob and hides hint; idle shows hint', () => {
    // Test with gamepad active
    const bridge = createFakeBridge({
      inputSource: 'gamepad',
      gamepadTwist: { lx: 0.5, ly: 0, az: 0 },
    });
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const { container } = render(
      <MissionTablet
        bridge={bridge}
        stream={stream}
        onMenu={onMenu}
      />
    );

    // When gamepad is active, knob should be visible, hint hidden
    const knobs = container.querySelectorAll('[data-testid="joystick-knob"]');
    expect(knobs.length).toBeGreaterThanOrEqual(1);
    const hints = container.querySelectorAll('[data-testid="joystick-hint"]');
    expect(hints.length).toBe(0);

    // Rerender with idle input
    const bridgeIdle = createFakeBridge({
      inputSource: 'idle',
      gamepadTwist: { lx: 0, ly: 0, az: 0 },
    });
    const { container: container2 } = render(
      <MissionTablet
        bridge={bridgeIdle}
        stream={stream}
        onMenu={onMenu}
      />
    );

    // When idle, hint should be visible, knob absent
    const knobs2 = container2.querySelectorAll('[data-testid="joystick-knob"]');
    expect(knobs2.length).toBe(0);
    const hints2 = container2.querySelectorAll('[data-testid="joystick-hint"]');
    expect(hints2.length).toBeGreaterThanOrEqual(1);
  });

  // Video signal overlay tests (T6)
  describe('VideoSignalOverlay', () => {
    it('does not render overlay when state is live', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream({ state: 'live' });

      render(<MissionTablet bridge={bridge} stream={stream} onMenu={vi.fn()} />);

      expect(screen.queryByTestId('video-signal-overlay')).toBeNull();
    });

    it('renders CONNECTING… when state is connecting', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream({ state: 'connecting' });

      render(<MissionTablet bridge={bridge} stream={stream} onMenu={vi.fn()} />);

      expect(screen.getByTestId('video-signal-overlay')).toBeTruthy();
      expect(screen.getByText('CONNECTING…')).toBeTruthy();
    });

    it('renders RECONNECTING… when state is retrying', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream({ state: 'retrying' });

      render(<MissionTablet bridge={bridge} stream={stream} onMenu={vi.fn()} />);

      expect(screen.getByTestId('video-signal-overlay')).toBeTruthy();
      expect(screen.getByText('RECONNECTING…')).toBeTruthy();
    });

    it('renders NO SIGNAL when state is error', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream({ state: 'error' });

      render(<MissionTablet bridge={bridge} stream={stream} onMenu={vi.fn()} />);

      expect(screen.getByTestId('video-signal-overlay')).toBeTruthy();
      expect(screen.getByText('NO SIGNAL')).toBeTruthy();
    });

    it('overlay has pointerEvents none so it never blocks joysticks', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream({ state: 'error' });

      render(<MissionTablet bridge={bridge} stream={stream} onMenu={vi.fn()} />);

      const overlay = screen.getByTestId('video-signal-overlay') as HTMLElement;
      expect(overlay.style.pointerEvents).toBe('none');
    });

    it('joystick remains visible and interactive when overlay is present', () => {
      const bridge = createFakeBridge();
      const stream = createFakeStream({ state: 'error' });

      render(<MissionTablet bridge={bridge} stream={stream} onMenu={vi.fn()} />);

      // Overlay present
      expect(screen.getByTestId('video-signal-overlay')).toBeTruthy();

      // Joysticks still rendered and at z 5 (not hidden)
      const zones = screen.getAllByTestId('joystick-zone');
      expect(zones.length).toBe(2);
    });
  });

  it('renders SPEED panel between VELOCITY and ODOMETRY panels in left rail', () => {
    const bridge = createFakeBridge();
    const stream = createFakeStream();
    const onMenu = vi.fn();

    const { container } = render(<MissionTablet bridge={bridge} stream={stream} onMenu={onMenu} />);

    // Find the panels by their titles
    const velocityEl = screen.getByText('VELOCITY');
    const speedEl = screen.getByText('SPEED');
    const odometryEl = screen.getByText('ODOMETRY');

    // Verify all three are present
    expect(velocityEl).toBeTruthy();
    expect(speedEl).toBeTruthy();
    expect(odometryEl).toBeTruthy();

    // Verify DOM order: VELOCITY → SPEED → ODOMETRY
    const velocityPosition = velocityEl.compareDocumentPosition(speedEl);
    expect(velocityPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // VELOCITY comes before SPEED

    const speedPosition = speedEl.compareDocumentPosition(odometryEl);
    expect(speedPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // SPEED comes before ODOMETRY
  });

  it('tablet minimap uses mapPose when available (SLAM)', () => {
    const mapPose = { frame: 'map' as const, x: 1.5, y: -0.5, heading: 0.78 };
    const mapGrid = {
      cells: new Uint8Array(4),
      width: 2,
      height: 2,
      resolution: 0.05,
      originX: 0,
      originY: 0,
    };
    const bridge = createFakeBridge({
      odom: { x: 10, y: 20, heading: 0 },
      mapPose,
      mapGrid,
    });

    render(
      <MissionTablet
        bridge={bridge}
        stream={createFakeStream()}
        onMenu={vi.fn()}
      />
    );

    // The minimap canvas should exist (rendered with mapPose + mapGrid)
    const canvas = screen.getByTestId('minimap-canvas');
    expect(canvas).toBeTruthy();
  });

  it('tablet minimap falls back to odom when mapPose is null', () => {
    const bridge = createFakeBridge({
      odom: { x: 5, y: 10, heading: 0.5 },
      mapPose: null,
      mapGrid: null,
    });

    render(
      <MissionTablet
        bridge={bridge}
        stream={createFakeStream()}
        onMenu={vi.fn()}
      />
    );

    // Minimap grid should be shown when mapGrid is null
    expect(screen.getByTestId('minimap-grid')).toBeTruthy();
  });

  it('renders gamepad indicator when gamepadConnected is true', () => {
    const bridge = createFakeBridge({ gamepadConnected: true });
    const stream = createFakeStream();

    render(
      <MissionTablet
        bridge={bridge}
        stream={stream}
        onMenu={vi.fn()}
      />
    );

    // Gamepad indicator should be visible with "🎮 GP" text
    expect(screen.getByText('🎮 GP')).toBeTruthy();
  });

  it('does not render gamepad indicator when gamepadConnected is false', () => {
    const bridge = createFakeBridge({ gamepadConnected: false });
    const stream = createFakeStream();

    render(
      <MissionTablet
        bridge={bridge}
        stream={stream}
        onMenu={vi.fn()}
      />
    );

    // Gamepad indicator should not be present
    expect(() => screen.getByText('🎮 GP')).toThrow();
  });
});
