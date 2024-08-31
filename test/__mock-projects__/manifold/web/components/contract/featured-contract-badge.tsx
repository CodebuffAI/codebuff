import { BadgeCheckIcon } from '@heroicons/react/solid'

export function FeaturedContractBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-3  py-0.5 text-sm font-medium text-teal-800">
      <BadgeCheckIcon className="h-4 w-4" aria-hidden="true" /> Featured
    </span>
  )
}
