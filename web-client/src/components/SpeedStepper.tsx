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
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        fontFamily: MONO,
        fontSize: 10,
      }}
    >
      <span style={{ color: MUTED, opacity: 0.7, letterSpacing: '0.08em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
        <button
          type="button"
          aria-label={`decrease ${label}`}
          onClick={handleDecrease}
          disabled={decreaseDisabled}
          style={btnStyle(decreaseDisabled)}
        >
          −
        </button>
        <span
          data-testid="speed-value"
          style={{
            color: accent,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 26,
            textAlign: 'right',
          }}
        >
          {value.toFixed(1)}
        </span>
        <span style={{ color: MUTED, opacity: 0.6, minWidth: 28 }}>{unit}</span>
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
    </div>
  );
}
