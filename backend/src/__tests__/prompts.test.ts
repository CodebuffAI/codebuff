import { generateDiffBlocks } from '../prompts'
import { promptClaudeWithContinuation } from '../claude'

jest.mock('../claude', () => ({
  promptClaudeWithContinuation: jest.fn(),
}))

describe('generateDiffBlocks', () => {
  it('should generate correct diff blocks for a simple change', async () => {
    const mockResponse = `
1. The change is adding a new import statement for react-hook-form.
2. The import section is being modified.
3. The new import can be added after the existing imports.
4. The file is using 2 spaces for indentation.
5. The import statements are not indented (0 levels).
6. Here are the changes:

<file path="example.ts">
<old>
import React from 'react'
import { Button } from './Button'
import { Input } from './Input'
</old>
<new>
import React from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { useForm } from 'react-hook-form'
</new>
</file>
`
    // Mock the promptClaudeWithContinuation function
    ;(promptClaudeWithContinuation as jest.Mock).mockResolvedValue({
      response: mockResponse,
    })

    const filePath = 'example.ts'
    const oldContent = `
import React from 'react'
import { Button } from './Button'
import { Input } from './Input'

function LoginForm() {
  return (
    <form>
      <Input type="email" placeholder="Email" />
      <Input type="password" placeholder="Password" />
      <Button>Log In</Button>
    </form>
  )
}

export default LoginForm
`

    const newContent = `
import React from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { useForm } from 'react-hook-form'

function LoginForm() {
  return (
    <form>
      <Input type="email" placeholder="Email" />
      <Input type="password" placeholder="Password" />
      <Button>Log In</Button>
    </form>
  )
}

export default LoginForm
`

    const result = await generateDiffBlocks(
      [],
      filePath,
      oldContent,
      newContent
    )

    expect(result).toEqual([
      {
        oldContent: `import React from 'react'
import { Button } from './Button'
import { Input } from './Input'`,
        newContent: `import React from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { useForm } from 'react-hook-form'`,
      },
    ])

    // Verify that promptClaudeWithContinuation was called with the correct arguments
    expect(promptClaudeWithContinuation).toHaveBeenCalledWith([
      {
        role: 'user',
        content: expect.stringContaining('File path: example.ts'),
      },
    ])
  })
})
