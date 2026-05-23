export declare function agentsMdPath(root: string): string;
export declare function geminiMdPath(root: string): string;
export declare function parseGeminiSettings(root: string): any | undefined;
export declare function geminiSettingsPath(root: string): string;
export declare function claudeMdPath(root: string): string;
export declare function claudeMcpPath(root: string): string;
export declare const codexConfigTomlPath: string;
export declare const nxRulesMarkerCommentStart = "<!-- nx configuration start-->";
export declare const nxRulesMarkerCommentDescription = "<!-- Leave the start & end comments to automatically receive updates. -->";
export declare const nxRulesMarkerCommentEnd = "<!-- nx configuration end-->";
export declare const rulesRegex: RegExp;
export declare const getAgentRulesWrapped: (writeNxCloudRules: boolean) => string;
export declare const nxMcpTomlHeader = "[mcp_servers.\"nx-mcp\"]";
export declare const nxMcpTomlConfig = "[mcp_servers.\"nx-mcp\"]\ntype = \"stdio\"\ncommand = \"npx\"\nargs = [\"nx\", \"mcp\"]\n";
//# sourceMappingURL=constants.d.ts.map