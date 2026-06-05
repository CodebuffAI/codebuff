'use client'

import React from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import {
  Heart,
  ArrowRight,
  Clock,
  FolderOpen,
  Gift,
  Users,
  Zap,
  Star,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Skeleton } from '@/vly/components/ui/skeleton'
import { SignedIn } from '@/vly/components/auth/AuthComponents'

interface ProjectCardMiniProps {
  title: string
  description?: string
  imageUrl?: string
  likesCount?: number
  authorName?: string
  href: string
  isPrivate?: boolean
}

const ProjectCardMini: React.FC<ProjectCardMiniProps> = ({
  title,
  description,
  imageUrl,
  likesCount,
  authorName,
  href,
}) => {
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/40"
    >
      {/* Image */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-card to-secondary">
            <span className="text-3xl">🚀</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3">
        <h4 className="mb-1 line-clamp-1 text-sm font-medium text-foreground group-hover:text-primary">
          {title}
        </h4>
        {description && (
          <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
            {description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between">
          {authorName && (
            <span className="text-xs text-muted-foreground/80">by {authorName}</span>
          )}
          {likesCount !== undefined && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground/80">
              <Heart className="h-3 w-3" />
              <span>{likesCount}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

const UserProjectCardMini: React.FC<{
  project: {
    _id: string
    name?: string
    semantic_identifier: string
    screenshotUrl?: string | null
    last_opened?: number
  }
}> = ({ project }) => {
  return (
    <Link
      href={`/web/project/${project.semantic_identifier}`}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/40"
    >
      {/* Image */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary">
        {project.screenshotUrl ? (
          <img
            src={project.screenshotUrl}
            alt={project.name || 'Project preview'}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-card to-secondary">
            <div className="text-center">
              <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-background/40 backdrop-blur-sm">
                <FolderOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">No preview</span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3">
        <h4 className="mb-1 line-clamp-1 text-sm font-medium text-foreground group-hover:text-primary">
          {project.name || 'Untitled Project'}
        </h4>

        <div className="mt-auto flex items-center justify-between">
          <span className="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground/80">
            {project.semantic_identifier}
          </span>
          {project.last_opened && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground/80">
              <Clock className="h-3 w-3" />
              <span>
                {formatDistanceToNow(project.last_opened, { addSuffix: false })}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

const EarnCreditsSection: React.FC = () => {
  return (
    <section className="mb-10">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-6 shadow-2xl shadow-black/40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(124, 255, 63, 0.16), transparent 60%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(124, 255, 63, 0.08), transparent 60%)",
          }}
        />
        <div className="relative">
          {/* Header */}
          <div className="mb-1 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-0.5 text-xs font-medium text-primary">
              <Zap className="h-3 w-3" />
              limited time only
            </span>
          </div>
          <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight text-foreground">
            Unlimited free credits for all early users
          </h2>
          <p className="mx-auto mb-5 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
            Earn unlimited free credits as an early user through referral spins
            and bounties.
          </p>

          {/* Badges */}
          <div className="mb-5 flex flex-wrap justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Users className="h-3 w-3" />
              Unlimited referral spins
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Star className="h-3 w-3" />
              Unlimited bounty rewards
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Star className="h-3 w-3" />
              No purchase necessary
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Gift className="h-3 w-3" />
              No cap on credits earned
            </span>
          </div>

          {/* CTA */}
          <Link
            href="/web"
            className="mx-auto flex w-fit items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_24px_rgba(124,255,63,0.4)]"
          >
            Start building
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

const CardSkeleton = () => (
  <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
    <Skeleton className="aspect-[16/10] w-full bg-muted/60" />
    <div className="p-3">
      <Skeleton className="mb-2 h-4 w-3/4 bg-muted/60" />
      <Skeleton className="h-3 w-1/2 bg-muted/60" />
    </div>
  </div>
)

export const FeaturedProjects: React.FC = () => {
  // Get trending/popular community posts
  const trendingPosts = useQuery(api.community.getTrendingPosts, { limit: 6 })

  // Get user's recent projects (only for signed-in users)
  const userProjects = useQuery(api.project.getUserProjects)

  const isLoadingCommunity = trendingPosts === undefined
  const isLoadingUserProjects = userProjects === undefined

  return (
    <div className="relative z-10 mx-auto mt-12 max-w-[816px] px-4">
      {/* Earn Free Credits CTA Section */}
      <EarnCreditsSection />

      {/* Community Featured Projects Section */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">
              Featured by the Community
            </h3>
          </div>
          <Link
            href="/web/community"
            className="group flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            View more
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {isLoadingCommunity ? (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : trendingPosts && trendingPosts.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {trendingPosts.slice(0, 3).map((post) => (
              <ProjectCardMini
                key={post._id}
                title={post.title}
                description={post.description}
                imageUrl={post.screenshotUrl}
                likesCount={post.likesCount}
                authorName={post.userName}
                href={`/web/community/project/${post._id}`}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-8 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
              <Star className="h-5 w-5 text-primary" />
            </div>
            <h4 className="mb-1 text-sm font-medium text-foreground">
              No featured projects yet
            </h4>
            <p className="text-xs text-muted-foreground">
              Be the first to share your creation!
            </p>
          </div>
        )}
      </section>

      {/* User's Recent Projects Section - Only show when signed in */}
      <SignedIn>
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-foreground">
                Your Recent Projects
              </h3>
            </div>
            <Link
              href="/web/dashboard"
              className="group flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              View more
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {isLoadingUserProjects ? (
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : userProjects && userProjects.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {userProjects.slice(0, 3).map((project) => (
                <UserProjectCardMini key={project._id} project={project} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-8 text-center">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <h4 className="mb-1 text-sm font-medium text-foreground">
                No projects yet
              </h4>
              <p className="text-xs text-muted-foreground">
                Start building something amazing above!
              </p>
            </div>
          )}
        </section>
      </SignedIn>
    </div>
  )
}

export default FeaturedProjects
