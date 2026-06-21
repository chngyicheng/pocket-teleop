import fs from 'fs';

// Eight allowlist keys
const ALLOWLIST_KEYS = [
  'ROBOT_TYPE',
  'ROBOT_NAME',
  'ROBOT_NAMESPACE',
  'ROBOT_LENGTH_M',
  'ROBOT_WIDTH_M',
  'VIDEO_TOPIC',
  'VIDEO_TOPIC_TYPE',
  'NAV_ACTION',
];

// Parse env file content: skip empty lines and # comments, split on first =
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty and comment lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue; // Skip lines without =
    }
    const key = trimmed.substring(0, eqIndex);
    const value = trimmed.substring(eqIndex + 1);
    result[key] = value;
  }
  return result;
}

// Serialize values: output only allowlist keys in fixed order, end with newline
export function serializeEnvFile(values: Record<string, string>): string {
  const lines = ALLOWLIST_KEYS.map((key) => {
    const val = values[key] ?? '';
    return `${key}=${val}`;
  });
  return lines.join('\n') + '\n';
}

// Read robot config from file: return only allowlist keys, with defaults for missing
export function readRobotConfig(filePath: string): Record<string, string> {
  const defaults: Record<string, string> = {
    ROBOT_TYPE: 'diff_drive',
    ROBOT_NAME: '',
    ROBOT_NAMESPACE: '',
    ROBOT_LENGTH_M: '',
    ROBOT_WIDTH_M: '',
    VIDEO_TOPIC: '',
    VIDEO_TOPIC_TYPE: 'compressed',
    NAV_ACTION: '',
  };

  if (!fs.existsSync(filePath)) {
    return defaults;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseEnvFile(content);
    // Return only allowlist keys, filling missing with defaults
    const result: Record<string, string> = {};
    for (const key of ALLOWLIST_KEYS) {
      result[key] = parsed[key] ?? defaults[key];
    }
    return result;
  } catch {
    return defaults;
  }
}

