// Copyright (c) 2025 Caleb Hearon <caleb@chearon.net>
//
// References:
// - https://github.com/foliojs/font-manager
// - https://searchfox.org/firefox-main/rev/30ea9a2fd7271e9c731df414bd80e46edc3190eb/gfx/thebes/CoreTextFontList.cpp

#include <CoreText/CoreText.h>
#include <vector>
#include <array>
#include <cstring>
#include <iostream>
#include <cmath>

#include "FontManagerMacos.h"
#include "Font.h"
#include "unicode.h"

// Forward declarations for Objective-C types we need
typedef void NSString;
typedef void NSURL;
typedef void NSArray;

const uint16_t MAX_STYLE_LENGTH = 128; // like "Bold Italic", so should never be big

inline double round(double aNum) {
  return aNum >= 0.0 ? std::floor(aNum + 0.5) : std::ceil(aNum - 0.5);
}

// https://searchfox.org/firefox-main/rev/30ea9a2fd7271e9c731df414bd80e46edc3190eb/gfx/thebes/CoreTextFontList.cpp#770
static uint32_t convertWeight(float aCTWeight) {
  constexpr std::pair<CGFloat, int32_t> kCoreTextToCSSWeights[] = {
    {-1.0, 1},
    {-0.8, 100},
    {-0.6, 200},
    {-0.4, 300},
    {0.0,  400},  // standard 'regular' weight
    {0.23, 500},
    {0.3,  600},
    {0.4,  700},  // standard 'bold' weight
    {0.56, 800},
    {0.62, 900},  // Core Text seems to return 0.62 for faces with both
                  // usWeightClass=800 and 900 in their OS/2 tables!
                  // We use 900 as there are also fonts that return 0.56,
                  // so we want an intermediate value for that.
    {1.0,  1000}
  };
  const auto* begin = &kCoreTextToCSSWeights[0];
  const auto* end = begin + std::size(kCoreTextToCSSWeights);
  auto m = std::upper_bound(
    begin,
    end,
    aCTWeight,
    [](CGFloat aValue, const std::pair<CGFloat, int32_t>& aMapping) {
      return aValue <= aMapping.first;
    }
  );
  
  if (m == end) return 1000;
  if (m->first == aCTWeight || m == begin) return m->second;
  // Interpolate between the preceding and found entries:
  const auto* prev = m - 1;
  const auto t = (aCTWeight - prev->first) / (m->first - prev->first);
  return round(prev->second * (1.0 - t) + m->second * t);
}

void
create_font_descriptor(
  std::vector<FontDescriptor>& results,
  CTFontDescriptorRef descriptor
) {
  FontDescriptor desc;

  // TODO: these all need null-checked...
  NSURL *nsUrl = (NSURL *) CTFontDescriptorCopyAttribute(descriptor, kCTFontURLAttribute);
  CFStringRef nsPath = CFURLCopyFileSystemPath((CFURLRef)nsUrl, kCFURLPOSIXPathStyle);
  NSString *nsFamily = (NSString *) CTFontDescriptorCopyAttribute(descriptor, kCTFontFamilyNameAttribute);
  NSString *nsStyle = (NSString *) CTFontDescriptorCopyAttribute(descriptor, kCTFontStyleNameAttribute);
  CFDictionaryRef nsTraits = (CFDictionaryRef) CTFontDescriptorCopyAttribute(descriptor, kCTFontTraitsAttribute);

  // weight
  CFNumberRef weightVal = (CFNumberRef) CFDictionaryGetValue(nsTraits, kCTFontWeightTrait);
  float weightValue;
  CFNumberGetValue(weightVal, kCFNumberFloatType, &weightValue);
  desc.weight = (uint32_t) convertWeight(weightValue);

  // file path
  CFIndex pathLength = CFStringGetLength(nsPath) * 2 + 1;
  desc.url = std::make_unique<char[]>(pathLength);
  CFStringGetCString(nsPath, desc.url.get(), pathLength, kCFStringEncodingUTF8);

  // family name
  CFIndex familyLength = CFStringGetLength((CFStringRef)nsFamily) * 2 + 1;
  std::unique_ptr<char[]> family = std::make_unique<char[]>(familyLength);
  CFStringGetCString((CFStringRef)nsFamily, family.get(), familyLength, kCFStringEncodingUTF8);
  desc.family = std::move(family);

  // style
  CFNumberRef symbolicTraitsVal = (CFNumberRef)CFDictionaryGetValue(nsTraits, kCTFontSymbolicTrait);
  unsigned int symbolicTraits;
  CFNumberGetValue(symbolicTraitsVal, kCFNumberIntType, &symbolicTraits);
  desc.style = FontStyle::Normal;
  if (symbolicTraits & kCTFontItalicTrait) {
    desc.style = FontStyle::Italic;
  } else {
    char styleBuffer[MAX_STYLE_LENGTH];
    CFStringGetCString((CFStringRef)nsStyle, styleBuffer, MAX_STYLE_LENGTH, kCFStringEncodingUTF8);
    if (strstr(styleBuffer, "Oblique") != NULL) desc.style = FontStyle::Oblique;
  }

  results.push_back(std::move(desc));

  CFRelease(nsUrl);
  CFRelease(nsPath);
  CFRelease(nsFamily);
  CFRelease(nsStyle);
  CFRelease(nsTraits);
}

