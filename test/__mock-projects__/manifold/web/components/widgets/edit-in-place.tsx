import { ReactNode, useState } from 'react'
import { ExpandingInput } from './expanding-input'

export const EditInPlaceInput = (props: {
  className?: string
  disabled?: boolean
  initialValue?: string
  onSave: (value: string) => void
  /** The text to show when input is not focused. Required. */
  children: (value: string) => ReactNode
}) => {
  const { className, disabled, initialValue = '', onSave, children } = props
  const [value, setValue] = useState(initialValue)
  const [editing, setEditing] = useState(false)

  const save = () => {
    onSave(value)
    setEditing(false)
  }

  return editing ? (
    <ExpandingInput
      className={className}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && save()}
      autoFocus
      onFocus={(e) => {
        // move cursor to end
        e.target.value = ' '
        e.target.value = value
      }}
    />
  ) : (
    <div onClick={() => !disabled && setEditing(true)}>{children(value)}</div>
  )
}
