/**
 * input_shaping.ts — deadzone + cubic curve for gamepad/touch joystick input
 *
 * Deadzone eliminates stick creep near the center.
 * Cubic curve provides fine low-speed control while preserving full scale.
 */

const DEADZONE = 0.1;

/**
 * Shape a normalized input axis (−1..1) with deadzone + cubic curve.
 *
 * @param v Input value, typically from gamepad stick or touch joystick (−1..1)
 * @returns Shaped output (−1..1), with zero within deadzone, cubic curve applied above
 */
export function shapeAxis(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  const rescaled = (a - DEADZONE) / (1 - DEADZONE); // 0..1: removes discontinuity at boundary
  const curved = rescaled ** 3; // cubic: fine near zero, fast near full
  return Math.sign(v) * curved;
}
