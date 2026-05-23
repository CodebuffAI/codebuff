# oidc-token-hash

oidc-token-hash validates (and generates) ID Token `_hash` claims such as `at_hash` or `c_hash`

> Its [`*_hash`] value is the base64url encoding of the left-most half of the hash of the octets of
> the ASCII representation of the `token` / `state` / `code` value, where the hash algorithm used is
> the hash algorithm used in the `alg` Header Parameter of the ID Token's JOSE Header. For instance,
> if the `alg` is `RS256`, hash the `token` / `state` / `code` value with SHA-256, then take the
> left-most 128 bits and base64url encode them. The `*_hash` value is a case sensitive string.

## Matrix

| JWS algorithm | used hash algorithm | Note |
| --- | --- | --- |
| HS256, RS256, PS256, ES256, ES256K | sha256 | |
| HS384, RS384, PS384, ES384 | sha384 | |
| HS512, RS512, PS512, ES512 | sha512 | |
| EdDSA w/ Ed25519 curve | sha512 | [connect/issues#1125](https://bitbucket.org/openid/connect/issues/1125) |
| EdDSA w/ Ed448 curve | shake256 | [connect/issues#1125](https://bitbucket.org/openid/connect/issues/1125) |
| Ed25519 | sha512 | [connect/issues#1125](https://bitbucket.org/openid/connect/issues/1125) |
| Ed448 | shake256 | [connect/issues#1125](https://bitbucket.org/openid/connect/issues/1125) |

## Usage

Validating
```js
const oidcTokenHash = require('oidc-token-hash');

const access_token = 'YmJiZTAwYmYtMzgyOC00NzhkLTkyOTItNjJjNDM3MGYzOWIy9sFhvH8K_x8UIHj1osisS57f5DduL-ar_qw5jl3lthwpMjm283aVMQXDmoqqqydDSqJfbhptzw8rUVwkuQbolw';

oidcTokenHash.validate({ claim: 'at_hash', source: 'access_token' }, 'x7vk7f6BvQj0jQHYFIk4ag', access_token, 'RS256'); // => does not throw
oidcTokenHash.validate({ claim: 'at_hash', source: 'access_token' }, 'EGEAhGYyfuwDaVTifvrWSoD5MSy_5hZPy6I7Vm-7pTQ', access_token, 'EdDSA', 'Ed25519'); // => does not throw
oidcTokenHash.validate({ claim: 'at_hash', source: 'access_token' }, 'EGEAhGYyfuwDaVTifvrWSoD5MSy_5hZPy6I7Vm-7pTQ', access_token, 'Ed25519'); // => does not throw
oidcTokenHash.validate({ claim: 'at_hash', source: 'access_token' }, 'x7vk7f6BvQj0jQHYFIk4ag', 'foobar', 'RS256'); // => throws AssertionError, message: at_hash mismatch, expected w6uP8Tcg6K2QR905Rms8iQ, got: x7vk7f6BvQj0jQHYFIk4ag
```

Generating
```js
// access_token from first example
oidcTokenHash.generate(access_token, 'RS256'); // => 'x7vk7f6BvQj0jQHYFIk4ag'
oidcTokenHash.generate(access_token, 'HS384'); // => 'ups_76_7CCye_J1WIyGHKVG7AAs2olYm'
oidcTokenHash.generate(access_token, 'ES512'); // => 'EGEAhGYyfuwDaVTifvrWSoD5MSy_5hZPy6I7Vm-7pTQ'
oidcTokenHash.generate(access_token, 'Ed25519'); // => 'EGEAhGYyfuwDaVTifvrWSoD5MSy_5hZPy6I7Vm-7pTQ'
oidcTokenHash.generate(access_token, 'EdDSA', 'Ed25519'); // => 'EGEAhGYyfuwDaVTifvrWSoD5MSy_5hZPy6I7Vm-7pTQ'
oidcTokenHash.generate(access_token, 'Ed448'); // => 'jxsy68_eG9-91VnHsZ2VnCr_WqDMv4nspiSuUPRdNZnv1y5lNV3rPVYYWNiY_TbUB1JRwlgiDTzZ'
oidcTokenHash.generate(access_token, 'EdDSA', 'Ed448'); // => 'jxsy68_eG9-91VnHsZ2VnCr_WqDMv4nspiSuUPRdNZnv1y5lNV3rPVYYWNiY_TbUB1JRwlgiDTzZ'
```

## Changelog
- 5.1.1 - remove conditional shake256 check
- 5.1.0 - add support for Ed25519 and Ed448 JWS Algorithm Identifiers
- 5.0.2 - avoid use of deprecated String.prototype.substr
- 5.0.1 - use `base64url` native encoding in Node.js when available
- 5.0.0 - fixed `Ed448` and `shake256` to use 114 bytes output
- 4.0.0 - using `sha512` for `Ed25519` and `shake256` for `Ed448`, refactored API, removed handling of `none` JWS alg
- 3.0.2 - removed `base64url` dependency
- 3.0.1 - `base64url` comeback
- 3.0.0 - drop lts/4 support, replace base64url dependency
- 2.0.0 - rather then assuming the alg based on the hash length `#valid()` now requires a third
  argument with the JOSE header `alg` value, resulting in strict validation
- 1.0.0 - initial release