void FontManagerMacos::readSystemFonts(std::vector<FontDescriptor>& results) {
  static CTFontCollectionRef collection = NULL;
  if (collection == NULL) collection = CTFontCollectionCreateFromAvailableFonts(NULL);

  NSArray *matches = (NSArray *) CTFontCollectionCreateMatchingFontDescriptors(collection);  
  CFIndex count = CFArrayGetCount((CFArrayRef) matches);

  results.reserve(count);

  for (CFIndex i = 0; i < count; i++) {
    CTFontDescriptorRef match = (CTFontDescriptorRef)CFArrayGetValueAtIndex((CFArrayRef)matches, i);
    create_font_descriptor(results, match);
  }

  CFRelease(matches);
}

void FontManagerMacos::populateFallbackFonts(
  std::vector<std::string>& families,
  script_t script
) {
  switch (script) {
    case SCRIPT_COMMON:
    case SCRIPT_INHERITED:
      // In most cases, COMMON and INHERITED characters will be merged into
      // their context, but if they occur without any specific script context
      // we'll just try common default fonts here.
    case SCRIPT_LATIN:
    case SCRIPT_CYRILLIC:
    case SCRIPT_GREEK:
    families.push_back("Lucida Grande");
    break;

  // CJK-related script codes are a bit troublesome because of unification;
  // we'll probably just get HAN much of the time, so the choice of which
  // language font to try for fallback is rather arbitrary. Usually, though,
  // we hope that font prefs will have handled this earlier.
  case SCRIPT_BOPOMOFO:
  case SCRIPT_HAN:
    families.push_back("Songti SC");
    families.push_back("SimSun-ExtB");
    break;

  case SCRIPT_HIRAGANA:
  case SCRIPT_KATAKANA:
    families.push_back("Hiragino Sans");
    families.push_back("Hiragino Kaku Gothic ProN");
    break;

  case SCRIPT_HANGUL:
    families.push_back("Nanum Gothic");
    families.push_back("Apple SD Gothic Neo");
    break;

  // For most other scripts, macOS comes with a default font we can use.
  case SCRIPT_ARABIC:
    families.push_back("Geeza Pro");
    break;
  case SCRIPT_ARMENIAN:
    families.push_back("Mshtakan");
    break;
  case SCRIPT_BENGALI:
    families.push_back("Bangla Sangam MN");
    break;
  case SCRIPT_CHEROKEE:
    families.push_back("Plantagenet Cherokee");
    break;
  case SCRIPT_COPTIC:
    families.push_back("Noto Sans Coptic");
    break;
  case SCRIPT_DESERET:
    families.push_back("Baskerville");
    break;
  case SCRIPT_DEVANAGARI:
    families.push_back("Devanagari Sangam MN");
    break;
  case SCRIPT_ETHIOPIC:
    families.push_back("Kefa");
    break;
  case SCRIPT_GEORGIAN:
    families.push_back("Helvetica");
    break;
  case SCRIPT_GOTHIC:
    families.push_back("Noto Sans Gothic");
    break;
  case SCRIPT_GUJARATI:
    families.push_back("Gujarati Sangam MN");
    break;
  case SCRIPT_GURMUKHI:
    families.push_back("Gurmukhi MN");
    break;
  case SCRIPT_HEBREW:
    families.push_back("Lucida Grande");
    break;
  case SCRIPT_KANNADA:
    families.push_back("Kannada MN");
    break;
  case SCRIPT_KHMER:
    families.push_back("Khmer MN");
    break;
  case SCRIPT_LAO:
    families.push_back("Lao MN");
    break;
  case SCRIPT_MALAYALAM:
    families.push_back("Malayalam Sangam MN");
    break;
  case SCRIPT_MONGOLIAN:
    families.push_back("Noto Sans Mongolian");
    break;
  case SCRIPT_MYANMAR:
    families.push_back("Myanmar MN");
    break;
  case SCRIPT_OGHAM:
    families.push_back("Noto Sans Ogham");
    break;
  case SCRIPT_OLD_ITALIC:
    families.push_back("Noto Sans Old Italic");
    break;
  case SCRIPT_ORIYA:
    families.push_back("Oriya Sangam MN");
    break;
  case SCRIPT_RUNIC:
    families.push_back("Noto Sans Runic");
    break;
  case SCRIPT_SINHALA:
    families.push_back("Sinhala Sangam MN");
    break;
  case SCRIPT_SYRIAC:
    families.push_back("Noto Sans Syriac");
    break;
  case SCRIPT_TAMIL:
    families.push_back("Tamil MN");
    break;
  case SCRIPT_TELUGU:
    families.push_back("Telugu MN");
    break;
  case SCRIPT_THAANA:
    families.push_back("Noto Sans Thaana");
    break;
  case SCRIPT_THAI:
    families.push_back("Thonburi");
    break;
  case SCRIPT_TIBETAN:
    families.push_back("Kailasa");
    break;
  case SCRIPT_CANADIAN_ABORIGINAL:
    families.push_back("Euphemia UCAS");
    break;
  case SCRIPT_YI:
    families.push_back("Noto Sans Yi");
    families.push_back("STHeiti");
    break;
  case SCRIPT_TAGALOG:
    families.push_back("Noto Sans Tagalog");
    break;
  case SCRIPT_HANUNOO:
    families.push_back("Noto Sans Hanunoo");
    break;
  case SCRIPT_BUHID:
    families.push_back("Noto Sans Buhid");
    break;
  case SCRIPT_TAGBANWA:
    families.push_back("Noto Sans Tagbanwa");
    break;
  case SCRIPT_BRAILLE:
    families.push_back("Apple Braille");
    break;
  case SCRIPT_CYPRIOT:
    families.push_back("Noto Sans Cypriot");
    break;
  case SCRIPT_LIMBU:
    families.push_back("Noto Sans Limbu");
    break;
  case SCRIPT_LINEAR_B:
    families.push_back("Noto Sans Linear B");
    break;
  case SCRIPT_OSMANYA:
    families.push_back("Noto Sans Osmanya");
    break;
  case SCRIPT_SHAVIAN:
    families.push_back("Noto Sans Shavian");
    break;
  case SCRIPT_TAI_LE:
    families.push_back("Noto Sans Tai Le");
    break;
  case SCRIPT_UGARITIC:
    families.push_back("Noto Sans Ugaritic");
    break;
  case SCRIPT_BUGINESE:
    families.push_back("Noto Sans Buginese");
    break;
  case SCRIPT_GLAGOLITIC:
    families.push_back("Noto Sans Glagolitic");
    break;
  case SCRIPT_KHAROSHTHI:
    families.push_back("Noto Sans Kharoshthi");
    break;
  case SCRIPT_SYLOTI_NAGRI:
    families.push_back("Noto Sans Syloti Nagri");
    break;
  case SCRIPT_NEW_TAI_LUE:
    families.push_back("Noto Sans New Tai Lue");
    break;
  case SCRIPT_TIFINAGH:
    families.push_back("Noto Sans Tifinagh");
    break;
  case SCRIPT_OLD_PERSIAN:
    families.push_back("Noto Sans Old Persian");
    break;
  case SCRIPT_BALINESE:
    families.push_back("Noto Sans Balinese");
    break;
  case SCRIPT_BATAK:
    families.push_back("Noto Sans Batak");
    break;
  case SCRIPT_BRAHMI:
    families.push_back("Noto Sans Brahmi");
    break;
  case SCRIPT_CHAM:
    families.push_back("Noto Sans Cham");
    break;
  case SCRIPT_EGYPTIAN_HIEROGLYPHS:
    families.push_back("Noto Sans Egyptian Hieroglyphs");
    break;
  case SCRIPT_PAHAWH_HMONG:
    families.push_back("Noto Sans Pahawh Hmong");
    break;
  case SCRIPT_OLD_HUNGARIAN:
    families.push_back("Noto Sans Old Hungarian");
    break;
  case SCRIPT_JAVANESE:
    families.push_back("Noto Sans Javanese");
    break;
  case SCRIPT_KAYAH_LI:
    families.push_back("Noto Sans Kayah Li");
    break;
  case SCRIPT_LEPCHA:
    families.push_back("Noto Sans Lepcha");
    break;
  case SCRIPT_LINEAR_A:
    families.push_back("Noto Sans Linear A");
    break;
  case SCRIPT_MANDAIC:
    families.push_back("Noto Sans Mandaic");
    break;
  case SCRIPT_NKO:
    families.push_back("Noto Sans NKo");
    break;
  case SCRIPT_OLD_TURKIC:
    families.push_back("Noto Sans Old Turkic");
    break;
  case SCRIPT_OLD_PERMIC:
    families.push_back("Noto Sans Old Permic");
    break;
  case SCRIPT_PHAGS_PA:
    families.push_back("Noto Sans PhagsPa");
    break;
  case SCRIPT_PHOENICIAN:
    families.push_back("Noto Sans Phoenician");
    break;
  case SCRIPT_MIAO:
    families.push_back("Noto Sans Miao");
    break;
  case SCRIPT_VAI:
    families.push_back("Noto Sans Vai");
    break;
  case SCRIPT_CUNEIFORM:
    families.push_back("Noto Sans Cuneiform");
    break;
  case SCRIPT_CARIAN:
    families.push_back("Noto Sans Carian");
    break;
  case SCRIPT_TAI_THAM:
    families.push_back("Noto Sans Tai Tham");
    break;
  case SCRIPT_LYCIAN:
    families.push_back("Noto Sans Lycian");
    break;
  case SCRIPT_LYDIAN:
    families.push_back("Noto Sans Lydian");
    break;
  case SCRIPT_OL_CHIKI:
    families.push_back("Noto Sans Ol Chiki");
    break;
  case SCRIPT_REJANG:
    families.push_back("Noto Sans Rejang");
    break;
  case SCRIPT_SAURASHTRA:
    families.push_back("Noto Sans Saurashtra");
    break;
  case SCRIPT_SUNDANESE:
    families.push_back("Noto Sans Sundanese");
    break;
  case SCRIPT_MEETEI_MAYEK:
    families.push_back("Noto Sans Meetei Mayek");
    break;
  case SCRIPT_IMPERIAL_ARAMAIC:
    families.push_back("Noto Sans Imperial Aramaic");
    break;
  case SCRIPT_AVESTAN:
    families.push_back("Noto Sans Avestan");
    break;
  case SCRIPT_CHAKMA:
    families.push_back("Noto Sans Chakma");
    break;
  case SCRIPT_KAITHI:
    families.push_back("Noto Sans Kaithi");
    break;
  case SCRIPT_MANICHAEAN:
    families.push_back("Noto Sans Manichaean");
    break;
  case SCRIPT_INSCRIPTIONAL_PAHLAVI:
    families.push_back("Noto Sans Inscriptional Pahlavi");
    break;
  case SCRIPT_PSALTER_PAHLAVI:
    families.push_back("Noto Sans Psalter Pahlavi");
    break;
  case SCRIPT_INSCRIPTIONAL_PARTHIAN:
    families.push_back("Noto Sans Inscriptional Parthian");
    break;
  case SCRIPT_SAMARITAN:
    families.push_back("Noto Sans Samaritan");
    break;
  case SCRIPT_TAI_VIET:
    families.push_back("Noto Sans Tai Viet");
    break;
  case SCRIPT_BAMUM:
    families.push_back("Noto Sans Bamum");
    break;
  case SCRIPT_LISU:
    families.push_back("Noto Sans Lisu");
    break;
  case SCRIPT_OLD_SOUTH_ARABIAN:
    families.push_back("Noto Sans Old South Arabian");
    break;
  case SCRIPT_BASSA_VAH:
    families.push_back("Noto Sans Bassa Vah");
    break;
  case SCRIPT_DUPLOYAN:
    families.push_back("Noto Sans Duployan");
    break;
  case SCRIPT_ELBASAN:
    families.push_back("Noto Sans Elbasan");
    break;
  case SCRIPT_GRANTHA:
    families.push_back("Noto Sans Grantha");
    break;
  case SCRIPT_MENDE_KIKAKUI:
    families.push_back("Noto Sans Mende Kikakui");
    break;
  case SCRIPT_MEROITIC_CURSIVE:
  case SCRIPT_MEROITIC_HIEROGLYPHS:
    families.push_back("Noto Sans Meroitic");
    break;
  case SCRIPT_OLD_NORTH_ARABIAN:
    families.push_back("Noto Sans Old North Arabian");
    break;
  case SCRIPT_NABATAEAN:
    families.push_back("Noto Sans Nabataean");
    break;
  case SCRIPT_PALMYRENE:
    families.push_back("Noto Sans Palmyrene");
    break;
  case SCRIPT_KHUDAWADI:
    families.push_back("Noto Sans Khudawadi");
    break;
  case SCRIPT_WARANG_CITI:
    families.push_back("Noto Sans Warang Citi");
    break;
  case SCRIPT_MRO:
    families.push_back("Noto Sans Mro");
    break;
  case SCRIPT_SHARADA:
    families.push_back("Noto Sans Sharada");
    break;
  case SCRIPT_SORA_SOMPENG:
    families.push_back("Noto Sans Sora Sompeng");
    break;
  case SCRIPT_TAKRI:
    families.push_back("Noto Sans Takri");
    break;
  case SCRIPT_KHOJKI:
    families.push_back("Noto Sans Khojki");
    break;
  case SCRIPT_TIRHUTA:
    families.push_back("Noto Sans Tirhuta");
    break;
  case SCRIPT_CAUCASIAN_ALBANIAN:
    families.push_back("Noto Sans Caucasian Albanian");
    break;
  case SCRIPT_MAHAJANI:
    families.push_back("Noto Sans Mahajani");
    break;
  case SCRIPT_AHOM:
    families.push_back("Noto Serif Ahom");
    break;
  case SCRIPT_HATRAN:
    families.push_back("Noto Sans Hatran");
    break;
  case SCRIPT_MODI:
    families.push_back("Noto Sans Modi");
    break;
  case SCRIPT_MULTANI:
    families.push_back("Noto Sans Multani");
    break;
  case SCRIPT_PAU_CIN_HAU:
    families.push_back("Noto Sans Pau Cin Hau");
    break;
  case SCRIPT_SIDDHAM:
    families.push_back("Noto Sans Siddham");
    break;
  case SCRIPT_ADLAM:
    families.push_back("Noto Sans Adlam");
    break;
  case SCRIPT_BHAIKSUKI:
    families.push_back("Noto Sans Bhaiksuki");
    break;
  case SCRIPT_MARCHEN:
    families.push_back("Noto Sans Marchen");
    break;
  case SCRIPT_NEWA:
    families.push_back("Noto Sans Newa");
    break;
  case SCRIPT_OSAGE:
    families.push_back("Noto Sans Osage");
    break;
  case SCRIPT_HANIFI_ROHINGYA:
    families.push_back("Noto Sans Hanifi Rohingya");
    break;
  case SCRIPT_WANCHO:
    families.push_back("Noto Sans Wancho");
    break;

  // Script codes for which no commonly-installed font is currently known.
  // Probably future macOS versions will add Noto fonts for many of these,
  // so we should watch for updates.
  case SCRIPT_NONE:
  case SCRIPT_NUSHU:
  case SCRIPT_TANGUT:
  case SCRIPT_ANATOLIAN_HIEROGLYPHS:
  case SCRIPT_MASARAM_GONDI:
  case SCRIPT_SOYOMBO:
  case SCRIPT_ZANABAZAR_SQUARE:
  case SCRIPT_DOGRA:
  case SCRIPT_GUNJALA_GONDI:
  case SCRIPT_MAKASAR:
  case SCRIPT_MEDEFAIDRIN:
  case SCRIPT_SOGDIAN:
  case SCRIPT_OLD_SOGDIAN:
  case SCRIPT_ELYMAIC:
  case SCRIPT_NYIAKENG_PUACHUE_HMONG:
  case SCRIPT_NANDINAGARI:
  case SCRIPT_CHORASMIAN:
  case SCRIPT_DIVES_AKURU:
  case SCRIPT_KHITAN_SMALL_SCRIPT:
  case SCRIPT_YEZIDI:
  case SCRIPT_CYPRO_MINOAN:
  case SCRIPT_OLD_UYGHUR:
  case SCRIPT_TANGSA:
  case SCRIPT_TOTO:
  case SCRIPT_VITHKUQI:
  case SCRIPT_KAWI:
  case SCRIPT_NAG_MUNDARI:
  case SCRIPT_GARAY:
  case SCRIPT_GURUNG_KHEMA:
  case SCRIPT_KIRAT_RAI:
  case SCRIPT_OL_ONAL:
  case SCRIPT_SIGNWRITING:
  case SCRIPT_SUNUWAR:
  case SCRIPT_TODHRI:
  case SCRIPT_TULU_TIGALARI:
    break;
  }

  // TODO: Color Emoji should depend on if the default presentation for the
  // codepoint is color or if a VS16 selector is present.

  families.push_back("Apple Color Emoji");

  // TODO: Firefox makes the middle these 6 conditional on the codepoint.
  // When users try to paint text that isn't in the first few families, this
  // is going to be slower than it needs to be. Original Firefox comment next...
  // 
  // Symbols/dingbats are generally Script=COMMON but may be resolved to any
  // surrounding script run. So we'll always append a couple of likely fonts
  // for such characters.
  families.push_back("Zapf Dingbats");
  families.push_back("Geneva");
  families.push_back("STIXGeneral");
  families.push_back("Apple Symbols");
  // Japanese fonts also cover a lot of miscellaneous symbols
  families.push_back("Hiragino Sans");
  families.push_back("Hiragino Kaku Gothic ProN");

  // Arial Unicode MS has lots of glyphs for obscure characters; try it as a
  // last resort.
  families.push_back("Arial Unicode MS");
}

// See the preferences font.name-list.*.x-western in Firefox
const std::vector<std::string> serif_fonts = {"Times", "Times New Roman"};
const std::vector<std::string> sans_serif_fonts = {"Helvetica", "Arial"};
const std::vector<std::string> monospace_fonts = {"Menlo"};
const std::vector<std::string> cursive_fonts = {"Apple Chancery"};
const std::vector<std::string> fantasy_fonts = {"Papyrus"};

std::optional<const std::vector<std::string>*>
FontManagerMacos::getGenericList(const std::string& generic) {
  if (generic == "serif") {
    return &serif_fonts;
  } else if (generic == "sans-serif") {
    return &sans_serif_fonts;
  } else if (generic == "monospace") {
    return &monospace_fonts;
  } else if (generic == "cursive") {
    return &cursive_fonts;
  } else if (generic == "fantasy") {
    return &fantasy_fonts;
  } else {
    return std::nullopt;
  }
}
