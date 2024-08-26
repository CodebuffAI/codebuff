import { track } from 'web/lib/service/analytics'
import clsx from 'clsx'
import { DashboardItem, MAX_DASHBOARD_TITLE_LENGTH } from 'common/dashboard'
import { removeUndefinedProps } from 'common/util/object'
import router from 'next/router'
import { useEffect, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { AddItemCard } from 'web/components/dashboard/add-dashboard-item'
import { DashboardContent } from 'web/components/dashboard/dashboard-content'
import { InputWithLimit } from 'web/components/dashboard/input-with-limit'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import { Title } from 'web/components/widgets/title'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { createDashboard } from 'web/lib/api/api'

export default function CreateDashboard() {
  const [title, setTitle] = usePersistentLocalState(
    '',
    'create dashboard title'
  )

  const [submitState, setSubmitState] = useState<
    'EDITING' | 'LOADING' | 'DONE'
  >('EDITING')

  const [errorText, setErrorText] = useState<string>('')

  const [items, setItems] = usePersistentLocalState<DashboardItem[]>(
    [],
    'create dashboard items'
  )

  const [topics, setTopics] = usePersistentLocalState<string[]>(
    [],
    'create dashboard topics'
  )

  const isValid =
    title.length > 0 &&
    title.length <= MAX_DASHBOARD_TITLE_LENGTH &&
    (items.length || topics.length)

  useEffect(() => {
    if (isValid) {
      setErrorText('')
    }
  }, [isValid])

  const resetProperties = () => {
    setTitle('')
    setItems([])
    setTopics([])
  }

  async function submit() {
    if (!isValid) return
    setSubmitState('LOADING')
    try {
      const createProps = removeUndefinedProps({ title, items, topics })
      const newDashboard = await createDashboard(createProps)

      track('create dashboard', {
        id: newDashboard.id,
        slug: newDashboard.slug,
      })

      resetProperties()
      setSubmitState('DONE')

      try {
        await router.push(`/news/${newDashboard.slug}`)
      } catch (error) {
        console.error(error)
      }
    } catch (e) {
      console.error('error creating dashboard', e)
      setErrorText((e as any).message || 'Error creating')
      setSubmitState('EDITING')
    }
  }

  return (
    <Page trackPageView={'create dashboard page'}>
      <SEO
        title="Create a news dashboard"
        description="Create a collection of prediction markets."
        url="/news/create"
      />
      <Col
        className={clsx(
          'text-ink-1000 mx-auto w-full max-w-3xl px-4 py-2 transition-colors sm:px-6'
        )}
      >
        <Title>Create a Dashboard</Title>

        <label className="mb-2">
          Title<span className={'text-scarlet-500'}>*</span>
        </label>
        <InputWithLimit
          text={title}
          setText={setTitle}
          limit={MAX_DASHBOARD_TITLE_LENGTH}
          className="w-full !text-lg"
          placeholder={'Title'}
        />

        <Spacer h={6} />

        <label className="mb-2">Content</label>

        <AddItemCard
          items={items}
          setItems={setItems}
          topics={topics}
          setTopics={setTopics}
        />

        <Spacer h={4} />

        <DashboardContent
          items={items}
          setItems={setItems}
          topics={topics}
          setTopics={setTopics}
          isEditing
        />
        <Spacer h={6} />
        <span className="text-error">{errorText}</span>

        <Button
          className="mb-4 mt-2 w-full"
          type="submit"
          color={submitState === 'DONE' ? 'green' : 'indigo'}
          size="xl"
          loading={submitState === 'LOADING'}
          disabled={!isValid}
          onClick={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {submitState === 'EDITING'
            ? 'Create dashboard'
            : submitState === 'LOADING'
            ? 'Creating...'
            : 'Created!'}
        </Button>
      </Col>
    </Page>
  )
}
