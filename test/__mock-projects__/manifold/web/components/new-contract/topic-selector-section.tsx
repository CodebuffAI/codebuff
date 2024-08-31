import { Group, MAX_GROUPS_PER_MARKET } from 'common/group'
import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Row } from 'web/components/layout/row'
import { TopicTag } from 'web/components/topics/topic-tag'
import { XIcon } from '@heroicons/react/outline'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { uniqBy } from 'lodash'

export const TopicSelectorSection = (props: {
  selectedGroups: Group[]
  setSelectedGroups: (updateFn: (prevGroups: Group[]) => Group[]) => void
  question: string
  setHasChosenCategory: (hasChosenCategory: boolean) => void
}) => {
  const { selectedGroups, setSelectedGroups, question, setHasChosenCategory } =
    props

  return (
    <Col className="gap-3">
      <span className="px-1">
        Add topics{' '}
        <InfoTooltip text="Question will be displayed alongside the other questions in the topic." />
      </span>
      {selectedGroups && selectedGroups.length > 0 && (
        <Row className={'flex-wrap gap-2'}>
          {selectedGroups.map((group) => (
            <TopicTag
              location={'create page'}
              key={group.id}
              topic={group}
              className="bg-ink-100"
            >
              <button
                onClick={() => {
                  const cleared = selectedGroups.filter(
                    (g) => g.id !== group.id
                  )
                  setSelectedGroups(() => cleared)
                  if (question !== '') setHasChosenCategory(true)
                }}
              >
                <XIcon className="hover:text-ink-700 text-ink-400 ml-1 h-4 w-4" />
              </button>
            </TopicTag>
          ))}
        </Row>
      )}
      <TopicSelector
        setSelectedGroup={(group) => {
          setSelectedGroups((groups) =>
            uniqBy([...(groups ?? []), group], 'id')
          )
          setHasChosenCategory(true)
        }}
        max={MAX_GROUPS_PER_MARKET}
        selectedIds={selectedGroups.map((g) => g.id)}
      />
    </Col>
  )
}
