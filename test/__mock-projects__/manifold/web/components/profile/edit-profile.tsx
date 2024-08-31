import { PrivateUser, User } from 'common/user'

import { ReactNode, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useEditableUserInfo } from 'web/hooks/use-editable-user-info'
import { useUser } from 'web/hooks/use-user'
import { api, updateUser } from 'web/lib/api/api'
import { uploadPublicImage } from 'web/lib/firebase/storage'

export function EditUserField(props: {
  label: ReactNode
  field: string
  value: string
  setValue: (value: string) => void
}) {
  const { label, field, value, setValue } = props

  return (
    <Col>
      {label}
      {field === 'bio' ? (
        <ExpandingInput
          className="w-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      ) : (
        <Input
          type="text"
          className={'w-full sm:w-96'}
          value={value}
          onChange={(e) => setValue(e.target.value || '')}
        />
      )}
    </Col>
  )
}

export const EditProfile = (props: {
  auth: { user: User; privateUser: PrivateUser }
}) => {
  const { privateUser } = props.auth
  const user = useUser() ?? props.auth.user
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  const { userInfo, updateUserState } = useEditableUserInfo(user)
  const {
    name,
    username,
    errorUsername,
    loadingUsername,
    loadingName,
    errorName,
  } = userInfo

  const [bio, setBio] = useState(user.bio || '')
  const [website, setWebsite] = useState(user.website || '')
  const [twitterHandle, setTwitterHandle] = useState(user.twitterHandle || '')
  const [discordHandle, setDiscordHandle] = useState(user.discordHandle || '')

  const handleSave = async () => {
    const updates: { [key: string]: string } = {}

    if (bio.trim() !== (user.bio || '').trim()) updates.bio = bio.trim()
    if (website.trim() !== (user.website || '').trim())
      updates.website = website.trim()
    if (twitterHandle.trim() !== (user.twitterHandle || '').trim())
      updates.twitterHandle = twitterHandle.trim()
    if (discordHandle.trim() !== (user.discordHandle || '').trim())
      updates.discordHandle = discordHandle.trim()
    if (name.trim() !== (user.name || '').trim()) updates.name = name.trim()
    if (username.trim() !== (user.username || '').trim())
      updates.username = username.trim()

    if (Object.keys(updates).length > 0) {
      setLoading(true)
      await api('me/update', updates)
      setIsSaved(true)
      setLoading(false)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  const fileHandler = async (event: any) => {
    const file = event.target.files[0]
    setAvatarLoading(true)
    await uploadPublicImage(user.username, file)
      .then(async (url) => {
        await updateUser({ avatarUrl: url })
        setAvatarUrl(url)
        setAvatarLoading(false)
      })
      .catch(() => {
        setAvatarLoading(false)
        setAvatarUrl(user.avatarUrl || '')
      })
  }

  return (
    <Col className="bg-canvas-0 max-w-lg rounded px-3 shadow-md sm:mx-auto">
      <Col className="gap-4">
        <Row className="items-center gap-4">
          {avatarLoading ? (
            <LoadingIndicator />
          ) : (
            <>
              <img
                alt={`${user.username}'s avatar`}
                src={avatarUrl}
                width={80}
                height={80}
                className="bg-ink-400 flex h-20 w-20 items-center justify-center rounded-full"
              />
              <input type="file" name="file" onChange={fileHandler} />
            </>
          )}
        </Row>

        <Col>
          <label className="mb-1 block">Display name</label>
          <Row className={'items-center gap-2'}>
            <Input
              disabled={loadingName}
              type="text"
              placeholder="Display name"
              value={name}
              onChange={(e) => updateUserState({ name: e.target.value || '' })}
            />
          </Row>
          {loadingName && (
            <Row className={'mt-2 items-center gap-4'}>
              <LoadingIndicator />
              <span>Loading... This may take a while.</span>
            </Row>
          )}
          {errorName && <span className="text-error text-sm">{errorName}</span>}
        </Col>

        <Col>
          <label className="mb-1 block">Username</label>
          <Row>
            <Input
              disabled={loadingUsername}
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) =>
                updateUserState({ username: e.target.value || '' })
              }
            />
          </Row>
          {loadingUsername && (
            <Row className={'mt-2 items-center gap-4'}>
              <LoadingIndicator />
              <span>Loading... This may take a while.</span>
            </Row>
          )}
          {errorUsername && (
            <span className="text-error text-sm">{errorUsername}</span>
          )}
        </Col>

        <EditUserField
          label={<label className="mb-1 block">Bio</label>}
          field="bio"
          value={bio}
          setValue={setBio}
        />
        <EditUserField
          label={<label className="mb-1 block">Website URL</label>}
          field="website"
          value={website}
          setValue={setWebsite}
        />
        <EditUserField
          label={<label className="mb-1 block">Twitter</label>}
          field="twitterHandle"
          value={twitterHandle}
          setValue={setTwitterHandle}
        />
        <EditUserField
          label={<label className="mb-1 block">Discord</label>}
          field="discordHandle"
          value={discordHandle}
          setValue={setDiscordHandle}
        />

        <div className={'mt-2'}>
          <label className="mb-1 block">Email</label>
          <div className="text-ink-500">{privateUser.email ?? '\u00a0'}</div>
        </div>

        <Button onClick={handleSave} disabled={loading}>
          {loading ? <LoadingIndicator /> : 'Save'}
        </Button>
      </Col>
    </Col>
  )
}
