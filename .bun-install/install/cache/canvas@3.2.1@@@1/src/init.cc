// Copyright (c) 2010 LearnBoost <tj@learnboost.com>

#include <cstdio>
#include <pango/pango.h>

#include <cairo.h>
#if CAIRO_VERSION < CAIRO_VERSION_ENCODE(1, 10, 0)
// CAIRO_FORMAT_RGB16_565: undeprecated in v1.10.0
// CAIRO_STATUS_INVALID_SIZE: v1.10.0
// CAIRO_FORMAT_INVALID: v1.10.0
// Lots of the compositing operators: v1.10.0
// JPEG MIME tracking: v1.10.0
// Note: CAIRO_FORMAT_RGB30 is v1.12.0 and still optional
#error("cairo v1.10.0 or later is required")
#endif

#include "Backends.h"
#include "Canvas.h"
#include "CanvasGradient.h"
#include "CanvasPattern.h"
#include "CanvasRenderingContext2d.h"
#include "Image.h"
#include "ImageData.h"
#include "InstanceData.h"

#include <ft2build.h>
#include FT_FREETYPE_H

/*
 * Save some external modules as private references.
 */

static void
setDOMMatrix(const Napi::CallbackInfo& info) {
  InstanceData* data = info.Env().GetInstanceData<InstanceData>();
  data->DOMMatrixCtor = Napi::Persistent(info[0].As<Napi::Function>());
}

static void
setParseFont(const Napi::CallbackInfo& info) {
  InstanceData* data = info.Env().GetInstanceData<InstanceData>();
  data->parseFont = Napi::Persistent(info[0].As<Napi::Function>());
}

// Compatibility with Visual Studio versions prior to VS2015
#if defined(_MSC_VER) && _MSC_VER < 1900
#define snprintf _snprintf
#endif

Napi::Object init(Napi::Env env, Napi::Object exports) {
  env.SetInstanceData(new InstanceData());

  Backends::Initialize(env, exports);
  Canvas::Initialize(env, exports);
  Image::Initialize(env, exports);
  ImageData::Initialize(env, exports);
  Context2d::Initialize(env, exports);
  Gradient::Initialize(env, exports);
  Pattern::Initialize(env, exports);

  exports.Set("setDOMMatrix", Napi::Function::New(env, &setDOMMatrix));
  exports.Set("setParseFont", Napi::Function::New(env, &setParseFont));

  exports.Set("cairoVersion", Napi::String::New(env, cairo_version_string()));
#ifdef HAVE_JPEG

#ifndef JPEG_LIB_VERSION_MAJOR
#ifdef JPEG_LIB_VERSION
#define JPEG_LIB_VERSION_MAJOR (JPEG_LIB_VERSION / 10)
#else
#define JPEG_LIB_VERSION_MAJOR 0
#endif
#endif

#ifndef JPEG_LIB_VERSION_MINOR
#ifdef JPEG_LIB_VERSION
#define JPEG_LIB_VERSION_MINOR (JPEG_LIB_VERSION % 10)
#else
#define JPEG_LIB_VERSION_MINOR 0
#endif
#endif

  char jpeg_version[10];
  static bool minor_gt_0 = JPEG_LIB_VERSION_MINOR > 0;
  if (minor_gt_0) {
    snprintf(jpeg_version, 10, "%d%c", JPEG_LIB_VERSION_MAJOR, JPEG_LIB_VERSION_MINOR + 'a' - 1);
  } else {
    snprintf(jpeg_version, 10, "%d", JPEG_LIB_VERSION_MAJOR);
  }
  exports.Set("jpegVersion", Napi::String::New(env, jpeg_version));
#endif

#ifdef HAVE_GIF
#ifndef GIF_LIB_VERSION
  char gif_version[10];
  snprintf(gif_version, 10, "%d.%d.%d", GIFLIB_MAJOR, GIFLIB_MINOR, GIFLIB_RELEASE);
  exports.Set("gifVersion", Napi::String::New(env, gif_version));
#else
  exports.Set("gifVersion", Napi::String::New(env, GIF_LIB_VERSION));
#endif
#endif

#ifdef HAVE_RSVG
  exports.Set("rsvgVersion", Napi::String::New(env, LIBRSVG_VERSION));
#endif

  exports.Set("pangoVersion", Napi::String::New(env, PANGO_VERSION_STRING));

  char freetype_version[10];
  snprintf(freetype_version, 10, "%d.%d.%d", FREETYPE_MAJOR, FREETYPE_MINOR, FREETYPE_PATCH);
  exports.Set("freetypeVersion", Napi::String::New(env, freetype_version));

  return exports;
}

NODE_API_MODULE(canvas, init);
