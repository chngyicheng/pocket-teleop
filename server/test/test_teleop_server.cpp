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

// Helper: attempt a WebSocket connection and return the HTTP status code
// Returns 101 on successful upgrade, 401/503 on rejection
static int attempt_connect(const std::string& uri) {
  WsClient client;
  client.set_access_channels(websocketpp::log::alevel::none);
  client.set_error_channels(websocketpp::log::elevel::none);
  client.init_asio();

  int status_code = 0;
  client.set_fail_handler([&](websocketpp::connection_hdl hdl) {
    auto con = client.get_con_from_hdl(hdl);
    status_code = con->get_response_code();
  });
  client.set_open_handler([&](websocketpp::connection_hdl hdl) {
    status_code = 101;
    client.close(hdl, websocketpp::close::status::normal, "");
  });

  websocketpp::lib::error_code ec;
  auto con = client.get_connection(uri, ec);
  if (ec) return -1;
  client.connect(con);
  client.run();
  return status_code;
}

TEST_F(TeleopServerTest, ValidTokenAccepted) {
  int code = attempt_connect("ws://localhost:19091/teleop?token=testtoken");
  EXPECT_EQ(code, 101);
}

TEST_F(TeleopServerTest, InvalidTokenRejectedWith401) {
  int code = attempt_connect("ws://localhost:19091/teleop?token=wrongtoken");
  EXPECT_EQ(code, 401);
}

TEST_F(TeleopServerTest, MissingTokenRejectedWith401) {
  int code = attempt_connect("ws://localhost:19091/teleop");
  EXPECT_EQ(code, 401);
}
