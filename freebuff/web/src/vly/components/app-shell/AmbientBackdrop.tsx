'use client'

// NB: `@/components/*` is aliased to `src/vly/components/*` in this package's
// tsconfig, so the landing Starfield is imported relatively.
import { Starfield } from '../../../components/landing/Starfield'

/**
 * Landing-style night sky used as the {@link AppShell} `ambient` backdrop so
 * the Freebuff Web surface matches freebuff.com: a dark blue→black gradient
 * with the same twinkling + shooting stars as the home hero (no green glow).
 */
export function AmbientBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#060b11_0%,#070d12_30%,#05080c_58%,#000000_80%)]" />
      <div className="absolute inset-x-0 top-0 h-[640px] opacity-40">
        <Starfield />
      </div>
    </>
  )
}

export default AmbientBackdrop
