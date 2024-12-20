import { Spacer } from 'ink'
import React from 'react'

interface JoinProps<T> {
  items: T[]
  renderItem: (item: T) => React.ReactNode
  separator: React.ReactNode
}

const Join = <T,>({ items, renderItem, separator }: JoinProps<T>) => {
  return (
    <>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {renderItem(item)}
          {i < items.length - 1 && separator}
        </React.Fragment>
      ))}
    </>
  )
}

export default Join
