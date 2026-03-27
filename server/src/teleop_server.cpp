#include "teleop_server.hpp"
#include <nlohmann/json.hpp>
#include <sstream>
#include <iostream>

using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;
using websocketpp::lib::bind;

TeleopServer::TeleopServer(const std::string& token,
                           int port,
                           int timeout_ms,
                           const std::string& robot_type,
                           PublishCallback callback)
  : token_(token),
    port_(port),
    timeout_ms_(timeout_ms),
    robot_type_(robot_type),
    publish_callback_(std::move(callback)) {
  ws_server_.set_access_channels(websocketpp::log::alevel::none);
  ws_server_.set_error_channels(websocketpp::log::elevel::none);
  ws_server_.init_asio();
  ws_server_.set_reuse_addr(true);

  ws_server_.set_validate_handler(bind(&TeleopServer::on_validate, this, _1));
  ws_server_.set_open_handler(bind(&TeleopServer::on_open, this, _1));
  ws_server_.set_close_handler(bind(&TeleopServer::on_close, this, _1));
  ws_server_.set_message_handler(bind(&TeleopServer::on_message, this, _1, _2));
}

TeleopServer::~TeleopServer() {
  stop();
}

void TeleopServer::start() {
  running_ = true;
  reset_watchdog();

  ws_server_.listen(port_);
  ws_server_.start_accept();

  watchdog_thread_ = std::thread(&TeleopServer::watchdog_loop, this);
  ws_server_.run();
}

void TeleopServer::stop() {
  if (!running_.exchange(false)) return;
  ws_server_.stop_listening();
  ws_server_.stop();
  if (watchdog_thread_.joinable()) watchdog_thread_.join();
}

void TeleopServer::reset_watchdog() {
  auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::steady_clock::now().time_since_epoch()).count();
  last_message_ms_.store(now);
  timed_out_ = false;
}

bool TeleopServer::on_validate(ConnectionHdl hdl) {
  auto con = ws_server_.get_con_from_hdl(hdl);
  const std::string resource = con->get_resource();

  // Extract token from query string (/teleop?token=xxx)
  std::string token;
  const auto q = resource.find('?');
  if (q != std::string::npos) {
    std::istringstream ss(resource.substr(q + 1));
    std::string pair;
    while (std::getline(ss, pair, '&')) {
      const auto eq = pair.find('=');
      if (eq != std::string::npos && pair.substr(0, eq) == "token") {
        token = pair.substr(eq + 1);
        break;
      }
    }
  }

  if (token != token_) {
    con->set_status(websocketpp::http::status_code::unauthorized);
    return false;
  }

  return true;
}

void TeleopServer::on_open(ConnectionHdl hdl) {
  std::lock_guard<std::mutex> lock(client_mutex_);

  if (has_client_) {
    nlohmann::json err = {{"type", "error"}, {"message", "already connected"}};
    ws_server_.send(hdl, err.dump(), websocketpp::frame::opcode::text);
    ws_server_.close(hdl, websocketpp::close::status::normal, "already connected");
    return;
  }

  active_client_ = hdl;
  has_client_ = true;
  reset_watchdog();

  nlohmann::json status = {
    {"type", "status"},
    {"connected", true},
    {"robot_type", robot_type_}
  };
  ws_server_.send(hdl, status.dump(), websocketpp::frame::opcode::text);
}

void TeleopServer::on_close(ConnectionHdl hdl) {
  std::lock_guard<std::mutex> lock(client_mutex_);
  (void)hdl;
  has_client_ = false;
}

void TeleopServer::on_message(ConnectionHdl hdl, WsServer::message_ptr msg) {
  auto result = command_handler_.parse(msg->get_payload());

  if (std::holds_alternative<TwistCommand>(result)) {
    reset_watchdog();
    auto cmd = std::get<TwistCommand>(result);
    publish_callback_(cmd.linear_x, cmd.linear_y, cmd.angular_z);

  } else if (std::holds_alternative<PingCommand>(result)) {
    reset_watchdog();
    nlohmann::json pong = {{"type", "pong"}};
    ws_server_.send(hdl, pong.dump(), websocketpp::frame::opcode::text);

  } else {
    auto err = std::get<ParseError>(result);
    nlohmann::json error = {{"type", "error"}, {"message", err.message}};
    ws_server_.send(hdl, error.dump(), websocketpp::frame::opcode::text);
  }
}

void TeleopServer::watchdog_loop() {
  while (running_) {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    bool client_connected;
    {
      std::lock_guard<std::mutex> lock(client_mutex_);
      client_connected = has_client_;
    }

    if (!client_connected || timed_out_) continue;

    const auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count();

    if (now_ms - last_message_ms_.load() > timeout_ms_) {
      timed_out_ = true;
      // Post to io_service so close() runs on the correct thread
      ws_server_.get_io_service().post([this]() {
        publish_callback_(0.0, 0.0, 0.0);
        std::lock_guard<std::mutex> lock(client_mutex_);
        if (has_client_) {
          websocketpp::lib::error_code ec;
          ws_server_.close(active_client_,
            websocketpp::close::status::normal, "timeout", ec);
          has_client_ = false;
        }
      });
    }
  }
}
