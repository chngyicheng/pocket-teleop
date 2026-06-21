#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <optional>
#include <nlohmann/json.hpp>

namespace map_codec {

/**
 * Decimated laser scan result
 */
struct DecimatedScan {
  double angle_min;            // radians, adjusted for frame transform
  double angle_increment;      // radians, scaled by decimation step
  std::vector<double> ranges;  // distances in meters (2 decimal places)
};

/**
 * Robot pose at scan capture time
 */
struct ScanPose {
  double x;                    // position X (meters)
  double y;                    // position Y (meters)
  double heading;              // yaw angle (radians)
  std::string frame;           // "map" or "odom"
};

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

/**
 * Decimate a laser scan to at most max_points by step sampling.
 *
 * Filters invalid values (NaN, inf, out of range) to 0.0 and rounds to 2 decimals.
 *
 * @param ranges           Input range data (floats from LaserScan)
 * @param angle_min        Minimum angle (radians)
 * @param angle_increment  Angle step between consecutive ranges (radians)
 * @param range_min        Minimum valid range (meters)
 * @param range_max        Maximum valid range (meters)
 * @param max_points       Target output size; decimation step = ceil(n / max_points)
 * @return DecimatedScan with scaled angle_increment and filtered/rounded ranges
 */
DecimatedScan decimate_scan(
  const std::vector<float>& ranges,
  double angle_min,
  double angle_increment,
  double range_min,
  double range_max,
  int max_points
);

/**
 * Build the scan WebSocket message JSON. When pose is present, adds
 * pose_x/pose_y/pose_heading/pose_frame; when absent, omits them (backward compatible).
 *
 * @param scan           Decimated laser scan
 * @param range_max      Maximum range (meters)
 * @param pose           Optional capture pose; when nullopt, pose fields are omitted
 * @return JSON object ready to stringify and broadcast
 */
nlohmann::json build_scan_message(
  const DecimatedScan& scan,
  double range_max,
  const std::optional<ScanPose>& pose
);

/**
 * Decimate a path to at most max_points by step sampling.
 *
 * Preserves first and last points, evenly spaces intermediate points via step sampling.
 *
 * @param points       Input path points as (x, y) pairs
 * @param max_points   Target output size; decimation step = ceil(n / max_points)
 * @return Decimated path with size ≤ max_points (or empty if input empty)
 */
std::vector<std::pair<double, double>> decimate_path(
  const std::vector<std::pair<double, double>>& points,
  int max_points
);

} // namespace map_codec
