// turndown-plugin-gfm ships no types; declare the plugins we use. A Turndown
// plugin is a function applied via `turndownService.use(plugin)`.
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'

  type TurndownPlugin = TurndownService.Plugin

  export const gfm: TurndownPlugin
  export const tables: TurndownPlugin
  export const strikethrough: TurndownPlugin
  export const taskListItems: TurndownPlugin
}
