// Copyright (c) 2024 Caleb Hearon <caleb@chearon.net>
//
// TODO: ttc/otc with fragment identifier

#pragma once

#include <napi.h>
#include "Font.h"

class FontFace : public Napi::ObjectWrap<FontFace> {
  public:
    FontFace(const Napi::CallbackInfo& info);
    static void Initialize(Napi::Env& env, Napi::Object& target);

    Napi::Value GetFamily(const Napi::CallbackInfo& info);
    Napi::Value GetStyle(const Napi::CallbackInfo& info);
    Napi::Value GetWeight(const Napi::CallbackInfo& info);
    Napi::Value GetStatus(const Napi::CallbackInfo& info);
    bool setFamilyInternal(const Napi::Value& value);
    void SetFamily(const Napi::CallbackInfo& info, const Napi::Value& value);
    bool setStyleInternal(const Napi::Value& value);
    void SetStyle(const Napi::CallbackInfo& info, const Napi::Value& value);
    bool setWeightInternal(const Napi::Value& value);
    void SetWeight(const Napi::CallbackInfo& info, const Napi::Value& value);

    size_t id;

    //TODO private
    FontDescriptor descriptor;
  private:
    enum class Status { Unloaded, Loaded, Error };
    Status status = Status::Unloaded;
    Napi::Env env;
};
