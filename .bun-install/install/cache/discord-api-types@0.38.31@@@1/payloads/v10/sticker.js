"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/sticker
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StickerFormatType = exports.StickerType = void 0;
/**
 * @see {@link https://discord.com/developers/docs/resources/sticker#sticker-object-sticker-types}
 */
var StickerType;
(function (StickerType) {
    /**
     * An official sticker in a pack
     */
    StickerType[StickerType["Standard"] = 1] = "Standard";
    /**
     * A sticker uploaded to a guild for the guild's members
     */
    StickerType[StickerType["Guild"] = 2] = "Guild";
})(StickerType || (exports.StickerType = StickerType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/sticker#sticker-object-sticker-format-types}
 */
var StickerFormatType;
(function (StickerFormatType) {
    StickerFormatType[StickerFormatType["PNG"] = 1] = "PNG";
    StickerFormatType[StickerFormatType["APNG"] = 2] = "APNG";
    StickerFormatType[StickerFormatType["Lottie"] = 3] = "Lottie";
    StickerFormatType[StickerFormatType["GIF"] = 4] = "GIF";
})(StickerFormatType || (exports.StickerFormatType = StickerFormatType = {}));
//# sourceMappingURL=sticker.js.map