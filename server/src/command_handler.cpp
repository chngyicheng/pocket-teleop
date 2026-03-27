#include "command_handler.hpp"
#include <nlohmann/json.hpp>

ParseResult CommandHandler::parse(const std::string& json_message) {
  try {
    auto j = nlohmann::json::parse(json_message);

    if (!j.contains("type") || !j["type"].is_string()) {
      return ParseError{"missing or invalid 'type' field"};
    }

    const std::string type = j["type"];

    if (type == "ping") {
      return PingCommand{};
    }

    if (type == "twist") {
      for (const char* field : {"linear_x", "linear_y", "angular_z"}) {
        if (!j.contains(field) || !j[field].is_number()) {
          return ParseError{std::string("missing or invalid field: ") + field};
        }
      }
      const double lx = j["linear_x"];
      const double ly = j["linear_y"];
      const double az = j["angular_z"];

      for (auto [name, val] : std::initializer_list<std::pair<const char*, double>>{
             {"linear_x", lx}, {"linear_y", ly}, {"angular_z", az}}) {
        if (val < -1.0 || val > 1.0) {
          return ParseError{std::string("field out of range [-1.0, 1.0]: ") + name};
        }
      }
      return TwistCommand{lx, ly, az};
    }

    return ParseError{"unknown type: " + type};

  } catch (const nlohmann::json::exception& e) {
    return ParseError{std::string("JSON parse error: ") + e.what()};
  }
}
