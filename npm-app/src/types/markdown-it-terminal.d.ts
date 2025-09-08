declare module 'markdown-it-terminal' {
  import MarkdownIt from 'markdown-it'
  
  function terminal(md: MarkdownIt, options?: any): void
  
  export default terminal
}
