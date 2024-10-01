import { test, expect, mock } from 'bun:test'
import { processStreamWithTags } from 'backend/process-stream'
import { range } from 'lodash'

test('processStreamWithFiles basic functionality', async () => {
  const mockStream = async function* () {
    yield 'before'
    yield '<file path="test.txt">file content</file>'
    yield 'after'
  }
  const onFileStart = mock((attributes: Record<string, string>) => '')
  const onFile = mock((content: string, attributes: Record<string, string>) => {
    return false
  })
  const result = []
  for await (const chunk of processStreamWithTags(mockStream(), {
    file: {
      attributeNames: ['path'],
      onTagStart: onFileStart,
      onTagEnd: onFile,
    },
  })) {
    result.push(chunk)
  }
  expect(result.join('')).toEqual('beforeafter')
  expect(onFileStart).toHaveBeenCalledWith({ path: 'test.txt' })
  expect(onFile).toHaveBeenCalledWith('file content', { path: 'test.txt' })
})

test('processStreamWithTags handles tool_call for terminal command', async () => {
  const mockStream = async function* () {
    yield 'I will run bun install for you. '
    yield '<tool_call name="run_terminal_command">bun install</tool_call>'
  }
  const onToolCallStart = mock((attributes: Record<string, string>) => '')
  const onToolCall = mock(
    (content: string, attributes: Record<string, string>) => {
      return false
    }
  )
  const result = []
  for await (const chunk of processStreamWithTags(mockStream(), {
    tool_call: {
      attributeNames: ['name'],
      onTagStart: onToolCallStart,
      onTagEnd: onToolCall,
    },
  })) {
    result.push(chunk)
  }
  expect(result.join('')).toEqual('I will run bun install for you. ')
  expect(onToolCallStart).toHaveBeenCalledWith({ name: 'run_terminal_command' })
  expect(onToolCall).toHaveBeenCalledWith('bun install', {
    name: 'run_terminal_command',
  })
})

test('processStreamWithTags handles tool_call for terminal command split into many chunks', async () => {
  const mockStream = async function* () {
    yield 'I will run bun install for'
    yield ' you. <tool_call '
    yield 'name="run_terminal_'
    yield 'command">bun '
    yield 'install</tool_call> thanks'
    yield 'cool'
  }
  const onToolCallStart = mock((attributes: Record<string, string>) => '')
  const onToolCall = mock(
    (content: string, attributes: Record<string, string>) => {
      return false
    }
  )
  const result = []
  for await (const chunk of processStreamWithTags(mockStream(), {
    tool_call: {
      attributeNames: ['name'],
      onTagStart: onToolCallStart,
      onTagEnd: onToolCall,
    },
  })) {
    result.push(chunk)
  }
  expect(result.join('')).toEqual('I will run bun install for you.  thankscool')
  expect(onToolCallStart).toHaveBeenCalledWith({ name: 'run_terminal_command' })
  expect(onToolCall).toHaveBeenCalledWith('bun install', {
    name: 'run_terminal_command',
  })
})

test('processStreamWithTags handles tool_call with preamble and postamble', async () => {
  const mockStream = async function* () {
    yield range(30)
      .map(() => 'I will run bun install for you. ')
      .join('')
    yield '<tool_call '
    yield 'name="run_terminal_'
    yield 'command">bun '
    yield 'install</tool_call> thanks'
    yield 'cool'
    yield range(30)
      .map(() => 'it is done yes it is done ')
      .join('')
  }
  const onToolCallStart = mock((attributes: Record<string, string>) => '')
  const onToolCall = mock(
    (content: string, attributes: Record<string, string>) => {
      return false
    }
  )
  const result = []
  for await (const chunk of processStreamWithTags(mockStream(), {
    tool_call: {
      attributeNames: ['name'],
      onTagStart: onToolCallStart,
      onTagEnd: onToolCall,
    },
  })) {
    result.push(chunk)
  }
  expect(result.join('')).toEqual(
    `I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you.  thankscoolit is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done `
  )
  expect(onToolCallStart).toHaveBeenCalledWith({ name: 'run_terminal_command' })
  expect(onToolCall).toHaveBeenCalledWith('bun install', {
    name: 'run_terminal_command',
  })
})

test('processStreamWithTags handles <file> tags with multiple calls', async () => {
  const mockStream = async function* () {
    yield range(10)
      .map(() => 'I will run bun install for you. ')
      .join('')
    yield '<file '
    yield 'path="test.txt">'
    yield 'file content'
    yield '</file> thanks'
    yield 'cool<file '
    yield 'path="test.txt">'
    yield 'file content'
    yield '</file> thanks'
    yield range(10)
      .map(() => 'it is done yes it is done ')
      .join('')
  }
  const onFileStart = mock((attributes: Record<string, string>) => '')
  const onFile = mock((content: string, attributes: Record<string, string>) => {
    return false
  })
  const result = []
  for await (const chunk of processStreamWithTags(mockStream(), {
    file: {
      attributeNames: ['path'],
      onTagStart: onFileStart,
      onTagEnd: onFile,
    },
  })) {
    result.push(chunk)
  }
  expect(result.join('')).toEqual(
    `I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you. I will run bun install for you.  thankscool thanksit is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done it is done yes it is done `
  )
  expect(onFileStart).toHaveBeenCalledWith({ path: 'test.txt' })
  expect(onFile).toHaveBeenCalledWith('file content', {
    path: 'test.txt',
  })
})

