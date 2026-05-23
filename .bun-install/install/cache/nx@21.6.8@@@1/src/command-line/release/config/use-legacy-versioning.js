"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldUseLegacyVersioning = shouldUseLegacyVersioning;
// TODO(v22): remove this function and entire concept of legacy versioning in v22
function shouldUseLegacyVersioning(releaseConfig) {
    return process.env.NX_INTERNAL_USE_LEGACY_VERSIONING === 'true'
        ? true
        : releaseConfig?.version?.useLegacyVersioning ?? false;
}
