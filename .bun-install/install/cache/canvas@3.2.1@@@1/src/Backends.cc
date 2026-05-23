#include "Backends.h"

#include "backend/ImageBackend.h"
#include "backend/PdfBackend.h"
#include "backend/SvgBackend.h"

using namespace Napi;

void
Backends::Initialize(Napi::Env env, Napi::Object exports) {
  Napi::Object obj = Napi::Object::New(env);

  ImageBackend::Initialize(obj);
  PdfBackend::Initialize(obj);
  SvgBackend::Initialize(obj);

  exports.Set("Backends", obj);
}