test('processStreamWithTags handles <file> tags with multiple calls and different attributes', async () => {
  const mockStream = async function* () {
    yield `To add appropriate gitignore rules for Terraform, we need to update the existing \`.gitignore\` file. <rollingPolicy>hithere</rollingPolicy> We'll add the standard Terraform-related files and directories that should be ignored.\n\n<file path=\".gitignore\">\n/target\n/classes\n/checkouts\nprofiles.clj\npom.xml\npom.xml.asc\n*.jar\n*.class\n/.lein-*\n/.nrepl-port\n/.prepl-port\n.hgignore\n.hg/\nconfig.edn\n.calva\n.clj-kondo\n.lsp\nlogs/\n\n# Terraform\n*.tfstate\n*.tfstate.*\n.terraform/\n*.tfvars\n!terraform.tfvars\n</file>\n\nThis update adds the following Terraform-specific rules to the existing \`.gitignore\` file:\n\n1. \`*.tfstate\` and \`*.tfstate.*\`: Ignores Terraform state files, which contain sensitive information and should not be version controlled.\n2. \`.terraform/\`: Ignores the \`.terraform\` directory, which contains downloaded providers and modules.\n3. \`*.tfvars\`: Ignores all \`.tfvars\` files, which might contain sensitive variables.\n4. \`!terraform.tfvars\`: This exception allows \`terraform.tfvars\` to be tracked, which is often used for non-sensitive, shared variables.\n\nThese additions will help ensure that sensitive Terraform-related files are not accidentally committed to version control.\n\n\n[END]\n\n<edits_made_by_assistant>\n<file path=\".gitignore\">\n@@ -14,5 +14,12 @@\n config.edn\n .calva\n .clj-kondo\n .lsp\n-logs/\n\\ No newline at end of file\n+logs/\n+\n+# Terraform\n+*.tfstate\n+*.tfstate.*\n+.terraform/\n+*.tfvars\n+!terraform.tfvars\n\n</file>\n<file path=\"terraform.knowledge.md\">\n@@ -28,9 +28,27 @@\n - Configure application to use Google Cloud Logging\n - Logs will be accessible via Google Cloud Console\n - Use appropriate logging library compatible with Google Cloud Logging (e.g., Logback with Google Cloud Logging appender)\n \n+## Version Control\n+- Add Terraform-specific entries to .gitignore:\n+  \`\`\`\n+  # Terraform files\n+  .terraform/\n+  *.tfstate\n+  *.tfstate.*\n+  crash.log\n+  *.tfvars\n+  override.tf\n+  override.tf.json\n+  *_override.tf\n+  *_override.tf.json\n+  \`\`\`\n+- Commit \`main.tf\` and other Terraform configuration files\n+- Do not commit \`terraform.tfvars\` if it contains sensitive information\n+\n ## Reference\n - [Terraform Documentation](https://www.terraform.io/docs)\n - [Google Cloud Terraform Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)\n - [Google Cloud Logging](https://cloud.google.com/logging/docs)\n+- [Terraform .gitignore Template](https://github.com/github/gitignore/blob/main/Terraform.gitignore)\n \n\n</file>\n</edits_made_by_assistant>`

  }
  const onFileStart = mock((attributes: Record<string, string>) => '')
  const onFile = mock((content: string, attributes: Record<string, string>) => {
    return false
  })
  const result = []
  for await (const chunk of processStreamWithTags(mockStream(), {
    file: {
      attributeNames: ['path'],
      onTagStart: onFileStart,
      onTagEnd: onFile,
    },
  })) {
    result.push(chunk)
  }
  expect(result.join('')).toEqual(
      `To add appropriate gitignore rules for Terraform, we need to update the existing \`.gitignore\` file. <rollingPolicy>hithere</rollingPolicy> We'll add the standard Terraform-related files and directories that should be ignored.\n\n\n\nThis update adds the following Terraform-specific rules to the existing \`.gitignore\` file:\n\n1. \`*.tfstate\` and \`*.tfstate.*\`: Ignores Terraform state files, which contain sensitive information and should not be version controlled.\n2. \`.terraform/\`: Ignores the \`.terraform\` directory, which contains downloaded providers and modules.\n3. \`*.tfvars\`: Ignores all \`.tfvars\` files, which might contain sensitive variables.\n4. \`!terraform.tfvars\`: This exception allows \`terraform.tfvars\` to be tracked, which is often used for non-sensitive, shared variables.\n\nThese additions will help ensure that sensitive Terraform-related files are not accidentally committed to version control.\n\n\n[END]\n\n<edits_made_by_assistant>\n\n\n</edits_made_by_assistant>`
  )
})
