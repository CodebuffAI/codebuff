import type { APIApplicationCommandDMInteraction, APIApplicationCommandGuildInteraction, APIApplicationCommandInteraction, APIButtonComponent, APIButtonComponentWithCustomId, APIButtonComponentWithURL, APIChatInputApplicationCommandInteraction, APIContextMenuInteraction, APIDMInteraction, APIGuildInteraction, APIInteraction, APIMessageComponentButtonInteraction, APIMessageComponentDMInteraction, APIMessageComponentGuildInteraction, APIMessageComponentInteraction, APIMessageComponentSelectMenuInteraction } from '../payloads/v10/index';
/**
 * A type-guard check for DM interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the interaction was received in a DM channel
 */
export declare function isDMInteraction(interaction: APIInteraction): interaction is APIDMInteraction;
/**
 * A type-guard check for guild interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the interaction was received in a guild
 */
export declare function isGuildInteraction(interaction: APIInteraction): interaction is APIGuildInteraction;
/**
 * A type-guard check for DM application command interactions
 *
 * @param interaction - The application command interaction to check against
 * @returns A boolean that indicates if the application command interaction was received in a DM channel
 */
export declare function isApplicationCommandDMInteraction(interaction: APIApplicationCommandInteraction): interaction is APIApplicationCommandDMInteraction;
/**
 * A type-guard check for guild application command interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the application command interaction was received in a guild
 */
export declare function isApplicationCommandGuildInteraction(interaction: APIApplicationCommandInteraction): interaction is APIApplicationCommandGuildInteraction;
/**
 * A type-guard check for DM message component interactions
 *
 * @param interaction - The message component interaction to check against
 * @returns A boolean that indicates if the message component interaction was received in a DM channel
 */
export declare function isMessageComponentDMInteraction(interaction: APIMessageComponentInteraction): interaction is APIMessageComponentDMInteraction;
/**
 * A type-guard check for guild message component interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the message component interaction was received in a guild
 */
export declare function isMessageComponentGuildInteraction(interaction: APIMessageComponentInteraction): interaction is APIMessageComponentGuildInteraction;
/**
 * A type-guard check for buttons that have a `url` attached to them.
 *
 * @param component - The button to check against
 * @returns A boolean that indicates if the button has a `url` attached to it
 */
export declare function isLinkButton(component: APIButtonComponent): component is APIButtonComponentWithURL;
/**
 * A type-guard check for buttons that have a `custom_id` attached to them.
 *
 * @param component - The button to check against
 * @returns A boolean that indicates if the button has a `custom_id` attached to it
 */
export declare function isInteractionButton(component: APIButtonComponent): component is APIButtonComponentWithCustomId;
/**
 * A type-guard check for message component interactions
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the interaction is a message component
 */
export declare function isMessageComponentInteraction(interaction: APIInteraction): interaction is APIMessageComponentInteraction;
/**
 * A type-guard check for button message component interactions
 *
 * @param interaction - The message component interaction to check against
 * @returns A boolean that indicates if the message component is a button
 */
export declare function isMessageComponentButtonInteraction(interaction: APIMessageComponentInteraction): interaction is APIMessageComponentButtonInteraction;
/**
 * A type-guard check for select menu message component interactions
 *
 * @param interaction - The message component interaction to check against
 * @returns A boolean that indicates if the message component is a select menu
 */
export declare function isMessageComponentSelectMenuInteraction(interaction: APIMessageComponentInteraction): interaction is APIMessageComponentSelectMenuInteraction;
/**
 * A type-guard check for chat input application commands.
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the interaction is a chat input application command
 */
export declare function isChatInputApplicationCommandInteraction(interaction: APIApplicationCommandInteraction): interaction is APIChatInputApplicationCommandInteraction;
/**
 * A type-guard check for context menu application commands.
 *
 * @param interaction - The interaction to check against
 * @returns A boolean that indicates if the interaction is a context menu application command
 */
export declare function isContextMenuApplicationCommandInteraction(interaction: APIApplicationCommandInteraction): interaction is APIContextMenuInteraction;
//# sourceMappingURL=v10.d.ts.map