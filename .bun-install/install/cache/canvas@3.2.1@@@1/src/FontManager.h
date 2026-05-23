#pragma once

#include <vector>

#include "Font.h"
#include "FontFaceSet.h"
#include "unicode.h"

class FontManager {
  public:
    virtual ~FontManager() = default;

    virtual void readSystemFonts(
      std::vector<FontDescriptor>& results
    ) = 0;

    virtual void populateFallbackFonts(
      std::vector<std::string>& families,
      script_t script
    ) = 0;

    virtual std::optional<const std::vector<std::string>*> getGenericList(
      const std::string& generic
    ) = 0;

    std::vector<const FontDescriptor*> query(
      FontProperties& properties,
      FontFaceSet* registered,
      std::vector<std::string>& fallbacks
    );

  private:
    void narrowByStyle(
      std::vector<const FontDescriptor*>& fonts,
      FontProperties& properties
    );

    const FontDescriptor* narrowByWeight(
      std::vector<const FontDescriptor*> fonts,
      FontProperties& properties
    );

    bool system_fonts_loaded = false;
    std::vector<FontDescriptor> system_fonts;
};
