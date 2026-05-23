#include "ImageBackend.h"
#include "../InstanceData.h"
#include <napi.h>
#include <cassert>

ImageBackend::ImageBackend(Napi::CallbackInfo& info) : Napi::ObjectWrap<ImageBackend>(info), Backend("image", info) {}

ImageBackend::~ImageBackend() {
    destroySurface();
}

// This returns an approximate value only, suitable for
// Napi::MemoryManagement:: AdjustExternalMemory.
// The formats that don't map to intrinsic types (RGB30, A1) round up.
int32_t ImageBackend::approxBytesPerPixel() {
  switch (format) {
  case CAIRO_FORMAT_ARGB32:
  case CAIRO_FORMAT_RGB24:
    return 4;
#ifdef CAIRO_FORMAT_RGB30
  case CAIRO_FORMAT_RGB30:
    return 3;
#endif
  case CAIRO_FORMAT_RGB16_565:
    return 2;
  case CAIRO_FORMAT_A8:
  case CAIRO_FORMAT_A1:
    return 1;
  default:
    return 0;
  }
}

cairo_surface_t* ImageBackend::ensureSurface() {
  if (!surface) {
    surface = cairo_image_surface_create(format, width, height);
    assert(surface);
    Napi::MemoryManagement::AdjustExternalMemory(env, approxBytesPerPixel() * width * height);
  }
  return surface;
}

void ImageBackend::destroySurface() {
  if (surface) {
    cairo_surface_destroy(surface);
    surface = nullptr;
    Napi::MemoryManagement::AdjustExternalMemory(env, -approxBytesPerPixel() * width * height);
  }
}

cairo_format_t ImageBackend::getFormat() {
  return format;
}

void ImageBackend::setFormat(cairo_format_t _format) {
    this->destroySurface();
    this->format = _format;
}

Napi::FunctionReference ImageBackend::constructor;

void ImageBackend::Initialize(Napi::Object target) {
  Napi::Env env = target.Env();
	Napi::Function ctor = DefineClass(env, "ImageBackend", {});
  InstanceData* data = env.GetInstanceData<InstanceData>();
  data->ImageBackendCtor = Napi::Persistent(ctor);
}
