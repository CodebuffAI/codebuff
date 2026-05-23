/**
 * @see {@link https://discord.com/developers/docs/reference#snowflakes}
 */
export type Snowflake = string;
/**
 * @see {@link https://discord.com/developers/docs/topics/permissions}
 */
export type Permissions = string;
/**
 * @see {@link https://discord.com/developers/docs/reference#message-formatting-formats}
 */
export declare const FormattingPatterns: {
    /**
     * Regular expression for matching a user mention, strictly without a nickname
     *
     * The `id` group property is present on the `exec` result of this expression
     */
    readonly User: RegExp;
    /**
     * Regular expression for matching a user mention, strictly with a nickname
     *
     * The `id` group property is present on the `exec` result of this expression
     *
     * @deprecated Passing `!` in user mentions is no longer necessary / supported, and future message contents won't have it
     */
    readonly UserWithNickname: RegExp;
    /**
     * Regular expression for matching a user mention, with or without a nickname
     *
     * The `id` group property is present on the `exec` result of this expression
     *
     * @deprecated Passing `!` in user mentions is no longer necessary / supported, and future message contents won't have it
     */
    readonly UserWithOptionalNickname: RegExp;
    /**
     * Regular expression for matching a channel mention
     *
     * The `id` group property is present on the `exec` result of this expression
     */
    readonly Channel: RegExp;
    /**
     * Regular expression for matching a role mention
     *
     * The `id` group property is present on the `exec` result of this expression
     */
    readonly Role: RegExp;
    /**
     * Regular expression for matching a application command mention
     *
     * The `fullName` (possibly including `name`, `subcommandOrGroup` and `subcommand`) and `id` group properties are present on the `exec` result of this expression
     */
    readonly SlashCommand: RegExp;
    /**
     * Regular expression for matching a custom emoji, either static or animated
     *
     * The `animated`, `name` and `id` group properties are present on the `exec` result of this expression
     */
    readonly Emoji: RegExp;
    /**
     * Regular expression for matching strictly an animated custom emoji
     *
     * The `animated`, `name` and `id` group properties are present on the `exec` result of this expression
     */
    readonly AnimatedEmoji: RegExp;
    /**
     * Regular expression for matching strictly a static custom emoji
     *
     * The `name` and `id` group properties are present on the `exec` result of this expression
     */
    readonly StaticEmoji: RegExp;
    /**
     * Regular expression for matching a timestamp, either default or custom styled
     *
     * The `timestamp` and `style` group properties are present on the `exec` result of this expression
     */
    readonly Timestamp: RegExp;
    /**
     * Regular expression for matching strictly default styled timestamps
     *
     * The `timestamp` group property is present on the `exec` result of this expression
     */
    readonly DefaultStyledTimestamp: RegExp;
    /**
     * Regular expression for matching strictly custom styled timestamps
     *
     * The `timestamp` and `style` group properties are present on the `exec` result of this expression
     */
    readonly StyledTimestamp: RegExp;
    /**
     * Regular expression for matching a guild navigation mention
     *
     * The `type` group property is present on the `exec` result of this expression
     */
    readonly GuildNavigation: RegExp;
    /**
     * Regular expression for matching a linked role mention
     *
     * The `id` group property is present on the `exec` result of this expression
     */
    readonly LinkedRole: RegExp;
};
//# sourceMappingURL=globals.d.ts.map