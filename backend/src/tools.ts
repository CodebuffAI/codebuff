import { Tool } from '@anthropic-ai/sdk/resources'

export const getTools = (): Tool[] => {
  return [
    {
      name: 'read_files',
      description: `Retrieves the current contents of files given a list of file paths in the user's project. You should provide an array of file paths that refer to existing files in the user's project. The tool will provide the file contents for each. It should be used frequently and liberally to gain context on the user's coding questions and before modifying each file.`,
      input_schema: {
        type: 'object',
        properties: {
          file_paths: {
            type: 'array',
            description: 'The file paths to read',
          },
        },
      },
      required: 'file_paths',
    } as Tool,
  ]
}
