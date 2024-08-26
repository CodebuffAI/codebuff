import { Row } from 'web/components/layout/row'
import { Checkbox } from 'web/components/widgets/checkbox'

export const MultiCheckbox = (props: {
  choices: { [key: string]: string }
  selected: string[]
  onChange: (selected: string[]) => void
}) => {
  const { choices, selected, onChange } = props
  return (
    <Row className={'flex-wrap gap-3'}>
      {Object.entries(choices).map(([key, value]) => (
        <Checkbox
          key={key}
          label={key}
          checked={selected.includes(value)}
          toggle={(checked: boolean) => {
            if (checked) {
              onChange([...selected, value])
            } else {
              onChange(selected.filter((s) => s !== value))
            }
          }}
        />
      ))}
    </Row>
  )
}
