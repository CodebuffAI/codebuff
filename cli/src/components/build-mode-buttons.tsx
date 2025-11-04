import type { ChatTheme } from '../types/theme-system'

export const BuildModeButtons = ({
  theme,
  onBuildFast,
  onBuildMax,
}: {
  theme: ChatTheme
  onBuildFast: () => void
  onBuildMax: () => void
}) => {
  return (
    <box
      style={{
        flexDirection: 'row',
        gap: 2,
        paddingTop: 1,
        paddingBottom: 1,
        paddingLeft: 1,
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#0a6515',
          paddingLeft: 2,
          paddingRight: 2,
        }}
        onMouseDown={onBuildFast}
      >
        <text wrap={false}>
          <span fg="#ffffff">Build Fast</span>
        </text>
      </box>
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#ac1626',
          paddingLeft: 2,
          paddingRight: 2,
        }}
        onMouseDown={onBuildMax}
      >
        <text wrap={false}>
          <span fg="#ffffff">Build Max</span>
        </text>
      </box>
    </box>
  )
}
