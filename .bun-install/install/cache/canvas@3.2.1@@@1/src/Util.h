#pragma once

#include <cctype>

inline bool streq_casein(std::string& str1, std::string& str2) {
  return str1.size() == str2.size() && std::equal(str1.begin(), str1.end(), str2.begin(), [](char& c1, char& c2) {
    return c1 == c2 || std::toupper(c1) == std::toupper(c2);
  });
}
