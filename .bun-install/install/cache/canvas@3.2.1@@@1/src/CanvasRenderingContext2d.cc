// Copyright (c) 2010 LearnBoost <tj@learnboost.com>

#include "CanvasRenderingContext2d.h"

#include <algorithm>
#include "backend/ImageBackend.h"
#include <cairo-pdf.h>
#include "Canvas.h"
#include "CanvasGradient.h"
#include "CanvasPattern.h"
#include "InstanceData.h"
#include "FontParser.h"
#include <cmath>
#include <cstdlib>
#include "Image.h"
#include "ImageData.h"
#include <limits>
#include <map>
#include "Point.h"
#include <string>
#include "Util.h"
#include <vector>

/*
 * Rectangle arg assertions.
 */

#define RECT_ARGS \
  double args[4]; \
  if(!checkArgs(info, args, 4)) \
    return; \
  double x = args[0]; \
  double y = args[1]; \
  double width = args[2]; \
  double height = args[3];

constexpr double twoPi = M_PI * 2.;

/*
 * Simple helper macro for a rather verbose function call.
 */

#define PANGO_LAYOUT_GET_METRICS(LAYOUT) pango_context_get_metrics( \
   pango_layout_get_context(LAYOUT), \
   pango_layout_get_font_description(LAYOUT), \
   pango_language_from_string(state->lang.c_str()))

inline static bool checkArgs(const Napi::CallbackInfo&info, double *args, int argsNum, int offset = 0){
  Napi::Env env = info.Env();
  int argsEnd = std::min(9, offset + argsNum);
  bool areArgsValid = true;

  napi_value argv[9];
  size_t argc = 9;
  napi_get_cb_info(env, static_cast<napi_callback_info>(info), &argc, argv, nullptr, nullptr);

  for (int i = offset; i < argsEnd; i++) {
    napi_valuetype type;
    double val = 0;

    napi_typeof(env, argv[i], &type);
    if (type == napi_number) {
      // fast path
      napi_get_value_double(env, argv[i], &val);
    } else {
      napi_value num;
      if (napi_coerce_to_number(env, argv[i], &num) == napi_ok) {
        napi_get_value_double(env, num, &val);
      }
    }

    if (areArgsValid) {
      if (!std::isfinite(val)) {
        // We should continue the loop instead of returning immediately
        // See https://html.spec.whatwg.org/multipage/canvas.html

        areArgsValid = false;
        continue;
      }

      args[i - offset] = val;
    }
  }

  return areArgsValid;
}

/*
 * Initialize Context2d.
 */

