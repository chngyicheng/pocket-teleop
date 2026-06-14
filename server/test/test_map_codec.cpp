#include <gtest/gtest.h>
#include "map_codec.hpp"
#include <vector>
#include <cmath>
#include <limits>

using namespace map_codec;

class MapCodecTest : public ::testing::Test {};

// encode_rle tests
TEST_F(MapCodecTest, EncodeRleEmpty) {
  std::vector<int8_t> cells;
  std::string result = encode_rle(cells);
  EXPECT_EQ(result, "");
}

TEST_F(MapCodecTest, EncodeRleSingleFree) {
  std::vector<int8_t> cells = {0};
  std::string result = encode_rle(cells);
  EXPECT_EQ(result, "f1");
}

TEST_F(MapCodecTest, EncodeRleMultipleFree) {
  std::vector<int8_t> cells = {0, 0, 0};
  std::string result = encode_rle(cells);
  EXPECT_EQ(result, "f3");
}

TEST_F(MapCodecTest, EncodeRleOccupied) {
  std::vector<int8_t> cells = {100, 100};
  std::string result = encode_rle(cells);
  EXPECT_EQ(result, "o2");
}

TEST_F(MapCodecTest, EncodeRleUnknown) {
  std::vector<int8_t> cells = {-1};
  std::string result = encode_rle(cells);
  EXPECT_EQ(result, "u1");
}

TEST_F(MapCodecTest, EncodeRleAlternating) {
  std::vector<int8_t> cells = {0, 100, 0, 100};
  std::string result = encode_rle(cells);
  EXPECT_EQ(result, "f1o1f1o1");
}

TEST_F(MapCodecTest, EncodeRleBoundary50) {
  // v < 50 is free, v >= 50 is occupied
  std::vector<int8_t> cells = {49, 50};
  std::string result = encode_rle(cells);
  EXPECT_EQ(result, "f1o1");
}

TEST_F(MapCodecTest, EncodeRleNegativeUnknown) {
  std::vector<int8_t> cells = {-1, -128, -50};
  std::string result = encode_rle(cells);
  EXPECT_EQ(result, "u3");
}

// crop_window tests
TEST_F(MapCodecTest, CropWindowCentered) {
  // 10x10 grid, all free (0)
  std::vector<int8_t> data(100, 0);
  double resolution = 0.2; // cells are 0.2m each
  // Map origin (bottom-left) at (0, 0)
  double origin_x = 0.0, origin_y = 0.0;
  // Center at (1.0, 1.0) map frame
  double center_x = 1.0, center_y = 1.0;
  // Window 4m = 20 cells
  double window_m = 4.0;

  CropResult result = crop_window(data, 10, 10, resolution, origin_x, origin_y, center_x, center_y, window_m);

  // Window cells = round(4.0 / 0.2) = 20
  // But grid is only 10x10, so result should be 10x10
  EXPECT_EQ(result.width, 10);
  EXPECT_EQ(result.height, 10);
  EXPECT_EQ(result.origin_x, 0.0);
  EXPECT_EQ(result.origin_y, 0.0);
  EXPECT_EQ(result.cells.size(), 100);
}

TEST_F(MapCodecTest, CropWindowSmallWindow) {
  // 10x10 grid, all free
  std::vector<int8_t> data(100, 0);
  double resolution = 0.2;
  double origin_x = 0.0, origin_y = 0.0;
  double center_x = 1.0, center_y = 1.0;
  double window_m = 2.0; // 10 cells

  CropResult result = crop_window(data, 10, 10, resolution, origin_x, origin_y, center_x, center_y, window_m);

  // Window cells = round(2.0 / 0.2) = 10
  // Expected 10x10 centered around (1.0, 1.0)
  EXPECT_EQ(result.width, 10);
  EXPECT_EQ(result.height, 10);
  EXPECT_EQ(result.cells.size(), 100);
}

TEST_F(MapCodecTest, CropWindowClamping) {
  // 10x10 grid
  std::vector<int8_t> data(100, 0);
  double resolution = 0.2;
  double origin_x = 0.0, origin_y = 0.0;
  // Center near corner
  double center_x = 0.2, center_y = 0.2;
  double window_m = 2.0; // 10 cells

  CropResult result = crop_window(data, 10, 10, resolution, origin_x, origin_y, center_x, center_y, window_m);

  // Should clamp to valid grid bounds
  EXPECT_GE(result.width, 1);
  EXPECT_GE(result.height, 1);
  EXPECT_EQ(result.cells.size(), static_cast<size_t>(result.width * result.height));
}

