"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createCallbackUrl = createCallbackUrl;
async function createCallbackUrl({
  options,
  paramValue,
  cookieValue
}) {
  const {
    url,
    callbacks
  } = options;
  let callbackUrl = url.origin;
  if (paramValue) {
    callbackUrl = await callbacks.redirect({
      url: paramValue,
      baseUrl: url.origin
    });
  } else if (cookieValue) {
    callbackUrl = await callbacks.redirect({
      url: cookieValue,
      baseUrl: url.origin
    });
  }
  return {
    callbackUrl,
    callbackUrlCookie: callbackUrl !== cookieValue ? callbackUrl : undefined
  };
}