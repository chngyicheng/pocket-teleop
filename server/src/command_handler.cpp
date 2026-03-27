#include "command_handler.hpp"
#include <nlohmann/json.hpp>

ParseResult CommandHandler::parse(const std::string& json_message) {
  try {
    auto j = nlohmann::json::parse(json_message);
    if (!j.contains("type") || !j["type"].is_string()) {
      return ParseError{"missing or invalid 'type' field"};
    }
    return ParseError{"not implemented"};
  } catch (const nlohmann::json::exception& e) {
    return ParseError{std::string("JSON parse error: ") + e.what()};
  }
}
