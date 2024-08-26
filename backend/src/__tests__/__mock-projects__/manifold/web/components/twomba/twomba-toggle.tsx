import clsx from 'clsx'
import { ManaFlatCoin } from 'web/public/custom-components/manaFlatCoin'
import { SweepiesFlatCoin } from 'web/public/custom-components/sweepiesFlatCoin'
import { useSweepstakes } from 'web/components/sweestakes-context'

export function TwombaToggle() {
  const { isPlay, setIsPlay } = useSweepstakes()

  return (
    <button
      className={clsx(
        'bg-ink-200 dark:bg-canvas-50 relative flex h-fit w-fit shrink-0 flex-row items-center gap-1 rounded-full border-[1.5px] p-0.5 text-2xl transition-colors',
        isPlay
          ? 'dark:border-primary-700 border-primary-500'
          : 'border-lime-500 dark:border-lime-200'
      )}
      onClick={() => setIsPlay(!isPlay)}
    >
      {/* Add a moving circle behind the active coin */}
      <div
        className={clsx(
          'dark:bg-ink-300 bg-canvas-0 absolute h-[28px] w-[28px] rounded-full drop-shadow transition-all',
          isPlay ? 'left-0' : 'left-[calc(100%-28px)]'
        )}
      />
      <ManaFlatCoin
        className={clsx(
          'z-10 h-8 transition-opacity',
          isPlay ? 'opacity-100' : 'opacity-20'
        )}
      />
      <SweepiesFlatCoin
        className={clsx(
          'z-10 h-8 transition-opacity',
          !isPlay ? 'opacity-100' : 'opacity-20'
        )}
      />
    </button>
  )
}
