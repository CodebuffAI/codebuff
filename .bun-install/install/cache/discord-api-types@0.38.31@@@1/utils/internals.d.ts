export type _Nullable<T> = {
    [P in keyof T]: T[P] | null;
};
export type _NonNullableFields<T> = {
    [P in keyof T]: NonNullable<T[P]>;
};
export type _AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Base> = {
    [K in keyof Base]: Base[K] extends Exclude<Base[K], undefined> ? _AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Base[K]> : _AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Base[K]> | undefined;
};
export type _StrictPartial<Base> = _AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Partial<Base>>;
export type _StrictRequired<Base> = Required<{
    [K in keyof Base]: Exclude<Base[K], undefined>;
}>;
export type _UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
export type _Keys<T> = keyof T;
export type _DistributiveKeys<T> = T extends unknown ? _Keys<T> : never;
/**
 * Allows picking of keys from unions that are disjoint
 */
export type _DistributivePick<T, K extends _DistributiveKeys<T>> = T extends unknown ? keyof _Pick<T, K> extends never ? never : {
    [P in keyof _Pick<T, K>]: _Pick<T, K>[P];
} : never;
export type _Pick<T, K> = Pick<T, Extract<keyof T, K>>;
/**
 * Allows omitting of keys from unions that are disjoint
 */
export type _DistributiveOmit<T, K extends _DistributiveKeys<T>> = T extends unknown ? {
    [P in keyof _Omit<T, K>]: _Omit<T, K>[P];
} : never;
export type _Omit<T, K> = Omit<T, Extract<keyof T, K>>;
export declare const urlSafeCharacters: {
    test(input: string): boolean;
};
//# sourceMappingURL=internals.d.ts.map