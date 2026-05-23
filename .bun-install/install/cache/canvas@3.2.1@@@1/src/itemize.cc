#include <vector>
#include <cstdint>
#include <algorithm>
#include "itemize.h"

void
bidi_iterator_next(
  BidiIteratorState& state,
  const std::vector<char16_t>& text_buffer
) {
  if (state.done) return;

  const size_t text_length = text_buffer.size();
  state.level = state.levels[state.offset];

  bool should_break = false;
  while (state.offset < text_length && !should_break) {
    while (state.offset < text_length) {
      if (state.levels[state.offset] != state.level) {
        should_break = true;
        break;
      }

      state.offset += 1;
    }
  }

  if (state.offset == text_length) state.done = true;
}

static const uint32_t paired_chars[] = {
  0x0028, 0x0029, /* ascii paired punctuation */
  0x003c, 0x003e,
  0x005b, 0x005d,
  0x007b, 0x007d,
  0x00ab, 0x00bb, /* guillemets */
  0x0f3a, 0x0f3b, /* tibetan */
  0x0f3c, 0x0f3d,
  0x169b, 0x169c, /* ogham */
  0x2018, 0x2019, /* general punctuation */
  0x201c, 0x201d,
  0x2039, 0x203a,
  0x2045, 0x2046,
  0x207d, 0x207e,
  0x208d, 0x208e,
  0x27e6, 0x27e7, /* math */
  0x27e8, 0x27e9,
  0x27ea, 0x27eb,
  0x27ec, 0x27ed,
  0x27ee, 0x27ef,
  0x2983, 0x2984,
  0x2985, 0x2986,
  0x2987, 0x2988,
  0x2989, 0x298a,
  0x298b, 0x298c,
  0x298d, 0x298e,
  0x298f, 0x2990,
  0x2991, 0x2992,
  0x2993, 0x2994,
  0x2995, 0x2996,
  0x2997, 0x2998,
  0x29fc, 0x29fd,
  0x2e02, 0x2e03,
  0x2e04, 0x2e05,
  0x2e09, 0x2e0a,
  0x2e0c, 0x2e0d,
  0x2e1c, 0x2e1d,
  0x2e20, 0x2e21,
  0x2e22, 0x2e23,
  0x2e24, 0x2e25,
  0x2e26, 0x2e27,
  0x2e28, 0x2e29,
  0x3008, 0x3009, /* chinese paired punctuation */
  0x300a, 0x300b,
  0x300c, 0x300d,
  0x300e, 0x300f,
  0x3010, 0x3011,
  0x3014, 0x3015,
  0x3016, 0x3017,
  0x3018, 0x3019,
  0x301a, 0x301b,
  0xfe59, 0xfe5a,
  0xfe5b, 0xfe5c,
  0xfe5d, 0xfe5e,
  0xff08, 0xff09,
  0xff3b, 0xff3d,
  0xff5b, 0xff5d,
  0xff5f, 0xff60,
  0xff62, 0xff63
};

static const size_t paired_chars_count = sizeof(paired_chars) / sizeof(paired_chars[0]);

static int
get_pair_index(uint32_t ch) {
  int lower = 0;
  int upper = paired_chars_count - 1;
  
  while (lower <= upper) {
    int mid = (lower + upper) / 2;
    
    if (ch < paired_chars[mid]) {
      upper = mid - 1;
    } else if (ch > paired_chars[mid]) {
      lower = mid + 1;
    } else {
      return mid;
    }
  }
  
  return -1;
}

void
script_iterator_next(
  ScriptIteratorState& state,
  const std::vector<char16_t>& text_buffer
) {
  if (state.done) return;
  
  const size_t text_length = text_buffer.size();
  state.script = SCRIPT_COMMON;
  
  while (state.offset < text_length) {
    uint32_t code = text_buffer[state.offset];
    int jump = 1;
    
    // Handle surrogate pairs
    if (state.offset + 1 < text_length) {
      uint32_t next = text_buffer[state.offset + 1];
      if ((0xd800 <= code && code <= 0xdbff) && (0xdc00 <= next && next <= 0xdfff)) {
        jump = 2;
        code = ((code - 0xd800) * 0x400) + (next - 0xdc00) + 0x10000;
      }
    }

    script_t script = get_script(code);
    int pair_index = script != SCRIPT_COMMON ? -1 : get_pair_index(code);

    // Paired character handling:
    // if it's an open character, push it onto the stack
    // if it's a close character, find the matching open on the stack, and use
    // that script code. Any non-matching open characters above it on the stack
    // will be popped.
    if (pair_index >= 0) {
      if ((pair_index & 1) == 0) {
        // Open character
        state.parens.push_back({pair_index, state.script});
      } else if (!state.parens.empty()) {
        // Close character
        int pi = pair_index & ~1;
    
        while (!state.parens.empty() && state.parens.back().index != pi) {
          state.parens.pop_back();
        }

        if (static_cast<int>(state.parens.size()) - 1 < state.start_paren) {
          state.start_paren = static_cast<int>(state.parens.size()) - 1;
        }

        if (!state.parens.empty()) {
          script = state.parens.back().script;
        }
      }
    }

    bool running_is_real = state.script != SCRIPT_COMMON && state.script != SCRIPT_INHERITED;
    bool is_real = script != SCRIPT_COMMON && script != SCRIPT_INHERITED;
    bool is_same = !running_is_real || !is_real || script == state.script;

    if (is_same) {
      if (!running_is_real && is_real) {
        state.script = script;
        
        // Now that we have a final script code, fix any open characters we
        // pushed before we knew the real script code.
        while (state.start_paren + 1 < static_cast<int>(state.parens.size())) {
          state.parens[++state.start_paren].script = script;
        }
        
        if (pair_index >= 0 && (pair_index & 1) && !state.parens.empty()) {
          state.parens.pop_back();
          
          if (static_cast<int>(state.parens.size()) - 1 < state.start_paren) {
            state.start_paren = static_cast<int>(state.parens.size()) - 1;
          }
        }
      }
      
      state.offset += jump;
    } else {
      state.start_paren = static_cast<int>(state.parens.size()) - 1;
      break;
    }
  }
    
  if (state.offset >= text_length) {
    state.done = true;
  }
}

void
itemize_next(
  ItemizeState& state,
  const std::vector<char16_t>& text_buffer
) {
  if (state.done) return;

  if (state.bidi_state.offset == state.offset) {
    bidi_iterator_next(state.bidi_state, text_buffer);
  }

  if (state.script_state.offset == state.offset) {
    script_iterator_next(state.script_state, text_buffer);
  }

  state.offset = std::min(
    std::min(
      state.bidi_state.offset,
      state.script_state.offset
    ),
    text_buffer.size()
  );

  if (state.bidi_state.done && state.script_state.done) {
    state.done = true;
  }
}
