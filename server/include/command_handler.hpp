#pragma once
#include <string>
#include <variant>

struct TwistCommand {
  double linear_x;
  double linear_y;
  double angular_z;
};

struct PingCommand {};

struct EStopCommand {};

struct EStopResetCommand {};

struct ParseError {
  std::string message;
};

using ParseResult = std::variant<TwistCommand, PingCommand, EStopCommand, EStopResetCommand, ParseError>;

class CommandHandler {
public:
  ParseResult parse(const std::string& json_message);
};
