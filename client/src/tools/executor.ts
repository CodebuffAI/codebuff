import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { rgPath } from '@vscode/ripgrep'
import { FileChangeSchema } from 'common/actions'
import { RawToolCall } from 'common/types/tools'
import { applyChanges } from 'common/util/changes'
import { truncateStringWithMessage } from 'common/util/string'
import { green, red } from 'picocolors'

interface UpdateFileParams {
  path: string;
  content: string;
  type: 'patch' | 'file';
}

interface RunTerminalCommandParams {
  command: string;
  process_type?: 'SYNC' | 'BACKGROUND';
  timeout_seconds?: number;
}

interface CodeSearchParams {
  pattern: string;
}

export class ToolExecutor {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async execute(call: RawToolCall): Promise<{
    id: string;
    name: string;
    result: string;
  }> {
    const { name, parameters, id } = call;
    let result: string;

    switch (name) {
      case 'write_file':
      case 'str_replace':
      case 'create_plan': {
        const params = parameters as UpdateFileParams;
        result = await this.handleUpdateFile(params);
        break;
      }

      case 'run_terminal_command': {
        const params = parameters as RunTerminalCommandParams;
        result = await this.handleRunTerminalCommand(params);
        break;
      }

      case 'code_search': {
        const params = parameters as CodeSearchParams;
        result = await this.handleCodeSearch(params);
        break;
      }

      case 'end_turn':
        result = '';
        break;

      default:
        throw new Error(`Unsupported tool: ${name}`);
    }

    return {
      id,
      name,
      result
    };
  }

  private async handleUpdateFile(parameters: UpdateFileParams): Promise<string> {
    const fileChange = FileChangeSchema.parse(parameters);
    const lines = fileChange.content.split('\n');
    const { created, modified, ignored } = applyChanges(this.projectRoot, [fileChange]);
    const result: string[] = [];

    for (const file of created) {
      const counts = `(${green(`+${lines.length}`)})`;
      result.push(`Wrote to ${file} successfully.`);
      console.log(green(`- Created ${file} ${counts}`));
    }

    for (const file of modified) {
      // Calculate added/deleted lines from the diff content
      let addedLines = 0;
      let deletedLines = 0;
      lines.forEach((line) => {
        if (line.startsWith('+')) {
          addedLines++;
        } else if (line.startsWith('-')) {
          deletedLines++;
        }
      });

      const counts = `(${green(`+${addedLines}`)}, ${red(`-${deletedLines}`)})`;
      result.push(`Wrote to ${file} successfully.`);
      console.log(green(`- Updated ${file} ${counts}`));
    }

    for (const file of ignored) {
      result.push(
        `Failed to write to ${file}; file is ignored by .gitignore or .codebuffignore`
      );
    }

    return result.join('\n');
  }

  private async handleRunTerminalCommand(parameters: RunTerminalCommandParams): Promise<string> {
    const {
      command,
      process_type = 'SYNC',
      timeout_seconds = 30
    } = parameters;

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | null = null;

      const childProcess = spawn(command, {
        cwd: this.projectRoot,
        shell: true
      });

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const truncatedStdout = truncateStringWithMessage({
          str: stdout,
          maxLength: 10000
        });
        const truncatedStderr = truncateStringWithMessage({
          str: stderr,
          maxLength: 1000
        });

        resolve(this.formatResult(
          truncatedStdout,
          truncatedStderr,
          'Command completed',
          code
        ));
      });

      childProcess.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(new Error(`Failed to execute command: ${error.message}`));
      });

      if (process_type === 'SYNC' && timeout_seconds > 0) {
        timeoutId = setTimeout(() => {
          childProcess.kill();
          reject(new Error(`Command timed out after ${timeout_seconds} seconds`));
        }, timeout_seconds * 1000);
      }
    });
  }

  private async handleCodeSearch(parameters: CodeSearchParams): Promise<string> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const basename = path.basename(this.projectRoot);
      const pattern = parameters.pattern.replace(/"/g, '');
      const command = `${path.resolve(rgPath)} "${pattern}" .`;
      console.log();
      console.log(green(`Searching ${basename} for "${pattern}":`));
      const childProcess = spawn(command, {
        cwd: this.projectRoot,
        shell: true,
      });

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        const lines = stdout.split('\n').filter((line) => line.trim());
        const maxResults = 3;
        const previewResults = lines.slice(0, maxResults);
        if (previewResults.length > 0) {
          console.log(previewResults.join('\n'));
          if (lines.length > maxResults) {
            console.log('...');
          }
        }
        console.log(green(`Found ${lines.length} results`));

        const truncatedStdout = truncateStringWithMessage({
          str: stdout,
          maxLength: 10000,
        });
        const truncatedStderr = truncateStringWithMessage({
          str: stderr,
          maxLength: 1000,
        });
        resolve(
          this.formatResult(
            truncatedStdout,
            truncatedStderr,
            'Code search completed',
            code
          )
        );
      });

      childProcess.on('error', (error) => {
        resolve(
          `<terminal_command_error>Failed to execute ripgrep: ${error.message}</terminal_command_error>`
        );
      });
    });
  }

  private formatResult(
    stdout: string,
    stderr: string | undefined,
    status: string,
    exitCode: number | null
  ): string {
    let result = '<terminal_command_result>\n';
    result += `<stdout>${stdout}</stdout>\n`;
    if (stderr !== undefined) {
      result += `<stderr>${stderr}</stderr>\n`;
    }
    result += `<status>${status}</status>\n`;
    if (exitCode !== null) {
      result += `<exit_code>${exitCode}</exit_code>\n`;
    }
    result += '</terminal_command_result>';
    return result;
  }
}