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

  TeleopServer(int port,
               int timeout_ms,
               const std::string& robot_type,
               const std::string& robot_name,
               const std::string& robot_namespace,
               PublishCallback callback);
  ~TeleopServer();

  void start();  // blocks until stop() is called
  void stop();

  // Send a message to the connected client (no-op if no client).
  void broadcast(const std::string& message);

private:
  void on_open(ConnectionHdl hdl);
  void on_close(ConnectionHdl hdl);
  void on_message(ConnectionHdl hdl, WsServer::message_ptr msg);
  void watchdog_loop();
  void reset_watchdog();

  const int port_;
  const int timeout_ms_;
  const std::string robot_type_;
  const std::string robot_name_;
  const std::string robot_namespace_;
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
