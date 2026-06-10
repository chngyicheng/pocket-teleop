#pragma once

#include <string>
#include <vector>
#include <cstdint>

namespace map_codec {

/**
 * Trinary classification of occupancy:
 *   v < 0        → 'u' (unknown)
 *   0 <= v < 50  → 'f' (free)
 *   v >= 50      → 'o' (occupied)
 */

/**
 * Encode a vector of occupancy cells using run-length encoding.
 * Format: token stream like "u3f2o1" (letter + run length)
 * @param cells Vector of int8_t occupancy values
 * @return RLE-encoded string
 */
std::string encode_rle(const std::vector<int8_t>& cells);

/**
 * Result of cropping a map window
 */
struct CropResult {
  int width;                    // width of cropped window (cells)
  int height;                   // height of cropped window (cells)
  double resolution;            // cell resolution (meters per cell)
  double origin_x;              // map-frame origin of crop (meters)
  double origin_y;              // map-frame origin of crop (meters)
  std::vector<int8_t> cells;    // row-major cell data
};

/**
 * Crop a rectangular window around a center point from a map grid.
 *
 * @param data        Full map cell data (row-major)
 * @param width       Full map width (cells)
 * @param height      Full map height (cells)
 * @param resolution  Cell resolution (meters per cell)
 * @param origin_x    Map origin X (meters)
 * @param origin_y    Map origin Y (meters)
 * @param center_x    Window center X in map frame (meters)
 * @param center_y    Window center Y in map frame (meters)
 * @param window_m    Window size (meters, side length)
 * @return CropResult with cropped data and metadata
 */
CropResult crop_window(
  const std::vector<int8_t>& data,
  int width, int height,
  double resolution,
  double origin_x, double origin_y,
  double center_x, double center_y,
  double window_m
);

} // namespace map_codec
