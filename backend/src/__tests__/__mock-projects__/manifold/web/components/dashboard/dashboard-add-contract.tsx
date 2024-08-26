import { SelectMarkets } from '../contract-select-modal'
import { DashboardQuestionItem } from 'common/dashboard'

export function DashboardAddContract(props: {
  addQuestions: (questions: DashboardQuestionItem[]) => void
}) {
  const { addQuestions } = props
  return (
    <SelectMarkets
      className="grow overflow-y-auto"
      submitLabel={(len) => `Add ${len} question${len !== 1 ? 's' : ''}`}
      onSubmit={(contracts) => {
        addQuestions(
          contracts.map((contract) => {
            return { type: 'question', slug: contract.slug }
          })
        )
      }}
    />
  )
}
