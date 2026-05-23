// Copyright (c) 2010 LearnBoost <tj@learnboost.com>

#pragma once

struct Closure;

#include "backend/Backend.h"
#include "closure.h"
#include <cairo.h>
#include "dll_visibility.h"
#include <napi.h>
#include <pango/pangocairo.h>
#include <vector>
#include <cstddef>

/*
 * FontFace describes a font file in terms of one PangoFontDescription that
 * will resolve to it and one that the user describes it as (like @font-face)
 */
class FontFace {
  public:
    PangoFontDescription *sys_desc = nullptr;
    PangoFontDescription *user_desc = nullptr;
    unsigned char file_path[1024];
};

enum text_baseline_t : uint8_t {
  TEXT_BASELINE_ALPHABETIC = 0,
  TEXT_BASELINE_TOP = 1,
  TEXT_BASELINE_BOTTOM = 2,
  TEXT_BASELINE_MIDDLE = 3,
  TEXT_BASELINE_IDEOGRAPHIC = 4,
  TEXT_BASELINE_HANGING = 5
};

enum text_align_t : int8_t {
  TEXT_ALIGNMENT_LEFT = -1,
  TEXT_ALIGNMENT_CENTER = 0,
  TEXT_ALIGNMENT_RIGHT = 1,
  TEXT_ALIGNMENT_START = -2,
  TEXT_ALIGNMENT_END = 2
};

enum canvas_draw_mode_t : uint8_t {
  TEXT_DRAW_PATHS,
  TEXT_DRAW_GLYPHS
};

/*
 * Canvas.
 */

class Canvas : public Napi::ObjectWrap<Canvas> {
  public:
    Canvas(const Napi::CallbackInfo& info);
    static void Initialize(Napi::Env& env, Napi::Object& target);

    Napi::Value ToBuffer(const Napi::CallbackInfo& info);
    Napi::Value GetType(const Napi::CallbackInfo& info);
    Napi::Value GetStride(const Napi::CallbackInfo& info);
    Napi::Value GetWidth(const Napi::CallbackInfo& info);
    Napi::Value GetHeight(const Napi::CallbackInfo& info);
    void SetWidth(const Napi::CallbackInfo& info, const Napi::Value& value);
    void SetHeight(const Napi::CallbackInfo& info, const Napi::Value& value);
    void StreamPNGSync(const Napi::CallbackInfo& info);
    void StreamPDFSync(const Napi::CallbackInfo& info);
    void StreamJPEGSync(const Napi::CallbackInfo& info);
    static void RegisterFont(const Napi::CallbackInfo& info);
    static void DeregisterAllFonts(const Napi::CallbackInfo& info);
    static Napi::Value ParseFont(const Napi::CallbackInfo& info);
    Napi::Error CairoError(cairo_status_t status);
    static void ToPngBufferAsync(Closure* closure);
    static void ToJpegBufferAsync(Closure* closure);
    static PangoWeight GetWeightFromCSSString(const char *weight);
    static PangoStyle GetStyleFromCSSString(const char *style);
    static PangoFontDescription *ResolveFontDescription(const PangoFontDescription *desc);

    DLL_PUBLIC inline Backend* backend() { return _backend; }
    DLL_PUBLIC inline cairo_surface_t* surface(){ return backend()->ensureSurface(); }
    cairo_t* createCairoContext();

    DLL_PUBLIC inline uint8_t *data(){ return cairo_image_surface_get_data(surface()); }
    DLL_PUBLIC inline int stride(){ return cairo_image_surface_get_stride(surface()); }
    DLL_PUBLIC inline std::size_t nBytes(){
      return static_cast<std::size_t>(backend()->getHeight()) * stride();
    }

    DLL_PUBLIC inline int getWidth() { return backend()->getWidth(); }
    DLL_PUBLIC inline int getHeight() { return backend()->getHeight(); }

    void resurface(Napi::Object This);

    Napi::Env env;
    static int fontSerial;

  private:
    Backend* _backend;
    Napi::ObjectReference _jsBackend;
    Napi::FunctionReference ctor;
    static std::vector<FontFace> font_face_list;
};
