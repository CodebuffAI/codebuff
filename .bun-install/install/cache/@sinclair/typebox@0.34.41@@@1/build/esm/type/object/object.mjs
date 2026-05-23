import { CreateType } from '../create/type.mjs';
import { Kind } from '../symbols/index.mjs';
// ------------------------------------------------------------------
// TypeGuard
// ------------------------------------------------------------------
import { IsOptional } from '../guard/kind.mjs';
function RequiredKeys(properties) {
    const keys = [];
    for (let key in properties) {
        if (!IsOptional(properties[key]))
            keys.push(key);
    }
    return keys;
}
/** `[Json]` Creates an Object type */
function _Object(properties, options) {
    const required = RequiredKeys(properties);
    const schematic = required.length > 0 ? { [Kind]: 'Object', type: 'object', properties, required } : { [Kind]: 'Object', type: 'object', properties };
    return CreateType(schematic, options);
}
/** `[Json]` Creates an Object type */
export var Object = _Object;
