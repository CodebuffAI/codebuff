import { ArrowUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Row } from '../layout/row'

export function ScrollToTopButton(props: { className?: string }) {
  const { className } = props
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 500) {
        setVisible(true)
      } else {
        setVisible(false)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  return (
    <button
      className={clsx(
        'bg-canvas-50 border-ink-200 hover:bg-ink-200 rounded-full border py-2 pl-2 pr-3 text-sm transition-colors',
        visible ? 'inline' : 'hidden',
        className
      )}
      onClick={scrollToTop}
    >
      <Row className="text-ink-600 gap-2 align-middle">
        <ArrowUpIcon className="text-ink-400 h-5 w-5" />
        Scroll to top
      </Row>
    </button>
  )
}
