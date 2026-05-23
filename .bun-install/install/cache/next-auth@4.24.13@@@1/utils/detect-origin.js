"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.detectOrigin = detectOrigin;
function detectOrigin(forwardedHost, protocol) {
  var _process$env$VERCEL;
  if ((_process$env$VERCEL = process.env.VERCEL) !== null && _process$env$VERCEL !== void 0 ? _process$env$VERCEL : process.env.AUTH_TRUST_HOST) return `${protocol === "http" ? "http" : "https"}://${forwardedHost}`;
  return process.env.NEXTAUTH_URL;
}