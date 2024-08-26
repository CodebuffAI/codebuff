import Link from 'next/link'
import { track } from 'web/lib/service/analytics'

export const AboutPrivacyTerms = () => (
  <div className="text-ink-400 mb-4 mt-8 w-full text-center text-sm">
    <Link href="/about" className="hover:underline">
      About
    </Link>
    <span className="mx-2">&bull;</span>
    <a
      href="/terms"
      target="_blank"
      className="hover:underline"
      onClick={() => track('Click TOS')}
    >
      Terms of service
    </a>
    <span className="mx-2">&bull;</span>
    <a
      href="/privacy"
      target="_blank"
      className="hover:underline"
      onClick={() => track('Click Privacy')}
    >
      Privacy policy
    </a>
  </div>
)

export const PrivacyTermsLab = () => (
  <div className="text-ink-400 mb-4 mt-8 w-full text-center text-sm">
    <a
      href="/terms"
      target="_blank"
      className="hover:underline"
      onClick={() => track('Click TOS')}
    >
      Terms of service
    </a>
    <span className="mx-2">&bull;</span>
    <a
      href="/privacy"
      target="_blank"
      className="hover:underline"
      onClick={() => track('Click Privacy')}
    >
      Privacy policy
    </a>
  </div>
)
