#include <gtest/gtest.h>
#include "map_codec.hpp"
#include <vector>
#include <cmath>

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
