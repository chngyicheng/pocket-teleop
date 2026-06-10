#include "map_codec.hpp"
#include <cmath>
#include <algorithm>

namespace map_codec {

std::string encode_rle(const std::vector<int8_t>& cells) {
  if (cells.empty()) {
    return "";
  }

  std::string result;
  int8_t current = cells[0];
  int count = 1;

  for (size_t i = 1; i < cells.size(); ++i) {
    // Classify current cell
    auto classify = [](int8_t v) -> char {
      if (v < 0) return 'u';
      if (v < 50) return 'f';
      return 'o';
    };

    int8_t cell = cells[i];
    if (classify(cell) == classify(current)) {
      ++count;
    } else {
      // Emit token for current run
      result += classify(current);
      result += std::to_string(count);
      current = cell;
      count = 1;
    }
  }

  // Emit final run
  auto classify = [](int8_t v) -> char {
    if (v < 0) return 'u';
    if (v < 50) return 'f';
    return 'o';
  };
  result += classify(current);
  result += std::to_string(count);

  return result;
}

CropResult crop_window(
  const std::vector<int8_t>& data,
  int width, int height,
  double resolution,
  double origin_x, double origin_y,
  double center_x, double center_y,
  double window_m
) {
  CropResult result{};

  // Calculate window size in cells
  int window_cells = std::max(1, static_cast<int>(std::round(window_m / resolution)));

  // Calculate grid coordinates for the window center
  double col_center = (center_x - origin_x) / resolution;
  double row_center = (center_y - origin_y) / resolution;

  // Calculate top-left corner of window (in grid coordinates)
  int col0 = static_cast<int>(std::floor(col_center - window_cells / 2.0));
  int row0 = static_cast<int>(std::floor(row_center - window_cells / 2.0));

  // Actual window dimensions (clamped to grid bounds)
  int w = std::min(window_cells, width);
  int h = std::min(window_cells, height);

  // Clamp col0 and row0 to valid range
  col0 = std::max(0, std::min(col0, width - w));
  row0 = std::max(0, std::min(row0, height - h));

  result.width = w;
  result.height = h;
  result.resolution = resolution;
  result.origin_x = origin_x + col0 * resolution;
  result.origin_y = origin_y + row0 * resolution;

  // Extract cells (row-major)
  result.cells.reserve(w * h);
  for (int r = row0; r < row0 + h; ++r) {
    for (int c = col0; c < col0 + w; ++c) {
      result.cells.push_back(data[r * width + c]);
    }
  }

  return result;
}

} // namespace map_codec
