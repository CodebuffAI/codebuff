import React, { useState, useEffect, useRef } from 'react'

import TerminalInput from './terminal-input'
import TerminalOutput from './terminal-output'

import type { KeyboardEvent, ChangeEvent, ReactNode } from 'react'

import './style.css'
import { cn } from '@/lib/utils'

export enum ColorMode {
  Light,
  Dark,
}

export interface Props {
  name?: string
  prompt?: string
  colorMode?: ColorMode
  children?: ReactNode
  onInput?: ((input: string) => void) | null | undefined
  startingInputValue?: string
  redBtnCallback?: () => void
  yellowBtnCallback?: () => void
  greenBtnCallback?: () => void
  scrollToPosition?: boolean
  className?: string
  showWindowButtons?: boolean
}

const Terminal = ({
  name,
  prompt,
  colorMode,
  onInput,
  children,
  startingInputValue = '',
  redBtnCallback,
  yellowBtnCallback,
  greenBtnCallback,
  scrollToPosition = true,
  className,
  showWindowButtons = true,
}: Props) => {
  const [currentLineInput, setCurrentLineInput] = useState('')
  const [cursorPos, setCursorPos] = useState(0)
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = terminalRef.current?.closest(
      '.react-terminal-wrapper',
    ) as HTMLElement | null
    if (!wrapper) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = wrapper.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      wrapper.style.setProperty('--mouse-x', `${x}%`)
      wrapper.style.setProperty('--mouse-y', `${y}%`)
    }

    wrapper.addEventListener('mousemove', handleMouseMove as EventListener)
    return () =>
      wrapper.removeEventListener('mousemove', handleMouseMove as EventListener)
  }, [])

  const updateCurrentLineInput = (event: ChangeEvent<HTMLInputElement>) => {
    setCurrentLineInput(event.target.value)
    terminalRef.current?.scrollTo({
      top: terminalRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }

  useEffect(() => {
    terminalRef.current?.scrollTo({
      top: terminalRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [children])

  const calculateInputWidth = (
    inputElement: HTMLInputElement,
    chars: string,
  ) => {
    const span = document.createElement('span')
    span.style.visibility = 'hidden'
    span.style.position = 'absolute'
    span.style.fontSize = window.getComputedStyle(inputElement).fontSize
    span.style.fontFamily = window.getComputedStyle(inputElement).fontFamily
    span.innerText = chars
    document.body.appendChild(span)
    const width = span.getBoundingClientRect().width
    document.body.removeChild(span)
    return -width
  }

  const clamp = (value: number, min: number, max: number) => {
    if (value > max) return max
    if (value < min) return min
    return value
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!onInput) {
      return
    }
    if (event.key === 'Enter') {
      onInput(currentLineInput)
      setCursorPos(0)
      setCurrentLineInput('')
      if (scrollToPosition) {
        setTimeout(
          () =>
            terminalRef?.current?.scrollTo({
              top: terminalRef.current.scrollHeight,
              behavior: 'smooth',
            }),
          500,
        )
      }
    } else if (
      ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Delete'].includes(
        event.key,
      )
    ) {
      const inputElement = event.currentTarget
      let charsToRightOfCursor = ''
      let cursorIndex =
        currentLineInput.length - (inputElement.selectionStart || 0)
      cursorIndex = clamp(cursorIndex, 0, currentLineInput.length)

      if (event.key === 'ArrowLeft') {
        if (cursorIndex > currentLineInput.length - 1) cursorIndex--
        charsToRightOfCursor = currentLineInput.slice(
          currentLineInput.length - 1 - cursorIndex,
        )
      } else if (event.key === 'ArrowRight' || event.key === 'Delete') {
        charsToRightOfCursor = currentLineInput.slice(
          currentLineInput.length - cursorIndex + 1,
        )
      } else if (event.key === 'ArrowUp') {
        charsToRightOfCursor = currentLineInput.slice(0)
      }

      const inputWidth = calculateInputWidth(inputElement, charsToRightOfCursor)
      setCursorPos(inputWidth)
    }
  }

  useEffect(() => {
    setCurrentLineInput(startingInputValue.trim())
  }, [startingInputValue])

  useEffect(() => {
    if (onInput == null) {
      return
    }
    const elListeners: {
      terminalEl: Element
      listener: EventListenerOrEventListenerObject
    }[] = []
    for (const terminalEl of document.getElementsByClassName(
      'react-terminal-wrapper',
    )) {
      const listener = () => {
        ;(
          terminalEl?.querySelector('.terminal-hidden-input') as HTMLElement
        )?.focus()
        terminalEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      terminalEl?.addEventListener('click', listener)
      elListeners.push({ terminalEl, listener })
    }
    return function cleanup() {
      elListeners.forEach((elListener) => {
        elListener.terminalEl.removeEventListener('click', elListener.listener)
      })
    }
  }, [onInput])

  const classes = ['react-terminal-wrapper', 'px-6', 'pt-6', 'pb-16']
  if (colorMode === ColorMode.Light) {
    classes.push('react-terminal-light')
  }

  return (
    <div className={classes.join(' ')} data-terminal-name={name}>
      {showWindowButtons && (
        <div className="react-terminal-window-buttons flex-none">
          <button
            className={`${yellowBtnCallback ? 'clickable' : ''} red-btn`}
            disabled={!redBtnCallback}
            onClick={redBtnCallback}
          />
          <button
            className={`${yellowBtnCallback ? 'clickable' : ''} yellow-btn`}
            disabled={!yellowBtnCallback}
            onClick={yellowBtnCallback}
          />
          <button
            className={`${greenBtnCallback ? 'clickable' : ''} green-btn`}
            disabled={!greenBtnCallback}
            onClick={greenBtnCallback}
          />
        </div>
      )}
      <div
        className={cn(
          'react-terminal',
          'flex-1',
          showWindowButtons && 'mt-6',
          className,
        )}
        ref={terminalRef}
      >
        {children}
        {typeof onInput === 'function' && (
          <div
            className="react-terminal-line react-terminal-input react-terminal-active-input"
            data-terminal-prompt={prompt || '$'}
            key="terminal-line-prompt"
          >
            {currentLineInput}
            <span
              className="cursor"
              style={{ left: `${cursorPos + 1}px` }}
            ></span>
          </div>
        )}
      </div>
      <input
        className="terminal-hidden-input"
        placeholder="Terminal Hidden Input"
        value={currentLineInput}
        autoFocus={onInput != null}
        onChange={updateCurrentLineInput}
        onKeyDown={handleInputKeyDown}
      />
    </div>
  )
}

export { TerminalInput, TerminalOutput }
export default Terminal
