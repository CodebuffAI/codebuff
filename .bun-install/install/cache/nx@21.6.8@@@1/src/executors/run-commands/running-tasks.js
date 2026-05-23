"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeriallyRunningTasks = exports.ParallelRunningTasks = void 0;
exports.runSingleCommandWithPseudoTerminal = runSingleCommandWithPseudoTerminal;
const chalk = require("chalk");
const child_process_1 = require("child_process");
const npm_run_path_1 = require("npm-run-path");
const path_1 = require("path");
const treeKill = require("tree-kill");
const pseudo_terminal_1 = require("../../tasks-runner/pseudo-terminal");
const task_env_1 = require("../../tasks-runner/task-env");
const exit_codes_1 = require("../../utils/exit-codes");
const run_commands_impl_1 = require("./run-commands.impl");
class ParallelRunningTasks {
    constructor(options, context) {
        this.exitCallbacks = [];
        this.outputCallbacks = [];
        this.childProcesses = options.commands.map((commandConfig) => new RunningNodeProcess(commandConfig, options.color, calculateCwd(options.cwd, context), options.env ?? {}, options.readyWhenStatus, options.streamOutput, options.envFile));
        this.readyWhenStatus = options.readyWhenStatus;
        this.streamOutput = options.streamOutput;
        this.run();
    }
    async getResults() {
        return new Promise((res) => {
            this.onExit((code, terminalOutput) => {
                res({ code, terminalOutput });
            });
        });
    }
    onOutput(cb) {
        this.outputCallbacks.push(cb);
    }
    onExit(cb) {
        this.exitCallbacks.push(cb);
    }
    send(message) {
        for (const childProcess of this.childProcesses) {
            childProcess.send(message);
        }
    }
    async kill(signal) {
        await Promise.all(this.childProcesses.map(async (p) => {
            try {
                return p.kill();
            }
            catch (e) {
                console.error(`Unable to terminate "${p.command}"\nError:`, e);
            }
        }));
    }
    async run() {
        if (this.readyWhenStatus.length) {
            let { childProcess, result: { code, terminalOutput }, } = await Promise.race(this.childProcesses.map((childProcess) => new Promise((res) => {
                childProcess.onOutput((terminalOutput) => {
                    for (const cb of this.outputCallbacks) {
                        cb(terminalOutput);
                    }
                });
                childProcess.onExit((code, terminalOutput) => {
                    res({
                        childProcess,
                        result: { code, terminalOutput },
                    });
                });
            })));
            if (code !== 0) {
                const output = `Warning: command "${childProcess.command}" exited with non-zero status code`;
                terminalOutput += output;
                if (this.streamOutput) {
                    process.stderr.write(output);
                }
            }
            for (const cb of this.exitCallbacks) {
                cb(code, terminalOutput);
            }
        }
        else {
            const runningProcesses = new Set();
            let hasFailure = false;
            let failureDetails = null;
            const terminalOutputs = new Map();
            await Promise.allSettled(this.childProcesses.map(async (childProcess) => {
                runningProcesses.add(childProcess);
                childProcess.onOutput((terminalOutput) => {
                    for (const cb of this.outputCallbacks) {
                        cb(terminalOutput);
                    }
                });
                const { code, terminalOutput } = await childProcess.getResults();
                terminalOutputs.set(childProcess, terminalOutput);
                if (code !== 0 && !hasFailure) {
                    hasFailure = true;
                    failureDetails = { childProcess, code, terminalOutput };
                    // Immediately terminate all other running processes
                    await this.terminateRemainingProcesses(runningProcesses, childProcess);
                }
                runningProcesses.delete(childProcess);
            }));
            let terminalOutput = Array.from(terminalOutputs.values()).join('\r\n');
            if (hasFailure && failureDetails) {
                // Add failure message
                const output = `Warning: command "${failureDetails.childProcess.command}" exited with non-zero status code`;
                terminalOutput += output;
                if (this.streamOutput) {
                    process.stderr.write(output);
                }
                for (const cb of this.exitCallbacks) {
                    cb(1, terminalOutput);
                }
            }
            else {
                for (const cb of this.exitCallbacks) {
                    cb(0, terminalOutput);
                }
            }
        }
    }
    async terminateRemainingProcesses(runningProcesses, failedProcess) {
        const terminationPromises = [];
        const processesToTerminate = [...runningProcesses].filter((p) => p !== failedProcess);
        for (const process of processesToTerminate) {
            runningProcesses.delete(process);
            // Terminate the process
            terminationPromises.push(process.kill('SIGTERM').catch((err) => {
                // Log error but don't fail the entire operation
                if (this.streamOutput) {
                    console.error(`Failed to terminate process "${process.command}":`, err);
                }
            }));
        }
        // Wait for all terminations to complete with a timeout
        if (terminationPromises.length > 0) {
            await Promise.race([
                Promise.all(terminationPromises),
                new Promise((resolve) => setTimeout(resolve, 5_000)),
            ]);
        }
    }
}
exports.ParallelRunningTasks = ParallelRunningTasks;
class SeriallyRunningTasks {
    constructor(options, context, tuiEnabled) {
        this.tuiEnabled = tuiEnabled;
        this.terminalOutput = '';
        this.currentProcess = null;
        this.exitCallbacks = [];
        this.code = 0;
        this.outputCallbacks = [];
        this.run(options, context)
            .catch((e) => {
            this.error = e;
        })
            .finally(() => {
            for (const cb of this.exitCallbacks) {
                cb(this.code, this.terminalOutput);
            }
        });
    }
    getResults() {
        return new Promise((res, rej) => {
            this.onExit((code) => {
                if (this.error) {
                    rej(this.error);
                }
                else {
                    res({ code, terminalOutput: this.terminalOutput });
                }
            });
        });
    }
    onExit(cb) {
        this.exitCallbacks.push(cb);
    }
    onOutput(cb) {
        this.outputCallbacks.push(cb);
    }
    send(message) {
        throw new Error('Not implemented');
    }
    kill(signal) {
        return this.currentProcess.kill(signal);
    }
    async run(options, context) {
        for (const c of options.commands) {
            const childProcess = await this.createProcess(c, options.color, calculateCwd(options.cwd, context), options.processEnv ?? options.env ?? {}, options.usePty, options.streamOutput, options.tty, options.envFile);
            this.currentProcess = childProcess;
            childProcess.onOutput((output) => {
                for (const cb of this.outputCallbacks) {
                    cb(output);
                }
            });
            let { code, terminalOutput } = await childProcess.getResults();
            this.terminalOutput += terminalOutput;
            this.code = code;
            if (code !== 0) {
                const output = `Warning: command "${c.command}" exited with non-zero status code`;
                terminalOutput += output;
                if (options.streamOutput) {
                    process.stderr.write(output);
                }
                this.terminalOutput += terminalOutput;
                // Stop running commands
                break;
            }
        }
    }
    async createProcess(commandConfig, color, cwd, env, usePty = true, streamOutput = true, tty, envFile) {
        // The rust runCommand is always a tty, so it will not look nice in parallel and if we need prefixes
        // currently does not work properly in windows
        if (process.env.NX_NATIVE_COMMAND_RUNNER !== 'false' &&
            !commandConfig.prefix &&
            usePty &&
            pseudo_terminal_1.PseudoTerminal.isSupported()) {
            const pseudoTerminal = (0, pseudo_terminal_1.createPseudoTerminal)();
            registerProcessListener(this, pseudoTerminal);
            return createProcessWithPseudoTty(pseudoTerminal, commandConfig, color, cwd, env, streamOutput, tty, envFile);
        }
        return new RunningNodeProcess(commandConfig, color, cwd, env, [], streamOutput, envFile);
    }
}
exports.SeriallyRunningTasks = SeriallyRunningTasks;
class RunningNodeProcess {
    constructor(commandConfig, color, cwd, env, readyWhenStatus, streamOutput = true, envFile) {
        this.readyWhenStatus = readyWhenStatus;
        this.terminalOutput = '';
        this.exitCallbacks = [];
        this.outputCallbacks = [];
        env = processEnv(color, cwd, env, envFile);
        this.command = commandConfig.command;
        this.terminalOutput = chalk.dim('> ') + commandConfig.command + '\r\n\r\n';
        if (streamOutput) {
            process.stdout.write(this.terminalOutput);
        }
        this.childProcess = (0, child_process_1.exec)(commandConfig.command, {
            maxBuffer: run_commands_impl_1.LARGE_BUFFER,
            env,
            cwd,
            windowsHide: false,
        });
        this.addListeners(commandConfig, streamOutput);
    }
    getResults() {
        return new Promise((res) => {
            this.onExit((code, terminalOutput) => {
                res({ code, terminalOutput });
            });
        });
    }
    onOutput(cb) {
        this.outputCallbacks.push(cb);
    }
    onExit(cb) {
        this.exitCallbacks.push(cb);
    }
    send(message) {
        this.childProcess.send(message);
    }
    kill(signal) {
        return new Promise((res, rej) => {
            treeKill(this.childProcess.pid, signal, (err) => {
                // On Windows, tree-kill (which uses taskkill) may fail when the process or its child process is already terminated.
                // Ignore the errors, otherwise we will log them unnecessarily.
                if (err && process.platform !== 'win32') {
                    rej(err);
                }
                else {
                    res();
                }
            });
        });
    }
    triggerOutputListeners(output) {
        for (const cb of this.outputCallbacks) {
            cb(output);
        }
    }
    addListeners(commandConfig, streamOutput) {
        this.childProcess.stdout.on('data', (data) => {
            const output = addColorAndPrefix(data, commandConfig);
            this.terminalOutput += output;
            this.triggerOutputListeners(output);
            if (streamOutput) {
                process.stdout.write(output);
            }
            if (this.readyWhenStatus.length &&
                isReady(this.readyWhenStatus, data.toString())) {
                for (const cb of this.exitCallbacks) {
                    cb(0, this.terminalOutput);
                }
            }
        });
        this.childProcess.stderr.on('data', (err) => {
            const output = addColorAndPrefix(err, commandConfig);
            this.terminalOutput += output;
            this.triggerOutputListeners(output);
            if (streamOutput) {
                process.stderr.write(output);
            }
            if (this.readyWhenStatus.length &&
                isReady(this.readyWhenStatus, err.toString())) {
                for (const cb of this.exitCallbacks) {
                    cb(1, this.terminalOutput);
                }
            }
        });
        this.childProcess.on('error', (err) => {
            const output = addColorAndPrefix(err.toString(), commandConfig);
            this.terminalOutput += output;
            if (streamOutput) {
                process.stderr.write(output);
            }
            for (const cb of this.exitCallbacks) {
                cb(1, this.terminalOutput);
            }
        });
        this.childProcess.on('exit', (code) => {
            if (!this.readyWhenStatus.length || isReady(this.readyWhenStatus)) {
                for (const cb of this.exitCallbacks) {
                    cb(code, this.terminalOutput);
                }
            }
        });
        // Terminate any task processes on exit
        process.on('exit', () => {
            this.childProcess.kill();
        });
        process.on('SIGINT', () => {
            this.childProcess.kill('SIGTERM');
            // we exit here because we don't need to write anything to cache.
            process.exit((0, exit_codes_1.signalToCode)('SIGINT'));
        });
        process.on('SIGTERM', () => {
            this.childProcess.kill('SIGTERM');
            // no exit here because we expect child processes to terminate which
            // will store results to the cache and will terminate this process
        });
        process.on('SIGHUP', () => {
            this.childProcess.kill('SIGTERM');
            // no exit here because we expect child processes to terminate which
            // will store results to the cache and will terminate this process
        });
    }
}
async function runSingleCommandWithPseudoTerminal(normalized, context) {
    const pseudoTerminal = (0, pseudo_terminal_1.createPseudoTerminal)();
    const pseudoTtyProcess = await createProcessWithPseudoTty(pseudoTerminal, normalized.commands[0], normalized.color, calculateCwd(normalized.cwd, context), normalized.env, normalized.streamOutput, pseudoTerminal ? normalized.isTTY : false, normalized.envFile);
    registerProcessListener(pseudoTtyProcess, pseudoTerminal);
    return pseudoTtyProcess;
}
async function createProcessWithPseudoTty(pseudoTerminal, commandConfig, color, cwd, env, streamOutput = true, tty, envFile) {
    return pseudoTerminal.runCommand(commandConfig.command, {
        cwd,
        jsEnv: processEnv(color, cwd, env, envFile),
        quiet: !streamOutput,
        tty,
    });
}
function addColorAndPrefix(out, config) {
    if (config.prefix) {
        out = out
            .split('\n')
            .map((l) => {
            let prefixText = config.prefix;
            if (config.prefixColor && chalk[config.prefixColor]) {
                prefixText = chalk[config.prefixColor](prefixText);
            }
            prefixText = chalk.bold(prefixText);
            return l.trim().length > 0 ? `${prefixText} ${l}` : l;
        })
            .join('\n');
    }
    if (config.color && chalk[config.color]) {
        out = chalk[config.color](out);
    }
    if (config.bgColor && chalk[config.bgColor]) {
        out = chalk[config.bgColor](out);
    }
    return out;
}
function calculateCwd(cwd, context) {
    if (!cwd)
        return context.root;
    if ((0, path_1.isAbsolute)(cwd))
        return cwd;
    return (0, path_1.join)(context.root, cwd);
}
/**
 * Env variables are processed in the following order:
 * - env option from executor options
 * - env file from envFile option if provided
 * - local env variables
 */
