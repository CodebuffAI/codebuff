import type { APIApplicationCommandDMInteraction, APIApplicationCommandGuildInteraction, APIApplicationCommandInteraction, APIButtonComponent, APIButtonComponentWithCustomId, APIButtonComponentWithURL, APIDMInteraction, APIGuildInteraction, APIInteraction, APIMessageComponentDMInteraction, APIMessageComponentGuildInteraction, APIMessageComponentInteraction } from '../payloads/v8/index';
/**
 * A type-guard check for DM interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the interaction was received in a DM channel
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare function isDMInteraction(interaction: APIInteraction): interaction is APIDMInteraction;
/**
 * A type-guard check for guild interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the interaction was received in a guild
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare function isGuildInteraction(interaction: APIInteraction): interaction is APIGuildInteraction;
/**
 * A type-guard check for DM application command interactions
 *
 * @param interaction - The application command interaction to check against
 * @returns A boolean that indicates if the application command interaction was received in a DM channel
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare function isApplicationCommandDMInteraction(interaction: APIApplicationCommandInteraction): interaction is APIApplicationCommandDMInteraction;
/**
 * A type-guard check for guild application command interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the application command interaction was received in a guild
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare function isApplicationCommandGuildInteraction(interaction: APIApplicationCommandInteraction): interaction is APIApplicationCommandGuildInteraction;
/**
 * A type-guard check for DM message component interactions
 *
 * @param interaction - The message component interaction to check against
 * @returns A boolean that indicates if the message component interaction was received in a DM channel
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare function isMessageComponentDMInteraction(interaction: APIMessageComponentInteraction): interaction is APIMessageComponentDMInteraction;
/**
 * A type-guard check for guild message component interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the message component interaction was received in a guild
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare function isMessageComponentGuildInteraction(interaction: APIMessageComponentInteraction): interaction is APIMessageComponentGuildInteraction;
/**
 * A type-guard check for buttons that have a `url` attached to them.
 *
 * @param component - The button to check against
 * @returns A boolean that indicates if the button has a `url` attached to it
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare function isLinkButton(component: APIButtonComponent): component is APIButtonComponentWithURL;
/**
 * A type-guard check for buttons that have a `custom_id` attached to them.
 *
 * @param component - The button to check against
 * @returns A boolean that indicates if the button has a `custom_id` attached to it
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare function isInteractionButton(component: APIButtonComponent): component is APIButtonComponentWithCustomId;
//# sourceMappingURL=v8.d.ts.map