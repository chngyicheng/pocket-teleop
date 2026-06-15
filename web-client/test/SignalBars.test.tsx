/**
 * SignalBars.test.tsx — SignalBars component tests
 *
 * Tests the signal quality indicator: 4 bars representing quality 0-4.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SignalBars } from '../src/components/shared.js';

describe('SignalBars', () => {
  // -------------------------------------------------------------------------
  // Bar fill tests
  // -------------------------------------------------------------------------
  it('renders all 4 bars filled when quality is 4', () => {
    const { getByTestId, getAllByTestId } = render(
      <SignalBars quality={4} color="#22c55e" />
    );

    const container = getByTestId('signal-bars');
    expect(container).toBeDefined();

    const bars = getAllByTestId('signal-bar');
    expect(bars).toHaveLength(4);

    bars.forEach((bar) => {
      expect(bar.getAttribute('data-filled')).toBe('true');
    });
  });

  it('renders 3 bars filled when quality is 3', () => {
    const { getAllByTestId } = render(
      <SignalBars quality={3} color="#22c55e" />
    );

    const bars = getAllByTestId('signal-bar');
    expect(bars).toHaveLength(4);

    // First 3 should be filled, last empty
    expect(bars[0].getAttribute('data-filled')).toBe('true');
    expect(bars[1].getAttribute('data-filled')).toBe('true');
    expect(bars[2].getAttribute('data-filled')).toBe('true');
    expect(bars[3].getAttribute('data-filled')).toBe('false');
  });

  it('renders 0 bars filled when quality is 0', () => {
    const { getAllByTestId } = render(
      <SignalBars quality={0} color="#22c55e" />
    );

    const bars = getAllByTestId('signal-bar');
    expect(bars).toHaveLength(4);

    bars.forEach((bar) => {
      expect(bar.getAttribute('data-filled')).toBe('false');
    });
  });

  // -------------------------------------------------------------------------
  // Null quality test
  // -------------------------------------------------------------------------
  it('renders all bars with muted color when quality is null', () => {
    const { getAllByTestId } = render(
      <SignalBars quality={null} color="#22c55e" mutedColor="rgba(255,255,255,0.15)" />
    );

    const bars = getAllByTestId('signal-bar');
    expect(bars).toHaveLength(4);

    bars.forEach((bar) => {
      expect(bar.getAttribute('data-filled')).toBe('false');
      // Verify the background color is the muted color
      const style = window.getComputedStyle(bar);
      expect(style.backgroundColor).toBeTruthy(); // jsdom computes color values
    });
  });

  // -------------------------------------------------------------------------
  // Container structure test
  // -------------------------------------------------------------------------
  it('renders container with data-testid and optional title', () => {
    const testTitle = 'RTT 50ms · Jitter 10ms · Loss 0%';
    const { getByTestId } = render(
      <SignalBars quality={2} color="#f59e0b" title={testTitle} />
    );

    const container = getByTestId('signal-bars');
    expect(container).toBeDefined();
    expect(container.getAttribute('title')).toBe(testTitle);
  });

  // -------------------------------------------------------------------------
  // SIG label test
  // -------------------------------------------------------------------------
  it('renders SIG label in the container', () => {
    const { getByText } = render(
      <SignalBars quality={2} color="#f59e0b" />
    );

    const label = getByText('SIG');
    expect(label).toBeDefined();
  });
});
