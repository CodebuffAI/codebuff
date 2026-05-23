#pragma once

#include <string>
#include <napi.h>

class CanvasError {
  public:
    std::string message;
    std::string syscall;
    std::string path;
    int cerrno = 0;
    void set(const char* iMessage = NULL, const char* iSyscall = NULL, int iErrno = 0, const char* iPath = NULL) {
      if (iMessage) message.assign(iMessage);
      if (iSyscall) syscall.assign(iSyscall);
      cerrno = iErrno;
      if (iPath) path.assign(iPath);
    }
    void reset() {
      message.clear();
      syscall.clear();
      path.clear();
      cerrno = 0;
    }
    bool empty() {
      return cerrno == 0 && message.empty();
    }
    Napi::Error toError(Napi::Env env) {
      if (cerrno) {
        Napi::Error err = Napi::Error::New(env, strerror(cerrno));
        if (!syscall.empty()) err.Value().Set("syscall", syscall);
        if (!path.empty()) err.Value().Set("path", path);
        return err;
      } else {
        return Napi::Error::New(env, message);
      }
    }
};
