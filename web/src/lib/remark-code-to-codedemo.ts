import { visit } from 'unist-util-visit'

import type { Root, Code } from 'mdast'
import type { Plugin } from 'unified'

/**
 * This plugin finds code blocks in Markdown (```lang ... ```)
 * and replaces them with an <CodeDemo language="lang">...</CodeDemo> MDX node,
 * preserving multi-line formatting.
 *
 * If no language is specified (plain ``` block), it defaults to 'text' language.
 */
export const remarkCodeToCodeDemo = function remarkCodeToCodeDemo(): Plugin<
  any[],
  Root
> {
  return function transformer(tree) {
    visit(tree, 'code', (node: Code, index, parent: any) => {
      if (!parent || typeof index !== 'number') return

      // Default to 'text' if no language is specified
      const language = node.lang || 'text'

      // Build an MDX JSX node representing <CodeDemo language="lang" rawContent="...">...</CodeDemo>
      const codeDemoNode: any = {
        type: 'mdxJsxFlowElement',
        name: 'CodeDemo',
        attributes: [
          {
            type: 'mdxJsxAttribute',
            name: 'language',
            value: language,
          },
          {
            type: 'mdxJsxAttribute',
            name: 'rawContent',
            value: node.value,
          },
        ],
        children: [
          {
            type: 'text',
            value: node.value,
          },
        ],
      }

      // Replace the original code block with our custom MDX node
      parent.children[index] = codeDemoNode
    })
  }
}
