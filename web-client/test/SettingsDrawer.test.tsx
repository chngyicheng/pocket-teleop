import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsDrawer from '../src/components/SettingsDrawer.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const applyMock = vi.fn().mockResolvedValue('ok');
const validateMock = vi.fn().mockReturnValue(null);
const saveMock = vi.fn();
const loadSavedMock = vi.fn().mockReturnValue({
  mode: 'ros2' as const,
  streamUrl: '',
  mjpegUrl: '',
});

vi.mock('../src/video_source.js', () => ({
  VideoSourcePicker: vi.fn().mockImplementation(() => ({
    loadSaved: loadSavedMock,
    validate: validateMock,
    save: saveMock,
    apply: applyMock,
  })),
}));

vi.mock('../src/gamepad_profiles.js', () => ({
  getAllProfiles: () => [
    { name: 'Default Profile', mapping: {} as any, buttons: {} as any },
    { name: 'PS4', mapping: {} as any, buttons: {} as any },
    { name: 'Xbox', mapping: {} as any, buttons: {} as any },
  ],
  loadCustomProfiles: () => [],
}));

describe('SettingsDrawer', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── Open/Close Tests ─────────────────────────────────────────────────────

  it('renders visible when open=true', () => {
    const { container } = render(
      <SettingsDrawer open={true} onClose={() => {}} />
    );
    const drawer = container.querySelector('[role="dialog"]');
    expect(drawer).toBeTruthy();
    const style = (drawer as HTMLElement)?.style;
    expect(style?.transform).toBe('translateX(0)');
  });

  it('renders hidden when open=false', () => {
    const { container } = render(
      <SettingsDrawer open={false} onClose={() => {}} />
    );
    const drawer = container.querySelector('[role="dialog"]');
    expect(drawer).toBeTruthy();
    const style = (drawer as HTMLElement)?.style;
    expect(style?.transform).toBe('translateX(100%)');
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<SettingsDrawer open={true} onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close settings');
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ─── Gamepad Section Tests ────────────────────────────────────────────────

  it('renders Gamepad section with profile select', () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    expect(screen.getByText('Gamepad')).toBeTruthy();
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it('displays all profiles in gamepad select', () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    expect(screen.getByDisplayValue('Default Profile')).toBeTruthy();
    const options = screen.getAllByRole('option');
    const names = options.map((o) => o.textContent);
    expect(names).toContain('Default Profile');
    expect(names).toContain('PS4');
    expect(names).toContain('Xbox');
  });

  it('calls onGamepadProfileChange when profile is selected', async () => {
    const onGamepadProfileChange = vi.fn();
    render(
      <SettingsDrawer
        open={true}
        onClose={() => {}}
        onGamepadProfileChange={onGamepadProfileChange}
      />
    );
    const select = screen.getByDisplayValue('Default Profile') as HTMLSelectElement;
    await userEvent.selectOptions(select, 'PS4');
    expect(onGamepadProfileChange).toHaveBeenCalledWith('PS4');
  });

  it('sets gamepad select value to activeGamepadProfile prop', () => {
    render(
      <SettingsDrawer
        open={true}
        onClose={() => {}}
        activeGamepadProfile="Xbox"
      />
    );
    const select = screen.getByDisplayValue('Xbox') as HTMLSelectElement;
    expect(select.value).toBe('Xbox');
  });

  // ─── Video Section Tests ──────────────────────────────────────────────────

  it('renders Video section with mode select and URL input', () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    expect(screen.getByText('Video')).toBeTruthy();
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('displays all video source modes in select', () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    const selects = screen.getAllByRole('combobox');
    const modeSelect = selects.find((s) => {
      const options = s.querySelectorAll('option');
      return (
        options.length >= 6 &&
        Array.from(options).some((o) => o.textContent === 'ROS2')
      );
    });
    expect(modeSelect).toBeTruthy();
    if (modeSelect) {
      const options = modeSelect.querySelectorAll('option');
      const texts = Array.from(options).map((o) => o.textContent);
      expect(texts).toContain('ROS2');
      expect(texts).toContain('RTSP');
      expect(texts).toContain('UDP');
      expect(texts).toContain('SRT');
      expect(texts).toContain('MJPEG');
      expect(texts).toContain('Disabled');
    }
  });

  it('changes mode select value on user input', async () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    const selects = screen.getAllByRole('combobox');
    const modeSelect = selects.find((s) => {
      const options = s.querySelectorAll('option');
      return options.length >= 6;
    }) as HTMLSelectElement;
    await userEvent.selectOptions(modeSelect, 'rtsp');
    expect(modeSelect.value).toBe('rtsp');
  });

  it('calls picker.apply with mode and URL on Apply button click', async () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    const urlInput = inputs.find((i) => (i as HTMLInputElement).placeholder?.includes('http'))
      || inputs.find((i) => (i as HTMLInputElement).type === 'text');

    if (urlInput) {
      await userEvent.clear(urlInput);
      await userEvent.type(urlInput, 'rtsp://example.com/stream');
    }

    const selects = screen.getAllByRole('combobox');
    const modeSelect = selects.find((s) => {
      const options = s.querySelectorAll('option');
      return options.length >= 6;
    }) as HTMLSelectElement;
    await userEvent.selectOptions(modeSelect, 'rtsp');

    const applyBtn = screen.getByText('Apply');
    await userEvent.click(applyBtn);

    expect(applyMock).toHaveBeenCalledWith('rtsp', 'rtsp://example.com/stream');
  });

  it('displays success message when apply resolves with "ok"', async () => {
    applyMock.mockResolvedValueOnce('ok');
    render(<SettingsDrawer open={true} onClose={() => {}} />);

    const applyBtn = screen.getByText('Apply');
    await userEvent.click(applyBtn);

    await expect(
      screen.findByText((content) => content.includes('Applied') || content.includes('ok'))
    ).resolves.toBeTruthy();
  });

  it('displays error message when apply resolves with validation error', async () => {
    applyMock.mockResolvedValueOnce('validation-error:RTSP URL is required.');
    render(<SettingsDrawer open={true} onClose={() => {}} />);

    const applyBtn = screen.getByText('Apply');
    await userEvent.click(applyBtn);

    await expect(
      screen.findByText((content) => content.includes('RTSP URL is required'))
    ).resolves.toBeTruthy();
  });

  // ─── Connection Section Tests ─────────────────────────────────────────────

  it('renders Connection section with namespace input', () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    expect(screen.getByText('Connection')).toBeTruthy();
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('loads initial namespace from localStorage', () => {
    store['pocket-teleop.robot-namespace'] = '/my_robot';
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const nsInput = inputs.find((i) => i.value === '/my_robot');
    expect(nsInput).toBeTruthy();
  });

  it('saves namespace to localStorage on Save button click', async () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    const nsInput = inputs[inputs.length - 1];

    await userEvent.clear(nsInput);
    await userEvent.type(nsInput, '/robot_ns');

    const saveBtn = screen.getByText(/Save/);
    await userEvent.click(saveBtn);

    expect(store['pocket-teleop.robot-namespace']).toBe('/robot_ns');
  });

  it('displays saved confirmation after namespace save', async () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    const nsInput = inputs[inputs.length - 1];

    await userEvent.clear(nsInput);
    await userEvent.type(nsInput, '/test');

    const saveBtn = screen.getByText(/Save/);
    await userEvent.click(saveBtn);

    expect(screen.getByText('Saved')).toBeTruthy();
  });

  // ─── Layout Tests ─────────────────────────────────────────────────────────

  it('has three sections vertically stacked', () => {
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    const headings = screen.getAllByRole('heading');
    const titles = headings.map((h) => h.textContent);
    expect(titles).toContain('Gamepad');
    expect(titles).toContain('Video');
    expect(titles).toContain('Connection');
  });

  it('has fixed width of 320px and full height', () => {
    const { container } = render(
      <SettingsDrawer open={true} onClose={() => {}} />
    );
    const drawer = container.querySelector('[role="dialog"]');
    const style = (drawer as HTMLElement)?.style;
    expect(style?.width).toBe('320px');
    expect(style?.height).toBe('100vh');
  });

  it('has dark palette colors', () => {
    const { container } = render(
      <SettingsDrawer open={true} onClose={() => {}} />
    );
    const drawer = container.querySelector('[role="dialog"]');
    const style = (drawer as HTMLElement)?.style;
    // CSSStyleDeclaration normalizes hex to rgb() in most engines incl. jsdom.
    // Accept either serialization to stay robust.
    const bg = style?.backgroundColor ?? '';
    const fg = style?.color ?? '';
    expect(bg === '#0b0d12' || bg === 'rgb(11, 13, 18)').toBe(true);
    expect(fg === '#e6e9ef' || fg === 'rgb(230, 233, 239)').toBe(true);
  });

  it('has z-index <= 9', () => {
    const { container } = render(
      <SettingsDrawer open={true} onClose={() => {}} />
    );
    const drawer = container.querySelector('[role="dialog"]');
    const style = (drawer as HTMLElement)?.style;
    const zIndex = parseInt(style?.zIndex || '0');
    expect(zIndex).toBeLessThanOrEqual(9);
  });

  it('transitions smoothly on open/close', () => {
    const { container, rerender } = render(
      <SettingsDrawer open={true} onClose={() => {}} />
    );
    const drawer = container.querySelector('[role="dialog"]');
    const style = (drawer as HTMLElement)?.style;
    expect(style?.transition).toContain('0.2s');
    expect(style?.transition).toContain('ease');
  });
});
