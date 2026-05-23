function isObject(item) {
    return item !== null && typeof item === "object";
}
/** Deep merge two or more objects */
export function merge(target, ...sources) {
    if (!sources.length)
        return target;
    const source = sources.shift();
    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!isObject(target[key]))
                    target[key] = Array.isArray(source[key])
                        ? []
                        : {};
                merge(target[key], source[key]);
            }
            else if (source[key] !== undefined)
                target[key] = source[key];
        }
    }
    return merge(target, ...sources);
}
