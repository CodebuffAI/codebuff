import dayjs from 'dayjs'
import { useState } from 'react'
import Router from 'next/router'

import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { deleteTV, setTV } from 'web/lib/api/api'
import { useAdmin, useTrusted } from 'web/hooks/use-admin'
import { removeUndefinedProps } from 'common/util/object'
import ShortToggle from 'web/components/widgets/short-toggle'
import { ScheduleItem } from './tv-schedule'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function ScheduleTVModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  stream?: ScheduleItem
  slug?: string
}) {
  const { open, setOpen, stream } = props

  const [streamId, setStreamId] = useState(stream?.stream_id ?? '')
  const [slug, setSlug] = useState(props.slug ?? '')
  const [title, setTitle] = useState(stream?.title ?? '')
  const [isFeatured, setIsFeatured] = useState(stream?.is_featured ?? false)
  const [source, setSource] = useState(stream?.source ?? 'youtube')

  const defaultStart = stream
    ? dayjs(stream.start_time).format('YYYY-MM-DD HH:mm')
    : dayjs().format('YYYY-MM-DD HH:mm')
  const [startTime, setStartTime] = useState(defaultStart)

  const defaultEnd = stream
    ? dayjs(stream.end_time).format('YYYY-MM-DD HH:mm')
    : ''
  const [endTime, setEndTime] = useState(defaultEnd)

  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const save = async () => {
    if (!streamId || !slug || !title || !startTime || !endTime) {
      setError('Please fill in all the required fields')
      return
    }

    if (source === 'youtube' && streamId.length !== 11) {
      setError(
        'Invalid YouTube Stream ID. It should be exactly 11 characters long.'
      )
      return
    }

    const start = dayjs(startTime)
    const end = dayjs(endTime)

    if (!start.isValid() || !end.isValid()) {
      setError('Invalid start or end time format.')
      return
    }
    if (end.isBefore(start)) {
      setError('End time should be after the start time.')
      return
    }

    if (!stream) {
      // restrictions only for new events
      if (start.isBefore(dayjs().subtract(1, 'hour'))) {
        setError('Start time should not be in the past.')
        return
      }
      if (end.isAfter(dayjs().add(2, 'month'))) {
        setError('End time should not be more than 2 months in the future.')
        return
      }
    }

    setError('')
    setIsSubmitting(true)

    await setTV(
      removeUndefinedProps({
        id: stream?.id.toString(),
        streamId: streamId,
        slug: slug,
        title,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        source,
        isFeatured,
      })
    )
      .then(() => {
        setOpen(false)
        if (!stream) Router.push(`/tv/schedule`)
      })
      .catch((e) => {
        setError(e.message)
      })
      .finally(() => {
        setIsSubmitting(false)
      })
  }

  const deleteStream = async () => {
    if (stream) {
      setOpen(false)
      await deleteTV(stream.id.toString())
    }
  }

  const isAdmin = useAdmin()
  const isMod = useTrusted()
  const user = useUser()

  const allowFeaturing = isAdmin || isMod
  const allowDeletion = stream?.creator_id === user?.id || isAdmin || isMod

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 text-ink-1000 rounded-md p-8"
      size="sm"
    >
      <Col className="bg-canvas-0 gap-2.5  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">
          {stream ? 'Modify' : 'Schedule'} TV event
        </Title>

        <Row className="items-center justify-between gap-2">
          <div>Event name</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Row>

        <Row className="items-center justify-between gap-2">
          <div>YouTube / Twitch</div>
          <Input
            value={streamId}
            onChange={(e) => {
              const text = e.target.value
              const { streamId, source } = parseUrl(text)
              setStreamId(streamId)
              setSource(source)
            }}
          />
        </Row>

        <Row className="items-center justify-between gap-2">
          <div>Market link</div>
          <Input
            value={slug}
            onChange={(e) => setSlug(processUrl(e.target.value))}
          />
        </Row>

        <Row className="items-center justify-between gap-2">
          <div>Start</div>
          <Input
            type={'datetime-local'}
            className="dark:date-range-input-white"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setStartTime(e.target.value)}
            value={startTime}
            step={undefined}
          />
        </Row>

        <Row className="items-center justify-between gap-2">
          <div>End</div>
          <Input
            type={'datetime-local'}
            className="dark:date-range-input-white"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEndTime(e.target.value)}
            value={endTime}
            step={undefined}
          />
        </Row>

        {allowFeaturing && (
          <Row className="items-center justify-between gap-2">
            <div>Featured</div>
            <ShortToggle on={isFeatured} setOn={(on) => setIsFeatured(on)} />
          </Row>
        )}

        {error && (
          <Row className="text-error mt-4">
            <div>{error}</div>
          </Row>
        )}

        <Row className="gap-4">
          <Button
            color="indigo"
            size="xl"
            onClick={save}
            disabled={isSubmitting}
          >
            {!isSubmitting ? (
              stream ? (
                'Save'
              ) : (
                'Schedule'
              )
            ) : (
              <Row className="items-center">
                <LoadingIndicator className="text-canvas-0 mr-2" size="md" />{' '}
                Saving...
              </Row>
            )}
          </Button>

          {stream && allowDeletion && (
            <Button
              size="xs"
              color="red-outline"
              onClick={() =>
                confirm('Are you want to delete this event?') && deleteStream()
              }
              disabled={isSubmitting}
            >
              Delete event
            </Button>
          )}
        </Row>
      </Col>
    </Modal>
  )
}

const processYoutubeUrl = (url: string) => {
  const match = url.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/
  )
  if (match) {
    return match[1]
  }
  return url
}

const processUrl = (url: string) => {
  return url.split('?')[0].split('/').pop() ?? ''
}

const parseUrl = (url: string) => {
  let source = ''
  let streamId = ''

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    source = 'youtube'
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/
    )
    streamId = match ? match[1] : ''
  } else if (url.includes('twitch.tv')) {
    source = 'twitch'
    const match = url.match(/(?:twitch\.tv\/)([\w]+)/)
    streamId = match ? match[1] : ''
  } else if (url.includes('twitter.com') || url.includes('x.com')) {
    source = 'twitter'
    const match = url.match(
      /(?:twitter\.com\/\w+\/status\/|x\.com\/\w+\/status\/)(\d+)/
    )
    streamId = match ? match[1] : ''
  }
  console.log(source, streamId)

  return { source, streamId }
}
