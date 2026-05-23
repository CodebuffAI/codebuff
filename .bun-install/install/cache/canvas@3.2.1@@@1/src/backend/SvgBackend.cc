#include "SvgBackend.h"

#include <cairo-svg.h>
#include <napi.h>
#include "../Canvas.h"
#include "../closure.h"
#include "../InstanceData.h"
#include <cassert>

using namespace Napi;

SvgBackend::SvgBackend(Napi::CallbackInfo& info) : Napi::ObjectWrap<SvgBackend>(info), Backend("svg", info) {}

SvgBackend::~SvgBackend() {
  destroySurface();
}

cairo_surface_t* SvgBackend::ensureSurface() {
  if (!surface) {
    assert(!_closure);
     _closure = new PdfSvgClosure(canvas);
    surface = cairo_svg_surface_create_for_stream(PdfSvgClosure::writeVec, _closure, width, height);
  }
  return surface;
}

void SvgBackend::destroySurface() {
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
SvgBackend::Initialize(Napi::Object target) {
  Napi::Env env = target.Env();
  Napi::Function ctor = DefineClass(env, "SvgBackend", {});
  InstanceData* data = env.GetInstanceData<InstanceData>();
  data->SvgBackendCtor = Napi::Persistent(ctor);
}
