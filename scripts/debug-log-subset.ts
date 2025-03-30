import fs from 'fs';
import path from 'path';

async function copyLastLogLines() {
  const projectRoot = path.join(__dirname, '..');
  const debugLogPath = path.join(projectRoot, 'backend', 'src', 'debug.log');
  const subsetLogPath = path.join(projectRoot, 'backend', 'debug-subset.log');
  const linesToCopy = 100;

  try {
    // Check if debug.log exists
    if (!fs.existsSync(debugLogPath)) {
      console.error(`Error: Input file not found at ${debugLogPath}`);
      process.exit(1);
    }

    // Read the debug log file
    const content = await fs.promises.readFile(debugLogPath, 'utf-8');
    const lines = content.split('\n');

    // Get the last N lines (handle files with fewer lines)
    const startLine = Math.max(0, lines.length - linesToCopy);
    // If the last line is empty, we might want to exclude it unless it's the only line
    const relevantLines = lines.slice(startLine, lines.length);
    // Filter out potentially empty last line if file ends with newline and has more than one line
    const lastLines = (lines.length > 1 && lines[lines.length - 1] === '')
        ? relevantLines.slice(0, -1)
        : relevantLines;

    const subsetContent = lastLines.join('\n');

    // Write the subset to the new file
    await fs.promises.writeFile(subsetLogPath, subsetContent, 'utf-8');

    console.log(`Successfully copied the last ${lastLines.length} lines from ${debugLogPath} to ${subsetLogPath}`);

  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

copyLastLogLines();