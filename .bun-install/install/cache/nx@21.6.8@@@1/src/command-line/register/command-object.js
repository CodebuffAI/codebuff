"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yargsRegisterCommand = void 0;
const shared_options_1 = require("../yargs-utils/shared-options");
const handle_errors_1 = require("../../utils/handle-errors");
exports.yargsRegisterCommand = {
    command: 'register [key]',
    aliases: ['activate-powerpack'],
    describe: false,
    builder: (yargs) => (0, shared_options_1.withVerbose)(yargs)
        .parserConfiguration({
        'strip-dashed': true,
        'unknown-options-as-args': true,
    })
        .positional('key', {
        type: 'string',
        description: 'This is a key for Nx.',
    })
        .example('$0 register <key>', 'Register a Nx key'),
    handler: async (args) => {
        const exitCode = await (0, handle_errors_1.handleErrors)(args.verbose ?? false, async () => {
            return (await Promise.resolve().then(() => require('./register'))).handleRegister(args);
        });
        process.exit(exitCode);
    },
};
