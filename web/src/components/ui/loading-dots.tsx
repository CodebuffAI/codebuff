'use client'

export const LoadingDots = () => {
  return (
    <div className="flex space-x-2 justify-center items-center">
      <div className="h-2 w-2 bg-white rounded-full animate-[bounce_1s_infinite_200ms]" />
      <div className="h-2 w-2 bg-white rounded-full animate-[bounce_1s_infinite_400ms]" />
      <div className="h-2 w-2 bg-white rounded-full animate-[bounce_1s_infinite_600ms]" />
    </div>
  )
}
