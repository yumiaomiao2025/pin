import type * as React from 'react';

function rangeControlStyle(value: number, minimum: number, maximum: number): React.CSSProperties {
  const progress = ((value - minimum) / (maximum - minimum)) * 100;
  return {
    '--range-progress': `${Math.min(100, Math.max(0, progress))}%`,
  } as React.CSSProperties;
}

type RangeControlProps = {
  'aria-label': string;
  disabled?: boolean;
  id?: string;
  maximum: number;
  minimum: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
};

export function RangeControl({
  maximum,
  minimum,
  onChange,
  step = 1,
  value,
  'aria-label': ariaLabel,
  disabled = false,
  id,
}: RangeControlProps) {
  return (
    <span
      className={disabled ? 'range-control-shell range-control-shell--disabled' : 'range-control-shell'}
      style={rangeControlStyle(value, minimum, maximum)}
    >
      <input
        aria-label={ariaLabel}
        className="range-control"
        disabled={disabled}
        id={id}
        max={maximum}
        min={minimum}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </span>
  );
}
