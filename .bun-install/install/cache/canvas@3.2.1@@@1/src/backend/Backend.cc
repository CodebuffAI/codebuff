#include "Backend.h"
#include <string>
#include <napi.h>

Backend::Backend(std::string name, Napi::CallbackInfo& info) : name(name), env(info.Env()) {
  int width  = 0;
  int height = 0;
  if (info[0].IsNumber()) width  = info[0].As<Napi::Number>().Int32Value();
  if (info[1].IsNumber()) height = info[1].As<Napi::Number>().Int32Value();
  this->width = width;
  this->height = height;
}

void Backend::setCanvas(Canvas* _canvas)
{
  this->canvas = _canvas;
}



std::string Backend::getName()
{
  return name;
}

int Backend::getWidth()
{
  return this->width;
}
void Backend::setWidth(int width_)
{
  this->destroySurface();
  this->width = width_;
}

int Backend::getHeight()
{
  return this->height;
}
void Backend::setHeight(int height_)
{
  this->destroySurface();
  this->height = height_;
}

bool Backend::isSurfaceValid() {
  bool isValid = true;

  cairo_status_t status = cairo_surface_status(ensureSurface());

  if (status != CAIRO_STATUS_SUCCESS) {
    error = cairo_status_to_string(status);
    isValid = false;
  }

  return isValid;
}


BackendOperationNotAvailable::BackendOperationNotAvailable(Backend* backend,
  std::string operation_name)
  : operation_name(operation_name)
{
  msg = "operation " + operation_name +
    " not supported by backend " + backend->getName();
};

BackendOperationNotAvailable::~BackendOperationNotAvailable() throw() {};

const char* BackendOperationNotAvailable::what() const throw()
{
  return msg.c_str();
};
