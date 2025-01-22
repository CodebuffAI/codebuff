import type { Root, Code } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * This plugin finds code blocks in Markdown (```lang ... ```)
 * and replaces them with an <CodeDemo language="lang">...</CodeDemo> MDX node,
 * preserving multi-line formatting.
 * 
 * If no language is specified (plain ``` block), it leaves the original code block unchanged.
 */
export const remarkCodeToCodeDemo = function remarkCodeToCodeDemo(): Plugin<any[], Root> {
  return function transformer(tree) {
    visit(tree, 'code', (node: Code, index, parent: any) => {
      if (!parent || typeof index !== 'number') return

      // Skip transformation if no language is specified
      if (!node.lang) return

      // Build an MDX JSX node representing <CodeDemo language="lang">...</CodeDemo>
      const codeDemoNode: any = {
        type: 'mdxJsxFlowElement',
        name: 'CodeDemo',
        attributes: [
          {
            type: 'mdxJsxAttribute',
            name: 'language',
            value: node.lang,
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