function processEnv(color, cwd, envOptionFromExecutor, envFile) {
    let localEnv = (0, npm_run_path_1.env)({ cwd: cwd ?? process.cwd() });
    localEnv = {
        ...process.env,
        ...localEnv,
    };
    if (process.env.NX_LOAD_DOT_ENV_FILES !== 'false' && envFile) {
        loadEnvVarsFile(envFile, localEnv);
    }
    let res = {
        ...localEnv,
        ...envOptionFromExecutor,
    };
    // need to override PATH to make sure we are using the local node_modules
    if (localEnv.PATH)
        res.PATH = localEnv.PATH; // UNIX-like
    if (localEnv.Path)
        res.Path = localEnv.Path; // Windows
    if (color) {
        res.FORCE_COLOR = `${color}`;
    }
    return res;
}
function isReady(readyWhenStatus = [], data) {
    if (data) {
        for (const readyWhenElement of readyWhenStatus) {
            if (data.toString().indexOf(readyWhenElement.stringToMatch) > -1) {
                readyWhenElement.found = true;
                break;
            }
        }
    }
    return readyWhenStatus.every((readyWhenElement) => readyWhenElement.found);
}
function loadEnvVarsFile(path, env = {}) {
    (0, task_env_1.unloadDotEnvFile)(path, env);
    const result = (0, task_env_1.loadAndExpandDotEnvFile)(path, env);
    if (result.error) {
        throw result.error;
    }
}
let registered = false;
function registerProcessListener(runningTask, pseudoTerminal) {
    if (registered) {
        return;
    }
    registered = true;
    // When the nx process gets a message, it will be sent into the task's process
    process.on('message', (message) => {
        // this.publisher.publish(message.toString());
        if (pseudoTerminal) {
            pseudoTerminal.sendMessageToChildren(message);
        }
        if ('send' in runningTask) {
            runningTask.send(message);
        }
    });
    // Terminate any task processes on exit
    process.on('exit', () => {
        runningTask.kill();
    });
    process.on('SIGINT', () => {
        runningTask.kill('SIGTERM');
        // we exit here because we don't need to write anything to cache.
        process.exit((0, exit_codes_1.signalToCode)('SIGINT'));
    });
    process.on('SIGTERM', () => {
        runningTask.kill('SIGTERM');
        // no exit here because we expect child processes to terminate which
        // will store results to the cache and will terminate this process
    });
    process.on('SIGHUP', () => {
        runningTask.kill('SIGTERM');
        // no exit here because we expect child processes to terminate which
        // will store results to the cache and will terminate this process
    });
}
