import { CreateType } from '../create/type.mjs';
import { Discard } from '../discard/discard.mjs';
import { TransformKind } from '../symbols/symbols.mjs';
import { Computed } from '../computed/index.mjs';
import { Literal } from '../literal/index.mjs';
import { IndexPropertyKeys } from '../indexed/index.mjs';
import { Intersect } from '../intersect/index.mjs';
import { Union } from '../union/index.mjs';
import { Object } from '../object/index.mjs';
// ------------------------------------------------------------------
// Mapped
// ------------------------------------------------------------------
import { OmitFromMappedKey } from './omit-from-mapped-key.mjs';
import { OmitFromMappedResult } from './omit-from-mapped-result.mjs';
// ------------------------------------------------------------------
// TypeGuard
// ------------------------------------------------------------------
import { IsMappedKey, IsIntersect, IsUnion, IsObject, IsSchema, IsMappedResult, IsLiteralValue, IsRef } from '../guard/kind.mjs';
import { IsArray as IsArrayValue } from '../guard/value.mjs';
// prettier-ignore
function FromIntersect(types, propertyKeys) {
    return types.map((type) => OmitResolve(type, propertyKeys));
}
// prettier-ignore
function FromUnion(types, propertyKeys) {
    return types.map((type) => OmitResolve(type, propertyKeys));
}
// ------------------------------------------------------------------
// FromProperty
// ------------------------------------------------------------------
// prettier-ignore
function FromProperty(properties, key) {
    const { [key]: _, ...R } = properties;
    return R;
}
// prettier-ignore
function FromProperties(properties, propertyKeys) {
    return propertyKeys.reduce((T, K2) => FromProperty(T, K2), properties);
}
// prettier-ignore
function FromObject(properties, propertyKeys) {
    const options = Discard(properties, [TransformKind, '$id', 'required', 'properties']);
    const omittedProperties = FromProperties(properties['properties'], propertyKeys);
    return Object(omittedProperties, options);
}
// prettier-ignore
function UnionFromPropertyKeys(propertyKeys) {
    const result = propertyKeys.reduce((result, key) => IsLiteralValue(key) ? [...result, Literal(key)] : result, []);
    return Union(result);
}
// prettier-ignore
function OmitResolve(properties, propertyKeys) {
    return (IsIntersect(properties) ? Intersect(FromIntersect(properties.allOf, propertyKeys)) :
        IsUnion(properties) ? Union(FromUnion(properties.anyOf, propertyKeys)) :
            IsObject(properties) ? FromObject(properties, propertyKeys) :
                Object({}));
}
/** `[Json]` Constructs a type whose keys are picked from the given type */
// prettier-ignore
export function Omit(type, key, options) {
    const typeKey = IsArrayValue(key) ? UnionFromPropertyKeys(key) : key;
    const propertyKeys = IsSchema(key) ? IndexPropertyKeys(key) : key;
    const isTypeRef = IsRef(type);
    const isKeyRef = IsRef(key);
    return (IsMappedResult(type) ? OmitFromMappedResult(type, propertyKeys, options) :
        IsMappedKey(key) ? OmitFromMappedKey(type, key, options) :
            (isTypeRef && isKeyRef) ? Computed('Omit', [type, typeKey], options) :
                (!isTypeRef && isKeyRef) ? Computed('Omit', [type, typeKey], options) :
                    (isTypeRef && !isKeyRef) ? Computed('Omit', [type, typeKey], options) :
                        CreateType({ ...OmitResolve(type, propertyKeys), ...options }));
}
