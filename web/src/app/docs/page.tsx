import Link from 'next/link'
import { getAllCategories, getDocsByCategory } from '@/lib/docs'

import { redirect } from 'next/navigation'

export default function DocsPage() {
  redirect('/docs/help')
}
