// This is used for classifying characters according to the definition of tokens
// in the CSS standards, but could be extended for any other future uses

#pragma once

#include <cstdint>

namespace CharData {
  static constexpr uint8_t Whitespace = 0x1;
  static constexpr uint8_t Newline = 0x2;
  static constexpr uint8_t Hex = 0x4;
  static constexpr uint8_t Nmstart = 0x8;
  static constexpr uint8_t Nmchar = 0x10;
  static constexpr uint8_t Sign = 0x20;
  static constexpr uint8_t Digit = 0x40;
  static constexpr uint8_t NumStart = 0x80;
};

using namespace CharData;

constexpr const uint8_t charData[256] = {
  0, 0, 0, 0, 0, 0, 0, 0, 0,                            // 0-8
  Whitespace,                                           // 9  (HT)
  Whitespace | Newline,                                 // 10 (LF)
  0,                                                    // 11 (VT)
  Whitespace | Newline,                                 // 12 (FF)
  Whitespace | Newline,                                 // 13 (CR)
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 14-31
  Whitespace,                                           // 32 (Space)
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,                         // 33-42
  Sign | NumStart,                                      // 43 (+)
  0,                                                    // 44
  Nmchar | Sign | NumStart,                             // 45 (-)
  0, 0,                                                 // 46-47
  Nmchar | Digit | NumStart | Hex,                      // 48 (0)
  Nmchar | Digit | NumStart | Hex,                      // 49 (1)
  Nmchar | Digit | NumStart | Hex,                      // 50 (2)
  Nmchar | Digit | NumStart | Hex,                      // 51 (3)
  Nmchar | Digit | NumStart | Hex,                      // 52 (4)
  Nmchar | Digit | NumStart | Hex,                      // 53 (5)
  Nmchar | Digit | NumStart | Hex,                      // 54 (6)
  Nmchar | Digit | NumStart | Hex,                      // 55 (7)
  Nmchar | Digit | NumStart | Hex,                      // 56 (8)
  Nmchar | Digit | NumStart | Hex,                      // 57 (9)
  0, 0, 0, 0, 0, 0, 0,                                  // 58-64
  Nmstart | Nmchar | Hex,                               // 65 (A)
  Nmstart | Nmchar | Hex,                               // 66 (B)
  Nmstart | Nmchar | Hex,                               // 67 (C)
  Nmstart | Nmchar | Hex,                               // 68 (D)
  Nmstart | Nmchar | Hex,                               // 69 (E)
  Nmstart | Nmchar | Hex,                               // 70 (F)
  Nmstart | Nmchar,                                     // 71 (G)
  Nmstart | Nmchar,                                     // 72 (H)
  Nmstart | Nmchar,                                     // 73 (I)
  Nmstart | Nmchar,                                     // 74 (J)
  Nmstart | Nmchar,                                     // 75 (K)
  Nmstart | Nmchar,                                     // 76 (L)
  Nmstart | Nmchar,                                     // 77 (M)
  Nmstart | Nmchar,                                     // 78 (N)
  Nmstart | Nmchar,                                     // 79 (O)
  Nmstart | Nmchar,                                     // 80 (P)
  Nmstart | Nmchar,                                     // 81 (Q)
  Nmstart | Nmchar,                                     // 82 (R)
  Nmstart | Nmchar,                                     // 83 (S)
  Nmstart | Nmchar,                                     // 84 (T)
  Nmstart | Nmchar,                                     // 85 (U)
  Nmstart | Nmchar,                                     // 86 (V)
  Nmstart | Nmchar,                                     // 87 (W)
  Nmstart | Nmchar,                                     // 88 (X)
  Nmstart | Nmchar,                                     // 89 (Y)
  Nmstart | Nmchar,                                     // 90 (Z)
  0,                                                    // 91
  Nmstart,                                              // 92 (\)
  0, 0,                                                 // 93-94
  Nmstart | Nmchar,                                     // 95 (_)
  0,                                                    // 96
  Nmstart | Nmchar | Hex,                               // 97 (a)
  Nmstart | Nmchar | Hex,                               // 98 (b)
  Nmstart | Nmchar | Hex,                               // 99 (c)
  Nmstart | Nmchar | Hex,                               // 100 (d)
  Nmstart | Nmchar | Hex,                               // 101 (e)
  Nmstart | Nmchar | Hex,                               // 102 (f)
  Nmstart | Nmchar,                                     // 103 (g)
  Nmstart | Nmchar,                                     // 104 (h)
  Nmstart | Nmchar,                                     // 105 (i)
  Nmstart | Nmchar,                                     // 106 (j)
  Nmstart | Nmchar,                                     // 107 (k)
  Nmstart | Nmchar,                                     // 108 (l)
  Nmstart | Nmchar,                                     // 109 (m)
  Nmstart | Nmchar,                                     // 110 (n)
  Nmstart | Nmchar,                                     // 111 (o)
  Nmstart | Nmchar,                                     // 112 (p)
  Nmstart | Nmchar,                                     // 113 (q)
  Nmstart | Nmchar,                                     // 114 (r)
  Nmstart | Nmchar,                                     // 115 (s)
  Nmstart | Nmchar,                                     // 116 (t)
  Nmstart | Nmchar,                                     // 117 (u)
  Nmstart | Nmchar,                                     // 118 (v)
  Nmstart | Nmchar,                                     // 119 (w)
  Nmstart | Nmchar,                                     // 120 (x)
  Nmstart | Nmchar,                                     // 121 (y)
  Nmstart | Nmchar,                                     // 122 (z)
  0, 0, 0, 0, 0,                                        // 123-127
  // Non-ASCII
  Nmstart | Nmchar,                                     // 128
  Nmstart | Nmchar,                                     // 129
  Nmstart | Nmchar,                                     // 130
  Nmstart | Nmchar,                                     // 131
  Nmstart | Nmchar,                                     // 132
  Nmstart | Nmchar,                                     // 133
  Nmstart | Nmchar,                                     // 134
  Nmstart | Nmchar,                                     // 135
  Nmstart | Nmchar,                                     // 136
  Nmstart | Nmchar,                                     // 137
  Nmstart | Nmchar,                                     // 138
  Nmstart | Nmchar,                                     // 139
  Nmstart | Nmchar,                                     // 140
  Nmstart | Nmchar,                                     // 141
  Nmstart | Nmchar,                                     // 142
  Nmstart | Nmchar,                                     // 143
  Nmstart | Nmchar,                                     // 144
  Nmstart | Nmchar,                                     // 145
  Nmstart | Nmchar,                                     // 146
  Nmstart | Nmchar,                                     // 147
  Nmstart | Nmchar,                                     // 148
  Nmstart | Nmchar,                                     // 149
  Nmstart | Nmchar,                                     // 150
  Nmstart | Nmchar,                                     // 151
  Nmstart | Nmchar,                                     // 152
  Nmstart | Nmchar,                                     // 153
  Nmstart | Nmchar,                                     // 154
  Nmstart | Nmchar,                                     // 155
  Nmstart | Nmchar,                                     // 156
  Nmstart | Nmchar,                                     // 157
  Nmstart | Nmchar,                                     // 158
  Nmstart | Nmchar,                                     // 159
  Nmstart | Nmchar,                                     // 160
  Nmstart | Nmchar,                                     // 161
  Nmstart | Nmchar,                                     // 162
  Nmstart | Nmchar,                                     // 163
  Nmstart | Nmchar,                                     // 164
  Nmstart | Nmchar,                                     // 165
  Nmstart | Nmchar,                                     // 166
  Nmstart | Nmchar,                                     // 167
  Nmstart | Nmchar,                                     // 168
  Nmstart | Nmchar,                                     // 169
  Nmstart | Nmchar,                                     // 170
  Nmstart | Nmchar,                                     // 171
  Nmstart | Nmchar,                                     // 172
  Nmstart | Nmchar,                                     // 173
  Nmstart | Nmchar,                                     // 174
  Nmstart | Nmchar,                                     // 175
  Nmstart | Nmchar,                                     // 176
  Nmstart | Nmchar,                                     // 177
  Nmstart | Nmchar,                                     // 178
  Nmstart | Nmchar,                                     // 179
  Nmstart | Nmchar,                                     // 180
  Nmstart | Nmchar,                                     // 181
  Nmstart | Nmchar,                                     // 182
  Nmstart | Nmchar,                                     // 183
  Nmstart | Nmchar,                                     // 184
  Nmstart | Nmchar,                                     // 185
  Nmstart | Nmchar,                                     // 186
  Nmstart | Nmchar,                                     // 187
  Nmstart | Nmchar,                                     // 188
  Nmstart | Nmchar,                                     // 189
  Nmstart | Nmchar,                                     // 190
  Nmstart | Nmchar,                                     // 191
  Nmstart | Nmchar,                                     // 192
  Nmstart | Nmchar,                                     // 193
  Nmstart | Nmchar,                                     // 194
  Nmstart | Nmchar,                                     // 195
  Nmstart | Nmchar,                                     // 196
  Nmstart | Nmchar,                                     // 197
  Nmstart | Nmchar,                                     // 198
  Nmstart | Nmchar,                                     // 199
  Nmstart | Nmchar,                                     // 200
  Nmstart | Nmchar,                                     // 201
  Nmstart | Nmchar,                                     // 202
  Nmstart | Nmchar,                                     // 203
  Nmstart | Nmchar,                                     // 204
  Nmstart | Nmchar,                                     // 205
  Nmstart | Nmchar,                                     // 206
  Nmstart | Nmchar,                                     // 207
  Nmstart | Nmchar,                                     // 208
  Nmstart | Nmchar,                                     // 209
  Nmstart | Nmchar,                                     // 210
  Nmstart | Nmchar,                                     // 211
  Nmstart | Nmchar,                                     // 212
  Nmstart | Nmchar,                                     // 213
  Nmstart | Nmchar,                                     // 214
  Nmstart | Nmchar,                                     // 215
  Nmstart | Nmchar,                                     // 216
  Nmstart | Nmchar,                                     // 217
  Nmstart | Nmchar,                                     // 218
  Nmstart | Nmchar,                                     // 219
  Nmstart | Nmchar,                                     // 220
  Nmstart | Nmchar,                                     // 221
  Nmstart | Nmchar,                                     // 222
  Nmstart | Nmchar,                                     // 223
  Nmstart | Nmchar,                                     // 224
  Nmstart | Nmchar,                                     // 225
  Nmstart | Nmchar,                                     // 226
  Nmstart | Nmchar,                                     // 227
  Nmstart | Nmchar,                                     // 228
  Nmstart | Nmchar,                                     // 229
  Nmstart | Nmchar,                                     // 230
  Nmstart | Nmchar,                                     // 231
  Nmstart | Nmchar,                                     // 232
  Nmstart | Nmchar,                                     // 233
  Nmstart | Nmchar,                                     // 234
  Nmstart | Nmchar,                                     // 235
  Nmstart | Nmchar,                                     // 236
  Nmstart | Nmchar,                                     // 237
  Nmstart | Nmchar,                                     // 238
  Nmstart | Nmchar,                                     // 239
  Nmstart | Nmchar,                                     // 240
  Nmstart | Nmchar,                                     // 241
  Nmstart | Nmchar,                                     // 242
  Nmstart | Nmchar,                                     // 243
  Nmstart | Nmchar,                                     // 244
  Nmstart | Nmchar,                                     // 245
  Nmstart | Nmchar,                                     // 246
  Nmstart | Nmchar,                                     // 247
  Nmstart | Nmchar,                                     // 248
  Nmstart | Nmchar,                                     // 249
  Nmstart | Nmchar,                                     // 250
  Nmstart | Nmchar,                                     // 251
  Nmstart | Nmchar,                                     // 252
  Nmstart | Nmchar,                                     // 253
  Nmstart | Nmchar,                                     // 254
  Nmstart | Nmchar                                      // 255
};
