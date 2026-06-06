import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/connection.js', () => ({
  Connection: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
  })),
}));

import { TeleopClient } from '../src/teleop_client.js';

describe('TeleopClient estop button (gamepad LB, cross-source toggle)', () => {
  let client: TeleopClient;
  let capturedSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new TeleopClient();
    capturedSend = (client as any).connection.send;
    capturedSend.mockClear();
  });

  it('gamepad LB press (estop not engaged) sends type:estop', () => {
    // First press when not engaged
    (client as any).handleGamepadButton('estop');

    expect(capturedSend).toHaveBeenCalled();
    const call = capturedSend.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    const msg = JSON.parse(call);
    expect(msg.type).toBe('estop');
  });

  it('gamepad LB press (estop already engaged) sends type:estop_reset', () => {
    // Set engaged state
    (client as any).estopEngaged = true;
    capturedSend.mockClear();

    // Second press (now engaged)
    (client as any).handleGamepadButton('estop');

    expect(capturedSend).toHaveBeenCalled();
    const call = capturedSend.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    const msg = JSON.parse(call);
    expect(msg.type).toBe('estop_reset');
  });

  it('cross-source: gamepad resets touch-engaged estop', () => {
    // Touch path engages
    client.engageEstop();
    expect((client as any).estopEngaged).toBe(true);
    capturedSend.mockClear();

    // Gamepad LB press while engaged
    (client as any).handleGamepadButton('estop');

    expect(capturedSend).toHaveBeenCalled();
    const call = capturedSend.mock.calls[0]?.[0];
    const msg = JSON.parse(call);
    expect(msg.type).toBe('estop_reset');
    expect((client as any).estopEngaged).toBe(false);
  });

  it('cross-source: gamepad engages after touch reset', () => {
    // Touch reset
    (client as any).estopEngaged = false;
    capturedSend.mockClear();

    // Gamepad LB press
    (client as any).handleGamepadButton('estop');

    expect(capturedSend).toHaveBeenCalled();
    const call = capturedSend.mock.calls[0]?.[0];
    const msg = JSON.parse(call);
    expect(msg.type).toBe('estop');
    expect((client as any).estopEngaged).toBe(true);
  });

  it('onButton callback still fires after handleGamepadButton intercepts', () => {
    const onButtonSpy = vi.fn();
    const clientWithCallback = new TeleopClient({ onButton: onButtonSpy });

    (clientWithCallback as any).handleGamepadButton('estop');

    expect(onButtonSpy).toHaveBeenCalledWith('estop');
  });
});
