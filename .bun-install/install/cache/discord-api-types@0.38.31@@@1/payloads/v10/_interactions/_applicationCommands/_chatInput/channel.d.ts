import type { Snowflake } from '../../../../../globals';
import type { ChannelType } from '../../../channel';
import type { APIApplicationCommandOptionBase, APIInteractionDataOptionBase } from './base';
import type { ApplicationCommandOptionType } from './shared';
export interface APIApplicationCommandChannelOption extends APIApplicationCommandOptionBase<ApplicationCommandOptionType.Channel> {
    channel_types?: Exclude<ChannelType, ChannelType.DM | ChannelType.GroupDM | ChannelType.GuildDirectory>[];
}
export type APIApplicationCommandInteractionDataChannelOption = APIInteractionDataOptionBase<ApplicationCommandOptionType.Channel, Snowflake>;
//# sourceMappingURL=channel.d.ts.map