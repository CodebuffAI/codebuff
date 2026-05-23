import type { Snowflake } from '../../../../../globals';
import type { APIApplicationCommandOptionBase, APIInteractionDataOptionBase } from './base';
import type { ApplicationCommandOptionType } from './shared';
export type APIApplicationCommandMentionableOption = APIApplicationCommandOptionBase<ApplicationCommandOptionType.Mentionable>;
export type APIApplicationCommandInteractionDataMentionableOption = APIInteractionDataOptionBase<ApplicationCommandOptionType.Mentionable, Snowflake>;
//# sourceMappingURL=mentionable.d.ts.map