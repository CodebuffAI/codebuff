/**
 * React 19 compatibility shim for OpenTUI JSX types.
 *
 * OpenTUI's JSX namespace defines `type Element = React.ReactNode`.
 * In React 19, `FunctionComponent` returns `ReactNode | Promise<ReactNode>`,
 * but `Promise<ReactNode>` is not assignable to `ReactNode`.
 *
 * This augmentation adds a narrower call signature to `FunctionComponent`
 * that returns just `ReactNode`. Due to TypeScript's interface merging rules,
 * the later declaration's overloads have higher precedence, so the narrower
 * signature is resolved first — fixing all `React.FC` JSX compatibility errors.
 */
import 'react'

declare module 'react' {
  interface FunctionComponent<P = {}> {
    (props: P): ReactNode
  }
}
