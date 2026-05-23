"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.defaultCallbacks = void 0;
const defaultCallbacks = exports.defaultCallbacks = {
  signIn() {
    return true;
  },
  redirect({
    url,
    baseUrl
  }) {
    if (url.startsWith("/")) return `${baseUrl}${url}`;else if (new URL(url).origin === baseUrl) return url;
    return baseUrl;
  },
  session({
    session
  }) {
    return session;
  },
  jwt({
    token
  }) {
    return token;
  }
};