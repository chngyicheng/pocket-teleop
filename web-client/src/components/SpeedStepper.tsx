import React from 'react';

export interface SpeedStepperProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  accent?: string;
}

export default function SpeedStepper({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
  accent,
}: SpeedStepperProps): JSX.Element {
  const handleDecrease = () => {
    const next = Math.max(min, Math.round((value - step) * 10) / 10);
    onChange(next);
  };

  const handleIncrease = () => {
    const next = Math.min(max, Math.round((value + step) * 10) / 10);
    onChange(next);
  };

  const isDecreaseDisabled = value <= min;
  const isIncreaseDisabled = value >= max;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.875rem',
        fontFamily: 'monospace',
      }}
    >
      <span style={{ flex: '0 0 auto', minWidth: '60px', color: '#9ca3af' }}>
        {label}
      </span>
      <button
        aria-label={`decrease ${label}`}
        onClick={handleDecrease}
        disabled={isDecreaseDisabled}
        style={{
          padding: '0.25rem 0.5rem',
          fontSize: '0.875rem',
          cursor: isDecreaseDisabled ? 'default' : 'pointer',
          opacity: isDecreaseDisabled ? 0.5 : 1,
        }}
      >
        −
      </button>
      <span
        data-testid="speed-value"
        style={{
          flex: '0 0 auto',
          minWidth: '50px',
          textAlign: 'center',
        }}
      >
        {value.toFixed(1)}
      </span>
      <span style={{ flex: '0 0 auto' }}>{unit}</span>
      <button
        aria-label={`increase ${label}`}
        onClick={handleIncrease}
        disabled={isIncreaseDisabled}
        style={{
          padding: '0.25rem 0.5rem',
          fontSize: '0.875rem',
          cursor: isIncreaseDisabled ? 'default' : 'pointer',
          opacity: isIncreaseDisabled ? 0.5 : 1,
        }}
      >
        +
      </button>
    </div>
  );
}
