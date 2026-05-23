#include <napi.h>

struct InstanceData {
  Napi::FunctionReference ImageBackendCtor;
  Napi::FunctionReference PdfBackendCtor;
  Napi::FunctionReference SvgBackendCtor;
  Napi::FunctionReference CanvasCtor;
  Napi::FunctionReference CanvasGradientCtor;
  Napi::FunctionReference DOMMatrixCtor;
  Napi::FunctionReference ImageCtor;
  Napi::FunctionReference parseFont;
  Napi::FunctionReference Context2dCtor;
  Napi::FunctionReference ImageDataCtor;
  Napi::FunctionReference CanvasPatternCtor;
};
