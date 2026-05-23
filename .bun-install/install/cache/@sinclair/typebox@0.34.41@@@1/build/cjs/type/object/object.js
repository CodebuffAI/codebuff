"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.Object = void 0;
const type_1 = require("../create/type");
const index_1 = require("../symbols/index");
// ------------------------------------------------------------------
// TypeGuard
// ------------------------------------------------------------------
const kind_1 = require("../guard/kind");
function RequiredKeys(properties) {
    const keys = [];
    for (let key in properties) {
        if (!(0, kind_1.IsOptional)(properties[key]))
            keys.push(key);
    }
    return keys;
}
/** `[Json]` Creates an Object type */
function _Object(properties, options) {
    const required = RequiredKeys(properties);
    const schematic = required.length > 0 ? { [index_1.Kind]: 'Object', type: 'object', properties, required } : { [index_1.Kind]: 'Object', type: 'object', properties };
    return (0, type_1.CreateType)(schematic, options);
}
/** `[Json]` Creates an Object type */
exports.Object = _Object;
