// This is written to exactly parse the `font` shorthand in CSS2:
// https://www.w3.org/TR/CSS22/fonts.html#font-shorthand
// https://www.w3.org/TR/CSS22/syndata.html#tokenization
//
// We may want to update it for CSS 3 (e.g. font-stretch, or updated
// tokenization) but I've only ever seen one or two issues filed in node-canvas
// due to parsing in my 8 years on the project

#include "FontParser.h"
#include "CharData.h"
#include <cctype>
#include <unordered_map>

Token::Token(Type type, std::string value) : type_(type), value_(std::move(value)) {}

Token::Token(Type type, double value) : type_(type), value_(value) {}

Token::Token(Type type) : type_(type), value_(std::string{}) {}

const std::string&
Token::getString() const {
  static const std::string empty;
  auto* str = std::get_if<std::string>(&value_);
  return str ? *str : empty;
}

double
Token::getNumber() const {
  auto* num = std::get_if<double>(&value_);
  return num ? *num : 0.0f;
}

Tokenizer::Tokenizer(std::string_view input) : input_(input) {}

std::string
Tokenizer::utf8Encode(uint32_t codepoint) {
  std::string result;
  
  if (codepoint < 0x80) {
    result += static_cast<char>(codepoint);
  } else if (codepoint < 0x800) {
    result += static_cast<char>((codepoint >> 6) | 0xc0);
    result += static_cast<char>((codepoint & 0x3f) | 0x80);
  } else if (codepoint < 0x10000) {
    result += static_cast<char>((codepoint >> 12) | 0xe0);
    result += static_cast<char>(((codepoint >> 6) & 0x3f) | 0x80);
    result += static_cast<char>((codepoint & 0x3f) | 0x80);
  } else {
    result += static_cast<char>((codepoint >> 18) | 0xf0);
    result += static_cast<char>(((codepoint >> 12) & 0x3f) | 0x80);
    result += static_cast<char>(((codepoint >> 6) & 0x3f) | 0x80);
    result += static_cast<char>((codepoint & 0x3f) | 0x80);
  }
  
  return result;
}

char
Tokenizer::peek() const {
  return position_ < input_.length() ? input_[position_] : '\0';
}

char
Tokenizer::advance() {
  return position_ < input_.length() ? input_[position_++] : '\0';
}

Token
Tokenizer::parseNumber() {
  enum class State {
    Start,
    AfterSign,
    Digits,
    AfterDecimal,
    AfterE,
    AfterESign,
    ExponentDigits
  };

  size_t start = position_;
  size_t ePosition = 0;
  State state = State::Start;
  bool valid = false;
  
  while (position_ < input_.length()) {
    char c = peek();
    uint8_t flags = charData[static_cast<uint8_t>(c)];

    switch (state) {
      case State::Start:
        if (flags & CharData::Sign) {
          position_++;
          state = State::AfterSign;
        } else if (flags & CharData::Digit) {
          position_++;
          state = State::Digits;
          valid = true;
        } else if (c == '.') {
          position_++;
          state = State::AfterDecimal;
        } else {
          goto done;
        }
        break;

      case State::AfterSign:
        if (flags & CharData::Digit) {
          position_++;
          state = State::Digits;
          valid = true;
        } else if (c == '.') {
          position_++;
          state = State::AfterDecimal;
        } else {
          goto done;
        }
        break;

      case State::Digits:
        if (flags & CharData::Digit) {
          position_++;
        } else if (c == '.') {
          position_++;
          state = State::AfterDecimal;
        } else if (c == 'e' || c == 'E') {
          ePosition = position_;
          position_++;
          state = State::AfterE;
          valid = false;
        } else {
          goto done;
        }
        break;

      case State::AfterDecimal:
        if (flags & CharData::Digit) {
          position_++;
          valid = true;
          state = State::Digits;
        } else {
          goto done;
        }
        break;

      case State::AfterE:
        if (flags & CharData::Sign) {
          position_++;
          state = State::AfterESign;
        } else if (flags & CharData::Digit) {
          position_++;
          valid = true;
          state = State::ExponentDigits;
        } else {
          position_ = ePosition;
          valid = true;
          goto done;
        }
        break;

      case State::AfterESign:
        if (flags & CharData::Digit) {
          position_++;
          valid = true;
          state = State::ExponentDigits;
        } else {
          position_ = ePosition;
          valid = true;
          goto done;
        }
        break;

      case State::ExponentDigits:
        if (flags & CharData::Digit) {
          position_++;
        } else {
          goto done;
        }
        break;
    }
  }

done:
  if (!valid) {
    position_ = start;
    return Token(Token::Type::Invalid);
  }

  std::string number_str(input_.substr(start, position_ - start));
  double value = std::stod(number_str);
  return Token(Token::Type::Number, value);
}

