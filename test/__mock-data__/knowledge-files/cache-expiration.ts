import { FileChange, Message } from 'common/src/actions'
import { ProjectFileContext } from 'common/src/util/file'

export const mockFileContext: ProjectFileContext = {
  currentWorkingDirectory: 'Users/me/Documents/manicode',
  files: {
    'npm-app/src/web-scraper.ts':
      "import { PlaywrightCrawler } from 'crawlee'\nimport * as cheerio from 'cheerio'\n\n// Global cache for scraped web pages\nconst scrapedPagesCache: Record<string, { content: string; timestamp: number }> = {}\n\n// Cache expiration time (in milliseconds)\nconst CACHE_EXPIRATION = 4 * 60 * 60 * 1000 // 4 hours\n\nexport async function scrapeWebPage(url: string) {\n  const now = Date.now()\n  const cachedData = scrapedPagesCache[url]\n\n  // Check if the page is already in the cache and not expired\n  if (cachedData && now - cachedData.timestamp < CACHE_EXPIRATION) {\n    return cachedData.content\n  }\n\n  try {\n    let content = ''\n    const crawler = new PlaywrightCrawler({\n      async requestHandler({ page }) {\n        content = await page.content()\n      },\n    })\n\n    await crawler.run([url])\n\n    const $ = cheerio.load(content)\n\n    // Extract the main content (you may need to adjust this selector based on the target websites)\n    const extractedContent = $('body').text()\n\n    // Store the scraped content in the cache with the current timestamp\n    scrapedPagesCache[url] = { content: extractedContent, timestamp: now }\n\n    return extractedContent\n  } catch (error) {\n    // console.error(\n    //   `Error scraping web page ${url}:`,\n    //   error instanceof Error ? error.message : error\n    // )\n    scrapedPagesCache[url] = { content: '', timestamp: now }\n    return ''\n  }\n}\n\nexport function parseUrlsFromContent(content: string): string[] {\n  const urlRegex = /https?:\\/\\/[^\\s]+/g\n  return content.match(urlRegex) || []\n}\n\nexport async function getScrapedContentBlocks(urls: string[]) {\n  const blocks: string[] = []\n  for (const url of urls) {\n    const scrapedContent = await scrapeWebPage(url)\n    if (scrapedContent) {\n      blocks.push(\n        `<web_scraped_content url=\"${url}\">\\n${scrapedContent}\\n</web_scraped_content>`\n      )\n    }\n  }\n  return blocks\n}\n",
    'npm-app/package.json':
      '{\n  "name": "manicode",\n  "version": "1.0.61",\n  "description": "AI dev assistant",\n  "license": "MIT",\n  "main": "dist/index.js",\n  "types": "dist/index.d.ts",\n  "bin": {\n    "manicode": "dist/index.js"\n  },\n  "scripts": {\n    "prebuild": "bun clean && cd ../common && bun run build",\n    "build": "tsc && tsc-alias",\n    "postbuild": "mkdir -p dist/common && cp -r ../common/dist/* dist/common && tsc-alias",\n    "clean": "rm -rf dist && (rm tsconfig.tsbuildinfo || true)",\n    "prepublishOnly": "bun run build && bun run clean-package.js",\n    "postpublish": "echo \\"const fs=require(\'fs\');fs.copyFileSync(\'temp.package.json\',\'package.json\');fs.unlinkSync(\'temp.package.json\');\\" | bun run -",\n    "format": "prettier --write \\"**/*.{ts,tsx,json,md}\\"",\n    "start-js": "bun run dist/index.js ..",\n    "start": "ts-node src/index.ts ..",\n    "start-manifold": "ts-node src/index.ts ../../manifold",\n    "start-litestar": "ts-node src/index.ts ../test/__mock-projects__/litestar",\n    "start-jpcsp": "ts-node src/index.ts ../test/__mock-projects__/jpcsp",\n    "start-vscode": "ts-node src/index.ts ../test/__mock-projects__/vscode",\n    "start-nushell": "ts-node src/index.ts ../test/__mock-projects__/nushell",\n    "start-prod": "NODE_ENV=production ts-node src/index.ts",\n    "ssh": "gcloud compute ssh manicode-backend --zone=us-east4-a"\n  },\n  "files": [\n    "dist",\n    "README.md"\n  ],\n  "dependencies": {\n    "@types/diff": "5.2.1",\n    "axios": "1.7.4",\n    "cheerio": "1.0.0",\n    "crawlee": "3.11.3",\n    "diff": "5.2.0",\n    "ignore": "5.3.2",\n    "lodash": "*",\n    "nanoid": "5.0.7",\n    "picocolors": "1.1.0",\n    "systeminformation": "5.23.4",\n    "tree-sitter": "0.21.1",\n    "tree-sitter-c": "0.23.0",\n    "tree-sitter-c-sharp": "0.23.0",\n    "tree-sitter-cpp": "0.23.0",\n    "tree-sitter-go": "0.23.1",\n    "tree-sitter-java": "0.23.2",\n    "tree-sitter-javascript": "0.23.0",\n    "tree-sitter-php": "0.23.2",\n    "tree-sitter-python": "0.23.2",\n    "tree-sitter-ruby": "0.23.0",\n    "tree-sitter-rust": "0.23.0",\n    "tree-sitter-typescript": "0.23.0",\n    "ts-pattern": "^5.3.1",\n    "ws": "8.18.0",\n    "zod": "3.23.8"\n  },\n  "devDependencies": {\n    "@types/lodash": "^4.17.7",\n    "@types/node": "^22.1.0",\n    "@types/systeminformation": "^3.54.1",\n    "@types/ws": "^8.2.0",\n    "typescript": "5.5.4"\n  },\n  "peerDependencies": {\n    "@types/lodash": "*",\n    "@types/node": "*",\n    "typescript": "*"\n  }\n}\n',
    'npm-app/src/tool-handlers.ts':
      "import { spawn } from 'child_process'\nimport path from 'path'\nimport { green } from 'picocolors'\n\nimport { scrapeWebPage } from './web-scraper'\nimport { searchManifoldMarkets } from './manifold-api'\nimport {\n  getCurrentWorkingDirectory,\n  setCurrentWorkingDirectory,\n} from './project-files'\n\nexport type ToolHandler = (input: any, id: string) => Promise<string>\n\nexport const handleUpdateFileContext: ToolHandler = async (\n  input: { prompt: string },\n  id: string\n) => {\n  return ''\n}\n\nexport const handleScrapeWebPage: ToolHandler = async (\n  input: { url: string },\n  id: string\n) => {\n  const { url } = input\n  const content = await scrapeWebPage(url)\n  if (!content) {\n    return `<web_scraping_error url=\"${url}\">Failed to scrape the web page.</web_scraping_error>`\n  }\n  return `<web_scraped_content url=\"${url}\">${content}</web_scraped_content>`\n}\n\nexport const handleSearchManifoldMarkets: ToolHandler = async (\n  input: { query: string; limit?: number },\n  id: string\n) => {\n  const { query, limit = 5 } = input\n  try {\n    const markets = await searchManifoldMarkets(query, limit)\n    return JSON.stringify(markets)\n  } catch (error) {\n    const message = error instanceof Error ? error.message : error\n    return `<manifold_search_error>Failed to search Manifold markets: ${message}</manifold_search_error>`\n  }\n}\n\nexport const handleRunTerminalCommand = async (\n  input: { command: string },\n  id: string,\n  mode: 'user' | 'assistant'\n): Promise<string> => {\n  const { command } = input\n  return new Promise((resolve) => {\n    let stdout = ''\n    let stderr = ''\n    const MAX_EXECUTION_TIME = 10_000\n\n    if (mode === 'assistant') {\n      console.log()\n      console.log(green(`> ${command}`))\n    }\n    const childProcess = spawn(command, {\n      shell: true,\n      cwd: getCurrentWorkingDirectory(),\n    })\n\n    const timer = setTimeout(() => {\n      if (mode === 'assistant') {\n        childProcess.kill()\n        resolve(\n          formatResult(\n            stdout,\n            stderr,\n            `Command timed out after ${MAX_EXECUTION_TIME / 1000} seconds. Partial results shown.`\n          )\n        )\n      }\n    }, MAX_EXECUTION_TIME)\n\n    childProcess.stdout.on('data', (data) => {\n      process.stdout.write(data.toString())\n      stdout += data.toString()\n    })\n\n    childProcess.stderr.on('data', (data) => {\n      const dataStr = data.toString()\n      if (\n        mode === 'user' &&\n        (dataStr.includes('command not found') ||\n          dataStr.includes('syntax error') ||\n          dataStr.includes(\n            'is not recognized as an internal or external command'\n          ))\n      ) {\n        resolve('command not found')\n      } else {\n        process.stderr.write(data.toString())\n        stderr += data.toString()\n      }\n    })\n\n    childProcess.on('close', (code) => {\n      if (command.startsWith('cd ') && code === 0) {\n        const newWorkingDirectory = command.split(' ')[1]\n        setCurrentWorkingDirectory(\n          path.join(getCurrentWorkingDirectory(), newWorkingDirectory)\n        )\n      }\n\n      clearTimeout(timer)\n      resolve(formatResult(stdout, stderr, 'Command completed', code))\n      if (mode === 'assistant') {\n        console.log(green(`Command finished with exit code: ${code}`))\n      }\n    })\n\n    childProcess.on('error', (error) => {\n      clearTimeout(timer)\n      resolve(\n        `<terminal_command_error>Failed to execute command: ${error.message}</terminal_command_error>`\n      )\n    })\n  })\n}\n\nfunction formatResult(\n  stdout: string,\n  stderr: string,\n  status?: string,\n  exitCode?: number | null\n): string {\n  let result = '<terminal_command_result>\\n'\n  result += `<stdout>${stdout}</stdout>\\n`\n  result += `<stderr>${stderr}</stderr>\\n`\n  if (status !== undefined) {\n    result += `<status>${status}</status>\\n`\n  }\n  if (exitCode !== undefined && exitCode !== null) {\n    result += `<exit_code>${exitCode}</exit_code>\\n`\n  }\n  result += '</terminal_command_result>'\n  return result\n}\n\nexport const toolHandlers: Record<string, ToolHandler> = {\n  update_file_context: handleUpdateFileContext,\n  scrape_web_page: handleScrapeWebPage,\n  search_manifold_markets: handleSearchManifoldMarkets,\n  run_terminal_command: ((input, id) =>\n    handleRunTerminalCommand(input, id, 'assistant')) as ToolHandler,\n}\n",
    'npm-app/src/project-files.ts':
      "import fs from 'fs'\nimport path from 'path'\nimport { exec } from 'child_process'\nimport { promisify } from 'util'\nimport { createPatch } from 'diff'\n\nimport { createFileBlock, ProjectFileContext } from 'common/util/file'\nimport { filterObject } from 'common/util/object'\nimport { parseUrlsFromContent, getScrapedContentBlocks } from './web-scraper'\nimport { getProjectFileTree, getAllFilePaths } from 'common/project-file-tree'\nimport { getFileTokenScores } from 'common/codemap/parse'\n\nconst execAsync = promisify(exec)\n\nlet projectRoot: string\n\nexport function initProjectRoot(dir: string | undefined) {\n  projectRoot = path.resolve(dir || getCurrentDirectory())\n  return projectRoot\n}\n\nlet currentWorkingDirectory: string = ''\n\nexport function getCurrentWorkingDirectory(): string {\n  return currentWorkingDirectory || getProjectRoot()\n}\n\nexport function setCurrentWorkingDirectory(directory: string) {\n  currentWorkingDirectory = directory\n}\n\nfunction getCurrentDirectory() {\n  try {\n    return process.cwd()\n  } catch (error) {\n    throw new Error(\n      'Failed to get current working directory. Is this directory deleted?',\n      { cause: error }\n    )\n  }\n}\n\nexport function getProjectRoot() {\n  return projectRoot\n}\n\nlet cachedProjectFileContext: ProjectFileContext | undefined\n\nexport const getProjectFileContext = async (\n  fileList: string[],\n  lastFileVersion: Record<string, string>\n) => {\n  const root = getProjectRoot()\n  const cwd = getCurrentWorkingDirectory()\n\n  const contextRoot = path.relative(root, cwd).startsWith('..') ? cwd : root\n\n  const files = getFiles(fileList)\n  const gitChanges = await getGitChanges()\n  const changesSinceLastChat = getChangesSinceLastFileVersion(lastFileVersion)\n  const updatedProps = {\n    files,\n    gitChanges,\n    changesSinceLastChat,\n  }\n\n  if (\n    !cachedProjectFileContext ||\n    cachedProjectFileContext.currentWorkingDirectory !== contextRoot\n  ) {\n    const fileTree = getProjectFileTree(contextRoot)\n    const knowledgeFilePaths = getAllFilePaths(fileTree).filter((filePath) =>\n      filePath.endsWith('knowledge.md')\n    )\n    const knowledgeFiles =\n      await getExistingFilesWithScrapedContent(knowledgeFilePaths)\n\n    const allFilePaths = getAllFilePaths(fileTree)\n    const fileTokenScores = await getFileTokenScores(contextRoot, allFilePaths)\n\n    cachedProjectFileContext = {\n      currentWorkingDirectory: contextRoot,\n      fileTree,\n      fileTokenScores,\n      knowledgeFiles,\n      ...updatedProps,\n    }\n  } else {\n    cachedProjectFileContext = {\n      ...cachedProjectFileContext,\n      ...updatedProps,\n    }\n  }\n\n  return cachedProjectFileContext\n}\n\nasync function getGitChanges() {\n  try {\n    const { stdout: status } = await execAsync('git status', {\n      cwd: projectRoot,\n    })\n    const { stdout: diff } = await execAsync('git diff', { cwd: projectRoot })\n    const { stdout: diffCached } = await execAsync('git diff --cached', {\n      cwd: projectRoot,\n    })\n    const { stdout: shortLogOutput } = await execAsync(\n      'git shortlog HEAD~10..HEAD',\n      {\n        cwd: projectRoot,\n      }\n    )\n    const shortLogLines = shortLogOutput.trim().split('\\n')\n    const lastCommitMessages = shortLogLines\n      .slice(1)\n      .reverse()\n      .map((line) => line.trim())\n      .join('\\n')\n\n    return { status, diff, diffCached, lastCommitMessages }\n  } catch (error) {\n    return { status: '', diff: '', diffCached: '', lastCommitMessages: '' }\n  }\n}\n\nexport function getChangesSinceLastFileVersion(\n  lastFileVersion: Record<string, string>\n) {\n  const changes = Object.entries(lastFileVersion)\n    .map(([filePath, file]) => {\n      const fullFilePath = path.join(getProjectRoot(), filePath)\n      try {\n        const currentContent = fs.readFileSync(fullFilePath, 'utf8')\n        if (currentContent === file) {\n          return [filePath, null] as const\n        }\n        return [filePath, createPatch(filePath, file, currentContent)] as const\n      } catch (error) {\n        // console.error(`Error reading file ${fullFilePath}:`, error)\n        return [filePath, null] as const\n      }\n    })\n    .filter(([_, diff]) => diff !== null) as [string, string][]\n  return Object.fromEntries(changes)\n}\n\nexport function getFiles(filePaths: string[]) {\n  const result: Record<string, string | null> = {}\n  for (const filePath of filePaths) {\n    const fullPath = path.join(projectRoot, filePath)\n    try {\n      const content = fs.readFileSync(fullPath, 'utf8')\n      result[filePath] = content\n    } catch (error) {\n      result[filePath] = null\n    }\n  }\n  return result\n}\n\nexport function getExistingFiles(filePaths: string[]) {\n  return filterObject(getFiles(filePaths), (value) => value !== null) as Record<\n    string,\n    string\n  >\n}\n\nexport async function getExistingFilesWithScrapedContent(\n  filePaths: string[]\n): Promise<Record<string, string>> {\n  const files = getExistingFiles(filePaths)\n  const result: Record<string, string> = {}\n\n  for (const [filePath, content] of Object.entries(files)) {\n    result[filePath] = content\n\n    if (filePath.endsWith('knowledge.md')) {\n      const scrapedBlocks = await getScrapedContentBlocks(\n        parseUrlsFromContent(content)\n      )\n      for (const block of scrapedBlocks) {\n        result[filePath] += `\\n\\n${block}`\n      }\n    }\n  }\n\n  return result\n}\n\nexport function setFiles(files: Record<string, string>) {\n  for (const [filePath, content] of Object.entries(files)) {\n    const fullPath = path.join(projectRoot, filePath)\n    fs.writeFileSync(fullPath, content, 'utf8')\n  }\n}\n\nexport function getFileBlocks(filePaths: string[]) {\n  const result: Record<string, string> = {}\n\n  for (const filePath of filePaths) {\n    const fullPath = path.join(projectRoot, filePath)\n    try {\n      const content = fs.readFileSync(fullPath, 'utf8')\n      result[filePath] = content\n    } catch (error) {\n      const fileDoesNotExist =\n        error instanceof Error &&\n        error.message.includes('no such file or directory')\n\n      result[filePath] = fileDoesNotExist\n        ? '[FILE_DOES_NOT_EXIST]'\n        : '[FILE_READ_ERROR]'\n\n      if (!fileDoesNotExist) {\n        console.error(\n          `Error reading file ${fullPath}:`,\n          error instanceof Error ? error.message : error\n        )\n      }\n    }\n  }\n\n  const fileBlocks = filePaths.map((filePath) =>\n    createFileBlock(filePath, result[filePath])\n  )\n\n  return fileBlocks.join('\\n')\n}\n\n/*\nfunction getExportedTokensForFiles(\n  filePaths: string[]\n): Record<string, string[]> {\n  const result: Record<string, string[]> = {}\n  const fullFilePaths = filePaths.map((filePath) =>\n    path.join(projectRoot, filePath)\n  )\n  const program = ts.createProgram(fullFilePaths, {})\n\n  for (let i = 0; i < filePaths.length; i++) {\n    const filePath = filePaths[i]\n    const fullFilePath = fullFilePaths[i]\n    const sourceFile = program.getSourceFile(fullFilePath)\n    if (sourceFile) {\n      try {\n        const exportedTokens = getExportedTokens(sourceFile)\n        result[filePath] = exportedTokens\n      } catch (error) {\n        console.error(`Error processing file ${fullFilePath}:`, error)\n        result[filePath] = []\n      }\n    } else {\n      // console.error(`Could not find source file: ${fullFilePath}`)\n      result[filePath] = []\n    }\n  }\n\n  return result\n}\n\nfunction getExportedTokens(sourceFile: ts.SourceFile): string[] {\n  const exportedTokens: string[] = []\n\n  function visit(node: ts.Node) {\n    if (ts.isExportDeclaration(node)) {\n      if (node.exportClause && ts.isNamedExports(node.exportClause)) {\n        node.exportClause.elements.forEach((element) => {\n          exportedTokens.push(element.name.text)\n        })\n      }\n    } else if (\n      ts.isFunctionDeclaration(node) ||\n      ts.isClassDeclaration(node) ||\n      ts.isVariableStatement(node)\n    ) {\n      if (\n        node.modifiers?.some(\n          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword\n        )\n      ) {\n        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {\n          if (node.name) {\n            exportedTokens.push(node.name.text)\n          }\n        } else if (ts.isVariableStatement(node)) {\n          node.declarationList.declarations.forEach((declaration) => {\n            if (ts.isIdentifier(declaration.name)) {\n              exportedTokens.push(declaration.name.text)\n            }\n          })\n        }\n      }\n    }\n\n    ts.forEachChild(node, visit)\n  }\n\n  visit(sourceFile)\n\n  return exportedTokens\n}\n*/\n\nexport const deleteFile = (fullPath: string): boolean => {\n  try {\n    if (fs.existsSync(fullPath)) {\n      fs.unlinkSync(fullPath)\n      return true\n    }\n    return false\n  } catch (error) {\n    console.error(`Error deleting file ${fullPath}:`, error)\n    return false\n  }\n}\n",
    'backend/src/generate-diffs-prompt.ts':
      "import { createFileBlock, parseFileBlocks } from 'common/util/file'\nimport { Message } from 'common/actions'\nimport { debugLog } from './util/debug'\nimport { STOP_MARKER } from 'common/constants'\nimport { promptOpenAIWithContinuation } from './openai-api'\n\nexport async function generateExpandedFileWithDiffBlocks(\n  userId: string,\n  messageHistory: Message[],\n  fullResponse: string,\n  filePath: string,\n  oldContent: string,\n  newContent: string\n) {\n  const diffBlocks = await generateDiffBlocks(\n    userId,\n    messageHistory,\n    fullResponse,\n    filePath,\n    oldContent,\n    newContent\n  )\n\n  let updatedContent = oldContent\n\n  const changes: { filePath: string; old: string; new: string }[] = []\n  for (const { searchContent, replaceContent } of diffBlocks) {\n    if (updatedContent.includes(searchContent)) {\n      updatedContent = updatedContent.replace(searchContent, replaceContent)\n      changes.push({ filePath, old: searchContent, new: replaceContent })\n\n      debugLog('Replacement worked with exact match')\n      console.log('Applied a change to', filePath)\n      debugLog(`Applied a change to ${filePath}:`, {\n        old: searchContent,\n        new: replaceContent,\n      })\n    } else {\n      debugLog('Failed to find a match for replacement in', filePath)\n      debugLog('Old content:', oldContent)\n      debugLog('New content:', newContent)\n    }\n  }\n\n  if (changes.length === 0) {\n    debugLog(`No changes applied to file: ${filePath}`)\n  } else {\n    debugLog(`Updated file: ${filePath}`)\n  }\n  return updatedContent\n}\n\nexport async function generateDiffBlocks(\n  userId: string,\n  messageHistory: Message[],\n  fullResponse: string,\n  filePath: string,\n  oldContent: string,\n  newContent: string\n) {\n  const logMessage = `Generating diff blocks for ${filePath}`\n  console.log(logMessage)\n  debugLog(logMessage)\n  debugLog('Old content:', oldContent)\n  debugLog('New content:', newContent)\n\n  const prompt = `\nThe following is a conversation with a user leading up to your task:\n  \n<message_history>${messageHistory.map((msg) => `<${msg.role}>${msg.content}</${msg.role}>`).join('\\n')}</message_history>\n\n<assistant_message_partial_response>${fullResponse}</assistant_message_partial_response>\n  \nYour task: I have a new version of a file with placeholder comments like \"// ... existing code ...\" or \"# ... existing code ...\", and I want to change the old file into the expanded new file without the placeholder comments.\n\nConsider the intent of the user: if only one function or code block is shown, don't delete everything else that was not shown.\n  \nI need to generate <search> and <replace> blocks to represent the exact line-by-line differences so I can string replace the old content to the new content.\n\nExample of how to represent a single change with <search> and <replace> blocks:\n${createFileBlock(\n  filePath,\n  `<search>\nimport { Button } from './Button'\n</search>\n<replace>\nimport { FancyButton } from './FancyButton'\n</replace>`\n)}\n\nIf there are multiple changes, provide multiple pairs of search and replace blocks within the file block.\n\nThe provided new file may use shorthand such as \"// ... existing code ...\" to indicate unchanged code. However, we do not want to include these in your <search> or <replace> blocks, because we want to replace the exact lines of code that are being changed.\n\nPlease structure your response in a few steps:\n\n1. Describe what code changes are being made. What's being inserted? What's being deleted?\n2. Split the changes into logical groups. List the sets of lines or logical chunks of code that are being changed and assign each a letter. For example:\nA. modifying the import section\nB. modifying a function\n3. For each edit (denoted by a letter), describe what lines of context from the old file you will use, so that string replacement of the search and replace blocks will work correctly. Do not use any comments like \"// ... existing code ...\" as part of this context, because these comments don't exist in the old file, so string replacement won't work to make the edit.\nThen write out one line of code from the old file that would start each of these lines of context in the <search> block.\n4. Analyze the indentation used in the old file. Is it using spaces or tabs? How many spaces are used for each indentation level?\nFor each edit assigned a letter, please list how many indentation levels are used in the first line being modified in the old file. It's important to match be able to match the indention in the old file. For example:\nA. 0 levels of indentation for the function in the old file\nB. 1 level of indentation for the variable in the old file\n5. Finally, please provide a ${'<' + 'file>'} block containing the <search> and <replace> blocks for each chunk of line changes. Find the smallest possible blocks that match the changes uniquely.\n\nIMPORTANT INSTRUCTIONS:\n1. The <search> blocks MUST match a portion of the old file content EXACTLY, character for character, including indentation and empty lines. Do not include any comments or placeholders like \"// ... existing code ...\" in the <search> blocks. Instead, provide the exact lines of code that are being changed.\n2. Ensure that you're providing enough context in the <search> blocks to match exactly one location in the file.\n3. The <search> blocks should have as few lines as possible while still providing enough context for a single match. Try to match only a few lines around the change.\n4. The <replace> blocks should contain the updated code that replaces the content in the corresponding <search> block, maintaining the same indentation style and level as the original file. <replace> blocks should also not include comments like \"// ... existing code ...\".\n5. Create separate <search> and <replace> blocks for each distinct change in the file.\n6. Pay close attention to the indentation of both the <search> and <replace> blocks. They should match the indentation style and level of the original file exactly.\n7. If the new content contains comments about edits that should be made, you should remove those. E.g. Remove comments like \"// Add these new functions at the top of the file\"\n\n<example_prompt>\nOld file content:\n${createFileBlock(\n  'components/login-form.tsx',\n  `import React from 'react'\nimport { Button } from './Button'\nimport { Input } from './Input'\n\nexport function LoginForm() {\n  return (\n    <form>\n      <Input type=\"email\" placeholder=\"Email\" />\n      <Input type=\"password\" placeholder=\"Password\" />\n      <Button>Log In</Button>\n    </form>\n  )\n}\n\nexport default LoginForm`\n)}\n\nNew file content (with placeholders):\n${createFileBlock(\n  'components/login-form.tsx',\n  `// ... existing code ...\nimport { useForm } from 'react-hook-form'\n\nfunction LoginForm() {\n  const { register, handleSubmit } = useForm()\n\n  const onSubmit = (data) => {\n    console.log(data)\n  }\n\n  return (\n    <form onSubmit={handleSubmit(onSubmit)}>\n      <Input type=\"email\" placeholder=\"Email\" {...register('email')} />\n      <Input type=\"password\" placeholder=\"Password\" {...register('password')} />\n      <Button type=\"submit\">Log In</Button>\n    </form>\n  )\n}`\n)}\n</example_prompt>\n\n<example_response>\n1. The user is adding a new import and changing the form to use react-hook-form.\n\n2. The changes can be split into two logical groups:\nA. Adding a new import\nB. Modifying the LoginForm component\n\n3. Context for each edit:\nA. We'll use the line importing Input as context for the new import:\n\\`import { Input } from './Input'\\`\n\nB. We'll replace the entire LoginForm function (first line below):\n\\`function LoginForm() {\\`\n\n4. It's using 2 spaces for indentation.\nA. 0 levels of indentation for the import in old file\nB. 0 levels of indentation for the LoginForm function in old file\n\n5. Here are the <search> and <replace> blocks:\n\n${createFileBlock(\n  filePath,\n  `A. <search>\nimport { Input } from './Input'\n</search>\n<replace>\nimport { Input } from './Input'\nimport { useForm } from 'react-hook-form'\n</replace>\n\nB. <search>\nexport function LoginForm() {\n  return (\n    <form>\n      <Input type=\"email\" placeholder=\"Email\" />\n      <Input type=\"password\" placeholder=\"Password\" />\n      <Button>Log In</Button>\n    </form>\n  )\n}\n</search>\n<replace>\nexport function LoginForm() {\n  const { register, handleSubmit } = useForm()\n\n  const onSubmit = (data) => {\n    console.log(data)\n  }\n\n  return (\n    <form onSubmit={handleSubmit(onSubmit)}>\n      <Input type=\"email\" placeholder=\"Email\" {...register('email')} />\n      <Input type=\"password\" placeholder=\"Password\" {...register('password')} />\n      <Button type=\"submit\">Log In</Button>\n    </form>\n  )\n}\n</replace>`\n)}\n</example_response>\n\n<example_prompt>\nOld file content:\n${createFileBlock(\n  'components/desktop-nav.tsx',\n  `import React from 'react'\nimport { SearchIcon } from '@heroicons/react/solid'\nimport {\n  GlobeAltIcon,\n  UserIcon,\n  LightningBoltIcon,\n  UserAddIcon,\n  BellIcon,\n} from '@heroicons/react/outline'\nimport { buildArray } from '../utils/buildArray'\n\nconst getDesktopNav = (\n  loggedIn: boolean,\n  openDownloadApp: () => void,\n  options: { isNewUser: boolean; isLiveTV?: boolean; isAdminOrMod: boolean }\n) => {\n  if (loggedIn)\n    return buildArray(\n      { name: 'Browse', href: '/home', icon: SearchIcon },\n      {\n        name: 'Explore',\n        href: '/explore',\n        icon: GlobeAltIcon,\n      },\n      {\n        name: 'Live Activity',\n        href: '/live-activity',\n        icon: LightningBoltIcon,\n      },\n      {\n        name: 'Notifications',\n        href: '/notifications',\n        icon: BellIcon,\n      },\n      {\n        name: 'Profile',\n        href: '/profile',\n        icon: UserIcon,\n      }\n    )\n\n  return buildArray(\n    { name: 'Browse', href: '/home', icon: SearchIcon },\n    { name: 'Sign Up', href: '/sign-up', icon: UserAddIcon }\n  )\n}\n\nconst getMobileNav = () => {\n  return buildArray(\n    { name: 'Browse', href: '/home', icon: SearchIcon },\n    { name: 'Sign Up', href: '/sign-up', icon: UserAddIcon }\n  )\n}`\n)}\n\nNew file content (with placeholders):\n${createFileBlock(\n  'components/desktop-nav.tsx',\n  `// ... existing code ...\nimport { SearchIcon } from '@heroicons/react/solid'\nimport {\n  GlobeAltIcon,\n  UserIcon,\n  LightningBoltIcon,\n  UserAddIcon,\n  NotificationsIcon,\n} from '@heroicons/react/outline'\n\n// ... existing code ...\n\nconst getDesktopNav = (\n  loggedIn: boolean,\n  openDownloadApp: () => void,\n  options: { isNewUser: boolean; isLiveTV?: boolean; isAdminOrMod: boolean }\n) => {\n  if (loggedIn)\n    return buildArray(\n      { name: 'Browse', href: '/home', icon: SearchIcon },\n      {\n        name: 'Explore',\n        href: '/explore',\n        icon: GlobeAltIcon,\n      },\n      {\n        name: 'Live Activity',\n        href: '/live-activity',\n        icon: LightningBoltIcon,\n      },\n      {\n        name: 'Notifications',\n        href: '/notifications',\n        icon: NotificationsIcon,\n      },\n\n      // ... existing code ...\n    )\n\n  // ... existing code ...\n}\n\n// ... existing code ...`\n)}\n</example_prompt>\n\n<example_response>\n1. The code changes involve updating the import for the notification icon and changing the icon used in the getDesktopNav function.\n\n2. The changes can be split into two logical groups:\nA. Modifying the import statement\nB. Updating the icon in the getDesktopNav function\n\n3. Context for each edit:\nA. We'll use the entire import statement for @heroicons/react/outline as context:\n\\`import {\n  GlobeAltIcon,\n  UserIcon,\n  LightningBoltIcon,\n  UserAddIcon,\n  BellIcon,\n} from '@heroicons/react/outline'\\`\n\nB. We'll use the Notifications item in the buildArray function as context:\n\\`{\n  name: 'Notifications',\n  href: '/notifications',\n  icon: BellIcon,\n}\\`\n\n4. The file is using 2 spaces for indentation.\nA. 0 levels of indentation for the import statement in old file\nB. 3 levels of indentation (6 spaces) for the Notifications item in old file\n\n5. Here are the <search> and <replace> blocks:\n\n${createFileBlock(\n  filePath,\n  `A. <search>\nimport {\n  GlobeAltIcon,\n  UserIcon,\n  LightningBoltIcon,\n  UserAddIcon,\n  BellIcon,\n} from '@heroicons/react/outline'\n</search>\n<replace>\nimport {\n  GlobeAltIcon,\n  UserIcon,\n  LightningBoltIcon,\n  UserAddIcon,\n  NotificationsIcon,\n} from '@heroicons/react/outline'\n</replace>\n\nB. <search>\n      {\n        name: 'Notifications',\n        href: '/notifications',\n        icon: BellIcon,\n      },\n</search>\n<replace>\n      {\n        name: 'Notifications',\n        href: '/notifications',\n        icon: NotificationsIcon,\n      },\n</replace>`\n)}\n</example_response>\n\n<important_instruction>\nNotice that your responses should not include any comments like \"// ... existing code ...\". It should only include the actual code that should be string replaced.\n\nThat is because we are using a very simple string replacement system to update the old code to the new code:\n\n\\`\\`\\`\nfunction applyReplacement(\n  content: string,\n  searchContent: string,\n  replaceContent: string\n): string | null {\n  const trimmedSearchContent = searchContent.trim()\n  const trimmedReplaceContent = replaceContent.trim()\n\n  if (content.includes(trimmedSearchContent)) {\n    // Search content must match a substring of content exactly.\n    return content.replace(trimmedSearchContent, trimmedReplaceContent)\n  }\n\n  return null\n}\n\\`\\`\\`\n</important_instruction>\n\nNow, here is the prompt.\n\nOld file content:\n${createFileBlock(filePath, oldContent)}\n\nNew file content (with placeholders):\n${createFileBlock(filePath, newContent)}\n\nYour Response:`\n\n  // fs.writeFileSync('./diff-prompt.txt', prompt)\n\n  // const { response } = await promptClaudeWithContinuation(\n  //   [{ role: 'user', content: prompt }],\n  //   { userId }\n  // )\n  const response = await promptOpenAIWithContinuation(\n    [{ role: 'user', content: prompt }],\n    { model: 'gpt-4o-2024-08-06', userId }\n  )\n\n  debugLog('OpenAI response for diff blocks:', response)\n\n  const { diffBlocks, diffBlocksThatDidntMatch } = parseAndGetDiffBlocks(\n    response,\n    filePath,\n    oldContent\n  )\n  for (const change of diffBlocksThatDidntMatch) {\n    console.log('diff block didnt match', filePath)\n    debugLog('Warning: diff block didnt match', filePath)\n  }\n  if (diffBlocks.length === 0 && diffBlocksThatDidntMatch.length === 0) {\n    console.log('No diff blocks generated', filePath)\n    debugLog('Warning: No diff blocks generated', filePath)\n  } else if (diffBlocksThatDidntMatch.length > 0) {\n    const newPrompt =\n      `The assistant failed to find a match for the following changes in the file ${filePath}. Please help the assistant understand what the changes should be.\n\nHere is the previous prompt that the assistant was given:\n<prompt>\n${prompt}\n</prompt>\n\nThe assistant generated the following <search> and <replace> blocks where the <search> content did not match the old file contents:\n\n${diffBlocksThatDidntMatch.map((change) => `<search>${change.searchContent}</search>\\n<replace>${change.replaceContent}</replace>`).join('\\n\\n')}\n\nIt also generated these <search> and <replace> blocks which were able to be applied to the old file content:\n\n${diffBlocks.map((change) => `<search>${change.searchContent}</search>\\n<replace>${change.replaceContent}</replace>`).join('\\n\\n')}\n\nYou should:\n1. Use <thinking> blocks to explain what might have gone wrong in the result of the last prompt.\n2. Within a <strategy> block, provide a new strategy to cover all the changes from the old file to the new file. List each intended edit that will become a <search> and <replace> block. Note that comments such as \"// ... existing code ...\" or \"// ... rest of the file\" should not be included in the <search> or <replace> blocks.\n3. Provide the complete set of <search> and <replace> changes within a <file path=\"${filePath}\"></file> block to make the intended edit from the old file to the new file.\n\nPlease make sure to end your response with the following string:\n${STOP_MARKER}\n`.trim()\n    console.log('Trying a second prompt for getDiffBlocks', filePath)\n    debugLog('Trying a second prompt for getDiffBlocks', filePath)\n    const response = await promptOpenAIWithContinuation(\n      [{ role: 'user', content: newPrompt }],\n      { userId, model: 'gpt-4o-2024-08-06' }\n    )\n    debugLog('Second Claude response for diff blocks:', response)\n\n    const {\n      diffBlocks: newDiffBlocks,\n      diffBlocksThatDidntMatch: newDiffBlocksThatDidntMatch,\n    } = parseAndGetDiffBlocks(response, filePath, oldContent)\n    for (const change of newDiffBlocksThatDidntMatch) {\n      console.log('Still found new diff block didnt match', filePath)\n      debugLog('Warning: Still found new diff block didnt match', filePath)\n    }\n    return newDiffBlocks\n  }\n\n  return diffBlocks\n}\n\nconst parseAndGetDiffBlocks = (\n  response: string,\n  filePath: string,\n  oldFileContent: string\n) => {\n  const diffBlocksThatDidntMatch: {\n    searchContent: string\n    replaceContent: string\n  }[] = []\n  const diffBlocks: { searchContent: string; replaceContent: string }[] = []\n  const files = parseFileBlocks(response)\n  for (const fileContent of Object.values(files)) {\n    const blockRegex =\n      /<search>([\\s\\S]*?)<\\/search>\\s*<replace>([\\s\\S]*?)<\\/replace>/g\n    let blockMatch\n\n    while ((blockMatch = blockRegex.exec(fileContent)) !== null) {\n      const change = {\n        searchContent: removeNewlinesFromStartAndEnd(blockMatch[1]),\n        replaceContent: removeNewlinesFromStartAndEnd(blockMatch[2]),\n      }\n\n      if (oldFileContent.includes(change.searchContent)) {\n        diffBlocks.push(change)\n      } else {\n        const newChange = tryToDoStringReplacementWithExtraIndentation(\n          oldFileContent,\n          change.searchContent,\n          change.replaceContent\n        )\n        if (newChange) {\n          console.log('Matched with indentation modification')\n          debugLog('Matched with indentation modification')\n          diffBlocks.push(newChange)\n        } else {\n          diffBlocksThatDidntMatch.push(change)\n        }\n      }\n    }\n  }\n  return {\n    diffBlocks,\n    diffBlocksThatDidntMatch,\n  }\n}\n\nconst tryToDoStringReplacementWithExtraIndentation = (\n  oldFileContent: string,\n  searchContent: string,\n  replaceContent: string\n) => {\n  for (let i = 1; i <= 12; i++) {\n    const searchContentWithIndentation = searchContent\n      .split('\\n')\n      .map((line) => (line ? ' '.repeat(i) + line : line))\n      .join('\\n')\n    if (oldFileContent.includes(searchContentWithIndentation)) {\n      return {\n        searchContent: searchContentWithIndentation,\n        replaceContent: replaceContent\n          .split('\\n')\n          .map((line) => (line ? ' '.repeat(i) + line : line))\n          .join('\\n'),\n      }\n    }\n  }\n  for (let i = 1; i <= 6; i++) {\n    const searchContentWithIndentation = searchContent\n      .split('\\n')\n      .map((line) => (line ? '\\t'.repeat(i) + line : line))\n      .join('\\n')\n    if (oldFileContent.includes(searchContentWithIndentation)) {\n      return {\n        searchContent: searchContentWithIndentation,\n        replaceContent: replaceContent\n          .split('\\n')\n          .map((line) => (line ? '\\t'.repeat(i) + line : line))\n          .join('\\n'),\n      }\n    }\n  }\n  return null\n}\n\nconst removeNewlinesFromStartAndEnd = (content: string): string => {\n  return content.replace(/^\\n+|\\n+$/g, '')\n}\n",
    'backend/src/generate-diffs-via-expansion.ts':
      "import { debugLog } from './util/debug'\nimport { Message } from 'common/actions'\nimport { createFileBlock } from 'common/util/file'\nimport { promptOpenAI } from './openai-api'\n\nexport async function expandNewContent(\n  userId: string,\n  oldContent: string,\n  newContent: string,\n  filePath: string,\n  messageHistory: Message[],\n  fullResponse: string\n): Promise<string> {\n  const prompt = `\nThe following is a conversation with a user leading up to your task:\n  \n<message_history>${messageHistory.map((msg) => `<${msg.role}>${msg.content}</${msg.role}>`).join('\\n')}</message_history>\n\n<assistant_message_partial_response>${fullResponse}</assistant_message_partial_response>\n\nYour task: You are an expert programmer tasked with expanding a shortened version of a file into its full content. The shortened file to be expanded will be provided at the end of this message. This shortened version uses comments like \"// ... existing code ...\" or \"# ... rest of the function ...\" or \"// keep existing code ...\" to indicate unchanged sections. Your task is to replace these comments with the actual code from the old version of the file.\n\nConsider the intent of the user: if only one function or code block is shown, don't delete everything else that was not shown.\n\nYour response should follow the following format:\nA. Please discuss the changes in the new file content compared to the old file content in a <discussion> block.\n\nB. In a <sections-to-expand> block, please list the comments that should be expanded and where they are. If there are none, please say that the new content is already expanded.\n\nC1. If there are no comments to expand, write: ${createFileBlock(filePath, '[ALREADY_EXPANDED]')}\n\nC2. Otherwise, in a <file> block, please expand each comment listed in <sections-to-expand> with the appropriate code from the old file to create the full expanded content of the new file.\nThis requires you to compose the resulting file with exact lines from the old file and new file only. You are just copying whole lines character for character. Maintain the exact indentation and formatting of both the old and new content. Do not add any extra comments or explanations.\n\nOutput the full content of the new file within a <file> block, using the provided file path as an attribute.\n\nIf comments are being added that describe the change that is being made, such as \"# Add this import\" or \"// Add this function\" or \"// Update this log\", then please ommit these lines from the new file.\n\nHere are four examples to illustrate the task:\n\nExample 1 (Simple change):\n\n<example>\nOld file content:\n${createFileBlock(\n  'example1.ts',\n  `import React from 'react'\n\nconst Button = () => {\n  return <button>Click me</button>\n}\n`\n)}\n\nNew file content (with placeholders):\n${createFileBlock(\n  'example1.ts',\n  `import React from 'react'\n\nconst FunButton = () => {\n  return <button>Fun Button</button>\n}\n`\n)}\n\nExpected response:\nA. <discussion>\nThe changes in this file include:\n1. Renaming the component from 'Button' to 'FunButton'.\n2. Changing the button text from 'Click me' to 'Fun Button'.\n</discussion>\n\nB. <sections-to-expand>\nThere's nothing to expand from the new content. It is already expanded.\n</sections-to-expand>\n\nC. ${createFileBlock('example1.ts', `[ALREADY_EXPANDED]`)}\n</example>\n\nExample 2 (Partial change with existing code):\n\n<example>\nOld file content:\n${createFileBlock(\n  'example2.ts',\n  `import * as fs from 'fs'\nimport * as path from 'path'\nimport * as readline from 'readline'\nimport { ProjectFileContext } from 'common/util/file'\nimport {\n  applyChanges,\n  getProjectFileContext,\n  getFileBlocks,\n  getFiles,\n} from './project-files'\nimport { APIRealtimeClient } from 'common/websockets/websocket-client'\nimport { Message } from 'common/actions'\nimport { STOP_MARKER } from 'common/constants'\nimport { ChatStorage } from './chat-storage'\n\nconst displayMenu = () => {\n  console.clear()\n  console.log('Chat History:')\n  const chats = chatStorage.listChats()\n  const totalItems = chats.length + 1 // +1 for the \"New Chat\" option\n  const startIndex = menuOffset\n  const endIndex = Math.min(startIndex + CHATS_PER_PAGE, totalItems)\n\n  for (let i = startIndex; i < endIndex; i++) {\n    if (i < chats.length) {\n      const chat = chats[i]\n      const isSelected = i === menuSelectedIndex\n      const marker = isSelected ? '>' : ' '\n      console.log(\\`\\${marker} \\${chat.id} (\\${new Date(chat.updatedAt).toLocaleString()})\\`)\n    } else {\n      const isSelected = i === menuSelectedIndex\n      const marker = isSelected ? '>' : ' '\n      console.log(\\`\\${marker} \\${NEW_CHAT_OPTION}\\`)\n    }\n  }\n\n  if (totalItems > CHATS_PER_PAGE) {\n    console.log(\\`\\nShowing \\${startIndex + 1}-\\${endIndex} of \\${totalItems} items\\`)\n  }\n\n  console.log('\\nUse arrow keys to navigate, SPACE to select, ESC to exit')\n}\n\nconst resetMenu = () => {\n  chatStorage.clear()\n  menuSelectedIndex = 0\n  menuOffset = 0\n}\n`\n)}\n\nNew file content (with placeholders):\n${createFileBlock(\n  'example2.ts',\n  `// ... existing code ...\n\nconst displayMenu = () => {\n  console.clear()\n  console.log('Chat History:')\n  const chats = chatStorage.listChats()\n  const totalChats = chats.length\n\n  if (totalChats === 0) {\n    console.log('No chats available.')\n    console.log(\\`\\n\\${NEW_CHAT_OPTION}\\`)\n    return\n  }\n\n  const visibleRange = 5 // Total number of chats to display (2 on each side + 1 selected)\n  const halfRange = Math.floor(visibleRange / 2)\n\n  let startIndex = Math.max(0, menuSelectedIndex - halfRange)\n  let endIndex = Math.min(totalChats - 1, startIndex + visibleRange - 1)\n\n  // Adjust startIndex if we're near the end of the list\n  if (endIndex - startIndex < visibleRange - 1) {\n    startIndex = Math.max(0, endIndex - visibleRange + 1)\n  }\n\n  if (startIndex > 0) {\n    console.log('...')\n  }\n\n  for (let i = startIndex; i <= endIndex; i++) {\n    const chat = chats[i]\n    const isSelected = i === menuSelectedIndex\n    const marker = isSelected ? '>' : ' '\n    console.log(\\`\\${marker} \\${chat.id} (\\${new Date(chat.updatedAt).toLocaleString()})\\`)\n  }\n\n  if (endIndex < totalChats - 1) {\n    console.log('...')\n  }\n\n  console.log(\\`\\n\\${NEW_CHAT_OPTION}\\`)\n  console.log('\\nUse arrow keys to navigate, SPACE to select, ESC to exit')\n}\n\n// ... existing code ...\n`\n)}\n\nExpected response:\nA. <discussion>\nThe changes in this file include:\n1. Updating the displayMenu function to handle empty chat lists and improve the display of chat history\n2. Implementing a new scrolling mechanism for the chat list\n3. Removing the CHATS_PER_PAGE and totalItems variables\n4. Adding checks for empty chat lists and displaying appropriate messages\n</discussion>\n\nB. <sections-to-expand>\n1. Before the \\`const displayMenu\\` function, there's the comment \"// ... existing code ...\" which should be replaced and expanded.\n2. After the \\`const displayMenu\\` function, there's the comment \"// ... existing code ...\" which should be replaced and expanded.\n</sections-to-expand>\n\nC. ${createFileBlock(\n    'example2.ts',\n    `import * as fs from 'fs'\nimport * as path from 'path'\nimport * as readline from 'readline'\nimport { ProjectFileContext } from 'common/util/file'\nimport {\n  applyChanges,\n  getProjectFileContext,\n  getFileBlocks,\n  getFiles,\n} from './project-files'\nimport { APIRealtimeClient } from 'common/websockets/websocket-client'\nimport { Message } from 'common/actions'\nimport { STOP_MARKER } from 'common/constants'\nimport { ChatStorage } from './chat-storage'\n\nconst displayMenu = () => {\n  console.clear()\n  console.log('Chat History:')\n  const chats = chatStorage.listChats()\n  const totalChats = chats.length\n\n  if (totalChats === 0) {\n    console.log('No chats available.')\n    console.log(\\`\\n\\${NEW_CHAT_OPTION}\\`)\n    return\n  }\n\n  const visibleRange = 5 // Total number of chats to display (2 on each side + 1 selected)\n  const halfRange = Math.floor(visibleRange / 2)\n\n  let startIndex = Math.max(0, menuSelectedIndex - halfRange)\n  let endIndex = Math.min(totalChats - 1, startIndex + visibleRange - 1)\n\n  // Adjust startIndex if we're near the end of the list\n  if (endIndex - startIndex < visibleRange - 1) {\n    startIndex = Math.max(0, endIndex - visibleRange + 1)\n  }\n\n  if (startIndex > 0) {\n    console.log('...')\n  }\n\n  for (let i = startIndex; i <= endIndex; i++) {\n    const chat = chats[i]\n    const isSelected = i === menuSelectedIndex\n    const marker = isSelected ? '>' : ' '\n    console.log(\\`\\${marker} \\${chat.id} (\\${new Date(chat.updatedAt).toLocaleString()})\\`)\n  }\n\n  if (endIndex < totalChats - 1) {\n    console.log('...')\n  }\n\n  console.log(\\`\\n\\${NEW_CHAT_OPTION}\\`)\n  console.log('\\nUse arrow keys to navigate, SPACE to select, ESC to exit')\n}\n\nconst resetMenu = () => {\n  chatStorage.clear()\n  menuSelectedIndex = 0\n  menuOffset = 0\n}\n`\n  )}\n</example>\n\nExample 3 (Complex changes throughout the file):\n\n<example>\nOld file content:\n${createFileBlock(\n  'src/UserProfile.tsx',\n  `import React, { useState } from 'react';\nimport { User } from './types';\n\nconst UserProfile: React.FC<{ user: User }> = ({ user }) => {\n  const [isEditing, setIsEditing] = useState(false);\n\n  const handleEdit = () => {\n    setIsEditing(true);\n  };\n\n  const handleSave = () => {\n    // TODO: Implement save functionality\n    setIsEditing(false);\n  };\n\n  return (\n    <div className=\"user-profile\">\n      <h2>{user.name}</h2>\n      <p>Email: {user.email}</p>\n      <p>Age: {user.age}</p>\n      {isEditing ? (\n        <button onClick={handleSave}>Save</button>\n      ) : (\n        <button onClick={handleEdit}>Edit</button>\n      )}\n    </div>\n  );\n};\n\nexport default UserProfile;\n`\n)}\n\nNew file content:\n${createFileBlock(\n  'src/UserProfile.tsx',\n  `import React, { useState, useEffect } from 'react';\nimport { User, Address } from './types';\nimport { fetchUserAddress } from './api';\n\ninterface UserProfileProps {\n  user: User;\n  onUpdate: (updatedUser: User) => void; // Add this prop\n}\n\nconst UserProfile: React.FC<UserProfileProps> = ({ user, onUpdate }) => {\n  const [isEditing, setIsEditing] = useState(false);\n  const [editedUser, setEditedUser] = useState(user);\n  const [address, setAddress] = useState<Address | null>(null);\n\n  useEffect(() => {\n    const loadAddress = async () => {\n      const userAddress = await fetchUserAddress(user.id);\n      setAddress(userAddress);\n    };\n    loadAddress();\n  }, [user.id]);\n\n  const handleEdit = () => {\n    setIsEditing(true);\n  };\n\n  const handleSave = () => {\n    onUpdate(editedUser);\n    setIsEditing(false);\n  };\n\n  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {\n    const { name, value } = e.target;\n    setEditedUser(prev => ({ ...prev, [name]: value }));\n  };\n\n  return (\n    <div className=\"user-profile\">\n      <h2>{isEditing ? 'Edit Profile' : user.name}</h2>\n      {isEditing ? (\n        <>\n          <input\n            name=\"name\"\n            value={editedUser.name}\n            onChange={handleChange}\n          />\n          <input\n            name=\"email\"\n            value={editedUser.email}\n            onChange={handleChange}\n          />\n          <input\n            name=\"age\"\n            type=\"number\"\n            value={editedUser.age}\n            onChange={handleChange}\n          />\n        </>\n      ) : (\n        <>\n          <p>Email: {user.email}</p>\n          <p>Age: {user.age}</p>\n          {address && (\n            <p>Address: {address.street}, {address.city}, {address.country}</p>\n          )}\n        </>\n      )}\n      {isEditing ? (\n        <button onClick={handleSave}>Save</button>\n      ) : (\n        <button onClick={handleEdit}>Edit</button>\n      )}\n    </div>\n  );\n};\n\nexport default UserProfile;\n`\n)}\n\nExpected response:\nA. <discussion>\nThe changes in this file include:\n1. Adding import for useEffect and updating imports from './types' and './api'.\n2. Defining a new UserProfileProps interface with user and onUpdate props.\n3. Adding state for editedUser and address using useState.\n4. Implementing useEffect to fetch and set the user's address.\n5. Updating handleSave to use the onUpdate prop.\n6. Adding a new handleChange function for form input changes.\n7. Modifying the JSX to include editable inputs when in editing mode.\n8. Adding display for the user's address when not in editing mode.\n9. Updating type annotations and adding proper event handling.\n</discussion>\n\nB. <sections-to-expand>\nThere's nothing to expand from the new content. It is already expanded.\n</sections-to-expand>\n\nC. ${createFileBlock('src/UserProfile.tsx', '[ALREADY_EXPANDED]')}\n</example>\n\nExample 4 (Complex changes with multiple existing code comments):\n\n<example>\nOld file content:\n${createFileBlock(\n  'src/TaskManager.tsx',\n  `import React, { useState, useEffect } from 'react';\nimport { Task, User } from './types';\nimport { fetchTasks, updateTask } from './api';\n\ninterface TaskManagerProps {\n  user: User;\n}\n\nconst TaskManager: React.FC<TaskManagerProps> = ({ user }) => {\n  const [tasks, setTasks] = useState<Task[]>([]);\n  const [loading, setLoading] = useState(true);\n\n  useEffect(() => {\n    const loadTasks = async () => {\n      const userTasks = await fetchTasks(user.id);\n      setTasks(userTasks);\n      setLoading(false);\n    };\n    loadTasks();\n  }, [user.id]);\n\n  const handleTaskCompletion = async (taskId: string, completed: boolean) => {\n    const updatedTask = await updateTask(taskId, { completed });\n    setTasks(tasks.map(task => task.id === taskId ? updatedTask : task));\n  };\n\n  if (loading) {\n    return <div>Loading tasks...</div>;\n  }\n\n  return (\n    <div className=\"task-manager\">\n      <h2>{user.name}'s Tasks</h2>\n      <ul>\n        {tasks.map(task => (\n          <li key={task.id}>\n            <input\n              type=\"checkbox\"\n              checked={task.completed}\n              onChange={(e) => handleTaskCompletion(task.id, e.target.checked)}\n            />\n            {task.title}\n          </li>\n        ))}\n      </ul>\n    </div>\n  );\n};\n\nexport default TaskManager;\n`\n)}\n\nNew file content (with placeholders):\n${createFileBlock(\n  'src/TaskManager.tsx',\n  `import React, { useState, useEffect } from 'react';\nimport { Task, User, Priority } from './types';\nimport { fetchTasks, updateTask, createTask } from './api'; // Update this import\n\n// ... existing code ...\n\nconst TaskManager: React.FC<TaskManagerProps> = ({ user }) => {\n  const [tasks, setTasks] = useState<Task[]>([]);\n  const [loading, setLoading] = useState(true);\n  const [newTaskTitle, setNewTaskTitle] = useState('');\n  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');\n\n  // ... existing code ...\n\n  const handleTaskCompletion = async (taskId: string, completed: boolean) => {\n    // ... rest of the function ...\n  };\n\n  const handleCreateTask = async () => {\n    if (newTaskTitle.trim()) {\n      const newTask = await createTask({\n        userId: user.id,\n        title: newTaskTitle,\n        completed: false,\n        priority: Priority.Medium,\n      });\n      setTasks([...tasks, newTask]);\n      setNewTaskTitle('');\n    }\n  };\n\n  const filteredTasks = tasks.filter(task => {\n    if (filter === 'active') return !task.completed;\n    if (filter === 'completed') return task.completed;\n    return true;\n  });\n\n  if (loading) {\n    return <div>Loading tasks...</div>;\n  }\n\n  return (\n    <div className=\"task-manager\">\n      <h2>{user.name}'s Tasks</h2>\n      <div>\n        <input\n          type=\"text\"\n          value={newTaskTitle}\n          onChange={(e) => setNewTaskTitle(e.target.value)}\n          placeholder=\"New task title\"\n        />\n        <button onClick={handleCreateTask}>Add Task</button>\n      </div>\n      <div>\n        <button onClick={() => setFilter('all')}>All</button>\n        <button onClick={() => setFilter('active')}>Active</button>\n        <button onClick={() => setFilter('completed')}>Completed</button>\n      </div>\n      <ul>\n        {filteredTasks.map(task => (\n          <li key={task.id}>\n            <input\n              type=\"checkbox\"\n              checked={task.completed}\n              onChange={(e) => handleTaskCompletion(task.id, e.target.checked)}\n            />\n            {task.title} - Priority: {task.priority}\n          </li>\n        ))}\n      </ul>\n    </div>\n  );\n};\n\n// ... rest of the file ...\n`\n)}\n\nExpected response:\nA. <discussion>\nThe changes in this file include:\n1. Adding Priority to the imports from './types'.\n2. Adding createTask to the imports from './api'.\n3. Adding new state variables for newTaskTitle and filter.\n4. Implementing a new handleCreateTask function for adding new tasks.\n5. Adding a filteredTasks constant to filter tasks based on the current filter state.\n6. Updating the JSX to include:\n   - An input field and button for creating new tasks\n   - Buttons for filtering tasks\n   - Displaying the task priority in the list\n7. Modifying the task list to use filteredTasks instead of all tasks.\n</discussion>\n\nB. <sections-to-expand>\n1. At the beginning of the file, there's a comment \"// ... existing code ...\" which should be expanded.\n2. Inside the TaskManager component, there's a comment \"// ... existing code ...\" which should be expanded.\n3. Inside the handleTaskCompletion function, there's a comment \"// ... rest of the function ...\" which should be expanded.\n4. At the end of the file, there's a comment \"// ... rest of the file ...\" which should be expanded.\n</sections-to-expand>\n\nC. ${createFileBlock(\n    'src/TaskManager.tsx',\n    `import React, { useState, useEffect } from 'react';\nimport { Task, User, Priority } from './types';\nimport { fetchTasks, updateTask, createTask } from './api';\n\ninterface TaskManagerProps {\n  user: User;\n}\n\nconst TaskManager: React.FC<TaskManagerProps> = ({ user }) => {\n  const [tasks, setTasks] = useState<Task[]>([]);\n  const [loading, setLoading] = useState(true);\n  const [newTaskTitle, setNewTaskTitle] = useState('');\n  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');\n\n  useEffect(() => {\n    const loadTasks = async () => {\n      const userTasks = await fetchTasks(user.id);\n      setTasks(userTasks);\n      setLoading(false);\n    };\n    loadTasks();\n  }, [user.id]);\n\n  const handleTaskCompletion = async (taskId: string, completed: boolean) => {\n    const updatedTask = await updateTask(taskId, { completed });\n    setTasks(tasks.map(task => task.id === taskId ? updatedTask : task));\n  };\n\n  const handleCreateTask = async () => {\n    if (newTaskTitle.trim()) {\n      const newTask = await createTask({\n        userId: user.id,\n        title: newTaskTitle,\n        completed: false,\n        priority: Priority.Medium,\n      });\n      setTasks([...tasks, newTask]);\n      setNewTaskTitle('');\n    }\n  };\n\n  const filteredTasks = tasks.filter(task => {\n    if (filter === 'active') return !task.completed;\n    if (filter === 'completed') return task.completed;\n    return true;\n  });\n\n  if (loading) {\n    return <div>Loading tasks...</div>;\n  }\n\n  return (\n    <div className=\"task-manager\">\n      <h2>{user.name}'s Tasks</h2>\n      <div>\n        <input\n          type=\"text\"\n          value={newTaskTitle}\n          onChange={(e) => setNewTaskTitle(e.target.value)}\n          placeholder=\"New task title\"\n        />\n        <button onClick={handleCreateTask}>Add Task</button>\n      </div>\n      <div>\n        <button onClick={() => setFilter('all')}>All</button>\n        <button onClick={() => setFilter('active')}>Active</button>\n        <button onClick={() => setFilter('completed')}>Completed</button>\n      </div>\n      <ul>\n        {filteredTasks.map(task => (\n          <li key={task.id}>\n            <input\n              type=\"checkbox\"\n              checked={task.completed}\n              onChange={(e) => handleTaskCompletion(task.id, e.target.checked)}\n            />\n            {task.title} - Priority: {task.priority}\n          </li>\n        ))}\n      </ul>\n    </div>\n  );\n};\n\nexport default TaskManager;\n`\n  )}\n</example>\n\nNow, please provide your response for the following old and new file contents, following the format shown in the examples above.\n\nOld file content:\n${createFileBlock(filePath, oldContent)}\n\nNew file content (with placeholders):\n${createFileBlock(filePath, newContent)}\n`.trim()\n  const expandedContentResponse = await promptOpenAI(\n    userId,\n    [\n      {\n        role: 'user',\n        content: prompt,\n      },\n    ],\n    'gpt-4o-2024-08-06'\n  )\n\n  debugLog('New file (unexpanded) for filePath', filePath, newContent)\n  debugLog(\n    'Expanded content response for filePath',\n    filePath,\n    expandedContentResponse\n  )\n\n  // Extract the content from the <file> block\n  const fileContentMatch = expandedContentResponse.match(\n    /<file[^>]*>([\\s\\S]*)<\\/file>/\n  )\n  if (fileContentMatch) {\n    const content = fileContentMatch[1].trim()\n    if (content === '[ALREADY_EXPANDED]') {\n      return newContent\n    }\n    return content + '\\n'\n  } else {\n    console.error(\n      'Failed to extract file content from expanded content response'\n    )\n    debugLog('!Failed to extract file content from expanded content response!')\n    return oldContent\n  }\n}\n",
    'npm-app/src/config.ts':
      "import { calculateFingerprint } from './fingerprint'\n\nconst isProduction = process.env.NODE_ENV === 'production'\nexport const websocketUrl = isProduction\n  ? 'ws://api.manicode.ai:4242/ws'\n  : 'ws://localhost:4242/ws'\n\nexport let fingerprintId: string\nexport const initFingerprint = async () => {\n  fingerprintId = await calculateFingerprint()\n  return fingerprintId\n}\n",
    'test/__mock-data__/app/expected.ts':
      "import { hrtime } from 'node:process'\nimport * as cors from 'cors'\nimport * as crypto from 'crypto'\nimport * as express from 'express'\nimport { ErrorRequestHandler, RequestHandler } from 'express'\n\nimport { log, metrics } from 'shared/utils'\nimport { withMonitoringContext } from 'shared/monitoring/context'\nimport { APIError, pathWithPrefix } from 'common/api/utils'\nimport { health } from './health'\nimport { updateMe } from './update-me'\nimport { placeBet } from './place-bet'\nimport { cancelBet } from './cancel-bet'\nimport { sellShares } from './sell-shares'\nimport { claimmanalink } from './claim-manalink'\nimport { createMarket } from './create-market'\nimport { createComment } from './create-comment'\nimport { creategroup } from './create-group'\nimport { resolveMarket } from './resolve-market'\nimport { closeMarket } from './close-market'\nimport { unsubscribe } from './unsubscribe'\nimport { stripewebhook, createcheckoutsession } from './stripe-endpoints'\nimport { getMe } from './get-me'\nimport { saveTwitchCredentials } from './save-twitch-credentials'\nimport { addLiquidity } from './add-liquidity'\nimport { validateiap } from './validate-iap'\nimport { markallnotifications } from './mark-all-notifications'\nimport { updatememberrole } from './update-group-member-role'\nimport { updategroupprivacy } from './update-group-privacy'\nimport { registerdiscordid } from './register-discord-id'\nimport { getuserisgroupmember } from './get-user-is-group-member'\nimport { completequest } from './complete-quest'\nimport { getsupabasetoken } from './get-supabase-token'\nimport { updateUserEmbedding } from './update-user-embedding'\nimport { deleteMarket } from './delete-market'\nimport { saveTopic } from './save-topic'\nimport { boostmarket } from './boost-market'\nimport { redeemboost } from './redeem-market-ad-reward'\nimport { followtopic } from './follow-topic'\nimport { editcomment } from 'api/edit-comment'\nimport {\n  supabasesearchgroups,\n  supabasesearchmygroups,\n} from './supabase-search-groups'\nimport { leagueActivity } from './league-activity'\nimport { updategroup } from './update-group'\nimport { updateUserDisinterestEmbedding } from 'api/update-user-disinterests'\nimport { awardBounty } from './award-bounty'\nimport { addBounty } from './add-bounty'\nimport { cancelbounty } from './cancel-bounty'\nimport { createAnswerCPMM } from './create-answer-cpmm'\nimport { createportfolio } from './create-portfolio'\nimport { updateportfolio } from './update-portfolio'\nimport { searchgiphy } from './search-giphy'\nimport { manachantweet } from './manachan-tweet'\nimport { managram } from './managram'\nimport { leavereview } from './leave-review'\nimport { getusercontractmetricswithcontracts } from './get-user-contract-metrics-with-contracts'\nimport { castpollvote } from './cast-poll-vote'\nimport { getsimilargroupstocontract } from 'api/get-similar-groups-to-contract'\nimport { followUser } from './follow-user'\nimport { report } from './report'\nimport { createdashboard } from './create-dashboard'\nimport { getyourdashboards } from './get-your-dashboards'\nimport { followdashboard } from './follow-dashboard'\nimport { supabasesearchdashboards } from './supabase-search-dashboards'\nimport { getyourfolloweddashboards } from './get-your-followed-dashboards'\nimport { updatedashboard } from './update-dashboard'\nimport { deletedashboard } from './delete-dashboard'\nimport { setnews } from './set-news'\nimport { getnews } from './get-news'\nimport {\n  getdashboardfromslug,\n  getDashboardFromSlug,\n} from './get-dashboard-from-slug'\nimport { unresolve } from './unresolve'\nimport { referuser } from 'api/refer-user'\nimport { banuser } from 'api/ban-user'\nimport { updateMarket } from 'api/update-market'\nimport { createprivateusermessage } from 'api/create-private-user-message'\nimport { createprivateusermessagechannel } from 'api/create-private-user-message-channel'\nimport { createlover } from 'api/love/create-lover'\nimport { updatelover } from 'api/love/update-lover'\nimport { createcommentonlover } from 'api/love/create-comment-on-lover'\nimport { hidecommentonlover } from 'api/love/hide-comment-on-lover'\nimport { searchlocation } from './search-location'\nimport { searchnearcity } from './search-near-city'\nimport { leaveprivateusermessagechannel } from 'api/leave-private-user-message-channel'\nimport { updateprivateusermessagechannel } from 'api/update-private-user-message-channel'\nimport { editanswercpmm } from 'api/edit-answer'\nimport { createlovecompatibilityquestion } from 'api/love/create-love-compatibility-question'\nimport { getCompatibleLovers } from './love/compatible-lovers'\nimport { API, type APIPath } from 'common/api/schema'\nimport { getMarkets } from 'api/markets'\nimport { createchartannotation } from 'api/create-chart-annotation'\nimport { deletechartannotation } from 'api/delete-chart-annotation'\nimport { assertUnreachable } from 'common/util/types'\nimport { hideComment } from './hide-comment'\nimport { pinComment } from './pin-comment'\nimport { getManagrams } from './get-managrams'\nimport { getGroups } from './get-groups'\nimport { getComments } from './get-comments'\nimport { getBets } from './get-bets'\nimport { getDisplayUser, getUser } from './get-user'\nimport { getUsers } from './get-users'\nimport { getMarket } from './get-market'\nimport { getGroup } from './get-group'\nimport { getPositions } from './get-positions'\nimport { getLeagues } from './get-leagues'\nimport { getContract } from './get-contract'\nimport { addOrRemoveTopicFromContract } from './add-topic-to-market'\nimport { searchUsers } from './supabase-search-users'\nimport {\n  searchMarketsLite,\n  searchMarketsFull,\n} from './supabase-search-contract'\nimport { post } from 'api/post'\nimport { fetchLinkPreview } from './fetch-link-preview'\nimport { type APIHandler, typedEndpoint } from './helpers/endpoint'\nimport { requestloan } from 'api/request-loan'\nimport { removePinnedPhoto } from './love/remove-pinned-photo'\nimport { getHeadlines, getPoliticsHeadlines } from './get-headlines'\nimport { getadanalytics } from 'api/get-ad-analytics'\nimport { getCompatibilityQuestions } from './love/get-compatibililty-questions'\nimport { addOrRemoveReaction } from './reaction'\nimport { likeLover } from './love/like-lover'\nimport { shipLovers } from './love/ship-lovers'\nimport { createManalink } from './create-manalink'\nimport { getLikesAndShips } from './love/get-likes-and-ships'\nimport { hasFreeLike } from './love/has-free-like'\nimport { starLover } from './love/star-lover'\nimport { getLovers } from './love/get-lovers'\nimport { unlistAndCancelUserContracts } from './unlist-and-cancel-user-contracts'\nimport { getGroupsWithTopContracts } from 'api/get-topics-with-markets'\nimport { getBalanceChanges } from 'api/get-balance-changes'\nimport { getLoverAnswers } from './love/get-lover-answers'\nimport { placeMultiBet } from 'api/place-multi-bet'\nimport { deletetv, settv } from './set-tv'\nimport { getPartnerStats } from './get-partner-stats'\nimport { getSeenMarketIds } from 'api/get-seen-market-ids'\nimport { recordContractView } from 'api/record-contract-view'\nimport { createPublicChatMessage } from 'api/create-public-chat-message'\nimport { getFollowedGroups } from './get-followed-groups'\nimport { getUniqueBetGroupCount } from 'api/get-unique-bet-groups'\nimport { deleteGroup } from './delete-group'\nimport { recordContractInteraction } from 'api/record-contract-interaction'\nimport { getUserPortfolio } from './get-user-portfolio'\nimport { createuser } from 'api/create-user'\nimport { verifyPhoneNumber } from 'api/verify-phone-number'\nimport { requestOTP } from 'api/request-phone-otp'\nimport { multiSell } from 'api/multi-sell'\nimport { convertSpiceToMana } from './convert-sp-to-mana'\nimport { donate } from './donate'\nimport { getFeed } from 'api/get-feed'\nimport { getManaSupply } from './get-mana-supply'\nimport { getUserPortfolioHistory } from './get-user-portfolio-history'\nimport { deleteMe } from './delete-me'\nimport { updateModReport } from './update-mod-report'\nimport { getModReports } from './get-mod-reports'\nimport { searchContractPositions } from 'api/search-contract-positions'\nimport { blockUser, unblockUser } from './block-user'\nimport { blockGroup, unblockGroup } from './block-group'\nimport { blockMarket, unblockMarket } from './block-market'\nimport { getTxnSummaryStats } from 'api/get-txn-summary-stats'\nimport { getManaSummaryStats } from 'api/get-mana-summary-stats'\nimport { register } from 'api/gidx/register'\nimport { uploadDocument } from 'api/gidx/upload-document'\nimport { callbackGIDX } from 'api/gidx/callback'\nimport { getVerificationStatus } from 'api/gidx/get-verification-status'\nimport { getCurrentPrivateUser } from './get-current-private-user'\nimport { updatePrivateUser } from './update-private-user'\nimport { setPushToken } from './push-token'\nimport { updateNotifSettings } from './update-notif-settings'\nimport { getVerificationDocuments } from 'api/gidx/get-verification-documents'\nimport { getMonitorStatus } from 'api/gidx/get-monitor-status'\nimport { getBestComments } from 'api/get-best-comments'\nimport { recordCommentView } from 'api/record-comment-view'\nimport {\n  getChannelMemberships,\n  getChannelMessages,\n  getLastSeenChannelTime,\n  setChannelLastSeenTime,\n} from 'api/get-private-messages'\nimport { getNotifications } from 'api/get-notifications'\nimport { getContractTopics } from './get-contract-topics'\nimport { getRelatedMarkets } from 'api/get-related-markets'\nimport { getUserLimitOrdersWithContracts } from 'api/get-user-limit-orders-with-contracts'\nimport { getInterestingGroupsFromViews } from 'api/get-interesting-groups-from-views'\nimport { deleteComment } from './delete-comment'\n\nconst allowCorsUnrestricted: RequestHandler = cors({})\n\nfunction cacheController(policy?: string): RequestHandler {\n  return (_req, res, next) => {\n    if (policy) res.appendHeader('Cache-Control', policy)\n    next()\n  }\n}\nconst ignoredEndpoints = [\n  '/get-channel-messages',\n  '/v0/user/by-id/',\n  '/get-channel-memberships',\n  '/v0/get-mod-reports',\n  '/get-channel-seen-time',\n]\n\nconst requestMonitoring: RequestHandler = (req, _res, next) => {\n  const traceContext = req.get('X-Cloud-Trace-Context')\n  const traceId = traceContext\n    ? traceContext.split('/')[0]\n    : crypto.randomUUID()\n  const context = { endpoint: req.path, traceId }\n  withMonitoringContext(context, () => {\n    const startTs = hrtime.bigint()\n    const isLocalhost = req.get('host')?.includes('localhost')\n    if (\n      !isLocalhost ||\n      (isLocalhost && !ignoredEndpoints.some((e) => req.path.startsWith(e)))\n    ) {\n      log(`${req.method} ${req.url}`)\n    }\n    metrics.inc('http/request_count', { endpoint: req.path })\n    next()\n    const endTs = hrtime.bigint()\n    const latencyMs = Number(endTs - startTs) / 1e6\n    metrics.push('http/request_latency', latencyMs, { endpoint: req.path })\n  })\n}\n\nconst apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {\n  if (error instanceof APIError) {\n    log.info(error)\n    if (!res.headersSent) {\n      const output: { [k: string]: unknown } = { message: error.message }\n      if (error.details != null) {\n        output.details = error.details\n      }\n      res.status(error.code).json(output)\n    }\n  } else {\n    log.error(error)\n    if (!res.headersSent) {\n      res.status(500).json({ message: error.stack, error })\n    }\n  }\n}\n\nconst apiRoute = (endpoint: RequestHandler) => {\n  return [\n    allowCorsUnrestricted,\n    express.json(),\n    endpoint,\n    apiErrorHandler,\n  ] as const\n}\n\nexport const app = express()\napp.use(requestMonitoring)\n\napp.options('*', allowCorsUnrestricted)\n\n// we define the handlers in this object in order to typecheck that every API has a handler\nconst handlers: { [k in APIPath]: APIHandler<k> } = {\n  bet: placeBet,\n  'multi-bet': placeMultiBet,\n  'bet/cancel/:betId': cancelBet,\n  'market/:contractId/sell': sellShares,\n  bets: getBets,\n  'get-notifications': getNotifications,\n  'get-channel-memberships': getChannelMemberships,\n  'get-channel-messages': getChannelMessages,\n  'get-channel-seen-time': getLastSeenChannelTime,\n  'set-channel-seen-time': setChannelLastSeenTime,\n  'get-contract': getContract,\n  comment: createComment,\n  'hide-comment': hideComment,\n  'pin-comment': pinComment,\n  comments: getComments,\n  market: createMarket,\n  'market/:contractId/group': addOrRemoveTopicFromContract,\n  'market/:contractId/groups': getContractTopics,\n  'group/:slug': getGroup,\n  'group/by-id/:id': getGroup,\n  'group/by-id/:id/markets': ({ id, limit }, ...rest) =>\n    getMarkets({ groupId: id, limit }, ...rest),\n  'group/:slug/delete': deleteGroup,\n  'group/by-id/:id/delete': deleteGroup,\n  'group/:slug/block': blockGroup,\n  'group/:slug/unblock': unblockGroup,\n  groups: getGroups,\n  'market/:id': getMarket,\n  'market/:id/lite': ({ id }) => getMarket({ id, lite: true }),\n  'slug/:slug': getMarket,\n  'market/:contractId/update': updateMarket,\n  'market/:contractId/close': closeMarket,\n  'market/:contractId/resolve': resolveMarket,\n  'market/:contractId/add-liquidity': addLiquidity,\n  'market/:contractId/add-bounty': addBounty,\n  'market/:contractId/award-bounty': awardBounty,\n  'market/:contractId/answer': createAnswerCPMM,\n  'market/:contractId/block': blockMarket,\n  'market/:contractId/unblock': unblockMarket,\n  'get-user-limit-orders-with-contracts': getUserLimitOrdersWithContracts,\n  'get-interesting-groups-from-views': getInterestingGroupsFromViews,\n  leagues: getLeagues,\n  markets: getMarkets,\n  'search-markets': searchMarketsLite,\n  'search-markets-full': searchMarketsFull,\n  managram: managram,\n  managrams: getManagrams,\n  manalink: createManalink,\n  donate: donate,\n  'convert-sp-to-mana': convertSpiceToMana,\n  'market/:id/positions': getPositions,\n  me: getMe,\n  'me/update': updateMe,\n  'me/delete': deleteMe,\n  'me/private': getCurrentPrivateUser,\n  'me/private/update': updatePrivateUser,\n  'user/by-id/:id': getUser,\n  'user/by-id/:id/lite': getDisplayUser,\n  'user/:username': getUser,\n  'user/:username/lite': getDisplayUser,\n  'user/:username/bets': (...props) => getBets(...props),\n  'user/by-id/:id/block': blockUser,\n  'user/by-id/:id/unblock': unblockUser,\n  users: getUsers,\n  'search-users': searchUsers,\n  react: addOrRemoveReaction,\n  'save-twitch': saveTwitchCredentials,\n  'set-push-token': setPushToken,\n  'update-notif-settings': updateNotifSettings,\n  headlines: getHeadlines,\n  'politics-headlines': getPoliticsHeadlines,\n  'compatible-lovers': getCompatibleLovers,\n  post: post,\n  'fetch-link-preview': fetchLinkPreview,\n  'request-loan': requestloan,\n  'remove-pinned-photo': removePinnedPhoto,\n  'get-related-markets': getRelatedMarkets,\n  'unlist-and-cancel-user-contracts': unlistAndCancelUserContracts,\n  'get-ad-analytics': getadanalytics,\n  'get-compatibility-questions': getCompatibilityQuestions,\n  'like-lover': likeLover,\n  'ship-lovers': shipLovers,\n  'get-likes-and-ships': getLikesAndShips,\n  'has-free-like': hasFreeLike,\n  'star-lover': starLover,\n  'get-lovers': getLovers,\n  'get-lover-answers': getLoverAnswers,\n  'set-news': setnews,\n  'update-user-embedding': updateUserEmbedding,\n  'search-groups': supabasesearchgroups,\n  'search-my-groups': supabasesearchmygroups,\n  'get-groups-with-top-contracts': getGroupsWithTopContracts,\n  'get-balance-changes': getBalanceChanges,\n  'get-partner-stats': getPartnerStats,\n  'get-seen-market-ids': getSeenMarketIds,\n  'record-contract-view': recordContractView,\n  'get-dashboard-from-slug': getDashboardFromSlug,\n  'create-public-chat-message': createPublicChatMessage,\n  unresolve: unresolve,\n  'get-followed-groups': getFollowedGroups,\n  'unique-bet-group-count': getUniqueBetGroupCount,\n  'record-contract-interaction': recordContractInteraction,\n  'get-user-portfolio': getUserPortfolio,\n  'get-user-portfolio-history': getUserPortfolioHistory,\n  createuser: createuser,\n  'verify-phone-number': verifyPhoneNumber,\n  'request-otp': requestOTP,\n  'multi-sell': multiSell,\n  'get-feed': getFeed,\n  'get-mana-supply': getManaSupply,\n  'update-mod-report': updateModReport,\n  'get-mod-reports': getModReports,\n  'search-contract-positions': searchContractPositions,\n  'get-txn-summary-stats': getTxnSummaryStats,\n  'get-mana-summary-stats': getManaSummaryStats,\n  'register-gidx': register,\n  'get-verification-status-gidx': getVerificationStatus,\n  'upload-document-gidx': uploadDocument,\n  'callback-gidx': callbackGIDX,\n  'get-verification-documents-gidx': getVerificationDocuments,\n  'get-monitor-status-gidx': getMonitorStatus,\n  'get-best-comments': getBestComments,\n  'record-comment-view': recordCommentView,\n  'delete-comment': deleteComment,\n}\n\nObject.entries(handlers).forEach(([path, handler]) => {\n  const api = API[path as APIPath]\n  const cache = cacheController((api as any).cache)\n  const url = '/' + pathWithPrefix(path as APIPath)\n\n  const apiRoute = [\n    url,\n    express.json(),\n    allowCorsUnrestricted,\n    cache,\n    typedEndpoint(path as any, handler as any),\n    apiErrorHandler,\n  ] as const\n\n  if (api.method === 'POST') {\n    app.post(...apiRoute)\n  } else if (api.method === 'GET') {\n    app.get(...apiRoute)\n    // } else if (api.method === 'PUT') {\n    //   app.put(...apiRoute)\n  } else {\n    assertUnreachable(api, 'Unsupported API method')\n  }\n})\n\napp.get('/health', ...apiRoute(health))\napp.get('/unsubscribe', ...apiRoute(unsubscribe))\napp.post('/editcomment', ...apiRoute(editcomment))\n\napp.post('/claimmanalink', ...apiRoute(claimmanalink))\napp.post('/creategroup', ...apiRoute(creategroup))\napp.post('/updategroup', ...apiRoute(updategroup))\napp.post('/validateIap', ...apiRoute(validateiap))\napp.post('/markallnotifications', ...apiRoute(markallnotifications))\napp.post('/updatememberrole', ...apiRoute(updatememberrole))\napp.post('/updategroupprivacy', ...apiRoute(updategroupprivacy))\napp.post('/registerdiscordid', ...apiRoute(registerdiscordid))\napp.post('/getuserisgroupmember', ...apiRoute(getuserisgroupmember))\napp.post('/completequest', ...apiRoute(completequest))\napp.post(\n  '/update-user-disinterest-embedding',\n  ...apiRoute(updateUserDisinterestEmbedding)\n)\napp.get('/getsupabasetoken', ...apiRoute(getsupabasetoken))\napp.post('/delete-market', ...apiRoute(deleteMarket))\napp.post('/save-topic', ...apiRoute(saveTopic))\napp.post('/boost-market', ...apiRoute(boostmarket))\napp.post('/redeem-boost', ...apiRoute(redeemboost))\n\napp.post('/createcheckoutsession', allowCorsUnrestricted, createcheckoutsession)\napp.post(\n  '/stripewebhook',\n  allowCorsUnrestricted,\n  express.raw({ type: '*/*' }),\n  stripewebhook\n)\napp.post('/follow-topic', ...apiRoute(followtopic))\napp.post('/league-activity', ...apiRoute(leagueActivity))\napp.post('/cancel-bounty', ...apiRoute(cancelbounty))\napp.post('/edit-answer-cpmm', ...apiRoute(editanswercpmm))\napp.post('/createportfolio', ...apiRoute(createportfolio))\napp.post('/updateportfolio', ...apiRoute(updateportfolio))\napp.post('/searchgiphy', ...apiRoute(searchgiphy))\napp.post('/manachantweet', ...apiRoute(manachantweet))\napp.post('/refer-user', ...apiRoute(referuser))\napp.post('/leave-review', ...apiRoute(leavereview))\napp.post(\n  '/get-user-contract-metrics-with-contracts',\n  ...apiRoute(getusercontractmetricswithcontracts)\n)\napp.post('/cast-poll-vote', ...apiRoute(castpollvote))\napp.post(\n  '/get-similar-groups-to-contract',\n  ...apiRoute(getsimilargroupstocontract)\n)\napp.post('/follow-user', ...apiRoute(followUser))\napp.post('/report', ...apiRoute(report))\n\napp.post('/settv', ...apiRoute(settv))\napp.post('/deletetv', ...apiRoute(deletetv))\n\napp.post('/createdashboard', ...apiRoute(createdashboard))\napp.post('/getyourdashboards', ...apiRoute(getyourdashboards))\napp.post('/followdashboard', ...apiRoute(followdashboard))\napp.post('/supabasesearchdashboards', ...apiRoute(supabasesearchdashboards))\napp.post('/getyourfolloweddashboards', ...apiRoute(getyourfolloweddashboards))\napp.post('/updatedashboard', ...apiRoute(updatedashboard))\napp.post('/delete-dashboard', ...apiRoute(deletedashboard))\napp.get('/get-news-dashboards', ...apiRoute(getnews))\napp.post('/getdashboardfromslug', ...apiRoute(getdashboardfromslug))\napp.post('/ban-user', ...apiRoute(banuser))\napp.post('/create-private-user-message', ...apiRoute(createprivateusermessage))\napp.post(\n  '/create-private-user-message-channel',\n  ...apiRoute(createprivateusermessagechannel)\n)\napp.post(\n  '/leave-private-user-message-channel',\n  ...apiRoute(leaveprivateusermessagechannel)\n)\napp.post(\n  '/update-private-user-message-channel',\n  ...apiRoute(updateprivateusermessagechannel)\n)\napp.post('/create-lover', ...apiRoute(createlover))\napp.post('/update-lover', ...apiRoute(updatelover))\napp.post('/create-comment-on-lover', ...apiRoute(createcommentonlover))\napp.post('/hide-comment-on-lover', ...apiRoute(hidecommentonlover))\napp.post('/searchlocation', ...apiRoute(searchlocation))\napp.post('/searchnearcity', ...apiRoute(searchnearcity))\napp.post(\n  '/createlovecompatibilityquestion',\n  ...apiRoute(createlovecompatibilityquestion)\n)\napp.post('/create-chart-annotation', ...apiRoute(createchartannotation))\napp.post('/delete-chart-annotation', ...apiRoute(deletechartannotation))\n\n// mqp: definitely don't enable this in production since there's no authorization\n// import { broadcastTest } from 'api/broadcast-test'\n// app.post('/broadcast-test', ...apiRoute(broadcastTest))\n\n// Catch 404 errors - this should be the last route\napp.use(allowCorsUnrestricted, (req, res) => {\n  res\n    .status(404)\n    .set('Content-Type', 'application/json')\n    .json({\n      message: `The requested route '${req.path}' does not exist. Please check your URL for any misspellings or refer to app.ts`,\n    })\n})\n",
    'backend/src/websockets/switchboard.ts':
      'import { WebSocket } from \'ws\'\n\nexport type ClientState = {\n  uid?: string\n  lastSeen: number\n  subscriptions: Set<string>\n}\n\n/** Tracks the relationship of clients to websockets and subscription lists. */\nexport class Switchboard {\n  clients: Map<WebSocket, ClientState>\n  constructor() {\n    this.clients = new Map()\n  }\n  getClient(ws: WebSocket) {\n    const existing = this.clients.get(ws)\n    if (existing == null) {\n      throw new Error("Looking for a nonexistent client. Shouldn\'t happen.")\n    }\n    return existing\n  }\n  getAll() {\n    return this.clients.entries()\n  }\n  getSubscribers(topic: string) {\n    const entries = Array.from(this.clients.entries())\n    return entries.filter(([_k, v]) => v.subscriptions.has(topic))\n  }\n  connect(ws: WebSocket) {\n    const existing = this.clients.get(ws)\n    if (existing != null) {\n      throw new Error("Client already connected! Shouldn\'t happen.")\n    }\n    this.clients.set(ws, { lastSeen: Date.now(), subscriptions: new Set() })\n  }\n  disconnect(ws: WebSocket) {\n    this.getClient(ws)\n    this.clients.delete(ws)\n  }\n  markSeen(ws: WebSocket) {\n    this.getClient(ws).lastSeen = Date.now()\n  }\n  identify(ws: WebSocket, uid: string) {\n    this.getClient(ws).uid = uid\n    this.markSeen(ws)\n  }\n  deidentify(ws: WebSocket) {\n    this.getClient(ws).uid = undefined\n    this.markSeen(ws)\n  }\n  subscribe(ws: WebSocket, ...topics: string[]) {\n    const client = this.getClient(ws)\n    for (const topic of topics) {\n      client.subscriptions.add(topic)\n    }\n    this.markSeen(ws)\n  }\n  unsubscribe(ws: WebSocket, ...topics: string[]) {\n    const client = this.getClient(ws)\n    for (const topic of topics) {\n      client.subscriptions.delete(topic)\n    }\n    this.markSeen(ws)\n  }\n}\n',
    'common/src/util/promise.ts':
      'export const mapAsync = <T, U>(\n  items: T[],\n  f: (item: T, index: number) => Promise<U>,\n  maxConcurrentRequests = 20\n) => {\n  let index = 0\n  let currRequests = 0\n  const results: U[] = []\n\n  return new Promise((resolve: (results: U[]) => void, reject) => {\n    const doWork = () => {\n      while (index < items.length && currRequests < maxConcurrentRequests) {\n        const itemIndex = index\n        f(items[itemIndex], itemIndex)\n          .then((data) => {\n            results[itemIndex] = data\n            currRequests--\n            if (index === items.length && currRequests === 0) resolve(results)\n            else doWork()\n          })\n          .catch(reject)\n\n        index++\n        currRequests++\n      }\n    }\n\n    if (items.length === 0) resolve([])\n    else doWork()\n  })\n}\n',
    'test/__src__/manifold-project.test.ts':
      "import { mock } from 'bun:test'\nimport path from 'path'\nimport fs from 'fs'\nimport { range } from 'lodash'\nimport { WebSocket } from 'ws'\n\nimport { ScoreTestContext } from './score-tests'\nimport * as mainPromptModule from 'backend/main-prompt'\nimport { ProjectFileContext } from 'common/util/file'\nimport { applyAndRevertChanges } from 'common/util/changes'\nimport { Message } from 'common/actions'\nimport {\n  getProjectFileTree,\n  getAllFilePaths,\n} from 'common/src/project-file-tree'\nimport { getFileTokenScores } from 'common/src/codemap/parse'\nimport { EventEmitter } from 'events'\nimport { FileChanges } from 'common/actions'\nimport { projectTest } from './score-tests'\n\nconst DEBUG_MODE = true\nconst mockProjectRoot = path.join(__dirname, '../__mock-projects__/manifold')\n\nprojectTest('manifold project', async (getContext) => {\n  const { currentWorkingDirectory } = await getProjectFileContext()\n  await runTerminalCommand(\n    `cd ${currentWorkingDirectory}/backend/api && yarn compile`\n  )\n\n  const tests = [\n    { description: 'test full file path', fn: testFullFilePath },\n    // { description: 'test delete comment', fn: testDeleteComment },\n    // {\n    //   description: 'test delete comment without knowledge',\n    //   fn: testDeleteCommentWithoutKnowledge,\n    // },\n  ]\n\n  // Run each test multiple times all in parallel\n  const repeatCount = 2\n  await Promise.all(\n    tests.map(async ({ description, fn }) => {\n      const scoreTestContext = getContext(description)\n      await Promise.all(range(repeatCount).map(() => fn(scoreTestContext)))\n    })\n  )\n})\n\nconst testFullFilePath = async ({ expectTrue }: ScoreTestContext) => {\n  const fileContext = await getProjectFileContext()\n  const { changes } = await runMainPrompt(fileContext, [\n    {\n      role: 'user',\n      content:\n        'Can you add a console.log statement to components/like-button.ts with all the props?',\n    },\n  ])\n\n  console.log('changes', changes)\n  const filePathToPatch = Object.fromEntries(\n    changes.map((change) => [change.filePath, change.content])\n  )\n  const filesChanged = Object.keys(filePathToPatch)\n\n  expectTrue(\n    'includes like-button.tsx file',\n    filesChanged.includes('web/components/contract/like-button.tsx')\n  )\n\n  const likeButtonFile =\n    filePathToPatch['web/components/contract/like-button.tsx']\n  expectTrue(\n    'like-button.tsx includes console.log',\n    !!likeButtonFile && likeButtonFile.includes('console.log(')\n  )\n}\n\nconst testDeleteComment = async ({\n  expectTrue,\n  incrementScore,\n}: ScoreTestContext) => {\n  const fileContext = await getProjectFileContext()\n  const { changes } = await runMainPrompt(fileContext, [\n    {\n      role: 'user',\n      content: 'Add an endpoint to delete a comment',\n    },\n  ])\n\n  const filePathToPatch = Object.fromEntries(\n    changes.map((change) => [change.filePath, change.content])\n  )\n  const filesChanged = Object.keys(filePathToPatch)\n  expectTrue(\n    'includes delete-comment.ts file',\n    filesChanged.includes('backend/api/src/delete-comment.ts')\n  )\n  expectTrue(\n    'includes app.ts file',\n    filesChanged.includes('backend/api/src/app.ts')\n  )\n  expectTrue(\n    'includes schema.ts file',\n    filesChanged.includes('common/src/api/schema.ts')\n  )\n\n  const deleteCommentFile = filePathToPatch['backend/api/src/delete-comment.ts']\n  expectTrue(\n    'delete-comment.ts references comment_id',\n    !!deleteCommentFile && deleteCommentFile.includes('comment_id')\n  )\n  expectTrue(\n    'delete-comment.ts references isAdmin',\n    !!deleteCommentFile && deleteCommentFile.includes('isAdmin')\n  )\n\n  await applyAndRevertChangesSequentially(\n    fileContext.currentWorkingDirectory,\n    changes,\n    async () => {\n      const compileResult = await runTerminalCommand(\n        `cd ${fileContext.currentWorkingDirectory}/backend/api && yarn compile`\n      )\n      const errorFiles = extractErrorFiles(compileResult.stdout)\n      const scoreChange = Math.max(3 - errorFiles.length, 0)\n      incrementScore(\n        scoreChange,\n        3,\n        `${errorFiles.join(', ')}: ${errorFiles.length} files with type errors`\n      )\n    }\n  )\n}\n\nconst testDeleteCommentWithoutKnowledge = async ({\n  expectTrue,\n  incrementScore,\n}: ScoreTestContext) => {\n  const fileContext = await getProjectFileContext()\n  fileContext.knowledgeFiles = {}\n\n  const { changes } = await runMainPrompt(fileContext, [\n    {\n      role: 'user',\n      content: 'Add an endpoint to delete a comment',\n    },\n  ])\n\n  const filePathToPatch = Object.fromEntries(\n    changes.map((change) => [change.filePath, change.content])\n  )\n  const filesChanged = Object.keys(filePathToPatch)\n\n  expectTrue(\n    'includes delete-comment.ts file',\n    filesChanged.includes('backend/api/src/delete-comment.ts')\n  )\n  expectTrue(\n    'includes app.ts file',\n    filesChanged.includes('backend/api/src/app.ts')\n  )\n  expectTrue(\n    'includes schema.ts file',\n    filesChanged.includes('common/src/api/schema.ts')\n  )\n\n  const deleteCommentFile = filePathToPatch['backend/api/src/delete-comment.ts']\n  expectTrue(\n    'delete-comment.ts references comment_id',\n    !!deleteCommentFile && deleteCommentFile.includes('comment_id')\n  )\n  expectTrue(\n    'delete-comment.ts references isAdmin',\n    !!deleteCommentFile && deleteCommentFile.includes('isAdmin')\n  )\n\n  await applyAndRevertChangesSequentially(\n    fileContext.currentWorkingDirectory,\n    changes,\n    async () => {\n      const compileResult = await runTerminalCommand(\n        `cd ${fileContext.currentWorkingDirectory}/backend/api && yarn compile`\n      )\n      const errorFiles = extractErrorFiles(compileResult.stdout)\n      const scoreChange = Math.max(3 - errorFiles.length, 0)\n      incrementScore(\n        scoreChange,\n        3,\n        `${errorFiles.join(', ')}: ${errorFiles.length} files with type errors`\n      )\n    }\n  )\n}\n\nmock.module('backend/websockets/websocket-action', () => ({\n  requestFiles: (ws: WebSocket, filePaths: string[]) => {\n    const files: Record<string, string | null> = {}\n    for (const filePath of filePaths) {\n      files[filePath] = readMockFile(filePath)\n    }\n    return Promise.resolve(files)\n  },\n}))\n\nfunction readMockFile(filePath: string): string | null {\n  const fullPath = path.join(mockProjectRoot, filePath)\n  try {\n    return fs.readFileSync(fullPath, 'utf-8')\n  } catch (error) {\n    return null\n  }\n}\n\nasync function getProjectFileContext(): Promise<ProjectFileContext> {\n  const fileTree = getProjectFileTree(mockProjectRoot)\n  const allFilePaths = getAllFilePaths(fileTree)\n  const knowledgeFilePaths = allFilePaths.filter((filePath) =>\n    filePath.endsWith('knowledge.md')\n  )\n  const knowledgeFiles: Record<string, string> = {}\n  for (const filePath of knowledgeFilePaths) {\n    const content = readMockFile(filePath)\n    if (content !== null) {\n      knowledgeFiles[filePath] = content\n    }\n  }\n  const fileTokenScores = await getFileTokenScores(\n    mockProjectRoot,\n    allFilePaths\n  )\n  return {\n    currentWorkingDirectory: mockProjectRoot,\n    gitChanges: {\n      status: '',\n      diff: '',\n      diffCached: '',\n      lastCommitMessages: '',\n    },\n    files: {},\n    knowledgeFiles,\n    fileTokenScores,\n    fileTree,\n  }\n}\n\nasync function runMainPrompt(\n  fileContext: ProjectFileContext,\n  messages: Message[]\n) {\n  const mockWs = new EventEmitter() as WebSocket\n  mockWs.send = mock()\n  mockWs.close = mock()\n\n  return await mainPromptModule.mainPrompt(\n    mockWs,\n    messages,\n    fileContext,\n    'test-user-id',\n    (chunk: string) => {\n      if (DEBUG_MODE) {\n        process.stdout.write(chunk)\n      }\n    }\n  )\n}\n\nfunction extractErrorFiles(output: string): string[] {\n  const lines = output.split('\\n')\n  return lines\n    .filter((line) => line.includes(': error TS'))\n    .map((line) => line.split('(')[0].trim())\n}\n\nasync function runTerminalCommand(command: string) {\n  return new Promise<{ stdout: string; stderr: string; exitCode: number }>(\n    (resolve) => {\n      const { exec } = require('child_process')\n      exec(command, (error: Error | null, stdout: string, stderr: string) => {\n        resolve({\n          stdout,\n          stderr,\n          exitCode: error && 'code' in error ? (error.code as number) : 0,\n        })\n      })\n    }\n  )\n}\n\nconst applyAndRevertChangesSequentially = (() => {\n  const queue: Array<() => Promise<void>> = []\n  let isProcessing = false\n\n  const processQueue = async () => {\n    if (isProcessing || queue.length === 0) return\n    isProcessing = true\n    const nextOperation = queue.shift()\n    if (nextOperation) {\n      await nextOperation()\n    }\n    isProcessing = false\n    processQueue()\n  }\n\n  return async (\n    projectRoot: string,\n    changes: FileChanges,\n    onApply: () => Promise<void>\n  ) => {\n    return new Promise<void>((resolve, reject) => {\n      queue.push(async () => {\n        try {\n          await applyAndRevertChanges(projectRoot, changes, onApply)\n          resolve()\n        } catch (error) {\n          reject(error)\n        }\n      })\n      processQueue()\n    })\n  }\n})()\n",
    'common/src/util/tools.ts':
      "import { Tool } from '@anthropic-ai/sdk/resources'\n\nexport const getTools = (): Tool[] => {\n  return [\n    {\n      name: 'update_file_context',\n      description: `Updates the context with a the set of existing files you want to read. Another assistant will try to choose files that will be helpful based on the message history. You should also provide a prompt that describes in natural language what files to add or remove from the context. Do not use this tool to create a new file, only to read existing files.`,\n      input_schema: {\n        type: 'object',\n        properties: {\n          prompt: {\n            type: 'string',\n            description:\n              'A prompt that describes in natural language what files to add or remove from the context. You can list specific files, or give general instructions about what files to include.',\n          },\n        },\n        required: ['prompt'],\n      },\n    } as Tool,\n    {\n      name: 'scrape_web_page',\n      description: `Retrieves the content of a web page given a URL. This tool is helpful when you need to gather information from external sources, such as documentation, APIs, or other web-based resources. Use this tool when the user asks for information that might be available on a specific website or when you need to reference external documentation to answer a question or solve a problem.`,\n      input_schema: {\n        type: 'object',\n        properties: {\n          url: {\n            type: 'string',\n            description: 'The URL of the web page to scrape',\n          },\n        },\n        required: ['url'],\n      },\n    } as Tool,\n    {\n      name: 'run_terminal_command',\n      description: `Executes a command in the terminal and returns the result. This tool allows the assistant to run shell commands, which can be useful for various tasks such as grepping for code references, installing dependencies, running scripts, or performing system operations. Use this tool when you need to execute a specific command in the user's terminal.`,\n      input_schema: {\n        type: 'object',\n        properties: {\n          command: {\n            type: 'string',\n            description: 'The command to run in the terminal',\n          },\n        },\n        required: ['command'],\n      },\n    } as Tool,\n    // {\n    //   name: 'search_manifold_markets',\n    //   description: `Searches for relevant markets on Manifold and returns a list of Yes/No markets with their probabilities. This tool should be used when the user wants to know about a future event, like who will win the next presidential election. You can search for a relevant prediction market, which is a question about the future, and get the market's forecast as a probability which you can interpret.`,\n    //   input_schema: {\n    //     type: 'object',\n    //     properties: {\n    //       query: {\n    //         type: 'string',\n    //         description: 'The search query for finding relevant binary markets',\n    //       },\n    //       limit: {\n    //         type: 'number',\n    //         description: 'The maximum number of markets to return (default: 5)',\n    //       },\n    //     },\n    //   },\n    // } as Tool,\n  ]\n}\n\nexport const DEFAULT_TOOLS: Tool[] = getTools()\n",
    'common/src/util/file.ts':
      "import { z } from 'zod'\n\nexport const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.object({\n  name: z.string(),\n  type: z.enum(['file', 'directory']),\n  children: z.lazy(() => z.array(FileTreeNodeSchema).optional()),\n})\n\nexport interface FileTreeNode {\n  name: string\n  type: 'file' | 'directory'\n  children?: FileTreeNode[]\n}\n\nexport const ProjectFileContextSchema = z.object({\n  currentWorkingDirectory: z.string(),\n  fileTree: z.array(z.custom<FileTreeNode>()),\n  fileTokenScores: z.record(z.string(), z.record(z.string(), z.number())),\n  knowledgeFiles: z.record(z.string(), z.string()),\n  files: z.record(z.string(), z.string().nullable()),\n  gitChanges: z.object({\n    status: z.string(),\n    diff: z.string(),\n    diffCached: z.string(),\n    lastCommitMessages: z.string(),\n  }),\n  changesSinceLastChat: z.record(z.string(), z.string()),\n})\n\nexport type ProjectFileContext = z.infer<typeof ProjectFileContextSchema>\n\nexport const createFileBlock = (filePath: string, content: string) => {\n  return (\n    '<' +\n    `file path=\"${filePath}\">\n${content}\n</file` +\n    '>'\n  )\n}\nexport const createFileBlockWithoutPath = (content: string) => {\n  return (\n    '<' +\n    `file>\n${content}\n</file` +\n    '>'\n  )\n}\n\nexport const fileRegex = /<file path=\"([^\"]+)\">([\\s\\S]*?)<\\/file>/g\nexport const fileWithNoPathRegex = /<file>([\\s\\S]*?)<\\/file>/g\n\nexport const parseFileBlocks = (fileBlocks: string) => {\n  let fileMatch\n  const files: Record<string, string> = {}\n  while ((fileMatch = fileRegex.exec(fileBlocks)) !== null) {\n    const [, filePath, fileContent] = fileMatch\n    files[filePath] = fileContent.startsWith('\\n')\n      ? fileContent.slice(1)\n      : fileContent\n  }\n  return files\n}\n\nexport const parseFileBlocksWithoutPath = (fileBlocks: string) => {\n  let fileMatch\n  const files: string[] = []\n  while ((fileMatch = fileWithNoPathRegex.exec(fileBlocks)) !== null) {\n    const [, fileContent] = fileMatch\n    files.push(\n      fileContent.startsWith('\\n') ? fileContent.slice(1) : fileContent\n    )\n  }\n  return files\n}\n\nexport function printFileTree(\n  nodes: FileTreeNode[],\n  depth: number = 0\n): string {\n  let result = ''\n  const indentation = ' '.repeat(depth)\n  for (const node of nodes) {\n    result += `${indentation}${node.name}${node.type === 'directory' ? '/' : ''}\\n`\n    if (node.type === 'directory' && node.children) {\n      result += printFileTree(node.children, depth + 1)\n    }\n  }\n  return result\n}\n\nexport function printFileTreeWithTokens(\n  nodes: FileTreeNode[],\n  fileTokenScores: Record<string, Record<string, number>>,\n  path: string[] = []\n): string {\n  let result = ''\n  const depth = path.length\n  const indentToken = ' '\n  const indentation = indentToken.repeat(depth)\n  const indentationWithFile = indentToken.repeat(depth + 1)\n  for (const node of nodes) {\n    result += `${indentation}${node.name}${node.type === 'directory' ? '/' : ''}`\n    path.push(node.name)\n    const filePath = path.join('/')\n    const tokenScores = fileTokenScores[filePath]\n    if (node.type === 'file' && tokenScores) {\n      const tokens = Object.keys(tokenScores)\n      if (tokens.length > 0) {\n        result += `\\n${indentationWithFile}${tokens.join(' ')}`\n      }\n    }\n    result += '\\n'\n    if (node.type === 'directory' && node.children) {\n      result += printFileTreeWithTokens(node.children, fileTokenScores, path)\n    }\n    path.pop()\n  }\n  return result\n}\n",
    'test/__mock-data__/knowledge-files/cache-expiration.ts':
      "import { Message } from 'common/src/actions'\nimport { ProjectFileContext } from 'common/src/util/file'\n\nexport const mockFileContext: ProjectFileContext = {\n  currentWorkingDirectory: 'Users/me/Documents/manicode',\n  files: {},\n  fileTree: [\n    {\n      name: '.gitignore',\n      type: 'file',\n    },\n    {\n      name: '.manicodeignore',\n      type: 'file',\n    },\n    {\n      name: '.prettierrc',\n      type: 'file',\n    },\n    {\n      name: 'README.md',\n      type: 'file',\n    },\n    {\n      name: 'authentication_and_billing.knowledge.md',\n      type: 'file',\n    },\n    {\n      name: 'backend',\n      type: 'directory',\n      children: [\n        {\n          name: '.dockerignore',\n          type: 'file',\n        },\n        {\n          name: '.env.example',\n          type: 'file',\n        },\n        {\n          name: '.gitignore',\n          type: 'file',\n        },\n        {\n          name: 'Dockerfile',\n          type: 'file',\n        },\n        {\n          name: 'deploy.sh',\n          type: 'file',\n        },\n        {\n          name: 'jest.config.js',\n          type: 'file',\n        },\n        {\n          name: 'jest.setup.js',\n          type: 'file',\n        },\n        {\n          name: 'knowledge.md',\n          type: 'file',\n        },\n        {\n          name: 'package.json',\n          type: 'file',\n        },\n        {\n          name: 'src',\n          type: 'directory',\n          children: [\n            {\n              name: 'claude.ts',\n              type: 'file',\n            },\n            {\n              name: 'constants.ts',\n              type: 'file',\n            },\n            {\n              name: 'generate-diffs-prompt.ts',\n              type: 'file',\n            },\n            {\n              name: 'generate-diffs-via-expansion.ts',\n              type: 'file',\n            },\n            {\n              name: 'generate-knowledge-files.ts',\n              type: 'file',\n            },\n            {\n              name: 'generate-patch.ts',\n              type: 'file',\n            },\n            {\n              name: 'index.ts',\n              type: 'file',\n            },\n            {\n              name: 'main-prompt.ts',\n              type: 'file',\n            },\n            {\n              name: 'openai-api.ts',\n              type: 'file',\n            },\n            {\n              name: 'process-stream.ts',\n              type: 'file',\n            },\n            {\n              name: 'request-files-prompt.ts',\n              type: 'file',\n            },\n            {\n              name: 'system-prompt.ts',\n              type: 'file',\n            },\n            {\n              name: 'tools.ts',\n              type: 'file',\n            },\n            {\n              name: 'util',\n              type: 'directory',\n              children: [\n                {\n                  name: 'debug.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'token-counter.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'websockets',\n              type: 'directory',\n              children: [\n                {\n                  name: 'server.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'switchboard.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'websocket-action.ts',\n                  type: 'file',\n                },\n              ],\n            },\n          ],\n        },\n        {\n          name: 'tsconfig.json',\n          type: 'file',\n        },\n      ],\n    },\n    {\n      name: 'bun.lockb',\n      type: 'file',\n    },\n    {\n      name: 'common',\n      type: 'directory',\n      children: [\n        {\n          name: 'package.json',\n          type: 'file',\n        },\n        {\n          name: 'src',\n          type: 'directory',\n          children: [\n            {\n              name: 'actions.ts',\n              type: 'file',\n            },\n            {\n              name: 'codemap',\n              type: 'directory',\n              children: [\n                {\n                  name: 'languages.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'parse.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'test-langs',\n                  type: 'directory',\n                  children: [],\n                },\n                {\n                  name: 'tree-sitter-queries',\n                  type: 'directory',\n                  children: [],\n                },\n                {\n                  name: 'tree-sitter.d.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'constants.ts',\n              type: 'file',\n            },\n            {\n              name: 'project-file-tree.ts',\n              type: 'file',\n            },\n            {\n              name: 'util',\n              type: 'directory',\n              children: [\n                {\n                  name: 'array.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'changes.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'file.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'object.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'patch.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'promise.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'websockets',\n              type: 'directory',\n              children: [\n                {\n                  name: 'websocket-client.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'websocket-schema.ts',\n                  type: 'file',\n                },\n              ],\n            },\n          ],\n        },\n        {\n          name: 'tsconfig.json',\n          type: 'file',\n        },\n      ],\n    },\n    {\n      name: 'exported-tokens.json',\n      type: 'file',\n    },\n    {\n      name: 'knowledge.md',\n      type: 'file',\n    },\n    {\n      name: 'musings.knowledge.md',\n      type: 'file',\n    },\n    {\n      name: 'npm-app',\n      type: 'directory',\n      children: [\n        {\n          name: 'README.md',\n          type: 'file',\n        },\n        {\n          name: 'clean-package.js',\n          type: 'file',\n        },\n        {\n          name: 'knowledge.md',\n          type: 'file',\n        },\n        {\n          name: 'package.json',\n          type: 'file',\n        },\n        {\n          name: 'src',\n          type: 'directory',\n          children: [\n            {\n              name: 'chat-storage.ts',\n              type: 'file',\n            },\n            {\n              name: 'cli.ts',\n              type: 'file',\n            },\n            {\n              name: 'client.ts',\n              type: 'file',\n            },\n            {\n              name: 'config.ts',\n              type: 'file',\n            },\n            {\n              name: 'fingerprint.ts',\n              type: 'file',\n            },\n            {\n              name: 'index.ts',\n              type: 'file',\n            },\n            {\n              name: 'manifold-api.ts',\n              type: 'file',\n            },\n            {\n              name: 'menu.ts',\n              type: 'file',\n            },\n            {\n              name: 'project-files.ts',\n              type: 'file',\n            },\n            {\n              name: 'tool-handlers.ts',\n              type: 'file',\n            },\n            {\n              name: 'web-scraper.ts',\n              type: 'file',\n            },\n          ],\n        },\n        {\n          name: 'storage',\n          type: 'directory',\n          children: [\n            {\n              name: 'key_value_stores',\n              type: 'directory',\n              children: [\n                {\n                  name: 'default',\n                  type: 'directory',\n                  children: [],\n                },\n              ],\n            },\n            {\n              name: 'request_queues',\n              type: 'directory',\n              children: [\n                {\n                  name: 'default',\n                  type: 'directory',\n                  children: [],\n                },\n              ],\n            },\n          ],\n        },\n        {\n          name: 'tsconfig.json',\n          type: 'file',\n        },\n      ],\n    },\n    {\n      name: 'package.json',\n      type: 'file',\n    },\n    {\n      name: 'python-app',\n      type: 'directory',\n      children: [\n        {\n          name: 'LICENSE',\n          type: 'file',\n        },\n        {\n          name: 'README.md',\n          type: 'file',\n        },\n        {\n          name: 'knowledge.md',\n          type: 'file',\n        },\n        {\n          name: 'pyproject.toml',\n          type: 'file',\n        },\n        {\n          name: 'src',\n          type: 'directory',\n          children: [\n            {\n              name: 'manicode',\n              type: 'directory',\n              children: [\n                {\n                  name: '__init__.py',\n                  type: 'file',\n                },\n                {\n                  name: '__pycache__',\n                  type: 'directory',\n                  children: [],\n                },\n              ],\n            },\n            {\n              name: 'manicode.egg-info',\n              type: 'directory',\n              children: [\n                {\n                  name: 'PKG-INFO',\n                  type: 'file',\n                },\n                {\n                  name: 'SOURCES.txt',\n                  type: 'file',\n                },\n                {\n                  name: 'dependency_links.txt',\n                  type: 'file',\n                },\n                {\n                  name: 'entry_points.txt',\n                  type: 'file',\n                },\n                {\n                  name: 'top_level.txt',\n                  type: 'file',\n                },\n              ],\n            },\n          ],\n        },\n      ],\n    },\n    {\n      name: 'scripts',\n      type: 'directory',\n      children: [\n        {\n          name: 'bump-version.ts',\n          type: 'file',\n        },\n        {\n          name: 'bun.lockb',\n          type: 'file',\n        },\n        {\n          name: 'generate-fine-tuning-dataset.ts',\n          type: 'file',\n        },\n        {\n          name: 'package.json',\n          type: 'file',\n        },\n        {\n          name: 'tsconfig.json',\n          type: 'file',\n        },\n      ],\n    },\n    {\n      name: 'start-dev.sh',\n      type: 'file',\n    },\n    {\n      name: 'test',\n      type: 'directory',\n      children: [\n        {\n          name: '__mock-data__',\n          type: 'directory',\n          children: [\n            {\n              name: 'actions',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'app',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'delete-comment',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'duplicate-imports',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'existing-comments',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'graph',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'hallucinated',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'indentation',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'knowledge-files',\n              type: 'directory',\n              children: [\n                {\n                  name: 'cache-expiration.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'many-updates',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'missing-line-actions',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'schema',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'simple',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n            {\n              name: 'system-prompt',\n              type: 'directory',\n              children: [\n                {\n                  name: 'expected.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'new.ts',\n                  type: 'file',\n                },\n                {\n                  name: 'old.ts',\n                  type: 'file',\n                },\n              ],\n            },\n          ],\n        },\n        {\n          name: '__src__',\n          type: 'directory',\n          children: [\n            {\n              name: 'diff-prompt.test.ts',\n              type: 'file',\n            },\n            {\n              name: 'generate-knowledge-files.test.ts',\n              type: 'file',\n            },\n            {\n              name: 'generate-patch.test.ts',\n              type: 'file',\n            },\n            {\n              name: 'main-prompt.test.ts',\n              type: 'file',\n            },\n            {\n              name: 'manifold-project.test.ts',\n              type: 'file',\n            },\n            {\n              name: 'patch.test.ts',\n              type: 'file',\n            },\n            {\n              name: 'process-stream.test.ts',\n              type: 'file',\n            },\n            {\n              name: 'score-tests.ts',\n              type: 'file',\n            },\n            {\n              name: 'setup.ts',\n              type: 'file',\n            },\n          ],\n        },\n        {\n          name: 'bunfig.toml',\n          type: 'file',\n        },\n        {\n          name: 'package.json',\n          type: 'file',\n        },\n        {\n          name: 'tsconfig.json',\n          type: 'file',\n        },\n      ],\n    },\n    {\n      name: 'todo.knowledge.md',\n      type: 'file',\n    },\n    {\n      name: 'tsconfig.json',\n      type: 'file',\n    },\n  ],\n  fileTokenScores: {\n    '.gitignore': {},\n    '.manicodeignore': {},\n    '.prettierrc': {},\n    'README.md': {},\n    'authentication_and_billing.knowledge.md': {},\n    'backend/.dockerignore': {},\n    'backend/.env.example': {},\n    'backend/.gitignore': {},\n    'backend/Dockerfile': {},\n    'backend/deploy.sh': {},\n    'backend/jest.config.js': {},\n    'backend/jest.setup.js': {},\n    'backend/knowledge.md': {},\n    'backend/package.json': {},\n    'backend/src/claude.ts': {\n      models: 1.2756477605939975,\n      promptClaudeStream: 3.044071057880673,\n      promptClaude: 3.328723629405636,\n      promptClaudeWithContinuation: 1.2756477605939975,\n    },\n    'backend/src/constants.ts': {\n      RATE_LIMIT_POLICY: 0.14829104003789312,\n    },\n    'backend/src/generate-diffs-prompt.ts': {\n      generateExpandedFileWithDiffBlocks: 4.987981645339687,\n      generateDiffBlocks: 2.9459823118803516,\n    },\n    'backend/src/generate-diffs-via-expansion.ts': {\n      expandNewContent: 3.9485535176648794,\n    },\n    'backend/src/generate-knowledge-files.ts': {\n      generateKnowledgeFiles: 3.112053989228971,\n    },\n    'backend/src/generate-patch.ts': {\n      generatePatch: 3.260551418852098,\n    },\n    'backend/src/index.ts': {},\n    'backend/src/main-prompt.ts': {\n      mainPrompt: 2.919429342306116,\n      getRelevantFileInfoMessage: 1.7242619990901342,\n      updateFileContext: 1.7242619990901342,\n      processFileBlock: 3.6185574201739965,\n    },\n    'backend/src/openai-api.ts': {\n      promptOpenAI: 3.0702795580141005,\n      promptOpenAIWithContinuation: 3.0702795580141005,\n    },\n    'backend/src/process-stream.ts': {},\n    'backend/src/request-files-prompt.ts': {\n      requestRelevantFiles: 3.9212536839853986,\n      getRelevantFiles: 1.3310839386064968,\n      topLevelDirectories: 1.3310839386064968,\n      getExampleFileList: 1.3310839386064968,\n      generateNonObviousRequestFilesPrompt: 1.3310839386064968,\n      generateKeyRequestFilesPrompt: 1.3310839386064968,\n    },\n    'backend/src/system-prompt.ts': {\n      getSearchSystemPrompt: 4.773914318612662,\n      getAgentSystemPrompt: 3.3872349113713067,\n      knowledgeFilesPrompt: 2.000555504129951,\n      getRelevantFilesPrompt: 3.3872349113713067,\n    },\n    'common/src/util/tools.ts': {\n      getTools: 2.6053777856571236,\n      DEFAULT_TOOLS: 0.9984440607850333,\n    },\n    'backend/src/util/debug.ts': {\n      DEBUG_MODE: 0.3656509454897687,\n      debugLog: 1.8627519058271726,\n      clearDebugLog: 0.3656509454897687,\n    },\n    'backend/src/util/token-counter.ts': {\n      countTokens: 1.2968841558128552,\n      countTokensForFiles: 0.786534719817593,\n    },\n    'backend/src/websockets/server.ts': {\n      MessageParseError: 0.7167229817000064,\n      serializeError: 0.7167229817000064,\n      parseMessage: 0.7167229817000064,\n      processMessage: 0.7167229817000064,\n      listen: 0.7167229817000064,\n      sendMessage: 1.2135174957078831,\n    },\n    'backend/src/websockets/switchboard.ts': {\n      Switchboard: 0.635184087735273,\n      getClient: 0.3751499544919713,\n      getAll: 0.3751499544919713,\n      getSubscribers: 0.3751499544919713,\n      connect: 0.3751499544919713,\n      disconnect: 0.3751499544919713,\n      markSeen: 0.3751499544919713,\n      identify: 0.3751499544919713,\n      deidentify: 0.3751499544919713,\n      subscribe: 0.3751499544919713,\n      unsubscribe: 1.337390589217878,\n    },\n    'backend/src/websockets/websocket-action.ts': {\n      subscribeToAction: 1.0610843071323905,\n      onWebsocketAction: 1.7965719029576102,\n      requestFiles: 2.53205949878283,\n      requestFile: 2.53205949878283,\n    },\n    'backend/tsconfig.json': {},\n    'bun.lockb': {},\n    'common/package.json': {},\n    'common/src/actions.ts': {\n      FileChangeSchema: 0.8550878507329176,\n      CHANGES: 0.8550878507329176,\n      ToolCallSchema: 0.8550878507329176,\n      CLIENT_ACTIONS: 0.8550878507329176,\n      CLIENT_ACTION_SCHEMA: 0.8550878507329176,\n      SERVER_ACTIONS: 0.8550878507329176,\n      SERVER_ACTION_SCHEMA: 0.8550878507329176,\n    },\n    'common/src/codemap/languages.ts': {\n      getLanguageConfig: 2.761147870196878,\n    },\n    'common/src/codemap/parse.ts': {\n      DEBUG_PARSING: 0.8354986189350809,\n      getFileTokenScores: 1.7533876688623948,\n      parseTokens: 0.8354986189350809,\n      parseFile: 0.8354986189350809,\n    },\n    'common/src/codemap/test-langs/test.c': {\n      Greeter: 0.3287649480356627,\n      create_greeter: 0.3287649480356627,\n      greet: 0.3287649480356627,\n      free_greeter: 0.3287649480356627,\n      print_greeting: 0.5566474448335192,\n      main: 0.3287649480356627,\n    },\n    'common/src/codemap/test-langs/test.cpp': {\n      greet: 0.29580146559145953,\n      Greeting: 0.29580146559145953,\n      printGreeting: 0.29580146559145953,\n      main: 0.29580146559145953,\n    },\n    'common/src/codemap/test-langs/test.cs': {\n      IGreeter: 0.29580146559145953,\n      Greet: 0.29580146559145953,\n      Greeting: 0.29580146559145953,\n      PrintGreeting: 0.29580146559145953,\n      Main: 0.29580146559145953,\n    },\n    'common/src/codemap/test-langs/test.go': {\n      Greeter: 0.1659862434495759,\n      string: 0.1659862434495759,\n      Greeting: 0.1659862434495759,\n      Greet: 0.1659862434495759,\n      PrintGreeting: 0.1659862434495759,\n      main: 0.1659862434495759,\n    },\n    'common/src/codemap/test-langs/test.java': {\n      Greeter: 0.28245008504511326,\n      greet: 0.28245008504511326,\n      Greeting: 0.28245008504511326,\n      printGreeting: 0.28245008504511326,\n      main: 0.28245008504511326,\n    },\n    'common/src/codemap/test-langs/test.js': {\n      greet: 0.3587119667194399,\n      Greeting: 0.3587119667194399,\n      printGreeting: 0.3587119667194399,\n      createGreeter: 0.3587119667194399,\n    },\n    'common/src/codemap/test-langs/test.php': {\n      greet: 0.29580146559145953,\n      Greeting: 0.29580146559145953,\n      __construct: 0.29580146559145953,\n      printGreeting: 0.29580146559145953,\n      createGreeter: 0.29580146559145953,\n    },\n    'common/src/codemap/test-langs/test.py': {\n      Greeter: 0.2536476641600791,\n      greet: 0.2536476641600791,\n      Greeting: 0.2536476641600791,\n      print_greeting: 0.42946282742825387,\n    },\n    'common/src/codemap/test-langs/test.rb': {\n      Greeter: 0.25109837670360796,\n      greet: 0.25109837670360796,\n      prefix: 0.25109837670360796,\n      Greeting: 0.25109837670360796,\n      initialize: 0.25109837670360796,\n      print_greeting: 0.4251465085588929,\n    },\n    'common/src/codemap/test-langs/test.rs': {\n      Greeter: 0.28994343076581225,\n      Greeting: 0.28994343076581225,\n      new: 0.6084788468237248,\n      greet: 0.28994343076581225,\n      main: 0.28994343076581225,\n    },\n    'common/src/codemap/test-langs/test.ts': {\n      Greeting: 0.3050809602367711,\n      greet: 0.3050809602367711,\n      printGreeting: 0.3050809602367711,\n      createGreeter: 0.3050809602367711,\n    },\n    'common/src/codemap/tree-sitter-queries/readme.md': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-c-tags.scm': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-c_sharp-tags.scm': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-cpp-tags.scm': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-go-tags.scm': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-java-tags.scm': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-javascript-tags.scm':\n      {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-php-tags.scm': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-python-tags.scm': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-ruby-tags.scm': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-rust-tags.scm': {},\n    'common/src/codemap/tree-sitter-queries/tree-sitter-typescript-tags.scm':\n      {},\n    'common/src/codemap/tree-sitter.d.ts': {},\n    'common/src/constants.ts': {\n      STOP_MARKER: 0.695546631234341,\n      SKIPPED_TERMINAL_COMMANDS: 0.695546631234341,\n    },\n    'common/src/project-file-tree.ts': {\n      getProjectFileTree: 1.8463688069343935,\n      buildTree: 0.8798046294230922,\n      parseGitignore: 0.8798046294230922,\n      getAllFilePaths: 2.2957955555516514,\n    },\n    'common/src/util/array.ts': {\n      filterDefined: 0.4670579267615085,\n      buildArray: 1.2187586613943497,\n      groupConsecutive: 0.4670579267615085,\n    },\n    'common/src/util/changes.ts': {\n      applyChanges: 2.4044067558037523,\n      applyAndRevertChanges: 1.3819208032579984,\n    },\n    'common/src/util/file.ts': {\n      FileTreeNodeSchema: 0.5564373049874729,\n      ProjectFileContextSchema: 0.5564373049874729,\n      createFileBlock: 2.580525944365354,\n      createFileBlockWithoutPath: 0.5564373049874729,\n      fileRegex: 0.5564373049874729,\n      fileWithNoPathRegex: 0.5564373049874729,\n      parseFileBlocks: 1.4519885995269681,\n      parseFileBlocksWithoutPath: 0.5564373049874729,\n      printFileTree: 0.9421302540979142,\n      printFileTreeWithTokens: 1.1677461661200754,\n    },\n    'common/src/util/object.ts': {\n      removeUndefinedProps: 1.0109874830039345,\n      removeNullOrUndefinedProps: 0.5971054936107728,\n      addObjects: 0.5971054936107728,\n      subtractObjects: 0.5971054936107728,\n      hasChanges: 0.5971054936107728,\n      hasSignificantDeepChanges: 0.5971054936107728,\n      filterObject: 1.2530929265228052,\n      assert: 0.5971054936107728,\n    },\n    'common/src/util/patch.ts': {\n      applyPatch: 5.78969920740265,\n    },\n    'common/src/util/promise.ts': {\n      mapAsync: 1.1183569906194901,\n    },\n    'common/src/websockets/websocket-client.ts': {\n      formatState: 0.711796992181887,\n      APIRealtimeClient: 2.275774837477926,\n      state: 0.711796992181887,\n      close: 0.711796992181887,\n      connect: 0.711796992181887,\n      waitAndReconnect: 0.711796992181887,\n      receiveMessage: 0.711796992181887,\n      sendMessage: 1.2051770704438114,\n      sendAction: 2.275774837477926,\n      identify: 0.711796992181887,\n      subscribe: 0.711796992181887,\n    },\n    'common/src/websockets/websocket-schema.ts': {\n      CLIENT_MESSAGE_SCHEMAS: 0.5955320903657728,\n      CLIENT_MESSAGE_SCHEMA: 0.5955320903657728,\n      SERVER_MESSAGE_SCHEMAS: 0.5955320903657728,\n      SERVER_MESSAGE_SCHEMA: 0.5955320903657728,\n    },\n    'common/tsconfig.json': {},\n    'exported-tokens.json': {},\n    'knowledge.md': {},\n    'musings.knowledge.md': {},\n    'npm-app/README.md': {},\n    'npm-app/clean-package.js': {},\n    'npm-app/knowledge.md': {},\n    'npm-app/package.json': {},\n    'npm-app/src/chat-storage.ts': {\n      ChatStorage: 1.7717634180723674,\n      ensureDirectoryExists: 0.6346404257248834,\n      getFilePath: 0.6346404257248834,\n      createChat: 0.6346404257248834,\n      getChat: 0.6346404257248834,\n      addMessage: 0.6346404257248834,\n      deleteChat: 0.6346404257248834,\n      listChats: 0.6346404257248834,\n      saveChat: 0.6346404257248834,\n      generateChatId: 0.6346404257248834,\n      getCurrentChat: 0.6346404257248834,\n      setCurrentChat: 0.6346404257248834,\n      getCurrentVersion: 0.6346404257248834,\n      navigateVersion: 0.6346404257248834,\n      saveFilesChanged: 0.6346404257248834,\n      saveCurrentFileState: 0.6346404257248834,\n      addNewFileState: 0.6346404257248834,\n    },\n    'npm-app/src/cli.ts': {\n      CLI: 1.4931982040990786,\n      onWebSocketError: 0.8819069134942297,\n      detectPasting: 0.8819069134942297,\n      handleInput: 0.8819069134942297,\n      setPrompt: 0.8819069134942297,\n      printInitialPrompt: 0.8819069134942297,\n      handleUndo: 0.8819069134942297,\n      handleRedo: 0.8819069134942297,\n      navigateFileVersion: 0.8819069134942297,\n      handleStopResponse: 0.8819069134942297,\n      handleExit: 0.8819069134942297,\n      handleEscKey: 0.8819069134942297,\n      applyAndDisplayCurrentFileVersion: 0.8819069134942297,\n      startLoadingAnimation: 0.8819069134942297,\n      stopLoadingAnimation: 0.8819069134942297,\n      handleUserInput: 2.9125726259144327,\n      sendUserInputAndAwaitResponse: 0.8819069134942297,\n    },\n    'npm-app/src/client.ts': {\n      Client: 1.9412412267183203,\n      connect: 1.1465283402452509,\n      setupSubscriptions: 1.1465283402452509,\n      checkNpmVersion: 1.1465283402452509,\n      sendUserInput: 1.1465283402452509,\n      subscribeToResponse: 1.1465283402452509,\n      warmContextCache: 1.1465283402452509,\n    },\n    'npm-app/src/config.ts': {\n      websocketUrl: 0.3632373815194687,\n      fingerprintId: 0.3632373815194687,\n      initFingerprint: 0.6150143483936656,\n    },\n    'npm-app/src/fingerprint.ts': {\n      FINGERPRINTING_INFO: 0.9378748862299282,\n      calculateFingerprint: 1.5879602193381825,\n    },\n    'npm-app/src/index.ts': {\n      manicode: 1.109708530700346,\n    },\n    'npm-app/src/manifold-api.ts': {\n      searchManifoldMarkets: 1.4854007711474697,\n    },\n    'npm-app/src/menu.ts': {\n      displayMenu: 5.233094699354542,\n    },\n    'npm-app/src/project-files.ts': {\n      initProjectRoot: 1.6271750185860758,\n      getCurrentWorkingDirectory: 2.2933142587893487,\n      setCurrentWorkingDirectory: 1.6271750185860758,\n      getCurrentDirectory: 0.9610357783828033,\n      getProjectRoot: 2.507763195317703,\n      getProjectFileContext: 3.563568911298773,\n      getGitChanges: 0.9610357783828033,\n      getChangesSinceLastFileVersion: 1.6271750185860758,\n      getFiles: 3.072647210344943,\n      getExistingFiles: 2.2933142587893487,\n      getExistingFilesWithScrapedContent: 0.9610357783828033,\n      setFiles: 1.6271750185860758,\n      getFileBlocks: 2.6829807345671455,\n      deleteFile: 0.9610357783828033,\n    },\n    'npm-app/src/tool-handlers.ts': {\n      handleUpdateFileContext: 0.9740233373390015,\n      handleScrapeWebPage: 0.9740233373390015,\n      handleSearchManifoldMarkets: 0.9740233373390015,\n      handleRunTerminalCommand: 1.649164867415119,\n      formatResult: 0.9740233373390015,\n      toolHandlers: 0.9740233373390015,\n    },\n    'npm-app/src/web-scraper.ts': {\n      scrapeWebPage: 1.57151023163337,\n      parseUrlsFromContent: 1.57151023163337,\n      getScrapedContentBlocks: 1.57151023163337,\n    },\n    'npm-app/tsconfig.json': {},\n    'package.json': {},\n    'python-app/LICENSE': {},\n    'python-app/README.md': {},\n    'python-app/knowledge.md': {},\n    'python-app/pyproject.toml': {},\n    'python-app/src/manicode/__init__.py': {\n      main: 0.31387297087950994,\n    },\n    'python-app/src/manicode/__pycache__/__init__.cpython-39.pyc': {},\n    'python-app/src/manicode.egg-info/PKG-INFO': {},\n    'python-app/src/manicode.egg-info/SOURCES.txt': {},\n    'python-app/src/manicode.egg-info/dependency_links.txt': {},\n    'python-app/src/manicode.egg-info/entry_points.txt': {},\n    'python-app/src/manicode.egg-info/top_level.txt': {},\n    'scripts/bump-version.ts': {\n      incrementVersion: 0.8889735555481955,\n    },\n    'scripts/bun.lockb': {},\n    'scripts/generate-fine-tuning-dataset.ts': {\n      saveProgress: 1.9541851224744737,\n      loadProgress: 1.9541851224744737,\n      generateClaudeSketch: 1.9541851224744737,\n      createDataset: 1.9541851224744737,\n      createTrainingAndValidationDatasets: 1.9541851224744737,\n      main: 1.9541851224744737,\n    },\n    'scripts/package.json': {},\n    'scripts/tsconfig.json': {},\n    'start-dev.sh': {},\n    'test/__mock-data__/actions/expected.ts': {\n      CHANGES: 0.6372818690991596,\n      ToolCallSchema: 0.6372818690991596,\n      CLIENT_ACTIONS: 0.6372818690991596,\n      CLIENT_ACTION_SCHEMA: 0.6372818690991596,\n      SERVER_ACTIONS: 0.6372818690991596,\n      SERVER_ACTION_SCHEMA: 0.6372818690991596,\n    },\n    'test/__mock-data__/actions/new.ts': {\n      CLIENT_ACTIONS: 0.7183574718083399,\n      SERVER_ACTIONS: 0.7183574718083399,\n    },\n    'test/__mock-data__/actions/old.ts': {\n      CHANGES: 0.6341191604001978,\n      ToolCallSchema: 0.6341191604001978,\n      CLIENT_ACTIONS: 0.6341191604001978,\n      CLIENT_ACTION_SCHEMA: 0.6341191604001978,\n      SERVER_ACTIONS: 0.6341191604001978,\n      SERVER_ACTION_SCHEMA: 0.6341191604001978,\n    },\n    'test/__mock-data__/app/expected.ts': {\n      cacheController: 2.206698234261847,\n      app: 2.206698234261847,\n    },\n    'test/__mock-data__/app/new.ts': {},\n    'test/__mock-data__/app/old.ts': {\n      cacheController: 2.202442303136901,\n      app: 2.202442303136901,\n    },\n    'test/__mock-data__/delete-comment/expected.ts': {\n      deleteComment: 0.3934605916618092,\n    },\n    'test/__mock-data__/delete-comment/new.ts': {\n      deleteComment: 0.3934605916618092,\n    },\n    'test/__mock-data__/delete-comment/old.ts': {\n      deleteComment: 0.517108526206176,\n    },\n    'test/__mock-data__/duplicate-imports/expected.ts': {\n      searchManifoldMarkets: 1.1625777672033408,\n      getTools: 1.7917370307347458,\n      executeToolCall: 0.6866371574495145,\n    },\n    'test/__mock-data__/duplicate-imports/new.ts': {\n      searchManifoldMarkets: 1.1625777672033408,\n      getTools: 1.7917370307347458,\n      executeToolCall: 0.6866371574495145,\n    },\n    'test/__mock-data__/duplicate-imports/old.ts': {\n      getTools: 1.3493625931253181,\n    },\n    'test/__mock-data__/existing-comments/expected.ts': {\n      manicode: 1.6092140273245312,\n      promptUser: 4.199144092121396,\n      sendUserInputAndAwaitResponse: 1.6092140273245312,\n    },\n    'test/__mock-data__/existing-comments/new.ts': {},\n    'test/__mock-data__/existing-comments/old.ts': {\n      manicode: 1.6266114413344601,\n      promptUser: 4.244541563817217,\n      sendUserInputAndAwaitResponse: 1.6266114413344601,\n    },\n    'test/__mock-data__/graph/expected.ts': {\n      loadGraphData: 0.7459586966016832,\n      createD3Graph: 0.7459586966016832,\n      ticked: 0.7459586966016832,\n      drawLink: 0.7459586966016832,\n      drawNode: 0.7459586966016832,\n      drawLabel: 0.7459586966016832,\n      zoomed: 0.7459586966016832,\n      highlightNodes: 0.7459586966016832,\n      setSelectedNode: 0.7459586966016832,\n      resetGraph: 0.7459586966016832,\n      zoomToNode: 0.7459586966016832,\n      findNodeAtPosition: 0.7459586966016832,\n    },\n    'test/__mock-data__/graph/new.ts': {\n      loadGraphData: 0.7459586966016832,\n      createD3Graph: 0.7459586966016832,\n      ticked: 0.7459586966016832,\n      drawLink: 0.7459586966016832,\n      drawNode: 0.7459586966016832,\n      drawLabel: 0.7459586966016832,\n      zoomed: 0.7459586966016832,\n      highlightNodes: 0.7459586966016832,\n      setSelectedNode: 0.7459586966016832,\n      resetGraph: 0.7459586966016832,\n      zoomToNode: 0.7459586966016832,\n      findNodeAtPosition: 0.7459586966016832,\n    },\n    'test/__mock-data__/graph/old.ts': {\n      loadGraphData: 0.8192738002941923,\n      createD3Graph: 0.8192738002941923,\n      ticked: 0.8192738002941923,\n      highlightNodes: 0.8192738002941923,\n      setSelectedNode: 0.8192738002941923,\n      resetGraph: 0.8192738002941923,\n      zoomToNode: 0.8192738002941923,\n      resetZoom: 0.8192738002941923,\n      drag: 0.8192738002941923,\n      dragstarted: 0.8192738002941923,\n      dragged: 0.8192738002941923,\n      dragended: 0.8192738002941923,\n    },\n    'test/__mock-data__/hallucinated/expected.ts': {\n      processChunk: 1.0817262541406476,\n      streamResponse: 1.0817262541406476,\n      mainPrompt: 1.8315217573359084,\n      getRelevantFileInfoMessage: 1.0817262541406476,\n      updateFileContext: 1.0817262541406476,\n      processFileBlock: 2.2701240099144857,\n    },\n    'test/__mock-data__/hallucinated/new.ts': {\n      processChunk: 0.6126173103557732,\n      streamResponse: 0.6126173103557732,\n    },\n    'test/__mock-data__/hallucinated/old.ts': {\n      mainPrompt: 2.020644281450439,\n      getRelevantFileInfoMessage: 1.1934250634857309,\n      updateFileContext: 1.1934250634857309,\n      processFileBlock: 2.5045365038356735,\n    },\n    'test/__mock-data__/indentation/expected.ts': {\n      manicode: 1.6113989760936935,\n      promptUser: 4.204845580276375,\n      sendUserInputAndAwaitResponse: 1.6113989760936935,\n    },\n    'test/__mock-data__/indentation/new.ts': {},\n    'test/__mock-data__/indentation/old.ts': {\n      manicode: 1.5960415217754953,\n      promptUser: 4.164771256739994,\n      sendUserInputAndAwaitResponse: 1.5960415217754953,\n    },\n    'test/__mock-data__/knowledge-files/cache-expiration.ts': {\n      mockFileContext: 2.0932336557256455,\n      messages: 2.0932336557256455,\n    },\n    'test/__mock-data__/many-updates/expected.ts': {\n      ChatClient: 0.7061252126127833,\n      connect: 0.7061252126127833,\n      setupSubscriptions: 0.7061252126127833,\n      sendUserInput: 0.7061252126127833,\n      subscribeToResponse: 0.7061252126127833,\n    },\n    'test/__mock-data__/many-updates/new.ts': {\n      ChatClient: 0.7061252126127833,\n      connect: 0.7061252126127833,\n      setupSubscriptions: 0.7061252126127833,\n      sendUserInput: 0.7061252126127833,\n      subscribeToResponse: 0.7061252126127833,\n    },\n    'test/__mock-data__/many-updates/old.ts': {\n      ChatClient: 0.6757329074564218,\n      connect: 0.6757329074564218,\n      setupSubscriptions: 0.6757329074564218,\n      sendUserInput: 0.6757329074564218,\n      subscribeToResponse: 0.6757329074564218,\n      handleReadFiles: 0.6757329074564218,\n      handleScrapeWebPage: 0.6757329074564218,\n    },\n    'test/__mock-data__/missing-line-actions/expected.ts': {\n      CHANGES: 0.6710886400000003,\n      ToolCallSchema: 0.6710886400000003,\n      CLIENT_ACTIONS: 0.6710886400000003,\n      CLIENT_ACTION_SCHEMA: 0.6710886400000003,\n      SERVER_ACTIONS: 0.6710886400000003,\n      SERVER_ACTION_SCHEMA: 0.6710886400000003,\n    },\n    'test/__mock-data__/missing-line-actions/new.ts': {\n      CLIENT_ACTIONS: 0.43749626759921767,\n      CLIENT_ACTION_SCHEMA: 0.43749626759921767,\n      SERVER_ACTIONS: 0.43749626759921767,\n      SERVER_ACTION_SCHEMA: 0.43749626759921767,\n    },\n    'test/__mock-data__/missing-line-actions/old.ts': {\n      CHANGES: 0.6372818690991596,\n      ToolCallSchema: 0.6372818690991596,\n      CLIENT_ACTIONS: 0.6372818690991596,\n      CLIENT_ACTION_SCHEMA: 0.6372818690991596,\n      SERVER_ACTIONS: 0.6372818690991596,\n      SERVER_ACTION_SCHEMA: 0.6372818690991596,\n    },\n    'test/__mock-data__/schema/expected.ts': {\n      DEFAULT_CACHE_STRATEGY: 3.7739414173459567,\n      API: 3.7739414173459567,\n    },\n    'test/__mock-data__/schema/new.ts': {},\n    'test/__mock-data__/schema/old.ts': {\n      DEFAULT_CACHE_STRATEGY: 3.7627372122626386,\n      API: 3.7627372122626386,\n    },\n    'test/__mock-data__/simple/expected.ts': {},\n    'test/__mock-data__/simple/new.ts': {},\n    'test/__mock-data__/simple/old.ts': {},\n    'test/__mock-data__/system-prompt/expected.ts': {\n      getSystemPrompt: 2.977180243984713,\n    },\n    'test/__mock-data__/system-prompt/new.ts': {},\n    'test/__mock-data__/system-prompt/old.ts': {\n      getSystemPrompt: 2.977180243984713,\n    },\n    'test/__src__/diff-prompt.test.ts': {},\n    'test/__src__/generate-knowledge-files.test.ts': {},\n    'test/__src__/generate-patch.test.ts': {},\n    'test/__src__/main-prompt.test.ts': {},\n    'test/__src__/manifold-project.test.ts': {\n      readMockFile: 1.5339344456138408,\n      getProjectFileContext: 5.68790592953601,\n      runMainPrompt: 1.5339344456138408,\n      extractErrorFiles: 1.5339344456138408,\n      runTerminalCommand: 1.5339344456138408,\n    },\n    'test/__src__/patch.test.ts': {},\n    'test/__src__/process-stream.test.ts': {},\n    'test/__src__/score-tests.ts': {\n      projectTest: 2.1156255205744725,\n    },\n    'test/__src__/setup.ts': {},\n    'test/bunfig.toml': {},\n    'test/package.json': {},\n    'test/tsconfig.json': {},\n    'todo.knowledge.md': {},\n    'tsconfig.json': {},\n  },\n  knowledgeFiles: {\n    'authentication_and_billing.knowledge.md':\n      '# Authentication and Billing System for Manicode\\n\\n## Overview\\n\\nThis document outlines the planned features and implementation strategy for adding authentication, database integration, and billing features to the Manicode project.\\n\\n## Planned Features\\n\\n1. Authentication for the console app\\n2. Database integration (PostgreSQL)\\n3. OAuth integration (Google and GitHub)\\n4. Referral system\\n5. Stripe integration for billing\\n6. Usage tracking and limits\\n\\n## Implementation Details\\n\\n### 1. Authentication for Console App\\n\\n- Implement user authentication in the console application\\n- Store user credentials securely in the database\\n- Provide login/logout functionality\\n\\n### 2. Database Integration (PostgreSQL)\\n\\n- Set up a PostgreSQL database on the server\\n- Create tables for user information, referrals, and usage data\\n- Implement database connection and query functions in the backend\\n\\n### 3. OAuth Integration (Google and GitHub)\\n\\n- Implement OAuth flow for Google and GitHub\\n- Create a simple web interface for OAuth redirection\\n- Handle OAuth callback and token storage\\n\\n### 4. Referral System\\n\\n- Generate unique referral links for users\\n- Track referrals and associate them with user accounts\\n- Implement a system to award credits based on successful referrals ($10 per referral)\\n\\n### 5. Stripe Integration for Billing\\n\\n- Set up Stripe account and integrate Stripe API\\n- Implement payment processing for paid plans\\n- Store billing information securely\\n\\n### 6. Usage Tracking and Limits\\n\\n- Implement a system to track user usage (e.g., API calls, processing time)\\n- Enforce usage limits based on user plan (e.g., $10 of credits for free tier)\\n- Notify users when approaching usage limits\\n- Implement automatic plan upgrades or service suspension when limits are reached\\n\\n## Implementation Plan\\n\\n1. Set up PostgreSQL database\\n   - Create database schema\\n   - Implement database connection in the backend\\n\\n2. Implement basic authentication for console app\\n   - Create user registration and login functionality\\n   - Store user credentials securely in the database\\n\\n3. Develop simple web interface for OAuth\\n   - Set up a basic web server\\n   - Create login page with Google and GitHub options\\n\\n4. Implement OAuth flow\\n   - Handle OAuth redirects and callbacks\\n   - Store OAuth tokens securely\\n\\n5. Integrate OAuth with console app\\n   - Implement browser redirection from console app\\n   - Handle OAuth token retrieval and storage\\n\\n6. Develop referral system\\n   - Generate and store referral links\\n   - Track referrals and associate with user accounts\\n\\n7. Implement usage tracking\\n   - Create system to log and calculate user usage\\n   - Store usage data in the database\\n\\n8. Integrate Stripe for billing\\n   - Set up Stripe account and API integration\\n   - Implement payment processing for paid plans\\n\\n9. Enforce usage limits\\n   - Implement checks for usage limits\\n   - Create notification system for approaching limits\\n   - Develop automatic plan upgrades or service suspension\\n\\n10. Refine and test the entire system\\n    - Conduct thorough testing of all components\\n    - Optimize performance and security\\n\\n## Considerations\\n\\n- Security: Ensure all user data, especially authentication and billing information, is encrypted and stored securely.\\n- Scalability: Design the database and backend to handle a growing number of users and increased usage.\\n- User Experience: Make the authentication process as smooth as possible, especially when redirecting to the browser for OAuth.\\n- Error Handling: Implement robust error handling and provide clear feedback to users.\\n- Documentation: Keep documentation up-to-date as new features are implemented.\\n\\n',\n    'backend/knowledge.md':\n      \"# Manicode Backend\\n\\nThis document provides an overview of the Manicode backend architecture, key components, and important concepts.\\n\\n## Table of Contents\\n\\n1. [Architecture Overview](#architecture-overview)\\n2. [Key Technologies](#key-technologies)\\n3. [Main Components](#main-components)\\n4. [WebSocket Communication](#websocket-communication)\\n5. [Claude Integration](#claude-integration)\\n6. [File Management](#file-management)\\n7. [Tool Handling](#tool-handling)\\n8. [Error Handling and Debugging](#error-handling-and-debugging)\\n9. [Build and Deployment](#build-and-deployment)\\n10. [Security Considerations](#security-considerations)\\n11. [TODO List](#todo-list)\\n12. [Automatic URL Detection and Scraping](#automatic-url-detection-and-scraping)\\n\\n## Architecture Overview\\n\\nThe Manicode backend is built on Node.js using TypeScript. It uses an Express server for HTTP requests and a WebSocket server for real-time communication with clients. The backend integrates with the Claude AI model to process user inputs and generate code changes.\\n\\n## Key Technologies\\n\\n- **TypeScript**: The primary language used for backend development.\\n- **Node.js**: The runtime environment for executing the backend server.\\n- **Express**: Web application framework for handling HTTP requests.\\n- **WebSocket (ws)**: Library for real-time, bidirectional communication between client and server.\\n- **Anthropic AI SDK**: Used for integrating with the Claude AI model.\\n\\n## Main Components\\n\\n1. **Express Server (index.ts)**: The main entry point for the backend application. It sets up the Express server and initializes the WebSocket server.\\n\\n2. **WebSocket Server (websockets/server.ts)**: Handles real-time communication with clients. It manages connections, message parsing, and routing of WebSocket messages.\\n\\n3. **Claude Integration (claude.ts)**: Provides functions for interacting with the Claude AI model, including streaming responses and handling tool calls.\\n\\n4. **Main Prompt Handler (main-prompt.ts)**: Processes user inputs, generates responses, and manages file changes and tool calls.\\n\\n5. **System Prompt Generator (system-prompt.ts)**: Creates the initial prompt for the AI assistant with project-specific context and instructions.\\n\\n6. **File Diff Generation (generate-diffs-prompt.ts, generate-diffs-via-expansion.ts)**: Generates diffs for file changes and handles expansion of shortened file content.\\n\\n7. **Relevant File Request (request-files-prompt.ts)**: Determines which files are relevant for a given user request.\\n\\n8. **Tools Definition (tools.ts)**: Defines the available tools that can be used by the AI assistant.\\n\\n## WebSocket Communication\\n\\nThe backend uses WebSockets for real-time, bidirectional communication with clients. Key concepts include:\\n\\n- **Message Types**: Various message types (e.g., 'identify', 'subscribe', 'action') for different operations.\\n- **Action Handling**: The `websocket-action.ts` file processes incoming action messages and triggers appropriate responses.\\n- **Subscription Management**: Clients can subscribe to specific topics for targeted updates.\\n\\n## Claude Integration\\n\\nThe backend integrates with the Claude AI model to process user inputs and generate code changes. Important aspects include:\\n\\n- **Streaming Responses**: Responses from Claude are streamed in real-time to the client.\\n- **Tool Calls**: The AI can make tool calls (e.g., reading files) during its processing.\\n- **File Change Management**: The backend processes AI-suggested file changes and applies them to the project.\\n\\n## File Management\\n\\nThe backend handles file operations for the Manicode project:\\n\\n- **Reading Files**: The `read_files` tool allows the AI to access project file contents.\\n- **Applying Changes**: The `applyChanges` function in `prompts.ts` processes and applies file modifications suggested by the AI.\\n\\n## Development Guidelines\\n\\n1. **Type Safety**: Utilize TypeScript's type system to ensure code reliability and catch errors early.\\n2. **Error Handling**: Implement proper error handling and logging throughout the application.\\n3. **Code Organization**: Keep related functionality grouped in appropriate modules and files.\\n4. **Documentation**: Maintain clear and up-to-date documentation, including this knowledge file.\\n5. **Testing**: Implement unit tests for critical components and functions.\\n6. **Environment Variables**: Use environment variables for configuration and sensitive information.\\n7. **Code Style**: Follow consistent coding style and use tools like Prettier for formatting.\\n\\n## Web Scraping\\n\\nThe backend now includes a web scraping tool that allows the AI assistant to retrieve content from external web pages. This functionality is useful for gathering information from documentation, APIs, or other web-based resources.\\n\\n- **Tool Name**: `scrape_web_page`\\n- **Input**: A URL of the web page to scrape\\n- **Output**: The content of the scraped web page\\n\\n## Tool Handling\\n\\nThe backend implements a tool handling system that allows the AI assistant to perform various actions:\\n\\n1. **Tool Definition**: Tools are defined in `tools.ts`, specifying their name, description, and input schema.\\n2. **Available Tools**: Current tools include read_files, scrape_web_page, search_manifold_markets, and run_terminal_command.\\n3. **Tool Execution**: When the AI makes a tool call, the backend processes it and provides the results back to the AI.\\n\\n## Error Handling and Debugging\\n\\n1. **Logging**: The `debug.ts` file provides logging functionality for debugging purposes.\\n2. **Error Catching**: WebSocket errors are caught and logged in both server and client code.\\n3. **Graceful Degradation**: The system attempts to handle errors gracefully, providing meaningful error messages when possible.\\n\\n## Build and Deployment\\n\\n1. **Build Process**: The backend uses TypeScript compilation to build the project.\\n2. **Docker Support**: A Dockerfile is provided for containerization of the backend.\\n3. **Deployment Script**: The `deploy.sh` script automates the build and deployment process to Google Cloud Platform.\\n\\n## Security Considerations\\n\\n1. **Environment Variables**: Sensitive information (e.g., API keys) is stored in environment variables.\\n2. **Input Validation**: User input is validated and sanitized before processing.\\n3. **File Access Restrictions**: File operations are restricted to the project directory to prevent unauthorized access.\\n\\n## TODO List\\n\\n1. Implement authentication and authorization for WebSocket connections.\\n2. Add more comprehensive error handling and logging.\\n3. Implement rate limiting for AI requests to manage resource usage.\\n4. Create a robust testing suite for backend components.\\n5. Optimize the file diff generation process for better reliability and performance.\\n\\n## Debugging Docker Issues\\n\\n- When encountering \\\"Cannot find module\\\" errors in a Docker container, it's important to verify the contents of the container itself, not just the local build.\\n- SSH access to the machine running the Docker container provides valuable debugging capabilities.\\n- The `dist` directory being correct locally doesn't guarantee it's correct inside the container.\\n- If a container is continuously restarting, it often indicates that the application is crashing immediately after starting. This prevents executing commands inside the container directly.\\n- The absence of the `dist` directory in the Docker container can cause \\\"Cannot find module\\\" errors, even if the directory exists locally.\\n\\n## Git and Docker Best Practices\\n\\n- The `dist` directory should be ignored by Git to avoid checking in build files.\\n- However, the `dist` directory needs to be included in the Docker image for the application to run correctly.\\n- The build process should occur before creating the Docker image to ensure the latest compiled files are included.\\n\\n## Prompts\\n\\nThe backend uses several prompts to guide the AI assistant's behavior:\\n\\n1. **System Prompt**: Initializes the AI assistant with project-specific context and instructions.\\n2. **Request Files Prompt**: Determines which files are relevant to a user's request.\\n3. **Main Prompt**: Processes the user's input and generates responses, including code changes.\\n\\n### Request Files Prompt\\n\\n- Located in `src/request-files-prompt.ts`\\n- Purpose: Identify all potentially relevant files for a user's request\\n- Key features:\\n  - Uses chain-of-thought reasoning to consider all possible relevant files\\n  - Aims to be comprehensive, requesting up to 100 files or more if necessary\\n  - Considers indirect dependencies and files that provide context\\n  - Outputs a thought process and a list of file paths\\n\\nThe Request Files Prompt is executed before the Main Prompt to ensure that all necessary files are loaded into the system context before processing the user's request.\\n\\n## File Diff Generation\\n\\nThe backend uses two main strategies for generating file diffs:\\n\\n1. **Diff Blocks Generation**: Implemented in `generate-diffs-prompt.ts`.\\n2. **Diff via Expansion**: Implemented in `generate-diffs-via-expansion.ts`.\\n\",\n    'knowledge.md':\n      \"# Manicode\\n\\nManicode is a tool for editing codebases via natural language instruction to Manny, an expert AI programming assistant.\\n\\n## File Change Management\\n\\nManicode uses the generate diffs by expansion strategy for managing file changes. This approach has Haiku expand a file with placeholders into the full file, and then generates string patches instead of search and replace blocks.\\n\\nKey points:\\n- The FileChanges type is an array of string patches.\\n- The mainPrompt function uses the generatePatch function from generate-diffs-via-expansion.ts to create patches.\\n- The client-side code applies patches using the applyPatch function from the 'diff' library.\\n\\nThis change improves the accuracy and reliability of file modifications, especially for complex changes or when dealing with large files.\\n\\n## Project Goals\\n\\n1. **Developer Productivity**: Reduce the time and effort required for common programming tasks, allowing developers to focus on higher-level problem-solving.\\n\\n2. **Learning and Adaptation**: Develop a system that learns from user interactions and improves its assistance over time.\\n\\n3. **Focus on power users**: Make expert software engineers move even faster.\\n\\n## Key Technologies\\n\\n- **TypeScript**: The primary programming language used throughout the project.\\n- **Node.js**: The runtime environment for executing the application.\\n- **WebSockets**: Used for real-time communication between the client and server.\\n- **Claude AI**: Powers Manny, the AI programming assistant.\\n\\n## Project Structure\\n\\nThere are three top-level code directories:\\n- `common`: Contains shared code and utilities used across the project.\\n- `backend`: Houses the server-side code and API implementation.\\n- `src`: Contains the main application source code.\\n\\n## Main Components\\n\\n1. **Claude Integration**: Processes natural language instructions and generates code changes.\\n2. **WebSocket Server**: Handles real-time communication between the client and the backend.\\n3. **File Management**: Reads, parses, and modifies project files.\\n4. **Action Handling**: Processes various client and server actions.\\n5. **Message History**: Manages conversation history between the user and Manny.\\n6. **Chat Storage**: Persists chat sessions and allows users to manage multiple conversations.\\n7. **Knowledge Management**: Handles the creation, updating, and organization of knowledge files.\\n8. **Terminal Command Execution**: Allows Manny to run shell commands in the user's terminal.\\n\\n## Important Files\\n\\n- `backend/src/claude.ts`: Interacts with the Claude AI model.\\n- `backend/src/server.ts`: Sets up the WebSocket server.\\n- `common/src/actions.ts`: Defines schemas for client and server actions.\\n- `src/project-files.ts`: Handles project file operations.\\n- `src/index.ts`: Contains main application logic and user input handling.\\n- `knowledge.md`: Stores project-wide knowledge and best practices.\\n\\n## Development Guidelines\\n\\n1. Use TypeScript for all new code to maintain type safety.\\n2. Follow existing code structure and naming conventions.\\n3. Ensure alternating user and Manny messages in conversation history.\\n4. Update knowledge files for significant changes or new features.\\n5. Write clear, concise comments and documentation for complex logic.\\n6. Remember that imports automatically remove 'src' from the path. When editing files, always include 'src' in the file path if it's part of the actual directory structure.\\n\\n## Knowledge Management\\n\\n- Knowledge is stored in `knowledge.md` files, which can be created in relevant directories throughout the project.\\n- Manny automatically updates knowledge files when learning new information or correcting mistakes.\\n- Developers are encouraged to review and commit knowledge file changes to share insights across the team.\\n\\n## Terminal Command Execution\\n\\nManny can now execute terminal commands using the `run_terminal_command` tool. This feature allows Manny to perform various tasks such as:\\n\\n- Searching files with grep\\n- Installing dependencies\\n- Running build or test scripts\\n- Checking versions of installed tools\\n- Performing git operations\\n- Creating, moving, or deleting files and directories\\n\\n## Important Constraints\\n\\n- **Max Tokens Limit**: The context for Claude AI has a maximum limit of 200,000 tokens. This is an important constraint to consider when designing prompts and managing project file information.\\n\\n## WebSocket Communication Flow\\n\\n1. Client connects to the WebSocket server.\\n2. Client sends user input and file context to the server.\\n3. Server processes the input using Claude AI.\\n4. Server streams response chunks back to the client.\\n5. Client receives and displays the response in real-time.\\n6. Server sends file changes to the client for application.\\n\\n## File Versioning System\\n\\n- The ChatStorage class manages file versions for each chat session.\\n- Users can navigate between file versions using CTRL+U (undo) and CTRL+R (redo).\\n- File versions are stored as snapshots of the entire file state at each change.\\n\\n## Tool Handling System\\n\\n- Tools are defined in `common/src/util/tools.ts` and implemented in `npm-app/src/tool-handlers.ts`.\\n- Available tools: read_files, scrape_web_page, search_manifold_markets, run_terminal_command.\\n- The backend uses tool calls to request additional information or perform actions.\\n- The client-side handles tool calls and sends results back to the server.\\n\\n## CLI Interface Features\\n\\n- Non-canonical mode for improved key handling.\\n- Navigation using arrow keys for input and command history.\\n- File version control using CTRL+U and CTRL+R.\\n- ESC key to toggle menu or stop AI response.\\n- CTRL+C to exit the application.\\n\\n## Build and Publish Process\\n\\n- The `prepublishOnly` script runs `clean-package.js` before publishing.\\n- `clean-package.js` modifies `package.json` to remove unnecessary information.\\n- The `postpublish` script restores the original `package.json`.\\n- NODE_ENV is set to 'production' for the published package at runtime.\\n\\n## Error Handling and Debugging\\n\\n- The `debug.ts` file provides logging functionality for debugging.\\n- Error messages are logged to the console and, in some cases, to a debug log file.\\n- WebSocket errors are caught and logged in the server and client code.\\n\\n## Security Considerations\\n\\n- The project uses environment variables for sensitive information (e.g., API keys).\\n- WebSocket connections should be secured in production (e.g., using WSS).\\n- User input is validated and sanitized before processing.\\n- File operations are restricted to the project directory to prevent unauthorized access.\\n\\n## TODO\\n- Implement authentication and authorization for WebSocket connections.\\n- Add more comprehensive error handling and logging.\\n- Implement rate limiting for AI requests to manage resource usage.\\n- Create a robust testing suite for all components.\\n\\n# Code guide\\n\\n- We don't specify return types for functions, since Typescript will infer them. \\n- Always include 'src' in file paths when it's part of the actual directory structure, even though imports automatically remove it. \\n\\n## Python Package\\n\\nA Python package for Manicode has been created as a skeleton in python-app. Key points:\\n\\n- It's currently a placeholder that prints a message about the package coming soon and suggests installing the npm version.\\n\\n- The Python package is intended to be developed further in the future to provide similar functionality to the npm version.\\n\\n## Version Checking\\n\\nThe Manicode backend implements a version checking mechanism to ensure clients are using the latest version:\\n\\n1. The client sends its version using the 'check-npm-version' action.\\n2. The server compares this version with the one in backend/package.json.\\n3. The server responds with a 'npm-version-status' action, indicating if the client is up-to-date.\\n4. The backend/package.json version is updated during the build process by the build-version-info.js script, which copies the version from npm-app/package.json.\\n\\nTo maintain correct versioning:\\n- Always update the version in npm-app/package.json when making releases.\\n- Run `bun run build` to ensure backend/package.json is updated before deployment.\\n- Implement proper error handling for version mismatches in both client and server code.\\n\",\n    'musings.knowledge.md':\n      \"This file contains various ideas about how Manicode could work. Most of them are not what we'll end up doing, but it gives some flavor of the strategy.\\n\\n\\n- Gather knowledge from users\\n    - Through terminal\\n        - [Manilearn.sh](http://Manilearn.sh) that just asks you questions\\n        - Have an npm package so you can do `yarn manicode` or `yarn manilearn`? Or executable.\\n        - Or, make manilearn an exclusively web app thing?\\n            - Manicode should still send new knowledge as it learns when the user teaches it something it got wrong. It should condense that knowledge into a few sentences and an example of wrong and right.\\n    - Through web app\\n        - Add long form knowledge or short points\\n            - Use markdown. With an editor that lets you insert code snippets\\n        - Search over existing knowledge and edit or remove it\\n        - Edit code from your browser???\\n            - It could just create changes and you could approve them.\\n            - You keep telling it to tweak stuff in just text. When satisfied, you hit the commit button. There is no commit message; that is generated. (commit message ends with “—manicode”)\\n            - Might not be worth even having a terminal. You could just connect to github. Then you have permanent access to the files\\n                - Some day it should just represent the code diffs itself and not use github except to read the current state of files.\\n- Use it to prompt claude sonnet 3.5 in a repl, with learnings for how to get it to edit files\\n- Have own script to gather info from codebase\\n    - File structure\\n    - Exported tokens\\n    - Claude summary of each directory, computed recursively\\n    - Try to find database schema. If not, ask for a file where it exists, or let them paste it in.\\n    - Try to find api schema. If not ask where it is.\\n    - Overall knowledge of tech stack and how the technologies are used.\\n    \\n\\n## Problems\\n\\n- ~~It’s hard to get it to edit the files properly~~\\n    - It defaults to a lazy style of specifying the changes where it writes the line it’s adding and adds a comment saying “// the next part is the same as before”\\n    - When you do force it into a framework, like with <replace> and <with> blocks, it is more likely to forget imports and other small changes\\n    - Should try again with getting it to specify things naturally and then translate that into replace blocks with another claude call?\\n        - [J] I did this, and it seems to be working.\\n    - Add it to the system prompt to ingrain the replace-with structure?\\n    - Use <A> and <B> tags in hopes that it will be less lazy?\\n- [x]  It cuts off after a long change\\n- What’s the app structure of Manicode?\\n    - Users should use it as a console application\\n    - They should install it as an npm package (later: python package)\\n    - It has a basic console application that communicates with the server\\n        - has to reveal a significant portion of the algorithm\\n            - Unless we upload their whole codebase to the server?\\n        - Upload files to our server vs. thin wrapper calls to claude that go through our server\\n            - The latter still does upload files to our server. It applies the edits locally (which we might still do under the previous approach). It does reveal the prompts\\n        - Call claude directly. Can’t leak our key, but they could set theirs\\n            - This is a bad user experience, so no\\n        - Winner is upload files to server.\\n            - But we can do it just-in-time?\\n                - Send list of files and exports up on init\\n                - Send files when claude asks for them\\n            - Vs. Maintain files\\n                - We might move in this direction over time. But it’s easier to start with just-in-time fetching of files\\n    - Node application on client\\n        - Reads files, Reads user input\\n        - Maintains a websocket with server where we send files and user input, and receive claude’s output chats + file updates\\n    - Server\\n        - Maintains websockets with clients\\n        - Makes calls to Claude\\n\\n## Stages\\n\\n- Discussion\\n    \\n    I want to maximize learning while not doing duplicate work. I’m working toward an application that other people can try out. Their dogfooding will be important.\\n    \\n    I’m already confident enough that I want to build out this prototype app.\\n    \\n    - Seems like the tool calls will be necessary for external use. So I want to try that\\n    - The way the app tracks lessons will be key to how it is used. So I can also try implementing that to get some iteration in there.\\n    - Only after that should I ship the prototype, and have manifold people start using it (they can add knowledge) to get feedback.\\n- [x]  Local manicode script\\n- [x]  Set up server\\n- [x]  Make claude calls via server\\n    - Just a user prompt and file information sent via websocket\\n    - Server then runs all the claude calls, and streams the response, including file changes to apply\\n- [x]  Tool calls to fetch the files\\n    - Necessary for codebases where I can’t load all the files into context (unlike manicode)\\n- [ ]  Track lessons\\n    - Go to non-canonical mode for terminal.\\n    - Set up menu system\\n        - Can cancel out of an ongoing prompt.\\n        - Use up and down arrows to go through history of prompts\\n        - After prompt finishes, you have menu options\\n            - Space: continue\\n            - r: revert change\\n            - l: add a lesson based on this change and possibly previous changes in the conversation\\n            - Esc: back to prompt creation\\n                - Esc: main menu\\n                    - l: lessons. You can type a lesson or scroll through history of lessons\\n                    - Space: go to a new prompt\\n                    - Esc: quit application\\n    - Save lessons locally? .manicode file\\n        - A lot simpler techically than trying to merge your knowledge with other team members\\n        - You know all the knowledge added. It conforms to your own style.\\n        - But, most of the codebase knowledge is in common. You are just creating more work for each engineer.\\n            - Allow users to export and import lessons!\\n        - Alternately, users commit their lessons to a tracked file (lessons.manicode.md). People can view and modify the lessons others have added. (or they can add to git ignore)\\n            - This is great. It’s super transparent, and can use existing coding tools like git, or text editors to update the lessons.\\n            - It supports the single player and multiplayer use cases.\\n            - Markdown file with lessons separated by dividers: ‘—-’\\n            - Can create lessons in any directory and they are all added in, with the path.\\n                - Allows you to better organize your knowledge if you have hundreds of lessons. Makes it easier for you to find and update stuff.\\n            - Users will rapidly iterate to create the best knowledge. It’s basically prompt engineering lol\\n                - What about lessons within the code? A long comment that can be added to knowledge.\\n        - Potentially just called `knowledge.md`, so every application can use it and update it.\\n            - Wait, this is very similar to README.md!\\n                - But also, it’s not for exactly the same purpose. It’s for the machine. I think that means it could be worth having it’s own file.\\n            - Could just give up on discrete lessons, and have the llm update the knowledge file for you in markdown. Hierarchical info is better anyway, with the headings.\\n                - Track your progress by the number of characters of knowledge instead!\\n        - Manicode is good at editing files!\\n        - `knowledge.md` files should be created in the relevant directory for the info.\\n            - Manicode will edit your .gitignore to include them (if you startup without any pre-existing knowledge files), but recommend you actually commit them.\\n                - Or, maybe it won’t. Because knowledge files are such a good idea.\\n        - Manicode should not ask, it should just add knowledge whenever it feels like. That’s an even better experience.\\n        - You can run manicode from any directory, and it only sees inside the directory it is run from.\\n            - E.g. if you want to cd into backend to reduce the scope of what it can see and change\\n        - To start, there’re no user settings. No saved data. You pay a subscription which limits your usage per month.\\n        - We should prompt manicode to freely edit knowledge files when it learns something. You can just tell it it did something wrong and it will unprompted add knowledge. You of course review the changes as file diffs.\\n            - It can use a tool call? Or, nope, it just adds knowledge files and edits them all the time.\\n        - You put in a credit card. It charges based on usage. $20 at a time. It emails you when it charges again. No subscription plan! Just pay for what you use, man.\\n            - Simply charge 2x of what anthropic charges. Done.\\n            - Subscriptions are annoying and are stealing from you when you don’t use it all.\\n            - Alternately, you get a bill at the end of the month and pay then. That’s what cloud compute companies do. This is a better user experience. Maybe with a one-time activation fee ($10).\\n        - Signup is email & credit card\\n            - You get a private key which you use to bill your credit card. Can spread among your team. Or regenerate it.\\n- [ ]  Npm package\\n    - Install -g manicode and run it in manifold codebase\\n    - Host a prod server\\n- [ ]  Add postgres\\n\\n## Ideas\\n\\n- Use “tools” to have the llm able to ask for a file, we send it to our server, and then add it to the claude call’s context, and continue generating\\n- Console application can turn off canonical mode (I think that’s what it was?) and then accept more rich input\\n- Effort modes: 1 minutes, 15 minutes, 2 hours\\n    - Response instantly, or work hard to come up with good design and a fuller implementation\\n- Use [Greptile](https://www.greptile.com/) to index the code base and ask it knowledge questions to become context\\n- Focus on learning after usage and ask for how to do better\\n    - Explicitly ask the user to list out separate lessons. Have gpt compile the learnings with the rest of the context to produce knowledge entries\\n        - Enter up to 3 lessons\\n    - Tell them this is how it will improve. It won’t make the mistake again! (probably)\\n    - Show ‘x%’ rating toward becoming a seasoned engineer, and increase it with every bit of knowledge (Every percent is one piece of knowldge)\\n        - “5% trained - Junior engineer”\\n        - Give a new title every 10%. After 100%, keep giving new titles on larger intervals\\n        - New idea: 1% per commit to a knowledge file\\n- Viral\\n    - Share manicode rank\\n    - Share wins: Your prompt, and the result\\n    - Refer friends. Get $15 credit each\\n\\n\\n\\nWish list\\n- Give the assistant full command of the terminal so it can run stuff like `yarn add` or `git commit`\\n- Use the up and down arrow keys to scroll through previous messages. Use escape to show menu, and keys to navigate (e.g. to create a new chat, exit, etc.)\\n- Add a rigorous testing suite to make sure each prompt is working as intended across many cases.\\n- Save conversations locally in a file. Maybe .manicode? Include a setting for setting the root directory (and thus defaulting to running manicode in that directory so it can always see the whole project)?\\n\",\n    'npm-app/knowledge.md':\n      \"# Manicode Project Structure\\n\\n## Overview\\n\\nManicode is an AI-powered development assistant that runs from the command line. It has access to all files in your project and can carry out various tasks.\\n\\n## Project Structure\\n\\n### Root Directory\\n\\n- `package.json`: Defines the project dependencies, scripts, and metadata.\\n- `tsconfig.json`: TypeScript configuration file.\\n- `README.md`: Project documentation and usage instructions.\\n\\n### Source Code (`src/`)\\n\\nThe `src/` directory contains the main TypeScript source files:\\n\\n- `index.ts`: Entry point of the application. Sets up the main `manicode` function.\\n- `chat-client.ts`: Implements the `ChatClient` class for handling WebSocket communication.\\n- `config.ts`: Contains configuration-related functions and constants.\\n- `chat-storage.ts`: Manages chat storage functionality.\\n- `cli.ts`: Implements the Command Line Interface.\\n- `project-files.ts`: Handles project file operations.\\n\\n### Build Output (`dist/`)\\n\\nThe `dist/` directory contains the compiled JavaScript files and is created during the build process.\\n\\n## Project File Handling\\n\\n- Manny can only view files that are not gitignored. This is partially to save tokens when we list out all the files.\\n- Multiple `.gitignore` files can exist throughout the project structure.\\n- When traversing the project structure, we need to accumulate and apply ignore patterns from all encountered `.gitignore` files.\\n\\n## Key Components\\n\\n1. **ChatClient**: Manages WebSocket communication with the server, handles subscriptions, and processes messages.\\n\\n2. **ChatStorage**: Responsible for storing and managing chat data.\\n\\n3. **CLI**: Implements the command-line interface for user interaction.\\n\\n4. **Config**: Handles environment variables and configuration settings.\\n\\n## Build Process\\n\\nThe build process is defined in `package.json`:\\n\\n1. Builds the `common` project (located in a sibling directory).\\n2. Builds the `npm-app` project using TypeScript.\\n3. Copies necessary files from the `common` project and the current project to the `dist/` directory.\\n\\n## Dependencies\\n\\n- ts-pattern: Used for pattern matching in TypeScript. Installed to improve type safety and readability when checking message types.\\n\\n- The project depends on a `common` package (version 1.0.0) which is likely a shared library.\\n- Uses `lodash` for utility functions.\\n- TypeScript is used for development.\\n\\n## TypeScript Configuration\\n\\n- The project uses CommonJS modules.\\n- Strict type checking is enabled.\\n- The `common/*` path is mapped to `../common/dist/*` for importing shared components.\\n\\n## Usage\\n\\nManicode can be started by running the `manicode` command in the terminal after installation. It provides a menu interface (accessible by pressing `Esc`) and allows navigation through file versions using arrow keys.\\n\\n## Knowledge Management\\n\\nManicode encourages storing knowledge alongside code using `knowledge.md` files. These files provide context, guidance, and tips for the AI as it performs tasks.\\n\\n## Build and Publish Process\\n\\nWhen publishing the Manicode package, we use a custom process to ensure that only necessary information is included in the published package and that the environment is set correctly:\\n\\n1. The `prepublishOnly` script runs `clean-package.js` before publishing.\\n2. `clean-package.js` does the following:\\n   - Saves the current `package.json` to `temp.package.json`.\\n   - Modifies the original `package.json` by removing `devDependencies`, `peerDependencies`, and unnecessary `scripts`.\\n   - Writes the modified `package.json` back to its original location.\\n   - Adds `process.env.NODE_ENV = 'production';` as the second line of `dist/index.js`.\\n3. npm publishes the package using the modified `package.json`.\\n4. The `postpublish` script restores the original `package.json` from `temp.package.json` and then deletes the temporary file.\\n\\nThis approach ensures that:\\n\\n- The published package only includes necessary dependencies and scripts.\\n- The development environment remains intact after publishing.\\n- NODE_ENV is set to 'production' for the published package at runtime.\\n\\nTo publish the package:\\n\\n```bash\\nnpm publish\\n```\\n\\nThis will automatically run the `prepublishOnly` and `postpublish` scripts to handle the `package.json` modifications, environment setting, and cleanup.\\n\\nRemember to increment the version number in `package.json` before publishing a new version.\\n\\n## Package Management\\n\\nManicode uses Bun as its package manager. Always use Bun commands for managing dependencies instead of npm.\\n\\nKey points:\\n\\n- Use `bun add <package-name>` to install new packages.\\n- Use `bun remove <package-name>` to remove packages.\\n- Use `bun install` to install all dependencies after cloning the repository.\\n\\n## CLI Functionality\\n\\nThe CLI (Command Line Interface) has been updated to provide a more standard terminal experience:\\n\\n1. **Input Handling**: Uses the `readline` module for improved key handling.\\n2. **Navigation**:\\n   - Left and right arrow keys move the cursor within the input.\\n   - Up and down arrow keys navigate through command history.\\n3. **File Version Control**:\\n   - `Ctrl+U`: Undo file changes (navigate to previous version)\\n   - `Ctrl+R`: Redo file changes (navigate to next version)\\n4. **Application Control**:\\n   - `Ctrl+C`: Exit the application\\n   - `Esc`: Toggle menu or stop the current AI response\\n5. **Input Submission**: Press Enter to submit the current input.\\n\\nThese changes aim to provide a more intuitive and familiar experience for users while maintaining the unique features of Manicode.\\n\\n## Note on Project Evolution\\n\\nAs an AI-powered tool, Manicode is designed to learn and evolve. It can update knowledge files as it works, improving its understanding and capabilities over time.\\n\\n## WebSocket Communication\\n\\nThe `Client` class in `client.ts` manages WebSocket communication with the server:\\n\\n- Connects to the WebSocket server specified in the configuration.\\n- Sends user input and receives responses from the AI.\\n- Handles tool calls and their responses.\\n- Manages the response stream, allowing for real-time updates and the ability to stop ongoing responses.\\n\\n## File Management\\n\\nThe `project-files.ts` module handles all file-related operations:\\n\\n- Reads and writes files within the project directory.\\n- Traverses the project structure, respecting `.gitignore` files.\\n- Applies changes to files based on AI suggestions.\\n- Manages file versioning for undo/redo functionality.\\n\\n## Tool Handlers\\n\\nThe `tool-handlers.ts` file implements handlers for various tools:\\n\\n- `read_files`: Reads contents of specified files.\\n- `scrape_web_page`: Retrieves content from a given URL.\\n- `search_manifold_markets`: Searches for relevant prediction markets.\\n- `run_terminal_command`: Executes shell commands in the user's terminal.\\n\\nThese tools extend Manicode's capabilities, allowing it to gather information and perform actions beyond simple code manipulation.\\n\\n## Error Handling\\n\\nError handling is implemented throughout the application:\\n\\n- WebSocket connection errors are caught and logged.\\n- File read/write errors are handled gracefully.\\n- Tool execution errors are captured and reported back to the AI.\\n\\nDevelopers should continue to improve error handling to ensure a smooth user experience and easier debugging.\\n\\n## Security Considerations\\n\\n- The application runs commands in the user's terminal, which could potentially be dangerous. Users should be cautious when using Manicode on sensitive projects.\\n- File operations are restricted to the project directory to prevent unauthorized access to the user's system.\\n- Web scraping and external API calls (e.g., Manifold Markets) should be used responsibly and in compliance with the respective services' terms of use.\\n\\n## Future Improvements\\n\\n1. Implement user authentication for the WebSocket connection.\\n2. Add more robust error handling and user-friendly error messages.\\n3. Implement a caching system for frequently accessed files to improve performance.\\n4. Create a comprehensive test suite to ensure reliability across different environments.\\n5. Enhance the CLI with more features, such as chat history browsing and export/import functionality.\\n\\n## User Input ID System\\n\\n1. Each user input generates a unique user input ID (using nanoid) on the client-side.\\n2. The user input ID is passed to the server with the user input.\\n3. All related responses, including tool calls and response chunks, include this user input ID.\\n4. The user input ID remains consistent for all interactions related to a single user input.\\n\\nThis system allows for better tracking and correlation of user inputs with their corresponding responses and tool calls, while avoiding potential conflicts with individual message IDs.\\n\\n## Version Checking\\n\\n- The `Client` class in `client.ts` includes a subscription to 'npm-version-status' that checks if the current version is up to date.\\n- If a newer version is available, a warning is displayed in yellow text.\\n- Users are instructed to update using the command: `npm install -g manicode`\\n- The version check is performed as part of the WebSocket subscription setup.\\n\\n## End of Document\\n\",\n    'python-app/knowledge.md':\n      '# Manicode Project Knowledge\\n\\n## Project Structure\\n\\nThe Manicode project follows the modern Python packaging structure:\\n\\n- `pyproject.toml`: Contains project metadata and build system requirements.\\n- `src/manicode/`: Source code directory.\\n- `tests/`: Directory for test files (currently empty).\\n- `dist/`: Contains distribution files after building the package.\\n- `LICENSE`: MIT License file.\\n- `README.md`: Project description and usage instructions.\\n\\n## Build System\\n\\n- Uses `setuptools` as the build backend.\\n- Configured to use the `src` layout for better separation of source code.\\n\\n## Package Information\\n\\n- Name: manicode\\n- Description: An AI-powered coding assistant (coming soon)\\n- Requires Python 3.6 or later\\n\\n## Distribution\\n\\n- The project can be built using the `build` package: `python -m build`\\n- This creates both source (.tar.gz) and wheel (.whl) distributions in the `dist/` directory.\\n\\n## Development\\n\\n- For local development, install the package in editable mode: `pip install -e .`\\n- Remember to update the version in `pyproject.toml` when making new releases.\\n\\n## Next Steps\\n\\n- Implement the main functionality of the AI-powered coding assistant.\\n- Add tests in the `tests/` directory.\\n- Update `README.md` with detailed usage instructions as features are developed.\\n\\n## Important Notes\\n\\n- The package currently uses a console script entry point, which should be implemented in the `manicode/__init__.py` file.\\n- The project is in a pre-alpha state and not yet ready for public release.\\n\\nRemember to keep this knowledge file updated as the project evolves.\\n',\n    'todo.knowledge.md':\n      \"[x] Should indicate if diff is still generating somehow...\\n    - send to client the file changes still planned. Wait for them before allowing user input?\\n- Improve speed by prompting it to rely more on diffs instead of reproducing the whole file\\n[x] Prompt engineer it to automatically make knowledge changes when you correct it\\n[x] it's doing a poor job loading all the relevant files into context. Need to add more explicity steps for this.\\n[x] Indenting fails when it makes multiple changes with different indent levels.\\n[x] More chain of thought for main prompt. <planning> blocks, <code_review>, <brainstorm>, etc.\\n[x] Delete files\\n[x] Shift + Enter, and pasting in stuff with new lines. Update: not really possible\\n\\n[x] Failed to replace in the new contents (but did expand it for the old content):\\n// ... (keep the existing setup code)\\n[x] Continuation 2 led to infinite responses\\n[x] cancelling before the prompt starts being genereated leads to error of two user messages in a row\\n- Show commands available in a bar under the input (not sure if this is possible)\\n[x] Escalate when old diff does not match. Got case where a helper function in the middle of two others was moved up, but diff didn't match because it ignored the helper function.\\n[x] Stuck in loop: Prompting claude num messages: 21, continuing to generate\\n[x] Backspace after typing more than one line is buggy\\n\\n[x] Dawson's case of wanting it to scrape documentation from a url and answer questions with it.\\n- x% knowledge written in menu based on number of commits to knowledge files\\n[x] How it could run bash:\\n1. First, let's build the `common` package:\\n\\n```bash\\ncd common\\nyarn build\\ncd ..\\n```\\nImportant. Can use commandline to search for code. Could move files.\\n\\n[x] Try asking first if the complete file is listed, and then automatically generate diffs.\\n\\n[] create some structure in a knowledge file for users to initially fill out.\\n- Project overview\\n - Goals\\n - Project structure\\n - Coding do's and don'ts\\n\\n [] reverting doesn't work with created files\\n [x] File paths using too much context?\\n [x] Error on server didn't print the error (or maybe it did and the terminal overwrote it...)\\n [x] Change ip address to be from api.manicode.ai\\n\\nNotes from Janna & Stephen test\\n[x] backspace on windows doesn't clear the char, just moves cursor\\n[x] Tried to do left arrow and it didn't work\\n[x] Failed to apply any edits. They all failed even after a second attempt. This was on Windows\\n[x] CTRL-C doesn't work\\n\\n[] Kill if it continues too far without user prompt.\\n[] Prompt it not to generate the whole file when just making a local edit. Consider just reproducting the function edited. Or a block a code.\\n    - Before editing a file, get it to say what changes it will make and then edit just those sections.\\n[x] Consider confirming with the user whether to go ahead and make a change if not that confident or want more input from the user\\n[] Force updates: run the command to update app.\\n[] Store previous user input's and always include that history in system prompt.\\n    - Can also allow you to press up arrow to go through whole history\\n[x] Changes prompt is printing object for most previous messages in message history\\n[x] It keeps requesting files that are already in its context. Need to highlight those paths again somewhere?\\n    - Requests a file before editing that it just got.\\n[] Knowledge files should be treated more like regular files, but with system prompts to frequently include them\\n\\n\\n-- Instead, of below, apply edits immediately. Track all changes for a message via an id. Fix conccurent request by subscribing/unsubscribing to response with id.\\n[x] Give it a new marker token that will await all file changes, so then it can run tsc or tests, etc.\\n    - It is using grep to see if changes went through, but they haven't so gets in a loop.\\n    - Realized we could just apply the edits before the tool call. We were already passing them through.\\n[x] Was able to start a concurrent request after cancelling the last one...\\n[] Changes behavior like removing if guard if statements at the top, removing cases of logs/errors, adds <form>. It should only do the minimal change and assume existing code is there for a reason.\\n[x] Terminal command that doesn't finish bricks manicode\\n[x] Easy to forget to run it in root directory.\\n[x] Allow pasting new lines based on timing strategy\\n[] It's not saving useful info like that this is a Windows machine and it shouldn't be using grep into a knowledge file.\\n[x] Budget of tokens when reading files, and skip files that put it over the limit.\\n[x] Still does too many extra things\\n[x] Doesn't consistently request new files when it needs to\\n[x] Scrape urls by default, like we request files by default\\n[x] The user may have edited files since your last change. Please try to notice and perserve those changes. Don't overwrite these please!\\n[x] Show a message when manicode is out of date. Or figure out how to automatically update.\\n[] The \\\"// add this blah\\\" comments are really annoying. Strip them out in the diff step\\n[x] The comprehensive files list generates a huge amount of thinking that is probably slow\\n[x] Try a lower temperature. Might prevent it from doing random stuff. \\n    - apparently it's been 0 this whole time, huh (for claude)\\n    - Also openai defaults to 0\\n[] Add current file diff from main into context (git status/git diff?)\\n\\n[] It thought that update_file_context would create a file? (a knowledge file?)\\n[] Claude doesn't leave a comment that there's more code in between when it should. Then lots gets deleted\\n[] Try using the native stop marker feature\\n[] Use tree sitter to include exported tokens ttps://github.com/tree-sitter/node-tree-sitter\\n    See how github implemented code search: ttps://docs.github.com/en/repositories/working-with-files/using-files/navigating-code-on-github#precise-and-search-based-navigation\\n[] Multiple file blocks for the same file could fail to patch\\n[] Still hallucinating without getting the file: Totally destroyed my package .json by removing random scripts & dependencies, changing a bunch of stuff around\\n[] Create tests for the full user input. Set up fake project data for this.\\n[] Use gpt-4o mini to grade tests\\n\\n[] Updated a function in a file, but didn't include comments at the top or bottom for existing code\\n[] Looks in wrong directory for a file, e.g. web/components/comments instead of web/components/buttons\\n    web/components/profile/profile-comments.tsx instead of web/components/comments/profile-comments.tsx\\n[] Ari: editing is failing: deleting sections of code it shouldn't.\\n    - [J] Removes commented out code, other comments\\n[] Doesn't give up control after running terminal commands. Just keeps running more\\n[] Says reconnected, but actually doesn't go after\\n[] Run in a containerls\\n    - Maybe distribute as brew package which would have more permissions?\\n    - Check files being edited to be within project dir (no '..')\\n[x] Send a command, then just run it. if it goes through, print.\\n    - thefuck util that could change \\n    - should look more like shell\\n    - could have two panel one for you, other shows claude's response. Claude's commands go on your side\\n[] Got file path wrong: backend instead of npm-app for project-files\\n[] Still is overwritting a user's change every time\",\n  },\n  gitChanges: {\n    status:\n      'On branch me/knowledge-files\\nYour branch is up to date with \\'origin/me/knowledge-files\\'.\\n\\nChanges not staged for commit:\\n  (use \"git add <file>...\" to update what will be committed)\\n  (use \"git restore <file>...\" to discard changes in working directory)\\n\\tmodified:   backend/src/generate-knowledge-files.ts\\n\\tmodified:   npm-app/src/web-scraper.ts\\n\\nUntracked files:\\n  (use \"git add <file>...\" to include in what will be committed)\\n\\ttest/__src__/generate-knowledge-files.test.ts\\n\\nno changes added to commit (use \"git add\" and/or \"git commit -a\")\\n',\n    diff: \"diff --git a/backend/src/generate-knowledge-files.ts b/backend/src/generate-knowledge-files.ts\\nindex 4ac8920..d7377ae 100644\\n--- a/backend/src/generate-knowledge-files.ts\\n+++ b/backend/src/generate-knowledge-files.ts\\n@@ -13,6 +13,11 @@ export async function generateKnowledgeFiles(\\n   fileContext: ProjectFileContext,\\n   initialMessages: Message[]\\n ): Promise<Promise<FileChange>[]> {\\n+  console.log('generateKnowledgeFiles', {\\n+    fullResponse,\\n+    fileContext,\\n+    initialMessages,\\n+  })\\n   const systemPrompt = `\\n     You are an assistant that helps developers create knowledge files for their codebase. You are helpful and concise, knowing exactly when enough information has been gathered to create a knowledge file. Here's some more information on knowledge files:\\n     ${knowledgeFilesPrompt}\\ndiff --git a/npm-app/src/web-scraper.ts b/npm-app/src/web-scraper.ts\\nindex ce679ce..7d04eb7 100644\\n--- a/npm-app/src/web-scraper.ts\\n+++ b/npm-app/src/web-scraper.ts\\n@@ -2,12 +2,18 @@ import axios from 'axios'\\n import * as cheerio from 'cheerio'\\n \\n // Global cache for scraped web pages\\n-const scrapedPagesCache: Record<string, string> = {}\\n+const scrapedPagesCache: Record<string, { content: string; timestamp: number }> = {}\\n+\\n+// Cache expiration time (in milliseconds)\\n+const CACHE_EXPIRATION = 60 * 60 * 1000 // 1 hour\\n \\n export async function scrapeWebPage(url: string) {\\n-  // Check if the page is already in the cache\\n-  if (scrapedPagesCache[url] !== undefined) {\\n-    return scrapedPagesCache[url]\\n+  const now = Date.now()\\n+  const cachedData = scrapedPagesCache[url]\\n+\\n+  // Check if the page is already in the cache and not expired\\n+  if (cachedData && now - cachedData.timestamp < CACHE_EXPIRATION) {\\n+    return cachedData.content\\n   }\\n \\n   try {\\n@@ -18,8 +24,8 @@ export async function scrapeWebPage(url: string) {\\n     // Extract the main content (you may need to adjust this selector based on the target websites)\\n     const content = $('body').text()\\n \\n-    // Store the scraped content in the cache\\n-    scrapedPagesCache[url] = content\\n+    // Store the scraped content in the cache with the current timestamp\\n+    scrapedPagesCache[url] = { content, timestamp: now }\\n \\n     return content\\n   } catch (error) {\\n@@ -27,7 +33,7 @@ export async function scrapeWebPage(url: string) {\\n     //   `Error scraping web page ${url}:`,\\n     //   error instanceof Error ? error.message : error\\n     // )\\n-    scrapedPagesCache[url] = ''\\n+    scrapedPagesCache[url] = { content: '', timestamp: now }\\n     return ''\\n   }\\n }\\n\",\n    diffCached: '',\n    lastCommitMessages:\n      \"Add edits made by assistant into the response message\\nJames Grugett (1):\\n\\nfix: toolcall check\\nfeat: don't generate knowledge file if previous call was a `tool_use`\\nfix: added back james await fix\\nMerge branch 'main' into me/knowledge-files\\nfix: prompt engineering\\nfix: better chain of thought prompting\\nfix: better prompting\\nfix: weird knowledge file overwrite issue\\nfix: stop using editing files prompt\\nfix: remove unused knowledge tool\",\n  },\n  changesSinceLastChat: {},\n}\n\nexport const messages: Message[] = [\n  {\n    role: 'user',\n    content:\n      \"let's add a cache to `web-scraper` so we can refresh the webpage at regular intervals, but not every time we need it\\n\\n\",\n  },\n  {\n    role: 'assistant',\n    content:\n      \"Reading the following files...<files>npm-app/src/web-scraper.ts, npm-app/src/project-files.ts, npm-app/src/tool-handlers.ts, npm-app/src/client.ts, backend/src/generate-diffs-prompt.ts, backend/src/generate-diffs-via-expansion.ts, backend/src/generate-patch.ts, backend/src/process-stream.ts, backend/src/websockets/server.ts, common/src/util/file.ts, test/__mock-data__/app/expected.ts, backend/src/websockets/switchboard.ts, common/src/util/promise.ts, npm-app/src/config.ts, test/__src__/process-stream.test.ts</files>\\n\\nCertainly! I'll add a cache to the `web-scraper` that refreshes webpages at regular intervals. This will help reduce unnecessary requests while keeping the content relatively up-to-date. I'll make minimal changes to the existing code to implement this feature.\\n\\nFirst, let's update the `web-scraper.ts` file:\\n\\n<file path=\\\"npm-app/src/web-scraper.ts\\\">import axios from 'axios'\\nimport * as cheerio from 'cheerio'\\n\\n// Global cache for scraped web pages\\nconst scrapedPagesCache: Record<string, { content: string; timestamp: number }> = {}\\n\\n// Cache expiration time (in milliseconds)\\nconst CACHE_EXPIRATION = 60 * 60 * 1000 // 1 hour\\n\\nexport async function scrapeWebPage(url: string) {\\n  const now = Date.now()\\n  const cachedData = scrapedPagesCache[url]\\n\\n  // Check if the page is already in the cache and not expired\\n  if (cachedData && now - cachedData.timestamp < CACHE_EXPIRATION) {\\n    return cachedData.content\\n  }\\n\\n  try {\\n    const response = await axios.get(url)\\n    const html = response.data\\n    const $ = cheerio.load(html)\\n\\n    // Extract the main content (you may need to adjust this selector based on the target websites)\\n    const content = $('body').text()\\n\\n    // Store the scraped content in the cache with the current timestamp\\n    scrapedPagesCache[url] = { content, timestamp: now }\\n\\n    return content\\n  } catch (error) {\\n    // console.error(\\n    //   `Error scraping web page ${url}:`,\\n    //   error instanceof Error ? error.message : error\\n    // )\\n    scrapedPagesCache[url] = { content: '', timestamp: now }\\n    return ''\\n  }\\n}\\n\\n// ... rest of the file remains unchanged ...\\n</file>\\n\\nThese changes implement a simple caching mechanism for scraped web pages. Here's what the modifications do:\\n\\n1. We've updated the `scrapedPagesCache` to store both the content and the timestamp of when it was scraped.\\n2. We've added a `CACHE_EXPIRATION` constant set to 1 hour (60 * 60 * 1000 milliseconds).\\n3. In the `scrapeWebPage` function, we now check if the cached data exists and is not expired before returning it.\\n4. If the cache is expired or doesn't exist, we proceed with scraping the page as before.\\n5. When storing the scraped content in the cache, we now include the current timestamp.\\n\\nThese changes will ensure that web pages are only re-scraped after the cache expiration time has passed, reducing the number of requests made to external websites while keeping the content relatively up-to-date.\\n\\nThe rest of the file, including the `parseUrlsFromContent` and `getScrapedContentBlocks` functions, remains unchanged as they don't directly interact with the caching mechanism.\\n\\n\",\n  },\n  {\n    role: 'user',\n    content: \"now let's update it to every 4 hours\\n\\n\",\n  },\n]\n",
    'scripts/generate-fine-tuning-dataset.ts':
      "import { execSync } from 'child_process'\nimport * as fs from 'fs'\nimport * as path from 'path'\nimport { promptClaude } from '../backend/src/claude'\nimport { countTokens } from '../backend/src/util/token-counter'\nimport dotenv from 'dotenv'\nimport { shuffle } from 'lodash'\nimport { mapAsync } from '../common/src/util/promise'\n\ndotenv.config({ path: path.resolve(__dirname, '../backend/.env') })\n\nconst MANICODE_PROJECT_PATH = '/Users/jahooma/manicode'\n\nconst PROJECTS_LIST = [\n  {\n    name: 'pytorch',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/pytorch`,\n  },\n  {\n    name: 'linux',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/linux`,\n  },\n  {\n    name: 'jpcsp',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/jpcsp`,\n  },\n  {\n    name: 'litestar',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/litestar`,\n  },\n  {\n    name: 'nushell',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/nushell`,\n  },\n  {\n    name: 'vscode',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/vscode`,\n  },\n  {\n    name: 'manifold',\n    path: '/Users/jahooma/manifold',\n  },\n]\n\nconst NUMBER_OF_COMMITS = 5000\nconst FILES_TO_PROCESS = 1000\nconst PARALLEL_PROCESSES = 5\n\nconst BLACK_LIST_STRINGS = [\n  'This file was automatically generated',\n  'This autogenerated file',\n]\n\ninterface DatasetEntry {\n  filePath: string\n  oldFile: string\n  newFile: string\n  patch: string\n  claudeSketch: string\n}\n\ninterface Progress {\n  [projectName: string]: DatasetEntry[]\n}\n\nconst PROGRESS_FILE = `${MANICODE_PROJECT_PATH}/dataset_progress.json`\n\nfunction saveProgress(projectName: string, dataset: DatasetEntry[]) {\n  const progress = loadProgress()\n  progress[projectName] = dataset\n  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))\n}\n\nfunction loadProgress(): Progress {\n  if (fs.existsSync(PROGRESS_FILE)) {\n    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'))\n  }\n  return {}\n}\n\nasync function generateClaudeSketch(\n  oldContent: string,\n  newContent: string,\n  patch: string\n): Promise<string> {\n  const prompt = `\nYou are an expert programmer tasked with explaining how to modify an old version of a file into a new version. Your explanation should be clear and concise, suitable for a human to understand and follow.\n\nHere's the old version of the file:\n\n\\`\\`\\`\n${oldContent}\n\\`\\`\\`\n\nHere's the new version of the file:\n\n\\`\\`\\`\n${newContent}\n\\`\\`\\`\n\nHere's the patch showing the differences:\n\n\\`\\`\\`\n${patch}\n\\`\\`\\`\n\nPlease provide a sketch of how to turn the old file into the new file. First, explain the changes in a <discussion> block. Then, write out the new file in a <file> block, but use comments like \"// ... existing code ...\" (or \"# ... existing code ...\" or similar for different languages) for sections that were unchanged. Don't leave excessive comments.\n`\n\n  const response = await promptClaude([{ role: 'user', content: prompt }], {\n    userId: 'fine-tuning-dataset-generator',\n    ignoreHelicone: true,\n  })\n\n  // Extract the content from the <file> block\n  const fileContentMatch = response.match(/<file>([\\s\\S]*?)<\\/file>/)\n  return fileContentMatch ? fileContentMatch[1].trim() : ''\n}\n\nasync function createDataset(\n  project: { name: string; path: string },\n  datasetSoFar: DatasetEntry[]\n) {\n  console.log(`Creating dataset for project: ${project.name}`)\n  const dataset: DatasetEntry[] = datasetSoFar.concat()\n\n  // Create tmp directory if it doesn't exist\n  const tmpDir = path.join(process.cwd(), 'tmp')\n  if (!fs.existsSync(tmpDir)) {\n    fs.mkdirSync(tmpDir)\n  }\n\n  // Change to the project directory\n  try {\n    process.chdir(project.path)\n    console.log(`Changed to directory: ${project.path}`)\n  } catch (error) {\n    console.error(`Failed to change to directory ${project.path}:`, error)\n    return\n  }\n\n  // Get the last n commit hashes\n  const allCommitHashes = execSync(\n    `git log -n ${NUMBER_OF_COMMITS} --pretty=format:\"%H\"`\n  )\n    .toString()\n    .split('\\n')\n\n  const allChangedFiles = allCommitHashes.flatMap((commitHash) =>\n    execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`)\n      .toString()\n      .split('\\n')\n      .filter(\n        (file) =>\n          file.endsWith('.ts') ||\n          file.endsWith('.tsx') ||\n          file.endsWith('.py') ||\n          file.endsWith('.js') ||\n          file.endsWith('.jsx') ||\n          file.endsWith('.java') ||\n          file.endsWith('.go') ||\n          file.endsWith('.c') ||\n          file.endsWith('.cpp') ||\n          file.endsWith('.h') ||\n          file.endsWith('.hpp') ||\n          file.endsWith('.rs') ||\n          file.endsWith('.rb') ||\n          file.endsWith('.php') ||\n          file.endsWith('.md')\n      )\n  )\n\n  const alreadyProcessedFiles = new Set(dataset.map((entry) => entry.filePath))\n  const shuffledFiles = [...new Set(allChangedFiles)]\n    .sort(() => 0.5 - Math.random())\n    .filter((file) => !alreadyProcessedFiles.has(file))\n\n  console.log(`Randomly selected ${shuffledFiles.length} files to process.`)\n\n  await mapAsync(\n    shuffledFiles,\n    async (file) => {\n      if (dataset.length >= FILES_TO_PROCESS) return\n      try {\n        console.log(`Processing file: ${file}`)\n        const commitHash = execSync(\n          `git log -n 1 --pretty=format:\"%H\" -- ${file}`\n        ).toString()\n\n        // Check the number of lines changed\n        const diffStats = execSync(\n          `git diff ${commitHash}^ ${commitHash} -- ${file} | grep -E \"^[-+]\" | wc -l`\n        )\n          .toString()\n          .trim()\n        const linesChanged = parseInt(diffStats, 10)\n\n        if (linesChanged < 10) {\n          console.log(`Skipping ${file}: Only ${linesChanged} lines changed`)\n          return\n        }\n\n        // Get the file content before and after the commit\n        const oldContent = execSync(`git show ${commitHash}^:${file}`)\n          .toString()\n          .replace(/\\r\\n/g, '\\n')\n        const newContent = execSync(`git show ${commitHash}:${file}`)\n          .toString()\n          .replace(/\\r\\n/g, '\\n')\n\n        // Check if the file contains any blacklisted strings\n        if (\n          BLACK_LIST_STRINGS.some(\n            (str) => oldContent.includes(str) || newContent.includes(str)\n          )\n        ) {\n          console.log(`Skipping ${file}: Contains blacklisted string`)\n          return\n        }\n\n        if (\n          countTokens(oldContent) > 50_000 ||\n          countTokens(newContent) > 50_000\n        ) {\n          console.log(`Skipping ${file}: File too large`)\n          return\n        }\n\n        // Generate the git diff patch\n        const patch = execSync(\n          `git diff ${commitHash}^ ${commitHash} -- ${file}`\n        )\n          .toString()\n          // Remove everything up to the first @@\n          .replace(/^[\\s\\S]*?(?=@@)/m, '')\n          .replace(/\\r\\n/g, '\\n')\n\n        // Generate Claude sketch\n        console.log(`Generating Claude sketch for ${file}`)\n        const claudeSketch = await generateClaudeSketch(\n          oldContent,\n          newContent,\n          patch\n        )\n        if (!claudeSketch) {\n          console.log(`Skipping ${file}: Claude sketch is empty`)\n          return\n        }\n\n        // Save Claude's sketch to a file in the tmp directory\n        const sketchFileName = `${project.name}_${commitHash}_${file.replace(/\\//g, '_')}.txt`\n        const sketchFilePath = path.join(tmpDir, sketchFileName)\n        fs.writeFileSync(sketchFilePath, claudeSketch)\n        console.log(`Saved Claude's sketch to ${sketchFilePath}`)\n\n        dataset.push({\n          filePath: file,\n          oldFile: oldContent,\n          newFile: newContent,\n          patch: patch,\n          claudeSketch: claudeSketch,\n        })\n        console.log(`Added entry ${dataset.length} for ${file} to dataset.`)\n        if (dataset.length % PARALLEL_PROCESSES === 0) {\n          console.log(`Saving progress for ${project.name}`)\n          saveProgress(project.name, dataset)\n        }\n      } catch (error: any) {\n        console.error(`Error processing file ${file}:`, error.message)\n      }\n    },\n    PARALLEL_PROCESSES\n  )\n\n  process.chdir(MANICODE_PROJECT_PATH)\n\n  // Save the dataset to a JSON file\n  const outputPath = path.join(\n    process.cwd(),\n    `fine_tuning_dataset_${project.name}.json`\n  )\n  fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2))\n\n  console.log(`Dataset created with ${dataset.length} entries.`)\n  console.log(`Dataset saved to: ${outputPath}`)\n\n  // Create fine-tuning-data-[project-name].jsonl\n  const jsonlOutputPath = path.join(\n    process.cwd(),\n    `fine-tuning-data-${project.name}.jsonl`\n  )\n  const jsonlContent = dataset\n    .map((entry) => {\n      const oldFileWithLineNumbers = entry.oldFile\n        .split('\\n')\n        .map((line, index) => `${index + 1}|${line}`)\n        .join('\\n')\n      const conversation = {\n        messages: [\n          {\n            role: 'user',\n            content: `\nHere's an old file:\n\n\\`\\`\\`\n${oldFileWithLineNumbers}\n\\`\\`\\`\n\nAnd here's a sketch of the changes:\n\n\\`\\`\\`\n${entry.claudeSketch}\n\\`\\`\\`\n\nPlease produce a patch file based on this change.\n`.trim(),\n          },\n          {\n            role: 'assistant',\n            content: entry.patch,\n          },\n        ],\n      }\n      return JSON.stringify(conversation)\n    })\n    .join('\\n')\n\n  fs.writeFileSync(jsonlOutputPath, jsonlContent)\n  console.log(`JSONL file for fine-tuning created at: ${jsonlOutputPath}`)\n}\n\nfunction createTrainingAndValidationDatasets() {\n  const currentDate = new Date().toISOString().split('T')[0]\n  const allData: string[] = []\n\n  // Read all JSONL files\n  PROJECTS_LIST.forEach((project) => {\n    const jsonlPath = path.join(\n      process.cwd(),\n      `fine-tuning-data-${project.name}.jsonl`\n    )\n    const jsonlContent = fs.readFileSync(jsonlPath, 'utf-8')\n    const jsonlData = jsonlContent\n      .split('\\n')\n      .filter((line) => line.trim() !== '')\n    allData.push(...jsonlData)\n  })\n\n  // Shuffle the data\n  const shuffledData = shuffle(allData)\n\n  // Split into training and validation sets\n  const splitIndex = Math.floor(shuffledData.length * 0.9)\n  const trainingData = shuffledData.slice(0, splitIndex)\n  const validationData = shuffledData.slice(splitIndex)\n\n  // Write training data\n  const trainingOutputPath = path.join(\n    process.cwd(),\n    `fine-tuning-training-data-${currentDate}.jsonl`\n  )\n  fs.writeFileSync(trainingOutputPath, trainingData.join('\\n'))\n  console.log(`Training data saved to: ${trainingOutputPath}`)\n\n  // Write validation data\n  const validationOutputPath = path.join(\n    process.cwd(),\n    `fine-tuning-validation-data-${currentDate}.jsonl`\n  )\n  fs.writeFileSync(validationOutputPath, validationData.join('\\n'))\n  console.log(`Validation data saved to: ${validationOutputPath}`)\n}\n\nasync function main() {\n  if (!process.env.ANTHROPIC_API_KEY) {\n    console.error(\n      'Error: ANTHROPIC_API_KEY is not set. Please set this environment variable before running the script.'\n    )\n    return\n  }\n\n  const progress = loadProgress()\n  for (const project of PROJECTS_LIST) {\n    await createDataset(project, progress[project.name] || [])\n  }\n  createTrainingAndValidationDatasets()\n}\n\nmain().catch(console.error)\n",
  },
  fileTree: [
    {
      name: '.gitignore',
      type: 'file',
    },
    {
      name: '.manicodeignore',
      type: 'file',
    },
    {
      name: '.prettierrc',
      type: 'file',
    },
    {
      name: 'README.md',
      type: 'file',
    },
    {
      name: 'authentication_and_billing.knowledge.md',
      type: 'file',
    },
    {
      name: 'backend',
      type: 'directory',
      children: [
        {
          name: '.dockerignore',
          type: 'file',
        },
        {
          name: '.env.example',
          type: 'file',
        },
        {
          name: '.gitignore',
          type: 'file',
        },
        {
          name: 'Dockerfile',
          type: 'file',
        },
        {
          name: 'deploy.sh',
          type: 'file',
        },
        {
          name: 'jest.config.js',
          type: 'file',
        },
        {
          name: 'jest.setup.js',
          type: 'file',
        },
        {
          name: 'knowledge.md',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'claude.ts',
              type: 'file',
            },
            {
              name: 'constants.ts',
              type: 'file',
            },
            {
              name: 'generate-diffs-prompt.ts',
              type: 'file',
            },
            {
              name: 'generate-diffs-via-expansion.ts',
              type: 'file',
            },
            {
              name: 'generate-knowledge-files.ts',
              type: 'file',
            },
            {
              name: 'generate-patch.ts',
              type: 'file',
            },
            {
              name: 'index.ts',
              type: 'file',
            },
            {
              name: 'main-prompt.ts',
              type: 'file',
            },
            {
              name: 'openai-api.ts',
              type: 'file',
            },
            {
              name: 'process-stream.ts',
              type: 'file',
            },
            {
              name: 'request-files-prompt.ts',
              type: 'file',
            },
            {
              name: 'system-prompt.ts',
              type: 'file',
            },
            {
              name: 'tools.ts',
              type: 'file',
            },
            {
              name: 'util',
              type: 'directory',
              children: [
                {
                  name: 'debug.ts',
                  type: 'file',
                },
                {
                  name: 'token-counter.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'websockets',
              type: 'directory',
              children: [
                {
                  name: 'server.ts',
                  type: 'file',
                },
                {
                  name: 'switchboard.ts',
                  type: 'file',
                },
                {
                  name: 'websocket-action.ts',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'bun.lockb',
      type: 'file',
    },
    {
      name: 'common',
      type: 'directory',
      children: [
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'actions.ts',
              type: 'file',
            },
            {
              name: 'codemap',
              type: 'directory',
              children: [
                {
                  name: 'languages.ts',
                  type: 'file',
                },
                {
                  name: 'parse.ts',
                  type: 'file',
                },
                {
                  name: 'test-langs',
                  type: 'directory',
                  children: [
                    {
                      name: 'test.c',
                      type: 'file',
                    },
                    {
                      name: 'test.cpp',
                      type: 'file',
                    },
                    {
                      name: 'test.cs',
                      type: 'file',
                    },
                    {
                      name: 'test.go',
                      type: 'file',
                    },
                    {
                      name: 'test.java',
                      type: 'file',
                    },
                    {
                      name: 'test.js',
                      type: 'file',
                    },
                    {
                      name: 'test.php',
                      type: 'file',
                    },
                    {
                      name: 'test.py',
                      type: 'file',
                    },
                    {
                      name: 'test.rb',
                      type: 'file',
                    },
                    {
                      name: 'test.rs',
                      type: 'file',
                    },
                    {
                      name: 'test.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'tree-sitter-queries',
                  type: 'directory',
                  children: [
                    {
                      name: 'readme.md',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-c-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-c_sharp-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-cpp-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-go-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-java-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-javascript-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-php-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-python-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-ruby-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-rust-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-typescript-tags.scm',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'tree-sitter.d.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'constants.ts',
              type: 'file',
            },
            {
              name: 'project-file-tree.ts',
              type: 'file',
            },
            {
              name: 'util',
              type: 'directory',
              children: [
                {
                  name: 'array.ts',
                  type: 'file',
                },
                {
                  name: 'changes.ts',
                  type: 'file',
                },
                {
                  name: 'file.ts',
                  type: 'file',
                },
                {
                  name: 'object.ts',
                  type: 'file',
                },
                {
                  name: 'patch.ts',
                  type: 'file',
                },
                {
                  name: 'promise.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'websockets',
              type: 'directory',
              children: [
                {
                  name: 'websocket-client.ts',
                  type: 'file',
                },
                {
                  name: 'websocket-schema.ts',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'exported-tokens.json',
      type: 'file',
    },
    {
      name: 'knowledge.md',
      type: 'file',
    },
    {
      name: 'musings.knowledge.md',
      type: 'file',
    },
    {
      name: 'npm-app',
      type: 'directory',
      children: [
        {
          name: 'README.md',
          type: 'file',
        },
        {
          name: 'clean-package.js',
          type: 'file',
        },
        {
          name: 'knowledge.md',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'chat-storage.ts',
              type: 'file',
            },
            {
              name: 'cli.ts',
              type: 'file',
            },
            {
              name: 'client.ts',
              type: 'file',
            },
            {
              name: 'config.ts',
              type: 'file',
            },
            {
              name: 'fingerprint.ts',
              type: 'file',
            },
            {
              name: 'index.ts',
              type: 'file',
            },
            {
              name: 'manifold-api.ts',
              type: 'file',
            },
            {
              name: 'menu.ts',
              type: 'file',
            },
            {
              name: 'project-files.ts',
              type: 'file',
            },
            {
              name: 'tool-handlers.ts',
              type: 'file',
            },
            {
              name: 'web-scraper.ts',
              type: 'file',
            },
          ],
        },
        {
          name: 'storage',
          type: 'directory',
          children: [
            {
              name: 'key_value_stores',
              type: 'directory',
              children: [
                {
                  name: 'default',
                  type: 'directory',
                  children: [],
                },
              ],
            },
            {
              name: 'request_queues',
              type: 'directory',
              children: [
                {
                  name: 'default',
                  type: 'directory',
                  children: [],
                },
              ],
            },
          ],
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'package.json',
      type: 'file',
    },
    {
      name: 'python-app',
      type: 'directory',
      children: [
        {
          name: 'LICENSE',
          type: 'file',
        },
        {
          name: 'README.md',
          type: 'file',
        },
        {
          name: 'knowledge.md',
          type: 'file',
        },
        {
          name: 'pyproject.toml',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'manicode',
              type: 'directory',
              children: [
                {
                  name: '__init__.py',
                  type: 'file',
                },
                {
                  name: '__pycache__',
                  type: 'directory',
                  children: [
                    {
                      name: '__init__.cpython-39.pyc',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'manicode.egg-info',
              type: 'directory',
              children: [
                {
                  name: 'PKG-INFO',
                  type: 'file',
                },
                {
                  name: 'SOURCES.txt',
                  type: 'file',
                },
                {
                  name: 'dependency_links.txt',
                  type: 'file',
                },
                {
                  name: 'entry_points.txt',
                  type: 'file',
                },
                {
                  name: 'top_level.txt',
                  type: 'file',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'scripts',
      type: 'directory',
      children: [
        {
          name: 'bump-version.ts',
          type: 'file',
        },
        {
          name: 'bun.lockb',
          type: 'file',
        },
        {
          name: 'generate-fine-tuning-dataset.ts',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'start-dev.sh',
      type: 'file',
    },
    {
      name: 'test',
      type: 'directory',
      children: [
        {
          name: '__mock-data__',
          type: 'directory',
          children: [
            {
              name: 'actions',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'app',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'delete-comment',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'duplicate-imports',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'existing-comments',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'graph',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'hallucinated',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'indentation',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'knowledge-files',
              type: 'directory',
              children: [
                {
                  name: 'cache-expiration.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'many-updates',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'missing-line-actions',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'schema',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'simple',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'system-prompt',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: '__src__',
          type: 'directory',
          children: [
            {
              name: 'diff-prompt.test.ts',
              type: 'file',
            },
            {
              name: 'generate-knowledge-files.test.ts',
              type: 'file',
            },
            {
              name: 'generate-patch.test.ts',
              type: 'file',
            },
            {
              name: 'main-prompt.test.ts',
              type: 'file',
            },
            {
              name: 'manifold-project.test.ts',
              type: 'file',
            },
            {
              name: 'patch.test.ts',
              type: 'file',
            },
            {
              name: 'process-stream.test.ts',
              type: 'file',
            },
            {
              name: 'score-tests.ts',
              type: 'file',
            },
            {
              name: 'setup.ts',
              type: 'file',
            },
          ],
        },
        {
          name: 'bunfig.toml',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'todo.knowledge.md',
      type: 'file',
    },
    {
      name: 'tsconfig.json',
      type: 'file',
    },
  ],
  fileTokenScores: {
    '.gitignore': {},
    '.manicodeignore': {},
    '.prettierrc': {},
    'README.md': {},
    'authentication_and_billing.knowledge.md': {},
    'backend/.dockerignore': {},
    'backend/.env.example': {},
    'backend/.gitignore': {},
    'backend/Dockerfile': {},
    'backend/deploy.sh': {},
    'backend/jest.config.js': {},
    'backend/jest.setup.js': {},
    'backend/knowledge.md': {},
    'backend/package.json': {},
    'backend/src/claude.ts': {
      models: 1.2756477605939975,
      promptClaudeStream: 3.044071057880673,
      promptClaude: 3.328723629405636,
      promptClaudeWithContinuation: 1.2756477605939975,
    },
    'backend/src/constants.ts': {
      RATE_LIMIT_POLICY: 0.14829104003789312,
    },
    'backend/src/generate-diffs-prompt.ts': {
      generateExpandedFileWithDiffBlocks: 4.987981645339687,
      generateDiffBlocks: 2.9459823118803516,
    },
    'backend/src/generate-diffs-via-expansion.ts': {
      expandNewContent: 3.9485535176648794,
    },
    'backend/src/generate-knowledge-files.ts': {
      generateKnowledgeFiles: 3.112053989228971,
    },
    'backend/src/generate-patch.ts': {
      generatePatch: 3.260551418852098,
    },
    'backend/src/index.ts': {},
    'backend/src/main-prompt.ts': {
      mainPrompt: 2.919429342306116,
      getRelevantFileInfoMessage: 1.7242619990901342,
      updateFileContext: 1.7242619990901342,
      processFileBlock: 3.6185574201739965,
    },
    'backend/src/openai-api.ts': {
      promptOpenAI: 3.0702795580141005,
      promptOpenAIWithContinuation: 3.0702795580141005,
    },
    'backend/src/process-stream.ts': {},
    'backend/src/request-files-prompt.ts': {
      requestRelevantFiles: 3.9212536839853986,
      getRelevantFiles: 1.3310839386064968,
      topLevelDirectories: 1.3310839386064968,
      getExampleFileList: 1.3310839386064968,
      generateNonObviousRequestFilesPrompt: 1.3310839386064968,
      generateKeyRequestFilesPrompt: 1.3310839386064968,
    },
    'backend/src/system-prompt.ts': {
      getSearchSystemPrompt: 4.773914318612662,
      getAgentSystemPrompt: 3.3872349113713067,
      knowledgeFilesPrompt: 2.000555504129951,
      getRelevantFilesPrompt: 3.3872349113713067,
    },
    'backend/src/tools.ts': {
      getTools: 2.6053777856571236,
      DEFAULT_TOOLS: 0.9984440607850333,
    },
    'backend/src/util/debug.ts': {
      DEBUG_MODE: 0.3656509454897687,
      debugLog: 1.8627519058271726,
      clearDebugLog: 0.3656509454897687,
    },
    'backend/src/util/token-counter.ts': {
      countTokens: 1.2968841558128552,
      countTokensForFiles: 0.786534719817593,
    },
    'backend/src/websockets/server.ts': {
      MessageParseError: 0.7167229817000064,
      serializeError: 0.7167229817000064,
      parseMessage: 0.7167229817000064,
      processMessage: 0.7167229817000064,
      listen: 0.7167229817000064,
      sendMessage: 1.2135174957078831,
    },
    'backend/src/websockets/switchboard.ts': {
      Switchboard: 0.635184087735273,
      getClient: 0.3751499544919713,
      getAll: 0.3751499544919713,
      getSubscribers: 0.3751499544919713,
      connect: 0.3751499544919713,
      disconnect: 0.3751499544919713,
      markSeen: 0.3751499544919713,
      identify: 0.3751499544919713,
      deidentify: 0.3751499544919713,
      subscribe: 0.3751499544919713,
      unsubscribe: 1.337390589217878,
    },
    'backend/src/websockets/websocket-action.ts': {
      subscribeToAction: 1.0610843071323905,
      onWebsocketAction: 1.7965719029576102,
      requestFiles: 2.53205949878283,
      requestFile: 2.53205949878283,
    },
    'backend/tsconfig.json': {},
    'bun.lockb': {},
    'common/package.json': {},
    'common/src/actions.ts': {
      FileChangeSchema: 0.8550878507329176,
      CHANGES: 0.8550878507329176,
      ToolCallSchema: 0.8550878507329176,
      CLIENT_ACTIONS: 0.8550878507329176,
      CLIENT_ACTION_SCHEMA: 0.8550878507329176,
      SERVER_ACTIONS: 0.8550878507329176,
      SERVER_ACTION_SCHEMA: 0.8550878507329176,
    },
    'common/src/codemap/languages.ts': {
      getLanguageConfig: 2.761147870196878,
    },
    'common/src/codemap/parse.ts': {
      DEBUG_PARSING: 0.8354986189350809,
      getFileTokenScores: 1.7533876688623948,
      parseTokens: 0.8354986189350809,
      parseFile: 0.8354986189350809,
    },
    'common/src/codemap/test-langs/test.c': {
      Greeter: 0.3287649480356627,
      create_greeter: 0.3287649480356627,
      greet: 0.3287649480356627,
      free_greeter: 0.3287649480356627,
      print_greeting: 0.5566474448335192,
      main: 0.3287649480356627,
    },
    'common/src/codemap/test-langs/test.cpp': {
      greet: 0.29580146559145953,
      Greeting: 0.29580146559145953,
      printGreeting: 0.29580146559145953,
      main: 0.29580146559145953,
    },
    'common/src/codemap/test-langs/test.cs': {
      IGreeter: 0.29580146559145953,
      Greet: 0.29580146559145953,
      Greeting: 0.29580146559145953,
      PrintGreeting: 0.29580146559145953,
      Main: 0.29580146559145953,
    },
    'common/src/codemap/test-langs/test.go': {
      Greeter: 0.1659862434495759,
      string: 0.1659862434495759,
      Greeting: 0.1659862434495759,
      Greet: 0.1659862434495759,
      PrintGreeting: 0.1659862434495759,
      main: 0.1659862434495759,
    },
    'common/src/codemap/test-langs/test.java': {
      Greeter: 0.28245008504511326,
      greet: 0.28245008504511326,
      Greeting: 0.28245008504511326,
      printGreeting: 0.28245008504511326,
      main: 0.28245008504511326,
    },
    'common/src/codemap/test-langs/test.js': {
      greet: 0.3587119667194399,
      Greeting: 0.3587119667194399,
      printGreeting: 0.3587119667194399,
      createGreeter: 0.3587119667194399,
    },
    'common/src/codemap/test-langs/test.php': {
      greet: 0.29580146559145953,
      Greeting: 0.29580146559145953,
      __construct: 0.29580146559145953,
      printGreeting: 0.29580146559145953,
      createGreeter: 0.29580146559145953,
    },
    'common/src/codemap/test-langs/test.py': {
      Greeter: 0.2536476641600791,
      greet: 0.2536476641600791,
      Greeting: 0.2536476641600791,
      print_greeting: 0.42946282742825387,
    },
    'common/src/codemap/test-langs/test.rb': {
      Greeter: 0.25109837670360796,
      greet: 0.25109837670360796,
      prefix: 0.25109837670360796,
      Greeting: 0.25109837670360796,
      initialize: 0.25109837670360796,
      print_greeting: 0.4251465085588929,
    },
    'common/src/codemap/test-langs/test.rs': {
      Greeter: 0.28994343076581225,
      Greeting: 0.28994343076581225,
      new: 0.6084788468237248,
      greet: 0.28994343076581225,
      main: 0.28994343076581225,
    },
    'common/src/codemap/test-langs/test.ts': {
      Greeting: 0.3050809602367711,
      greet: 0.3050809602367711,
      printGreeting: 0.3050809602367711,
      createGreeter: 0.3050809602367711,
    },
    'common/src/codemap/tree-sitter-queries/readme.md': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-c-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-c_sharp-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-cpp-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-go-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-java-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-javascript-tags.scm':
      {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-php-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-python-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-ruby-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-rust-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-typescript-tags.scm':
      {},
    'common/src/codemap/tree-sitter.d.ts': {},
    'common/src/constants.ts': {
      STOP_MARKER: 0.695546631234341,
      SKIPPED_TERMINAL_COMMANDS: 0.695546631234341,
    },
    'common/src/project-file-tree.ts': {
      getProjectFileTree: 1.8463688069343935,
      buildTree: 0.8798046294230922,
      parseGitignore: 0.8798046294230922,
      getAllFilePaths: 2.2957955555516514,
    },
    'common/src/util/array.ts': {
      filterDefined: 0.4670579267615085,
      buildArray: 1.2187586613943497,
      groupConsecutive: 0.4670579267615085,
    },
    'common/src/util/changes.ts': {
      applyChanges: 2.4044067558037523,
      applyAndRevertChanges: 1.3819208032579984,
    },
    'common/src/util/file.ts': {
      FileTreeNodeSchema: 0.5564373049874729,
      ProjectFileContextSchema: 0.5564373049874729,
      createFileBlock: 2.580525944365354,
      createFileBlockWithoutPath: 0.5564373049874729,
      fileRegex: 0.5564373049874729,
      fileWithNoPathRegex: 0.5564373049874729,
      parseFileBlocks: 1.4519885995269681,
      parseFileBlocksWithoutPath: 0.5564373049874729,
      printFileTree: 0.9421302540979142,
      printFileTreeWithTokens: 1.1677461661200754,
    },
    'common/src/util/object.ts': {
      removeUndefinedProps: 1.0109874830039345,
      removeNullOrUndefinedProps: 0.5971054936107728,
      addObjects: 0.5971054936107728,
      subtractObjects: 0.5971054936107728,
      hasChanges: 0.5971054936107728,
      hasSignificantDeepChanges: 0.5971054936107728,
      filterObject: 1.2530929265228052,
      assert: 0.5971054936107728,
    },
    'common/src/util/patch.ts': {
      applyPatch: 5.78969920740265,
    },
    'common/src/util/promise.ts': {
      mapAsync: 1.1183569906194901,
    },
    'common/src/websockets/websocket-client.ts': {
      formatState: 0.711796992181887,
      APIRealtimeClient: 2.275774837477926,
      state: 0.711796992181887,
      close: 0.711796992181887,
      connect: 0.711796992181887,
      waitAndReconnect: 0.711796992181887,
      receiveMessage: 0.711796992181887,
      sendMessage: 1.2051770704438114,
      sendAction: 2.275774837477926,
      identify: 0.711796992181887,
      subscribe: 0.711796992181887,
    },
    'common/src/websockets/websocket-schema.ts': {
      CLIENT_MESSAGE_SCHEMAS: 0.5955320903657728,
      CLIENT_MESSAGE_SCHEMA: 0.5955320903657728,
      SERVER_MESSAGE_SCHEMAS: 0.5955320903657728,
      SERVER_MESSAGE_SCHEMA: 0.5955320903657728,
    },
    'common/tsconfig.json': {},
    'exported-tokens.json': {},
    'knowledge.md': {},
    'musings.knowledge.md': {},
    'npm-app/README.md': {},
    'npm-app/clean-package.js': {},
    'npm-app/knowledge.md': {},
    'npm-app/package.json': {},
    'npm-app/src/chat-storage.ts': {
      ChatStorage: 1.7717634180723674,
      ensureDirectoryExists: 0.6346404257248834,
      getFilePath: 0.6346404257248834,
      createChat: 0.6346404257248834,
      getChat: 0.6346404257248834,
      addMessage: 0.6346404257248834,
      deleteChat: 0.6346404257248834,
      listChats: 0.6346404257248834,
      saveChat: 0.6346404257248834,
      generateChatId: 0.6346404257248834,
      getCurrentChat: 0.6346404257248834,
      setCurrentChat: 0.6346404257248834,
      getCurrentVersion: 0.6346404257248834,
      navigateVersion: 0.6346404257248834,
      saveFilesChanged: 0.6346404257248834,
      saveCurrentFileState: 0.6346404257248834,
      addNewFileState: 0.6346404257248834,
    },
    'npm-app/src/cli.ts': {
      CLI: 1.4931982040990786,
      onWebSocketError: 0.8819069134942297,
      detectPasting: 0.8819069134942297,
      handleInput: 0.8819069134942297,
      setPrompt: 0.8819069134942297,
      printInitialPrompt: 0.8819069134942297,
      handleUndo: 0.8819069134942297,
      handleRedo: 0.8819069134942297,
      navigateFileVersion: 0.8819069134942297,
      handleStopResponse: 0.8819069134942297,
      handleExit: 0.8819069134942297,
      handleEscKey: 0.8819069134942297,
      applyAndDisplayCurrentFileVersion: 0.8819069134942297,
      startLoadingAnimation: 0.8819069134942297,
      stopLoadingAnimation: 0.8819069134942297,
      handleUserInput: 2.9125726259144327,
      sendUserInputAndAwaitResponse: 0.8819069134942297,
    },
    'npm-app/src/client.ts': {
      Client: 1.9412412267183203,
      connect: 1.1465283402452509,
      setupSubscriptions: 1.1465283402452509,
      checkNpmVersion: 1.1465283402452509,
      sendUserInput: 1.1465283402452509,
      subscribeToResponse: 1.1465283402452509,
      warmContextCache: 1.1465283402452509,
    },
    'npm-app/src/config.ts': {
      websocketUrl: 0.3632373815194687,
      fingerprintId: 0.3632373815194687,
      initFingerprint: 0.6150143483936656,
    },
    'npm-app/src/fingerprint.ts': {
      FINGERPRINTING_INFO: 0.9378748862299282,
      calculateFingerprint: 1.5879602193381825,
    },
    'npm-app/src/index.ts': {
      manicode: 1.109708530700346,
    },
    'npm-app/src/manifold-api.ts': {
      searchManifoldMarkets: 1.4854007711474697,
    },
    'npm-app/src/menu.ts': {
      displayMenu: 5.233094699354542,
    },
    'npm-app/src/project-files.ts': {
      initProjectRoot: 1.6271750185860758,
      getCurrentWorkingDirectory: 2.2933142587893487,
      setCurrentWorkingDirectory: 1.6271750185860758,
      getCurrentDirectory: 0.9610357783828033,
      getProjectRoot: 2.507763195317703,
      getProjectFileContext: 3.563568911298773,
      getGitChanges: 0.9610357783828033,
      getChangesSinceLastFileVersion: 1.6271750185860758,
      getFiles: 3.072647210344943,
      getExistingFiles: 2.2933142587893487,
      getExistingFilesWithScrapedContent: 0.9610357783828033,
      setFiles: 1.6271750185860758,
      getFileBlocks: 2.6829807345671455,
      deleteFile: 0.9610357783828033,
    },
    'npm-app/src/tool-handlers.ts': {
      handleUpdateFileContext: 0.9740233373390015,
      handleScrapeWebPage: 0.9740233373390015,
      handleSearchManifoldMarkets: 0.9740233373390015,
      handleRunTerminalCommand: 1.649164867415119,
      formatResult: 0.9740233373390015,
      toolHandlers: 0.9740233373390015,
    },
    'npm-app/src/web-scraper.ts': {
      scrapeWebPage: 1.57151023163337,
      parseUrlsFromContent: 1.57151023163337,
      getScrapedContentBlocks: 1.57151023163337,
    },
    'npm-app/tsconfig.json': {},
    'package.json': {},
    'python-app/LICENSE': {},
    'python-app/README.md': {},
    'python-app/knowledge.md': {},
    'python-app/pyproject.toml': {},
    'python-app/src/manicode/__init__.py': {
      main: 0.31387297087950994,
    },
    'python-app/src/manicode/__pycache__/__init__.cpython-39.pyc': {},
    'python-app/src/manicode.egg-info/PKG-INFO': {},
    'python-app/src/manicode.egg-info/SOURCES.txt': {},
    'python-app/src/manicode.egg-info/dependency_links.txt': {},
    'python-app/src/manicode.egg-info/entry_points.txt': {},
    'python-app/src/manicode.egg-info/top_level.txt': {},
    'scripts/bump-version.ts': {
      incrementVersion: 0.8889735555481955,
    },
    'scripts/bun.lockb': {},
    'scripts/generate-fine-tuning-dataset.ts': {
      saveProgress: 1.9541851224744737,
      loadProgress: 1.9541851224744737,
      generateClaudeSketch: 1.9541851224744737,
      createDataset: 1.9541851224744737,
      createTrainingAndValidationDatasets: 1.9541851224744737,
      main: 1.9541851224744737,
    },
    'scripts/package.json': {},
    'scripts/tsconfig.json': {},
    'start-dev.sh': {},
    'test/__mock-data__/actions/expected.ts': {
      CHANGES: 0.6372818690991596,
      ToolCallSchema: 0.6372818690991596,
      CLIENT_ACTIONS: 0.6372818690991596,
      CLIENT_ACTION_SCHEMA: 0.6372818690991596,
      SERVER_ACTIONS: 0.6372818690991596,
      SERVER_ACTION_SCHEMA: 0.6372818690991596,
    },
    'test/__mock-data__/actions/new.ts': {
      CLIENT_ACTIONS: 0.7183574718083399,
      SERVER_ACTIONS: 0.7183574718083399,
    },
    'test/__mock-data__/actions/old.ts': {
      CHANGES: 0.6341191604001978,
      ToolCallSchema: 0.6341191604001978,
      CLIENT_ACTIONS: 0.6341191604001978,
      CLIENT_ACTION_SCHEMA: 0.6341191604001978,
      SERVER_ACTIONS: 0.6341191604001978,
      SERVER_ACTION_SCHEMA: 0.6341191604001978,
    },
    'test/__mock-data__/app/expected.ts': {
      cacheController: 2.206698234261847,
      app: 2.206698234261847,
    },
    'test/__mock-data__/app/new.ts': {},
    'test/__mock-data__/app/old.ts': {
      cacheController: 2.202442303136901,
      app: 2.202442303136901,
    },
    'test/__mock-data__/delete-comment/expected.ts': {
      deleteComment: 0.3934605916618092,
    },
    'test/__mock-data__/delete-comment/new.ts': {
      deleteComment: 0.3934605916618092,
    },
    'test/__mock-data__/delete-comment/old.ts': {
      deleteComment: 0.517108526206176,
    },
    'test/__mock-data__/duplicate-imports/expected.ts': {
      searchManifoldMarkets: 1.1625777672033408,
      getTools: 1.7917370307347458,
      executeToolCall: 0.6866371574495145,
    },
    'test/__mock-data__/duplicate-imports/new.ts': {
      searchManifoldMarkets: 1.1625777672033408,
      getTools: 1.7917370307347458,
      executeToolCall: 0.6866371574495145,
    },
    'test/__mock-data__/duplicate-imports/old.ts': {
      getTools: 1.3493625931253181,
    },
    'test/__mock-data__/existing-comments/expected.ts': {
      manicode: 1.6092140273245312,
      promptUser: 4.199144092121396,
      sendUserInputAndAwaitResponse: 1.6092140273245312,
    },
    'test/__mock-data__/existing-comments/new.ts': {},
    'test/__mock-data__/existing-comments/old.ts': {
      manicode: 1.6266114413344601,
      promptUser: 4.244541563817217,
      sendUserInputAndAwaitResponse: 1.6266114413344601,
    },
    'test/__mock-data__/graph/expected.ts': {
      loadGraphData: 0.7459586966016832,
      createD3Graph: 0.7459586966016832,
      ticked: 0.7459586966016832,
      drawLink: 0.7459586966016832,
      drawNode: 0.7459586966016832,
      drawLabel: 0.7459586966016832,
      zoomed: 0.7459586966016832,
      highlightNodes: 0.7459586966016832,
      setSelectedNode: 0.7459586966016832,
      resetGraph: 0.7459586966016832,
      zoomToNode: 0.7459586966016832,
      findNodeAtPosition: 0.7459586966016832,
    },
    'test/__mock-data__/graph/new.ts': {
      loadGraphData: 0.7459586966016832,
      createD3Graph: 0.7459586966016832,
      ticked: 0.7459586966016832,
      drawLink: 0.7459586966016832,
      drawNode: 0.7459586966016832,
      drawLabel: 0.7459586966016832,
      zoomed: 0.7459586966016832,
      highlightNodes: 0.7459586966016832,
      setSelectedNode: 0.7459586966016832,
      resetGraph: 0.7459586966016832,
      zoomToNode: 0.7459586966016832,
      findNodeAtPosition: 0.7459586966016832,
    },
    'test/__mock-data__/graph/old.ts': {
      loadGraphData: 0.8192738002941923,
      createD3Graph: 0.8192738002941923,
      ticked: 0.8192738002941923,
      highlightNodes: 0.8192738002941923,
      setSelectedNode: 0.8192738002941923,
      resetGraph: 0.8192738002941923,
      zoomToNode: 0.8192738002941923,
      resetZoom: 0.8192738002941923,
      drag: 0.8192738002941923,
      dragstarted: 0.8192738002941923,
      dragged: 0.8192738002941923,
      dragended: 0.8192738002941923,
    },
    'test/__mock-data__/hallucinated/expected.ts': {
      processChunk: 1.0817262541406476,
      streamResponse: 1.0817262541406476,
      mainPrompt: 1.8315217573359084,
      getRelevantFileInfoMessage: 1.0817262541406476,
      updateFileContext: 1.0817262541406476,
      processFileBlock: 2.2701240099144857,
    },
    'test/__mock-data__/hallucinated/new.ts': {
      processChunk: 0.6126173103557732,
      streamResponse: 0.6126173103557732,
    },
    'test/__mock-data__/hallucinated/old.ts': {
      mainPrompt: 2.020644281450439,
      getRelevantFileInfoMessage: 1.1934250634857309,
      updateFileContext: 1.1934250634857309,
      processFileBlock: 2.5045365038356735,
    },
    'test/__mock-data__/indentation/expected.ts': {
      manicode: 1.6113989760936935,
      promptUser: 4.204845580276375,
      sendUserInputAndAwaitResponse: 1.6113989760936935,
    },
    'test/__mock-data__/indentation/new.ts': {},
    'test/__mock-data__/indentation/old.ts': {
      manicode: 1.5960415217754953,
      promptUser: 4.164771256739994,
      sendUserInputAndAwaitResponse: 1.5960415217754953,
    },
    'test/__mock-data__/knowledge-files/cache-expiration.ts': {
      mockFileContext: 2.0932336557256455,
      messages: 2.0932336557256455,
    },
    'test/__mock-data__/many-updates/expected.ts': {
      ChatClient: 0.7061252126127833,
      connect: 0.7061252126127833,
      setupSubscriptions: 0.7061252126127833,
      sendUserInput: 0.7061252126127833,
      subscribeToResponse: 0.7061252126127833,
    },
    'test/__mock-data__/many-updates/new.ts': {
      ChatClient: 0.7061252126127833,
      connect: 0.7061252126127833,
      setupSubscriptions: 0.7061252126127833,
      sendUserInput: 0.7061252126127833,
      subscribeToResponse: 0.7061252126127833,
    },
    'test/__mock-data__/many-updates/old.ts': {
      ChatClient: 0.6757329074564218,
      connect: 0.6757329074564218,
      setupSubscriptions: 0.6757329074564218,
      sendUserInput: 0.6757329074564218,
      subscribeToResponse: 0.6757329074564218,
      handleReadFiles: 0.6757329074564218,
      handleScrapeWebPage: 0.6757329074564218,
    },
    'test/__mock-data__/missing-line-actions/expected.ts': {
      CHANGES: 0.6710886400000003,
      ToolCallSchema: 0.6710886400000003,
      CLIENT_ACTIONS: 0.6710886400000003,
      CLIENT_ACTION_SCHEMA: 0.6710886400000003,
      SERVER_ACTIONS: 0.6710886400000003,
      SERVER_ACTION_SCHEMA: 0.6710886400000003,
    },
    'test/__mock-data__/missing-line-actions/new.ts': {
      CLIENT_ACTIONS: 0.43749626759921767,
      CLIENT_ACTION_SCHEMA: 0.43749626759921767,
      SERVER_ACTIONS: 0.43749626759921767,
      SERVER_ACTION_SCHEMA: 0.43749626759921767,
    },
    'test/__mock-data__/missing-line-actions/old.ts': {
      CHANGES: 0.6372818690991596,
      ToolCallSchema: 0.6372818690991596,
      CLIENT_ACTIONS: 0.6372818690991596,
      CLIENT_ACTION_SCHEMA: 0.6372818690991596,
      SERVER_ACTIONS: 0.6372818690991596,
      SERVER_ACTION_SCHEMA: 0.6372818690991596,
    },
    'test/__mock-data__/schema/expected.ts': {
      DEFAULT_CACHE_STRATEGY: 3.7739414173459567,
      API: 3.7739414173459567,
    },
    'test/__mock-data__/schema/new.ts': {},
    'test/__mock-data__/schema/old.ts': {
      DEFAULT_CACHE_STRATEGY: 3.7627372122626386,
      API: 3.7627372122626386,
    },
    'test/__mock-data__/simple/expected.ts': {},
    'test/__mock-data__/simple/new.ts': {},
    'test/__mock-data__/simple/old.ts': {},
    'test/__mock-data__/system-prompt/expected.ts': {
      getSystemPrompt: 2.977180243984713,
    },
    'test/__mock-data__/system-prompt/new.ts': {},
    'test/__mock-data__/system-prompt/old.ts': {
      getSystemPrompt: 2.977180243984713,
    },
    'test/__src__/diff-prompt.test.ts': {},
    'test/__src__/generate-knowledge-files.test.ts': {},
    'test/__src__/generate-patch.test.ts': {},
    'test/__src__/main-prompt.test.ts': {},
    'test/__src__/manifold-project.test.ts': {
      readMockFile: 1.5339344456138408,
      getProjectFileContext: 5.68790592953601,
      runMainPrompt: 1.5339344456138408,
      extractErrorFiles: 1.5339344456138408,
      runTerminalCommand: 1.5339344456138408,
    },
    'test/__src__/patch.test.ts': {},
    'test/__src__/process-stream.test.ts': {},
    'test/__src__/score-tests.ts': {
      projectTest: 2.1156255205744725,
    },
    'test/__src__/setup.ts': {},
    'test/bunfig.toml': {},
    'test/package.json': {},
    'test/tsconfig.json': {},
    'todo.knowledge.md': {},
    'tsconfig.json': {},
  },
  knowledgeFiles: {
    'authentication_and_billing.knowledge.md':
      '# Authentication and Billing System for Manicode\n\n## Overview\n\nThis document outlines the planned features and implementation strategy for adding authentication, database integration, and billing features to the Manicode project.\n\n## Planned Features\n\n1. Authentication for the console app\n2. Database integration (PostgreSQL)\n3. OAuth integration (Google and GitHub)\n4. Referral system\n5. Stripe integration for billing\n6. Usage tracking and limits\n\n## Implementation Details\n\n### 1. Authentication for Console App\n\n- Implement user authentication in the console application\n- Store user credentials securely in the database\n- Provide login/logout functionality\n\n### 2. Database Integration (PostgreSQL)\n\n- Set up a PostgreSQL database on the server\n- Create tables for user information, referrals, and usage data\n- Implement database connection and query functions in the backend\n\n### 3. OAuth Integration (Google and GitHub)\n\n- Implement OAuth flow for Google and GitHub\n- Create a simple web interface for OAuth redirection\n- Handle OAuth callback and token storage\n\n### 4. Referral System\n\n- Generate unique referral links for users\n- Track referrals and associate them with user accounts\n- Implement a system to award credits based on successful referrals ($10 per referral)\n\n### 5. Stripe Integration for Billing\n\n- Set up Stripe account and integrate Stripe API\n- Implement payment processing for paid plans\n- Store billing information securely\n\n### 6. Usage Tracking and Limits\n\n- Implement a system to track user usage (e.g., API calls, processing time)\n- Enforce usage limits based on user plan (e.g., $10 of credits for free tier)\n- Notify users when approaching usage limits\n- Implement automatic plan upgrades or service suspension when limits are reached\n\n## Implementation Plan\n\n1. Set up PostgreSQL database\n   - Create database schema\n   - Implement database connection in the backend\n\n2. Implement basic authentication for console app\n   - Create user registration and login functionality\n   - Store user credentials securely in the database\n\n3. Develop simple web interface for OAuth\n   - Set up a basic web server\n   - Create login page with Google and GitHub options\n\n4. Implement OAuth flow\n   - Handle OAuth redirects and callbacks\n   - Store OAuth tokens securely\n\n5. Integrate OAuth with console app\n   - Implement browser redirection from console app\n   - Handle OAuth token retrieval and storage\n\n6. Develop referral system\n   - Generate and store referral links\n   - Track referrals and associate with user accounts\n\n7. Implement usage tracking\n   - Create system to log and calculate user usage\n   - Store usage data in the database\n\n8. Integrate Stripe for billing\n   - Set up Stripe account and API integration\n   - Implement payment processing for paid plans\n\n9. Enforce usage limits\n   - Implement checks for usage limits\n   - Create notification system for approaching limits\n   - Develop automatic plan upgrades or service suspension\n\n10. Refine and test the entire system\n    - Conduct thorough testing of all components\n    - Optimize performance and security\n\n## Considerations\n\n- Security: Ensure all user data, especially authentication and billing information, is encrypted and stored securely.\n- Scalability: Design the database and backend to handle a growing number of users and increased usage.\n- User Experience: Make the authentication process as smooth as possible, especially when redirecting to the browser for OAuth.\n- Error Handling: Implement robust error handling and provide clear feedback to users.\n- Documentation: Keep documentation up-to-date as new features are implemented.\n\n',
    'backend/knowledge.md':
      "# Manicode Backend\n\nThis document provides an overview of the Manicode backend architecture, key components, and important concepts.\n\n## Table of Contents\n\n1. [Architecture Overview](#architecture-overview)\n2. [Key Technologies](#key-technologies)\n3. [Main Components](#main-components)\n4. [WebSocket Communication](#websocket-communication)\n5. [Claude Integration](#claude-integration)\n6. [File Management](#file-management)\n7. [Tool Handling](#tool-handling)\n8. [Error Handling and Debugging](#error-handling-and-debugging)\n9. [Build and Deployment](#build-and-deployment)\n10. [Security Considerations](#security-considerations)\n11. [TODO List](#todo-list)\n12. [Automatic URL Detection and Scraping](#automatic-url-detection-and-scraping)\n\n## Architecture Overview\n\nThe Manicode backend is built on Node.js using TypeScript. It uses an Express server for HTTP requests and a WebSocket server for real-time communication with clients. The backend integrates with the Claude AI model to process user inputs and generate code changes.\n\n## Key Technologies\n\n- **TypeScript**: The primary language used for backend development.\n- **Node.js**: The runtime environment for executing the backend server.\n- **Express**: Web application framework for handling HTTP requests.\n- **WebSocket (ws)**: Library for real-time, bidirectional communication between client and server.\n- **Anthropic AI SDK**: Used for integrating with the Claude AI model.\n\n## Main Components\n\n1. **Express Server (index.ts)**: The main entry point for the backend application. It sets up the Express server and initializes the WebSocket server.\n\n2. **WebSocket Server (websockets/server.ts)**: Handles real-time communication with clients. It manages connections, message parsing, and routing of WebSocket messages.\n\n3. **Claude Integration (claude.ts)**: Provides functions for interacting with the Claude AI model, including streaming responses and handling tool calls.\n\n4. **Main Prompt Handler (main-prompt.ts)**: Processes user inputs, generates responses, and manages file changes and tool calls.\n\n5. **System Prompt Generator (system-prompt.ts)**: Creates the initial prompt for the AI assistant with project-specific context and instructions.\n\n6. **File Diff Generation (generate-diffs-prompt.ts, generate-diffs-via-expansion.ts)**: Generates diffs for file changes and handles expansion of shortened file content.\n\n7. **Relevant File Request (request-files-prompt.ts)**: Determines which files are relevant for a given user request.\n\n8. **Tools Definition (tools.ts)**: Defines the available tools that can be used by the AI assistant.\n\n## WebSocket Communication\n\nThe backend uses WebSockets for real-time, bidirectional communication with clients. Key concepts include:\n\n- **Message Types**: Various message types (e.g., 'identify', 'subscribe', 'action') for different operations.\n- **Action Handling**: The `websocket-action.ts` file processes incoming action messages and triggers appropriate responses.\n- **Subscription Management**: Clients can subscribe to specific topics for targeted updates.\n\n## Claude Integration\n\nThe backend integrates with the Claude AI model to process user inputs and generate code changes. Important aspects include:\n\n- **Streaming Responses**: Responses from Claude are streamed in real-time to the client.\n- **Tool Calls**: The AI can make tool calls (e.g., reading files) during its processing.\n- **File Change Management**: The backend processes AI-suggested file changes and applies them to the project.\n\n## File Management\n\nThe backend handles file operations for the Manicode project:\n\n- **Reading Files**: The `read_files` tool allows the AI to access project file contents.\n- **Applying Changes**: The `applyChanges` function in `prompts.ts` processes and applies file modifications suggested by the AI.\n\n## Development Guidelines\n\n1. **Type Safety**: Utilize TypeScript's type system to ensure code reliability and catch errors early.\n2. **Error Handling**: Implement proper error handling and logging throughout the application.\n3. **Code Organization**: Keep related functionality grouped in appropriate modules and files.\n4. **Documentation**: Maintain clear and up-to-date documentation, including this knowledge file.\n5. **Testing**: Implement unit tests for critical components and functions.\n6. **Environment Variables**: Use environment variables for configuration and sensitive information.\n7. **Code Style**: Follow consistent coding style and use tools like Prettier for formatting.\n\n## Web Scraping\n\nThe backend now includes a web scraping tool that allows the AI assistant to retrieve content from external web pages. This functionality is useful for gathering information from documentation, APIs, or other web-based resources.\n\n- **Tool Name**: `scrape_web_page`\n- **Input**: A URL of the web page to scrape\n- **Output**: The content of the scraped web page\n\n## Tool Handling\n\nThe backend implements a tool handling system that allows the AI assistant to perform various actions:\n\n1. **Tool Definition**: Tools are defined in `tools.ts`, specifying their name, description, and input schema.\n2. **Available Tools**: Current tools include read_files, scrape_web_page, search_manifold_markets, and run_terminal_command.\n3. **Tool Execution**: When the AI makes a tool call, the backend processes it and provides the results back to the AI.\n\n## Error Handling and Debugging\n\n1. **Logging**: The `debug.ts` file provides logging functionality for debugging purposes.\n2. **Error Catching**: WebSocket errors are caught and logged in both server and client code.\n3. **Graceful Degradation**: The system attempts to handle errors gracefully, providing meaningful error messages when possible.\n\n## Build and Deployment\n\n1. **Build Process**: The backend uses TypeScript compilation to build the project.\n2. **Docker Support**: A Dockerfile is provided for containerization of the backend.\n3. **Deployment Script**: The `deploy.sh` script automates the build and deployment process to Google Cloud Platform.\n\n## Security Considerations\n\n1. **Environment Variables**: Sensitive information (e.g., API keys) is stored in environment variables.\n2. **Input Validation**: User input is validated and sanitized before processing.\n3. **File Access Restrictions**: File operations are restricted to the project directory to prevent unauthorized access.\n\n## TODO List\n\n1. Implement authentication and authorization for WebSocket connections.\n2. Add more comprehensive error handling and logging.\n3. Implement rate limiting for AI requests to manage resource usage.\n4. Create a robust testing suite for backend components.\n5. Optimize the file diff generation process for better reliability and performance.\n\n## Debugging Docker Issues\n\n- When encountering \"Cannot find module\" errors in a Docker container, it's important to verify the contents of the container itself, not just the local build.\n- SSH access to the machine running the Docker container provides valuable debugging capabilities.\n- The `dist` directory being correct locally doesn't guarantee it's correct inside the container.\n- If a container is continuously restarting, it often indicates that the application is crashing immediately after starting. This prevents executing commands inside the container directly.\n- The absence of the `dist` directory in the Docker container can cause \"Cannot find module\" errors, even if the directory exists locally.\n\n## Git and Docker Best Practices\n\n- The `dist` directory should be ignored by Git to avoid checking in build files.\n- However, the `dist` directory needs to be included in the Docker image for the application to run correctly.\n- The build process should occur before creating the Docker image to ensure the latest compiled files are included.\n\n## Prompts\n\nThe backend uses several prompts to guide the AI assistant's behavior:\n\n1. **System Prompt**: Initializes the AI assistant with project-specific context and instructions.\n2. **Request Files Prompt**: Determines which files are relevant to a user's request.\n3. **Main Prompt**: Processes the user's input and generates responses, including code changes.\n\n### Request Files Prompt\n\n- Located in `src/request-files-prompt.ts`\n- Purpose: Identify all potentially relevant files for a user's request\n- Key features:\n  - Uses chain-of-thought reasoning to consider all possible relevant files\n  - Aims to be comprehensive, requesting up to 100 files or more if necessary\n  - Considers indirect dependencies and files that provide context\n  - Outputs a thought process and a list of file paths\n\nThe Request Files Prompt is executed before the Main Prompt to ensure that all necessary files are loaded into the system context before processing the user's request.\n\n## File Diff Generation\n\nThe backend uses two main strategies for generating file diffs:\n\n1. **Diff Blocks Generation**: Implemented in `generate-diffs-prompt.ts`.\n2. **Diff via Expansion**: Implemented in `generate-diffs-via-expansion.ts`.\n",
    'knowledge.md':
      "# Manicode\n\nManicode is a tool for editing codebases via natural language instruction to Manny, an expert AI programming assistant.\n\n## File Change Management\n\nManicode uses the generate diffs by expansion strategy for managing file changes. This approach has Haiku expand a file with placeholders into the full file, and then generates string patches instead of search and replace blocks.\n\nKey points:\n- The FileChanges type is an array of string patches.\n- The mainPrompt function uses the generatePatch function from generate-diffs-via-expansion.ts to create patches.\n- The client-side code applies patches using the applyPatch function from the 'diff' library.\n\nThis change improves the accuracy and reliability of file modifications, especially for complex changes or when dealing with large files.\n\n## Project Goals\n\n1. **Developer Productivity**: Reduce the time and effort required for common programming tasks, allowing developers to focus on higher-level problem-solving.\n\n2. **Learning and Adaptation**: Develop a system that learns from user interactions and improves its assistance over time.\n\n3. **Focus on power users**: Make expert software engineers move even faster.\n\n## Key Technologies\n\n- **TypeScript**: The primary programming language used throughout the project.\n- **Node.js**: The runtime environment for executing the application.\n- **WebSockets**: Used for real-time communication between the client and server.\n- **Claude AI**: Powers Manny, the AI programming assistant.\n\n## Project Structure\n\nThere are three top-level code directories:\n- `common`: Contains shared code and utilities used across the project.\n- `backend`: Houses the server-side code and API implementation.\n- `src`: Contains the main application source code.\n\n## Main Components\n\n1. **Claude Integration**: Processes natural language instructions and generates code changes.\n2. **WebSocket Server**: Handles real-time communication between the client and the backend.\n3. **File Management**: Reads, parses, and modifies project files.\n4. **Action Handling**: Processes various client and server actions.\n5. **Message History**: Manages conversation history between the user and Manny.\n6. **Chat Storage**: Persists chat sessions and allows users to manage multiple conversations.\n7. **Knowledge Management**: Handles the creation, updating, and organization of knowledge files.\n8. **Terminal Command Execution**: Allows Manny to run shell commands in the user's terminal.\n\n## Important Files\n\n- `backend/src/claude.ts`: Interacts with the Claude AI model.\n- `backend/src/server.ts`: Sets up the WebSocket server.\n- `common/src/actions.ts`: Defines schemas for client and server actions.\n- `src/project-files.ts`: Handles project file operations.\n- `src/index.ts`: Contains main application logic and user input handling.\n- `knowledge.md`: Stores project-wide knowledge and best practices.\n\n## Development Guidelines\n\n1. Use TypeScript for all new code to maintain type safety.\n2. Follow existing code structure and naming conventions.\n3. Ensure alternating user and Manny messages in conversation history.\n4. Update knowledge files for significant changes or new features.\n5. Write clear, concise comments and documentation for complex logic.\n6. Remember that imports automatically remove 'src' from the path. When editing files, always include 'src' in the file path if it's part of the actual directory structure.\n\n## Knowledge Management\n\n- Knowledge is stored in `knowledge.md` files, which can be created in relevant directories throughout the project.\n- Manny automatically updates knowledge files when learning new information or correcting mistakes.\n- Developers are encouraged to review and commit knowledge file changes to share insights across the team.\n\n## Terminal Command Execution\n\nManny can now execute terminal commands using the `run_terminal_command` tool. This feature allows Manny to perform various tasks such as:\n\n- Searching files with grep\n- Installing dependencies\n- Running build or test scripts\n- Checking versions of installed tools\n- Performing git operations\n- Creating, moving, or deleting files and directories\n\n## Important Constraints\n\n- **Max Tokens Limit**: The context for Claude AI has a maximum limit of 200,000 tokens. This is an important constraint to consider when designing prompts and managing project file information.\n\n## WebSocket Communication Flow\n\n1. Client connects to the WebSocket server.\n2. Client sends user input and file context to the server.\n3. Server processes the input using Claude AI.\n4. Server streams response chunks back to the client.\n5. Client receives and displays the response in real-time.\n6. Server sends file changes to the client for application.\n\n## File Versioning System\n\n- The ChatStorage class manages file versions for each chat session.\n- Users can navigate between file versions using CTRL+U (undo) and CTRL+R (redo).\n- File versions are stored as snapshots of the entire file state at each change.\n\n## Tool Handling System\n\n- Tools are defined in `common/src/util/tools.ts` and implemented in `npm-app/src/tool-handlers.ts`.\n- Available tools: read_files, scrape_web_page, search_manifold_markets, run_terminal_command.\n- The backend uses tool calls to request additional information or perform actions.\n- The client-side handles tool calls and sends results back to the server.\n\n## CLI Interface Features\n\n- Non-canonical mode for improved key handling.\n- Navigation using arrow keys for input and command history.\n- File version control using CTRL+U and CTRL+R.\n- ESC key to toggle menu or stop AI response.\n- CTRL+C to exit the application.\n\n## Build and Publish Process\n\n- The `prepublishOnly` script runs `clean-package.js` before publishing.\n- `clean-package.js` modifies `package.json` to remove unnecessary information.\n- The `postpublish` script restores the original `package.json`.\n- NODE_ENV is set to 'production' for the published package at runtime.\n\n## Error Handling and Debugging\n\n- The `debug.ts` file provides logging functionality for debugging.\n- Error messages are logged to the console and, in some cases, to a debug log file.\n- WebSocket errors are caught and logged in the server and client code.\n\n## Security Considerations\n\n- The project uses environment variables for sensitive information (e.g., API keys).\n- WebSocket connections should be secured in production (e.g., using WSS).\n- User input is validated and sanitized before processing.\n- File operations are restricted to the project directory to prevent unauthorized access.\n\n## TODO\n- Implement authentication and authorization for WebSocket connections.\n- Add more comprehensive error handling and logging.\n- Implement rate limiting for AI requests to manage resource usage.\n- Create a robust testing suite for all components.\n\n# Code guide\n\n- We don't specify return types for functions, since Typescript will infer them. \n- Always include 'src' in file paths when it's part of the actual directory structure, even though imports automatically remove it. \n\n## Python Package\n\nA Python package for Manicode has been created as a skeleton in python-app. Key points:\n\n- It's currently a placeholder that prints a message about the package coming soon and suggests installing the npm version.\n\n- The Python package is intended to be developed further in the future to provide similar functionality to the npm version.\n\n## Version Checking\n\nThe Manicode backend implements a version checking mechanism to ensure clients are using the latest version:\n\n1. The client sends its version using the 'check-npm-version' action.\n2. The server compares this version with the one in backend/package.json.\n3. The server responds with a 'npm-version-status' action, indicating if the client is up-to-date.\n4. The backend/package.json version is updated during the build process by the build-version-info.js script, which copies the version from npm-app/package.json.\n\nTo maintain correct versioning:\n- Always update the version in npm-app/package.json when making releases.\n- Run `bun run build` to ensure backend/package.json is updated before deployment.\n- Implement proper error handling for version mismatches in both client and server code.\n",
    'musings.knowledge.md':
      "This file contains various ideas about how Manicode could work. Most of them are not what we'll end up doing, but it gives some flavor of the strategy.\n\n\n- Gather knowledge from users\n    - Through terminal\n        - [Manilearn.sh](http://Manilearn.sh) that just asks you questions\n        - Have an npm package so you can do `yarn manicode` or `yarn manilearn`? Or executable.\n        - Or, make manilearn an exclusively web app thing?\n            - Manicode should still send new knowledge as it learns when the user teaches it something it got wrong. It should condense that knowledge into a few sentences and an example of wrong and right.\n    - Through web app\n        - Add long form knowledge or short points\n            - Use markdown. With an editor that lets you insert code snippets\n        - Search over existing knowledge and edit or remove it\n        - Edit code from your browser???\n            - It could just create changes and you could approve them.\n            - You keep telling it to tweak stuff in just text. When satisfied, you hit the commit button. There is no commit message; that is generated. (commit message ends with “—manicode”)\n            - Might not be worth even having a terminal. You could just connect to github. Then you have permanent access to the files\n                - Some day it should just represent the code diffs itself and not use github except to read the current state of files.\n- Use it to prompt claude sonnet 3.5 in a repl, with learnings for how to get it to edit files\n- Have own script to gather info from codebase\n    - File structure\n    - Exported tokens\n    - Claude summary of each directory, computed recursively\n    - Try to find database schema. If not, ask for a file where it exists, or let them paste it in.\n    - Try to find api schema. If not ask where it is.\n    - Overall knowledge of tech stack and how the technologies are used.\n    \n\n## Problems\n\n- ~~It’s hard to get it to edit the files properly~~\n    - It defaults to a lazy style of specifying the changes where it writes the line it’s adding and adds a comment saying “// the next part is the same as before”\n    - When you do force it into a framework, like with <replace> and <with> blocks, it is more likely to forget imports and other small changes\n    - Should try again with getting it to specify things naturally and then translate that into replace blocks with another claude call?\n        - [J] I did this, and it seems to be working.\n    - Add it to the system prompt to ingrain the replace-with structure?\n    - Use <A> and <B> tags in hopes that it will be less lazy?\n- [x]  It cuts off after a long change\n- What’s the app structure of Manicode?\n    - Users should use it as a console application\n    - They should install it as an npm package (later: python package)\n    - It has a basic console application that communicates with the server\n        - has to reveal a significant portion of the algorithm\n            - Unless we upload their whole codebase to the server?\n        - Upload files to our server vs. thin wrapper calls to claude that go through our server\n            - The latter still does upload files to our server. It applies the edits locally (which we might still do under the previous approach). It does reveal the prompts\n        - Call claude directly. Can’t leak our key, but they could set theirs\n            - This is a bad user experience, so no\n        - Winner is upload files to server.\n            - But we can do it just-in-time?\n                - Send list of files and exports up on init\n                - Send files when claude asks for them\n            - Vs. Maintain files\n                - We might move in this direction over time. But it’s easier to start with just-in-time fetching of files\n    - Node application on client\n        - Reads files, Reads user input\n        - Maintains a websocket with server where we send files and user input, and receive claude’s output chats + file updates\n    - Server\n        - Maintains websockets with clients\n        - Makes calls to Claude\n\n## Stages\n\n- Discussion\n    \n    I want to maximize learning while not doing duplicate work. I’m working toward an application that other people can try out. Their dogfooding will be important.\n    \n    I’m already confident enough that I want to build out this prototype app.\n    \n    - Seems like the tool calls will be necessary for external use. So I want to try that\n    - The way the app tracks lessons will be key to how it is used. So I can also try implementing that to get some iteration in there.\n    - Only after that should I ship the prototype, and have manifold people start using it (they can add knowledge) to get feedback.\n- [x]  Local manicode script\n- [x]  Set up server\n- [x]  Make claude calls via server\n    - Just a user prompt and file information sent via websocket\n    - Server then runs all the claude calls, and streams the response, including file changes to apply\n- [x]  Tool calls to fetch the files\n    - Necessary for codebases where I can’t load all the files into context (unlike manicode)\n- [ ]  Track lessons\n    - Go to non-canonical mode for terminal.\n    - Set up menu system\n        - Can cancel out of an ongoing prompt.\n        - Use up and down arrows to go through history of prompts\n        - After prompt finishes, you have menu options\n            - Space: continue\n            - r: revert change\n            - l: add a lesson based on this change and possibly previous changes in the conversation\n            - Esc: back to prompt creation\n                - Esc: main menu\n                    - l: lessons. You can type a lesson or scroll through history of lessons\n                    - Space: go to a new prompt\n                    - Esc: quit application\n    - Save lessons locally? .manicode file\n        - A lot simpler techically than trying to merge your knowledge with other team members\n        - You know all the knowledge added. It conforms to your own style.\n        - But, most of the codebase knowledge is in common. You are just creating more work for each engineer.\n            - Allow users to export and import lessons!\n        - Alternately, users commit their lessons to a tracked file (lessons.manicode.md). People can view and modify the lessons others have added. (or they can add to git ignore)\n            - This is great. It’s super transparent, and can use existing coding tools like git, or text editors to update the lessons.\n            - It supports the single player and multiplayer use cases.\n            - Markdown file with lessons separated by dividers: ‘—-’\n            - Can create lessons in any directory and they are all added in, with the path.\n                - Allows you to better organize your knowledge if you have hundreds of lessons. Makes it easier for you to find and update stuff.\n            - Users will rapidly iterate to create the best knowledge. It’s basically prompt engineering lol\n                - What about lessons within the code? A long comment that can be added to knowledge.\n        - Potentially just called `knowledge.md`, so every application can use it and update it.\n            - Wait, this is very similar to README.md!\n                - But also, it’s not for exactly the same purpose. It’s for the machine. I think that means it could be worth having it’s own file.\n            - Could just give up on discrete lessons, and have the llm update the knowledge file for you in markdown. Hierarchical info is better anyway, with the headings.\n                - Track your progress by the number of characters of knowledge instead!\n        - Manicode is good at editing files!\n        - `knowledge.md` files should be created in the relevant directory for the info.\n            - Manicode will edit your .gitignore to include them (if you startup without any pre-existing knowledge files), but recommend you actually commit them.\n                - Or, maybe it won’t. Because knowledge files are such a good idea.\n        - Manicode should not ask, it should just add knowledge whenever it feels like. That’s an even better experience.\n        - You can run manicode from any directory, and it only sees inside the directory it is run from.\n            - E.g. if you want to cd into backend to reduce the scope of what it can see and change\n        - To start, there’re no user settings. No saved data. You pay a subscription which limits your usage per month.\n        - We should prompt manicode to freely edit knowledge files when it learns something. You can just tell it it did something wrong and it will unprompted add knowledge. You of course review the changes as file diffs.\n            - It can use a tool call? Or, nope, it just adds knowledge files and edits them all the time.\n        - You put in a credit card. It charges based on usage. $20 at a time. It emails you when it charges again. No subscription plan! Just pay for what you use, man.\n            - Simply charge 2x of what anthropic charges. Done.\n            - Subscriptions are annoying and are stealing from you when you don’t use it all.\n            - Alternately, you get a bill at the end of the month and pay then. That’s what cloud compute companies do. This is a better user experience. Maybe with a one-time activation fee ($10).\n        - Signup is email & credit card\n            - You get a private key which you use to bill your credit card. Can spread among your team. Or regenerate it.\n- [ ]  Npm package\n    - Install -g manicode and run it in manifold codebase\n    - Host a prod server\n- [ ]  Add postgres\n\n## Ideas\n\n- Use “tools” to have the llm able to ask for a file, we send it to our server, and then add it to the claude call’s context, and continue generating\n- Console application can turn off canonical mode (I think that’s what it was?) and then accept more rich input\n- Effort modes: 1 minutes, 15 minutes, 2 hours\n    - Response instantly, or work hard to come up with good design and a fuller implementation\n- Use [Greptile](https://www.greptile.com/) to index the code base and ask it knowledge questions to become context\n- Focus on learning after usage and ask for how to do better\n    - Explicitly ask the user to list out separate lessons. Have gpt compile the learnings with the rest of the context to produce knowledge entries\n        - Enter up to 3 lessons\n    - Tell them this is how it will improve. It won’t make the mistake again! (probably)\n    - Show ‘x%’ rating toward becoming a seasoned engineer, and increase it with every bit of knowledge (Every percent is one piece of knowldge)\n        - “5% trained - Junior engineer”\n        - Give a new title every 10%. After 100%, keep giving new titles on larger intervals\n        - New idea: 1% per commit to a knowledge file\n- Viral\n    - Share manicode rank\n    - Share wins: Your prompt, and the result\n    - Refer friends. Get $15 credit each\n\n\n\nWish list\n- Give the assistant full command of the terminal so it can run stuff like `yarn add` or `git commit`\n- Use the up and down arrow keys to scroll through previous messages. Use escape to show menu, and keys to navigate (e.g. to create a new chat, exit, etc.)\n- Add a rigorous testing suite to make sure each prompt is working as intended across many cases.\n- Save conversations locally in a file. Maybe .manicode? Include a setting for setting the root directory (and thus defaulting to running manicode in that directory so it can always see the whole project)?\n",
    'npm-app/knowledge.md':
      "# Manicode Project Structure\n\n## Overview\n\nManicode is an AI-powered development assistant that runs from the command line. It has access to all files in your project and can carry out various tasks.\n\n## Project Structure\n\n### Root Directory\n\n- `package.json`: Defines the project dependencies, scripts, and metadata.\n- `tsconfig.json`: TypeScript configuration file.\n- `README.md`: Project documentation and usage instructions.\n\n### Source Code (`src/`)\n\nThe `src/` directory contains the main TypeScript source files:\n\n- `index.ts`: Entry point of the application. Sets up the main `manicode` function.\n- `chat-client.ts`: Implements the `ChatClient` class for handling WebSocket communication.\n- `config.ts`: Contains configuration-related functions and constants.\n- `chat-storage.ts`: Manages chat storage functionality.\n- `cli.ts`: Implements the Command Line Interface.\n- `project-files.ts`: Handles project file operations.\n\n### Build Output (`dist/`)\n\nThe `dist/` directory contains the compiled JavaScript files and is created during the build process.\n\n## Project File Handling\n\n- Manny can only view files that are not gitignored. This is partially to save tokens when we list out all the files.\n- Multiple `.gitignore` files can exist throughout the project structure.\n- When traversing the project structure, we need to accumulate and apply ignore patterns from all encountered `.gitignore` files.\n\n## Key Components\n\n1. **ChatClient**: Manages WebSocket communication with the server, handles subscriptions, and processes messages.\n\n2. **ChatStorage**: Responsible for storing and managing chat data.\n\n3. **CLI**: Implements the command-line interface for user interaction.\n\n4. **Config**: Handles environment variables and configuration settings.\n\n## Build Process\n\nThe build process is defined in `package.json`:\n\n1. Builds the `common` project (located in a sibling directory).\n2. Builds the `npm-app` project using TypeScript.\n3. Copies necessary files from the `common` project and the current project to the `dist/` directory.\n\n## Dependencies\n\n- ts-pattern: Used for pattern matching in TypeScript. Installed to improve type safety and readability when checking message types.\n\n- The project depends on a `common` package (version 1.0.0) which is likely a shared library.\n- Uses `lodash` for utility functions.\n- TypeScript is used for development.\n\n## TypeScript Configuration\n\n- The project uses CommonJS modules.\n- Strict type checking is enabled.\n- The `common/*` path is mapped to `../common/dist/*` for importing shared components.\n\n## Usage\n\nManicode can be started by running the `manicode` command in the terminal after installation. It provides a menu interface (accessible by pressing `Esc`) and allows navigation through file versions using arrow keys.\n\n## Knowledge Management\n\nManicode encourages storing knowledge alongside code using `knowledge.md` files. These files provide context, guidance, and tips for the AI as it performs tasks.\n\n## Build and Publish Process\n\nWhen publishing the Manicode package, we use a custom process to ensure that only necessary information is included in the published package and that the environment is set correctly:\n\n1. The `prepublishOnly` script runs `clean-package.js` before publishing.\n2. `clean-package.js` does the following:\n   - Saves the current `package.json` to `temp.package.json`.\n   - Modifies the original `package.json` by removing `devDependencies`, `peerDependencies`, and unnecessary `scripts`.\n   - Writes the modified `package.json` back to its original location.\n   - Adds `process.env.NODE_ENV = 'production';` as the second line of `dist/index.js`.\n3. npm publishes the package using the modified `package.json`.\n4. The `postpublish` script restores the original `package.json` from `temp.package.json` and then deletes the temporary file.\n\nThis approach ensures that:\n\n- The published package only includes necessary dependencies and scripts.\n- The development environment remains intact after publishing.\n- NODE_ENV is set to 'production' for the published package at runtime.\n\nTo publish the package:\n\n```bash\nnpm publish\n```\n\nThis will automatically run the `prepublishOnly` and `postpublish` scripts to handle the `package.json` modifications, environment setting, and cleanup.\n\nRemember to increment the version number in `package.json` before publishing a new version.\n\n## Package Management\n\nManicode uses Bun as its package manager. Always use Bun commands for managing dependencies instead of npm.\n\nKey points:\n\n- Use `bun add <package-name>` to install new packages.\n- Use `bun remove <package-name>` to remove packages.\n- Use `bun install` to install all dependencies after cloning the repository.\n\n## CLI Functionality\n\nThe CLI (Command Line Interface) has been updated to provide a more standard terminal experience:\n\n1. **Input Handling**: Uses the `readline` module for improved key handling.\n2. **Navigation**:\n   - Left and right arrow keys move the cursor within the input.\n   - Up and down arrow keys navigate through command history.\n3. **File Version Control**:\n   - `Ctrl+U`: Undo file changes (navigate to previous version)\n   - `Ctrl+R`: Redo file changes (navigate to next version)\n4. **Application Control**:\n   - `Ctrl+C`: Exit the application\n   - `Esc`: Toggle menu or stop the current AI response\n5. **Input Submission**: Press Enter to submit the current input.\n\nThese changes aim to provide a more intuitive and familiar experience for users while maintaining the unique features of Manicode.\n\n## Note on Project Evolution\n\nAs an AI-powered tool, Manicode is designed to learn and evolve. It can update knowledge files as it works, improving its understanding and capabilities over time.\n\n## WebSocket Communication\n\nThe `Client` class in `client.ts` manages WebSocket communication with the server:\n\n- Connects to the WebSocket server specified in the configuration.\n- Sends user input and receives responses from the AI.\n- Handles tool calls and their responses.\n- Manages the response stream, allowing for real-time updates and the ability to stop ongoing responses.\n\n## File Management\n\nThe `project-files.ts` module handles all file-related operations:\n\n- Reads and writes files within the project directory.\n- Traverses the project structure, respecting `.gitignore` files.\n- Applies changes to files based on AI suggestions.\n- Manages file versioning for undo/redo functionality.\n\n## Tool Handlers\n\nThe `tool-handlers.ts` file implements handlers for various tools:\n\n- `read_files`: Reads contents of specified files.\n- `scrape_web_page`: Retrieves content from a given URL.\n- `search_manifold_markets`: Searches for relevant prediction markets.\n- `run_terminal_command`: Executes shell commands in the user's terminal.\n\nThese tools extend Manicode's capabilities, allowing it to gather information and perform actions beyond simple code manipulation.\n\n## Error Handling\n\nError handling is implemented throughout the application:\n\n- WebSocket connection errors are caught and logged.\n- File read/write errors are handled gracefully.\n- Tool execution errors are captured and reported back to the AI.\n\nDevelopers should continue to improve error handling to ensure a smooth user experience and easier debugging.\n\n## Security Considerations\n\n- The application runs commands in the user's terminal, which could potentially be dangerous. Users should be cautious when using Manicode on sensitive projects.\n- File operations are restricted to the project directory to prevent unauthorized access to the user's system.\n- Web scraping and external API calls (e.g., Manifold Markets) should be used responsibly and in compliance with the respective services' terms of use.\n\n## Future Improvements\n\n1. Implement user authentication for the WebSocket connection.\n2. Add more robust error handling and user-friendly error messages.\n3. Implement a caching system for frequently accessed files to improve performance.\n4. Create a comprehensive test suite to ensure reliability across different environments.\n5. Enhance the CLI with more features, such as chat history browsing and export/import functionality.\n\n## User Input ID System\n\n1. Each user input generates a unique user input ID (using nanoid) on the client-side.\n2. The user input ID is passed to the server with the user input.\n3. All related responses, including tool calls and response chunks, include this user input ID.\n4. The user input ID remains consistent for all interactions related to a single user input.\n\nThis system allows for better tracking and correlation of user inputs with their corresponding responses and tool calls, while avoiding potential conflicts with individual message IDs.\n\n## Version Checking\n\n- The `Client` class in `client.ts` includes a subscription to 'npm-version-status' that checks if the current version is up to date.\n- If a newer version is available, a warning is displayed in yellow text.\n- Users are instructed to update using the command: `npm install -g manicode`\n- The version check is performed as part of the WebSocket subscription setup.\n\n## End of Document\n",
    'python-app/knowledge.md':
      '# Manicode Project Knowledge\n\n## Project Structure\n\nThe Manicode project follows the modern Python packaging structure:\n\n- `pyproject.toml`: Contains project metadata and build system requirements.\n- `src/manicode/`: Source code directory.\n- `tests/`: Directory for test files (currently empty).\n- `dist/`: Contains distribution files after building the package.\n- `LICENSE`: MIT License file.\n- `README.md`: Project description and usage instructions.\n\n## Build System\n\n- Uses `setuptools` as the build backend.\n- Configured to use the `src` layout for better separation of source code.\n\n## Package Information\n\n- Name: manicode\n- Description: An AI-powered coding assistant (coming soon)\n- Requires Python 3.6 or later\n\n## Distribution\n\n- The project can be built using the `build` package: `python -m build`\n- This creates both source (.tar.gz) and wheel (.whl) distributions in the `dist/` directory.\n\n## Development\n\n- For local development, install the package in editable mode: `pip install -e .`\n- Remember to update the version in `pyproject.toml` when making new releases.\n\n## Next Steps\n\n- Implement the main functionality of the AI-powered coding assistant.\n- Add tests in the `tests/` directory.\n- Update `README.md` with detailed usage instructions as features are developed.\n\n## Important Notes\n\n- The package currently uses a console script entry point, which should be implemented in the `manicode/__init__.py` file.\n- The project is in a pre-alpha state and not yet ready for public release.\n\nRemember to keep this knowledge file updated as the project evolves.\n',
    'todo.knowledge.md':
      "[x] Should indicate if diff is still generating somehow...\n    - send to client the file changes still planned. Wait for them before allowing user input?\n- Improve speed by prompting it to rely more on diffs instead of reproducing the whole file\n[x] Prompt engineer it to automatically make knowledge changes when you correct it\n[x] it's doing a poor job loading all the relevant files into context. Need to add more explicity steps for this.\n[x] Indenting fails when it makes multiple changes with different indent levels.\n[x] More chain of thought for main prompt. <planning> blocks, <code_review>, <brainstorm>, etc.\n[x] Delete files\n[x] Shift + Enter, and pasting in stuff with new lines. Update: not really possible\n\n[x] Failed to replace in the new contents (but did expand it for the old content):\n// ... (keep the existing setup code)\n[x] Continuation 2 led to infinite responses\n[x] cancelling before the prompt starts being genereated leads to error of two user messages in a row\n- Show commands available in a bar under the input (not sure if this is possible)\n[x] Escalate when old diff does not match. Got case where a helper function in the middle of two others was moved up, but diff didn't match because it ignored the helper function.\n[x] Stuck in loop: Prompting claude num messages: 21, continuing to generate\n[x] Backspace after typing more than one line is buggy\n\n[x] Dawson's case of wanting it to scrape documentation from a url and answer questions with it.\n- x% knowledge written in menu based on number of commits to knowledge files\n[x] How it could run bash:\n1. First, let's build the `common` package:\n\n```bash\ncd common\nyarn build\ncd ..\n```\nImportant. Can use commandline to search for code. Could move files.\n\n[x] Try asking first if the complete file is listed, and then automatically generate diffs.\n\n[] create some structure in a knowledge file for users to initially fill out.\n- Project overview\n - Goals\n - Project structure\n - Coding do's and don'ts\n\n [] reverting doesn't work with created files\n [x] File paths using too much context?\n [x] Error on server didn't print the error (or maybe it did and the terminal overwrote it...)\n [x] Change ip address to be from api.manicode.ai\n\nNotes from Janna & Stephen test\n[x] backspace on windows doesn't clear the char, just moves cursor\n[x] Tried to do left arrow and it didn't work\n[x] Failed to apply any edits. They all failed even after a second attempt. This was on Windows\n[x] CTRL-C doesn't work\n\n[] Kill if it continues too far without user prompt.\n[] Prompt it not to generate the whole file when just making a local edit. Consider just reproducting the function edited. Or a block a code.\n    - Before editing a file, get it to say what changes it will make and then edit just those sections.\n[x] Consider confirming with the user whether to go ahead and make a change if not that confident or want more input from the user\n[] Force updates: run the command to update app.\n[] Store previous user input's and always include that history in system prompt.\n    - Can also allow you to press up arrow to go through whole history\n[x] Changes prompt is printing object for most previous messages in message history\n[x] It keeps requesting files that are already in its context. Need to highlight those paths again somewhere?\n    - Requests a file before editing that it just got.\n[] Knowledge files should be treated more like regular files, but with system prompts to frequently include them\n\n\n-- Instead, of below, apply edits immediately. Track all changes for a message via an id. Fix conccurent request by subscribing/unsubscribing to response with id.\n[x] Give it a new marker token that will await all file changes, so then it can run tsc or tests, etc.\n    - It is using grep to see if changes went through, but they haven't so gets in a loop.\n    - Realized we could just apply the edits before the tool call. We were already passing them through.\n[x] Was able to start a concurrent request after cancelling the last one...\n[] Changes behavior like removing if guard if statements at the top, removing cases of logs/errors, adds <form>. It should only do the minimal change and assume existing code is there for a reason.\n[x] Terminal command that doesn't finish bricks manicode\n[x] Easy to forget to run it in root directory.\n[x] Allow pasting new lines based on timing strategy\n[] It's not saving useful info like that this is a Windows machine and it shouldn't be using grep into a knowledge file.\n[x] Budget of tokens when reading files, and skip files that put it over the limit.\n[x] Still does too many extra things\n[x] Doesn't consistently request new files when it needs to\n[x] Scrape urls by default, like we request files by default\n[x] The user may have edited files since your last change. Please try to notice and perserve those changes. Don't overwrite these please!\n[x] Show a message when manicode is out of date. Or figure out how to automatically update.\n[] The \"// add this blah\" comments are really annoying. Strip them out in the diff step\n[x] The comprehensive files list generates a huge amount of thinking that is probably slow\n[x] Try a lower temperature. Might prevent it from doing random stuff. \n    - apparently it's been 0 this whole time, huh (for claude)\n    - Also openai defaults to 0\n[] Add current file diff from main into context (git status/git diff?)\n\n[] It thought that update_file_context would create a file? (a knowledge file?)\n[] Claude doesn't leave a comment that there's more code in between when it should. Then lots gets deleted\n[] Try using the native stop marker feature\n[] Use tree sitter to include exported tokens ttps://github.com/tree-sitter/node-tree-sitter\n    See how github implemented code search: ttps://docs.github.com/en/repositories/working-with-files/using-files/navigating-code-on-github#precise-and-search-based-navigation\n[] Multiple file blocks for the same file could fail to patch\n[] Still hallucinating without getting the file: Totally destroyed my package .json by removing random scripts & dependencies, changing a bunch of stuff around\n[] Create tests for the full user input. Set up fake project data for this.\n[] Use gpt-4o mini to grade tests\n\n[] Updated a function in a file, but didn't include comments at the top or bottom for existing code\n[] Looks in wrong directory for a file, e.g. web/components/comments instead of web/components/buttons\n    web/components/profile/profile-comments.tsx instead of web/components/comments/profile-comments.tsx\n[] Ari: editing is failing: deleting sections of code it shouldn't.\n    - [J] Removes commented out code, other comments\n[] Doesn't give up control after running terminal commands. Just keeps running more\n[] Says reconnected, but actually doesn't go after\n[] Run in a containerls\n    - Maybe distribute as brew package which would have more permissions?\n    - Check files being edited to be within project dir (no '..')\n[x] Send a command, then just run it. if it goes through, print.\n    - thefuck util that could change \n    - should look more like shell\n    - could have two panel one for you, other shows claude's response. Claude's commands go on your side\n[] Got file path wrong: backend instead of npm-app for project-files\n[] Still is overwritting a user's change every time",
  },
  gitChanges: {
    status:
      'On branch me/knowledge-files\nYour branch is up to date with \'origin/me/knowledge-files\'.\n\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)\n\tmodified:   backend/src/generate-knowledge-files.ts\n\tmodified:   npm-app/src/web-scraper.ts\n\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n\ttest/__src__/generate-knowledge-files.test.ts\n\nno changes added to commit (use "git add" and/or "git commit -a")\n',
    diff: "diff --git a/backend/src/generate-knowledge-files.ts b/backend/src/generate-knowledge-files.ts\nindex 4ac8920..d7377ae 100644\n--- a/backend/src/generate-knowledge-files.ts\n+++ b/backend/src/generate-knowledge-files.ts\n@@ -13,6 +13,11 @@ export async function generateKnowledgeFiles(\n   fileContext: ProjectFileContext,\n   initialMessages: Message[]\n ): Promise<Promise<FileChange>[]> {\n+  console.log('generateKnowledgeFiles', {\n+    fullResponse,\n+    fileContext,\n+    initialMessages,\n+  })\n   const systemPrompt = `\n     You are an assistant that helps developers create knowledge files for their codebase. You are helpful and concise, knowing exactly when enough information has been gathered to create a knowledge file. Here's some more information on knowledge files:\n     ${knowledgeFilesPrompt}\ndiff --git a/npm-app/src/web-scraper.ts b/npm-app/src/web-scraper.ts\nindex ce679ce..7d04eb7 100644\n--- a/npm-app/src/web-scraper.ts\n+++ b/npm-app/src/web-scraper.ts\n@@ -2,12 +2,18 @@ import axios from 'axios'\n import * as cheerio from 'cheerio'\n \n // Global cache for scraped web pages\n-const scrapedPagesCache: Record<string, string> = {}\n+const scrapedPagesCache: Record<string, { content: string; timestamp: number }> = {}\n+\n+// Cache expiration time (in milliseconds)\n+const CACHE_EXPIRATION = 60 * 60 * 1000 // 1 hour\n \n export async function scrapeWebPage(url: string) {\n-  // Check if the page is already in the cache\n-  if (scrapedPagesCache[url] !== undefined) {\n-    return scrapedPagesCache[url]\n+  const now = Date.now()\n+  const cachedData = scrapedPagesCache[url]\n+\n+  // Check if the page is already in the cache and not expired\n+  if (cachedData && now - cachedData.timestamp < CACHE_EXPIRATION) {\n+    return cachedData.content\n   }\n \n   try {\n@@ -18,8 +24,8 @@ export async function scrapeWebPage(url: string) {\n     // Extract the main content (you may need to adjust this selector based on the target websites)\n     const content = $('body').text()\n \n-    // Store the scraped content in the cache\n-    scrapedPagesCache[url] = content\n+    // Store the scraped content in the cache with the current timestamp\n+    scrapedPagesCache[url] = { content, timestamp: now }\n \n     return content\n   } catch (error) {\n@@ -27,7 +33,7 @@ export async function scrapeWebPage(url: string) {\n     //   `Error scraping web page ${url}:`,\n     //   error instanceof Error ? error.message : error\n     // )\n-    scrapedPagesCache[url] = ''\n+    scrapedPagesCache[url] = { content: '', timestamp: now }\n     return ''\n   }\n }\n",
    diffCached: '',
    lastCommitMessages:
      "Add edits made by assistant into the response message\nJames Grugett (1):\n\nfix: toolcall check\nfeat: don't generate knowledge file if previous call was a `tool_use`\nfix: added back james await fix\nMerge branch 'main' into me/knowledge-files\nfix: prompt engineering\nfix: better chain of thought prompting\nfix: better prompting\nfix: weird knowledge file overwrite issue\nfix: stop using editing files prompt\nfix: remove unused knowledge tool",
  },
  changesSinceLastChat: {},
}

export const messages: Message[] = [
  {
    role: 'user',
    content:
      "let's add a cache to `web-scraper` so we can refresh the webpage at regular intervals, but not every time we need it\n\n",
  },
  {
    role: 'assistant',
    content:
      "Reading the following files...<files>npm-app/src/web-scraper.ts, npm-app/src/project-files.ts, npm-app/src/tool-handlers.ts, npm-app/src/client.ts, backend/src/generate-diffs-prompt.ts, backend/src/generate-diffs-via-expansion.ts, backend/src/generate-patch.ts, backend/src/process-stream.ts, backend/src/websockets/server.ts, common/src/util/file.ts, test/__mock-data__/app/expected.ts, backend/src/websockets/switchboard.ts, common/src/util/promise.ts, npm-app/src/config.ts, test/__src__/process-stream.test.ts</files>\n\nCertainly! I'll add a cache to the `web-scraper` that refreshes webpages at regular intervals. This will help reduce unnecessary requests while keeping the content relatively up-to-date. I'll make minimal changes to the existing code to implement this feature.\n\nFirst, let's update the `web-scraper.ts` file:\n\n<file path=\"npm-app/src/web-scraper.ts\">import axios from 'axios'\nimport * as cheerio from 'cheerio'\n\n// Global cache for scraped web pages\nconst scrapedPagesCache: Record<string, { content: string; timestamp: number }> = {}\n\n// Cache expiration time (in milliseconds)\nconst CACHE_EXPIRATION = 60 * 60 * 1000 // 1 hour\n\nexport async function scrapeWebPage(url: string) {\n  const now = Date.now()\n  const cachedData = scrapedPagesCache[url]\n\n  // Check if the page is already in the cache and not expired\n  if (cachedData && now - cachedData.timestamp < CACHE_EXPIRATION) {\n    return cachedData.content\n  }\n\n  try {\n    const response = await axios.get(url)\n    const html = response.data\n    const $ = cheerio.load(html)\n\n    // Extract the main content (you may need to adjust this selector based on the target websites)\n    const content = $('body').text()\n\n    // Store the scraped content in the cache with the current timestamp\n    scrapedPagesCache[url] = { content, timestamp: now }\n\n    return content\n  } catch (error) {\n    // console.error(\n    //   `Error scraping web page ${url}:`,\n    //   error instanceof Error ? error.message : error\n    // )\n    scrapedPagesCache[url] = { content: '', timestamp: now }\n    return ''\n  }\n}\n\n// ... rest of the file remains unchanged ...\n</file>\n\nThese changes implement a simple caching mechanism for scraped web pages. Here's what the modifications do:\n\n1. We've updated the `scrapedPagesCache` to store both the content and the timestamp of when it was scraped.\n2. We've added a `CACHE_EXPIRATION` constant set to 1 hour (60 * 60 * 1000 milliseconds).\n3. In the `scrapeWebPage` function, we now check if the cached data exists and is not expired before returning it.\n4. If the cache is expired or doesn't exist, we proceed with scraping the page as before.\n5. When storing the scraped content in the cache, we now include the current timestamp.\n\nThese changes will ensure that web pages are only re-scraped after the cache expiration time has passed, reducing the number of requests made to external websites while keeping the content relatively up-to-date.\n\nThe rest of the file, including the `parseUrlsFromContent` and `getScrapedContentBlocks` functions, remains unchanged as they don't directly interact with the caching mechanism.\n\n",
  },
  {
    role: 'user',
    content: "now let's update it to every 4 hours\n\n",
  },
]

export const expectedFiles: FileChange[] = []
