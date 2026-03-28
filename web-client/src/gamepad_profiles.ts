export interface AxisConfig {
  axis: number;
  invert: boolean;
}

export interface AxisMapping {
  lx: AxisConfig;
  ly: AxisConfig;
  az: AxisConfig;
}

export type ButtonMapping = Record<string, number>;

export interface GamepadProfile {
  name: string;
  idPattern: RegExp;
  mapping: AxisMapping;
  buttons: ButtonMapping;
}

const STANDARD: AxisMapping = {
  lx: { axis: 1, invert: true },
  ly: { axis: 0, invert: true },
  az: { axis: 2, invert: true },
};

const BUILT_INS: GamepadProfile[] = [
  {
    name: 'Xbox',
    idPattern: /xbox|xinput/i,
    mapping: STANDARD,
    buttons: {},
  },
  {
    name: 'DualShock / DualSense',
    idPattern: /054c/i,
    mapping: { lx: { axis: 1, invert: true }, ly: { axis: 0, invert: true }, az: { axis: 3, invert: true } },
    buttons: {},
  },
  {
    // TODO: verify gamepad.id on hardware — connect G8+ to Pi5, open
    // http://localhost:8080 in a browser, open DevTools console, look for the
    // "Gamepad detected:" log line, and replace /gamesir/i with the actual id.
    name: 'GameSir G8+',
    idPattern: /gamesir/i,
    mapping: STANDARD,
    buttons: {},
  },
  {
    name: 'Generic',
    idPattern: /.*/,
    mapping: STANDARD,
    buttons: {},
  },
];

const STORAGE_KEY = 'pocket-teleop.gamepad-profiles';

type StoredProfile = { name: string; mapping: AxisMapping; buttons: ButtonMapping };

function loadRaw(): StoredProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredProfile[];
  } catch {
    return [];
  }
}

function copyProfile(p: GamepadProfile): GamepadProfile {
  return {
    name: p.name,
    idPattern: p.idPattern,
    mapping: {
      lx: { ...p.mapping.lx },
      ly: { ...p.mapping.ly },
      az: { ...p.mapping.az },
    },
    buttons: { ...p.buttons },
  };
}

export function matchProfile(gamepadId: string): GamepadProfile {
  for (const p of BUILT_INS) {
    if (p.idPattern.test(gamepadId)) {
      return copyProfile(p);
    }
  }
  return copyProfile(BUILT_INS[BUILT_INS.length - 1]!);
}

export function getAllProfiles(): GamepadProfile[] {
  const customs = loadCustomProfiles();
  return [...BUILT_INS.map(copyProfile), ...customs];
}

export function loadCustomProfiles(): GamepadProfile[] {
  return loadRaw().map((s) => ({
    name: s.name,
    idPattern: /.*/,
    mapping: s.mapping,
    buttons: s.buttons,
  }));
}

export function saveProfile(name: string, mapping: AxisMapping, buttons: ButtonMapping): void {
  try {
    const all = loadRaw();
    const idx = all.findIndex((s) => s.name === name);
    const entry: StoredProfile = { name, mapping, buttons };
    if (idx >= 0) {
      all[idx] = entry;
    } else {
      all.push(entry);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function deleteProfile(name: string): void {
  try {
    const all = loadRaw().filter((s) => s.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage unavailable — silently ignore
  }
}
