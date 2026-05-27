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
}: {
  project: FunctionReturnType<typeof api.project.getProjectData>
  onMobileSidebarToggle?: () => void
  // Kept for backward compatibility with existing call sites; dark mode is
  // enforced for Freebuff Web so these props are no longer used.
  projectTheme?: ProjectPageTheme
  onToggleProjectTheme?: () => void
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
        description: 'A project built with Freebuff',
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
        className="h-10 w-full overflow-hidden bg-[linear-gradient(180deg,#0a0a0b_0%,#121214_100%)] shadow-[inset_0_-1px_0_rgba(124,255,63,0.18)]"
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
                className="flex h-8 w-8 items-center justify-center rounded border border-[#3a3a3a] bg-[#1a1a1c] transition-colors hover:bg-[#23232a] lg:hidden"
                aria-label="Toggle sidebar"
              >
                <Menu className="h-4 w-4 text-zinc-100" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 rounded border border-[#3a3a3a] bg-[#1a1a1c] px-2 py-1 transition-colors hover:bg-[#23232a]">
                  <img
                    src="/freebuff-logo.svg"
                    alt="Freebuff Web logo"
                    className="h-5 w-5 flex-shrink-0 object-contain"
                  />
                  <ChevronDown className="h-3 w-3 text-zinc-100" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48 rounded-lg border border-[#3a3a3a] bg-[#121214] shadow-lg backdrop-blur-2xl">
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-100 transition-colors duration-200 hover:bg-[#1f2a1c] hover:text-[#7CFF3F] focus:bg-[#1f2a1c] focus:text-[#7CFF3F] data-[highlighted]:bg-[#1f2a1c] data-[highlighted]:text-[#7CFF3F]"
                  onClick={() => (window.location.href = '/web')}
                >
                  Home
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-100 transition-colors duration-200 hover:bg-[#1f2a1c] hover:text-[#7CFF3F] focus:bg-[#1f2a1c] focus:text-[#7CFF3F] data-[highlighted]:bg-[#1f2a1c] data-[highlighted]:text-[#7CFF3F]"
                  onClick={() => (window.location.href = '/web/dashboard')}
                >
                  My Projects
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-100 transition-colors duration-200 hover:bg-[#1f2a1c] hover:text-[#7CFF3F] focus:bg-[#1f2a1c] focus:text-[#7CFF3F] data-[highlighted]:bg-[#1f2a1c] data-[highlighted]:text-[#7CFF3F]"
                  onClick={() => (window.location.href = '/web/community')}
                >
                  Community
                </DropdownMenuItem>
                {currentUserId && (
                  <DropdownMenuItem
                    className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-100 transition-colors duration-200 hover:bg-[#1f2a1c] hover:text-[#7CFF3F] focus:bg-[#1f2a1c] focus:text-[#7CFF3F] data-[highlighted]:bg-[#1f2a1c] data-[highlighted]:text-[#7CFF3F]"
                    onClick={() =>
                      (window.location.href = `/web/community/profile/${currentUserId}`)
                    }
                  >
                    Profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-100 transition-colors duration-200 hover:bg-[#1f2a1c] hover:text-[#7CFF3F] focus:bg-[#1f2a1c] focus:text-[#7CFF3F] data-[highlighted]:bg-[#1f2a1c] data-[highlighted]:text-[#7CFF3F]"
                  onClick={() => (window.location.href = '/web/dashboard')}
                >
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="w-full px-4 py-2 text-left font-['Geist'] text-zinc-100 transition-colors duration-200 hover:bg-[#1f2a1c] hover:text-[#7CFF3F] focus:bg-[#1f2a1c] focus:text-[#7CFF3F] data-[highlighted]:bg-[#1f2a1c] data-[highlighted]:text-[#7CFF3F]"
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
            {/* Founder Contact button - only shows for Priority plan or above */}
            {hasPhoneSupport && (
              <motion.button
                className="flex transform-gpu items-center justify-center gap-1 rounded bg-gradient-to-r from-amber-500/15 to-orange-500/15 px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-amber-600/60 transition-all duration-200 hover:-translate-y-[1px] hover:from-amber-500/25 hover:to-orange-500/25"
                variants={buttonVariants}
                initial="hidden"
                animate="visible"
                custom={1}
                onClick={() => setFounderContactOpen(true)}
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  <Phone className="h-3 w-3 text-amber-300" />
                </div>
                <div className="hidden text-xs font-medium leading-none text-amber-300 sm:block">
                  Contact Founder
                </div>
              </motion.button>
            )}

            {/* Listing button - only shows after successful deployment AND published to community */}
            {showListingButton && (
              <motion.button
                className="flex transform-gpu items-center justify-center gap-1 rounded bg-[#7CFF3F]/15 px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-[#7CFF3F]/50 transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#7CFF3F]/25"
                variants={buttonVariants}
                initial="hidden"
                animate="visible"
                custom={2}
                onClick={handleViewListing}
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  <Eye className="h-3 w-3 text-[#7CFF3F]" />
                </div>
                <div className="hidden text-xs font-medium leading-none text-[#7CFF3F] sm:block">
                  Listing
                </div>
              </motion.button>
            )}

            <InviteDialog projectId={project._id} className="glass-morphism">
              <motion.button
                className="flex transform-gpu items-center justify-center gap-1 rounded bg-[#1a1a1c] px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-[#3a3a3a] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#23232a]"
                variants={buttonVariants}
                initial="hidden"
                animate="visible"
                custom={3}
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  <Users className="h-3 w-3 text-zinc-100" />
                </div>
                <div className="hidden text-xs font-normal leading-none text-zinc-100 sm:block">
                  Add Collaborators
                </div>
              </motion.button>
            </InviteDialog>

            <motion.button
              className="flex transform-gpu items-center justify-center gap-1 rounded bg-[#7CFF3F]/15 px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-[#7CFF3F]/50 transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#7CFF3F]/25"
              variants={buttonVariants}
              initial="hidden"
              animate="visible"
              custom={4}
              onClick={handleOpenEarn}
            >
              <div className="flex h-4 w-4 items-center justify-center">
                <Gift className="h-3 w-3 text-[#7CFF3F]" />
              </div>
              <div className="hidden text-xs font-medium leading-none text-[#7CFF3F] sm:block">
                Earn Credits
              </div>
            </motion.button>

            <motion.button
              className="flex transform-gpu items-center justify-center gap-1 rounded bg-[#1a1a1c] px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-[#3a3a3a] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#23232a]"
              variants={buttonVariants}
              initial="hidden"
              animate="visible"
              custom={5}
              onClick={handleUpgradeClick}
            >
              <div className="flex h-4 w-4 items-center justify-center">
                <Crown className="h-3 w-3 text-zinc-100" />
              </div>
              <div className="hidden text-xs font-normal leading-none text-zinc-100 sm:block">
                Pricing
              </div>
            </motion.button>

            <motion.button
              className="flex transform-gpu items-center justify-center gap-1 rounded bg-[#1a1a1c] px-1.5 py-1 text-xs outline outline-1 outline-offset-[-1px] outline-[#3a3a3a] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#23232a]"
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
                <Eye className="h-3 w-3 text-zinc-100" />
              </div>
              <div className="hidden text-xs font-normal leading-none text-zinc-100 sm:block">
                Preview Site
              </div>
            </motion.button>

            <motion.button
              className="flex transform-gpu items-center justify-center gap-1 rounded bg-[#7CFF3F] px-2 py-1 text-xs shadow-[0_0_18px_-2px_rgba(124,255,63,0.6)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#9bff64] hover:shadow-[0_0_22px_-2px_rgba(124,255,63,0.8)] disabled:cursor-not-allowed disabled:opacity-50"
              variants={buttonVariants}
              initial="hidden"
              animate="visible"
              custom={7}
              onClick={handlePublishClick}
              disabled={isPublishing}
            >
              <div className="flex h-4 w-4 items-center justify-center">
                {isPublishing ? (
                  <Loader2 className="h-3 w-3 animate-spin text-black" />
                ) : (
                  <Rocket className="h-3 w-3 text-black" />
                )}
              </div>
              <div className="hidden text-xs font-semibold leading-none text-black sm:block">
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
