"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/sticker
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StickerFormatType = exports.StickerType = void 0;
/**
 * https://discord.com/developers/docs/resources/sticker#sticker-object-sticker-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
var StickerType;
(function (StickerType) {
    /**
     * An official sticker in a pack, part of Nitro or in a removed purchasable pack
     */
    StickerType[StickerType["Standard"] = 1] = "Standard";
    /**
     * A sticker uploaded to a Boosted guild for the guild's members
     */
    StickerType[StickerType["Guild"] = 2] = "Guild";
})(StickerType || (exports.StickerType = StickerType = {}));
/**
 * https://discord.com/developers/docs/resources/sticker#sticker-object-sticker-format-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
var StickerFormatType;
(function (StickerFormatType) {
    StickerFormatType[StickerFormatType["PNG"] = 1] = "PNG";
    StickerFormatType[StickerFormatType["APNG"] = 2] = "APNG";
    StickerFormatType[StickerFormatType["Lottie"] = 3] = "Lottie";
})(StickerFormatType || (exports.StickerFormatType = StickerFormatType = {}));
//# sourceMappingURL=sticker.js.map