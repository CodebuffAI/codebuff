/**
 * UTF-8 safe base64 encoding.
 * Uses encodeURIComponent to handle Unicode, then converts percent-encoded bytes
 * back to characters that btoa can handle.
 */
export declare function _base64Encode(data: null): null;
export declare function _base64Encode(data: undefined): undefined;
export declare function _base64Encode(data: string): string;
