#include <iostream>
#include <cassert>

#include "FontManager.h"
#include "FontFaceSet.h"

bool
compareFamilyNames(const char* str1, size_t len1, const char* str2, size_t len2) {
  size_t start1 = 0;
  size_t end1 = len1;
  size_t start2 = 0;
  size_t end2 = len2;

  while (start1 < len1 && std::isspace(str1[start1])) start1++;
  while (end1 > start1 && std::isspace(str1[end1 - 1])) end1--;

  while (start2 < len2 && std::isspace(str2[start2])) start2++;
  while (end2 > start2 && std::isspace(str2[end2 - 1])) end2--;

  if (end1 - start1 != end2 - start2) return false;

  for (size_t i = 0; i < end1 - start1; i++) {
    if (std::tolower(str1[start1 + i]) != std::tolower(str2[start2 + i])) {
      return false;
    }
  }

  return true;
}

void
FontManager::narrowByStyle(
  std::vector<const FontDescriptor*>& fonts,
  FontProperties& properties
) {
  size_t nNormal = 0;
  size_t nItalic = 0;
  size_t nOblique = 0;

  assert(fonts.size() > 1 && "Precondition failed: 1 or 0 fonts in the set");

  for (const FontDescriptor* font : fonts) {
    switch (font->style) {
      case FontStyle::Normal: nNormal++; break;
      case FontStyle::Italic: nItalic++; break;
      case FontStyle::Oblique: nOblique++; break;
    }
  }

  FontStyle choose;
  switch (properties.style) {
    case FontStyle::Normal:
      choose = nNormal ? FontStyle::Normal : nOblique ? FontStyle::Oblique : FontStyle::Italic;
    break;
    case FontStyle::Italic:
      choose = nItalic ? FontStyle::Italic : nOblique ? FontStyle::Oblique : FontStyle::Normal;
    break;
    case FontStyle::Oblique:
      choose = nOblique ? FontStyle::Oblique : nItalic ? FontStyle::Italic : FontStyle::Normal;
    break;
  }

  for (size_t i = 0; i < fonts.size(); i++) {
    if (fonts[i]->style != choose) {
      std::swap(fonts[i], fonts[fonts.size() - 1]);
      fonts.pop_back();
    }
  }
}

const FontDescriptor*
FontManager::narrowByWeight(
  std::vector<const FontDescriptor*> fonts,
  FontProperties& properties
) {
  std::sort(
    fonts.begin(),
    fonts.end(),
    [](const FontDescriptor* a, const FontDescriptor* b) {
      return a->weight < b->weight;
    }
  );

  assert(fonts.size() && "Precondition failed: 1 or 0 fonts in the set");

  for (const FontDescriptor* font : fonts) {
    if (font->weight == properties.weight) {
      return font;
    }
  }

  const FontDescriptor* bestBelow = nullptr;
  size_t bestBelowDistance = 900; // max possible is 800
  const FontDescriptor* bestAbove = nullptr;
  size_t bestAboveDistance = 900;
  size_t divider = properties.weight == 400 ? 500
    : properties.weight == 500 ? 400
    : properties.weight;

  for (const FontDescriptor* font : fonts) {
    size_t distance = font->weight < properties.weight
      ? properties.weight - font->weight
      : font->weight - properties.weight;

    if (font->weight < divider) {
      if (distance <= bestBelowDistance) {
        bestBelow = font;
        bestBelowDistance = distance;
      }
    } else {
      if (distance < bestAboveDistance) {
        bestAbove = font;
        bestAboveDistance = distance;
      }
    }
  }

  if (bestBelow && bestAbove) {
    return divider <= 500 ? bestBelow : bestAbove;
  } else {
    return bestBelow ? bestBelow : bestAbove;
  }
}

/**
 * NOTE: the FontDescriptor is owned by the FontManager; do not use it again!
 */
std::vector<const FontDescriptor*>
FontManager::query(
  FontProperties& properties,
  FontFaceSet* registered,
  std::vector<std::string>& fallbacks
) {
  std::vector<const FontDescriptor*> allFamilyResults;
  std::vector<const FontDescriptor*> familyResults;
  
  if (!system_fonts_loaded) {
    readSystemFonts(system_fonts);
    system_fonts_loaded = true;
  }

  auto maybeAdd = [&](const std::string& family, const FontDescriptor* desc) {
    if (
      compareFamilyNames(
        family.c_str(),
        family.size(),
        desc->family.get(),
        strlen(desc->family.get())
      ) && std::find(
        familyResults.begin(),
        familyResults.end(),
        desc
      ) == familyResults.end()
    ) familyResults.push_back(desc);
  };
  
  for (const std::string& family : properties.families) {
    auto genericFamilies = getGenericList(family);
    if (genericFamilies) {
      for (const std::string& family : **genericFamilies) {
        for (const FontDescriptor& desc : system_fonts) {
          maybeAdd(family, &desc);
        }
      }
    } else {
      for (auto& entry : registered->facesData) {
        if (entry.face != nullptr) maybeAdd(family, &(entry.face->descriptor));
      }
      for (const FontDescriptor& desc : system_fonts) {
        maybeAdd(family, &desc);
      }
    }

    if (familyResults.size() == 1) {
      allFamilyResults.push_back(familyResults[0]);
      familyResults.clear();
    } else if (familyResults.size() > 1) {
      narrowByStyle(familyResults, properties);
      allFamilyResults.push_back(narrowByWeight(familyResults, properties));
      familyResults.clear();
    }
  }
  
  for (const std::string& fallback : fallbacks) {
    for (const FontDescriptor& desc : system_fonts) {
      maybeAdd(fallback, &desc);
    }

    if (familyResults.size() > 1) {
      narrowByStyle(familyResults, properties);
      allFamilyResults.push_back(narrowByWeight(familyResults, properties));
      familyResults.clear();
    }
  }

  return allFamilyResults;
}