// Validate input: check allowlist, types, ranges, formats
// Only validates keys that are provided in input; missing keys are not required
export function validateRobotConfig(
  input: Record<string, unknown>
): { ok: true; values: Record<string, string> } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};

  // Check for disallowed keys
  for (const key of Object.keys(input)) {
    if (!ALLOWLIST_KEYS.includes(key)) {
      errors[key] = 'Key not in allowlist';
    }
  }

  // Validate ROBOT_TYPE if provided
  if ('ROBOT_TYPE' in input) {
    const robotType = input['ROBOT_TYPE'];
    if (!['diff_drive', 'holonomic'].includes(String(robotType))) {
      errors['ROBOT_TYPE'] = 'Must be "diff_drive" or "holonomic"';
    } else {
      values['ROBOT_TYPE'] = String(robotType);
    }
  }

  // Validate ROBOT_NAME if provided: string, ≤ 64, no control chars, no newline/=, empty allowed
  if ('ROBOT_NAME' in input) {
    const robotName = input['ROBOT_NAME'];
    const nameStr = String(robotName);
    if (nameStr.length > 64) {
      errors['ROBOT_NAME'] = 'Must be ≤ 64 characters';
    } else if (nameStr.includes('\n') || nameStr.includes('=')) {
      errors['ROBOT_NAME'] = 'Cannot contain newline or =';
    } else if (nameStr.length > 0 && /[\x00-\x1F\x7F]/.test(nameStr)) {
      // Check for control chars (not if empty string)
      errors['ROBOT_NAME'] = 'Cannot contain control characters';
    } else {
      values['ROBOT_NAME'] = nameStr;
    }
  }

  // Validate ROBOT_NAMESPACE if provided: ROS name rules (alnum + underscore, no leading digit, no /), empty allowed
  if ('ROBOT_NAMESPACE' in input) {
    const robotNamespace = input['ROBOT_NAMESPACE'];
    const nsStr = String(robotNamespace);
    if (nsStr.length === 0) {
      values['ROBOT_NAMESPACE'] = '';
    } else if (nsStr.includes('/')) {
      errors['ROBOT_NAMESPACE'] = 'Cannot contain /';
    } else if (/^\d/.test(nsStr)) {
      errors['ROBOT_NAMESPACE'] = 'Cannot start with a digit';
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nsStr)) {
      errors['ROBOT_NAMESPACE'] = 'Must match ROS name rules (alnum + underscore)';
    } else {
      values['ROBOT_NAMESPACE'] = nsStr;
    }
  }

  // Validate ROBOT_LENGTH_M if provided: finite number, ≥ 0, ≤ 10, empty allowed
  if ('ROBOT_LENGTH_M' in input) {
    const robotLength = input['ROBOT_LENGTH_M'];
    const lenStr = String(robotLength);
    if (lenStr.length === 0) {
      values['ROBOT_LENGTH_M'] = '';
    } else {
      const num = parseFloat(lenStr);
      if (!isFinite(num)) {
        errors['ROBOT_LENGTH_M'] = 'Must be a finite number';
      } else if (num < 0) {
        errors['ROBOT_LENGTH_M'] = 'Must be ≥ 0';
      } else if (num > 10) {
        errors['ROBOT_LENGTH_M'] = 'Must be ≤ 10';
      } else {
        values['ROBOT_LENGTH_M'] = lenStr;
      }
    }
  }

  // Validate ROBOT_WIDTH_M if provided: finite number, ≥ 0, ≤ 10, empty allowed
  if ('ROBOT_WIDTH_M' in input) {
    const robotWidth = input['ROBOT_WIDTH_M'];
    const widStr = String(robotWidth);
    if (widStr.length === 0) {
      values['ROBOT_WIDTH_M'] = '';
    } else {
      const num = parseFloat(widStr);
      if (!isFinite(num)) {
        errors['ROBOT_WIDTH_M'] = 'Must be a finite number';
      } else if (num < 0) {
        errors['ROBOT_WIDTH_M'] = 'Must be ≥ 0';
      } else if (num > 10) {
        errors['ROBOT_WIDTH_M'] = 'Must be ≤ 10';
      } else {
        values['ROBOT_WIDTH_M'] = widStr;
      }
    }
  }

  // Validate VIDEO_TOPIC if provided: ROS topic path or empty, no newline/=
  if ('VIDEO_TOPIC' in input) {
    const videoTopic = input['VIDEO_TOPIC'];
    const topicStr = String(videoTopic);
    if (topicStr.length === 0) {
      values['VIDEO_TOPIC'] = '';
    } else if (topicStr.includes('\n') || topicStr.includes('=')) {
      errors['VIDEO_TOPIC'] = 'Cannot contain newline or =';
    } else if (!/^[a-zA-Z0-9_/~]/.test(topicStr)) {
      // Basic ROS topic validation: starts with allowed char
      errors['VIDEO_TOPIC'] = 'Invalid ROS topic path';
    } else {
      values['VIDEO_TOPIC'] = topicStr;
    }
  }

  // Validate VIDEO_TOPIC_TYPE if provided: compressed or raw
  if ('VIDEO_TOPIC_TYPE' in input) {
    const videoTopicType = input['VIDEO_TOPIC_TYPE'];
    if (!['compressed', 'raw'].includes(String(videoTopicType))) {
      errors['VIDEO_TOPIC_TYPE'] = 'Must be "compressed" or "raw"';
    } else {
      values['VIDEO_TOPIC_TYPE'] = String(videoTopicType);
    }
  }

  // Validate NAV_ACTION if provided: ROS topic/action path or empty, no newline/=
  if ('NAV_ACTION' in input) {
    const navAction = input['NAV_ACTION'];
    const actionStr = String(navAction);
    if (actionStr.length === 0) {
      values['NAV_ACTION'] = '';
    } else if (actionStr.includes('\n') || actionStr.includes('=')) {
      errors['NAV_ACTION'] = 'Cannot contain newline or =';
    } else if (!/^[a-zA-Z0-9_/~]/.test(actionStr)) {
      // Basic ROS action validation: starts with allowed char
      errors['NAV_ACTION'] = 'Invalid ROS action path';
    } else {
      values['NAV_ACTION'] = actionStr;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, values };
}

// Write robot config atomically: temp file + rename, only allowlist keys
export function writeRobotConfig(filePath: string, values: Record<string, string>): void {
  const tmpPath = filePath + '.tmp';
  const content = serializeEnvFile(values);
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}