// Note that identifiers are always lower-case. This helps us make easier/more
// efficient comparisons, but means that font-families specified as identifiers
// will be lower-cased. Since font selection isn't case sensitive, this
// shouldn't ever be a problem.
Token
Tokenizer::parseIdentifier() {
  std::string identifier;
  auto flags = CharData::Nmstart;
  auto start = position_;
  
  while (position_ < input_.length()) {
    char c = peek();
    
    if (c == '\\') {
      advance();
      if (!parseEscape(identifier)) {
        position_ = start;
        return Token(Token::Type::Invalid);
      }
      flags = CharData::Nmchar;
    } else if (charData[static_cast<uint8_t>(c)] & flags) {
      identifier += advance() + (c >= 'A' && c <= 'Z' ? 32 : 0);
      flags = CharData::Nmchar;
    } else {
      break;
    }
  }
  
  return Token(Token::Type::Identifier, identifier);
}

uint32_t
Tokenizer::parseUnicode() {
  uint32_t value = 0;
  size_t count = 0;
  
  while (position_ < input_.length() && count < 6) {
    char c = peek();
    uint32_t digit;
    
    if (c >= '0' && c <= '9') {
      digit = c - '0';
    } else if (c >= 'a' && c <= 'f') {
      digit = c - 'a' + 10;
    } else if (c >= 'A' && c <= 'F') {
      digit = c - 'A' + 10;
    } else {
      break;
    }
    
    value = value * 16 + digit;
    advance();
    count++;
  }
  
  // Optional whitespace after hex escape
  char c = peek();
  if (c == '\r') {
    advance();
    if (peek() == '\n') advance();
  } else if (isWhitespace(c)) {
    advance();
  }
  
  return value;
}

bool
Tokenizer::parseEscape(std::string& str) {
  char c = peek();
  auto flags = charData[static_cast<uint8_t>(c)];

  if (flags & CharData::Hex) {
    str += utf8Encode(parseUnicode());
    return true;
  } else if (!(flags & CharData::Newline) && !(flags & CharData::Hex)) {
    str += advance();
    return true;
  }

  return false;
}

Token
Tokenizer::parseString(char quote) {
  advance();
  std::string value;
  auto start = position_;
  
  while (position_ < input_.length()) {
    char c = peek();
    
    if (c == quote) {
      advance();
      return Token(Token::Type::QuotedString, value);
    } else if (c == '\\') {
      advance();
      c = peek();
      if (c == '\r') {
        advance();
        if (peek() == '\n') advance();
      } else if (isNewline(c)) {
        advance();
      } else {
        if (!parseEscape(value)) {
          position_ = start;
          return Token(Token::Type::Invalid);
        }
      }
    } else {
      value += advance();
    }
  }

  position_ = start;
  return Token(Token::Type::Invalid);
}

Token
Tokenizer::nextToken() {
  if (position_ >= input_.length()) {
    return Token(Token::Type::EndOfInput);
  }

  char c = peek();
  auto flags = charData[static_cast<uint8_t>(c)];

  if (isWhitespace(c)) {
    std::string whitespace;
    while (position_ < input_.length() && isWhitespace(peek())) {
      whitespace += advance();
    }
    return Token(Token::Type::Whitespace, whitespace);
  }

  if (flags & CharData::NumStart) {
    Token token = parseNumber();
    if (token.type() != Token::Type::Invalid) return token;
  }

  if (flags & CharData::Nmstart) {
    Token token = parseIdentifier();
    if (token.type() != Token::Type::Invalid) return token;
  }

  if (c == '"') {
    Token token = parseString('"');
    if (token.type() != Token::Type::Invalid) return token;
  }

  if (c == '\'') {
    Token token = parseString('\'');
    if (token.type() != Token::Type::Invalid) return token;
  }

  switch (advance()) {
    case '/': return Token(Token::Type::Slash);
    case ',': return Token(Token::Type::Comma);
    case '%': return Token(Token::Type::Percent);
    default: return Token(Token::Type::Invalid);
  }
}

FontParser::FontParser(std::string_view input)
  : tokenizer_(input)
  , currentToken_(tokenizer_.nextToken())
  , nextToken_(tokenizer_.nextToken()) {}

const std::unordered_map<std::string, uint16_t> FontParser::weightMap = {
  {"normal", 400},
  {"bold", 700},
  {"lighter", 100},
  {"bolder", 700}
};

const std::unordered_map<std::string, double> FontParser::unitMap = {
  {"cm", 37.8f},
  {"mm", 3.78f},
  {"in", 96.0f},
  {"pt", 96.0f / 72.0f},
  {"pc", 96.0f / 6.0f},
  {"em", 16.0f},
  {"px", 1.0f}
};

void
FontParser::advance() {
  currentToken_ = nextToken_;
  nextToken_ = tokenizer_.nextToken();
}

void
FontParser::skipWs() {
  while (currentToken_.type() == Token::Type::Whitespace) advance();
}

bool
FontParser::check(Token::Type type) const {
  return currentToken_.type() == type;
}

