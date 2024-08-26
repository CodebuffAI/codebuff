import { useEffect, useRef } from 'react'

export const Typewriter = (props: { words: string[] }) => {
  const { words } = props
  const typingElement = useRef<HTMLSpanElement>(null)
  const wordIndex = useRef(0)
  const charIndex = useRef(0)
  const deleteTimeout = 2000
  const typeTimeout = 100

  useEffect(() => {
    typeWords()
  }, [])

  const typeWords = () => {
    if (typingElement.current) {
      if (charIndex.current < words[wordIndex.current].length) {
        typingElement.current.textContent =
          words[wordIndex.current].substring(0, charIndex.current) + '_'
        charIndex.current++
        setTimeout(typeWords, typeTimeout)
      } else {
        typingElement.current.textContent = words[wordIndex.current]
        setTimeout(eraseWords, deleteTimeout)
      }
    }
  }

  const eraseWords = () => {
    if (typingElement.current) {
      if (charIndex.current > 0) {
        typingElement.current.textContent =
          words[wordIndex.current].substring(0, charIndex.current - 1) + '_'
        charIndex.current--
        setTimeout(eraseWords, 50)
      } else {
        wordIndex.current++
        if (wordIndex.current >= words.length) {
          wordIndex.current = 0
        }
        charIndex.current = 0
        setTimeout(typeWords, 500)
      }
    }
  }

  return <span className={'min-h-5'} ref={typingElement}></span>
}
