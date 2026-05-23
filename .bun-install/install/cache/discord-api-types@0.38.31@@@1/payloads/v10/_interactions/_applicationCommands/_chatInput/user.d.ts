import type { Snowflake } from '../../../../../globals';
import type { APIApplicationCommandOptionBase, APIInteractionDataOptionBase } from './base';
import type { ApplicationCommandOptionType } from './shared';
export type APIApplicationCommandUserOption = APIApplicationCommandOptionBase<ApplicationCommandOptionType.User>;
export type APIApplicationCommandInteractionDataUserOption = APIInteractionDataOptionBase<ApplicationCommandOptionType.User, Snowflake>;
//# sourceMappingURL=user.d.ts.map