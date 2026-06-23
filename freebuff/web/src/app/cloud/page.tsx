'use client'

import { api } from '@/convex/_generated/api'
import { useQuery } from 'convex/react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ConnectRepoDialog } from '@/vly/components/connect-repo/ConnectRepoDialog'
import { Github, Loader2, Plus } from 'lucide-react'

export default function CloudHome() {
  const { status } = useSession()
  const isAuthed = status === 'authenticated'
  const router = useRouter()

  const projects = useQuery(
    api.project.getUserProjects,
    isAuthed ? {} : 'skip',
  )
  const connectedProjects = (projects ?? []).filter(
    (p) => (p as any).project_type === 'connected_repo',
  )

  const [isConnectOpen, setIsConnectOpen] = useState(false)

  // Re-open the dialog after returning from the GitHub OAuth/install redirect.
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('connectRepo') === '1'
    ) {
      setIsConnectOpen(true)
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Github className="h-6 w-6 text-white" />
            <h1 className="text-2xl font-semibold text-white">
              Freebuff Cloud
            </h1>
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              internal preview
            </span>
          </div>
          <p className="mt-1 text-sm text-white/55">
            Connect any GitHub repo, get a sandbox + preview, and build with
            free models.
          </p>
        </div>
        {isAuthed && (
          <button
            type="button"
            onClick={() => setIsConnectOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Connect a repo
          </button>
        )}
      </header>

      {!isAuthed ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="mb-4 text-sm text-white/60">
            Sign in to connect a repository.
          </p>
          <Link
            href="/login?callbackUrl=/cloud"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      ) : projects === undefined ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      ) : connectedProjects.length === 0 ? (
        <button
          type="button"
          onClick={() => setIsConnectOpen(true)}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-12 text-center transition-colors hover:bg-white/5"
        >
          <Github className="h-8 w-8 text-white/40" />
          <span className="text-sm font-medium text-white/80">
            Connect your first repository
          </span>
          <span className="text-xs text-white/45">
            Freebuff clones it, boots a sandbox, and gets the preview running.
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {connectedProjects.map((project) => (
            <button
              key={project._id}
              type="button"
              onClick={() =>
                router.push(`/cloud/project/${project.semantic_identifier}`)
              }
              className="flex flex-col items-start gap-1 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
            >
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4 text-white/60" />
                <span className="font-medium text-white">
                  {(project as any).repo_full_name ||
                    project.name ||
                    project.semantic_identifier}
                </span>
              </div>
              <span className="text-xs text-white/45">
                {(project as any).current_branch ?? 'main'}
              </span>
            </button>
          ))}
        </div>
      )}

      <ConnectRepoDialog
        open={isConnectOpen}
        onOpenChange={setIsConnectOpen}
        projectBasePath="/cloud/project"
        returnUrl="/cloud?connectRepo=1"
      />
    </div>
  )
}
