#pragma once

#include <string>
#include <vector>
#include <optional>
#include <memory>
#include <variant>
#include <unordered_map>
#include "CharData.h"

enum class FontStyle {
  Normal,
  Italic,
  Oblique
};

enum class FontVariant {
  Normal,
  SmallCaps
};

struct FontProperties {
  double fontSize{16.0f};
  std::vector<std::string> fontFamily;
  uint16_t fontWeight{400};
  FontVariant fontVariant{FontVariant::Normal};
  FontStyle fontStyle{FontStyle::Normal};
};

class Token {
  public:
    enum class Type {
      Invalid,
      Number,
      Percent,
      Identifier,
      Slash,
      Comma,
      QuotedString,
      Whitespace,
      EndOfInput
    };

    Token(Type type, std::string value);
    Token(Type type, double value);
    Token(Type type);

    Type type() const { return type_; }

    const std::string& getString() const;
    double getNumber() const;

  private:
    Type type_;
    std::variant<std::string, double> value_;
};

class Tokenizer {
  public:
    Tokenizer(std::string_view input);
    Token nextToken();

  private:
    std::string_view input_;
    size_t position_{0};

    // Util
    std::string utf8Encode(uint32_t codepoint);
    inline bool isWhitespace(char c) const {
      return charData[static_cast<uint8_t>(c)] & CharData::Whitespace;
    }
    inline bool isNewline(char c) const {
      return charData[static_cast<uint8_t>(c)] & CharData::Newline;
    }

    // Moving through the string
    char peek() const;
    char advance();

    // Tokenize
    Token parseNumber();
    Token parseIdentifier();
    uint32_t parseUnicode();
    bool parseEscape(std::string& str);
    Token parseString(char quote);
};

class FontParser {
  public:
    static FontProperties parse(const std::string& fontString, bool* success = nullptr);

  private:
    static const std::unordered_map<std::string, uint16_t> weightMap;
    static const std::unordered_map<std::string, double> unitMap;

    FontParser(std::string_view input);

    void advance();
    void skipWs();
    bool check(Token::Type type) const;
    bool checkWs() const;

    bool parseFontStyle(FontProperties& props);
    bool parseFontVariant(FontProperties& props);
    bool parseFontWeight(FontProperties& props);
    bool parseFontSize(FontProperties& props);
    bool parseLineHeight(FontProperties& props);
    bool parseFontFamily(FontProperties& props);
    FontProperties parseFont();

    Tokenizer tokenizer_;
    Token currentToken_;
    Token nextToken_;
    bool hasError_{false};
};
