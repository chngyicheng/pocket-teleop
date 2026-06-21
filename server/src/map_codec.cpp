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

DecimatedScan decimate_scan(
  const std::vector<float>& ranges,
  double angle_min,
  double angle_increment,
  double range_min,
  double range_max,
  int max_points
) {
  DecimatedScan result{};
  result.angle_min = angle_min;

  if (ranges.empty()) {
    result.angle_increment = angle_increment;
    return result;
  }

  int n = static_cast<int>(ranges.size());
  int step = std::max(1, static_cast<int>(std::ceil(static_cast<double>(n) / max_points)));

  result.angle_increment = angle_increment * step;

  result.ranges.reserve((n + step - 1) / step);
  for (int i = 0; i < n; i += step) {
    float val = ranges[i];
    double out = 0.0;

    // Check validity: not NaN, not inf, in range [range_min, range_max]
    if (std::isfinite(val) && val >= range_min && val <= range_max) {
      out = val;
    }

    // Round to 2 decimal places
    out = std::round(out * 100.0) / 100.0;
    result.ranges.push_back(out);
  }

  return result;
}

nlohmann::json build_scan_message(
  const DecimatedScan& scan,
  double range_max,
  const std::optional<ScanPose>& pose
) {
  nlohmann::json msg = {
    {"type", "scan"},
    {"angle_min", scan.angle_min},
    {"angle_increment", scan.angle_increment},
    {"range_max", range_max},
    {"ranges", scan.ranges}
  };

  if (pose.has_value()) {
    msg["pose_x"] = pose->x;
    msg["pose_y"] = pose->y;
    msg["pose_heading"] = pose->heading;
    msg["pose_frame"] = pose->frame;
  }

  return msg;
}

std::vector<std::pair<double, double>> decimate_path(
  const std::vector<std::pair<double, double>>& points,
  int max_points
) {
  if (points.empty()) {
    return {};
  }

  if (static_cast<int>(points.size()) <= max_points) {
    return points;
  }

  std::vector<std::pair<double, double>> result;
  result.push_back(points.front());

  int n = static_cast<int>(points.size());
  int step = std::max(1, static_cast<int>(std::ceil(static_cast<double>(n) / max_points)));

  for (int i = step; i < n - 1; i += step) {
    result.push_back(points[i]);
  }

  result.push_back(points.back());

  return result;
}

} // namespace map_codec
