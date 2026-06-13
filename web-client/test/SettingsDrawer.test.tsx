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
    vi.clearAllMocks();
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
    // Slides in from the LEFT edge — hidden state is shifted left.
    expect(style?.transform).toBe('translateX(-100%)');
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<SettingsDrawer open={true} onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close settings');
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('slides in from the left edge (anchored left, border on the right)', () => {
    const { container } = render(<SettingsDrawer open={true} onClose={() => {}} />);
    const drawer = container.querySelector('[role="dialog"]') as HTMLElement;
    const styleAttr = drawer.getAttribute('style') ?? '';
    expect(styleAttr).toContain('left: 0');
    expect(styleAttr).toContain('border-right');
    expect(styleAttr).not.toContain('border-left');
  });

  it('renders a backdrop when open and calls onClose when it is clicked', async () => {
    const onClose = vi.fn();
    render(<SettingsDrawer open={true} onClose={onClose} />);
    const backdrop = screen.getByTestId('settings-backdrop');
    expect(backdrop).toBeTruthy();
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render a backdrop when closed', () => {
    render(<SettingsDrawer open={false} onClose={() => {}} />);
    expect(screen.queryByTestId('settings-backdrop')).toBeNull();
  });

  it('starts below the top bar by topOffset and fills the remaining height', () => {
    const { container } = render(
      <SettingsDrawer open={true} onClose={() => {}} topOffset={44} />
    );
    const drawer = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(drawer.style.width).toBe('320px');
    expect(drawer.style.top).toBe('44px');
    expect(drawer.style.height).toBe('calc(100dvh - 44px)');
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

  // ─── Robot Section Tests ──────────────────────────────────────────────────

  it('renders Robot section with form fields', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ROBOT_TYPE: 'diff_drive',
        ROBOT_NAME: 'MyBot',
        ROBOT_NAMESPACE: '/robot',
        ROBOT_LENGTH_M: '0.5',
        ROBOT_WIDTH_M: '0.4',
        VIDEO_TOPIC: '/camera/image',
        VIDEO_TOPIC_TYPE: 'compressed',
      }),
    }));
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    expect(screen.getByText('Robot')).toBeTruthy();
  });

  it('fetches initial robot config on mount', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ROBOT_TYPE: 'diff_drive',
        ROBOT_NAME: 'MyBot',
        ROBOT_NAMESPACE: '/robot',
        ROBOT_LENGTH_M: '0.5',
        ROBOT_WIDTH_M: '0.4',
        VIDEO_TOPIC: '/camera/image',
        VIDEO_TOPIC_TYPE: 'compressed',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);
    render(<SettingsDrawer open={true} onClose={() => {}} />);

    // Wait for fetch + state update
    await expect(
      screen.findByDisplayValue('MyBot')
    ).resolves.toBeTruthy();

    expect(mockFetch).toHaveBeenCalledWith('/auth/robot-config', {
      method: 'GET',
    });
  });

  it('renders Robot section and form is initially empty', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ROBOT_TYPE: '',
        ROBOT_NAME: '',
        ROBOT_NAMESPACE: '',
        ROBOT_LENGTH_M: '',
        ROBOT_WIDTH_M: '',
        VIDEO_TOPIC: '',
        VIDEO_TOPIC_TYPE: '',
      }),
    }));
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    expect(screen.getByText('Robot')).toBeTruthy();
    // Robot form should have select for type and topic-type
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(3); // gamepad + video + robot type (at minimum)
  });

  it('Robot Save sends a partial PUT with only identity + footprint fields', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ROBOT_TYPE: 'diff_drive',
          ROBOT_NAME: 'Bot1',
          ROBOT_NAMESPACE: '/r1',
          ROBOT_LENGTH_M: '0.5',
          ROBOT_WIDTH_M: '0.4',
          VIDEO_TOPIC: '/vid',
          VIDEO_TOPIC_TYPE: 'compressed',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ restartRequired: true }),
      });

    vi.stubGlobal('fetch', mockFetch);
    render(<SettingsDrawer open={true} onClose={() => {}} />);

    // Wait for initial GET
    await screen.findByDisplayValue('Bot1');

    // Clear and edit one field
    const nameInput = screen.getByDisplayValue('Bot1') as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Bot2');

    // Robot Save is the last Save button (Video's ROS2-camera Save comes first)
    const allBtns = screen.getAllByText('Save');
    const robotSaveBtn = allBtns[allBtns.length - 1];
    await userEvent.click(robotSaveBtn);

    const putCall = mockFetch.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(putCall[0]).toBe('/auth/robot-config');
    const body = JSON.parse(putCall[1].body);
    // Identity + footprint only — video keys belong to the Video section's Save.
    expect(body).toHaveProperty('ROBOT_TYPE');
    expect(body).toHaveProperty('ROBOT_NAME');
    expect(body).toHaveProperty('ROBOT_NAMESPACE');
    expect(body).toHaveProperty('ROBOT_LENGTH_M');
    expect(body).toHaveProperty('ROBOT_WIDTH_M');
    expect(body).not.toHaveProperty('VIDEO_TOPIC');
    expect(body).not.toHaveProperty('VIDEO_TOPIC_TYPE');
    expect(body.ROBOT_NAME).toBe('Bot2');
  });

  it('Video ROS2-camera Save sends a partial PUT with only the video topic fields', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ROBOT_TYPE: 'diff_drive',
          ROBOT_NAME: 'Bot1',
          ROBOT_NAMESPACE: '/r1',
          ROBOT_LENGTH_M: '0.5',
          ROBOT_WIDTH_M: '0.4',
          VIDEO_TOPIC: '/vid',
          VIDEO_TOPIC_TYPE: 'compressed',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ restartRequired: true }),
      });

    vi.stubGlobal('fetch', mockFetch);
    render(<SettingsDrawer open={true} onClose={() => {}} />);

    // Wait for initial GET to populate the topic field
    const topicInput = await screen.findByDisplayValue('/vid');
    await userEvent.clear(topicInput);
    await userEvent.type(topicInput, '/camera/new');

    // Video ROS2-camera Save is the first Save button (before the Robot Save)
    const videoSaveBtn = screen.getAllByText('Save')[0];
    await userEvent.click(videoSaveBtn);

    const putCall = mockFetch.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall[1].body);
    expect(body).toHaveProperty('VIDEO_TOPIC');
    expect(body).toHaveProperty('VIDEO_TOPIC_TYPE');
    expect(body).not.toHaveProperty('ROBOT_TYPE');
    expect(body).not.toHaveProperty('ROBOT_NAME');
    expect(body.VIDEO_TOPIC).toBe('/camera/new');
  });

  it('displays restart-required message on successful PUT', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ROBOT_TYPE: 'diff_drive',
          ROBOT_NAME: 'Bot',
          ROBOT_NAMESPACE: '/r',
          ROBOT_LENGTH_M: '0.5',
          ROBOT_WIDTH_M: '0.4',
          VIDEO_TOPIC: '/v',
          VIDEO_TOPIC_TYPE: 'compressed',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ restartRequired: true }),
      });

    vi.stubGlobal('fetch', mockFetch);
    render(<SettingsDrawer open={true} onClose={() => {}} />);

    await screen.findByDisplayValue('Bot');

    const allBtns = screen.getAllByText('Save');
    const robotSaveBtn = allBtns[allBtns.length - 1];
    await userEvent.click(robotSaveBtn);

    // Exact toast string — distinct from the static "ROS2 Camera" note, which
    // also mentions restarting ("Saved on the robot — restart the stack to apply.").
    await expect(
      screen.findByText('Saved — restart the stack to apply')
    ).resolves.toBeTruthy();
  });

  it('displays field errors from PUT 400 response', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ROBOT_TYPE: 'diff_drive',
          ROBOT_NAME: 'Bot',
          ROBOT_NAMESPACE: '/r',
          ROBOT_LENGTH_M: '0.5',
          ROBOT_WIDTH_M: '0.4',
          VIDEO_TOPIC: '/v',
          VIDEO_TOPIC_TYPE: 'compressed',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          errors: {
            ROBOT_NAMESPACE: 'Invalid namespace format',
          },
        }),
      });

    vi.stubGlobal('fetch', mockFetch);
    render(<SettingsDrawer open={true} onClose={() => {}} />);

    await screen.findByDisplayValue('Bot');

    const allBtns = screen.getAllByText('Save');
    const robotSaveBtn = allBtns[allBtns.length - 1];
    await userEvent.click(robotSaveBtn);

    await expect(
      screen.findByText('Invalid namespace format')
    ).resolves.toBeTruthy();
  });

  // ─── Layout Tests ─────────────────────────────────────────────────────────

  it('has three sections vertically stacked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ROBOT_TYPE: 'diff_drive',
        ROBOT_NAME: 'Bot',
        ROBOT_NAMESPACE: '/r',
        ROBOT_LENGTH_M: '0.5',
        ROBOT_WIDTH_M: '0.4',
        VIDEO_TOPIC: '/v',
        VIDEO_TOPIC_TYPE: 'compressed',
      }),
    }));
    render(<SettingsDrawer open={true} onClose={() => {}} />);
    await screen.findByDisplayValue('Bot'); // Wait for Robot section to load
    const headings = screen.getAllByRole('heading');
    const titles = headings.map((h) => h.textContent);
    expect(titles).toContain('Gamepad');
    expect(titles).toContain('Video');
    expect(titles).toContain('Robot');
  });

  it('has fixed width of 320px and full height', () => {
    const { container } = render(
      <SettingsDrawer open={true} onClose={() => {}} />
    );
    const drawer = container.querySelector('[role="dialog"]');
    const style = (drawer as HTMLElement)?.style;
    expect(style?.width).toBe('320px');
    expect(style?.height).toBe('100dvh');
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
    // Mission palette surface (#14171e) + text (#e6e9ef).
    expect(bg === '#14171e' || bg === 'rgb(20, 23, 30)').toBe(true);
    expect(fg === '#e6e9ef' || fg === 'rgb(230, 233, 239)').toBe(true);
  });

  it('has z-index above the collapsible rail tabs (z15)', () => {
    const { container } = render(
      <SettingsDrawer open={true} onClose={() => {}} />
    );
    const drawer = container.querySelector('[role="dialog"]');
    const style = (drawer as HTMLElement)?.style;
    const zIndex = parseInt(style?.zIndex || '0');
    expect(zIndex).toBeGreaterThan(15);
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
