import type { Author } from './types'

/**
 * Configurable list of blog authors.
 *
 * Add a new author by appending to this object and referencing the `id` from
 * any post's `authorId` field. To change a name, role, or avatar everywhere it
 * appears, edit it here once.
 *
 * Avatars: if `avatar` is omitted (or points to a generic brand asset), the
 * `<AuthorAvatar>` component renders a deterministic, per-author initials
 * avatar with a brand-aligned gradient. Provide a real headshot URL to opt
 * out and use a photo instead.
 */
export const authors: Record<string, Author> = {
  'freebuff-team': {
    id: 'freebuff-team',
    name: 'The Freebuff Team',
    role: 'Building the free coding agent',
    bio: 'We build Freebuff — the free CLI coding agent — and Freebuff Web, the free way to ship full-stack apps. No subscription, no setup, no lock-in.',
  },
  'james-grugett': {
    id: 'james-grugett',
    name: 'James Grugett',
    role: 'Co-founder, Freebuff',
    twitter: 'jahooma',
    bio: 'Co-founder of Codebuff and Freebuff. Previously co-founded Manifold Markets.',
  },
  'victor-cheng': {
    id: 'victor-cheng',
    name: 'Victor Cheng',
    role: 'Founder, Freebuff Web',
    bio: 'Building Freebuff Web — the free way to ship full-stack apps. Previously founded Vly.',
  },
  'freebuff-research': {
    id: 'freebuff-research',
    name: 'Freebuff Research',
    role: 'Benchmarks and evals',
    bio: 'The Freebuff research arm — benchmarks, evals, and field notes from running coding agents in the wild.',
  },
}

export function getAuthor(id: string): Author {
  return authors[id] ?? authors['freebuff-team']
}

export function listAuthors(): Author[] {
  return Object.values(authors)
}
