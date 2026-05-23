#pragma once

#include <cairo.h>
#include "../dll_visibility.h"
#include <exception>
#include <napi.h>
#include <string>

class Canvas;

class Backend
{
  private:
    const std::string name;
    const char* error = NULL;

  protected:
    int width;
    int height;
    Canvas* canvas = nullptr;

    Backend(std::string name, Napi::CallbackInfo& info);

  public:
    Napi::Env env;

    void setCanvas(Canvas* canvas);

    virtual cairo_surface_t* ensureSurface() = 0;
    virtual void destroySurface() = 0;

    DLL_PUBLIC std::string getName();

    DLL_PUBLIC int getWidth();
    virtual void setWidth(int width);

    DLL_PUBLIC int getHeight();
    virtual void setHeight(int height);

    // Overridden by ImageBackend. SVG and PDF thus always return INVALID.
    virtual cairo_format_t getFormat() {
      return CAIRO_FORMAT_INVALID;
    }

    bool isSurfaceValid();
    inline const char* getError(){ return error; }
};


class BackendOperationNotAvailable: public std::exception
{
  private:
    std::string operation_name;
    std::string msg;

  public:
    BackendOperationNotAvailable(Backend* backend, std::string operation_name);
    ~BackendOperationNotAvailable() throw();

    const char* what() const throw();
};
