#include <gtest/gtest.h>
#include <thread>
#include <chrono>
#include <vector>
#include <string>

#include <websocketpp/config/asio_no_tls_client.hpp>
#include <websocketpp/client.hpp>
#include <nlohmann/json.hpp>

#include "teleop_server.hpp"

using WsClient = websocketpp::client<websocketpp::config::asio>;

class TeleopServerTest : public ::testing::Test {
protected:
  void SetUp() override {
    callback_count_ = 0;
    last_lx_ = last_ly_ = last_az_ = 0.0;
    server_ = std::make_unique<TeleopServer>(
      "testtoken", 19091, 300, "diff_drive",
      [this](double lx, double ly, double az) {
        ++callback_count_;
        last_lx_ = lx; last_ly_ = ly; last_az_ = az;
      });
    server_thread_ = std::thread([this]() { server_->start(); });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }

  void TearDown() override {
    server_->stop();
    if (server_thread_.joinable()) server_thread_.join();
  }

  std::unique_ptr<TeleopServer> server_;
  std::thread server_thread_;
  int callback_count_;
  double last_lx_, last_ly_, last_az_;
};

TEST_F(TeleopServerTest, ServerStartsAndStops) {
  // If we reach here, start/stop worked
  SUCCEED();
}
