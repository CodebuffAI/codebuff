// Copyright (c) 2010 LearnBoost <tj@learnboost.com>

#pragma once

#include <napi.h>
#include <stdint.h> // node < 7 uses libstdc++ on macOS which lacks complete c++11

class ImageData : public Napi::ObjectWrap<ImageData> {
  public:
    static void Initialize(Napi::Env& env, Napi::Object& exports);
    ImageData(const Napi::CallbackInfo& info);
    Napi::Value GetWidth(const Napi::CallbackInfo& info);
    Napi::Value GetHeight(const Napi::CallbackInfo& info);

    inline int width() { return _width; }
    inline int height() { return _height; }
    inline uint8_t *data() { return _data; }

    Napi::Env env;

  private:
    int _width;
    int _height;
    uint8_t *_data;

};
