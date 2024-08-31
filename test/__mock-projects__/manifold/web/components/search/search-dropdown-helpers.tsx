export default function generateFilterDropdownItems<T extends string>(
  items: readonly { readonly label: string; readonly value: T }[],
  setState: (selection: T) => void
) {
  return items.map((item) => {
    return { name: item.label, onClick: () => setState(item.value) }
  })
}

export function getLabelFromValue<T extends string>(
  items: readonly { readonly label: string; readonly value: T }[],
  value: T
) {
  const item = items.find((item) => item.value === value)
  return item?.label
}
