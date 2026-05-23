// Copyright (c) 2024 Caleb Hearon <caleb@chearon.net>
// Stuff common to all perspectives on fonts: CSS, OS fonts, querying, etc.
#pragma once

#include <string>
#include <vector>

enum class FontStyle {
  Normal,
  Italic,
  Oblique
};

enum class FontVariant {
  Normal,
  SmallCaps
};

// Descriptors and properties (see next comments)
struct FontBase {
  uint16_t weight{400};
  FontVariant variant{FontVariant::Normal};
  FontStyle style{FontStyle::Normal};
};

// Descriptors describe real fonts on the OS
struct FontDescriptor : FontBase {
  std::unique_ptr<char[]> family;
  std::unique_ptr<char[]> url = nullptr;
  std::unique_ptr<uint8_t[]> data = nullptr;
  size_t data_len = 0;
};

// Properties describe desired fonts from CSS/ctx.font
struct FontProperties : FontBase {
  std::vector<std::string> families;
  double size{16.0f};
};
