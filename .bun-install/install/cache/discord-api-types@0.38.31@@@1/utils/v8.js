"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDMInteraction = isDMInteraction;
exports.isGuildInteraction = isGuildInteraction;
exports.isApplicationCommandDMInteraction = isApplicationCommandDMInteraction;
exports.isApplicationCommandGuildInteraction = isApplicationCommandGuildInteraction;
exports.isMessageComponentDMInteraction = isMessageComponentDMInteraction;
exports.isMessageComponentGuildInteraction = isMessageComponentGuildInteraction;
exports.isLinkButton = isLinkButton;
exports.isInteractionButton = isInteractionButton;
const index_1 = require("../payloads/v8/index");
// Interactions
/**
 * A type-guard check for DM interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the interaction was received in a DM channel
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
function isDMInteraction(interaction) {
    return Reflect.has(interaction, 'user');
}
/**
 * A type-guard check for guild interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the interaction was received in a guild
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
function isGuildInteraction(interaction) {
    return Reflect.has(interaction, 'guild_id');
}
// ApplicationCommandInteractions
/**
 * A type-guard check for DM application command interactions
 *
 * @param interaction - The application command interaction to check against
 * @returns A boolean that indicates if the application command interaction was received in a DM channel
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
function isApplicationCommandDMInteraction(interaction) {
    return isDMInteraction(interaction);
}
/**
 * A type-guard check for guild application command interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the application command interaction was received in a guild
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
function isApplicationCommandGuildInteraction(interaction) {
    return isGuildInteraction(interaction);
}
// MessageComponentInteractions
/**
 * A type-guard check for DM message component interactions
 *
 * @param interaction - The message component interaction to check against
 * @returns A boolean that indicates if the message component interaction was received in a DM channel
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
function isMessageComponentDMInteraction(interaction) {
    return isDMInteraction(interaction);
}
/**
 * A type-guard check for guild message component interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the message component interaction was received in a guild
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
function isMessageComponentGuildInteraction(interaction) {
    return isGuildInteraction(interaction);
}
// Buttons
/**
 * A type-guard check for buttons that have a `url` attached to them.
 *
 * @param component - The button to check against
 * @returns A boolean that indicates if the button has a `url` attached to it
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
function isLinkButton(component) {
    return component.style === index_1.ButtonStyle.Link;
}
/**
 * A type-guard check for buttons that have a `custom_id` attached to them.
 *
 * @param component - The button to check against
 * @returns A boolean that indicates if the button has a `custom_id` attached to it
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
function isInteractionButton(component) {
    return component.style !== index_1.ButtonStyle.Link;
}
//# sourceMappingURL=v8.js.map