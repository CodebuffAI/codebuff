declare const Config: {
    DEBUG: boolean;
    LIB_VERSION: string;
    LIB_NAME: string;
    /** The actual JS SDK version, unaffected by _overrideSDKInfo. Used for the `ver` request param. */
    JS_SDK_VERSION: string;
};
export default Config;
