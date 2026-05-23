"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._base64Encode = _base64Encode;
function _base64Encode(data) {
    if (!data) {
        return data;
    }
    return btoa(encodeURIComponent(data).replace(/%([0-9A-F]{2})/g, function (_, p1) { return String.fromCharCode(parseInt(p1, 16)); }));
}
//# sourceMappingURL=encode-utils.js.map