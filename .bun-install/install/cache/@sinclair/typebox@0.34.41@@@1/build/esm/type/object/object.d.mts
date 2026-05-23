import type { TSchema, SchemaOptions } from '../schema/index.mjs';
import type { Static } from '../static/index.mjs';
import type { Evaluate } from '../helpers/index.mjs';
import type { TReadonly } from '../readonly/index.mjs';
import type { TOptional } from '../optional/index.mjs';
import { Kind } from '../symbols/index.mjs';
type ReadonlyOptionalPropertyKeys<T extends TProperties> = {
    [K in keyof T]: T[K] extends TReadonly<TSchema> ? (T[K] extends TOptional<T[K]> ? K : never) : never;
}[keyof T];
type ReadonlyPropertyKeys<T extends TProperties> = {
    [K in keyof T]: T[K] extends TReadonly<TSchema> ? (T[K] extends TOptional<T[K]> ? never : K) : never;
}[keyof T];
type OptionalPropertyKeys<T extends TProperties> = {
    [K in keyof T]: T[K] extends TOptional<TSchema> ? (T[K] extends TReadonly<T[K]> ? never : K) : never;
}[keyof T];
type RequiredPropertyKeys<T extends TProperties> = keyof Omit<T, ReadonlyOptionalPropertyKeys<T> | ReadonlyPropertyKeys<T> | OptionalPropertyKeys<T>>;
type ObjectStaticProperties<T extends TProperties, R extends Record<keyof any, unknown>> = Evaluate<(Readonly<Partial<Pick<R, ReadonlyOptionalPropertyKeys<T>>>> & Readonly<Pick<R, ReadonlyPropertyKeys<T>>> & Partial<Pick<R, OptionalPropertyKeys<T>>> & Required<Pick<R, RequiredPropertyKeys<T>>>)>;
type ObjectStatic<T extends TProperties, P extends unknown[]> = ObjectStaticProperties<T, {
    [K in keyof T]: Static<T[K], P>;
}>;
export type TPropertyKey = string | number;
export type TProperties = Record<TPropertyKey, TSchema>;
export type TAdditionalProperties = undefined | TSchema | boolean;
export interface ObjectOptions extends SchemaOptions {
    /** Additional property constraints for this object */
    additionalProperties?: TAdditionalProperties;
    /** The minimum number of properties allowed on this object */
    minProperties?: number;
    /** The maximum number of properties allowed on this object */
    maxProperties?: number;
}
export interface TObject<T extends TProperties = TProperties> extends TSchema, ObjectOptions {
    [Kind]: 'Object';
    static: ObjectStatic<T, this['params']>;
    additionalProperties?: TAdditionalProperties;
    type: 'object';
    properties: T;
    required?: string[];
}
/** `[Json]` Creates an Object type */
declare function _Object<T extends TProperties>(properties: T, options?: ObjectOptions): TObject<T>;
/** `[Json]` Creates an Object type */
export declare var Object: typeof _Object;
export {};
