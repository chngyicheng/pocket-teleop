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

enum class DisconnectAction { Stop, Hold, ReturnHome, Continue };

DisconnectAction parse_disconnect_action(const std::string& s);
std::string disconnect_action_to_string(DisconnectAction a);

class TeleopServer {
public:
  using PublishCallback = std::function<void(double, double, double)>;

  TeleopServer(int port,
               int timeout_ms,
               const std::string& robot_type,
               const std::string& robot_name,
               const std::string& robot_namespace,
               double robot_length,
               double robot_width,
               DisconnectAction disconnect_action,
               int disconnect_param_ms,
               PublishCallback callback,
               std::function<void()> return_home_callback = nullptr);
  ~TeleopServer();

  void start();  // blocks until stop() is called
  void stop();

  // Send a message to the connected client (no-op if no client).
  // Returns true if a client was connected and the send succeeded.
  bool broadcast(const std::string& message);

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
  const double robot_length_;
  const double robot_width_;
  const DisconnectAction disconnect_action_;
  const int disconnect_param_ms_;
  PublishCallback publish_callback_;
  std::function<void()> return_home_callback_;

  WsServer ws_server_;
  CommandHandler command_handler_;

  std::mutex client_mutex_;
  ConnectionHdl active_client_;
  bool has_client_{false};

  std::atomic<bool> running_{false};
  std::atomic<bool> timed_out_{false};
  std::atomic<bool> estopped_{false};
  std::atomic<bool> holding_{false};
  std::atomic<int64_t> last_message_ms_{0};
  std::atomic<int64_t> holding_deadline_ms_{0};
  std::atomic<double> last_lx_{0.0};
  std::atomic<double> last_ly_{0.0};
  std::atomic<double> last_az_{0.0};
  std::thread watchdog_thread_;
};
