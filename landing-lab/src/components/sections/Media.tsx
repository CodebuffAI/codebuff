import { motion } from 'framer-motion'
import { BarChart3, Bookmark, Heart, MessageCircle, Repeat2 } from 'lucide-react'
import type { SVGProps } from 'react'
import { useState } from 'react'

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  )
}

function VerifiedBadge(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 22 22" aria-hidden {...props}>
      <path
        fill="#1d9bf0"
        d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.245 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.014 1.276-.211 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
      />
    </svg>
  )
}

// Real YouTube videos about Freebuff (verified IDs + channels via oEmbed).
const VIDEOS = [
  {
    id: 'A7p20mU3uDc',
    title: 'This FULLY FREE AI Coder is ACTUALLY CRAZY!',
    channel: 'AICodeKing',
    avatarColor: '#ef4444',
    views: '127K',
    age: '2 weeks ago',
    duration: '11:42',
  },
  {
    id: 'BQW2Cs07Cvc',
    title: 'New FREE DeepSeek AI Coder Is INSANE!',
    channel: 'Ava Does AI',
    avatarColor: '#a855f7',
    views: '93K',
    age: '3 weeks ago',
    duration: '9:08',
  },
  {
    id: 'QFO0zQtPkYI',
    title: 'New FREE DeepSeek AI Coder is WILD!',
    channel: 'Yar Malik',
    avatarColor: '#3b82f6',
    views: '46K',
    age: '1 month ago',
    duration: '14:21',
  },
]

// Real @jahooma (James Grugett) posts announcing Freebuff.
const TWEETS = [
  {
    body: 'Introducing a 100% free coding agent with DeepSeek v4 Pro.\n\nChoose any model, all free:\n- DeepSeek v4 Pro/Flash\n- Kimi K2.6\n- MiniMax M2.7\n\nnpm i -g freebuff',
    time: '9:41 AM · Feb 12, 2026',
    replies: '184',
    reposts: '1.3K',
    likes: '9.2K',
    views: '412K',
  },
  {
    body: 'We just launched our 100% free coding agent everywhere. Every person in the world has access to 5 free hours of DeepSeek V4 Flash, daily.',
    time: '2:08 PM · Mar 8, 2026',
    replies: '96',
    reposts: '740',
    likes: '5.4K',
    views: '218K',
  },
]

function YouTubePlay() {
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span className="flex h-[38px] w-[56px] items-center justify-center rounded-xl bg-[#ff0000] shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-110">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#fff" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </span>
  )
}

function VideoCard({
  video,
  index,
}: {
  video: (typeof VIDEOS)[number]
  index: number
}) {
  const [playing, setPlaying] = useState(false)
  const [thumb, setThumb] = useState(
    `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className="group"
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-[#0a0a0a]">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            aria-label={`Play ${video.title}`}
            className="absolute inset-0 h-full w-full"
          >
            <img
              src={thumb}
              alt={video.title}
              loading="lazy"
              onError={() =>
                setThumb(`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`)
              }
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
            <span className="absolute bottom-2 right-2 rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
              {video.duration}
            </span>
            <YouTubePlay />
          </button>
        )}
      </div>

      <div className="mt-3 flex gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: video.avatarColor }}
        >
          {video.channel[0]}
        </span>
        <div className="min-w-0">
          <a
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 text-[15px] font-semibold leading-snug text-white transition-colors hover:text-white/80"
          >
            {video.title}
          </a>
          <p className="mt-1 text-[13px] text-white/45">
            {video.channel} · {video.views} views · {video.age}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function TweetAction({
  icon: Icon,
  count,
  className,
}: {
  icon: typeof Heart
  count: string
  className?: string
}) {
  return (
    <span className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <Icon className="h-[18px] w-[18px]" />
      <span className="text-[13px] tabular-nums">{count}</span>
    </span>
  )
}

function TweetCard({
  tweet,
  index,
}: {
  tweet: (typeof TWEETS)[number]
  index: number
}) {
  const [avatarOk, setAvatarOk] = useState(true)

  return (
    <motion.a
      href="https://twitter.com/jahooma"
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className="block rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]"
    >
      <div className="flex gap-3">
        {avatarOk ? (
          <img
            src="https://unavatar.io/twitter/jahooma"
            alt="James Grugett"
            loading="lazy"
            onError={() => setAvatarOk(false)}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest/25 text-sm font-semibold text-forest-bright">
            JG
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-[15px] font-bold text-white">
              James Grugett
            </span>
            <VerifiedBadge className="h-[18px] w-[18px] shrink-0" />
            <span className="ml-1 truncate text-[15px] text-white/40">
              @jahooma
            </span>
            <XIcon className="ml-auto h-[18px] w-[18px] shrink-0 text-white" />
          </div>

          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-white/90">
            {tweet.body}
          </p>

          <p className="mt-3 text-[13px] text-white/40">{tweet.time}</p>

          <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3 text-white/45">
            <TweetAction icon={MessageCircle} count={tweet.replies} />
            <TweetAction
              icon={Repeat2}
              count={tweet.reposts}
              className="hover:text-emerald-400"
            />
            <TweetAction
              icon={Heart}
              count={tweet.likes}
              className="hover:text-pink-500"
            />
            <TweetAction icon={BarChart3} count={tweet.views} />
            <Bookmark className="h-[18px] w-[18px]" />
          </div>
        </div>
      </div>
    </motion.a>
  )
}

export function Media() {
  return (
    <section className="relative bg-black px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 max-w-2xl">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
            In the wild
          </p>
          <h2 className="feature-heading text-white">
            People won’t stop talking about it
          </h2>
        </div>

        {/* Videos */}
        <div className="grid gap-6 md:grid-cols-3">
          {VIDEOS.map((v, i) => (
            <VideoCard key={v.id} video={v} index={i} />
          ))}
        </div>

        {/* Tweets */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {TWEETS.map((t, i) => (
            <TweetCard key={t.time} tweet={t} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
