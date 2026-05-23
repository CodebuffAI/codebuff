export type MessageOptionKey = 'yes' | 'skip';
declare const messageOptions: {
    readonly setupNxCloud: readonly [{
        readonly code: "enable-ci";
        readonly message: "Would you like to enable AI-powered Self-Healing CI and Remote Caching?";
        readonly initial: 0;
        readonly choices: readonly [{
            readonly value: "yes";
            readonly name: "Yes";
        }, {
            readonly value: "skip";
            readonly name: "Skip for now";
        }];
        readonly footer: "\nLearn about it at https://nx.dev/nx-cloud";
        readonly hint: "\n(it's free and can be disabled any time)";
    }];
    readonly setupViewLogs: readonly [{
        readonly code: "connect-to-view-logs";
        readonly message: "To view the logs, Nx needs to connect your workspace to Nx Cloud and upload the most recent run details";
        readonly initial: 0;
        readonly choices: readonly [{
            readonly value: "yes";
            readonly name: "Yes";
            readonly hint: "Connect to Nx Cloud and upload the run details";
        }, {
            readonly value: "skip";
            readonly name: "No";
        }];
        readonly footer: "\nRead more about Nx Cloud at https://nx.dev/nx-cloud";
        readonly hint: "\n(it's free and can be disabled any time)";
    }];
};
export type MessageKey = keyof typeof messageOptions;
export type MessageData = (typeof messageOptions)[MessageKey][number];
export declare class PromptMessages {
    private selectedMessages;
    getPrompt(key: MessageKey): MessageData;
    codeOfSelectedPromptMessage(key: string): string;
}
export declare const messages: PromptMessages;
/**
 * We are incrementing a counter to track how often create-nx-workspace is used in CI
 * vs dev environments. No personal information is collected.
 */
export declare function recordStat(opts: {
    command: string;
    nxVersion: string;
    useCloud: boolean;
    meta?: string;
}): Promise<void>;
export {};
//# sourceMappingURL=ab-testing.d.ts.map