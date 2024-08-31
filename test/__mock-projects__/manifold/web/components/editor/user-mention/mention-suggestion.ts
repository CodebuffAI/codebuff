import type { MentionOptions } from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import { beginsWith } from 'common/util/parse'
import { sortBy } from 'lodash'
import tippy from 'tippy.js'
import { searchUsers } from 'web/lib/supabase/users'
import { MentionList } from './mention-list'
type Render = Suggestion['render']

type Suggestion = MentionOptions['suggestion']

// copied from https://tiptap.dev/api/nodes/mention#usage
export const mentionSuggestion: Suggestion = {
  allowedPrefixes: [' '],
  items: async ({ query }) =>
    sortBy(await searchUsers(query, 6), (u) =>
      [u.name, u.username].some((s) => beginsWith(s, query)) ? -1 : 0
    ),
  render: makeMentionRender(MentionList),
}

export function makeMentionRender(mentionList: any): Render {
  return () => {
    let component: ReactRenderer
    let popup: ReturnType<typeof tippy>
    return {
      onStart: (props) => {
        component = new ReactRenderer(mentionList, {
          props,
          editor: props.editor,
        })
        if (!props.clientRect) {
          return
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as any,
          appendTo: () => document.body,
          content: component?.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })
      },
      onUpdate(props) {
        component?.updateProps(props)

        if (!props.clientRect) {
          return
        }

        popup?.[0].setProps({
          getReferenceClientRect: props.clientRect as any,
        })
      },
      onKeyDown(props) {
        if (props.event.key)
          if (
            props.event.key === 'Escape' ||
            // Also break out of the mention if the tooltip isn't visible
            (props.event.key === 'Enter' && !popup?.[0].state.isShown)
          ) {
            popup?.[0].destroy()
            component?.destroy()
            return false
          }
        return (component?.ref as any)?.onKeyDown(props)
      },
      onExit() {
        popup?.[0].destroy()
        component?.destroy()
      },
    }
  }
}
