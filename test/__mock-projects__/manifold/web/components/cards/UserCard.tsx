import Image from 'next/image'
import { useUserById } from 'web/hooks/use-user-supabase'

export function GreenCard(props: {
  imageUrl: string
  title: string
  description: string
  faceup: boolean
  onClick: () => void
}) {
  const { imageUrl, title, description, faceup, onClick } = props
  return (
    <div
      className="font-grenze-gotisch relative h-[284px] w-[200px] cursor-pointer transition hover:z-10 hover:scale-125"
      onClick={onClick}
    >
      {faceup ? (
        <FaceupGreenCard
          imageUrl={imageUrl}
          title={title}
          description={description}
        />
      ) : (
        <Image
          className="absolute left-0 top-0"
          src={'/cards/back_green.png'}
          width={200}
          height={400}
          alt="Frame"
        />
      )}
    </div>
  )
}

export function FaceupGreenCard(props: {
  imageUrl: string
  title: string
  description: string
}) {
  const { imageUrl, title, description } = props
  const upscaleUrl = upscaleGoogleUrl(imageUrl)
  return (
    <div>
      <Image
        className="absolute left-0 top-0"
        src={upscaleUrl}
        width={200}
        height={200}
        alt="Avatar"
      />
      <Image
        className="absolute left-0 top-0"
        src={'/cards/frame_green.png'}
        width={200}
        height={400}
        alt="Frame"
      />
      <div className="absolute left-0 top-[165px] line-clamp-1 w-full bg-transparent text-center text-2xl font-extrabold text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]">
        {title}
      </div>
      <div className="absolute left-[15px] top-[210px] line-clamp-4 w-[170px] text-center text-sm leading-3 text-black">
        {description}
      </div>
    </div>
  )
}

export function UserCard(props: {
  userId: string
  faceup: boolean
  onClick: () => void
}) {
  const { userId, faceup, onClick } = props
  const user = useUserById(userId)
  if (!user) return null
  return (
    <GreenCard
      imageUrl={user.avatarUrl}
      title={user.name}
      description={user.bio ?? ''}
      faceup={faceup}
      onClick={onClick}
    />
  )
}

function upscaleGoogleUrl(url: string) {
  // If the url ends in '=s96-c', upscale it to '=s200-c'
  if (url.endsWith('=s96-c')) {
    return url.replace(/=s96-c$/, '=s200-c')
  }
  return url
}
