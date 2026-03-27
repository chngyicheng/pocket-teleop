#pragma once
#include <functional>
#include <string>
#include <atomic>
#include <thread>
#include <mutex>
#include <chrono>

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include "command_handler.hpp"

using WsServer = websocketpp::server<websocketpp::config::asio>;
using ConnectionHdl = websocketpp::connection_hdl;

class TeleopServer {
public:
  using PublishCallback = std::function<void(double, double, double)>;

  TeleopServer(const std::string& token,
               int port,
               int timeout_ms,
               const std::string& robot_type,
               PublishCallback callback);
  ~TeleopServer();

  void start();  // blocks until stop() is called
  void stop();

private:
  bool on_validate(ConnectionHdl hdl);
  void on_open(ConnectionHdl hdl);
  void on_close(ConnectionHdl hdl);
  void on_message(ConnectionHdl hdl, WsServer::message_ptr msg);
  void watchdog_loop();
  void reset_watchdog();

  const std::string token_;
  const int port_;
  const int timeout_ms_;
  const std::string robot_type_;
  PublishCallback publish_callback_;

  WsServer ws_server_;
  CommandHandler command_handler_;

  std::mutex client_mutex_;
  ConnectionHdl active_client_;
  bool has_client_{false};

  std::atomic<bool> running_{false};
  std::atomic<bool> timed_out_{false};
  std::thread watchdog_thread_;
  std::atomic<int64_t> last_message_ms_{0};
};