TEST_F(MapCodecTest, CropWindowOriginCalculation) {
  // 5x5 grid, 1.0m resolution (5m x 5m total)
  std::vector<int8_t> data(25, 0);
  double resolution = 1.0;
  double origin_x = 0.0, origin_y = 0.0;
  // Center at (2.0, 2.0) — middle of grid
  double center_x = 2.0, center_y = 2.0;
  double window_m = 2.0; // 2 cells

  CropResult result = crop_window(data, 5, 5, resolution, origin_x, origin_y, center_x, center_y, window_m);

  // Window is 2x2; centered at (2.0, 2.0) should be at col/row [1..2]
  // origin should be origin_x + col0 * resolution = 0 + 1 * 1.0 = 1.0
  EXPECT_EQ(result.width, 2);
  EXPECT_EQ(result.height, 2);
  EXPECT_DOUBLE_EQ(result.origin_x, 1.0);
  EXPECT_DOUBLE_EQ(result.origin_y, 1.0);
}

TEST_F(MapCodecTest, CropWindowLargerThanGrid) {
  // 5x5 grid
  std::vector<int8_t> data(25, 0);
  double resolution = 1.0;
  double origin_x = 0.0, origin_y = 0.0;
  double center_x = 2.0, center_y = 2.0;
  double window_m = 20.0; // 20 cells, but grid is only 5x5

  CropResult result = crop_window(data, 5, 5, resolution, origin_x, origin_y, center_x, center_y, window_m);

  // Should return entire grid
  EXPECT_EQ(result.width, 5);
  EXPECT_EQ(result.height, 5);
  EXPECT_EQ(result.cells.size(), 25);
}

TEST_F(MapCodecTest, CropWindowMixedOccupancy) {
  // 5x5 grid with mixed occupancy
  std::vector<int8_t> data(25, 0);
  data[0] = 100;  // occupied at (0,0)
  data[24] = -1;  // unknown at (4,4)

  double resolution = 1.0;
  double origin_x = 0.0, origin_y = 0.0;
  double center_x = 2.0, center_y = 2.0;
  double window_m = 10.0; // entire grid

  CropResult result = crop_window(data, 5, 5, resolution, origin_x, origin_y, center_x, center_y, window_m);

  EXPECT_EQ(result.cells[0], 100);
  EXPECT_EQ(result.cells[24], -1);
}

// decimate_scan tests
TEST_F(MapCodecTest, DecimateScamUnchangedUnderMaxPoints) {
  // 120 ranges should not change
  std::vector<float> ranges(120, 2.0f);
  DecimatedScan result = decimate_scan(ranges, 0.0, 0.01, 0.1, 10.0, 120);

  EXPECT_EQ(result.ranges.size(), 120);
  EXPECT_DOUBLE_EQ(result.angle_min, 0.0);
  EXPECT_DOUBLE_EQ(result.angle_increment, 0.01);
}

TEST_F(MapCodecTest, DecimateScam360ToStep3) {
  // 360 ranges with step ~3 => expect ~120 ranges
  std::vector<float> ranges(360, 2.0f);
  DecimatedScan result = decimate_scan(ranges, 0.0, 0.01, 0.1, 10.0, 120);

  EXPECT_LE(result.ranges.size(), 120);
  EXPECT_GE(result.ranges.size(), 110);  // approximately 120
  EXPECT_DOUBLE_EQ(result.angle_min, 0.0);
  // angle_increment should multiply by step
  EXPECT_GT(result.angle_increment, 0.01);
}

TEST_F(MapCodecTest, DecimateScamNaNToZero) {
  // NaN values should become 0.0
  std::vector<float> ranges = {2.0f, std::numeric_limits<float>::quiet_NaN(), 2.0f};
  DecimatedScan result = decimate_scan(ranges, 0.0, 0.01, 0.1, 10.0, 120);

  EXPECT_EQ(result.ranges.size(), 3);
  EXPECT_DOUBLE_EQ(result.ranges[0], 2.0);
  EXPECT_DOUBLE_EQ(result.ranges[1], 0.0);
  EXPECT_DOUBLE_EQ(result.ranges[2], 2.0);
}

TEST_F(MapCodecTest, DecimateScamInfToZero) {
  // inf values should become 0.0
  std::vector<float> ranges = {2.0f, std::numeric_limits<float>::infinity(), 2.0f};
  DecimatedScan result = decimate_scan(ranges, 0.0, 0.01, 0.1, 10.0, 120);

  EXPECT_EQ(result.ranges.size(), 3);
  EXPECT_DOUBLE_EQ(result.ranges[0], 2.0);
  EXPECT_DOUBLE_EQ(result.ranges[1], 0.0);
  EXPECT_DOUBLE_EQ(result.ranges[2], 2.0);
}

