"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getBody = getBody;
exports.setCookie = setCookie;
exports.toResponse = toResponse;
var _cookie = require("cookie");
function setCookie(res, cookie) {
  var _res$getHeader;
  let setCookieHeader = (_res$getHeader = res.getHeader("Set-Cookie")) !== null && _res$getHeader !== void 0 ? _res$getHeader : [];
  if (!Array.isArray(setCookieHeader)) {
    setCookieHeader = [setCookieHeader];
  }
  const {
    name,
    value,
    options
  } = cookie;
  const cookieHeader = (0, _cookie.serialize)(name, value, options);
  setCookieHeader.push(cookieHeader);
  res.setHeader("Set-Cookie", setCookieHeader);
}
async function getBody(req) {
  if (!("body" in req) || !req.body || req.method !== "POST") return;
  const contentType = req.headers.get("content-type");
  if (contentType !== null && contentType !== void 0 && contentType.includes("application/json")) {
    return await req.json();
  } else if (contentType !== null && contentType !== void 0 && contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(await req.text());
    return Object.fromEntries(params);
  }
}
function toResponse(res) {
  var _res$headers, _res$cookies, _res$status;
  const headers = new Headers((_res$headers = res.headers) === null || _res$headers === void 0 ? void 0 : _res$headers.reduce((acc, {
    key,
    value
  }) => {
    acc[key] = value;
    return acc;
  }, {}));
  (_res$cookies = res.cookies) === null || _res$cookies === void 0 || _res$cookies.forEach(cookie => {
    const {
      name,
      value,
      options
    } = cookie;
    const cookieHeader = (0, _cookie.serialize)(name, value, options);
    if (headers.has("Set-Cookie")) headers.append("Set-Cookie", cookieHeader);else headers.set("Set-Cookie", cookieHeader);
  });
  let body = res.body;
  if (headers.get("content-type") === "application/json") body = JSON.stringify(res.body);else if (headers.get("content-type") === "application/x-www-form-urlencoded") body = new URLSearchParams(res.body).toString();
  const status = res.redirect ? 302 : (_res$status = res.status) !== null && _res$status !== void 0 ? _res$status : 200;
  const response = new Response(body, {
    headers,
    status
  });
  if (res.redirect) response.headers.set("Location", res.redirect);
  return response;
}