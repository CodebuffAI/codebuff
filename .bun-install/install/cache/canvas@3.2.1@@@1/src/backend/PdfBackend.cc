#include "PdfBackend.h"

#include <cairo-pdf.h>
#include <cassert>
#include "../InstanceData.h"
#include "../Canvas.h"
#include "../closure.h"

PdfBackend::PdfBackend(Napi::CallbackInfo& info) : Napi::ObjectWrap<PdfBackend>(info), Backend("pdf", info) {}

PdfBackend::~PdfBackend() {
  destroySurface();
}

cairo_surface_t* PdfBackend::ensureSurface() {
  if (!surface) {
    _closure = new PdfSvgClosure(canvas);
    surface = cairo_pdf_surface_create_for_stream(PdfSvgClosure::writeVec, _closure, width, height);
  }
  return surface;
}

void PdfBackend::destroySurface() {
  if (surface) {
    cairo_surface_finish(surface);
    cairo_surface_destroy(surface);
    surface = nullptr;
    assert(_closure);
    delete _closure;
    _closure = nullptr;
  }
}

void
PdfBackend::Initialize(Napi::Object target) {
  Napi::Env env = target.Env();
  InstanceData* data = env.GetInstanceData<InstanceData>();
  Napi::Function ctor = DefineClass(env, "PdfBackend", {});
  data->PdfBackendCtor = Napi::Persistent(ctor);
}