void
Context2d::Initialize(Napi::Env& env, Napi::Object& exports) {
  Napi::HandleScope scope(env);
  InstanceData* data = env.GetInstanceData<InstanceData>();

  Napi::Function ctor = DefineClass(env, "CanvasRenderingContext2D", {
    InstanceMethod<&Context2d::DrawImage>("drawImage", napi_default_method),
    InstanceMethod<&Context2d::PutImageData>("putImageData", napi_default_method),
    InstanceMethod<&Context2d::GetImageData>("getImageData", napi_default_method),
    InstanceMethod<&Context2d::CreateImageData>("createImageData", napi_default_method),
    InstanceMethod<&Context2d::AddPage>("addPage", napi_default_method),
    InstanceMethod<&Context2d::Save>("save", napi_default_method),
    InstanceMethod<&Context2d::Restore>("restore", napi_default_method),
    InstanceMethod<&Context2d::Rotate>("rotate", napi_default_method),
    InstanceMethod<&Context2d::Translate>("translate", napi_default_method),
    InstanceMethod<&Context2d::Transform>("transform", napi_default_method),
    InstanceMethod<&Context2d::GetTransform>("getTransform", napi_default_method),
    InstanceMethod<&Context2d::ResetTransform>("resetTransform", napi_default_method),
    InstanceMethod<&Context2d::SetTransform>("setTransform", napi_default_method),
    InstanceMethod<&Context2d::IsPointInPath>("isPointInPath", napi_default_method),
    InstanceMethod<&Context2d::Scale>("scale", napi_default_method),
    InstanceMethod<&Context2d::Clip>("clip", napi_default_method),
    InstanceMethod<&Context2d::Fill>("fill", napi_default_method),
    InstanceMethod<&Context2d::Stroke>("stroke", napi_default_method),
    InstanceMethod<&Context2d::FillText>("fillText", napi_default_method),
    InstanceMethod<&Context2d::StrokeText>("strokeText", napi_default_method),
    InstanceMethod<&Context2d::FillRect>("fillRect", napi_default_method),
    InstanceMethod<&Context2d::StrokeRect>("strokeRect", napi_default_method),
    InstanceMethod<&Context2d::ClearRect>("clearRect", napi_default_method),
    InstanceMethod<&Context2d::Rect>("rect", napi_default_method),
    InstanceMethod<&Context2d::RoundRect>("roundRect", napi_default_method),
    InstanceMethod<&Context2d::MeasureText>("measureText", napi_default_method),
    InstanceMethod<&Context2d::MoveTo>("moveTo", napi_default_method),
    InstanceMethod<&Context2d::LineTo>("lineTo", napi_default_method),
    InstanceMethod<&Context2d::BezierCurveTo>("bezierCurveTo", napi_default_method),
    InstanceMethod<&Context2d::QuadraticCurveTo>("quadraticCurveTo", napi_default_method),
    InstanceMethod<&Context2d::BeginPath>("beginPath", napi_default_method),
    InstanceMethod<&Context2d::ClosePath>("closePath", napi_default_method),
    InstanceMethod<&Context2d::Arc>("arc", napi_default_method),
    InstanceMethod<&Context2d::ArcTo>("arcTo", napi_default_method),
    InstanceMethod<&Context2d::Ellipse>("ellipse", napi_default_method),
    InstanceMethod<&Context2d::SetLineDash>("setLineDash", napi_default_method),
    InstanceMethod<&Context2d::GetLineDash>("getLineDash", napi_default_method),
    InstanceMethod<&Context2d::CreatePattern>("createPattern", napi_default_method),
    InstanceMethod<&Context2d::CreateLinearGradient>("createLinearGradient", napi_default_method),
    InstanceMethod<&Context2d::CreateRadialGradient>("createRadialGradient", napi_default_method),
    #if CAIRO_VERSION >= CAIRO_VERSION_ENCODE(1, 16, 0)
    InstanceMethod<&Context2d::BeginTag>("beginTag", napi_default_method),
    InstanceMethod<&Context2d::EndTag>("endTag", napi_default_method),
    #endif
    InstanceAccessor<&Context2d::GetFormat>("pixelFormat", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetPatternQuality, &Context2d::SetPatternQuality>("patternQuality", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetImageSmoothingEnabled, &Context2d::SetImageSmoothingEnabled>("imageSmoothingEnabled", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetGlobalCompositeOperation, &Context2d::SetGlobalCompositeOperation>("globalCompositeOperation", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetGlobalAlpha, &Context2d::SetGlobalAlpha>("globalAlpha", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetShadowColor, &Context2d::SetShadowColor>("shadowColor", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetMiterLimit, &Context2d::SetMiterLimit>("miterLimit", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetLineWidth, &Context2d::SetLineWidth>("lineWidth", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetLineCap, &Context2d::SetLineCap>("lineCap", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetLineJoin, &Context2d::SetLineJoin>("lineJoin", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetLineDashOffset, &Context2d::SetLineDashOffset>("lineDashOffset", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetShadowOffsetX, &Context2d::SetShadowOffsetX>("shadowOffsetX", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetShadowOffsetY, &Context2d::SetShadowOffsetY>("shadowOffsetY", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetShadowBlur, &Context2d::SetShadowBlur>("shadowBlur", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetAntiAlias, &Context2d::SetAntiAlias>("antialias", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetTextDrawingMode, &Context2d::SetTextDrawingMode>("textDrawingMode", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetQuality, &Context2d::SetQuality>("quality", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetCurrentTransform, &Context2d::SetCurrentTransform>("currentTransform", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetFillStyle, &Context2d::SetFillStyle>("fillStyle", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetStrokeStyle, &Context2d::SetStrokeStyle>("strokeStyle", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetFont, &Context2d::SetFont>("font", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetTextBaseline, &Context2d::SetTextBaseline>("textBaseline", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetTextAlign, &Context2d::SetTextAlign>("textAlign", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetDirection, &Context2d::SetDirection>("direction", napi_default_jsproperty),
    InstanceAccessor<&Context2d::GetLanguage, &Context2d::SetLanguage>("lang", napi_default_jsproperty)
  });

  exports.Set("CanvasRenderingContext2d", ctor);
  data->Context2dCtor = Napi::Persistent(ctor);
}

/*
 * Create a cairo context.
 */

Context2d::Context2d(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Context2d>(info), env(info.Env()) {
  InstanceData* data = env.GetInstanceData<InstanceData>();

  if (!info[0].IsObject()) {
    Napi::TypeError::New(env, "Canvas expected").ThrowAsJavaScriptException();
    return;
  }

  Napi::Object obj = info[0].As<Napi::Object>();
  if (!obj.InstanceOf(data->CanvasCtor.Value()).UnwrapOr(false)) {
    if (!env.IsExceptionPending()) {
      Napi::TypeError::New(env, "Canvas expected").ThrowAsJavaScriptException();
    }
    return;
  }

  _canvas = Canvas::Unwrap(obj);

  bool isImageBackend = _canvas->backend()->getName() == "image";
  if (isImageBackend) {
    cairo_format_t format = ImageBackend::DEFAULT_FORMAT;

    if (info[1].IsObject()) {
      Napi::Object ctxAttributes = info[1].As<Napi::Object>();
      Napi::Value pixelFormat;

      if (ctxAttributes.Get("pixelFormat").UnwrapTo(&pixelFormat) && pixelFormat.IsString()) {
        std::string utf8PixelFormat = pixelFormat.As<Napi::String>();
        if (utf8PixelFormat == "RGBA32") format = CAIRO_FORMAT_ARGB32;
        else if (utf8PixelFormat == "RGB24") format = CAIRO_FORMAT_RGB24;
        else if (utf8PixelFormat == "A8") format = CAIRO_FORMAT_A8;
        else if (utf8PixelFormat == "RGB16_565") format = CAIRO_FORMAT_RGB16_565;
        else if (utf8PixelFormat == "A1") format = CAIRO_FORMAT_A1;
#ifdef CAIRO_FORMAT_RGB30
        else if (utf8PixelFormat == "RGB30") format = CAIRO_FORMAT_RGB30;
#endif
      }

      // alpha: false forces use of RGB24
      Napi::Value alpha;

      if (ctxAttributes.Get("alpha").UnwrapTo(&alpha) && alpha.IsBoolean() && !alpha.As<Napi::Boolean>().Value()) {
        format = CAIRO_FORMAT_RGB24;
      }
    }

    static_cast<ImageBackend *>(_canvas->backend())->setFormat(format);
  }

  _context = _canvas->createCairoContext();
  _layout = pango_cairo_create_layout(_context);

  // As of January 2023, Pango rounds glyph positions which renders text wider
  // or narrower than the browser. See #2184 for more information
#if PANGO_VERSION_CHECK(1, 44, 0)
  pango_context_set_round_glyph_positions(pango_layout_get_context(_layout), FALSE);
#endif

  pango_layout_set_auto_dir(_layout, FALSE);

  states.emplace();
  state = &states.top();
  pango_layout_set_font_description(_layout, state->fontDescription);
}

/*
 * Destroy cairo context.
 */

Context2d::~Context2d() {
  if (_layout) g_object_unref(_layout);
  if (_context) cairo_destroy(_context);
  _resetPersistentHandles();
}

/*
 * Reset canvas state.
 */

void Context2d::resetState() {
  states.pop();
  states.emplace();
  pango_layout_set_font_description(_layout, state->fontDescription);
  _resetPersistentHandles();
}

void Context2d::_resetPersistentHandles() {
  _fillStyle.Reset();
  _strokeStyle.Reset();
}

/*
 * Save cairo / canvas state.
 */

void
Context2d::save() {
  cairo_save(_context);
  states.emplace(states.top());
  state = &states.top();
}

/*
 * Restore cairo / canvas state.
 */

void
Context2d::restore() {
  if (states.size() > 1) {
    cairo_restore(_context);
    states.pop();
    state = &states.top();
    pango_layout_set_font_description(_layout, state->fontDescription);
  }
}

/*
 * Save flat path.
 */

void
Context2d::savePath() {
  _path = cairo_copy_path_flat(_context);
  cairo_new_path(_context);
}

/*
 * Restore flat path.
 */

void
Context2d::restorePath() {
  cairo_new_path(_context);
  cairo_append_path(_context, _path);
  cairo_path_destroy(_path);
}

/*
 * Create temporary surface for gradient or pattern transparency
 */
cairo_pattern_t*
create_transparent_gradient(cairo_pattern_t *source, float alpha) {
  double x0;
  double y0;
  double x1;
  double y1;
  double r0;
  double r1;
  int count;
  int i;
  double offset;
  double r;
  double g;
  double b;
  double a;
  cairo_pattern_t *newGradient;
  cairo_pattern_type_t type = cairo_pattern_get_type(source);
  cairo_pattern_get_color_stop_count(source, &count);
  if (type == CAIRO_PATTERN_TYPE_LINEAR) {
    cairo_pattern_get_linear_points (source, &x0, &y0, &x1, &y1);
    newGradient = cairo_pattern_create_linear(x0, y0, x1, y1);
  } else if (type == CAIRO_PATTERN_TYPE_RADIAL) {
    cairo_pattern_get_radial_circles(source, &x0, &y0, &r0, &x1, &y1, &r1);
    newGradient = cairo_pattern_create_radial(x0, y0, r0, x1, y1, r1);
  } else {
    return NULL;
  }
  for ( i = 0; i < count; i++ ) {
    cairo_pattern_get_color_stop_rgba(source, i, &offset, &r, &g, &b, &a);
    cairo_pattern_add_color_stop_rgba(newGradient, offset, r, g, b, a * alpha);
  }
  return newGradient;
}

cairo_pattern_t*
create_transparent_pattern(cairo_pattern_t *source, float alpha) {
  cairo_surface_t *surface;
  cairo_pattern_get_surface(source, &surface);
  int width = cairo_image_surface_get_width(surface);
  int height = cairo_image_surface_get_height(surface);
  cairo_surface_t *mask_surface = cairo_image_surface_create(
    CAIRO_FORMAT_ARGB32,
    width,
    height);
  cairo_t *mask_context = cairo_create(mask_surface);
  if (cairo_status(mask_context) != CAIRO_STATUS_SUCCESS) {
    return NULL;
  }
  cairo_set_source(mask_context, source);
  cairo_paint_with_alpha(mask_context, alpha);
  cairo_destroy(mask_context);
  cairo_pattern_t* newPattern = cairo_pattern_create_for_surface(mask_surface);
  cairo_surface_destroy(mask_surface);
  return newPattern;
}

/*
 * Fill and apply shadow.
 */

void
Context2d::setFillRule(Napi::Value value) {
  cairo_fill_rule_t rule = CAIRO_FILL_RULE_WINDING;
  if (value.IsString()) {
    std::string str = value.As<Napi::String>().Utf8Value();
    if (str == "evenodd") {
      rule = CAIRO_FILL_RULE_EVEN_ODD;
    }
  }
  cairo_set_fill_rule(_context, rule);
}

void
Context2d::fill(bool preserve) {
  cairo_pattern_t *new_pattern;
  bool needsRestore = false;
  if (state->fillPattern) {
    if (state->globalAlpha < 1) {
      new_pattern = create_transparent_pattern(state->fillPattern, state->globalAlpha);
      if (new_pattern == NULL) {
        Napi::Error::New(env, "Failed to initialize context").ThrowAsJavaScriptException();
        // failed to allocate
        return;
      }
      cairo_set_source(_context, new_pattern);
      cairo_pattern_destroy(new_pattern);
    } else {
      cairo_pattern_set_filter(state->fillPattern, state->patternQuality);
      cairo_set_source(_context, state->fillPattern);
    }
    repeat_type_t repeat = Pattern::get_repeat_type_for_cairo_pattern(state->fillPattern);
    if (repeat == NO_REPEAT) {
      cairo_pattern_set_extend(cairo_get_source(_context), CAIRO_EXTEND_NONE);
    } else if (repeat == REPEAT) {
      cairo_pattern_set_extend(cairo_get_source(_context), CAIRO_EXTEND_REPEAT);
    } else {
      cairo_save(_context);
      cairo_path_t *savedPath = cairo_copy_path(_context);
      cairo_surface_t *patternSurface = nullptr;
      cairo_pattern_get_surface(cairo_get_source(_context), &patternSurface);

      double width, height;
      if (repeat == REPEAT_X) {
        double x1, x2;
        cairo_path_extents(_context, &x1, nullptr, &x2, nullptr);
        width = x2 - x1;
        height = cairo_image_surface_get_height(patternSurface);
      } else {
        double y1, y2;
        cairo_path_extents(_context, nullptr, &y1, nullptr, &y2);
        width = cairo_image_surface_get_width(patternSurface);
        height = y2 - y1;
      }

      cairo_new_path(_context);
      cairo_rectangle(_context, 0, 0, width, height);
      cairo_clip(_context);
      cairo_append_path(_context, savedPath);
      cairo_path_destroy(savedPath);
      cairo_pattern_set_extend(cairo_get_source(_context), CAIRO_EXTEND_REPEAT);
      needsRestore = true;
    }
  } else if (state->fillGradient) {
    if (state->globalAlpha < 1) {
      new_pattern = create_transparent_gradient(state->fillGradient, state->globalAlpha);
      if (new_pattern == NULL) {
        Napi::Error::New(env, "Unexpected gradient type").ThrowAsJavaScriptException();
        // failed to recognize gradient
        return;
      }
      cairo_pattern_set_filter(new_pattern, state->patternQuality);
      cairo_set_source(_context, new_pattern);
      cairo_pattern_destroy(new_pattern);
    } else {
      cairo_pattern_set_filter(state->fillGradient, state->patternQuality);
      cairo_set_source(_context, state->fillGradient);
    }
  } else {
    setSourceRGBA(state->fill);
  }
  if (preserve) {
    hasShadow()
      ? shadow(cairo_fill_preserve)
      : cairo_fill_preserve(_context);
  } else {
    hasShadow()
      ? shadow(cairo_fill)
      : cairo_fill(_context);
  }
  if (needsRestore) {
    cairo_restore(_context);
  }
}

/*
 * Stroke and apply shadow.
 */

void
Context2d::stroke(bool preserve) {
  cairo_pattern_t *new_pattern;
  if (state->strokePattern) {
    if (state->globalAlpha < 1) {
      new_pattern = create_transparent_pattern(state->strokePattern, state->globalAlpha);
      if (new_pattern == NULL) {
        Napi::Error::New(env, "Failed to initialize context").ThrowAsJavaScriptException();
        // failed to allocate
        return;
      }
      cairo_set_source(_context, new_pattern);
      cairo_pattern_destroy(new_pattern);
    } else {
      cairo_pattern_set_filter(state->strokePattern, state->patternQuality);
      cairo_set_source(_context, state->strokePattern);
    }
    repeat_type_t repeat = Pattern::get_repeat_type_for_cairo_pattern(state->strokePattern);
    if (NO_REPEAT == repeat) {
      cairo_pattern_set_extend(cairo_get_source(_context), CAIRO_EXTEND_NONE);
    } else {
      cairo_pattern_set_extend(cairo_get_source(_context), CAIRO_EXTEND_REPEAT);
    }
  } else if (state->strokeGradient) {
    if (state->globalAlpha < 1) {
      new_pattern = create_transparent_gradient(state->strokeGradient, state->globalAlpha);
      if (new_pattern == NULL) {
        Napi::Error::New(env, "Unexpected gradient type").ThrowAsJavaScriptException();
        // failed to recognize gradient
        return;
      }
      cairo_pattern_set_filter(new_pattern, state->patternQuality);
      cairo_set_source(_context, new_pattern);
      cairo_pattern_destroy(new_pattern);
    } else {
      cairo_pattern_set_filter(state->strokeGradient, state->patternQuality);
      cairo_set_source(_context, state->strokeGradient);
    }
  } else {
    setSourceRGBA(state->stroke);
  }

  if (preserve) {
    hasShadow()
      ? shadow(cairo_stroke_preserve)
      : cairo_stroke_preserve(_context);
  } else {
    hasShadow()
      ? shadow(cairo_stroke)
      : cairo_stroke(_context);
  }
}

/*
 * Apply shadow with the given draw fn.
 */

void
Context2d::shadow(void (fn)(cairo_t *cr)) {
  cairo_path_t *path = cairo_copy_path_flat(_context);
  cairo_save(_context);

  // shadowOffset is unaffected by current transform
  cairo_matrix_t path_matrix;
  cairo_get_matrix(_context, &path_matrix);
  cairo_identity_matrix(_context);

  // Apply shadow
  cairo_push_group(_context);

  // No need to invoke blur if shadowBlur is 0
  if (state->shadowBlur) {
    // find out extent of path
    double x1, y1, x2, y2;
    if (fn == cairo_fill || fn == cairo_fill_preserve) {
      cairo_fill_extents(_context, &x1, &y1, &x2, &y2);
    } else {
      cairo_stroke_extents(_context, &x1, &y1, &x2, &y2);
    }

    // create new image surface that size + padding for blurring
    double dx = x2-x1, dy = y2-y1;
    cairo_user_to_device_distance(_context, &dx, &dy);
    int pad = state->shadowBlur * 2;
    cairo_surface_t *shadow_surface = cairo_image_surface_create(
      CAIRO_FORMAT_ARGB32,
      dx + 2 * pad,
      dy + 2 * pad);
    cairo_t *shadow_context = cairo_create(shadow_surface);

    // transform path to the right place
    cairo_translate(shadow_context, pad-x1, pad-y1);
    cairo_transform(shadow_context, &path_matrix);

    // set lineCap lineJoin lineDash
    cairo_set_line_cap(shadow_context, cairo_get_line_cap(_context));
    cairo_set_line_join(shadow_context, cairo_get_line_join(_context));

    double offset;
    int dashes = cairo_get_dash_count(_context);
    std::vector<double> a(dashes);
    cairo_get_dash(_context, a.data(), &offset);
    cairo_set_dash(shadow_context, a.data(), dashes, offset);

    // draw the path and blur
    cairo_set_line_width(shadow_context, cairo_get_line_width(_context));
    cairo_new_path(shadow_context);
    cairo_append_path(shadow_context, path);
    setSourceRGBA(shadow_context, state->shadow);
    fn(shadow_context);
    blur(shadow_surface, state->shadowBlur);

    // paint to original context
    cairo_set_source_surface(_context, shadow_surface,
      x1 - pad + state->shadowOffsetX + 1,
      y1 - pad + state->shadowOffsetY + 1);
    cairo_paint(_context);
    cairo_destroy(shadow_context);
    cairo_surface_destroy(shadow_surface);
  } else {
    // Offset first, then apply path's transform
    cairo_translate(
        _context
      , state->shadowOffsetX
      , state->shadowOffsetY);
    cairo_transform(_context, &path_matrix);

    // Apply shadow
    cairo_new_path(_context);
    cairo_append_path(_context, path);
    setSourceRGBA(state->shadow);

    fn(_context);
  }

  // Paint the shadow
  cairo_pop_group_to_source(_context);
  cairo_paint(_context);

  // Restore state
  cairo_restore(_context);
  cairo_new_path(_context);
  cairo_append_path(_context, path);
  fn(_context);

  cairo_path_destroy(path);
}

/*
 * Set source RGBA for the current context
 */

void
Context2d::setSourceRGBA(rgba_t color) {
  setSourceRGBA(_context, color);
}

/*
 * Set source RGBA
 */

void
Context2d::setSourceRGBA(cairo_t *ctx, rgba_t color) {
  cairo_set_source_rgba(
      ctx
    , color.r
    , color.g
    , color.b
    , color.a * state->globalAlpha);
}

/*
 * Check if the context has a drawable shadow.
 */

bool
Context2d::hasShadow() {
  return state->shadow.a
    && (state->shadowBlur || state->shadowOffsetX || state->shadowOffsetY);
}

/*
 * Blur the given surface with the given radius.
 */

void
Context2d::blur(cairo_surface_t *surface, int radius) {
  // Steve Hanov, 2009
  // Released into the public domain.
  radius = radius * 0.57735f + 0.5f;
  // get width, height
  int width = cairo_image_surface_get_width( surface );
  int height = cairo_image_surface_get_height( surface );
  const unsigned int size = width * height * sizeof(unsigned);
  unsigned* precalc = (unsigned*)malloc(size);
  cairo_surface_flush( surface );
  unsigned char* src = cairo_image_surface_get_data( surface );
  double mul=1.f/((radius*2)*(radius*2));
  int channel;

  // The number of times to perform the averaging. According to wikipedia,
  // three iterations is good enough to pass for a gaussian.
  const int MAX_ITERATIONS = 3;
  int iteration;

  for ( iteration = 0; iteration < MAX_ITERATIONS; iteration++ ) {
      for( channel = 0; channel < 4; channel++ ) {
          int x,y;

          // precomputation step.
          unsigned char* pix = src;
          unsigned* pre = precalc;

          bool modified = false;

          pix += channel;
          for (y=0;y<height;y++) {
              for (x=0;x<width;x++) {
                  int tot=pix[0];
                  if (x>0) tot+=pre[-1];
                  if (y>0) tot+=pre[-width];
                  if (x>0 && y>0) tot-=pre[-width-1];
                  *pre++=tot;
                  if (!modified) modified = true;
                  pix += 4;
              }
          }

          if (!modified) {
              memset(precalc, 0, size);
          }

          // blur step.
          pix = src + (int)radius * width * 4 + (int)radius * 4 + channel;
          for (y=radius;y<height-radius;y++) {
              for (x=radius;x<width-radius;x++) {
                  int l = x < radius ? 0 : x - radius;
                  int t = y < radius ? 0 : y - radius;
                  int r = x + radius >= width ? width - 1 : x + radius;
                  int b = y + radius >= height ? height - 1 : y + radius;
                  int tot = precalc[r+b*width] + precalc[l+t*width] -
                      precalc[l+b*width] - precalc[r+t*width];
                  *pix=(unsigned char)(tot*mul);
                  pix += 4;
              }
              pix += (int)radius * 2 * 4;
          }
      }
  }

  cairo_surface_mark_dirty(surface);
  free(precalc);
}

/*
* Get format (string).
*/

Napi::Value
Context2d::GetFormat(const Napi::CallbackInfo& info) {
  std::string pixelFormatString;
  switch (canvas()->backend()->getFormat()) {
  case CAIRO_FORMAT_ARGB32: pixelFormatString = "RGBA32"; break;
  case CAIRO_FORMAT_RGB24: pixelFormatString = "RGB24"; break;
  case CAIRO_FORMAT_A8: pixelFormatString = "A8"; break;
  case CAIRO_FORMAT_A1: pixelFormatString = "A1"; break;
  case CAIRO_FORMAT_RGB16_565: pixelFormatString = "RGB16_565"; break;
#ifdef CAIRO_FORMAT_RGB30
  case CAIRO_FORMAT_RGB30: pixelFormatString = "RGB30"; break;
#endif
  default: return env.Null();
  }
  return Napi::String::New(env, pixelFormatString);
}

/*
 * Create a new page.
 */

void
Context2d::AddPage(const Napi::CallbackInfo& info) {
  if (canvas()->backend()->getName() != "pdf") {
    Napi::Error::New(env, "only PDF canvases support .addPage()").ThrowAsJavaScriptException();
    return;
  }
  cairo_show_page(context());
  Napi::Number zero = Napi::Number::New(env, 0);
  int width = info[0].ToNumber().UnwrapOr(zero).Int32Value();
  int height = info[1].ToNumber().UnwrapOr(zero).Int32Value();
  if (width < 1) width = canvas()->getWidth();
  if (height < 1) height = canvas()->getHeight();
  cairo_pdf_surface_set_size(canvas()->surface(), width, height);
}

/*
 * Get text direction.
 */
Napi::Value
Context2d::GetDirection(const Napi::CallbackInfo& info) {
  return Napi::String::New(env, state->direction);
}

/*
 * Set text direction.
 */
void
Context2d::SetDirection(const Napi::CallbackInfo& info, const Napi::Value& value) {
  if (!value.IsString()) return;

  std::string dir = value.As<Napi::String>();
  if (dir != "ltr" && dir != "rtl") return;

  state->direction = dir;
}

/*
 * Get language.
 */
Napi::Value
Context2d::GetLanguage(const Napi::CallbackInfo& info) {
  return Napi::String::New(env, state->lang);
}

/*
 * Set language.
 */
void
Context2d::SetLanguage(const Napi::CallbackInfo& info, const Napi::Value& value) {
  if (!value.IsString()) return;

  std::string lang = value.As<Napi::String>();
  state->lang = lang;
}

/*
 * Put image data.
 *
 *  - imageData, dx, dy
 *  - imageData, dx, dy, sx, sy, sw, sh
 *
 */

void
Context2d::PutImageData(const Napi::CallbackInfo& info) {
  if (!info[0].IsObject()) {
    Napi::TypeError::New(env, "ImageData expected").ThrowAsJavaScriptException();
    return;
  }
  Napi::Object obj = info[0].As<Napi::Object>();
  InstanceData* data = env.GetInstanceData<InstanceData>();
  if (!obj.InstanceOf(data->ImageDataCtor.Value()).UnwrapOr(false)) {
    if (!env.IsExceptionPending()) {
      Napi::TypeError::New(env, "ImageData expected").ThrowAsJavaScriptException();
    }
    return;
  }

  ImageData *imageData = ImageData::Unwrap(obj);
  Napi::Number zero = Napi::Number::New(env, 0);

  uint8_t *src = imageData->data();
  uint8_t *dst = canvas()->data();

  int dstStride = canvas()->stride();
  int Bpp = dstStride / canvas()->getWidth();
  int srcStride = Bpp * imageData->width();

  int sx = 0
    , sy = 0
    , sw = 0
    , sh = 0
    , dx = info[1].ToNumber().UnwrapOr(zero).Int32Value()
    , dy = info[2].ToNumber().UnwrapOr(zero).Int32Value()
    , rows
    , cols;

  switch (info.Length()) {
    // imageData, dx, dy
    case 3:
      sw = imageData->width();
      sh = imageData->height();
      break;
    // imageData, dx, dy, sx, sy, sw, sh
    case 7:
      sx = info[3].ToNumber().UnwrapOr(zero).Int32Value();
      sy = info[4].ToNumber().UnwrapOr(zero).Int32Value();
      sw = info[5].ToNumber().UnwrapOr(zero).Int32Value();
      sh = info[6].ToNumber().UnwrapOr(zero).Int32Value();
      // fix up negative height, width
      if (sw < 0) sx += sw, sw = -sw;
      if (sh < 0) sy += sh, sh = -sh;
      // clamp the left edge
      if (sx < 0) sw += sx, sx = 0;
      if (sy < 0) sh += sy, sy = 0;
      // clamp the right edge
      if (sx + sw > imageData->width()) sw = imageData->width() - sx;
      if (sy + sh > imageData->height()) sh = imageData->height() - sy;
      // start destination at source offset
      dx += sx;
      dy += sy;
      break;
    default:
      Napi::Error::New(env, "invalid arguments").ThrowAsJavaScriptException();
      return;
  }

  // chop off outlying source data
  if (dx < 0) sw += dx, sx -= dx, dx = 0;
  if (dy < 0) sh += dy, sy -= dy, dy = 0;
  // clamp width at canvas size
  // Need to wrap std::min calls using parens to prevent macro expansion on
  // windows. See http://stackoverflow.com/questions/5004858/stdmin-gives-error
  cols = (std::min)(sw, canvas()->getWidth() - dx);
  rows = (std::min)(sh, canvas()->getHeight() - dy);

  if (cols <= 0 || rows <= 0) return;

  switch (canvas()->backend()->getFormat()) {
  case CAIRO_FORMAT_ARGB32: {
    src += sy * srcStride + sx * 4;
    dst += dstStride * dy + 4 * dx;
    for (int y = 0; y < rows; ++y) {
      uint8_t *dstRow = dst;
      uint8_t *srcRow = src;
      for (int x = 0; x < cols; ++x) {
        // rgba
        uint8_t r = *srcRow++;
        uint8_t g = *srcRow++;
        uint8_t b = *srcRow++;
        uint8_t a = *srcRow++;

        // argb
        // performance optimization: fully transparent/opaque pixels can be
        // processed more efficiently.
        if (a == 0) {
          *dstRow++ = 0;
          *dstRow++ = 0;
          *dstRow++ = 0;
          *dstRow++ = 0;
        } else if (a == 255) {
          *dstRow++ = b;
          *dstRow++ = g;
          *dstRow++ = r;
          *dstRow++ = a;
        } else {
          float alpha = (float)a / 255;
          *dstRow++ = b * alpha;
          *dstRow++ = g * alpha;
          *dstRow++ = r * alpha;
          *dstRow++ = a;
        }
      }
      dst += dstStride;
      src += srcStride;
    }
    break;
  }
  case CAIRO_FORMAT_RGB24: {
    src += sy * srcStride + sx * 4;
    dst += dstStride * dy + 4 * dx;
    for (int y = 0; y < rows; ++y) {
      uint8_t *dstRow = dst;
      uint8_t *srcRow = src;
      for (int x = 0; x < cols; ++x) {
        // rgba
        uint8_t r = *srcRow++;
        uint8_t g = *srcRow++;
        uint8_t b = *srcRow++;
        srcRow++;

        // argb
        *dstRow++ = b;
        *dstRow++ = g;
        *dstRow++ = r;
        *dstRow++ = 255;
      }
      dst += dstStride;
      src += srcStride;
    }
    break;
  }
  case CAIRO_FORMAT_A8: {
    src += sy * srcStride + sx;
    dst += dstStride * dy + dx;
    if (srcStride == dstStride && cols == dstStride) {
      // fast path: strides are the same and doing a full-width put
      memcpy(dst, src, cols * rows);
    } else {
      for (int y = 0; y < rows; ++y) {
        memcpy(dst, src, cols);
        dst += dstStride;
        src += srcStride;
      }
    }
    break;
  }
  case CAIRO_FORMAT_A1: {
    // TODO Should this be totally packed, or maintain a stride divisible by 4?
    Napi::Error::New(env, "putImageData for CANVAS_FORMAT_A1 is not yet implemented").ThrowAsJavaScriptException();

    break;
  }
  case CAIRO_FORMAT_RGB16_565: {
    src += sy * srcStride + sx * 2;
    dst += dstStride * dy + 2 * dx;
    for (int y = 0; y < rows; ++y) {
      memcpy(dst, src, cols * 2);
      dst += dstStride;
      src += srcStride;
    }
    break;
  }
#ifdef CAIRO_FORMAT_RGB30
  case CAIRO_FORMAT_RGB30: {
    // TODO
    Napi::Error::New(env, "putImageData for CANVAS_FORMAT_RGB30 is not yet implemented").ThrowAsJavaScriptException();

    break;
  }
#endif
  default: {
    Napi::Error::New(env, "Invalid pixel format or not an image canvas").ThrowAsJavaScriptException();
    return;
  }
  }

  cairo_surface_mark_dirty_rectangle(
      canvas()->surface()
    , dx
    , dy
    , cols
    , rows);
}

/*
 * Get image data.
 *
 *  - sx, sy, sw, sh
 *
 */

Napi::Value
Context2d::GetImageData(const Napi::CallbackInfo& info) {
  Napi::Number zero = Napi::Number::New(env, 0);
  Canvas *canvas = this->canvas();

  int sx = info[0].ToNumber().UnwrapOr(zero).Int32Value();
  int sy = info[1].ToNumber().UnwrapOr(zero).Int32Value();
  int sw = info[2].ToNumber().UnwrapOr(zero).Int32Value();
  int sh = info[3].ToNumber().UnwrapOr(zero).Int32Value();

  if (!sw) {
    Napi::Error::New(env, "IndexSizeError: The source width is 0.").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (!sh) {
    Napi::Error::New(env, "IndexSizeError: The source height is 0.").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int width = canvas->getWidth();
  int height = canvas->getHeight();

  if (!width) {
    Napi::TypeError::New(env, "Canvas width is 0").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (!height) {
    Napi::TypeError::New(env, "Canvas height is 0").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // WebKit and Firefox have this behavior:
  // Flip the coordinates so the origin is top/left-most:
  if (sw < 0) {
    sx += sw;
    sw = -sw;
  }
  if (sh < 0) {
    sy += sh;
    sh = -sh;
  }

  // Width and height to actually copy
  int cw = sw;
  int ch = sh;
  // Offsets in the destination image
  int ox = 0;
  int oy = 0;

  // Clamp the copy width and height if the copy would go outside the image
  if (sx + sw > width) cw = width - sx;
  if (sy + sh > height) ch = height - sy;

  // Clamp the copy origin if the copy would go outside the image
  if (sx < 0) {
    ox = -sx;
    cw += sx;
    sx = 0;
  }
  if (sy < 0) {
    oy = -sy;
    ch += sy;
    sy = 0;
  }

  int srcStride = canvas->stride();
  int bpp = srcStride / width;
  int size = sw * sh * bpp;
  int dstStride = sw * bpp;

  uint8_t *src = canvas->data();

  Napi::ArrayBuffer buffer = Napi::ArrayBuffer::New(env, size);
  Napi::TypedArray dataArray;

  if (canvas->backend()->getFormat() == CAIRO_FORMAT_RGB16_565) {
    dataArray = Napi::Uint16Array::New(env, size >> 1, buffer, 0);
  } else {
    dataArray = Napi::Uint8Array::New(env, size, buffer, 0, napi_uint8_clamped_array);
  }

  uint8_t *dst = (uint8_t *)buffer.Data();

  if (!(cw > 0 && ch > 0)) goto return_empty;

  switch (canvas->backend()->getFormat()) {
  case CAIRO_FORMAT_ARGB32: {
    dst += oy * dstStride + ox * 4;
    // Rearrange alpha (argb -> rgba), undo alpha pre-multiplication,
    // and store in big-endian format
    for (int y = 0; y < ch; ++y) {
      uint32_t *row = (uint32_t *)(src + srcStride * (y + sy));
      for (int x = 0; x < cw; ++x) {
        int bx = x * 4;
        uint32_t *pixel = row + x + sx;
        uint8_t a = *pixel >> 24;
        uint8_t r = *pixel >> 16;
        uint8_t g = *pixel >> 8;
        uint8_t b = *pixel;
        dst[bx + 3] = a;

        // Performance optimization: fully transparent/opaque pixels can be
        // processed more efficiently.
        if (a == 0 || a == 255) {
          dst[bx + 0] = r;
          dst[bx + 1] = g;
          dst[bx + 2] = b;
        } else {
          // Undo alpha pre-multiplication
          float alphaR = (float)255 / a;
          dst[bx + 0] = (int)((float)r * alphaR);
          dst[bx + 1] = (int)((float)g * alphaR);
          dst[bx + 2] = (int)((float)b * alphaR);
        }

      }
      dst += dstStride;
    }
    break;
  }
  case CAIRO_FORMAT_RGB24: {
    dst += oy * dstStride + ox * 4;
  // Rearrange alpha (argb -> rgba) and store in big-endian format
    for (int y = 0; y < ch; ++y) {
    uint32_t *row = (uint32_t *)(src + srcStride * (y + sy));
    for (int x = 0; x < cw; ++x) {
      int bx = x * 4;
      uint32_t *pixel = row + x + sx;
      uint8_t r = *pixel >> 16;
      uint8_t g = *pixel >> 8;
      uint8_t b = *pixel;

      dst[bx + 0] = r;
      dst[bx + 1] = g;
      dst[bx + 2] = b;
      dst[bx + 3] = 255;
    }
    dst += dstStride;
    }
    break;
  }
  case CAIRO_FORMAT_A8: {
    dst += oy * dstStride + ox;
    for (int y = 0; y < ch; ++y) {
      uint8_t *row = (uint8_t *)(src + srcStride * (y + sy));
      memcpy(dst, row + sx, cw);
      dst += dstStride;
    }
    break;
  }
  case CAIRO_FORMAT_A1: {
    // TODO Should this be totally packed, or maintain a stride divisible by 4?
    Napi::Error::New(env, "getImageData for CANVAS_FORMAT_A1 is not yet implemented").ThrowAsJavaScriptException();

    break;
  }
  case CAIRO_FORMAT_RGB16_565: {
    dst += oy * dstStride + ox * 2;
    for (int y = 0; y < ch; ++y) {
      uint16_t *row = (uint16_t *)(src + srcStride * (y + sy));
      memcpy(dst, row + sx, cw * 2);
      dst += dstStride;
    }
    break;
  }
#ifdef CAIRO_FORMAT_RGB30
  case CAIRO_FORMAT_RGB30: {
    // TODO
    Napi::Error::New(env, "getImageData for CANVAS_FORMAT_RGB30 is not yet implemented").ThrowAsJavaScriptException();

    break;
  }
#endif
  default: {
    // Unlikely
    Napi::Error::New(env, "Invalid pixel format or not an image canvas").ThrowAsJavaScriptException();
    return env.Null();
  }
  }

return_empty:
  Napi::Number swHandle = Napi::Number::New(env, sw);
  Napi::Number shHandle = Napi::Number::New(env, sh);
  Napi::Function ctor = env.GetInstanceData<InstanceData>()->ImageDataCtor.Value();
  Napi::Maybe<Napi::Object> ret = ctor.New({ dataArray, swHandle, shHandle });

  return ret.IsJust() ? ret.Unwrap() : env.Undefined();
}

/**
 * Create `ImageData` with the given dimensions or
 * `ImageData` instance for dimensions.
 */

Napi::Value
Context2d::CreateImageData(const Napi::CallbackInfo& info){
  Canvas *canvas = this->canvas();
  Napi::Number zero = Napi::Number::New(env, 0);
  int32_t width, height;

  if (info[0].IsObject()) {
    Napi::Object obj = info[0].As<Napi::Object>();
    width = obj.Get("width").UnwrapOr(zero).ToNumber().UnwrapOr(zero).Int32Value();
    height = obj.Get("height").UnwrapOr(zero).ToNumber().UnwrapOr(zero).Int32Value();
  } else {
    width = info[0].ToNumber().UnwrapOr(zero).Int32Value();
    height = info[1].ToNumber().UnwrapOr(zero).Int32Value();
  }

  int stride = canvas->stride();
  double Bpp = static_cast<double>(stride) / canvas->getWidth();
  int nBytes = static_cast<int>(Bpp * width * height + .5);

  Napi::ArrayBuffer ab = Napi::ArrayBuffer::New(env, nBytes);
  Napi::Value arr;

  if (canvas->backend()->getFormat() == CAIRO_FORMAT_RGB16_565)
    arr = Napi::Uint16Array::New(env, nBytes / 2, ab, 0);
  else
    arr = Napi::Uint8Array::New(env, nBytes, ab, 0, napi_uint8_clamped_array);

  Napi::Function ctor = env.GetInstanceData<InstanceData>()->ImageDataCtor.Value();
  Napi::Maybe<Napi::Object> ret = ctor.New({ arr, Napi::Number::New(env, width), Napi::Number::New(env, height) });

  return ret.IsJust() ? ret.Unwrap() : env.Undefined();
}

/*
 * Take a transform matrix and return its components
 * 0: angle, 1: scaleX, 2: scaleY, 3: skewX, 4: translateX, 5: translateY
 */
void decompose_matrix(cairo_matrix_t matrix, double *destination) {
  double denom = pow(matrix.xx, 2) + pow(matrix.yx, 2);
  destination[0] = atan2(matrix.yx, matrix.xx);
  destination[1] = sqrt(denom);
  destination[2] = (matrix.xx * matrix.yy - matrix.xy * matrix.yx) / destination[1];
  destination[3] = atan2(matrix.xx * matrix.xy + matrix.yx * matrix.yy, denom);
  destination[4] = matrix.x0;
  destination[5] = matrix.y0;
}

/*
 * Draw image src image to the destination (context).
 *
 *  - dx, dy
 *  - dx, dy, dw, dh
 *  - sx, sy, sw, sh, dx, dy, dw, dh
 *
 */

void
Context2d::DrawImage(const Napi::CallbackInfo& info) {
  int infoLen = info.Length();

  if (infoLen != 3 && infoLen != 5 && infoLen != 9) {
    Napi::TypeError::New(env, "Invalid arguments").ThrowAsJavaScriptException();
    return;
  }

  if (!info[0].IsObject()) {
    Napi::TypeError::New(env, "The first argument must be an object").ThrowAsJavaScriptException();
    return;
  }

  double args[8];
  if(!checkArgs(info, args, infoLen - 1, 1))
    return;

  double sx = 0
    , sy = 0
    , sw = 0
    , sh = 0
    , dx = 0
    , dy = 0
    , dw = 0
    , dh = 0
    , source_w = 0
    , source_h = 0;

  cairo_surface_t *surface;

  Napi::Object obj = info[0].As<Napi::Object>();

  // Image
  if (obj.InstanceOf(env.GetInstanceData<InstanceData>()->ImageCtor.Value()).UnwrapOr(false)) {
    Image *img = Image::Unwrap(obj);
    if (!img->isComplete()) {
      Napi::Error::New(env, "Image given has not completed loading").ThrowAsJavaScriptException();
      return;
    }
    source_w = sw = img->width;
    source_h = sh = img->height;
    surface = img->surface();

  // Canvas
  } else if (obj.InstanceOf(env.GetInstanceData<InstanceData>()->CanvasCtor.Value()).UnwrapOr(false)) {
    Canvas *canvas = Canvas::Unwrap(obj);
    source_w = sw = canvas->getWidth();
    source_h = sh = canvas->getHeight();
    surface = canvas->surface();

  // Invalid
  } else {
    if (!env.IsExceptionPending()) {
      Napi::TypeError::New(env, "Image or Canvas expected").ThrowAsJavaScriptException();
    }
    return;
  }

  cairo_t *ctx = context();

  // Arguments
  switch (infoLen) {
    // img, sx, sy, sw, sh, dx, dy, dw, dh
    case 9:
      sx = args[0];
      sy = args[1];
      sw = args[2];
      sh = args[3];
      dx = args[4];
      dy = args[5];
      dw = args[6];
      dh = args[7];
      break;
    // img, dx, dy, dw, dh
    case 5:
      dx = args[0];
      dy = args[1];
      dw = args[2];
      dh = args[3];
      break;
    // img, dx, dy
    case 3:
      dx = args[0];
      dy = args[1];
      dw = sw;
      dh = sh;
      break;
  }

  if (!(sw && sh && dw && dh))
    return;

  // Start draw
  cairo_save(ctx);

  cairo_matrix_t matrix;
  double transforms[6];
  cairo_get_matrix(ctx, &matrix);
  decompose_matrix(matrix, transforms);
  // extract the scale value from the current transform so that we know how many pixels we
  // need for our extra canvas in the drawImage operation.
  double current_scale_x = std::abs(transforms[1]);
  double current_scale_y = std::abs(transforms[2]);
  double extra_dx = 0;
  double extra_dy = 0;
  double fx = dw / sw * current_scale_x; // transforms[1] is scale on X
  double fy = dh / sh * current_scale_y; // transforms[2] is scale on X
  bool needScale = dw != sw || dh != sh;
  bool needCut = sw != source_w || sh != source_h || sx < 0 || sy < 0;
  bool sameCanvas = surface == canvas()->surface();
  bool needsExtraSurface = sameCanvas || needCut || needScale;
  cairo_surface_t *surfTemp = NULL;
  cairo_t *ctxTemp = NULL;

  if (needsExtraSurface) {
    // we want to create the extra surface as small as possible.
    // fx and fy are the total scaling we need to apply to sw, sh.
    // from sw and sh we want to remove the part that is outside the source_w and soruce_h
    double real_w = sw;
    double real_h = sh;
    double translate_x = 0;
    double translate_y = 0;
    // if sx or sy are negative, a part of the area represented by sw and sh is empty
    // because there are empty pixels, so we cut it out.
    // On the other hand if sx or sy are positive, but sw and sh extend outside the real
    // source pixels, we cut the area in that case too.
    if (sx < 0) {
      extra_dx = -sx * fx;
      real_w = sw + sx;
    } else if (sx + sw > source_w) {
      real_w = sw - (sx + sw - source_w);
    }
    if (sy < 0) {
      extra_dy = -sy * fy;
      real_h = sh + sy;
    } else if (sy + sh > source_h) {
      real_h = sh - (sy + sh - source_h);
    }
    // if after cutting we are still bigger than source pixels, we restrict again
    if (real_w > source_w) {
      real_w = source_w;
    }
    if (real_h > source_h) {
      real_h = source_h;
    }
    // TODO: find a way to limit the surfTemp to real_w and real_h if fx and fy are bigger than 1.
    // there are no more pixel than the one available in the source, no need to create a bigger surface.
    surfTemp = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, round(real_w * fx), round(real_h * fy));
    ctxTemp = cairo_create(surfTemp);
    cairo_scale(ctxTemp, fx, fy);
    if (sx > 0) {
      translate_x = sx;
    }
    if (sy > 0) {
      translate_y = sy;
    }
    cairo_set_source_surface(ctxTemp, surface, -translate_x, -translate_y);
    cairo_pattern_set_filter(cairo_get_source(ctxTemp), state->imageSmoothingEnabled ? state->patternQuality : CAIRO_FILTER_NEAREST);
    cairo_pattern_set_extend(cairo_get_source(ctxTemp), CAIRO_EXTEND_REFLECT);
    cairo_paint_with_alpha(ctxTemp, 1);
    surface = surfTemp;
  }
  // apply shadow if there is one
  if (hasShadow()) {
    if(state->shadowBlur) {
      // we need to create a new surface in order to blur
      int pad = state->shadowBlur * 2;
      cairo_surface_t *shadow_surface = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, dw + 2 * pad, dh + 2 * pad);
      cairo_t *shadow_context = cairo_create(shadow_surface);

      // mask and blur
      setSourceRGBA(shadow_context, state->shadow);
      cairo_mask_surface(shadow_context, surface, pad, pad);
      blur(shadow_surface, state->shadowBlur);

      // paint
      // @note: ShadowBlur looks different in each browser. This implementation matches chrome as close as possible.
      //        The 1.4 offset comes from visual tests with Chrome. I have read the spec and part of the shadowBlur
      //        implementation, and its not immediately clear why an offset is necessary, but without it, the result
      //        in chrome is different.
      cairo_set_source_surface(ctx, shadow_surface,
        dx + state->shadowOffsetX - pad + 1.4,
        dy + state->shadowOffsetY - pad + 1.4);
      cairo_paint(ctx);
      // cleanup
      cairo_destroy(shadow_context);
      cairo_surface_destroy(shadow_surface);
    } else {
      setSourceRGBA(state->shadow);
      cairo_mask_surface(ctx, surface,
        dx + (state->shadowOffsetX),
        dy + (state->shadowOffsetY));
    }
  }

  double scaled_dx = dx;
  double scaled_dy = dy;

  if (needsExtraSurface && (current_scale_x != 1 || current_scale_y != 1)) {
    // in this case our surface contains already current_scale_x, we need to scale back
    cairo_scale(ctx, 1 / current_scale_x, 1 / current_scale_y);
    scaled_dx *= current_scale_x;
    scaled_dy *= current_scale_y;
  }
  // Paint
  cairo_set_source_surface(ctx, surface, scaled_dx + extra_dx, scaled_dy + extra_dy);
  cairo_pattern_set_filter(cairo_get_source(ctx), state->imageSmoothingEnabled ? state->patternQuality : CAIRO_FILTER_NEAREST);
  cairo_pattern_set_extend(cairo_get_source(ctx), CAIRO_EXTEND_NONE);
  cairo_paint_with_alpha(ctx, state->globalAlpha);

  cairo_restore(ctx);

  if (needsExtraSurface) {
    cairo_destroy(ctxTemp);
    cairo_surface_destroy(surfTemp);
  }
}

/*
 * Get global alpha.
 */

Napi::Value
Context2d::GetGlobalAlpha(const Napi::CallbackInfo& info) {
  return Napi::Number::New(env, state->globalAlpha);
}

/*
 * Set global alpha.
 */

void
Context2d::SetGlobalAlpha(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Maybe<Napi::Number> numberValue = value.ToNumber();
  if (numberValue.IsJust()) {
    double n = numberValue.Unwrap().DoubleValue();
    if (n >= 0 && n <= 1) state->globalAlpha = n;
  }
}

/*
 * Get global composite operation.
 */

Napi::Value
Context2d::GetGlobalCompositeOperation(const Napi::CallbackInfo& info) {
  cairo_t *ctx = context();

  const char *op{};
  switch (cairo_get_operator(ctx)) {
    // composite modes:
    case CAIRO_OPERATOR_CLEAR: op = "clear"; break;
    case CAIRO_OPERATOR_SOURCE: op = "copy"; break;
    case CAIRO_OPERATOR_DEST: op = "destination"; break;
    case CAIRO_OPERATOR_OVER: op = "source-over"; break;
    case CAIRO_OPERATOR_DEST_OVER: op = "destination-over"; break;
    case CAIRO_OPERATOR_IN: op = "source-in"; break;
    case CAIRO_OPERATOR_DEST_IN: op = "destination-in"; break;
    case CAIRO_OPERATOR_OUT: op = "source-out"; break;
    case CAIRO_OPERATOR_DEST_OUT: op = "destination-out"; break;
    case CAIRO_OPERATOR_ATOP: op = "source-atop"; break;
    case CAIRO_OPERATOR_DEST_ATOP: op = "destination-atop"; break;
    case CAIRO_OPERATOR_XOR: op = "xor"; break;
    case CAIRO_OPERATOR_ADD: op = "lighter"; break;
    // blend modes:
    // Note: "source-over" and "normal" are synonyms. Chrome and FF both report
    // "source-over" after setting gCO to "normal".
    // case CAIRO_OPERATOR_OVER: op = "normal";
    case CAIRO_OPERATOR_MULTIPLY: op = "multiply"; break;
    case CAIRO_OPERATOR_SCREEN: op = "screen"; break;
    case CAIRO_OPERATOR_OVERLAY: op = "overlay"; break;
    case CAIRO_OPERATOR_DARKEN: op = "darken"; break;
    case CAIRO_OPERATOR_LIGHTEN: op = "lighten"; break;
    case CAIRO_OPERATOR_COLOR_DODGE: op = "color-dodge"; break;
    case CAIRO_OPERATOR_COLOR_BURN: op = "color-burn"; break;
    case CAIRO_OPERATOR_HARD_LIGHT: op = "hard-light"; break;
    case CAIRO_OPERATOR_SOFT_LIGHT: op = "soft-light"; break;
    case CAIRO_OPERATOR_DIFFERENCE: op = "difference"; break;
    case CAIRO_OPERATOR_EXCLUSION: op = "exclusion"; break;
    case CAIRO_OPERATOR_HSL_HUE: op = "hue"; break;
    case CAIRO_OPERATOR_HSL_SATURATION: op = "saturation"; break;
    case CAIRO_OPERATOR_HSL_COLOR: op = "color"; break;
    case CAIRO_OPERATOR_HSL_LUMINOSITY: op = "luminosity"; break;
    // non-standard:
    case CAIRO_OPERATOR_SATURATE: op = "saturate"; break;
    default: op = "source-over";
  }

  return Napi::String::New(env, op);
}

/*
 * Set pattern quality.
 */

void
Context2d::SetPatternQuality(const Napi::CallbackInfo& info, const Napi::Value& value) {
  if (value.IsString()) {
    std::string quality = value.As<Napi::String>().Utf8Value();
    if (quality == "fast") {
      state->patternQuality = CAIRO_FILTER_FAST;
    } else if (quality == "good") {
      state->patternQuality = CAIRO_FILTER_GOOD;
    } else if (quality == "best") {
      state->patternQuality = CAIRO_FILTER_BEST;
    } else if (quality == "nearest") {
      state->patternQuality = CAIRO_FILTER_NEAREST;
    } else if (quality == "bilinear") {
      state->patternQuality = CAIRO_FILTER_BILINEAR;
    }
  }
}

/*
 * Get pattern quality.
 */

Napi::Value
Context2d::GetPatternQuality(const Napi::CallbackInfo& info) {
  const char *quality;
  switch (state->patternQuality) {
    case CAIRO_FILTER_FAST: quality = "fast"; break;
    case CAIRO_FILTER_BEST: quality = "best"; break;
    case CAIRO_FILTER_NEAREST: quality = "nearest"; break;
    case CAIRO_FILTER_BILINEAR: quality = "bilinear"; break;
    default: quality = "good";
  }
  return Napi::String::New(env, quality);
}

/*
 * Set ImageSmoothingEnabled value.
 */

void
Context2d::SetImageSmoothingEnabled(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Boolean boolValue;
  if (value.ToBoolean().UnwrapTo(&boolValue)) state->imageSmoothingEnabled = boolValue.Value();
}

/*
 * Get pattern quality.
 */

Napi::Value
Context2d::GetImageSmoothingEnabled(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(env, state->imageSmoothingEnabled);
}

/*
 * Set global composite operation.
 */

void
Context2d::SetGlobalCompositeOperation(const Napi::CallbackInfo& info, const Napi::Value& value) {
  cairo_t *ctx = this->context();
  Napi::String opStr;
  if (value.ToString().UnwrapTo(&opStr)) { // Unlike CSS colors, this *is* case-sensitive
    const std::map<std::string, cairo_operator_t> blendmodes = {
      // composite modes:
      {"clear", CAIRO_OPERATOR_CLEAR},
      {"copy", CAIRO_OPERATOR_SOURCE},
      {"destination", CAIRO_OPERATOR_DEST}, // this seems to have been omitted from the spec
      {"source-over", CAIRO_OPERATOR_OVER},
      {"destination-over", CAIRO_OPERATOR_DEST_OVER},
      {"source-in", CAIRO_OPERATOR_IN},
      {"destination-in", CAIRO_OPERATOR_DEST_IN},
      {"source-out", CAIRO_OPERATOR_OUT},
      {"destination-out", CAIRO_OPERATOR_DEST_OUT},
      {"source-atop", CAIRO_OPERATOR_ATOP},
      {"destination-atop", CAIRO_OPERATOR_DEST_ATOP},
      {"xor", CAIRO_OPERATOR_XOR},
      {"lighter", CAIRO_OPERATOR_ADD},
      // blend modes:
      {"normal", CAIRO_OPERATOR_OVER},
      {"multiply", CAIRO_OPERATOR_MULTIPLY},
      {"screen", CAIRO_OPERATOR_SCREEN},
      {"overlay", CAIRO_OPERATOR_OVERLAY},
      {"darken", CAIRO_OPERATOR_DARKEN},
      {"lighten", CAIRO_OPERATOR_LIGHTEN},
      {"color-dodge", CAIRO_OPERATOR_COLOR_DODGE},
      {"color-burn", CAIRO_OPERATOR_COLOR_BURN},
      {"hard-light", CAIRO_OPERATOR_HARD_LIGHT},
      {"soft-light", CAIRO_OPERATOR_SOFT_LIGHT},
      {"difference", CAIRO_OPERATOR_DIFFERENCE},
      {"exclusion", CAIRO_OPERATOR_EXCLUSION},
      {"hue", CAIRO_OPERATOR_HSL_HUE},
      {"saturation", CAIRO_OPERATOR_HSL_SATURATION},
      {"color", CAIRO_OPERATOR_HSL_COLOR},
      {"luminosity", CAIRO_OPERATOR_HSL_LUMINOSITY},
      // non-standard:
      {"saturate", CAIRO_OPERATOR_SATURATE}
    };
    auto op = blendmodes.find(opStr.Utf8Value());
    if (op != blendmodes.end()) cairo_set_operator(ctx, op->second);
  }
}

/*
 * Get shadow offset x.
 */

Napi::Value
Context2d::GetShadowOffsetX(const Napi::CallbackInfo& info) {
  return Napi::Number::New(env, state->shadowOffsetX);
}

/*
 * Set shadow offset x.
 */

void
Context2d::SetShadowOffsetX(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Number numberValue;
  if (value.ToNumber().UnwrapTo(&numberValue)) state->shadowOffsetX = numberValue.DoubleValue();
}

/*
 * Get shadow offset y.
 */

Napi::Value
Context2d::GetShadowOffsetY(const Napi::CallbackInfo& info) {
  return Napi::Number::New(env, state->shadowOffsetY);
}

/*
 * Set shadow offset y.
 */

void
Context2d::SetShadowOffsetY(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Number numberValue;
  if (value.ToNumber().UnwrapTo(&numberValue)) state->shadowOffsetY = numberValue.DoubleValue();
}

/*
 * Get shadow blur.
 */

Napi::Value
Context2d::GetShadowBlur(const Napi::CallbackInfo& info) {
  return Napi::Number::New(env, state->shadowBlur);
}

/*
 * Set shadow blur.
 */

void
Context2d::SetShadowBlur(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Number n;
  if (value.ToNumber().UnwrapTo(&n)) {
    double v = n.DoubleValue();
    if (v >= 0 && v <= std::numeric_limits<decltype(state->shadowBlur)>::max()) {
      state->shadowBlur = v;
    }
  }
}

/*
 * Get current antialiasing setting.
 */

Napi::Value
Context2d::GetAntiAlias(const Napi::CallbackInfo& info) {
  const char *aa;
  switch (cairo_get_antialias(context())) {
    case CAIRO_ANTIALIAS_NONE: aa = "none"; break;
    case CAIRO_ANTIALIAS_GRAY: aa = "gray"; break;
    case CAIRO_ANTIALIAS_SUBPIXEL: aa = "subpixel"; break;
    default: aa = "default";
  }
  return Napi::String::New(env, aa);
}

/*
 * Set antialiasing.
 */

void
Context2d::SetAntiAlias(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::String stringValue;

  if (value.ToString().UnwrapTo(&stringValue)) {
    std::string str = stringValue.Utf8Value();
    cairo_t *ctx = context();
    cairo_antialias_t a;
    if (str == "none") {
      a = CAIRO_ANTIALIAS_NONE;
    } else if (str == "default") {
      a = CAIRO_ANTIALIAS_DEFAULT;
    } else if (str == "gray") {
      a = CAIRO_ANTIALIAS_GRAY;
    } else if (str == "subpixel") {
      a = CAIRO_ANTIALIAS_SUBPIXEL;
    } else {
      a = cairo_get_antialias(ctx);
    }
    cairo_set_antialias(ctx, a);
  }
}

/*
 * Get text drawing mode.
 */

Napi::Value
Context2d::GetTextDrawingMode(const Napi::CallbackInfo& info) {
  const char *mode;
  if (state->textDrawingMode == TEXT_DRAW_PATHS) {
    mode = "path";
  } else if (state->textDrawingMode == TEXT_DRAW_GLYPHS) {
    mode = "glyph";
  } else {
    mode = "unknown";
  }
  return Napi::String::New(env, mode);
}

/*
 * Set text drawing mode.
 */

void
Context2d::SetTextDrawingMode(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::String stringValue;
  if (value.ToString().UnwrapTo(&stringValue)) {
    std::string str = stringValue.Utf8Value();
    if (str == "path") {
      state->textDrawingMode = TEXT_DRAW_PATHS;
    } else if (str == "glyph") {
      state->textDrawingMode = TEXT_DRAW_GLYPHS;
    }
  }
}

/*
 * Get filter.
 */

Napi::Value
Context2d::GetQuality(const Napi::CallbackInfo& info) {
  const char *filter;
  switch (cairo_pattern_get_filter(cairo_get_source(context()))) {
    case CAIRO_FILTER_FAST: filter = "fast"; break;
    case CAIRO_FILTER_BEST: filter = "best"; break;
    case CAIRO_FILTER_NEAREST: filter = "nearest"; break;
    case CAIRO_FILTER_BILINEAR: filter = "bilinear"; break;
    default: filter = "good";
  }
  return Napi::String::New(env, filter);
}

/*
 * Set filter.
 */

void
Context2d::SetQuality(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::String stringValue;
  if (value.ToString().UnwrapTo(&stringValue)) {
    std::string str = stringValue.Utf8Value();
    cairo_filter_t filter;
    if (str == "fast") {
      filter = CAIRO_FILTER_FAST;
    } else if (str == "best") {
      filter = CAIRO_FILTER_BEST;
    } else if (str == "nearest") {
      filter = CAIRO_FILTER_NEAREST;
    } else if (str == "bilinear") {
      filter = CAIRO_FILTER_BILINEAR;
    } else {
      filter = CAIRO_FILTER_GOOD;
    }
    cairo_pattern_set_filter(cairo_get_source(context()), filter);
  }
}

/*
 * Helper for get current transform matrix
 */

Napi::Value
Context2d::get_current_transform() {
  Napi::Float64Array arr = Napi::Float64Array::New(env, 6);
  double *dest = arr.Data();
  cairo_matrix_t matrix;
  cairo_get_matrix(context(), &matrix);
  dest[0] = matrix.xx;
  dest[1] = matrix.yx;
  dest[2] = matrix.xy;
  dest[3] = matrix.yy;
  dest[4] = matrix.x0;
  dest[5] = matrix.y0;
  Napi::Maybe<Napi::Object> ret = env.GetInstanceData<InstanceData>()->DOMMatrixCtor.Value().New({ arr });
  return ret.IsJust() ? ret.Unwrap() : env.Undefined();
}

/*
 * Helper for get/set transform.
 */

void parse_matrix_from_object(cairo_matrix_t &matrix, Napi::Object mat) {
  Napi::Value zero = Napi::Number::New(mat.Env(), 0);
  cairo_matrix_init(&matrix,
    mat.Get("a").UnwrapOr(zero).As<Napi::Number>().DoubleValue(),
    mat.Get("b").UnwrapOr(zero).As<Napi::Number>().DoubleValue(),
    mat.Get("c").UnwrapOr(zero).As<Napi::Number>().DoubleValue(),
    mat.Get("d").UnwrapOr(zero).As<Napi::Number>().DoubleValue(),
    mat.Get("e").UnwrapOr(zero).As<Napi::Number>().DoubleValue(),
    mat.Get("f").UnwrapOr(zero).As<Napi::Number>().DoubleValue()
  );
}


/*
 * Get current transform.
 */

Napi::Value
Context2d::GetCurrentTransform(const Napi::CallbackInfo& info) {
  return get_current_transform();
}

/*
 * Set current transform.
 */

void
Context2d::SetCurrentTransform(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Object mat;

  if (value.ToObject().UnwrapTo(&mat)) {
    if (!mat.InstanceOf(env.GetInstanceData<InstanceData>()->DOMMatrixCtor.Value()).UnwrapOr(false)) {
      if (!env.IsExceptionPending()) {
        Napi::TypeError::New(env, "Expected DOMMatrix").ThrowAsJavaScriptException();
      }
      return;
    }

    cairo_matrix_t matrix;
    parse_matrix_from_object(matrix, mat);

    cairo_transform(context(), &matrix);
  }
}

/*
 * Get current fill style.
 */

Napi::Value
Context2d::GetFillStyle(const Napi::CallbackInfo& info) {
  Napi::Value style;

  if (_fillStyle.IsEmpty())
    style = _getFillColor();
  else
    style = _fillStyle.Value();

  return style;
}

/*
 * Set current fill style.
 */

void
Context2d::SetFillStyle(const Napi::CallbackInfo& info, const Napi::Value& value) {
  if (value.IsString()) {
    _fillStyle.Reset();
    _setFillColor(value.As<Napi::String>());
  } else if (value.IsObject()) {
    InstanceData *data = env.GetInstanceData<InstanceData>();
    Napi::Object obj = value.As<Napi::Object>();
    if (obj.InstanceOf(data->CanvasGradientCtor.Value()).UnwrapOr(false)) {
      _fillStyle.Reset(obj);
      Gradient *grad = Gradient::Unwrap(obj);
      state->fillGradient = grad->pattern();
    } else if (obj.InstanceOf(data->CanvasPatternCtor.Value()).UnwrapOr(false)) {
      _fillStyle.Reset(obj);
      Pattern *pattern = Pattern::Unwrap(obj);
      state->fillPattern = pattern->pattern();
    }
  }
}

/*
 * Get current stroke style.
 */

Napi::Value
Context2d::GetStrokeStyle(const Napi::CallbackInfo& info) {
  Napi::Value style;

  if (_strokeStyle.IsEmpty())
    style = _getStrokeColor();
  else
    style = _strokeStyle.Value();

  return style;
}

/*
 * Set current stroke style.
 */

void
Context2d::SetStrokeStyle(const Napi::CallbackInfo& info, const Napi::Value& value) {
  if (value.IsString()) {
    _strokeStyle.Reset();
    _setStrokeColor(value.As<Napi::String>());
  } else if (value.IsObject()) {
    InstanceData *data = env.GetInstanceData<InstanceData>();
    Napi::Object obj = value.As<Napi::Object>();
    if (obj.InstanceOf(data->CanvasGradientCtor.Value()).UnwrapOr(false)) {
      _strokeStyle.Reset(obj);
      Gradient *grad = Gradient::Unwrap(obj);
      state->strokeGradient = grad->pattern();
    } else if (obj.InstanceOf(data->CanvasPatternCtor.Value()).UnwrapOr(false)) {
      _strokeStyle.Reset(value);
      Pattern *pattern = Pattern::Unwrap(obj);
      state->strokePattern = pattern->pattern();
    }
  }
}

/*
 * Get miter limit.
 */

Napi::Value
Context2d::GetMiterLimit(const Napi::CallbackInfo& info) {
  return Napi::Number::New(env, cairo_get_miter_limit(context()));
}

/*
 * Set miter limit.
 */

void
Context2d::SetMiterLimit(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Maybe<Napi::Number> numberValue = value.ToNumber();
  if (numberValue.IsJust()) {
    double n = numberValue.Unwrap().DoubleValue();
    if (n > 0) cairo_set_miter_limit(context(), n);
  }
}

/*
 * Get line width.
 */

Napi::Value
Context2d::GetLineWidth(const Napi::CallbackInfo& info) {
  return Napi::Number::New(env, cairo_get_line_width(context()));
}

/*
 * Set line width.
 */

void
Context2d::SetLineWidth(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Maybe<Napi::Number> numberValue = value.ToNumber();
  if (numberValue.IsJust()) {
    double n = numberValue.Unwrap().DoubleValue();
    if (n > 0 && n != std::numeric_limits<double>::infinity()) {
      cairo_set_line_width(context(), n);
    }
  }
}

/*
 * Get line join.
 */

Napi::Value
Context2d::GetLineJoin(const Napi::CallbackInfo& info) {
  const char *join;
  switch (cairo_get_line_join(context())) {
    case CAIRO_LINE_JOIN_BEVEL: join = "bevel"; break;
    case CAIRO_LINE_JOIN_ROUND: join = "round"; break;
    default: join = "miter";
  }
  return Napi::String::New(env, join);
}

/*
 * Set line join.
 */

void
Context2d::SetLineJoin(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Maybe<Napi::String> stringValue = value.ToString();
  cairo_t *ctx = context();

  if (stringValue.IsJust()) {
    std::string type = stringValue.Unwrap().Utf8Value();
    if (type == "round") {
      cairo_set_line_join(ctx, CAIRO_LINE_JOIN_ROUND);
    } else if (type == "bevel") {
      cairo_set_line_join(ctx, CAIRO_LINE_JOIN_BEVEL);
    } else {
      cairo_set_line_join(ctx, CAIRO_LINE_JOIN_MITER);
    }
  }
}

/*
 * Get line cap.
 */

Napi::Value
Context2d::GetLineCap(const Napi::CallbackInfo& info) {
  const char *cap;
  switch (cairo_get_line_cap(context())) {
    case CAIRO_LINE_CAP_ROUND: cap = "round"; break;
    case CAIRO_LINE_CAP_SQUARE: cap = "square"; break;
    default: cap = "butt";
  }
  return Napi::String::New(env, cap);
}

/*
 * Set line cap.
 */

void
Context2d::SetLineCap(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Maybe<Napi::String> stringValue = value.ToString();
  cairo_t *ctx = context();

  if (stringValue.IsJust()) {
    std::string type = stringValue.Unwrap().Utf8Value();
    if (type == "round") {
      cairo_set_line_cap(ctx, CAIRO_LINE_CAP_ROUND);
    } else if (type == "square") {
      cairo_set_line_cap(ctx, CAIRO_LINE_CAP_SQUARE);
    } else {
      cairo_set_line_cap(ctx, CAIRO_LINE_CAP_BUTT);
    }
  }
}

/*
 * Check if the given point is within the current path.
 */

Napi::Value
Context2d::IsPointInPath(const Napi::CallbackInfo& info) {
  if (info[0].IsNumber() && info[1].IsNumber()) {
    cairo_t *ctx = context();
    double x = info[0].As<Napi::Number>(), y = info[1].As<Napi::Number>();
    setFillRule(info[2]);
    return Napi::Boolean::New(env, cairo_in_fill(ctx, x, y) || cairo_in_stroke(ctx, x, y));
  }
  return Napi::Boolean::New(env, false);
}

/*
 * Set shadow color.
 */

void
Context2d::SetShadowColor(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Maybe<Napi::String> stringValue = value.ToString();
  short ok;

  if (stringValue.IsJust()) {
    std::string str = stringValue.Unwrap().Utf8Value();
    uint32_t rgba = rgba_from_string(str.c_str(), &ok);
    if (ok) state->shadow = rgba_create(rgba);
  }
}

/*
 * Get shadow color.
 */

Napi::Value
Context2d::GetShadowColor(const Napi::CallbackInfo& info) {
  char buf[64];
  rgba_to_string(state->shadow, buf, sizeof(buf));
  return Napi::String::New(env, buf);
}

/*
 * Set fill color, used internally for fillStyle=
 */

void
Context2d::_setFillColor(Napi::Value arg) {
  Napi::Maybe<Napi::String> stringValue = arg.ToString();
  short ok;

  if (stringValue.IsJust()) {
    Napi::String str = stringValue.Unwrap();
    char buf[128] = {0};
    napi_status status = napi_get_value_string_utf8(env, str, buf, sizeof(buf) - 1, nullptr);
    if (status != napi_ok) return;
    uint32_t rgba = rgba_from_string(buf, &ok);
    if (!ok) return;
    state->fillPattern = state->fillGradient = NULL;
    state->fill = rgba_create(rgba);
  }
}

/*
 * Get fill color.
 */

Napi::Value
Context2d::_getFillColor() {
  char buf[64];
  rgba_to_string(state->fill, buf, sizeof(buf));
  return Napi::String::New(env, buf);
}

/*
 * Set stroke color, used internally for strokeStyle=
 */

void
Context2d::_setStrokeColor(Napi::Value arg) {
  short ok;
  std::string str = arg.As<Napi::String>();
  uint32_t rgba = rgba_from_string(str.c_str(), &ok);
  if (!ok) return;
  state->strokePattern = state->strokeGradient = NULL;
  state->stroke = rgba_create(rgba);
}

/*
 * Get stroke color.
 */

Napi::Value
Context2d::_getStrokeColor() {
  char buf[64];
  rgba_to_string(state->stroke, buf, sizeof(buf));
  return Napi::String::New(env, buf);
}

Napi::Value
Context2d::CreatePattern(const Napi::CallbackInfo& info) {
  Napi::Function ctor = env.GetInstanceData<InstanceData>()->CanvasPatternCtor.Value();
  Napi::Maybe<Napi::Object> ret = ctor.New({ info[0], info[1] });
  return ret.IsJust() ? ret.Unwrap() : env.Undefined();
}

Napi::Value
Context2d::CreateLinearGradient(const Napi::CallbackInfo& info) {
  Napi::Function ctor = env.GetInstanceData<InstanceData>()->CanvasGradientCtor.Value();
  Napi::Maybe<Napi::Object> ret = ctor.New({ info[0], info[1], info[2], info[3] });
  return ret.IsJust() ? ret.Unwrap() : env.Undefined();

}

Napi::Value
Context2d::CreateRadialGradient(const Napi::CallbackInfo& info) {
  Napi::Function ctor = env.GetInstanceData<InstanceData>()->CanvasGradientCtor.Value();
  Napi::Maybe<Napi::Object> ret = ctor.New({ info[0], info[1], info[2], info[3], info[4], info[5] });
  return ret.IsJust() ? ret.Unwrap() : env.Undefined();
}

/*
 * Bezier curve.
 */

void
Context2d::BezierCurveTo(const Napi::CallbackInfo& info) {
  double args[6];
  if(!checkArgs(info, args, 6))
    return;

  cairo_curve_to(context()
    , args[0]
    , args[1]
    , args[2]
    , args[3]
    , args[4]
    , args[5]);
}

/*
 * Quadratic curve approximation from libsvg-cairo.
 */

void
Context2d::QuadraticCurveTo(const Napi::CallbackInfo& info) {
  double args[4];
  if(!checkArgs(info, args, 4))
    return;

  cairo_t *ctx = context();

  double x, y
    , x1 = args[0]
    , y1 = args[1]
    , x2 = args[2]
    , y2 = args[3];

  cairo_get_current_point(ctx, &x, &y);

  if (0 == x && 0 == y) {
    x = x1;
    y = y1;
  }

  cairo_curve_to(ctx
    , x  + 2.0 / 3.0 * (x1 - x),  y  + 2.0 / 3.0 * (y1 - y)
    , x2 + 2.0 / 3.0 * (x1 - x2), y2 + 2.0 / 3.0 * (y1 - y2)
    , x2
    , y2);
}

/*
 * Save state.
 */

void
Context2d::Save(const Napi::CallbackInfo& info) {
  save();
}

/*
 * Restore state.
 */

void
Context2d::Restore(const Napi::CallbackInfo& info) {
  restore();
}

/*
 * Creates a new subpath.
 */

void
Context2d::BeginPath(const Napi::CallbackInfo& info) {
  cairo_new_path(context());
}

/*
 * Marks the subpath as closed.
 */

void
Context2d::ClosePath(const Napi::CallbackInfo& info) {
  cairo_close_path(context());
}

/*
 * Rotate transformation.
 */

void
Context2d::Rotate(const Napi::CallbackInfo& info) {
  double args[1];
  if(!checkArgs(info, args, 1))
    return;

  cairo_rotate(context(), args[0]);
}

/*
 * Modify the CTM.
 */

void
Context2d::Transform(const Napi::CallbackInfo& info) {
  double args[6];
  if(!checkArgs(info, args, 6))
    return;

  cairo_matrix_t matrix;
  cairo_matrix_init(&matrix
    , args[0]
    , args[1]
    , args[2]
    , args[3]
    , args[4]
    , args[5]);

  cairo_transform(context(), &matrix);
}

/*
 * Get the CTM
 */

Napi::Value
Context2d::GetTransform(const Napi::CallbackInfo& info) {
  return get_current_transform();
}

/*
 * Reset the CTM, used internally by setTransform().
 */

void
Context2d::ResetTransform(const Napi::CallbackInfo& info) {
  cairo_identity_matrix(context());
}

/*
 * Reset transform matrix to identity, then apply the given args.
 */

void
Context2d::SetTransform(const Napi::CallbackInfo& info) {
  Napi::Object mat;

  if (info.Length() == 1 && info[0].ToObject().UnwrapTo(&mat)) {
    if (!mat.InstanceOf(env.GetInstanceData<InstanceData>()->DOMMatrixCtor.Value()).UnwrapOr(false)) {
      if (!env.IsExceptionPending()) {
        Napi::TypeError::New(env, "Expected DOMMatrix").ThrowAsJavaScriptException();
      }
      return;
    }

    cairo_matrix_t matrix;
    parse_matrix_from_object(matrix, mat);

    cairo_set_matrix(context(), &matrix);
  } else {
    cairo_identity_matrix(context());
    Context2d::Transform(info);
  }
}

/*
 * Translate transformation.
 */

void
Context2d::Translate(const Napi::CallbackInfo& info) {
  double args[2];
  if(!checkArgs(info, args, 2))
    return;

  cairo_translate(context(), args[0], args[1]);
}

/*
 * Scale transformation.
 */

void
Context2d::Scale(const Napi::CallbackInfo& info) {
  double args[2];
  if(!checkArgs(info, args, 2))
    return;

  cairo_scale(context(), args[0], args[1]);
}

/*
 * Use path as clipping region.
 */

void
Context2d::Clip(const Napi::CallbackInfo& info) {
  setFillRule(info[0]);
  cairo_t *ctx = context();
  cairo_clip_preserve(ctx);
}

/*
 * Fill the path.
 */

void
Context2d::Fill(const Napi::CallbackInfo& info) {
  setFillRule(info[0]);
  fill(true);
}

/*
 * Stroke the path.
 */

void
Context2d::Stroke(const Napi::CallbackInfo& info) {
  stroke(true);
}

/*
 * Helper for fillText/strokeText
 */

double
get_text_scale(PangoLayout *layout, double maxWidth) {

  PangoRectangle logical_rect;
  pango_layout_get_pixel_extents(layout, NULL, &logical_rect);

  if (logical_rect.width > maxWidth) {
    return maxWidth / logical_rect.width;
  } else {
    return 1.0;
  }
}

/*
 * Make sure the layout's font list is up-to-date
 */
void
Context2d::checkFonts() {
  // If fonts have been registered, the PangoContext is using an outdated FontMap
  if (canvas()->fontSerial != fontSerial) {
    pango_context_set_font_map(
      pango_layout_get_context(_layout),
      pango_cairo_font_map_get_default()
    );

    fontSerial = canvas()->fontSerial;
  }
}

void
Context2d::paintText(const Napi::CallbackInfo& info, bool stroke) {
  int argsNum = info.Length() >= 4 ? 3 : 2;

  if (argsNum == 3 && info[3].IsUndefined())
    argsNum = 2;

  double args[3];
  if(!checkArgs(info, args, argsNum, 1))
    return;

  Napi::String strValue;

  if (!info[0].ToString().UnwrapTo(&strValue)) return;

  std::string str = strValue.Utf8Value();
  double x = args[0];
  double y = args[1];
  double scaled_by = 1;

  PangoLayout *layout = this->layout();

  checkFonts();
  pango_layout_set_text(layout, str.c_str(), -1);
  if (state->lang != "") {
    pango_context_set_language(pango_layout_get_context(_layout), pango_language_from_string(state->lang.c_str()));
  }
  pango_cairo_update_layout(context(), layout);

  PangoDirection pango_dir = state->direction == "ltr" ? PANGO_DIRECTION_LTR : PANGO_DIRECTION_RTL;
  pango_context_set_base_dir(pango_layout_get_context(_layout), pango_dir);

  if (argsNum == 3) {
    if (args[2] <= 0) return;
    scaled_by = get_text_scale(layout, args[2]);
    cairo_save(context());
    cairo_scale(context(), scaled_by, 1);
  }

  savePath();
  if (state->textDrawingMode == TEXT_DRAW_GLYPHS) {
    if (stroke == true) { this->stroke(); } else { this->fill(); }
    setTextPath(x / scaled_by, y);
  } else if (state->textDrawingMode == TEXT_DRAW_PATHS) {
    setTextPath(x / scaled_by, y);
    if (stroke == true) { this->stroke(); } else { this->fill(); }
  }
  restorePath();
  if (argsNum == 3) {
    cairo_restore(context());
  }
}

/*
 * Fill text at (x, y).
 */

void
Context2d::FillText(const Napi::CallbackInfo& info) {
  paintText(info, false);
}

/*
 * Stroke text at (x ,y).
 */

void
Context2d::StrokeText(const Napi::CallbackInfo& info) {
  paintText(info, true);
}

/*
 * Gets the baseline adjustment in device pixels
 */
inline double getBaselineAdjustment(PangoLayout* layout, short baseline) {
  PangoRectangle logical_rect;
  pango_layout_line_get_extents(pango_layout_get_line(layout, 0), NULL, &logical_rect);

  double scale = 1.0 / PANGO_SCALE;
  double ascent = scale * pango_layout_get_baseline(layout);
  double descent = scale * logical_rect.height - ascent;

  switch (baseline) {
  case TEXT_BASELINE_ALPHABETIC:
    return ascent;
  case TEXT_BASELINE_MIDDLE:
    return (ascent + descent) / 2.0;
  case TEXT_BASELINE_BOTTOM:
    return ascent + descent;
  default:
    return 0;
  }
}

text_align_t
Context2d::resolveTextAlignment() {
  text_align_t alignment = state->textAlignment;

  // Convert start/end to left/right based on direction
  if (alignment == TEXT_ALIGNMENT_START) {
    return (state->direction == "rtl") ? TEXT_ALIGNMENT_RIGHT : TEXT_ALIGNMENT_LEFT;
  } else if (alignment == TEXT_ALIGNMENT_END) {
    return (state->direction == "rtl") ? TEXT_ALIGNMENT_LEFT : TEXT_ALIGNMENT_RIGHT;
  }

  return alignment;
}

/*
 * Set text path for the string in the layout at (x, y).
 * This function is called by paintText and won't behave correctly
 * if is not called from there.
 * it needs pango_layout_set_text and pango_cairo_update_layout to be called before
 */

void
Context2d::setTextPath(double x, double y) {
  PangoRectangle logical_rect;
  text_align_t alignment = resolveTextAlignment();

  switch (alignment) {
    case TEXT_ALIGNMENT_CENTER:
      pango_layout_get_pixel_extents(_layout, NULL, &logical_rect);
      x -= logical_rect.width / 2;
      break;
    case TEXT_ALIGNMENT_RIGHT:
      pango_layout_get_pixel_extents(_layout, NULL, &logical_rect);
      x -= logical_rect.width;
      break;
    default: // TEXT_ALIGNMENT_LEFT
      break;
  }

  y -= getBaselineAdjustment(_layout, state->textBaseline);

  cairo_move_to(_context, x, y);
  if (state->textDrawingMode == TEXT_DRAW_PATHS) {
    pango_cairo_layout_path(_context, _layout);
  } else if (state->textDrawingMode == TEXT_DRAW_GLYPHS) {
    pango_cairo_show_layout(_context, _layout);
  }
}

/*
 * Adds a point to the current subpath.
 */

void
Context2d::LineTo(const Napi::CallbackInfo& info) {
  double args[2];
  if(!checkArgs(info, args, 2))
    return;

  cairo_line_to(context(), args[0], args[1]);
}

/*
 * Creates a new subpath at the given point.
 */

void
Context2d::MoveTo(const Napi::CallbackInfo& info) {
  double args[2];
  if(!checkArgs(info, args, 2))
    return;

  cairo_move_to(context(), args[0], args[1]);
}

/*
 * Get font.
 */

Napi::Value
Context2d::GetFont(const Napi::CallbackInfo& info) {
  return Napi::String::New(env, state->font);
}

/*
 * Set font:
 *   - weight
 *   - style
 *   - size
 *   - unit
 *   - family
 */

void
Context2d::SetFont(const Napi::CallbackInfo& info, const Napi::Value& value) {
  if (!value.IsString()) return;

  std::string str = value.As<Napi::String>().Utf8Value();
  if (!str.length()) return;

  bool success;
  auto props = FontParser::parse(str, &success);
  if (!success) return;

  PangoFontDescription *desc = pango_font_description_copy(state->fontDescription);
  pango_font_description_free(state->fontDescription);

  PangoStyle style = props.fontStyle == FontStyle::Italic ? PANGO_STYLE_ITALIC
    : props.fontStyle == FontStyle::Oblique ? PANGO_STYLE_OBLIQUE
    : PANGO_STYLE_NORMAL;
  pango_font_description_set_style(desc, style);

  pango_font_description_set_weight(desc, static_cast<PangoWeight>(props.fontWeight));

  std::string family = props.fontFamily.empty() ? "" : props.fontFamily[0];
  for (size_t i = 1; i < props.fontFamily.size(); i++) {
    family += "," + props.fontFamily[i];
  }
  if (family.length() > 0) {
    // See #1643 - Pango understands "sans" whereas CSS uses "sans-serif"
    std::string s1(family);
    std::string s2("sans-serif");
    if (streq_casein(s1, s2)) {
      pango_font_description_set_family(desc, "sans");
    } else {
      pango_font_description_set_family(desc, family.c_str());
    }
  }

  PangoFontDescription *sys_desc = Canvas::ResolveFontDescription(desc);
  pango_font_description_free(desc);

  if (props.fontSize > 0) pango_font_description_set_absolute_size(sys_desc, props.fontSize * PANGO_SCALE);

  state->fontDescription = sys_desc;
  pango_layout_set_font_description(_layout, sys_desc);

  state->font = str;
}

/*
 * Get text baseline.
 */

Napi::Value
Context2d::GetTextBaseline(const Napi::CallbackInfo& info) {
  const char* baseline;
  switch (state->textBaseline) {
    default:
    case TEXT_BASELINE_ALPHABETIC: baseline = "alphabetic"; break;
    case TEXT_BASELINE_TOP: baseline = "top"; break;
    case TEXT_BASELINE_BOTTOM: baseline = "bottom"; break;
    case TEXT_BASELINE_MIDDLE: baseline = "middle"; break;
    case TEXT_BASELINE_IDEOGRAPHIC: baseline = "ideographic"; break;
    case TEXT_BASELINE_HANGING: baseline = "hanging"; break;
  }
  return Napi::String::New(env, baseline);
}

/*
 * Set text baseline.
 */

void
Context2d::SetTextBaseline(const Napi::CallbackInfo& info, const Napi::Value& value) {
  if (!value.IsString()) return;

  std::string opStr = value.As<Napi::String>();
  const std::map<std::string, text_baseline_t> modes = {
    {"alphabetic", TEXT_BASELINE_ALPHABETIC},
    {"top", TEXT_BASELINE_TOP},
    {"bottom", TEXT_BASELINE_BOTTOM},
    {"middle", TEXT_BASELINE_MIDDLE},
    {"ideographic", TEXT_BASELINE_IDEOGRAPHIC},
    {"hanging", TEXT_BASELINE_HANGING}
  };
  auto op = modes.find(opStr);
  if (op == modes.end()) return;

  state->textBaseline = op->second;
}

/*
 * Get text align.
 */

Napi::Value
Context2d::GetTextAlign(const Napi::CallbackInfo& info) {
  const char* align;
  switch (state->textAlignment) {
    case TEXT_ALIGNMENT_LEFT: align = "left"; break;
    case TEXT_ALIGNMENT_START: align = "start"; break;
    case TEXT_ALIGNMENT_CENTER: align = "center"; break;
    case TEXT_ALIGNMENT_RIGHT: align = "right"; break;
    case TEXT_ALIGNMENT_END: align = "end"; break;
    default: align = "start";
  }
  return Napi::String::New(env, align);
}

/*
 * Set text align.
 */

void
Context2d::SetTextAlign(const Napi::CallbackInfo& info, const Napi::Value& value) {
  if (!value.IsString()) return;

  std::string opStr = value.As<Napi::String>();
  const std::map<std::string, text_align_t> modes = {
    {"center", TEXT_ALIGNMENT_CENTER},
    {"left", TEXT_ALIGNMENT_LEFT},
    {"start", TEXT_ALIGNMENT_START},
    {"right", TEXT_ALIGNMENT_RIGHT},
    {"end", TEXT_ALIGNMENT_END}
  };
  auto op = modes.find(opStr);
  if (op == modes.end()) return;

  state->textAlignment = op->second;
}

/*
 * Return the given text extents.
 * TODO: Support for:
 * hangingBaseline, ideographicBaseline,
 * fontBoundingBoxAscent, fontBoundingBoxDescent
 */

Napi::Value
Context2d::MeasureText(const Napi::CallbackInfo& info) {
  cairo_t *ctx = this->context();

  Napi::String str;
  if (!info[0].ToString().UnwrapTo(&str)) return env.Undefined();

  Napi::Object obj = Napi::Object::New(env);

  PangoRectangle _ink_rect, _logical_rect;
  float_rectangle ink_rect, logical_rect;
  PangoFontMetrics *metrics;
  PangoLayout *layout = this->layout();

  checkFonts();
  pango_layout_set_text(layout, str.Utf8Value().c_str(), -1);
  if (state->lang != "") {
    pango_context_set_language(pango_layout_get_context(_layout), pango_language_from_string(state->lang.c_str()));
  }
  pango_cairo_update_layout(ctx, layout);

  // Normally you could use pango_layout_get_pixel_extents and be done, or use
  // pango_extents_to_pixels, but both of those round the pixels, so we have to
  // divide by PANGO_SCALE manually
  pango_layout_get_extents(layout, &_ink_rect, &_logical_rect);

  float inverse_pango_scale = 1. / PANGO_SCALE;

  logical_rect.x = _logical_rect.x * inverse_pango_scale;
  logical_rect.y = _logical_rect.y * inverse_pango_scale;
  logical_rect.width = _logical_rect.width * inverse_pango_scale;
  logical_rect.height = _logical_rect.height * inverse_pango_scale;

  ink_rect.x = _ink_rect.x * inverse_pango_scale;
  ink_rect.y = _ink_rect.y * inverse_pango_scale;
  ink_rect.width = _ink_rect.width * inverse_pango_scale;
  ink_rect.height = _ink_rect.height * inverse_pango_scale;

  metrics = PANGO_LAYOUT_GET_METRICS(layout);

  text_align_t alignment = resolveTextAlignment();

  double x_offset;
  switch (alignment) {
    case TEXT_ALIGNMENT_CENTER:
      x_offset = logical_rect.width / 2.;
      break;
    case TEXT_ALIGNMENT_RIGHT:
      x_offset = logical_rect.width;
      break;
    case TEXT_ALIGNMENT_LEFT:
    default:
      x_offset = 0.0;
  }

  double y_offset = getBaselineAdjustment(layout, state->textBaseline);

  obj.Set("width", Napi::Number::New(env, logical_rect.width));
  obj.Set("actualBoundingBoxLeft", Napi::Number::New(env, PANGO_LBEARING(ink_rect) + x_offset));
  obj.Set("actualBoundingBoxRight", Napi::Number::New(env, PANGO_RBEARING(ink_rect) - x_offset));
  obj.Set("actualBoundingBoxAscent", Napi::Number::New(env, y_offset + PANGO_ASCENT(ink_rect)));
  obj.Set("actualBoundingBoxDescent", Napi::Number::New(env, PANGO_DESCENT(ink_rect) - y_offset));
  obj.Set("emHeightAscent", Napi::Number::New(env, -(PANGO_ASCENT(logical_rect) - y_offset)));
  obj.Set("emHeightDescent", Napi::Number::New(env, PANGO_DESCENT(logical_rect) - y_offset));
  obj.Set("alphabeticBaseline", Napi::Number::New(env, -(pango_font_metrics_get_ascent(metrics) * inverse_pango_scale - y_offset)));

  pango_font_metrics_unref(metrics);

  return obj;
}

/*
 * Set line dash
 * ref: http://www.w3.org/TR/2dcontext/#dom-context-2d-setlinedash
 */

void
Context2d::SetLineDash(const Napi::CallbackInfo& info) {
  if (!info[0].IsArray()) return;
  Napi::Array dash = info[0].As<Napi::Array>();
  uint32_t dashes = dash.Length() & 1 ? dash.Length() * 2 : dash.Length();
  uint32_t zero_dashes = 0;
  std::vector<double> a(dashes);
  for (uint32_t i=0; i<dashes; i++) {
    Napi::Number d;
    if (!dash.Get(i % dash.Length()).UnwrapTo(&d) || !d.IsNumber()) return;
    a[i] = d.As<Napi::Number>().DoubleValue();
    if (a[i] == 0) zero_dashes++;
    if (a[i] < 0 || !std::isfinite(a[i])) return;
  }

  cairo_t *ctx = this->context();
  double offset;
  cairo_get_dash(ctx, NULL, &offset);
  if (zero_dashes == dashes) {
    std::vector<double> b(0);
    cairo_set_dash(ctx, b.data(), 0, offset);
  } else {
    cairo_set_dash(ctx, a.data(), dashes, offset);
  }
}

/*
 * Get line dash
 * ref: http://www.w3.org/TR/2dcontext/#dom-context-2d-setlinedash
 */
Napi::Value
Context2d::GetLineDash(const Napi::CallbackInfo& info) {
  cairo_t *ctx = this->context();
  int dashes = cairo_get_dash_count(ctx);
  std::vector<double> a(dashes);
  cairo_get_dash(ctx, a.data(), NULL);

  Napi::Array dash = Napi::Array::New(env, dashes);
  for (int i=0; i<dashes; i++) {
    dash.Set(Napi::Number::New(env, i), Napi::Number::New(env, a[i]));
  }

  return dash;
}

/*
 * Set line dash offset
 * ref: http://www.w3.org/TR/2dcontext/#dom-context-2d-setlinedash
 */
void
Context2d::SetLineDashOffset(const Napi::CallbackInfo& info, const Napi::Value& value) {
  Napi::Number numberValue;
  if (!value.ToNumber().UnwrapTo(&numberValue)) return;
  double offset = numberValue.DoubleValue();
  if (!std::isfinite(offset)) return;

  cairo_t *ctx = this->context();

  int dashes = cairo_get_dash_count(ctx);
  std::vector<double> a(dashes);
  cairo_get_dash(ctx, a.data(), NULL);
  cairo_set_dash(ctx, a.data(), dashes, offset);
}

/*
 * Get line dash offset
 * ref: http://www.w3.org/TR/2dcontext/#dom-context-2d-setlinedash
 */
Napi::Value
Context2d::GetLineDashOffset(const Napi::CallbackInfo& info) {
  cairo_t *ctx = this->context();
  double offset;
  cairo_get_dash(ctx, NULL, &offset);

  return Napi::Number::New(env, offset);
}

/*
 * Fill the rectangle defined by x, y, width and height.
 */

void
Context2d::FillRect(const Napi::CallbackInfo& info) {
  RECT_ARGS;
  if (0 == width || 0 == height) return;
  cairo_t *ctx = context();
  savePath();
  cairo_rectangle(ctx, x, y, width, height);
  fill();
  restorePath();
}

/*
 * Stroke the rectangle defined by x, y, width and height.
 */

void
Context2d::StrokeRect(const Napi::CallbackInfo& info) {
  RECT_ARGS;
  if (0 == width && 0 == height) return;
  cairo_t *ctx = context();
  savePath();
  cairo_rectangle(ctx, x, y, width, height);
  stroke();
  restorePath();
}

/*
 * Clears all pixels defined by x, y, width and height.
 */

void
Context2d::ClearRect(const Napi::CallbackInfo& info) {
  RECT_ARGS;
  if (0 == width || 0 == height) return;
  cairo_t *ctx = context();
  cairo_save(ctx);
  savePath();
  cairo_rectangle(ctx, x, y, width, height);
  cairo_set_operator(ctx, CAIRO_OPERATOR_CLEAR);
  cairo_fill(ctx);
  restorePath();
  cairo_restore(ctx);
}

/*
 * Adds a rectangle subpath.
 */

void
Context2d::Rect(const Napi::CallbackInfo& info) {
  RECT_ARGS;
  cairo_t *ctx = context();
  if (width == 0) {
    cairo_move_to(ctx, x, y);
    cairo_line_to(ctx, x, y + height);
  } else if (height == 0) {
    cairo_move_to(ctx, x, y);
    cairo_line_to(ctx, x + width, y);
  } else {
    cairo_rectangle(ctx, x, y, width, height);
  }
}

// Draws an arc with two potentially different radii.
inline static
void elli_arc(cairo_t* ctx, double xc, double yc, double rx, double ry, double a1, double a2, bool clockwise=true) {
  if (rx == 0. || ry == 0.) {
    cairo_line_to(ctx, xc + rx, yc + ry);
  } else {
    cairo_save(ctx);
    cairo_translate(ctx, xc, yc);
    cairo_scale(ctx, rx, ry);
    if (clockwise)
      cairo_arc(ctx, 0., 0., 1., a1, a2);
    else
      cairo_arc_negative(ctx, 0., 0., 1., a2, a1);
    cairo_restore(ctx);
  }
}

inline static
bool getRadius(Point<double>& p, const Napi::Value& v) {
  Napi::Env env = v.Env();
  if (v.IsObject()) { // 5.1 DOMPointInit
    Napi::Value rx;
    Napi::Value ry;
    auto rxMaybe = v.As<Napi::Object>().Get("x");
    auto ryMaybe = v.As<Napi::Object>().Get("y");
    if (rxMaybe.UnwrapTo(&rx) && rx.IsNumber() && ryMaybe.UnwrapTo(&ry) && ry.IsNumber()) {
      auto rxv = rx.As<Napi::Number>().DoubleValue();
      auto ryv = ry.As<Napi::Number>().DoubleValue();
      if (!std::isfinite(rxv) || !std::isfinite(ryv))
        return true;
      if (rxv < 0 || ryv < 0) {
        Napi::RangeError::New(env, "radii must be positive.").ThrowAsJavaScriptException();

        return true;
      }
      p.x = rxv;
      p.y = ryv;
      return false;
    }
  } else if (v.IsNumber()) { // 5.2 unrestricted double
    auto rv = v.As<Napi::Number>().DoubleValue();
    if (!std::isfinite(rv))
      return true;
    if (rv < 0) {
      Napi::RangeError::New(env, "radii must be positive.").ThrowAsJavaScriptException();

      return true;
    }
    p.x = p.y = rv;
    return false;
  }
  return true;
}

/**
 * https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-roundrect
 * x, y, w, h, [radius|[radii]]
 */
void
Context2d::RoundRect(const Napi::CallbackInfo& info) {
  RECT_ARGS;
  cairo_t *ctx = this->context();

  // 4. Let normalizedRadii be an empty list
  Point<double> normalizedRadii[4];
  size_t nRadii = 4;

  if (info[4].IsUndefined()) {
    for (size_t i = 0; i < 4; i++)
      normalizedRadii[i].x = normalizedRadii[i].y = 0.;

  } else if (info[4].IsArray()) {
    auto radiiList = info[4].As<Napi::Array>();
    nRadii = radiiList.Length();
    if (!(nRadii >= 1 && nRadii <= 4)) {
      Napi::RangeError::New(env, "radii must be a list of one, two, three or four radii.").ThrowAsJavaScriptException();
      return;
    }
    // 5. For each radius of radii
    for (size_t i = 0; i < nRadii; i++) {
      Napi::Value r;
      if (!radiiList.Get(i).UnwrapTo(&r) || getRadius(normalizedRadii[i], r))
        return;
    }

  } else {
    // 2. If radii is a double, then set radii to <<radii>>
    if (getRadius(normalizedRadii[0], info[4]))
      return;
    for (size_t i = 1; i < 4; i++) {
      normalizedRadii[i].x = normalizedRadii[0].x;
      normalizedRadii[i].y = normalizedRadii[0].y;
    }
  }

  Point<double> upperLeft, upperRight, lowerRight, lowerLeft;
  if (nRadii == 4) {
    upperLeft = normalizedRadii[0];
    upperRight = normalizedRadii[1];
    lowerRight = normalizedRadii[2];
    lowerLeft = normalizedRadii[3];
  } else if (nRadii == 3) {
    upperLeft = normalizedRadii[0];
    upperRight = normalizedRadii[1];
    lowerLeft = normalizedRadii[1];
    lowerRight = normalizedRadii[2];
  } else if (nRadii == 2) {
    upperLeft = normalizedRadii[0];
    lowerRight = normalizedRadii[0];
    upperRight = normalizedRadii[1];
    lowerLeft = normalizedRadii[1];
  } else {
    upperLeft = normalizedRadii[0];
    upperRight = normalizedRadii[0];
    lowerRight = normalizedRadii[0];
    lowerLeft = normalizedRadii[0];
  }

  bool clockwise = true;
  if (width < 0) {
    clockwise = false;
    x += width;
    width = -width;
    std::swap(upperLeft, upperRight);
    std::swap(lowerLeft, lowerRight);
  }

  if (height < 0) {
    clockwise = !clockwise;
    y += height;
    height = -height;
    std::swap(upperLeft, lowerLeft);
    std::swap(upperRight, lowerRight);
  }

  // 11. Corner curves must not overlap. Scale radii to prevent this.
  {
    auto top = upperLeft.x + upperRight.x;
    auto right = upperRight.y + lowerRight.y;
    auto bottom = lowerRight.x + lowerLeft.x;
    auto left = upperLeft.y + lowerLeft.y;
    auto scale = std::min({ width / top, height / right, width / bottom, height / left });
    if (scale < 1.) {
      upperLeft.x *= scale;
      upperLeft.y *= scale;
      upperRight.x *= scale;
      upperRight.y *= scale;
      lowerLeft.x *= scale;
      lowerLeft.y *= scale;
      lowerRight.x *= scale;
      lowerRight.y *= scale;
    }
  }

  // 12. Draw
  cairo_move_to(ctx, x + upperLeft.x, y);
  if (clockwise) {
    cairo_line_to(ctx, x + width - upperRight.x, y);
    elli_arc(ctx, x + width - upperRight.x, y + upperRight.y, upperRight.x, upperRight.y, 3. * M_PI / 2., 0.);
    cairo_line_to(ctx, x + width, y + height - lowerRight.y);
    elli_arc(ctx, x + width - lowerRight.x, y + height - lowerRight.y, lowerRight.x, lowerRight.y, 0, M_PI / 2.);
    cairo_line_to(ctx, x + lowerLeft.x, y + height);
    elli_arc(ctx, x + lowerLeft.x, y + height - lowerLeft.y, lowerLeft.x, lowerLeft.y, M_PI / 2., M_PI);
    cairo_line_to(ctx, x, y + upperLeft.y);
    elli_arc(ctx, x + upperLeft.x, y + upperLeft.y, upperLeft.x, upperLeft.y, M_PI, 3. * M_PI / 2.);
  } else {
    elli_arc(ctx, x + upperLeft.x, y + upperLeft.y, upperLeft.x, upperLeft.y, M_PI, 3. * M_PI / 2., false);
    cairo_line_to(ctx, x, y + upperLeft.y);
    elli_arc(ctx, x + lowerLeft.x, y + height - lowerLeft.y, lowerLeft.x, lowerLeft.y, M_PI / 2., M_PI, false);
    cairo_line_to(ctx, x + lowerLeft.x, y + height);
    elli_arc(ctx, x + width - lowerRight.x, y + height - lowerRight.y, lowerRight.x, lowerRight.y, 0, M_PI / 2., false);
    cairo_line_to(ctx, x + width, y + height - lowerRight.y);
    elli_arc(ctx, x + width - upperRight.x, y + upperRight.y, upperRight.x, upperRight.y, 3. * M_PI / 2., 0., false);
    cairo_line_to(ctx, x + width - upperRight.x, y);
  }
  cairo_close_path(ctx);
}

// Adapted from https://chromium.googlesource.com/chromium/blink/+/refs/heads/main/Source/modules/canvas2d/CanvasPathMethods.cpp
static void canonicalizeAngle(double& startAngle, double& endAngle) {
  // Make 0 <= startAngle < 2*PI
  double newStartAngle = std::fmod(startAngle, twoPi);
  if (newStartAngle < 0) {
      newStartAngle += twoPi;
      // Check for possible catastrophic cancellation in cases where
      // newStartAngle was a tiny negative number (c.f. crbug.com/503422)
      if (newStartAngle >= twoPi)
          newStartAngle -= twoPi;
  }
  double delta = newStartAngle - startAngle;
  startAngle = newStartAngle;
  endAngle = endAngle + delta;
}

// Adapted from https://chromium.googlesource.com/chromium/blink/+/refs/heads/main/Source/modules/canvas2d/CanvasPathMethods.cpp
static double adjustEndAngle(double startAngle, double endAngle, bool counterclockwise) {
  double newEndAngle = endAngle;
  /* http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-arc
  * If the counterclockwise argument is false and endAngle-startAngle is equal to or greater than 2pi, or,
  * if the counterclockwise argument is true and startAngle-endAngle is equal to or greater than 2pi,
  * then the arc is the whole circumference of this ellipse, and the point at startAngle along this circle's circumference,
  * measured in radians clockwise from the ellipse's semi-major axis, acts as both the start point and the end point.
  */
  if (!counterclockwise && endAngle - startAngle >= twoPi)
    newEndAngle = startAngle + twoPi;
  else if (counterclockwise && startAngle - endAngle >= twoPi)
    newEndAngle = startAngle - twoPi;
  /*
  * Otherwise, the arc is the path along the circumference of this ellipse from the start point to the end point,
  * going anti-clockwise if the counterclockwise argument is true, and clockwise otherwise.
  * Since the points are on the ellipse, as opposed to being simply angles from zero,
  * the arc can never cover an angle greater than 2pi radians.
  */
  /* NOTE: When startAngle = 0, endAngle = 2Pi and counterclockwise = true, the spec does not indicate clearly.
  * We draw the entire circle, because some web sites use arc(x, y, r, 0, 2*Math.PI, true) to draw circle.
  * We preserve backward-compatibility.
  */
  else if (!counterclockwise && startAngle > endAngle)
    newEndAngle = startAngle + (twoPi - std::fmod(startAngle - endAngle, twoPi));
  else if (counterclockwise && startAngle < endAngle)
    newEndAngle = startAngle - (twoPi - std::fmod(endAngle - startAngle, twoPi));
  return newEndAngle;
}

/*
 * Adds an arc at x, y with the given radii and start/end angles.
 */

void
Context2d::Arc(const Napi::CallbackInfo& info) {
  double args[5];
  if(!checkArgs(info, args, 5))
    return;

  auto x = args[0];
  auto y = args[1];
  auto radius = args[2];
  auto startAngle = args[3];
  auto endAngle = args[4];

  if (radius < 0) {
    Napi::RangeError::New(env, "The radius provided is negative.").ThrowAsJavaScriptException();
    return;
  }

  Napi::Boolean counterclockwiseValue;
  if (!info[5].ToBoolean().UnwrapTo(&counterclockwiseValue)) return;
  bool counterclockwise = counterclockwiseValue.Value();

  cairo_t *ctx = context();

  canonicalizeAngle(startAngle, endAngle);
  endAngle = adjustEndAngle(startAngle, endAngle, counterclockwise);

  if (counterclockwise) {
    cairo_arc_negative(ctx, x, y, radius, startAngle, endAngle);
  } else {
    cairo_arc(ctx, x, y, radius, startAngle, endAngle);
  }
}

/*
 * Adds an arcTo point (x0,y0) to (x1,y1) with the given radius.
 *
 * Implementation influenced by WebKit.
 */

void
Context2d::ArcTo(const Napi::CallbackInfo& info) {
  double args[5];
  if(!checkArgs(info, args, 5))
    return;

  cairo_t *ctx = context();

  // Current path point
  double x, y;
  cairo_get_current_point(ctx, &x, &y);
  Point<float> p0(x, y);

  // Point (x0,y0)
  Point<float> p1(args[0], args[1]);

  // Point (x1,y1)
  Point<float> p2(args[2], args[3]);

  float radius = args[4];

  if ((p1.x == p0.x && p1.y == p0.y)
    || (p1.x == p2.x && p1.y == p2.y)
    || radius == 0.f) {
    cairo_line_to(ctx, p1.x, p1.y);
    return;
  }

  Point<float> p1p0((p0.x - p1.x),(p0.y - p1.y));
  Point<float> p1p2((p2.x - p1.x),(p2.y - p1.y));
  float p1p0_length = sqrtf(p1p0.x * p1p0.x + p1p0.y * p1p0.y);
  float p1p2_length = sqrtf(p1p2.x * p1p2.x + p1p2.y * p1p2.y);

  double cos_phi = (p1p0.x * p1p2.x + p1p0.y * p1p2.y) / (p1p0_length * p1p2_length);
  // all points on a line logic
  if (-1 == cos_phi) {
    cairo_line_to(ctx, p1.x, p1.y);
    return;
  }

  if (1 == cos_phi) {
    // add infinite far away point
    unsigned int max_length = 65535;
    double factor_max = max_length / p1p0_length;
    Point<float> ep((p0.x + factor_max * p1p0.x), (p0.y + factor_max * p1p0.y));
    cairo_line_to(ctx, ep.x, ep.y);
    return;
  }

  float tangent = radius / tan(acos(cos_phi) / 2);
  float factor_p1p0 = tangent / p1p0_length;
  Point<float> t_p1p0((p1.x + factor_p1p0 * p1p0.x), (p1.y + factor_p1p0 * p1p0.y));

  Point<float> orth_p1p0(p1p0.y, -p1p0.x);
  float orth_p1p0_length = sqrt(orth_p1p0.x * orth_p1p0.x + orth_p1p0.y * orth_p1p0.y);
  float factor_ra = radius / orth_p1p0_length;

  double cos_alpha = (orth_p1p0.x * p1p2.x + orth_p1p0.y * p1p2.y) / (orth_p1p0_length * p1p2_length);
  if (cos_alpha < 0.f)
      orth_p1p0 = Point<float>(-orth_p1p0.x, -orth_p1p0.y);

  Point<float> p((t_p1p0.x + factor_ra * orth_p1p0.x), (t_p1p0.y + factor_ra * orth_p1p0.y));

  orth_p1p0 = Point<float>(-orth_p1p0.x, -orth_p1p0.y);
  float sa = acos(orth_p1p0.x / orth_p1p0_length);
  if (orth_p1p0.y < 0.f)
      sa = 2 * M_PI - sa;

  bool anticlockwise = false;

  float factor_p1p2 = tangent / p1p2_length;
  Point<float> t_p1p2((p1.x + factor_p1p2 * p1p2.x), (p1.y + factor_p1p2 * p1p2.y));
  Point<float> orth_p1p2((t_p1p2.x - p.x),(t_p1p2.y - p.y));
  float orth_p1p2_length = sqrtf(orth_p1p2.x * orth_p1p2.x + orth_p1p2.y * orth_p1p2.y);
  float ea = acos(orth_p1p2.x / orth_p1p2_length);

  if (orth_p1p2.y < 0) ea = 2 * M_PI - ea;
  if ((sa > ea) && ((sa - ea) < M_PI)) anticlockwise = true;
  if ((sa < ea) && ((ea - sa) > M_PI)) anticlockwise = true;

  cairo_line_to(ctx, t_p1p0.x, t_p1p0.y);

  if (anticlockwise && M_PI * 2 != radius) {
    cairo_arc_negative(ctx
      , p.x
      , p.y
      , radius
      , sa
      , ea);
  } else {
    cairo_arc(ctx
      , p.x
      , p.y
      , radius
      , sa
      , ea);
  }
}

/*
 * Adds an ellipse to the path which is centered at (x, y) position with the
 * radii radiusX and radiusY starting at startAngle and ending at endAngle
 * going in the given direction by anticlockwise (defaulting to clockwise).
 */

void
Context2d::Ellipse(const Napi::CallbackInfo& info) {
  double args[7];
  if(!checkArgs(info, args, 7))
    return;

  double radiusX = args[2];
  double radiusY = args[3];

  if (radiusX == 0 || radiusY == 0) return;

  double x = args[0];
  double y = args[1];
  double rotation = args[4];
  double startAngle = args[5];
  double endAngle = args[6];
  Napi::Boolean anticlockwiseValue;

  if (!info[7].ToBoolean().UnwrapTo(&anticlockwiseValue)) return;
  bool anticlockwise = anticlockwiseValue.Value();

  cairo_t *ctx = context();

  // See https://www.cairographics.org/cookbook/ellipses/
  double xRatio = radiusX / radiusY;

  cairo_matrix_t save_matrix;
  cairo_get_matrix(ctx, &save_matrix);
  cairo_translate(ctx, x, y);
  cairo_rotate(ctx, rotation);
  cairo_scale(ctx, xRatio, 1.0);
  cairo_translate(ctx, -x, -y);
  if (anticlockwise && M_PI * 2 != args[4]) {
    cairo_arc_negative(ctx,
      x,
      y,
      radiusY,
      startAngle,
      endAngle);
  } else {
    cairo_arc(ctx,
      x,
      y,
      radiusY,
      startAngle,
      endAngle);
  }
  cairo_set_matrix(ctx, &save_matrix);
}

#if CAIRO_VERSION >= CAIRO_VERSION_ENCODE(1, 16, 0)

void
Context2d::BeginTag(const Napi::CallbackInfo& info) {
  std::string tagName = "";
  std::string attributes = "";

  if (info.Length() == 0) {
    Napi::TypeError::New(env, "Tag name is required").ThrowAsJavaScriptException();
    return;
  } else {
    if (!info[0].IsString()) {
      Napi::TypeError::New(env, "Tag name must be a string.").ThrowAsJavaScriptException();
      return;
    } else {
      tagName = info[0].As<Napi::String>().Utf8Value();
    }

    if (info.Length() > 1) {
      if (!info[1].IsString()) {
        Napi::TypeError::New(env, "Attributes must be a string matching Cairo's attribute format").ThrowAsJavaScriptException();
        return;
      } else {
        attributes = info[1].As<Napi::String>().Utf8Value();
      }
    }
  }

  cairo_tag_begin(_context, tagName.c_str(), attributes.c_str());
}

void
Context2d::EndTag(const Napi::CallbackInfo& info) {
  if (info.Length() == 0) {
    Napi::TypeError::New(env, "Tag name is required").ThrowAsJavaScriptException();
    return;
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "Tag name must be a string.").ThrowAsJavaScriptException();
    return;
  }

  std::string tagName = info[0].As<Napi::String>().Utf8Value();

  cairo_tag_end(_context, tagName.c_str());
}

#endif
