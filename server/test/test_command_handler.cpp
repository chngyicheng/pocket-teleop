#include <gtest/gtest.h>
#include <cmath>
#include <limits>
#include <nlohmann/json.hpp>

#include "command_handler.hpp"

class CommandHandlerTest : public ::testing::Test {
protected:
  CommandHandler handler_;
};

// === Valid Twist Tests ===

TEST_F(CommandHandlerTest, ValidTwistZeroValues) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":0.0,"linear_y":0.0,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<TwistCommand>(result));
  auto cmd = std::get<TwistCommand>(result);
  EXPECT_DOUBLE_EQ(cmd.linear_x, 0.0);
  EXPECT_DOUBLE_EQ(cmd.linear_y, 0.0);
  EXPECT_DOUBLE_EQ(cmd.angular_z, 0.0);
}

TEST_F(CommandHandlerTest, ValidTwistPositiveBoundary) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":1.0,"linear_y":1.0,"angular_z":1.0})");
  ASSERT_TRUE(std::holds_alternative<TwistCommand>(result));
  auto cmd = std::get<TwistCommand>(result);
  EXPECT_DOUBLE_EQ(cmd.linear_x, 1.0);
  EXPECT_DOUBLE_EQ(cmd.linear_y, 1.0);
  EXPECT_DOUBLE_EQ(cmd.angular_z, 1.0);
}

TEST_F(CommandHandlerTest, ValidTwistNegativeBoundary) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":-1.0,"linear_y":-1.0,"angular_z":-1.0})");
  ASSERT_TRUE(std::holds_alternative<TwistCommand>(result));
  auto cmd = std::get<TwistCommand>(result);
  EXPECT_DOUBLE_EQ(cmd.linear_x, -1.0);
  EXPECT_DOUBLE_EQ(cmd.linear_y, -1.0);
  EXPECT_DOUBLE_EQ(cmd.angular_z, -1.0);
}

TEST_F(CommandHandlerTest, ValidTwistMixedValues) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":0.5,"linear_y":-0.3,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<TwistCommand>(result));
  auto cmd = std::get<TwistCommand>(result);
  EXPECT_DOUBLE_EQ(cmd.linear_x, 0.5);
  EXPECT_DOUBLE_EQ(cmd.linear_y, -0.3);
  EXPECT_DOUBLE_EQ(cmd.angular_z, 0.0);
}

// === Out of Range Tests ===

TEST_F(CommandHandlerTest, TwistLinearXTooHigh) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":1.01,"linear_y":0.0,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("out of range") != std::string::npos);
  EXPECT_TRUE(err.message.find("linear_x") != std::string::npos);
}

TEST_F(CommandHandlerTest, TwistLinearYTooLow) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":0.0,"linear_y":-1.01,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("out of range") != std::string::npos);
  EXPECT_TRUE(err.message.find("linear_y") != std::string::npos);
}

TEST_F(CommandHandlerTest, TwistAngularZTooHigh) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":0.0,"linear_y":0.0,"angular_z":1.5})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("out of range") != std::string::npos);
  EXPECT_TRUE(err.message.find("angular_z") != std::string::npos);
}

// === NaN and Infinity Tests ===

TEST_F(CommandHandlerTest, TwistNaNLinearX) {
  // NaN is not valid JSON; nlohmann::json::parse rejects with a parse error.
  // Either path (parse error or non-finite) is acceptable rejection.
  auto result = handler_.parse(R"({"type":"twist","linear_x":NaN,"linear_y":0.0,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, TwistNaNLinearY) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":0.0,"linear_y":null,"angular_z":0.0})");
  // null -> not a number, caught by is_number check
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, TwistInfinityAngularZ) {
  // Infinity is not valid JSON; nlohmann serialises it to null on dump,
  // and the is_number check rejects null before isfinite is consulted.
  // Defensive isfinite check in command_handler stays as belt-and-suspenders.
  auto j = nlohmann::json::parse(R"({"type":"twist","linear_x":0.0,"linear_y":0.0})");
  j["angular_z"] = std::numeric_limits<double>::infinity();
  auto result = handler_.parse(j.dump());
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

// === Missing Field Tests ===

TEST_F(CommandHandlerTest, TwistMissingLinearX) {
  auto result = handler_.parse(R"({"type":"twist","linear_y":0.0,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing") != std::string::npos);
  EXPECT_TRUE(err.message.find("linear_x") != std::string::npos);
}

