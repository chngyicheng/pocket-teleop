/**
 * SpeedStepper.test.tsx — volume-style speed control component
 *
 * Verifies SpeedStepper renders label, value, unit; − and + buttons increment/decrement;
 * buttons disabled at limits; onChange called with rounded values.
 *
 * TDD: write red, then implement.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeedStepper from '../src/components/SpeedStepper.js';

describe('SpeedStepper', () => {
  // -------------------------------------------------------------------------
  // TEST 1 — renders label, value, unit
  // -------------------------------------------------------------------------
  it('renders label, value (1 decimal), and unit', () => {
    const onChange = vi.fn();
    render(
      <SpeedStepper
        label="LINEAR"
        value={1.25}
        unit="m/s"
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={onChange}
      />
    );

    expect(screen.getByText('LINEAR')).toBeInTheDocument();
    expect(screen.getByTestId('speed-value')).toHaveTextContent('1.3');
    expect(screen.getByText('m/s')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // TEST 2 — increment button calls onChange with stepped value
  // -------------------------------------------------------------------------
  it('increments value by step when + button clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SpeedStepper
        label="LINEAR"
        value={1.0}
        unit="m/s"
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={onChange}
      />
    );

    const increaseBtn = screen.getByRole('button', { name: /increase LINEAR/i });
    await user.click(increaseBtn);

    expect(onChange).toHaveBeenCalledWith(1.1);
  });

  // -------------------------------------------------------------------------
  // TEST 3 — decrement button calls onChange with stepped value
  // -------------------------------------------------------------------------
  it('decrements value by step when − button clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SpeedStepper
        label="ANGULAR"
        value={1.5}
        unit="rad/s"
        min={0.1}
        max={3.0}
        step={0.1}
        onChange={onChange}
      />
    );

    const decreaseBtn = screen.getByRole('button', { name: /decrease ANGULAR/i });
    await user.click(decreaseBtn);

    expect(onChange).toHaveBeenCalledWith(1.4);
  });

  // -------------------------------------------------------------------------
  // TEST 4 — decrease button disabled at min
  // -------------------------------------------------------------------------
  it('disables − button when value <= min', () => {
    const onChange = vi.fn();
    render(
      <SpeedStepper
        label="LINEAR"
        value={0.1}
        unit="m/s"
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={onChange}
      />
    );

    const decreaseBtn = screen.getByRole('button', { name: /decrease LINEAR/i });
    expect(decreaseBtn).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // TEST 5 — increase button disabled at max
  // -------------------------------------------------------------------------
  it('disables + button when value >= max', () => {
    const onChange = vi.fn();
    render(
      <SpeedStepper
        label="ANGULAR"
        value={3.0}
        unit="rad/s"
        min={0.1}
        max={3.0}
        step={0.1}
        onChange={onChange}
      />
    );

    const increaseBtn = screen.getByRole('button', { name: /increase ANGULAR/i });
    expect(increaseBtn).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // TEST 6 — values clamped to min/max
  // -------------------------------------------------------------------------
  it('clamps increment to max', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SpeedStepper
        label="LINEAR"
        value={1.95}
        unit="m/s"
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={onChange}
      />
    );

    const increaseBtn = screen.getByRole('button', { name: /increase LINEAR/i });
    await user.click(increaseBtn);

    // 1.95 + 0.1 = 2.05 → clamped to 2.0
    expect(onChange).toHaveBeenCalledWith(2.0);
  });

  it('clamps decrement to min', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SpeedStepper
        label="ANGULAR"
        value={0.15}
        unit="rad/s"
        min={0.1}
        max={3.0}
        step={0.1}
        onChange={onChange}
      />
    );

    const decreaseBtn = screen.getByRole('button', { name: /decrease ANGULAR/i });
    await user.click(decreaseBtn);

    // 0.15 - 0.1 = 0.05 → clamped to 0.1
    expect(onChange).toHaveBeenCalledWith(0.1);
  });

  // -------------------------------------------------------------------------
  // TEST 7 — rounding to 1 decimal place
  // -------------------------------------------------------------------------
  it('rounds calculated values to 1 decimal place', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SpeedStepper
        label="LINEAR"
        value={1.04}
        unit="m/s"
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={onChange}
      />
    );

    const increaseBtn = screen.getByRole('button', { name: /increase LINEAR/i });
    await user.click(increaseBtn);

    // 1.04 + 0.1 = 1.14 → rounded to 1.1
    expect(onChange).toHaveBeenCalled();
    const args = onChange.mock.calls[0][0];
    expect(args).toBeCloseTo(1.1, 1);
  });

  // -------------------------------------------------------------------------
  // TEST 8 — optional accent prop
  // -------------------------------------------------------------------------
  it('accepts optional accent prop', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SpeedStepper
        label="LINEAR"
        value={1.0}
        unit="m/s"
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={onChange}
        accent="amber"
      />
    );

    // Component should render without error
    expect(container).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // TEST 9 — data-testid on value readout
  // -------------------------------------------------------------------------
  it('has data-testid="speed-value" on the value element', () => {
    const onChange = vi.fn();
    render(
      <SpeedStepper
        label="LINEAR"
        value={1.5}
        unit="m/s"
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={onChange}
      />
    );

    const speedValue = screen.getByTestId('speed-value');
    expect(speedValue).toBeInTheDocument();
    expect(speedValue.textContent).toContain('1.5');
  });

  // -------------------------------------------------------------------------
  // TEST 10 — multiple clicks accumulate
  // -------------------------------------------------------------------------
  it('allows multiple increments and decrements', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <SpeedStepper
        label="LINEAR"
        value={1.0}
        unit="m/s"
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={onChange}
      />
    );

    const increaseBtn = screen.getByRole('button', { name: /increase LINEAR/i });
    await user.click(increaseBtn);
    expect(onChange).toHaveBeenLastCalledWith(1.1);

    // Rerender with new value
    rerender(
      <SpeedStepper
        label="LINEAR"
        value={1.1}
        unit="m/s"
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={onChange}
      />
    );

    await user.click(increaseBtn);
    expect(onChange).toHaveBeenLastCalledWith(1.2);
  });
});