TEST_F(MapCodecTest, DecimateScamOutOfRangeToZero) {
  // Values outside [range_min, range_max] should become 0.0
  std::vector<float> ranges = {0.05f, 2.0f, 15.0f};  // 0.05 < range_min=0.1, 15 > range_max=10
  DecimatedScan result = decimate_scan(ranges, 0.0, 0.01, 0.1, 10.0, 120);

  EXPECT_EQ(result.ranges.size(), 3);
  EXPECT_DOUBLE_EQ(result.ranges[0], 0.0);  // out of range
  EXPECT_DOUBLE_EQ(result.ranges[1], 2.0);  // valid
  EXPECT_DOUBLE_EQ(result.ranges[2], 0.0);  // out of range
}

TEST_F(MapCodecTest, DecimateScamRound2Decimals) {
  // Values should round to 2 decimal places
  std::vector<float> ranges = {2.0f, 2.125f, 2.135f, 2.145f};
  DecimatedScan result = decimate_scan(ranges, 0.0, 0.01, 0.1, 10.0, 120);

  EXPECT_EQ(result.ranges.size(), 4);
  EXPECT_DOUBLE_EQ(result.ranges[0], 2.0);
  // Use tolerance for floating point comparison after rounding
  EXPECT_NEAR(result.ranges[1], 2.12, 0.015);
  EXPECT_NEAR(result.ranges[2], 2.13, 0.015);
  EXPECT_NEAR(result.ranges[3], 2.14, 0.015);
}

TEST_F(MapCodecTest, DecimateScamEmpty) {
  // Empty ranges
  std::vector<float> ranges;
  DecimatedScan result = decimate_scan(ranges, 0.0, 0.01, 0.1, 10.0, 120);

  EXPECT_EQ(result.ranges.size(), 0);
}

// build_scan_message tests
TEST_F(MapCodecTest, BuildScanMessageWithPoseMap) {
  // Has pose with "map" frame
  DecimatedScan scan{0.0, 0.01, {2.79, 1.74}};
  ScanPose pose{1.5, -0.5, 0.78, "map"};

  auto json = build_scan_message(scan, 3.5, pose);

  EXPECT_EQ(json["type"], "scan");
  EXPECT_DOUBLE_EQ(json["angle_min"], 0.0);
  EXPECT_DOUBLE_EQ(json["angle_increment"], 0.01);
  EXPECT_DOUBLE_EQ(json["range_max"], 3.5);
  EXPECT_EQ(json["ranges"].size(), 2);
  EXPECT_TRUE(json.contains("pose_x"));
  EXPECT_DOUBLE_EQ(json["pose_x"], 1.5);
  EXPECT_DOUBLE_EQ(json["pose_y"], -0.5);
  EXPECT_DOUBLE_EQ(json["pose_heading"], 0.78);
  EXPECT_EQ(json["pose_frame"], "map");
}

TEST_F(MapCodecTest, BuildScanMessageWithPoseOdom) {
  // Has pose with "odom" frame
  DecimatedScan scan{0.0, 0.01, {2.79}};
  ScanPose pose{0.25, 1.3, 1.57, "odom"};

  auto json = build_scan_message(scan, 5.0, pose);

  EXPECT_EQ(json["type"], "scan");
  EXPECT_TRUE(json.contains("pose_x"));
  EXPECT_EQ(json["pose_frame"], "odom");
  EXPECT_DOUBLE_EQ(json["pose_x"], 0.25);
  EXPECT_DOUBLE_EQ(json["pose_y"], 1.3);
}

TEST_F(MapCodecTest, BuildScanMessageNoPose) {
  // No pose (backward compatible)
  DecimatedScan scan{0.0, 0.01, {2.79, 1.74}};

  auto json = build_scan_message(scan, 3.5, std::nullopt);

  EXPECT_EQ(json["type"], "scan");
  EXPECT_DOUBLE_EQ(json["angle_min"], 0.0);
  EXPECT_DOUBLE_EQ(json["angle_increment"], 0.01);
  EXPECT_DOUBLE_EQ(json["range_max"], 3.5);
  EXPECT_EQ(json["ranges"].size(), 2);
  EXPECT_FALSE(json.contains("pose_x"));
  EXPECT_FALSE(json.contains("pose_y"));
  EXPECT_FALSE(json.contains("pose_heading"));
  EXPECT_FALSE(json.contains("pose_frame"));
}
