"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nxMcpTomlConfig = exports.nxMcpTomlHeader = exports.getAgentRulesWrapped = exports.rulesRegex = exports.nxRulesMarkerCommentEnd = exports.nxRulesMarkerCommentDescription = exports.nxRulesMarkerCommentStart = exports.codexConfigTomlPath = void 0;
exports.agentsMdPath = agentsMdPath;
exports.geminiMdPath = geminiMdPath;
exports.parseGeminiSettings = parseGeminiSettings;
exports.geminiSettingsPath = geminiSettingsPath;
exports.claudeMdPath = claudeMdPath;
exports.claudeMcpPath = claudeMcpPath;
const os_1 = require("os");
const path_1 = require("path");
const fileutils_1 = require("../utils/fileutils");
const get_agent_rules_1 = require("./set-up-ai-agents/get-agent-rules");
function agentsMdPath(root) {
    return (0, path_1.join)(root, 'AGENTS.md');
}
function geminiMdPath(root) {
    return (0, path_1.join)(root, 'GEMINI.md');
}
function parseGeminiSettings(root) {
    const settingsPath = geminiSettingsPath(root);
    try {
        return (0, fileutils_1.readJsonFile)(settingsPath);
    }
    catch {
        return undefined;
    }
}
function geminiSettingsPath(root) {
    return (0, path_1.join)(root, '.gemini', 'settings.json');
}
function claudeMdPath(root) {
    return (0, path_1.join)(root, 'CLAUDE.md');
}
function claudeMcpPath(root) {
    return (0, path_1.join)(root, '.mcp.json');
}
exports.codexConfigTomlPath = (0, path_1.join)((0, os_1.homedir)(), '.codex', 'config.toml');
exports.nxRulesMarkerCommentStart = `<!-- nx configuration start-->`;
exports.nxRulesMarkerCommentDescription = `<!-- Leave the start & end comments to automatically receive updates. -->`;
exports.nxRulesMarkerCommentEnd = `<!-- nx configuration end-->`;
exports.rulesRegex = new RegExp(`${exports.nxRulesMarkerCommentStart}[\\s\\S]*?${exports.nxRulesMarkerCommentEnd}`, 'm');
const getAgentRulesWrapped = (writeNxCloudRules) => {
    const agentRulesString = (0, get_agent_rules_1.getAgentRules)(writeNxCloudRules);
    return `${exports.nxRulesMarkerCommentStart}\n${exports.nxRulesMarkerCommentDescription}\n${agentRulesString}\n${exports.nxRulesMarkerCommentEnd}`;
};
exports.getAgentRulesWrapped = getAgentRulesWrapped;
exports.nxMcpTomlHeader = `[mcp_servers."nx-mcp"]`;
exports.nxMcpTomlConfig = `${exports.nxMcpTomlHeader}
type = "stdio"
command = "npx"
args = ["nx", "mcp"]
`;
