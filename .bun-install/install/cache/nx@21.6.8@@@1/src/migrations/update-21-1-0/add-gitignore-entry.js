"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = addGitignoreEntry;
const ignore_1 = require("ignore");
async function addGitignoreEntry(tree) {
    if (!tree.exists('nx.json')) {
        return;
    }
    const GITIGNORE_ENTRIES = [
        '.cursor/rules/nx-rules.mdc',
        '.github/instructions/nx.instructions.md',
    ];
    if (!tree.exists('.gitignore')) {
        return;
    }
    let content = tree.read('.gitignore', 'utf-8') || '';
    const ig = (0, ignore_1.default)().add(content);
    for (const entry of GITIGNORE_ENTRIES) {
        if (!ig.ignores(entry)) {
            content = content.trimEnd() + '\n' + entry + '\n';
        }
    }
    tree.write('.gitignore', content);
}
