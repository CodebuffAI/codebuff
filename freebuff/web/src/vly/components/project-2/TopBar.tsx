import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Users,
  Crown,
  Eye,
  Rocket,
  ChevronDown,
  Menu,
  Loader2,
  Phone,
  Gift,
  Moon,
  Sun,
} from 'lucide-react'
import { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { InviteDialog } from './InviteDialog'
import { DeploymentDialog } from './deployment/DeploymentDialog'
import { FounderContactDialog } from './FounderContactDialog'
import { EditableProjectName } from './EditableProjectName'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/vly/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { useFeatureAccess } from '@/vly/hooks/useFeatureAccess'
import type { ProjectPageTheme } from '@/vly/hooks/useProjectPageTheme'

export function TopBar({
  project,
  onMobileSidebarToggle,
  projectTheme,
  onToggleProjectTheme,
}: {
  project: FunctionReturnType<typeof api.project.getProjectData>
  onMobileSidebarToggle?: () => void
  projectTheme: ProjectPageTheme
  onToggleProjectTheme: () => void
}) {
  const [deployDialogOpen, setDeployDialogOpen] = useState(false)
  const [founderContactOpen, setFounderContactOpen] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const router = useRouter()

  const handleOpenEarn = () => {
    router.push('/web/earn')
  }

  // Check if user has Priority plan or above (personal_phone_support feature)
  const { hasAccess: hasPhoneSupport } = useFeatureAccess(
    'personal_phone_support',
  )

  const publishProject = useMutation(api.community.publishProject)

  // Check if project has been successfully deployed (has active deployment)
  const deployments = useQuery(
    api.deployment.getProjectDeployments,
    project ? { projectId: project._id } : 'skip',
  )
  const hasActiveDeployment = deployments?.some((d) => d.state === 'active')

  // Check if project is already published to community (get the post ID too)
  const communityPost = useQuery(
    api.community.getPostByProject,
    project ? { projectId: project._id } : 'skip',
  )

  // Get current user ID for profile link
  const currentUserId = useQuery(api.community.getCurrentUserId)

  // Show Listing button only if deployed AND published to community
  const showListingButton = hasActiveDeployment && communityPost

  // Opens the deploy dialog
  const handlePublishClick = () => {
    setDeployDialogOpen(true)
  }

  // Called when Deploy/Redeploy button is clicked inside the dialog
  const handleDeployTriggered = async () => {
    if (!project) return

    setIsPublishing(true)
    try {
      // Publish to community when deploy is triggered
      await publishProject({
        projectId: project._id,
        title:
          project.name || project.semantic_identifier || 'Untitled Project',
        description: 'A project built with Vly',
        tags: [],
      })

      toast.success("Project published to community! Click 'Listing' to view.")
    } catch (_publishError) {
      void _publishError
      toast.error('Failed to publish to community. Please try again.')
    } finally {
      setIsPublishing(false)
    }
  }

  // Opens the community listing page
  const handleViewListing = () => {
    if (!communityPost) {
      toast.error('Please publish first.')
      return
    }

    window.open(`/web/community/project/${communityPost._id}`, '_blank')
  }

  const buttonVariants = {
    hidden: {
      opacity: 0,
      transform: 'translate3d(0, -10px, 0) scale3d(0.98, 0.98, 1)',
      willChange: 'transform, opacity',
      backfaceVisibility: 'hidden' as const,
      perspective: 1000,
    },
    visible: (i: number) => ({
      opacity: 1,
      transform: 'translate3d(0, 0, 0) scale3d(1, 1, 1)',
      willChange: 'auto',
      backfaceVisibility: 'hidden' as const,
      perspective: 1000,
      transition: {
        delay: i * 0.2,
        duration: 0.8,
        ease: [0, 0, 0.2, 1] as const,
        transform: {
          type: 'spring',
          damping: 20,
          stiffness: 100,
        },
      },
    }),
  }

  const handleUpgradeClick = () => {
    router.push('/web/dashboard')
  }

  if (!project) return null

  return (
    <>
      <div
        className="h-10 w-full overflow-hidden bg-slate-50 dark:bg-[linear-gradient(180deg,#1f2020_0%,#242424_100%)] dark:shadow-[inset_0_-1px_0_rgba(62,62,62,0.78)]"
        style={{ contain: 'layout style paint', isolation: 'isolate' }}
      >
        <div className="relative flex h-full w-full items-center justify-between px-2">
          {/* Left - Mobile Hamburger + Logo and Title */}
          <motion.div
            className="flex items-center gap-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] as const }}
          >
            {/* Mobile Hamburger Menu */}
            {onMobileSidebarToggle && (
              <button
                onClick={onMobileSidebarToggle}
                className="flex h-8 w-8 items-center justify-center rounded border border-[#d8d8d8] bg-[#f1f1f1] transition-colors hover:bg-[#e8e8e8] dark:border-[#575757] dark:bg-[#3c3c3c] dark:hover:bg-[#4a4a4a] lg:hidden"
                aria-label="Toggle sidebar"
              >
                <Menu className="h-4 w-4 text-zinc-800 dark:text-zinc-100" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 rounded border border-[#d8d8d8] bg-[#f1f1f1] px-2 py-1 transition-colors hover:bg-[#e8e8e8] dark:border-[#575757] dark:bg-[#3c3c3c] dark:hover:bg-[#4a4a4a]">
                  <img
                    src={
                      projectTheme === 'dark'
                        ? '/logos/faclon_logo_rounded_white.png'
                        : '/logo.svg'
                    }
                    alt="Logo"
                    className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
                  />
                  <ChevronDown className="h-3 w-3 text-zinc-800 dark:text-zinc-100" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48 rounded-lg border border-white/20 bg-white shadow-lg backdrop-blur-2xl dark:border-[#575757] dark:bg-[#282828]">
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-800 transition-colors duration-200 hover:bg-[#F5EFFF] hover:text-[#A37FBC] focus:bg-[#F5EFFF] focus:text-[#A37FBC] data-[highlighted]:bg-[#F5EFFF] data-[highlighted]:text-[#A37FBC] dark:text-zinc-100 dark:hover:bg-[#3c3c3c] dark:hover:text-zinc-100 dark:focus:bg-[#3c3c3c] dark:focus:text-zinc-100 dark:data-[highlighted]:bg-[#3c3c3c] dark:data-[highlighted]:text-zinc-100"
                  onClick={() => (window.location.href = '/web')}
                >
                  Home
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-800 transition-colors duration-200 hover:bg-[#F5EFFF] hover:text-[#A37FBC] focus:bg-[#F5EFFF] focus:text-[#A37FBC] data-[highlighted]:bg-[#F5EFFF] data-[highlighted]:text-[#A37FBC] dark:text-zinc-100 dark:hover:bg-[#3c3c3c] dark:hover:text-zinc-100 dark:focus:bg-[#3c3c3c] dark:focus:text-zinc-100 dark:data-[highlighted]:bg-[#3c3c3c] dark:data-[highlighted]:text-zinc-100"
                  onClick={() => (window.location.href = '/web/dashboard')}
                >
                  My Projects
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-800 transition-colors duration-200 hover:bg-[#F5EFFF] hover:text-[#A37FBC] focus:bg-[#F5EFFF] focus:text-[#A37FBC] data-[highlighted]:bg-[#F5EFFF] data-[highlighted]:text-[#A37FBC] dark:text-zinc-100 dark:hover:bg-[#3c3c3c] dark:hover:text-zinc-100 dark:focus:bg-[#3c3c3c] dark:focus:text-zinc-100 dark:data-[highlighted]:bg-[#3c3c3c] dark:data-[highlighted]:text-zinc-100"
                  onClick={() => (window.location.href = '/web/community')}
                >
                  Community
                </DropdownMenuItem>
                {currentUserId && (
                  <DropdownMenuItem
                    className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-800 transition-colors duration-200 hover:bg-[#F5EFFF] hover:text-[#A37FBC] focus:bg-[#F5EFFF] focus:text-[#A37FBC] data-[highlighted]:bg-[#F5EFFF] data-[highlighted]:text-[#A37FBC] dark:text-zinc-100 dark:hover:bg-[#3c3c3c] dark:hover:text-zinc-100 dark:focus:bg-[#3c3c3c] dark:focus:text-zinc-100 dark:data-[highlighted]:bg-[#3c3c3c] dark:data-[highlighted]:text-zinc-100"
                    onClick={() =>
                      (window.location.href = `/web/community/profile/${currentUserId}`)
                    }
                  >
                    Profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-800 transition-colors duration-200 hover:bg-[#F5EFFF] hover:text-[#A37FBC] focus:bg-[#F5EFFF] focus:text-[#A37FBC] data-[highlighted]:bg-[#F5EFFF] data-[highlighted]:text-[#A37FBC] dark:text-zinc-100 dark:hover:bg-[#3c3c3c] dark:hover:text-zinc-100 dark:focus:bg-[#3c3c3c] dark:focus:text-zinc-100 dark:data-[highlighted]:bg-[#3c3c3c] dark:data-[highlighted]:text-zinc-100"
                  onClick={() => (window.location.href = '/web/dashboard')}
                >
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-800 transition-colors duration-200 hover:bg-[#F5EFFF] hover:text-[#A37FBC] focus:bg-[#F5EFFF] focus:text-[#A37FBC] data-[highlighted]:bg-[#F5EFFF] data-[highlighted]:text-[#A37FBC] dark:text-zinc-100 dark:hover:bg-[#3c3c3c] dark:hover:text-zinc-100 dark:focus:bg-[#3c3c3c] dark:focus:text-zinc-100 dark:data-[highlighted]:bg-[#3c3c3c] dark:data-[highlighted]:text-zinc-100"
                  onClick={() =>
                    (window.location.href = '/web/dashboard/preferences')
                  }
                >
                  Email preferences
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <EditableProjectName project={project} />
          </motion.div>

          {/* Right - Buttons */}
          <div
            className="flex items-center gap-1.5 md:gap-2"
            style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
          >
            <motion.button
              className="flex h-8 w-8 transform-gpu items-center justify-center rounded border border-slate-300 bg-slate-100 text-zinc-800 outline outline-1 outline-offset-[-1px] outline-neutral-200 transition-all duration-200 hover:-translate-y-[1px] hover:bg-slate-200 dark:border-[#575757] dark:bg-[#3c3c3c] dark:text-zinc-100 dark:outline-[#575757] dark:hover:bg-[#4a4a4a]"
              variants={buttonVariants}
              initial="hidden"
              animate="visible"
              custom={0}
              onClick={onToggleProjectTheme}
              title={
                projectTheme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              aria-label={
                projectTheme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
            >
              <div className="flex h-4 w-4 items-center justify-center">
                {projectTheme === 'dark' ? (
                  <Sun className="h-3 w-3 text-zinc-100" />
                ) : (
                  <Moon className="h-3 w-3 text-zinc-800" />
                )}
              </div>
            </motion.button>

            {/* Founder Contact button - only shows for Priority plan or above */}
            {hasPhoneSupport && (
              <motion.button
                className="flex transform-gpu items-center justify-center gap-1 rounded bg-gradient-to-r from-amber-50 to-orange-50 px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-amber-300 transition-all duration-200 hover:-translate-y-[1px] hover:from-amber-100 hover:to-orange-100 dark:from-amber-500/20 dark:to-orange-500/20 dark:outline-amber-600/60 dark:hover:from-amber-500/30 dark:hover:to-orange-500/30"
                variants={buttonVariants}
                initial="hidden"
                animate="visible"
                custom={1}
                onClick={() => setFounderContactOpen(true)}
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  <Phone className="h-3 w-3 text-amber-700 dark:text-amber-300" />
                </div>
                <div className="hidden text-xs font-medium leading-none text-amber-700 dark:text-amber-300 sm:block">
                  Contact Founder
                </div>
              </motion.button>
            )}

            {/* Listing button - only shows after successful deployment AND published to community */}
            {showListingButton && (
              <motion.button
                className="flex transform-gpu items-center justify-center gap-1 rounded bg-emerald-50 px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-emerald-200 transition-all duration-200 hover:-translate-y-[1px] hover:bg-emerald-100 dark:bg-emerald-500/20 dark:outline-emerald-600/60 dark:hover:bg-emerald-500/30"
                variants={buttonVariants}
                initial="hidden"
                animate="visible"
                custom={2}
                onClick={handleViewListing}
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  <Eye className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
                </div>
                <div className="hidden text-xs font-medium leading-none text-emerald-700 dark:text-emerald-300 sm:block">
                  Listing
                </div>
              </motion.button>
            )}

            <InviteDialog projectId={project._id} className="glass-morphism">
              <motion.button
                className="flex transform-gpu items-center justify-center gap-1 rounded bg-slate-100 px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-neutral-200 transition-all duration-200 hover:-translate-y-[1px] hover:bg-slate-200 dark:bg-[#3c3c3c] dark:outline-[#575757] dark:hover:bg-[#4a4a4a]"
                variants={buttonVariants}
                initial="hidden"
                animate="visible"
                custom={3}
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  <Users className="h-3 w-3 text-zinc-800 dark:text-zinc-100" />
                </div>
                <div className="hidden text-xs font-normal leading-none text-zinc-800 dark:text-zinc-100 sm:block">
                  Add Collaborators
                </div>
              </motion.button>
            </InviteDialog>

            <motion.button
              className="flex transform-gpu items-center justify-center gap-1 rounded bg-emerald-50 px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-emerald-200 transition-all duration-200 hover:-translate-y-[1px] hover:bg-emerald-100 dark:bg-emerald-500/20 dark:outline-emerald-600/60 dark:hover:bg-emerald-500/30"
              variants={buttonVariants}
              initial="hidden"
              animate="visible"
              custom={4}
              onClick={handleOpenEarn}
            >
              <div className="flex h-4 w-4 items-center justify-center">
                <Gift className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
              </div>
              <div className="hidden text-xs font-medium leading-none text-emerald-700 dark:text-emerald-300 sm:block">
                Earn Credits
              </div>
            </motion.button>

            <motion.button
              className="flex transform-gpu items-center justify-center gap-1 rounded bg-slate-100 px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-neutral-200 transition-all duration-200 hover:-translate-y-[1px] hover:bg-slate-200 dark:bg-[#3c3c3c] dark:outline-[#575757] dark:hover:bg-[#4a4a4a]"
              variants={buttonVariants}
              initial="hidden"
              animate="visible"
              custom={5}
              onClick={handleUpgradeClick}
            >
              <div className="flex h-4 w-4 items-center justify-center">
                <Crown className="h-3 w-3 text-zinc-800 dark:text-zinc-100" />
              </div>
              <div className="hidden text-xs font-normal leading-none text-zinc-800 dark:text-zinc-100 sm:block">
                Pricing
              </div>
            </motion.button>

            <motion.button
              className="flex transform-gpu items-center justify-center gap-1 rounded bg-slate-100 px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-neutral-200 transition-all duration-200 hover:-translate-y-[1px] hover:bg-slate-200 dark:bg-[#3c3c3c] dark:outline-[#575757] dark:hover:bg-[#4a4a4a]"
              variants={buttonVariants}
              initial="hidden"
              animate="visible"
              custom={6}
              onClick={() => {
                const url =
                  project?.pretty_preview_url ?? project?.preview_url ?? ''
                if (url) window.open(url, '_blank')
              }}
            >
              <div className="flex h-4 w-4 items-center justify-center">
                <Eye className="h-3 w-3 text-zinc-800 dark:text-zinc-100" />
              </div>
              <div className="hidden text-xs font-normal leading-none text-zinc-800 dark:text-zinc-100 sm:block">
                Preview Site
              </div>
            </motion.button>

            <motion.button
              className="flex transform-gpu items-center justify-center gap-1 rounded bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-1 text-xs shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:from-violet-400 hover:to-fuchsia-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              variants={buttonVariants}
              initial="hidden"
              animate="visible"
              custom={7}
              onClick={handlePublishClick}
              disabled={isPublishing}
            >
              <div className="flex h-4 w-4 items-center justify-center">
                {isPublishing ? (
                  <Loader2 className="h-3 w-3 animate-spin text-white" />
                ) : (
                  <Rocket className="h-3 w-3 text-white" />
                )}
              </div>
              <div className="hidden text-xs font-medium leading-none text-white sm:block">
                {isPublishing ? 'Publishing...' : 'Publish'}
              </div>
            </motion.button>
          </div>
        </div>
      </div>
      <DeploymentDialog
        isOpen={deployDialogOpen}
        onOpenChange={setDeployDialogOpen}
        projectId={project._id}
        className="glass-morphism"
        onDeployTriggered={handleDeployTriggered}
      />
      <FounderContactDialog
        open={founderContactOpen}
        onOpenChange={setFounderContactOpen}
      />
    </>
  )
}
