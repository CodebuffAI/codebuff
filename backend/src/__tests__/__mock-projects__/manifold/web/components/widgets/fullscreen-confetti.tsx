import Confetti, { Props as ConfettiProps } from 'react-confetti'

export function FullscreenConfetti(props: ConfettiProps) {
  return (
    <Confetti
      className="!fixed inset-0 !z-50"
      recycle={false}
      numberOfPieces={300}
      {...props}
    />
  )
}
