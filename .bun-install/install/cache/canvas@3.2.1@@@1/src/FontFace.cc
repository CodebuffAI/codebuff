// Copyright (c) 2024 Caleb Hearon <caleb@chearon.net>

#include "FontFace.h"
#include "FontParser.h"
#include "InstanceData.h"

#include <string>
#include <cstring>

static size_t lastId = 0;

FontFace::FontFace(const Napi::CallbackInfo& info) :
  Napi::ObjectWrap<FontFace>(info),
  id(++lastId),
  env(info.Env())
{
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Family and source arguments are required").ThrowAsJavaScriptException();
    return;
  }

  if (!setFamilyInternal(info[0])) return;

  if (info[1].IsString()) {
    Napi::String url = info[1].As<Napi::String>();
    size_t len;
    napi_get_value_string_utf8(env, url, nullptr, 0, &len);
    len++;
    descriptor.url = std::make_unique<char[]>(len);
    napi_get_value_string_utf8(env, url, descriptor.url.get(), len, nullptr);
  } else if (info[1].IsTypedArray()) {
    Napi::TypedArray ta = info[0].As<Napi::TypedArray>();
    Napi::ArrayBuffer buf = ta.ArrayBuffer();
    descriptor.data_len = ta.ByteLength();
    descriptor.data = std::make_unique<uint8_t[]>(descriptor.data_len);
    std::memcpy(descriptor.data.get(), static_cast<uint8_t*>(buf.Data()) + ta.ByteOffset(), descriptor.data_len);
  } else if (info[1].IsArrayBuffer()) {
    Napi::ArrayBuffer buf = info[0].As<Napi::ArrayBuffer>();
    descriptor.data_len = buf.ByteLength();
    descriptor.data = std::make_unique<uint8_t[]>(descriptor.data_len);
    std::memcpy(descriptor.data.get(), buf.Data(), descriptor.data_len);
  } else {
    Napi::TypeError::New(env, "Source must be a string or buffer").ThrowAsJavaScriptException();
    return;
  }

  if (info.Length() >= 3) {
    if (!info[2].IsObject()) {
      Napi::TypeError::New(env, "Descriptors must be an object").ThrowAsJavaScriptException();
      return;
    }
    Napi::Object descriptors = info[2].As<Napi::Object>();
    Napi::Value value;
    if (descriptors.Has("weight").UnwrapOr(false) && descriptors.Get("weight").UnwrapTo(&value)) {
      if (!setWeightInternal(value)) return;
    }
    if (descriptors.Has("style").UnwrapOr(false) && descriptors.Get("style").UnwrapTo(&value)) {
      if (!setStyleInternal(value)) return;
    }
  }
}

void
FontFace::Initialize(Napi::Env& env, Napi::Object& exports) {
  InstanceData *data = env.GetInstanceData<InstanceData>();
  Napi::Function ctor = DefineClass(env, "FontFace", {
    InstanceAccessor<&FontFace::GetFamily, &FontFace::SetFamily>("family", napi_default_jsproperty),
    InstanceAccessor<&FontFace::GetStyle, &FontFace::SetStyle>("style", napi_default_jsproperty),
    InstanceAccessor<&FontFace::GetWeight, &FontFace::SetWeight>("weight", napi_default_jsproperty),
    InstanceAccessor<&FontFace::GetStatus>("status", napi_default_jsproperty)
  });

  data->FontFaceCtor = Napi::Persistent(ctor);
  exports.Set("FontFace", ctor);
}

Napi::Value
FontFace::GetFamily(const Napi::CallbackInfo& info) {
  return Napi::String::New(env, descriptor.family.get());
}

bool
FontFace::setFamilyInternal(const Napi::Value& value) {
  // According to the specs, this is supposed to go through the CSS parser, so
  // fonts starting with numbers or having special characters should actually
  // throw an error. However, Safari accepts anything, and Firefox puts quotes
  // around the family: https://bugzilla.mozilla.org/show_bug.cgi?id=1986533
  if (Napi::String family; value.ToString().UnwrapTo(&family)) {
    size_t len;
    napi_get_value_string_utf8(env, family, nullptr, 0, &len);
    len++;
    descriptor.family = std::make_unique<char[]>(len);
    napi_get_value_string_utf8(env, family, descriptor.family.get(), len, nullptr);
    return true;
  }
  return false;
}

void
FontFace::SetFamily(const Napi::CallbackInfo& info, const Napi::Value& value) {
  setFamilyInternal(value);
}

Napi::Value
FontFace::GetStyle(const Napi::CallbackInfo& info) {
  switch (descriptor.style) {
    case FontStyle::Normal: return Napi::String::New(env, "normal");
    case FontStyle::Italic: return Napi::String::New(env, "italic");
    case FontStyle::Oblique: return Napi::String::New(env, "oblique");
  }
}

bool
FontFace::setStyleInternal(const Napi::Value& value) {
  if (Napi::String style; value.ToString().UnwrapTo(&style)) {
    if (auto value = FontParser::parseStyle(style.Utf8Value()); value) {
      descriptor.style = *value;
      return true;
    } else {
      Napi::TypeError::New(env, "Could not parse style").ThrowAsJavaScriptException();
    }
  }
  return false;
}

void
FontFace::SetStyle(const Napi::CallbackInfo& info, const Napi::Value& value) {
  setStyleInternal(value);
}

Napi::Value
FontFace::GetWeight(const Napi::CallbackInfo& info) {
  return Napi::String::New(env, std::to_string(descriptor.weight));
}

bool
FontFace::setWeightInternal(const Napi::Value& value) {
  if (Napi::String weight; value.ToString().UnwrapTo(&weight)) {
    if (auto value = FontParser::parseWeight(weight.Utf8Value()); value) {
      descriptor.weight = *value;
      return true;
    } else {
      Napi::TypeError::New(env, "Could not parse weight").ThrowAsJavaScriptException();
    }
  }
  return false;
}

void
FontFace::SetWeight(const Napi::CallbackInfo& info, const Napi::Value& value) {
  setWeightInternal(value);
}

Napi::Value
FontFace::GetStatus(const Napi::CallbackInfo& info) {
  switch (status) {
    case Status::Unloaded: return Napi::String::New(env, "unloaded");
    case Status::Loaded: return Napi::String::New(env, "loaded");
    case Status::Error: return Napi::String::New(env, "error");
  }
}