TEST_F(CommandHandlerTest, TwistMissingLinearY) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":0.0,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing") != std::string::npos);
}

TEST_F(CommandHandlerTest, TwistMissingAngularZ) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":0.0,"linear_y":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing") != std::string::npos);
}

// === Wrong Type Tests ===

TEST_F(CommandHandlerTest, TwistLinearXWrongType) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":"0.5","linear_y":0.0,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing or invalid") != std::string::npos);
}

TEST_F(CommandHandlerTest, TwistLinearYWrongType) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":0.0,"linear_y":true,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, TwistAngularZWrongType) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":0.0,"linear_y":0.0,"angular_z":[1,2,3]})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

// === Ping Tests ===

TEST_F(CommandHandlerTest, ValidPing) {
  auto result = handler_.parse(R"({"type":"ping"})");
  ASSERT_TRUE(std::holds_alternative<PingCommand>(result));
}

TEST_F(CommandHandlerTest, PingIgnoresExtraFields) {
  auto result = handler_.parse(R"({"type":"ping","extra":"data"})");
  ASSERT_TRUE(std::holds_alternative<PingCommand>(result));
}

// === Unknown Type Tests ===

TEST_F(CommandHandlerTest, UnknownType) {
  auto result = handler_.parse(R"({"type":"unknown_command"})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("unknown type") != std::string::npos);
}

TEST_F(CommandHandlerTest, UnknownTypeWithNumericValue) {
  auto result = handler_.parse(R"({"type":"foobar","value":42})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

// === Missing Type Tests ===

TEST_F(CommandHandlerTest, MissingType) {
  auto result = handler_.parse(R"({"linear_x":0.0,"linear_y":0.0,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing or invalid 'type'") != std::string::npos);
}

TEST_F(CommandHandlerTest, TypeIsNull) {
  auto result = handler_.parse(R"({"type":null})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing or invalid 'type'") != std::string::npos);
}

TEST_F(CommandHandlerTest, TypeIsNumber) {
  auto result = handler_.parse(R"({"type":123})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing or invalid 'type'") != std::string::npos);
}

// === Malformed JSON Tests ===

TEST_F(CommandHandlerTest, MalformedJSON) {
  auto result = handler_.parse("{not valid json}");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("JSON parse error") != std::string::npos);
}

TEST_F(CommandHandlerTest, EmptyString) {
  auto result = handler_.parse("");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("JSON parse error") != std::string::npos);
}

TEST_F(CommandHandlerTest, DeeplyNestedObject) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":{"nested":1},"linear_y":0.0,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing or invalid") != std::string::npos);
}

