import type { Snowflake } from '../../../../../globals';
import type { APIApplicationCommandOptionBase, APIInteractionDataOptionBase } from './base';
import type { ApplicationCommandOptionType } from './shared';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandMentionableOption = APIApplicationCommandOptionBase<ApplicationCommandOptionType.Mentionable>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandInteractionDataMentionableOption = APIInteractionDataOptionBase<ApplicationCommandOptionType.Mentionable, Snowflake>;
//# sourceMappingURL=mentionable.d.ts.map