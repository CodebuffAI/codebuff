#pragma once

#include "Backend.h"
#include "../closure.h"
#include <napi.h>

class PdfBackend : public Napi::ObjectWrap<PdfBackend>, public Backend
{
  private:
    cairo_surface_t* ensureSurface();
    void destroySurface();
    cairo_surface_t* surface = nullptr;

  public:
    PdfSvgClosure* _closure = NULL;
    inline PdfSvgClosure* closure() { return _closure; }

    PdfBackend(Napi::CallbackInfo& info);
    ~PdfBackend();

    static Napi::FunctionReference constructor;
    static void Initialize(Napi::Object target);
    static Napi::Value New(const Napi::CallbackInfo& info);
};
