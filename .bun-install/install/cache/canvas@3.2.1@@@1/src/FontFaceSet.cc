// Copyright (c) 2024 Caleb Hearon <caleb@chearon.net>

#include <napi.h>

#include "FontFaceSet.h"
#include "InstanceData.h"

FontFaceSet::FontFaceSet(Napi::CallbackInfo& info) :
  env(info.Env()),
  ready(Napi::Promise::Deferred::New(info.Env())),
  Napi::ObjectWrap<FontFaceSet>(info) {
}

void
FontFaceSet::Initialize(Napi::Env& env, Napi::Object& exports) {
  InstanceData *data = env.GetInstanceData<InstanceData>();

  Napi::Symbol iteratorSymbol = Napi::Symbol::WellKnown(env, "iterator").Unwrap();

  Napi::Function ctor = DefineClass(env, "FontFaceSet", {
    InstanceMethod<&FontFaceSet::Add>("add", napi_default_method),
    InstanceMethod<&FontFaceSet::Has>("has", napi_default_method),
    InstanceMethod<&FontFaceSet::Clear>("clear", napi_default_method),
    InstanceMethod<&FontFaceSet::Delete>("delete", napi_default_method),
    InstanceMethod<&FontFaceSet::Iterator>(iteratorSymbol, napi_default_jsproperty),
    InstanceAccessor<&FontFaceSet::Size>("size", napi_default_jsproperty)
  });

  Napi::Object jsFonts = ctor.New({}).Unwrap();
  FontFaceSet* cppFonts = FontFaceSet::Unwrap(jsFonts);

  // FontFaceSet is a singleton. 2/3 browsers do not allow you to construct
  // FontFaceSet, against specs, which allow you to use them to load groups.
  data->fonts = cppFonts;
  exports.Set("fonts", jsFonts);
}

Napi::Value
FontFaceSet::Add(const Napi::CallbackInfo& info) {
  InstanceData *data = env.GetInstanceData<InstanceData>();

  if (info.Length() == 0) {
    Napi::TypeError::New(env, "face argument is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  bool isFontFace;
  Napi::Object obj;

  if (!info[0].IsObject()) {
    isFontFace = false;
  } else {
    obj = info[0].As<Napi::Object>();
    if (!obj.InstanceOf(data->FontFaceCtor.Value()).UnwrapTo(&isFontFace)) return env.Undefined();
  }
  if (!isFontFace) {
    Napi::TypeError::New(env, "Expected instance of FontFace").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  FontFace* face = FontFace::Unwrap(obj);

  if (!facesHash.contains(face->id)) {
    facesHash.insert({face->id, facesData.size()});
    facesData.push_back({Napi::Persistent(obj), face});
  }

  return info.This(); // TODO not technically right
}

Napi::Value
FontFaceSet::Has(const Napi::CallbackInfo& info) {
  InstanceData *data = env.GetInstanceData<InstanceData>();

  if (info.Length() == 0) {
    Napi::TypeError::New(env, "face argument is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  bool isFontFace;
  Napi::Object obj;

  if (!info[0].IsObject()) {
    isFontFace = false;
  } else {
    obj = info[0].As<Napi::Object>();
    if (!obj.InstanceOf(data->FontFaceCtor.Value()).UnwrapTo(&isFontFace)) return env.Undefined();
  }
  if (!isFontFace) {
    Napi::TypeError::New(env, "Expected instance of FontFace").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  FontFace* face = FontFace::Unwrap(obj);

  return facesHash.find(face->id) != facesHash.end()
    ? Napi::Boolean::New(env, true)
    : Napi::Boolean::New(env, false);
}

void
FontFaceSet::Clear(const Napi::CallbackInfo& info) {
  for (auto& entry : facesData) {
    entry.face = nullptr;
    entry.ref.Reset();
  }
  facesHash.clear();
}

Napi::Value
FontFaceSet::Delete(const Napi::CallbackInfo& info) {
  InstanceData *data = env.GetInstanceData<InstanceData>();

  if (info.Length() == 0) {
    Napi::TypeError::New(env, "face argument is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  bool isFontFace;
  Napi::Object obj;

  if (!info[0].IsObject()) {
    isFontFace = false;
  } else {
    obj = info[0].As<Napi::Object>();
    if (!obj.InstanceOf(data->FontFaceCtor.Value()).UnwrapTo(&isFontFace)) return env.Undefined();
  }
  if (!isFontFace) {
    Napi::TypeError::New(env, "Expected instance of FontFace").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  FontFace* face = FontFace::Unwrap(obj);

  if (auto it = facesHash.find(face->id); it != facesHash.end()) {
    facesData[it->second].face = nullptr;
    facesData[it->second].ref.Reset();
    facesHash.erase(it);
    loaded.erase(face->id);
    failed.erase(face->id);
    return Napi::Boolean::New(env, true);
  } else {
    return Napi::Boolean::New(env, false);
  }
}

struct IteratorContext {
  // There is only ever one FontFaceSet so this should always be valid
  FontFaceSet* set;
  size_t index;

  static void finalize(Napi::Env env, IteratorContext* ctx) {
    delete ctx;
  }

  static Napi::Value next(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    IteratorContext* ctx = static_cast<IteratorContext*>(info.Data());
    FontFaceSet& set = *(ctx->set);

    Napi::Object ret = Napi::Object::New(env);

    // Skip past empty slots
    for (size_t i = ctx->index; i < set.facesData.size(); i++) {
      auto& entry = set.facesData[ctx->index++];
      if (entry.face != nullptr) {
        ret.Set("done", Napi::Boolean::New(env, false));
        ret.Set("value", entry.ref.Value());
        return ret;
      }
    }

    ret.Set("done", Napi::Boolean::New(env, true));
    return ret;
  }
};

Napi::Value
FontFaceSet::Iterator(const Napi::CallbackInfo& info) {
  Napi::Object iterator = Napi::Object::New(env);
  IteratorContext* ctx = new IteratorContext{this, 0};
  iterator.AddFinalizer(IteratorContext::finalize, ctx);
  Napi::Function next = Napi::Function::New(env, IteratorContext::next, "next", ctx);
  iterator["next"] = next;
  return iterator;
}

Napi::Value
FontFaceSet::Size(const Napi::CallbackInfo& info) {
  return Napi::Number::New(env, facesHash.size());
}
