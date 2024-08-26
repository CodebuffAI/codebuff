import { Switch } from '@headlessui/react'
import clsx from 'clsx'
import { Tooltip } from 'web/components/widgets/tooltip'
import ShortToggle, { ToggleColorMode } from './widgets/short-toggle'

export const SwitchSetting = (props: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: 'Web' | 'Email' | 'Mobile'
  disabled: boolean
  colorMode?: ToggleColorMode
}) => {
  const { colorMode, checked, onChange, label, disabled } = props
  return (
    <Switch.Group as="div" className="flex items-center gap-3">
      <Tooltip
        text={
          disabled && label !== 'Mobile'
            ? `You are opted out of all ${label} notifications. Go to the Opt Out section to undo this setting.`
            : disabled && label === 'Mobile'
            ? `You are opted out of all ${label} notifications. First download the app (Android available now, iOS soon!) and allow notifications. If you've already done so, go to the Opt Out section to undo this setting.`
            : ''
        }
      >
        <ShortToggle
          colorMode={colorMode}
          on={checked}
          setOn={onChange}
          disabled={disabled}
        />
      </Tooltip>
      <Switch.Label
        className={clsx(
          'text-ink-900 text-sm',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        )}
      >
        {label}
      </Switch.Label>
    </Switch.Group>
  )
}
