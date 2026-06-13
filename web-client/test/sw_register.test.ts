import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerServiceWorker } from '../src/sw_register';

describe('registerServiceWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not call register when isProduction is false', async () => {
    const mockRegister = vi.fn().mockResolvedValue({ scope: '/sw.js' });
    const mockNav = {
      serviceWorker: {
        register: mockRegister,
      },
    };

    await registerServiceWorker({
      isProduction: false,
      nav: mockNav as any,
    });

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('should call register with /sw.js when isProduction is true and nav has serviceWorker', async () => {
    const mockRegister = vi.fn().mockResolvedValue({ scope: '/sw.js' });
    const mockNav = {
      serviceWorker: {
        register: mockRegister,
      },
    };

    await registerServiceWorker({
      isProduction: true,
      nav: mockNav as any,
    });

    expect(mockRegister).toHaveBeenCalledWith('/sw.js');
  });

  it('should not throw when nav has no serviceWorker', async () => {
    const mockNav = {};

    await expect(
      registerServiceWorker({
        isProduction: true,
        nav: mockNav as any,
      })
    ).resolves.not.toThrow();
  });

  it('should not throw when register promise rejects', async () => {
    const mockRegister = vi.fn().mockRejectedValue(new Error('Registration failed'));
    const mockNav = {
      serviceWorker: {
        register: mockRegister,
      },
    };

    await expect(
      registerServiceWorker({
        isProduction: true,
        nav: mockNav as any,
      })
    ).resolves.not.toThrow();
  });

  it('should use navigator by default', async () => {
    // Create a mock navigator with serviceWorker
    const mockRegister = vi.fn().mockResolvedValue({ scope: '/sw.js' });
    const originalNav = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: {
        serviceWorker: {
          register: mockRegister,
        },
      },
      writable: true,
    });

    try {
      await registerServiceWorker({
        isProduction: true,
      });

      expect(mockRegister).toHaveBeenCalledWith('/sw.js');
    } finally {
      Object.defineProperty(global, 'navigator', {
        value: originalNav,
        writable: true,
      });
    }
  });
});