bool
FontParser::checkWs() const {
  return nextToken_.type() == Token::Type::Whitespace
    || nextToken_.type() == Token::Type::EndOfInput;
}

bool
FontParser::parseFontStyle(FontProperties& props) {
  if (check(Token::Type::Identifier)) {
    const auto& value = currentToken_.getString();
    if (value == "italic") {
      props.fontStyle = FontStyle::Italic;
      advance();
      return true;
    } else if (value == "oblique") {
      props.fontStyle = FontStyle::Oblique;
      advance();
      return true;
    } else if (value == "normal") {
      props.fontStyle = FontStyle::Normal;
      advance();
      return true;
    }
  }

  return false;
}

bool
FontParser::parseFontVariant(FontProperties& props) {
  if (check(Token::Type::Identifier)) {
    const auto& value = currentToken_.getString();
    if (value == "small-caps") {
      props.fontVariant = FontVariant::SmallCaps;
      advance();
      return true;
    } else if (value == "normal") {
      props.fontVariant = FontVariant::Normal;
      advance();
      return true;
    }
  }

  return false;
}

bool
FontParser::parseFontWeight(FontProperties& props) {
  if (check(Token::Type::Number)) {
    double weightFloat = currentToken_.getNumber();
    int weight = static_cast<int>(weightFloat);
    if (weight < 1 || weight > 1000) return false;
    props.fontWeight = static_cast<uint16_t>(weight);
    advance();
    return true;
  } else if (check(Token::Type::Identifier)) {
    const auto& value = currentToken_.getString();

    if (auto it = weightMap.find(value); it != weightMap.end()) {
      props.fontWeight = it->second;
      advance();
      return true;
    }
  }

  return false;
}

bool
FontParser::parseFontSize(FontProperties& props) {
  if (!check(Token::Type::Number)) return false;

  props.fontSize = currentToken_.getNumber();
  advance();

  double multiplier = 1.0f;
  if (check(Token::Type::Identifier)) {
    const auto& unit = currentToken_.getString();

    if (auto it = unitMap.find(unit); it != unitMap.end()) {
      multiplier = it->second;
      advance();
    } else {
      return false;
    }
  } else if (check(Token::Type::Percent)) {
    multiplier = 16.0f / 100.0f;
    advance();
  } else {
    return false;
  }

  // Technically if we consumed some tokens but couldn't parse the font-size,
  // we should rewind the tokenizer, but I don't think the grammar allows for
  // any valid alternates in this specific case

  props.fontSize *= multiplier;
  return true;
}

// line-height is not used by canvas ever, but should still parse
bool
FontParser::parseLineHeight(FontProperties& props) {
  if (check(Token::Type::Slash)) {
    advance();
    skipWs();
    if (check(Token::Type::Number)) {
      advance();
      if (check(Token::Type::Percent)) {
        advance();
      } else if (check(Token::Type::Identifier)) {
        auto identifier = currentToken_.getString();
        if (auto it = unitMap.find(identifier); it != unitMap.end()) {
          advance();
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else if (check(Token::Type::Identifier) && currentToken_.getString() == "normal") {
      advance();
    } else {
      return false;
    }
  }

  return true;
}

bool
FontParser::parseFontFamily(FontProperties& props) {
  while (!check(Token::Type::EndOfInput)) {
    std::string family = "";
    std::string trailingWs = "";
    bool found = false;

    while (
      check(Token::Type::QuotedString) ||
      check(Token::Type::Identifier) ||
      check(Token::Type::Whitespace)
    ) {
      if (check(Token::Type::Whitespace)) {
        if (found) trailingWs += currentToken_.getString();
      } else { // Identifier, QuotedString
        if (found) {
          family += trailingWs;
          trailingWs.clear();
        }

        family += currentToken_.getString();
        found = true;
      }

      advance();
    }

    if (!found) return false; // only whitespace or non-id/string found

    props.fontFamily.push_back(family);

    if (check(Token::Type::Comma)) advance();
  }

  return true;
}

FontProperties
FontParser::parse(const std::string& fontString, bool* success) {
  FontParser parser(fontString);
  auto result = parser.parseFont();
  if (success) *success = !parser.hasError_;
  return result;
}

FontProperties
FontParser::parseFont() {
  FontProperties props;
  uint8_t state = 0b111;

  skipWs();

  for (size_t i = 0; i < 3 && checkWs(); i++) {
    if ((state & 0b001) && parseFontStyle(props)) {
      state &= 0b110;
      goto match;
    }

    if ((state & 0b010) && parseFontVariant(props)) {
      state &= 0b101;
      goto match;
    }

    if ((state & 0b100) && parseFontWeight(props)) {
      state &= 0b011;
      goto match;
    }

    break; // all attempts exhausted
    match: skipWs(); // success: move to the next non-ws token
  }

  if (parseFontSize(props)) {
    skipWs();
    if (parseLineHeight(props) && parseFontFamily(props)) {
      return props;
    }
  }

  hasError_ = true;
  return props;
}
