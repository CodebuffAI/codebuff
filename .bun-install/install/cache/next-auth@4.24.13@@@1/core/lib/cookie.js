"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SessionStore = void 0;
exports.defaultCookies = defaultCookies;
function _classPrivateMethodInitSpec(e, a) { _checkPrivateRedeclaration(e, a), a.add(e); }
function _classPrivateFieldInitSpec(e, t, a) { _checkPrivateRedeclaration(e, t), t.set(e, a); }
function _checkPrivateRedeclaration(e, t) { if (t.has(e)) throw new TypeError("Cannot initialize the same private elements twice on an object"); }
function _classPrivateFieldGet(s, a) { return s.get(_assertClassBrand(s, a)); }
function _classPrivateFieldSet(s, a, r) { return s.set(_assertClassBrand(s, a), r), r; }
function _assertClassBrand(e, t, n) { if ("function" == typeof e ? e === t : e.has(t)) return arguments.length < 3 ? t : n; throw new TypeError("Private element is not present on this object"); }
const ALLOWED_COOKIE_SIZE = 4096;
const ESTIMATED_EMPTY_COOKIE_SIZE = 163;
const CHUNK_SIZE = ALLOWED_COOKIE_SIZE - ESTIMATED_EMPTY_COOKIE_SIZE;
function defaultCookies(useSecureCookies) {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  return {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies
      }
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies
      }
    },
    csrfToken: {
      name: `${useSecureCookies ? "__Host-" : ""}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies
      }
    },
    pkceCodeVerifier: {
      name: `${cookiePrefix}next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15
      }
    },
    state: {
      name: `${cookiePrefix}next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15
      }
    },
    nonce: {
      name: `${cookiePrefix}next-auth.nonce`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies
      }
    }
  };
}
var _chunks = new WeakMap();
var _option = new WeakMap();
var _logger = new WeakMap();
var _SessionStore_brand = new WeakSet();
class SessionStore {
  constructor(option, req, logger) {
    _classPrivateMethodInitSpec(this, _SessionStore_brand);
    _classPrivateFieldInitSpec(this, _chunks, {});
    _classPrivateFieldInitSpec(this, _option, void 0);
    _classPrivateFieldInitSpec(this, _logger, void 0);
    _classPrivateFieldSet(_logger, this, logger);
    _classPrivateFieldSet(_option, this, option);
    const {
      cookies: _cookies
    } = req;
    const {
      name: cookieName
    } = option;
    if (typeof (_cookies === null || _cookies === void 0 ? void 0 : _cookies.getAll) === "function") {
      for (const {
        name,
        value
      } of _cookies.getAll()) {
        if (name.startsWith(cookieName)) {
          _classPrivateFieldGet(_chunks, this)[name] = value;
        }
      }
    } else if (_cookies instanceof Map) {
      for (const name of _cookies.keys()) {
        if (name.startsWith(cookieName)) _classPrivateFieldGet(_chunks, this)[name] = _cookies.get(name);
      }
    } else {
      for (const name in _cookies) {
        if (name.startsWith(cookieName)) _classPrivateFieldGet(_chunks, this)[name] = _cookies[name];
      }
    }
  }
  get value() {
    const sortedKeys = Object.keys(_classPrivateFieldGet(_chunks, this)).sort((a, b) => {
      var _a$split$pop, _b$split$pop;
      const aSuffix = parseInt((_a$split$pop = a.split(".").pop()) !== null && _a$split$pop !== void 0 ? _a$split$pop : "0");
      const bSuffix = parseInt((_b$split$pop = b.split(".").pop()) !== null && _b$split$pop !== void 0 ? _b$split$pop : "0");
      return aSuffix - bSuffix;
    });
    return sortedKeys.map(key => _classPrivateFieldGet(_chunks, this)[key]).join("");
  }
  chunk(value, options) {
    const cookies = _assertClassBrand(_SessionStore_brand, this, _clean).call(this);
    const chunked = _assertClassBrand(_SessionStore_brand, this, _chunk).call(this, {
      name: _classPrivateFieldGet(_option, this).name,
      value,
      options: {
        ..._classPrivateFieldGet(_option, this).options,
        ...options
      }
    });
    for (const chunk of chunked) {
      cookies[chunk.name] = chunk;
    }
    return Object.values(cookies);
  }
  clean() {
    return Object.values(_assertClassBrand(_SessionStore_brand, this, _clean).call(this));
  }
}
exports.SessionStore = SessionStore;
function _chunk(cookie) {
  const chunkCount = Math.ceil(cookie.value.length / CHUNK_SIZE);
  if (chunkCount === 1) {
    _classPrivateFieldGet(_chunks, this)[cookie.name] = cookie.value;
    return [cookie];
  }
  const cookies = [];
  for (let i = 0; i < chunkCount; i++) {
    const name = `${cookie.name}.${i}`;
    const value = cookie.value.substr(i * CHUNK_SIZE, CHUNK_SIZE);
    cookies.push({
      ...cookie,
      name,
      value
    });
    _classPrivateFieldGet(_chunks, this)[name] = value;
  }
  _classPrivateFieldGet(_logger, this).debug("CHUNKING_SESSION_COOKIE", {
    message: `Session cookie exceeds allowed ${ALLOWED_COOKIE_SIZE} bytes.`,
    emptyCookieSize: ESTIMATED_EMPTY_COOKIE_SIZE,
    valueSize: cookie.value.length,
    chunks: cookies.map(c => c.value.length + ESTIMATED_EMPTY_COOKIE_SIZE)
  });
  return cookies;
}
function _clean() {
  const cleanedChunks = {};
  for (const name in _classPrivateFieldGet(_chunks, this)) {
    var _classPrivateFieldGet2;
    (_classPrivateFieldGet2 = _classPrivateFieldGet(_chunks, this)) === null || _classPrivateFieldGet2 === void 0 || delete _classPrivateFieldGet2[name];
    cleanedChunks[name] = {
      name,
      value: "",
      options: {
        ..._classPrivateFieldGet(_option, this).options,
        maxAge: 0
      }
    };
  }
  return cleanedChunks;
}