TEST_F(CommandHandlerTest, ArrayAsFieldValue) {
  auto result = handler_.parse(R"({"type":"twist","linear_x":[0.5],"linear_y":0.0,"angular_z":0.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, TwistWithoutOtherFields) {
  auto result = handler_.parse(R"({"type":"twist"})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

// === Nav Goal Tests ===

TEST_F(CommandHandlerTest, ValidNavGoal) {
  auto result = handler_.parse(R"({"type":"nav_goal","x":1.5,"y":-2.0,"heading":0.785})");
  ASSERT_TRUE(std::holds_alternative<NavGoalCommand>(result));
  auto cmd = std::get<NavGoalCommand>(result);
  EXPECT_DOUBLE_EQ(cmd.x, 1.5);
  EXPECT_DOUBLE_EQ(cmd.y, -2.0);
  EXPECT_DOUBLE_EQ(cmd.heading, 0.785);
}

TEST_F(CommandHandlerTest, ValidNavGoalZeros) {
  auto result = handler_.parse(R"({"type":"nav_goal","x":0.0,"y":0.0,"heading":0.0})");
  ASSERT_TRUE(std::holds_alternative<NavGoalCommand>(result));
  auto cmd = std::get<NavGoalCommand>(result);
  EXPECT_DOUBLE_EQ(cmd.x, 0.0);
  EXPECT_DOUBLE_EQ(cmd.y, 0.0);
  EXPECT_DOUBLE_EQ(cmd.heading, 0.0);
}

TEST_F(CommandHandlerTest, NavGoalMissingX) {
  auto result = handler_.parse(R"({"type":"nav_goal","y":-2.0,"heading":0.785})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing") != std::string::npos);
  EXPECT_TRUE(err.message.find("x") != std::string::npos);
}

TEST_F(CommandHandlerTest, NavGoalMissingY) {
  auto result = handler_.parse(R"({"type":"nav_goal","x":1.5,"heading":0.785})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing") != std::string::npos);
}

TEST_F(CommandHandlerTest, NavGoalMissingHeading) {
  auto result = handler_.parse(R"({"type":"nav_goal","x":1.5,"y":-2.0})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
  auto err = std::get<ParseError>(result);
  EXPECT_TRUE(err.message.find("missing") != std::string::npos);
}

// NaN/Infinity are not valid JSON (nlohmann rejects on parse; a dumped C++ inf
// becomes null, caught by the is_number check). Either path is acceptable
// rejection; the isfinite guard in parse stays as belt-and-suspenders.
TEST_F(CommandHandlerTest, NavGoalXNonFinite) {
  auto result = handler_.parse(R"({"type":"nav_goal","x":NaN,"y":-2.0,"heading":0.785})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, NavGoalYNonFinite) {
  auto j = nlohmann::json::parse(R"({"type":"nav_goal","x":1.5,"heading":0.785})");
  j["y"] = std::numeric_limits<double>::quiet_NaN();
  auto result = handler_.parse(j.dump());
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, NavGoalHeadingNonFinite) {
  auto j = nlohmann::json::parse(R"({"type":"nav_goal","x":1.5,"y":-2.0})");
  j["heading"] = std::numeric_limits<double>::infinity();
  auto result = handler_.parse(j.dump());
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, NavGoalXWrongType) {
  auto result = handler_.parse(R"({"type":"nav_goal","x":"string","y":-2.0,"heading":0.785})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, NavGoalYWrongType) {
  auto result = handler_.parse(R"({"type":"nav_goal","x":1.5,"y":true,"heading":0.785})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, NavGoalHeadingWrongType) {
  auto result = handler_.parse(R"({"type":"nav_goal","x":1.5,"y":-2.0,"heading":[0.785]})");
  ASSERT_TRUE(std::holds_alternative<ParseError>(result));
}

TEST_F(CommandHandlerTest, ValidNavPause) {
  auto result = handler_.parse(R"({"type":"nav_pause"})");
  ASSERT_TRUE(std::holds_alternative<NavPauseCommand>(result));
}

TEST_F(CommandHandlerTest, NavPauseIgnoresExtraFields) {
  auto result = handler_.parse(R"({"type":"nav_pause","extra":"data"})");
  ASSERT_TRUE(std::holds_alternative<NavPauseCommand>(result));
}

TEST_F(CommandHandlerTest, ValidNavResume) {
  auto result = handler_.parse(R"({"type":"nav_resume"})");
  ASSERT_TRUE(std::holds_alternative<NavResumeCommand>(result));
}

TEST_F(CommandHandlerTest, NavResumeIgnoresExtraFields) {
  auto result = handler_.parse(R"({"type":"nav_resume","extra":"data"})");
  ASSERT_TRUE(std::holds_alternative<NavResumeCommand>(result));
}

TEST_F(CommandHandlerTest, ValidNavCancel) {
  auto result = handler_.parse(R"({"type":"nav_cancel"})");
  ASSERT_TRUE(std::holds_alternative<NavCancelCommand>(result));
}

TEST_F(CommandHandlerTest, NavCancelIgnoresExtraFields) {
  auto result = handler_.parse(R"({"type":"nav_cancel","extra":"data"})");
  ASSERT_TRUE(std::holds_alternative<NavCancelCommand>(result));
}
