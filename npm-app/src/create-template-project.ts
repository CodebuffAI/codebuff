import { execSync } from 'child_process'
import { join } from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { green } from 'picocolors'

export async function createTemplateProject(
  template: string,
  projectDir: string,
  projectName: string = template
) {
  console.log(
    `Creating project from ${template} template in ${projectDir}/${projectName}`
  )

  // Validate template name contains only alphanumeric chars, dash and underscore
  if (!/^[a-zA-Z0-9-_]+$/.test(template)) {
    console.error(
      'Template name can only contain letters, numbers, dash and underscore'
    )
    process.exit(1)
  }

  // Validate project name
  if (!/^[a-zA-Z0-9-_]+$/.test(projectName)) {
    console.error(
      'Project name can only contain letters, numbers, dash and underscore'
    )
    process.exit(1)
  }

  const projectPath = join(projectDir, projectName)

  // Check if directory already exists
  if (fs.existsSync(projectPath)) {
    console.error(`Directory ${projectPath} already exists`)
    process.exit(1)
  }

  try {
    console.log('\nDownloading template...')
    // Clone the community repo to a temp directory
    const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'codebuff-starter-'))
    execSync(
      'git clone --depth 1 https://github.com/CodebuffAI/codebuff-community.git .',
      {
        cwd: tempDir,
        stdio: 'pipe',
      }
    )

    // Check if template exists in starter-templates or showcase directory
    const starterTemplateDir = join(tempDir, 'starter-templates', template)
    const showcaseDir = join(tempDir, 'showcase', template)
    let templateDir: string

    if (fs.existsSync(starterTemplateDir)) {
      templateDir = starterTemplateDir
    } else if (fs.existsSync(showcaseDir)) {
      templateDir = showcaseDir
    } else {
      console.error(
        `Template ${template} not found in starter-templates/ or showcase/`
      )
      fs.rmSync(tempDir, { recursive: true, force: true })
      process.exit(1)
    }

    // Create parent directory if it doesn't exist
    if (projectDir) {
      fs.mkdirSync(projectDir, { recursive: true })
    }

    // Copy template to new directory
    fs.mkdirSync(projectPath)
    fs.cpSync(templateDir, projectPath, { recursive: true })

    // Remove .git directory if it exists
    const gitDir = join(projectPath, '.git')
    if (fs.existsSync(gitDir)) {
      fs.rmSync(gitDir, { recursive: true, force: true })
    }

    // Initialize new git repo
    console.log('\nInitializing git repo...')
    execSync('git init', { cwd: projectPath, stdio: 'pipe' })

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })

    // Install dependencies
    if (fs.existsSync(join(projectPath, 'package-lock.json'))) {
      console.log('\nInstalling dependencies...')
      execSync('npm install', { cwd: projectPath, stdio: 'inherit' })
    }

    console.log(green(`\nSuccessfully created new project in ${projectPath}\n`))

    // Change into the new project directory and run codebuff
    process.chdir(projectPath)
    console.log('Starting Codebuff in the new project...\n')
    console.log('--------------------------------\n')
    execSync('codebuff', { stdio: 'inherit' })
  } catch (error) {
    console.error('Failed to initialize project:', error)
    process.exit(1)
  }
}
