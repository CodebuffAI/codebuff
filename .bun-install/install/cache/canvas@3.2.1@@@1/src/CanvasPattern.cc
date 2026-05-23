// Copyright (c) 2010 LearnBoost <tj@learnboost.com>

#include "CanvasPattern.h"

#include "Canvas.h"
#include "Image.h"
#include "InstanceData.h"

using namespace Napi;

const cairo_user_data_key_t *pattern_repeat_key;

/*
 * Initialize CanvasPattern.
 */

void
Pattern::Initialize(Napi::Env& env, Napi::Object& exports) {
  Napi::HandleScope scope(env);
  InstanceData* data = env.GetInstanceData<InstanceData>();

  // Constructor
  Napi::Function ctor = DefineClass(env, "CanvasPattern", {
    InstanceMethod<&Pattern::setTransform>("setTransform", napi_default_method)
  });

  // Prototype
  exports.Set("CanvasPattern", ctor);
  data->CanvasPatternCtor = Napi::Persistent(ctor);
}

/*
 * Initialize a new CanvasPattern.
 */

Pattern::Pattern(const Napi::CallbackInfo& info) : ObjectWrap<Pattern>(info), env(info.Env()) {
  if (!info[0].IsObject()) {
    Napi::TypeError::New(env, "Image or Canvas expected").ThrowAsJavaScriptException();
    return;
  }

  Napi::Object obj = info[0].As<Napi::Object>();
  InstanceData* data = env.GetInstanceData<InstanceData>();
  cairo_surface_t *surface;

  // Image
  if (obj.InstanceOf(data->ImageCtor.Value()).UnwrapOr(false)) {
    Image *img = Image::Unwrap(obj);
    if (!img->isComplete()) {
      Napi::Error::New(env, "Image given has not completed loading").ThrowAsJavaScriptException();
      return;
    }
    surface = img->surface();

  // Canvas
  } else if (obj.InstanceOf(data->CanvasCtor.Value()).UnwrapOr(false)) {
    Canvas *canvas = Canvas::Unwrap(obj);
    surface = canvas->surface();
  // Invalid
  } else {
    if (!env.IsExceptionPending()) {
      Napi::TypeError::New(env, "Image or Canvas expected").ThrowAsJavaScriptException();
    }
    return;
  }
  _pattern = cairo_pattern_create_for_surface(surface);

  if (info[1].IsString()) {
    if ("no-repeat" == info[1].As<Napi::String>().Utf8Value()) {
      _repeat = NO_REPEAT;
    } else if ("repeat-x" == info[1].As<Napi::String>().Utf8Value()) {
      _repeat = REPEAT_X;
    } else if ("repeat-y" == info[1].As<Napi::String>().Utf8Value()) {
      _repeat = REPEAT_Y;
    }
  }

  cairo_pattern_set_user_data(_pattern, pattern_repeat_key, &_repeat, NULL);
}

/*
 * Set the pattern-space to user-space transform.
 */
void
Pattern::setTransform(const Napi::CallbackInfo& info) {
  if (!info[0].IsObject()) {
    Napi::TypeError::New(env, "Expected DOMMatrix").ThrowAsJavaScriptException();
    return;
  }

  Napi::Object mat = info[0].As<Napi::Object>();

  InstanceData* data = env.GetInstanceData<InstanceData>();
  if (!mat.InstanceOf(data->DOMMatrixCtor.Value()).UnwrapOr(false)) {
    if (!env.IsExceptionPending()) {
      Napi::TypeError::New(env, "Expected DOMMatrix").ThrowAsJavaScriptException();
    }
    return;
  }

  Napi::Value one = Napi::Number::New(env, 1);
  Napi::Value zero = Napi::Number::New(env, 0);

  cairo_matrix_t matrix;
  cairo_matrix_init(&matrix,
    mat.Get("a").UnwrapOr(one).As<Napi::Number>().DoubleValue(),
    mat.Get("b").UnwrapOr(zero).As<Napi::Number>().DoubleValue(),
    mat.Get("c").UnwrapOr(zero).As<Napi::Number>().DoubleValue(),
    mat.Get("d").UnwrapOr(one).As<Napi::Number>().DoubleValue(),
    mat.Get("e").UnwrapOr(zero).As<Napi::Number>().DoubleValue(),
    mat.Get("f").UnwrapOr(zero).As<Napi::Number>().DoubleValue()
  );

  cairo_matrix_invert(&matrix);
  cairo_pattern_set_matrix(_pattern, &matrix);
}

repeat_type_t Pattern::get_repeat_type_for_cairo_pattern(cairo_pattern_t *pattern) {
  void *ud = cairo_pattern_get_user_data(pattern, pattern_repeat_key);
  return *reinterpret_cast<repeat_type_t*>(ud);
}

/*
 * Destroy the pattern.
 */

Pattern::~Pattern() {
  if (_pattern) cairo_pattern_destroy(_pattern);
}
