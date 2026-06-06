import React from 'react';

export interface SpeedStepperProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  /** Accent color for the value readout (defaults to Mission amber). */
  accent?: string;
}

// Mission palette (matches MissionControl / MissionTablet HUD chrome).
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const MUTED = '#8a92a3';
const BORDER = '#2a2f3a';
const SURFACE = '#1a1e26';
const AMBER = '#f0a92a';

export default function SpeedStepper({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
  accent = AMBER,
}: SpeedStepperProps): JSX.Element {
  const handleDecrease = () => {
    onChange(Math.max(min, Math.round((value - step) * 10) / 10));
  };
  const handleIncrease = () => {
    onChange(Math.min(max, Math.round((value + step) * 10) / 10));
  };

  const decreaseDisabled = value <= min;
  const increaseDisabled = value >= max;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    width: 20,
    height: 20,
    lineHeight: '18px',
    textAlign: 'center',
    padding: 0,
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 700,
    color: disabled ? MUTED : accent,
    background: SURFACE,
    border: `1px solid ${disabled ? BORDER : accent + '66'}`,
    borderRadius: 3,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    flex: '0 0 auto',
    touchAction: 'manipulation',
  });

  // Single line: "LABEL  −  X.X unit  +". Fixed-width label + value field so the
  // +/- columns line up between LINEAR and ANGULAR even as the number changes.
  // zIndex lifts just the control row above the joystick hold-zones (z5).
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: MONO,
        fontSize: 10,
      }}
    >
      <span
        style={{
          width: 44,
          flex: '0 0 auto',
          color: MUTED,
          opacity: 0.75,
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      <button
        type="button"
        aria-label={`decrease ${label}`}
        onClick={handleDecrease}
        disabled={decreaseDisabled}
        style={btnStyle(decreaseDisabled)}
      >
        −
      </button>
      {/* Reserve width for the widest reading ("x.x rad/s") so both rows align. */}
      <span
        style={{
          width: 54,
          flex: '0 0 auto',
          display: 'inline-flex',
          justifyContent: 'center',
          alignItems: 'baseline',
          gap: 3,
        }}
      >
        <span
          data-testid="speed-value"
          style={{ color: accent, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        >
          {value.toFixed(1)}
        </span>
        <span style={{ color: MUTED, opacity: 0.6 }}>{unit}</span>
      </span>
      <button
        type="button"
        aria-label={`increase ${label}`}
        onClick={handleIncrease}
        disabled={increaseDisabled}
        style={btnStyle(increaseDisabled)}
      >
        +
      </button>
    </div>
  );
}
