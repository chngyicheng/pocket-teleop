export const CELL_UNKNOWN = 0;
export const CELL_FREE = 1;
export const CELL_OCCUPIED = 2;

export function decodeRle(cells: string, width: number, height: number): Uint8Array | null {
  // Validate width and height
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) {
    return null;
  }

  const expectedSize = width * height;

  // Empty string only valid for empty grid
  if (cells === '') {
    return expectedSize === 0 ? new Uint8Array([]) : null;
  }

  // Non-empty grid requires positive dimensions
  if (width <= 0 || height <= 0) {
    return null;
  }

  const result = new Uint8Array(expectedSize);
  let index = 0;
  let i = 0;

  while (i < cells.length) {
    const cell = cells[i];

    // Validate cell type
    if (cell !== 'u' && cell !== 'f' && cell !== 'o') {
      return null;
    }

    i++;

    // Parse run length
    let numStr = '';
    while (i < cells.length && /\d/.test(cells[i])) {
      numStr += cells[i];
      i++;
    }

    // Validate run length exists and is positive
    if (numStr === '' || numStr.includes('-')) {
      return null;
    }

    const runLength = parseInt(numStr, 10);
    if (runLength <= 0) {
      return null;
    }

    // Check if we would exceed the grid size
    if (index + runLength > expectedSize) {
      return null;
    }

    // Fill the cells
    const cellValue =
      cell === 'u' ? CELL_UNKNOWN : cell === 'f' ? CELL_FREE : CELL_OCCUPIED;
    for (let j = 0; j < runLength; j++) {
      result[index] = cellValue;
      index++;
    }
  }

  // Check if we filled exactly the expected size
  if (index !== expectedSize) {
    return null;
  }

  return result;
}
