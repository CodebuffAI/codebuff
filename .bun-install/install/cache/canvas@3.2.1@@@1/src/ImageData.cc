// Copyright (c) 2010 LearnBoost <tj@learnboost.com>

#include "ImageData.h"
#include "InstanceData.h"

/*
 * Initialize ImageData.
 */

void
ImageData::Initialize(Napi::Env& env, Napi::Object& exports) {
  Napi::HandleScope scope(env);

  InstanceData *data = env.GetInstanceData<InstanceData>();

  Napi::Function ctor = DefineClass(env, "ImageData", {
    InstanceAccessor<&ImageData::GetWidth>("width", napi_default_jsproperty),
    InstanceAccessor<&ImageData::GetHeight>("height", napi_default_jsproperty)
  });

  exports.Set("ImageData", ctor);
  data->ImageDataCtor = Napi::Persistent(ctor);
}

/*
 * Initialize a new ImageData object.
 */

ImageData::ImageData(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ImageData>(info), env(info.Env()) {
  Napi::TypedArray dataArray;
  uint32_t width;
  uint32_t height;
  int length;

  if (info[0].IsNumber() && info[1].IsNumber()) {
    width = info[0].As<Napi::Number>().Uint32Value();
    if (width == 0) {
      Napi::RangeError::New(env, "The source width is zero.").ThrowAsJavaScriptException();
      return;
    }
    height = info[1].As<Napi::Number>().Uint32Value();
    if (height == 0) {
      Napi::RangeError::New(env, "The source height is zero.").ThrowAsJavaScriptException();
      return;
    }
    length = width * height * 4; // ImageData(w, h) constructor assumes 4 BPP; documented.

    dataArray = Napi::Uint8Array::New(env, length, napi_uint8_clamped_array);
  } else if (
    info[0].IsTypedArray() &&
    info[0].As<Napi::TypedArray>().TypedArrayType() == napi_uint8_clamped_array &&
    info[1].IsNumber()
  ) {
    dataArray = info[0].As<Napi::Uint8Array>();

    length = dataArray.ElementLength();
    if (length == 0) {
      Napi::RangeError::New(env, "The input data has a zero byte length.").ThrowAsJavaScriptException();
      return;
    }

    // Don't assert that the ImageData length is a multiple of four because some
    // data formats are not 4 BPP.

    width = info[1].As<Napi::Number>().Uint32Value();
    if (width == 0) {
      Napi::RangeError::New(env, "The source width is zero.").ThrowAsJavaScriptException();
      return;
    }

    // Don't assert that the byte length is a multiple of 4 * width, ditto.

    if (info[2].IsNumber()) { // Explicit height given
      height = info[2].As<Napi::Number>().Uint32Value();
    } else { // Calculate height assuming 4 BPP
      int size = length / 4;
      height = size / width;
    }
  } else if (
    info[0].IsTypedArray() &&
    info[0].As<Napi::TypedArray>().TypedArrayType() == napi_uint16_array &&
    info[1].IsNumber()
  ) { // Intended for RGB16_565 format
    dataArray = info[0].As<Napi::TypedArray>();

    length = dataArray.ElementLength();
    if (length == 0) {
      Napi::RangeError::New(env, "The input data has a zero byte length.").ThrowAsJavaScriptException();
      return;
    }

    width = info[1].As<Napi::Number>().Uint32Value();
    if (width == 0) {
      Napi::RangeError::New(env, "The source width is zero.").ThrowAsJavaScriptException();
      return;
    }

    if (info[2].IsNumber()) { // Explicit height given
      height = info[2].As<Napi::Number>().Uint32Value();
    } else { // Calculate height assuming 2 BPP
      int size = length / 2;
      height = size / width;
    }
  } else {
    Napi::TypeError::New(env, "Expected (Uint8ClampedArray, width[, height]), (Uint16Array, width[, height]) or (width, height)").ThrowAsJavaScriptException();
    return;
  }

  _width = width;
  _height = height;
  _data = dataArray.As<Napi::Uint8Array>().Data();

  info.This().As<Napi::Object>().Set("data", dataArray);
}

/*
 * Get width.
 */

Napi::Value
ImageData::GetWidth(const Napi::CallbackInfo& info) {
  return Napi::Number::New(env, width());
}

/*
 * Get height.
 */

Napi::Value
ImageData::GetHeight(const Napi::CallbackInfo& info) {
  return Napi::Number::New(env, height());
}
