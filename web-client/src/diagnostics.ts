/**
 * diagnostics.ts — pure model logic for system diagnostics
 *
 * Framework-free, no React. Computes diagnostic rows from connection states
 * and telemetry ages.
 */

export type DiagLevel = 'ok' | 'warn' | 'error' | 'none';

export interface DiagRow {
  name: string;
  level: DiagLevel;
  detail: string;
}

export interface DiagnosticsInput {
  wsState: 'live' | 'reconnecting' | 'disconnected';
  videoState: 'connecting' | 'live' | 'retrying' | 'error';
  ages: {
    odom: number | null;
    pose: number | null;
    scan: number | null;
    map: number | null;
    battery: number | null;
  };
}

/**
 * Format age (ms) as "X.X s ago" (one decimal place).
 * Returns "no data" if age is null.
 */
function formatAge(ageMs: number | null): string {
  if (ageMs === null) return 'no data';
  const seconds = (ageMs / 1000).toFixed(1);
  return `${seconds} s ago`;
}

/**
 * Determine level for telemetry age (odom/pose/scan/map):
 * <2000 ms: ok
 * <5000 ms: warn
 * >=5000 ms: error
 * null: none
 */
function telemetryLevel(ageMs: number | null): DiagLevel {
  if (ageMs === null) return 'none';
  if (ageMs < 2000) return 'ok';
  if (ageMs < 5000) return 'warn';
  return 'error';
}

/**
 * Determine level for battery age (separate thresholds):
 * <3000 ms: ok
 * <10000 ms: warn
 * >=10000 ms: error
 * null: none
 */
function batteryLevel(ageMs: number | null): DiagLevel {
  if (ageMs === null) return 'none';
  if (ageMs < 3000) return 'ok';
  if (ageMs < 10000) return 'warn';
  return 'error';
}

/**
 * Map WebSocket state to diagnostic level.
 */
function wsStateLevel(state: 'live' | 'reconnecting' | 'disconnected'): DiagLevel {
  switch (state) {
    case 'live':
      return 'ok';
    case 'reconnecting':
      return 'warn';
    case 'disconnected':
      return 'error';
  }
}

/**
 * Compute diagnostic rows from connection states and telemetry ages.
 * Returns 7 rows in fixed order: WS, Video, Odom, Pose, Scan, Map, Battery.
 */
export function computeDiagnostics(input: DiagnosticsInput): DiagRow[] {
  return [
    {
      name: 'WebSocket',
      level: wsStateLevel(input.wsState),
      detail: input.wsState === 'live' ? 'Connected' : input.wsState,
    },
    {
      name: 'Video',
      level:
        input.videoState === 'live'
          ? 'ok'
          : input.videoState === 'connecting' || input.videoState === 'retrying'
            ? 'warn'
            : 'error',
      detail: input.videoState,
    },
    {
      name: 'Odometry',
      level: telemetryLevel(input.ages.odom),
      detail: formatAge(input.ages.odom),
    },
    {
      name: 'Pose',
      level: telemetryLevel(input.ages.pose),
      detail: formatAge(input.ages.pose),
    },
    {
      name: 'Scan',
      level: telemetryLevel(input.ages.scan),
      detail: formatAge(input.ages.scan),
    },
    {
      name: 'Map',
      level: telemetryLevel(input.ages.map),
      detail: formatAge(input.ages.map),
    },
    {
      name: 'Battery',
      level: batteryLevel(input.ages.battery),
      detail: formatAge(input.ages.battery),
    },
  ];
}
