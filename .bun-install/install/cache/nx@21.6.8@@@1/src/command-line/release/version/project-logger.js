"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectLogger = void 0;
const chalk = require("chalk");
const output_1 = require("../../../utils/output");
const colors = [
    { instance: chalk.green, spinnerColor: 'green' },
    { instance: chalk.greenBright, spinnerColor: 'green' },
    { instance: chalk.red, spinnerColor: 'red' },
    { instance: chalk.redBright, spinnerColor: 'red' },
    { instance: chalk.cyan, spinnerColor: 'cyan' },
    { instance: chalk.cyanBright, spinnerColor: 'cyan' },
    { instance: chalk.yellow, spinnerColor: 'yellow' },
    { instance: chalk.yellowBright, spinnerColor: 'yellow' },
    { instance: chalk.magenta, spinnerColor: 'magenta' },
    { instance: chalk.magentaBright, spinnerColor: 'magenta' },
];
function getColor(projectName) {
    let code = 0;
    for (let i = 0; i < projectName.length; ++i) {
        code += projectName.charCodeAt(i);
    }
    const colorIndex = code % colors.length;
    return colors[colorIndex];
}
class ProjectLogger {
    constructor(projectName) {
        this.projectName = projectName;
        this.logs = [];
        this.color = getColor(projectName);
    }
    buffer(msg) {
        this.logs.push(msg);
    }
    flush() {
        if (this.logs.length === 0) {
            return;
        }
        output_1.output.logSingleLine(`Running release version for project: ${this.color.instance.bold(this.projectName)}`);
        this.logs.forEach((msg) => {
            console.log(this.color.instance.bold(this.projectName) + ' ' + msg);
        });
        this.logs = [];
    }
}
exports.ProjectLogger = ProjectLogger;
