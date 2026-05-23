// Copyright (c) 2024 Caleb Hearon <caleb@chearon.net>

#pragma once

#include <napi.h>
#include <set>
#include <unordered_map>

#include "FontFace.h"

static bool ref_compare(const FontFace* a, const FontFace* b) {
  return a->id < b->id;
}

struct FontFaceSetEntry {
  Napi::ObjectReference ref;
  FontFace* face;
};

class FontFaceSet : public Napi::ObjectWrap<FontFaceSet> {
  public:
    FontFaceSet(Napi::CallbackInfo& info);
    static void Initialize(Napi::Env& env, Napi::Object& exports);

    Napi::Value Add(const Napi::CallbackInfo& info);
    Napi::Value Has(const Napi::CallbackInfo& info);
    void Clear(const Napi::CallbackInfo& info);
    Napi::Value Delete(const Napi::CallbackInfo& info);
    Napi::Value Iterator(const Napi::CallbackInfo& info);
    Napi::Value Size(const Napi::CallbackInfo& info);

    // Iteration of faces must be safe. We'll achieve this by iterating all keys
    // ever inserted, which is how the EcmaScript standards say to iterate Sets.
    std::unordered_map<size_t, size_t> facesHash;
    std::vector<FontFaceSetEntry> facesData;

  private:
    std::set<size_t> loading;
    std::set<size_t> loaded;
    std::set<size_t> failed;
    Napi::Promise::Deferred ready;
    Napi::Env env;
};
