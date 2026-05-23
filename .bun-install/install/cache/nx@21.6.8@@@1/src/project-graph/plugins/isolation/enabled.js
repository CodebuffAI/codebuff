"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIsolationEnabled = isIsolationEnabled;
const native_1 = require("../../../native");
function isIsolationEnabled() {
    // Explicitly enabled, regardless of further conditions
    if (process.env.NX_ISOLATE_PLUGINS === 'true') {
        return true;
    }
    if (
    // Explicitly disabled
    process.env.NX_ISOLATE_PLUGINS === 'false' ||
        // Isolation is disabled on WASM builds currently.
        native_1.IS_WASM) {
        return false;
    }
    // Default value
    return true;
}
