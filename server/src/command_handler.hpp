#pragma once
#include <string>
#include <variant>

struct TwistCommand {
  double linear_x;
  double linear_y;
  double angular_z;
};

struct PingCommand {};

struct ParseError {
  std::string message;
};

using ParseResult = std::variant<TwistCommand, PingCommand, ParseError>;

class CommandHandler {
public:
  ParseResult parse(const std::string& json_message);
};
