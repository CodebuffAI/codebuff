import { Digit } from './digit'
import React, { useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

type DisplayType = {
  count?: number
  height: number
  value: string | number | null
  color?: string
  backgroundColor?: string
  skew?: boolean
}

export const Display = ({
  count = 2,
  height = 250,
  value = null,
  color = 'red',
  backgroundColor,
  skew = false,
}: DisplayType) => {
  const calculateDigits = () => {
    let newDigits = value ? value.toString().split('') : null

    if (!value || count < value.toString().length) {
      newDigits = null
    }

    if (value && count > value.toString().length) {
      for (let i = 0; i < count - value.toString().length; i++) {
        newDigits?.unshift('0')
      }
    }
    return newDigits
  }
  const [digits, setDigits] = useState<null | string[]>(
    calculateDigits() ?? ['-', '-']
  )

  const style = {
    height: 'fit-content',
    width: 'fit-content',
  } as React.CSSProperties

  const displayStyle = {
    height: 'fit-content',
    width: 'fit-content',
    backgroundColor: backgroundColor ? backgroundColor : 'transparent',
    color: 'white',
  } as React.CSSProperties

  useEffect(() => {
    setDigits(calculateDigits())
  }, [count, value])

  return (
    <Col className="display" style={displayStyle}>
      <Row className="display-digits" style={style}>
        {digits
          ? digits.map((digit, index) => {
              return (
                <Digit
                  key={index}
                  char={digit}
                  height={height}
                  color={color}
                  skew={skew}
                />
              )
            })
          : Array.from(Array(count).keys()).map((index) => {
              return (
                <Digit
                  key={index}
                  char="-"
                  height={height}
                  color={color}
                  skew={skew}
                />
              )
            })}
      </Row>
    </Col>
  )
}
