#pragma once

#include "backend/Backend.h"
#include <napi.h>

class Backends : public Napi::ObjectWrap<Backends> {
  public:
    static void Initialize(Napi::Env env, Napi::Object exports);
};
