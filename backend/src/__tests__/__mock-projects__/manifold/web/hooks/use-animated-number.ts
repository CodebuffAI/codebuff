import { useState } from 'react'
import { useSpring } from '@react-spring/web'

export const useAnimatedNumber = (value: number) => {
  const [initialProb] = useState(value)
  const spring = useSpring({ val: value, from: { val: initialProb } })
  return spring.val
}
