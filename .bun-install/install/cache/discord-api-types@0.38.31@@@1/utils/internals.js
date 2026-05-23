"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.urlSafeCharacters = void 0;
// eslint-disable-next-line unicorn/better-regex
const pattern = /^[\d%A-Za-z-_]+$/g;
exports.urlSafeCharacters = {
    test(input) {
        const result = pattern.test(input);
        pattern.lastIndex = 0;
        return result;
    },
};
//# sourceMappingURL=internals.js.map