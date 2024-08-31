import {
  BsFillCheckCircleFill,
  BsFillXCircleFill,
  BsUiChecks,
} from 'react-icons/bs'
import { Col } from 'web/components/layout/col'
import { CgPoll } from 'react-icons/cg'
import { GoNumber } from 'react-icons/go'
import { OutcomeType } from 'common/contract'

export const PREDICTIVE_CONTRACT_TYPES = {
  BINARY: {
    label: 'Yes/No',
    value: 'BINARY',
    name: 'yes/no',
    descriptor: 'A yes/no question.',
    example: 'Will NASA confirm the discovery of aliens before 2025?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsFillCheckCircleFill className="mr-4 h-6 w-8" />
        <BsFillXCircleFill className=" absolute bottom-0 right-0 ml-4 h-6 w-8" />
      </Col>
    ),
  },
  MULTIPLE_CHOICE: {
    label: 'Multiple choice',
    value: 'MULTIPLE_CHOICE',
    name: 'multiple choice',
    descriptor: 'A question with multiple answers that you define.',
    example: 'Which of the following candidates will be elected in 2024?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsUiChecks className="h-12 w-12" />
      </Col>
    ),
  },
  NUMBER: {
    label: 'Numeric (experimental)',
    value: 'NUMBER',
    name: 'numeric',
    descriptor: 'A question with a numerical answer.',
    example:
      'Experimental market type: How many people will come to Taco Tuesday?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <GoNumber className="h-12 w-12" />
      </Col>
    ),
  },
} as const

export const NON_PREDICTIVE_CONTRACT_TYPES = {
  // BOUNTIED_QUESTION: {
  //   label: 'Bounty',
  //   value: 'BOUNTIED_QUESTION',
  //   name: 'bounty',
  //   descriptor: `A question that anyone can answer for a bounty. The bounty you put up can be distributed however you'd like.`,
  //   example: `Recommend me sci-fi books, ${formatMoney(
  //     100
  //   )} for each good submission.`,
  //   visual: (
  //     <Col className="relative my-auto h-12 w-12 text-teal-400">
  //       <GiReceiveMoney className="h-12 w-12" />
  //     </Col>
  //   ),
  //   className: 'hover:ring-teal-500/50',
  //   backgroundColor: 'bg-teal-500/5',
  //   selectClassName:
  //     'dark:from-teal-500/20 from-teal-500/30 ring-teal-500 bg-gradient-to-br to-transparent ring-2',
  // },
  POLL: {
    label: 'Poll',
    value: 'POLL',
    name: 'poll',
    descriptor: `A multiple choice question that people can vote on. Each person can only vote once.`,
    example: `Which color should I wear to prom?`,
    visual: (
      <Col className="relative my-auto h-12 w-12 text-fuchsia-400">
        <CgPoll className="h-12 w-12" />
      </Col>
    ),
    className: 'hover:!ring-fuchsia-500/50',
    backgroundColor: 'bg-fuchsia-500/5',
    selectClassName:
      'dark:from-fuchsia-500/20 from-fuchsia-500/30 ring-fuchsia-500 bg-gradient-to-br to-transparent ring-2',
  },
} as const

export const ALL_CONTRACT_TYPES = {
  ...PREDICTIVE_CONTRACT_TYPES,
  ...NON_PREDICTIVE_CONTRACT_TYPES,
}

export function getContractTypeFromValue(
  outcomeType: OutcomeType,
  key: 'example' | 'name'
): string | undefined {
  return Object.keys(ALL_CONTRACT_TYPES).includes(outcomeType)
    ? ALL_CONTRACT_TYPES[outcomeType as keyof typeof ALL_CONTRACT_TYPES][key]
    : undefined
}
