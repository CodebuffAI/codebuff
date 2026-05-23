"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTuiTerminalSummaryLifeCycle = getTuiTerminalSummaryLifeCycle;
const node_os_1 = require("node:os");
const output_1 = require("../../utils/output");
const formatting_utils_1 = require("./formatting-utils");
const pretty_time_1 = require("./pretty-time");
const view_logs_utils_1 = require("./view-logs-utils");
const figures = require("figures");
const task_history_life_cycle_1 = require("./task-history-life-cycle");
const task_graph_utils_1 = require("../task-graph-utils");
const LEFT_PAD = `   `;
const SPACER = `  `;
const EXTENDED_LEFT_PAD = `      `;
function getTuiTerminalSummaryLifeCycle({ projectNames, tasks, taskGraph, args, overrides, initiatingProject, initiatingTasks, resolveRenderIsDonePromise, }) {
    const lifeCycle = {};
    const start = process.hrtime();
    const targets = args.targets;
    const totalTasks = tasks.length;
    let totalCachedTasks = 0;
    let totalSuccessfulTasks = 0;
    let totalFailedTasks = 0;
    let totalCompletedTasks = 0;
    let timeTakenText;
    const failedTasks = new Set();
    const inProgressTasks = new Set();
    const stoppedTasks = new Set();
    const tasksToTerminalOutputs = {};
    const tasksToTaskStatus = {};
    const taskIdsInTheOrderTheyStart = [];
    lifeCycle.startTasks = (tasks) => {
        for (let t of tasks) {
            tasksToTerminalOutputs[t.id] ??= '';
            taskIdsInTheOrderTheyStart.push(t.id);
            inProgressTasks.add(t.id);
        }
    };
    lifeCycle.appendTaskOutput = (taskId, output) => {
        tasksToTerminalOutputs[taskId] += output;
    };
    // TODO(@AgentEnder): The following 2 methods should be one but will need more refactoring
    lifeCycle.printTaskTerminalOutput = (task, taskStatus, output) => {
        tasksToTaskStatus[task.id] = taskStatus;
        // Store the complete output for display in the summary
        // This is called with the full output for cached and executed tasks
        if (output) {
            tasksToTerminalOutputs[task.id] = output;
        }
    };
    lifeCycle.setTaskStatus = (taskId, taskStatus) => {
        if (taskStatus === 9 /* NativeTaskStatus.Stopped */) {
            stoppedTasks.add(taskId);
            inProgressTasks.delete(taskId);
        }
    };
    lifeCycle.endTasks = (taskResults) => {
        for (const { task, status } of taskResults) {
            totalCompletedTasks++;
            inProgressTasks.delete(task.id);
            switch (status) {
                case 'remote-cache':
                case 'local-cache':
                case 'local-cache-kept-existing':
                    totalCachedTasks++;
                    totalSuccessfulTasks++;
                    break;
                case 'success':
                    totalSuccessfulTasks++;
                    break;
                case 'failure':
                    totalFailedTasks++;
                    failedTasks.add(task.id);
                    break;
            }
        }
    };
    lifeCycle.endCommand = () => {
        timeTakenText = (0, pretty_time_1.prettyTime)(process.hrtime(start));
        resolveRenderIsDonePromise();
    };
    const printSummary = () => {
        const isRunOne = initiatingProject && targets?.length === 1;
        // Handles when the user interrupts the process
        timeTakenText ??= (0, pretty_time_1.prettyTime)(process.hrtime(start));
        if (totalTasks === 0) {
            console.log(`\n${output_1.output.applyNxPrefix('gray', 'No tasks were run')}\n`);
            return;
        }
        const failure = totalSuccessfulTasks + stoppedTasks.size !== totalTasks;
        const cancelled = 
        // Some tasks were in progress...
        inProgressTasks.size > 0 ||
            // or some tasks had not started yet
            totalTasks !== tasks.length ||
            // the run had a continous task as a leaf...
            // this is needed because continous tasks get marked as stopped when the process is interrupted
            [...(0, task_graph_utils_1.getLeafTasks)(taskGraph)].filter((t) => taskGraph.tasks[t].continuous)
                .length > 0;
        if (isRunOne) {
            printRunOneSummary({
                failure,
                cancelled,
            });
        }
        else {
            printRunManySummary({
                failure,
                cancelled,
            });
        }
        (0, task_history_life_cycle_1.getTasksHistoryLifeCycle)().printFlakyTasksMessage();
    };
    const printRunOneSummary = ({ failure, cancelled, }) => {
        // Prints task outputs in the order they were completed
        // above the summary, since run-one should print all task results.
        for (const taskId of taskIdsInTheOrderTheyStart) {
            const taskStatus = tasksToTaskStatus[taskId];
            const terminalOutput = tasksToTerminalOutputs[taskId];
            output_1.output.logCommandOutput(taskId, taskStatus, terminalOutput);
        }
        // Print vertical separator
        const separatorLines = output_1.output.getVerticalSeparatorLines(failure ? 'red' : 'green');
        for (const line of separatorLines) {
            console.log(line);
        }
        if (!failure && !cancelled) {
            const text = `Successfully ran ${(0, formatting_utils_1.formatTargetsAndProjects)([initiatingProject], targets, tasks)}`;
            // Build success message with color applied to the entire block
            const messageLines = [
                output_1.output.applyNxPrefix('green', output_1.output.colors.green(text) + output_1.output.dim(` (${timeTakenText})`)),
            ];
            const filteredOverrides = Object.entries(overrides).filter(
            // Don't print the data passed through from the version subcommand to the publish executor options, it could be quite large and it's an implementation detail.
            ([flag]) => flag !== 'nxReleaseVersionData');
            if (filteredOverrides.length > 0) {
                messageLines.push('');
                messageLines.push(`${EXTENDED_LEFT_PAD}${output_1.output.dim.green('With additional flags:')}`);
                filteredOverrides
                    .map(([flag, value]) => output_1.output.dim.green((0, formatting_utils_1.formatFlags)(EXTENDED_LEFT_PAD, flag, value)))
                    .forEach((arg) => messageLines.push(arg));
            }
            if (totalCachedTasks > 0) {
                messageLines.push(output_1.output.dim(`${node_os_1.EOL}Nx read the output from the cache instead of running the command for ${totalCachedTasks} out of ${totalTasks} tasks.`));
            }
            // Print the entire success message block with green color
            console.log(output_1.output.colors.green(messageLines.join(node_os_1.EOL)));
        }
        else if (!cancelled) {
            let text = `Ran target ${output_1.output.bold(targets[0])} for project ${output_1.output.bold(initiatingProject)}`;
            if (tasks.length > 1) {
                text += ` and ${output_1.output.bold(tasks.length - 1)} task(s) they depend on`;
            }
            // Build failure message lines
            const messageLines = [
                output_1.output.applyNxPrefix('red', output_1.output.colors.red(text) + output_1.output.dim(` (${timeTakenText})`)),
            ];
            const filteredOverrides = Object.entries(overrides).filter(
            // Don't print the data passed through from the version subcommand to the publish executor options, it could be quite large and it's an implementation detail.
            ([flag]) => flag !== 'nxReleaseVersionData');
            if (filteredOverrides.length > 0) {
                messageLines.push('');
                messageLines.push(`${EXTENDED_LEFT_PAD}${output_1.output.dim.red('With additional flags:')}`);
                filteredOverrides
                    .map(([flag, value]) => output_1.output.dim.red((0, formatting_utils_1.formatFlags)(EXTENDED_LEFT_PAD, flag, value)))
                    .forEach((arg) => messageLines.push(arg));
            }
            messageLines.push('');
            messageLines.push(`${LEFT_PAD}${output_1.output.colors.red(figures.cross)}${SPACER}${totalFailedTasks}${`/${totalCompletedTasks}`} failed`);
            messageLines.push(`${LEFT_PAD}${output_1.output.dim(figures.tick)}${SPACER}${totalSuccessfulTasks}${`/${totalCompletedTasks}`} succeeded ${output_1.output.dim(`[${totalCachedTasks} read from cache]`)}`);
            const viewLogs = (0, view_logs_utils_1.viewLogsFooterRows)(totalFailedTasks);
            messageLines.push(...viewLogs);
            // Print the entire failure message block with red color
            console.log(output_1.output.colors.red(messageLines.join(node_os_1.EOL)));
        }
        else {
            console.log(output_1.output.applyNxPrefix('red', output_1.output.colors.red(`Cancelled running target ${output_1.output.bold(targets[0])} for project ${output_1.output.bold(initiatingProject)}`) + output_1.output.dim(` (${timeTakenText})`)));
        }
        // adds some vertical space after the summary to avoid bunching against terminal
        console.log('');
    };
    const printRunManySummary = ({ failure, cancelled, }) => {
        console.log('');
        // Collect checklist lines to print after task outputs
        const checklistLines = [];
        // First pass: Print task outputs and collect checklist lines
        for (const taskId of taskIdsInTheOrderTheyStart) {
            const taskStatus = tasksToTaskStatus[taskId];
            const terminalOutput = tasksToTerminalOutputs[taskId];
            // Task Status is null?
            if (!taskStatus) {
                output_1.output.logCommandOutput(taskId, taskStatus, terminalOutput);
                output_1.output.addNewline();
                checklistLines.push(`${LEFT_PAD}${output_1.output.colors.cyan(figures.squareSmallFilled)}${SPACER}${output_1.output.colors.gray('nx run ')}${taskId}`);
            }
            else if (taskStatus === 'failure') {
                output_1.output.logCommandOutput(taskId, taskStatus, terminalOutput);
                output_1.output.addNewline();
                checklistLines.push(`${LEFT_PAD}${output_1.output.colors.red(figures.cross)}${SPACER}${output_1.output.colors.gray('nx run ')}${taskId}`);
            }
            else if (taskStatus === 'local-cache') {
                checklistLines.push(`${LEFT_PAD}${output_1.output.colors.green(figures.tick)}${SPACER}${output_1.output.colors.gray('nx run ')}${taskId}  ${output_1.output.dim('[local cache]')}`);
            }
            else if (taskStatus === 'local-cache-kept-existing') {
                checklistLines.push(`${LEFT_PAD}${output_1.output.colors.green(figures.tick)}${SPACER}${output_1.output.colors.gray('nx run ')}${taskId}  ${output_1.output.dim('[existing outputs match the cache, left as is]')}`);
            }
            else if (taskStatus === 'remote-cache') {
                checklistLines.push(`${LEFT_PAD}${output_1.output.colors.green(figures.tick)}${SPACER}${output_1.output.colors.gray('nx run ')}${taskId}  ${output_1.output.dim('[remote cache]')}`);
            }
            else if (taskStatus === 'success') {
                checklistLines.push(`${LEFT_PAD}${output_1.output.colors.green(figures.tick)}${SPACER}${output_1.output.colors.gray('nx run ')}${taskId}`);
            }
            else {
                checklistLines.push(`${LEFT_PAD}${output_1.output.colors.green(figures.tick)}${SPACER}${output_1.output.colors.gray('nx run ')}${taskId}`);
            }
        }
        // Print all checklist lines together
        console.log();
        for (const line of checklistLines) {
            console.log(line);
        }
        // Print vertical separator
        const separatorLines = output_1.output.getVerticalSeparatorLines(failure ? 'red' : 'green');
        for (const line of separatorLines) {
            console.log(line);
        }
        if (totalSuccessfulTasks + stoppedTasks.size === totalTasks) {
            const text = `Successfully ran ${(0, formatting_utils_1.formatTargetsAndProjects)(projectNames, targets, tasks)}`;
            const successSummaryRows = [
                output_1.output.applyNxPrefix('green', output_1.output.colors.green(text) + output_1.output.dim.white(` (${timeTakenText})`)),
            ];
            const filteredOverrides = Object.entries(overrides).filter(
            // Don't print the data passed through from the version subcommand to the publish executor options, it could be quite large and it's an implementation detail.
            ([flag]) => flag !== 'nxReleaseVersionData');
            if (filteredOverrides.length > 0) {
                successSummaryRows.push('');
                successSummaryRows.push(`${EXTENDED_LEFT_PAD}${output_1.output.dim.green('With additional flags:')}`);
                filteredOverrides
                    .map(([flag, value]) => output_1.output.dim.green((0, formatting_utils_1.formatFlags)(EXTENDED_LEFT_PAD, flag, value)))
                    .forEach((arg) => successSummaryRows.push(arg));
            }
            if (totalCachedTasks > 0) {
                successSummaryRows.push(output_1.output.dim(`${node_os_1.EOL}Nx read the output from the cache instead of running the command for ${totalCachedTasks} out of ${totalTasks} tasks.`));
            }
            console.log(successSummaryRows.join(node_os_1.EOL));
        }
        else {
            const text = `${cancelled ? 'Cancelled while running' : 'Ran'} ${(0, formatting_utils_1.formatTargetsAndProjects)(projectNames, targets, tasks)}`;
            const failureSummaryRows = [
                output_1.output.applyNxPrefix('red', output_1.output.colors.red(text) + output_1.output.dim.white(` (${timeTakenText})`)),
            ];
            const filteredOverrides = Object.entries(overrides).filter(
            // Don't print the data passed through from the version subcommand to the publish executor options, it could be quite large and it's an implementation detail.
            ([flag]) => flag !== 'nxReleaseVersionData');
            if (filteredOverrides.length > 0) {
                failureSummaryRows.push('');
                failureSummaryRows.push(`${EXTENDED_LEFT_PAD}${output_1.output.dim.red('With additional flags:')}`);
                filteredOverrides
                    .map(([flag, value]) => output_1.output.dim.red((0, formatting_utils_1.formatFlags)(EXTENDED_LEFT_PAD, flag, value)))
                    .forEach((arg) => failureSummaryRows.push(arg));
            }
            failureSummaryRows.push('');
            if (totalCompletedTasks > 0) {
                if (totalSuccessfulTasks > 0) {
                    failureSummaryRows.push(output_1.output.dim(`${LEFT_PAD}${output_1.output.dim(figures.tick)}${SPACER}${totalSuccessfulTasks}${`/${totalCompletedTasks}`} succeeded ${output_1.output.dim(`[${totalCachedTasks} read from cache]`)}`), '');
                }
                if (totalFailedTasks > 0) {
                    const numFailedToPrint = 5;
                    const failedTasksForPrinting = Array.from(failedTasks).slice(0, numFailedToPrint);
                    failureSummaryRows.push(`${LEFT_PAD}${output_1.output.colors.red(figures.cross)}${SPACER}${totalFailedTasks}${`/${totalCompletedTasks}`} targets failed, including the following:`, '', `${failedTasksForPrinting
                        .map((t) => `${EXTENDED_LEFT_PAD}${output_1.output.colors.red('-')} ${output_1.output.formatCommand(t.toString())}`)
                        .join('\n')}`, '');
                    if (failedTasks.size > numFailedToPrint) {
                        failureSummaryRows.push(output_1.output.dim(`${EXTENDED_LEFT_PAD}...and ${failedTasks.size - numFailedToPrint} more...`));
                    }
                }
                if (totalCompletedTasks !== totalTasks) {
                    const remainingTasks = totalTasks - totalCompletedTasks;
                    if (inProgressTasks.size) {
                        failureSummaryRows.push(`${LEFT_PAD}${output_1.output.colors.red(figures.ellipsis)}${SPACER}${inProgressTasks.size}${`/${totalTasks}`} targets were in progress, including the following:`, '', `${Array.from(inProgressTasks)
                            .map((t) => `${EXTENDED_LEFT_PAD}${output_1.output.colors.red('-')} ${output_1.output.formatCommand(t.toString())}`)
                            .join(node_os_1.EOL)}`, '');
                    }
                    if (remainingTasks - inProgressTasks.size > 0) {
                        failureSummaryRows.push(output_1.output.dim(`${LEFT_PAD}${output_1.output.colors.red(figures.ellipsis)}${SPACER}${remainingTasks - inProgressTasks.size}${`/${totalTasks}`} targets had not started.`), '');
                    }
                }
                failureSummaryRows.push(...(0, view_logs_utils_1.viewLogsFooterRows)(failedTasks.size));
            }
            console.log(output_1.output.colors.red(failureSummaryRows.join(node_os_1.EOL)));
        }
        // adds some vertical space after the summary to avoid bunching against terminal
        console.log('');
    };
    return { lifeCycle: lifeCycle, printSummary };
}
