import clsx from 'clsx'
import { Subtitle } from '../widgets/subtitle'
import { ReactNode } from 'react'
import { copyToClipboard } from 'web/lib/util/copy'
import toast from 'react-hot-toast'

export const ColorSection = () => {
  return (
    <>
      <Subtitle>Colors</Subtitle>
      <div className="mb-4">
        also check out the
        <a
          className="text-primary-700 mx-1"
          href="https://tailwindcss.com/docs/customizing-colors"
        >
          tailwindcss docs
        </a>
        and globals.css
      </div>
      <div className="flex flex-col gap-4">
        <Section label="Canvas">
          <Swatch color="bg-canvas-0" />
          <Swatch color="bg-canvas-50" />
          <Swatch color="bg-canvas-100" />
        </Section>
        <Section label="Ink">
          <Swatch color="bg-ink-50" />
          <Swatch color="bg-ink-100" />
          <Swatch color="bg-ink-200" />
          <Swatch color="bg-ink-300" />
          <Swatch color="bg-ink-400" />
          <Swatch color="bg-ink-500" />
          <Swatch color="bg-ink-600" />
          <Swatch color="bg-ink-700" />
          <Swatch color="bg-ink-800" />
          <Swatch color="bg-ink-900" />
          <Swatch color="bg-ink-950" />
        </Section>
        <Section label="Gray">
          <Swatch color="bg-gray-50" />
          <Swatch color="bg-gray-100" />
          <Swatch color="bg-gray-200" />
          <Swatch color="bg-gray-300" />
          <Swatch color="bg-gray-400" />
          <Swatch color="bg-gray-500" />
          <Swatch color="bg-gray-600" />
          <Swatch color="bg-gray-700" />
          <Swatch color="bg-gray-800" />
          <Swatch color="bg-gray-900" />
          <Swatch color="bg-gray-950" />
        </Section>
        <Section label="Primary">
          <Swatch color="bg-primary-50" />
          <Swatch color="bg-primary-100" />
          <Swatch color="bg-primary-200" />
          <Swatch color="bg-primary-300" />
          <Swatch color="bg-primary-400" />
          <Swatch color="bg-primary-500" />
          <Swatch color="bg-primary-600" />
          <Swatch color="bg-primary-700" />
          <Swatch color="bg-primary-800" />
          <Swatch color="bg-primary-900" />
          <Swatch color="bg-primary-950" />
        </Section>
        <Section label="Indigo">
          <Swatch color="bg-indigo-50" />
          <Swatch color="bg-indigo-100" />
          <Swatch color="bg-indigo-200" />
          <Swatch color="bg-indigo-300" />
          <Swatch color="bg-indigo-400" />
          <Swatch color="bg-indigo-500" />
          <Swatch color="bg-indigo-600" />
          <Swatch color="bg-indigo-700" />
          <Swatch color="bg-indigo-800" />
          <Swatch color="bg-indigo-900" />
          <Swatch color="bg-indigo-950" />
        </Section>
        <Section label="Teal">
          <Swatch color="bg-teal-50" />
          <Swatch color="bg-teal-100" />
          <Swatch color="bg-teal-200" />
          <Swatch color="bg-teal-300" />
          <Swatch color="bg-teal-400" />
          <Swatch color="bg-teal-500" />
          <Swatch color="bg-teal-600" />
          <Swatch color="bg-teal-700" />
          <Swatch color="bg-teal-800" />
          <Swatch color="bg-teal-900" />
          <Swatch color="bg-teal-950" />
        </Section>
        <Section label="Scarlet">
          <Swatch color="bg-scarlet-50" />
          <Swatch color="bg-scarlet-100" />
          <Swatch color="bg-scarlet-200" />
          <Swatch color="bg-scarlet-300" />
          <Swatch color="bg-scarlet-400" />
          <Swatch color="bg-scarlet-500" />
          <Swatch color="bg-scarlet-600" />
          <Swatch color="bg-scarlet-700" />
          <Swatch color="bg-scarlet-800" />
          <Swatch color="bg-scarlet-900" />
          <Swatch color="bg-scarlet-950" />
        </Section>
        <Section label="Misc">
          <Swatch color="bg-warning" label="warning" />
          <Swatch color="bg-error" label="error" />
          <Swatch color="bg-ink-0" label="ink-0" />
          <Swatch color="bg-ink-1000" label="ink-1000" />
        </Section>
      </div>
    </>
  )
}

const Section = (props: { label: string; children: ReactNode }) => {
  const { label, children } = props
  return (
    <div>
      <div className="text-ink-900 text-sm font-semibold 2xl:col-end-1 2xl:pt-2.5">
        {label}
      </div>
      <div className="mt-3 grid grid-cols-6 gap-x-2 sm:mt-2 sm:grid-cols-11 2xl:mt-0">
        {children}
      </div>
    </div>
  )
}

const Swatch = (props: { color: string; label?: string }) => {
  const { color } = props
  const label = props.label ?? color.split('-')[2]
  // copy to clipboard on click
  return (
    <div
      onClick={() => {
        copyToClipboard(color)
        toast(`Copied ${color}`, {
          icon: <div className={clsx('h-4 w-4 rounded', color)} />,
        })
      }}
      className="cursor-pointer"
    >
      <div className={clsx('mb-1 h-10 rounded', color)} />
      <div className="text-ink-900 text-xs font-medium">{label}</div>
    </div>
  )
}
