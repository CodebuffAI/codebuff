import Link from 'next/link'
import { getAllCategories, getDocsByCategory } from '@/lib/docs'

export default function DocsPage() {
  const categories = getAllCategories()

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold mb-6">All Things Codebuff</h1>
      <div className="grid gap-8">
        {categories.map((category) => {
          const docs = getDocsByCategory(category)
          return (
            <section key={category}>
              <h2 className="text-2xl font-semibold mb-4 capitalize">
                {category}
              </h2>
              <ul className="space-y-3">
                {docs.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      href={`/docs/${category}/${doc.slug}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {doc.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
