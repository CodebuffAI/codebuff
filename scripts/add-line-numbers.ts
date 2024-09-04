import * as fs from 'fs';
import * as readline from 'readline';

async function addLineNumbers(inputFile: string, outputFile: string): Promise<void> {
    const readStream = fs.createReadStream(inputFile);
    const writeStream = fs.createWriteStream(outputFile);
    
    const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity
    });

    let lineNumber = 1;

    for await (const line of rl) {
        writeStream.write(`${lineNumber} ${line}\n`);
        lineNumber++;
    }

    writeStream.end();
    console.log(`Line numbers added. Output written to ${outputFile}`);
}

function main() {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error('Usage: ts-node script.ts input_file output_file');
        process.exit(1);
    }

    const [inputFile, outputFile] = args;
    addLineNumbers(inputFile, outputFile).catch(error => {
        console.error('An error occurred:', error);
        process.exit(1);
    });
}

main();