/**
 * latency_render_nonfinite.adversarial.test.tsx — H4
 *
 * Hypothesis: latencyMs readout renders garbage for negative / NaN / Infinity
 *
 * The guard is: bridge.latencyMs !== null ? `${bridge.latencyMs} ms` : '— ms'
 * Anything that is a number — including -42, NaN, Infinity — passes through.
 * The fix should check !isFinite() or < 0 and fall back to '— ms'.
 *
 * Expected: display shows '— ms' for any non-finite or negative value.
 * Actual (today): literally renders '-42 ms', 'NaN ms', 'Infinity ms'.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MissionControl } from '../src/views/MissionControl.js';
import type { TeleopBridge } from '../src/hooks/useTeleopBridge.js';
import type { WhepStream } from '../src/hooks/useWhepStream.js';

const mockStream: WhepStream = {
  stream: null,
  state: 'connecting',
  error: null,
};

const mockOnMenu = () => { };

function makeBridge(latencyMs: number | null): TeleopBridge {
  return {
    connected: true,
    connectionState: 'live',
    retryCount: 0,
    latencyMs,
    odom: { x: 0, y: 0, heading: 0 },
    robotType: 'diff',
    robotName: 'r1',
    robotNamespace: '/ns',
    eStop: vi.fn(),
    sendTwist: vi.fn(),
    estopEngaged: false,
    resetEstop: vi.fn(),
    gamepadTwist: { lx: 0, ly: 0, az: 0 },
    publishedTwist: { lx: 0, ly: 0, az: 0 },
    inputSource: 'idle',
    maxLinear: 1.0,
    maxAngular: 1.0,
    setMaxLinear: vi.fn(),
    setMaxAngular: vi.fn(),
    mapGrid: null,
    mapPose: null,
    scan: null,
    battery: null,
    robotLength: 0,
    robotWidth: 0,
    gamepadConnected: false,
    disconnectAction: 'stop',
  };
}

describe('latency_render_nonfinite.adversarial', () => {
  function readLatValue(): string | null | undefined {
    const labels = screen.getAllByText('LAT');
    const latLabel = labels[0];
    return latLabel.parentElement?.querySelector('span:last-child')?.textContent;
  }

  it('should display "— ms" when latencyMs is negative', () => {
    render(
      <MissionControl
        bridge={makeBridge(-42)}
        stream={mockStream}
        onMenu={mockOnMenu}
        layout="phone-portrait"
      />
    );
    expect(readLatValue()).toBe('— ms');
  });

  it('should display "— ms" when latencyMs is NaN', () => {
    render(
      <MissionControl
        bridge={makeBridge(NaN)}
        stream={mockStream}
        onMenu={mockOnMenu}
        layout="phone-portrait"
      />
    );
    expect(readLatValue()).toBe('— ms');
  });

  it('should display "— ms" when latencyMs is Infinity', () => {
    render(
      <MissionControl
        bridge={makeBridge(Infinity)}
        stream={mockStream}
        onMenu={mockOnMenu}
        layout="phone-portrait"
      />
    );
    expect(readLatValue()).toBe('— ms');
  });

  it('SANITY: should display latency correctly when latencyMs is a valid positive number', () => {
    render(
      <MissionControl
        bridge={makeBridge(42)}
        stream={mockStream}
        onMenu={mockOnMenu}
        layout="phone-portrait"
      />
    );
    expect(readLatValue()).toBe('42 ms');
  });
});
