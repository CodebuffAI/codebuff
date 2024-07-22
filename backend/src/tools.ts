import { Tool } from '@anthropic-ai/sdk/resources'

export const getTools = (): Tool[] => {
  return [
    {
      name: 'read_files',
      description: `Retrieves the current contents of files given a list of file paths in the user's project. You should provide an array of file paths that refer to existing files in the user's project. The tool will provide the file contents for each. It should be used frequently and liberally to gain context on the user's coding questions and before modifying each file. You should not invoke the tool more than once to read the same file if it likely has not changed. This tool should not be used to create or modify files directly -- only to read them.`,
      input_schema: {
        type: 'object',
        properties: {
          file_paths: {
            type: 'array',
            description: 'The file paths to read',
          },
        },
      },
    } as Tool,
    {
      name: 'scrape_web_page',
      description: `Retrieves the content of a web page given a URL. This tool is helpful when you need to gather information from external sources, such as documentation, APIs, or other web-based resources. Use this tool when the user asks for information that might be available on a specific website or when you need to reference external documentation to answer a question or solve a problem.`,
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the web page to scrape',
          },
        },
      },
    } as Tool,
  ]
}
