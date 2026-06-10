import { describe, it, expect } from 'vitest';
import { decodeRle, CELL_UNKNOWN, CELL_FREE, CELL_OCCUPIED } from '../src/map_codec.js';

describe('map_codec constants', () => {
  it('defines CELL_UNKNOWN as 0', () => {
    expect(CELL_UNKNOWN).toBe(0);
  });

  it('defines CELL_FREE as 1', () => {
    expect(CELL_FREE).toBe(1);
  });

  it('defines CELL_OCCUPIED as 2', () => {
    expect(CELL_OCCUPIED).toBe(2);
  });
});

describe('decodeRle', () => {
  it('decodes simple RLE: u3f2o1', () => {
    const result = decodeRle('u3f2o1', 6, 1);
    expect(result).toEqual(new Uint8Array([0, 0, 0, 1, 1, 2]));
  });

  it('decodes single cell u1', () => {
    const result = decodeRle('u1', 1, 1);
    expect(result).toEqual(new Uint8Array([0]));
  });

  it('decodes single cell f1', () => {
    const result = decodeRle('f1', 1, 1);
    expect(result).toEqual(new Uint8Array([1]));
  });

  it('decodes single cell o1', () => {
    const result = decodeRle('o1', 1, 1);
    expect(result).toEqual(new Uint8Array([2]));
  });

  it('decodes empty grid (0x0) from empty string', () => {
    const result = decodeRle('', 0, 0);
    expect(result).toEqual(new Uint8Array([]));
  });

  it('decodes row-major order correctly', () => {
    // 2x2 grid: row 0 = [u, f], row 1 = [o, u]
    const result = decodeRle('u1f1o1u1', 2, 2);
    expect(result).toEqual(new Uint8Array([0, 1, 2, 0]));
  });

  it('handles large run lengths', () => {
    const result = decodeRle('u480', 480, 1);
    expect(result).toHaveLength(480);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('decodes realistic map example', () => {
    // 10x10 = 100 cells
    const result = decodeRle('u50f30o20', 100, 1);
    expect(result).toHaveLength(100);
    expect(result.slice(0, 50).every((v) => v === 0)).toBe(true);
    expect(result.slice(50, 80).every((v) => v === 1)).toBe(true);
    expect(result.slice(80, 100).every((v) => v === 2)).toBe(true);
  });

  it('returns null for empty string when width*height > 0', () => {
    const result = decodeRle('', 10, 10);
    expect(result).toBeNull();
  });

  it('returns null when run total does not match width*height', () => {
    const result = decodeRle('u3f2o1', 6, 2); // width*height=12, but total=6
    expect(result).toBeNull();
  });

  it('returns null when run total exceeds width*height', () => {
    const result = decodeRle('u3f2o1u5', 6, 1); // total=11, but width*height=6
    expect(result).toBeNull();
  });

  it('returns null for invalid cell letter', () => {
    const result = decodeRle('u3x2o1', 6, 1); // 'x' is invalid
    expect(result).toBeNull();
  });

  it('returns null for invalid run length (non-numeric)', () => {
    const result = decodeRle('u3fab2o1', 6, 1); // 'ab' is not a valid number
    expect(result).toBeNull();
  });

  it('returns null for run length of zero', () => {
    const result = decodeRle('u0f2o1', 3, 1); // u0 is invalid
    expect(result).toBeNull();
  });

  it('returns null for negative run length', () => {
    const result = decodeRle('u-3f2o1', 6, 1); // negative not valid
    expect(result).toBeNull();
  });

  it('returns null for zero width (non-zero height)', () => {
    const result = decodeRle('u1f1', 0, 5);
    expect(result).toBeNull();
  });

  it('returns null for zero height (non-zero width)', () => {
    const result = decodeRle('u1f1', 5, 0);
    expect(result).toBeNull();
  });

  it('returns null for negative width', () => {
    const result = decodeRle('u1f1', -5, 1);
    expect(result).toBeNull();
  });

  it('returns null for negative height', () => {
    const result = decodeRle('u1f1', 5, -1);
    expect(result).toBeNull();
  });

  it('returns null for non-integer width', () => {
    const result = decodeRle('u1f1', 2.5, 1);
    expect(result).toBeNull();
  });

  it('returns null for non-integer height', () => {
    const result = decodeRle('u1f1', 2, 1.5);
    expect(result).toBeNull();
  });

  it('returns null for malformed token at end', () => {
    const result = decodeRle('u3f2o', 6, 1); // 'o' has no run length
    expect(result).toBeNull();
  });

  it('returns null for token with missing number', () => {
    const result = decodeRle('u3f2o1u', 7, 1); // trailing 'u' with no number
    expect(result).toBeNull();
  });
});
