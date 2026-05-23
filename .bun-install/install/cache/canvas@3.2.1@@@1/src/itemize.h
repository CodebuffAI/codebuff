#pragma once

#include <vector>
#include <cstdint>
#include <SheenBidi/SheenBidi.h>
#include "unicode.h"

struct ParenInfo {
  int index;
  script_t script;
};

struct ScriptIteratorState {
  // Output
  size_t offset = 0;
  script_t script = SCRIPT_COMMON;
  bool done = false;
  
  // Private state
  std::vector<ParenInfo> parens;
  int start_paren = -1;
};

struct BidiIteratorState {
  BidiIteratorState(const std::vector<char16_t>& text_buffer) {
    SBCodepointSequence codepointSequence = {
      SBStringEncodingUTF16,
      text_buffer.data(),
      text_buffer.size()
    };
    algorithm = SBAlgorithmCreate(&codepointSequence);
    paragraph = SBAlgorithmCreateParagraph(
      algorithm,
      offset,
      text_buffer.size(),
      initial_level
    );
    levels = SBParagraphGetLevelsPtr(paragraph);
  }
  
  ~BidiIteratorState() {
    if (paragraph != nullptr) SBParagraphRelease(paragraph);
    if (algorithm != nullptr) SBAlgorithmRelease(algorithm);
  }
    
  // Output
  size_t offset = 0;
  uint8_t level = 0;
  bool done = false;
  
  // Private state
  SBAlgorithmRef algorithm = nullptr;
  SBParagraphRef paragraph = nullptr;
  const SBLevel* levels = nullptr;
  uint8_t initial_level = 0;
};

struct ItemizeState {
  ItemizeState(const std::vector<char16_t>& text_buffer) : bidi_state(text_buffer) {}
    
  // Output
  size_t offset = 0;
  bool done = false;
  
  // Private state
  BidiIteratorState bidi_state;
  ScriptIteratorState script_state;
};

void itemize_next(ItemizeState& state, const std::vector<char16_t>& text_buffer);