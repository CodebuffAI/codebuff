import { SparklesIcon } from '@heroicons/react/solid'

export default function NewContractBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3  py-0.5 text-sm font-medium text-blue-800">
      <SparklesIcon className="h-4 w-4" aria-hidden="true" /> New
    </span>
  )
}
