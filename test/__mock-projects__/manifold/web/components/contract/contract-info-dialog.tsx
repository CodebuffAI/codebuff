import clsx from 'clsx'
import { sum } from 'lodash'
import { ELASTICITY_BET_AMOUNT } from 'common/calculate-metrics'
import { Contract, contractPool } from 'common/contract'
import {
  ENV_CONFIG,
  isAdminId,
  isModId,
  supabaseConsoleContractPath,
  TRADED_TERM,
} from 'common/envs/constants'
import { BETTORS, User } from 'common/user'
import { formatMoney, formatMoneyWithDecimals } from 'common/util/format'
import { capitalize, sumBy } from 'lodash'
import { toast } from 'react-hot-toast'
import { TiVolumeMute } from 'react-icons/ti'
import { BlockMarketButton } from 'web/components/buttons/block-market-button'
import { FollowMarketButton } from 'web/components/buttons/follow-market-button'
import { useAdmin, useDev, useTrusted } from 'web/hooks/use-admin'
import {
  api,
  updateMarket,
  updateUserDisinterestEmbedding,
} from 'web/lib/api/api'
import { formatTime } from 'web/lib/util/time'
import { Button } from '../buttons/button'
import { CopyLinkOrShareButton } from '../buttons/copy-link-button'
import { DuplicateContractButton } from '../buttons/duplicate-contract-button'
import { ReportButton } from '../buttons/report-button'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import ShortToggle from '../widgets/short-toggle'
import { Table } from '../widgets/table'
import { UNRANKED_GROUP_ID } from 'common/supabase/groups'
import { ContractHistoryButton } from './contract-edit-history-button'
import { ShareEmbedButton, ShareIRLButton } from '../buttons/share-embed-button'
import { ShareQRButton } from '../buttons/share-qr-button'
import dayjs from 'dayjs'
import SuperBanControl from '../SuperBanControl'
import { BoostButton } from './boost-button'
import { SubsidizeButton } from './subsidize-button'

export const Stats = (props: {
  contract: Contract
  user?: User | null | undefined
}) => {
  const { contract, user } = props
  const { creatorId } = contract
  const shouldAnswersSumToOne =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.shouldAnswersSumToOne
      : false
  const addAnswersMode =
    contract.mechanism === 'cpmm-multi-1' ? contract.addAnswersMode : 'DISABLED'

  const hideAdvanced = !user
  const isDev = useDev()
  const isAdmin = !!user && isAdminId(user?.id)
  const isTrusty = !!user && isModId(user?.id)
  const isMod = isAdmin || isTrusty
  const isCreator = user?.id === creatorId
  const isPublic = contract.visibility === 'public'
  const isMulti = contract.mechanism === 'cpmm-multi-1'
  const addAnswersPossible =
    isMulti && (shouldAnswersSumToOne ? addAnswersMode !== 'DISABLED' : true)
  const creatorOnly = isMulti && addAnswersMode === 'ONLY_CREATOR'
  const wasUnlistedByCreator = contract.unlistedById
    ? contract.unlistedById === creatorId
    : false

  const {
    createdTime,
    closeTime,
    resolutionTime,
    uniqueBettorCount,
    mechanism,
    viewCount,
    outcomeType,
    id,
    elasticity,
    isSpicePayout,
  } = contract

  const typeDisplay =
    outcomeType === 'BINARY'
      ? 'YES / NO'
      : outcomeType === 'MULTIPLE_CHOICE'
      ? 'Multiple choice'
      : outcomeType === 'BOUNTIED_QUESTION'
      ? 'Bounty'
      : outcomeType === 'POLL'
      ? 'Poll'
      : outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'NUMBER'
      ? 'Numeric'
      : outcomeType.toLowerCase()

  const mechanismDisplay =
    mechanism === 'cpmm-1'
      ? {
          label: 'Fixed',
          desc: `Each YES share is worth ${ENV_CONFIG.moneyMoniker}1 if YES wins`,
        }
      : mechanism === 'cpmm-multi-1'
      ? contract.shouldAnswersSumToOne
        ? {
            label: 'Dependent',
            desc: `Each share in an outcome is worth ${ENV_CONFIG.moneyMoniker}1 if it is chosen. Only one outcome can be chosen`,
          }
        : {
            label: 'Independent',
            desc: `Each answer is a separate binary contract with shares worth ${ENV_CONFIG.moneyMoniker}1 if chosen. Any number of answers can be chosen`,
          }
      : mechanism == 'none'
      ? undefined
      : { label: 'Mistake', desc: "Likely one of Austin's bad ideas" }

  const isBettingContract = contract.mechanism !== 'none'

  return (
    <Table>
      <tbody>
        <tr>
          <td>Type</td>
          <td className="flex gap-1">
            {typeDisplay}
            {mechanismDisplay && (
              <>
                <div className="mx-1 select-none">&middot;</div>
                {mechanismDisplay.label}{' '}
                <InfoTooltip text={mechanismDisplay.desc} />
              </>
            )}
          </td>
        </tr>

        <tr>
          <td>Question created</td>
          <td>{formatTime(createdTime)}</td>
        </tr>

        {contract.outcomeType == 'BOUNTIED_QUESTION' && (
          <>
            <tr>
              <td>
                Total bounty{' '}
                <InfoTooltip text="The total bounty the creator has put up" />
              </td>
              <td>{formatMoney(contract.totalBounty)}</td>
            </tr>
            <tr>
              <td>
                Bounty left <InfoTooltip text="Bounty left to pay out" />
              </td>
              <td>{formatMoney(contract.bountyLeft)}</td>
            </tr>
          </>
        )}

        {closeTime &&
          (isBettingContract ||
            contract.outcomeType == 'BOUNTIED_QUESTION') && (
            <tr>
              <td>Question close{closeTime > Date.now() ? 's' : 'd'}</td>

              <td>
                {!closeTime ||
                dayjs(closeTime).isAfter(
                  dayjs(contract.createdTime).add(dayjs.duration(900, 'year'))
                )
                  ? 'Never'
                  : formatTime(closeTime)}
              </td>
            </tr>
          )}

        {resolutionTime && isBettingContract && (
          <tr>
            <td>Question resolved</td>
            <td>{formatTime(resolutionTime)}</td>
          </tr>
        )}

        {isBettingContract && (
          <>
            <tr>
              <td>
                <span className="mr-1">24 hour volume</span>
                <InfoTooltip text="Amount bought or sold in the last 24 hours" />
              </td>
              <td>{formatMoney(contract.volume24Hours)}</td>
            </tr>

            <tr>
              <td>
                <span className="mr-1">Total volume</span>
                <InfoTooltip text="Total amount bought or sold" />
              </td>
              <td>{formatMoney(contract.volume)}</td>
            </tr>

            <tr>
              <td>
                <span className="mr-1">Collected fees</span>
                <InfoTooltip text="Includes both platform and creator fees" />
              </td>
              <td>
                {formatMoneyWithDecimals(
                  sum(Object.values(contract.collectedFees))
                )}
              </td>
            </tr>

            <tr>
              <td>{capitalize(BETTORS)}</td>
              <td>{uniqueBettorCount ?? '0'}</td>
            </tr>

            <tr>
              <td>Views</td>
              <td>{viewCount ?? '0'}</td>
            </tr>
          </>
        )}
        {!hideAdvanced && !contract.resolution && isBettingContract && (
          <tr>
            <td>
              <Row>
                <span className="mr-1">Elasticity</span>
                <InfoTooltip
                  text={
                    mechanism === 'cpmm-1'
                      ? `Log-odds change between a ${formatMoney(
                          ELASTICITY_BET_AMOUNT
                        )} ${TRADED_TERM} on YES and NO`
                      : `Log-odds change from a ${formatMoney(
                          ELASTICITY_BET_AMOUNT
                        )} ${TRADED_TERM}`
                  }
                />
              </Row>
            </td>
            <td>{elasticity.toFixed(2)}</td>
          </tr>
        )}

        {isBettingContract && (
          <tr>
            <td>Liquidity subsidies</td>
            <td>
              {mechanism === 'cpmm-1' || mechanism === 'cpmm-multi-1'
                ? `${formatMoney(
                    contract.totalLiquidity -
                      contract.subsidyPool -
                      ('answers' in contract
                        ? sumBy(contract.answers, 'subsidyPool')
                        : 0)
                  )} / ${formatMoney(contract.totalLiquidity)}`
                : formatMoney(100)}
            </td>
          </tr>
        )}

        {!hideAdvanced && isBettingContract && (
          <tr>
            <td>Pool</td>
            <td>
              {mechanism === 'cpmm-1' && outcomeType === 'BINARY'
                ? `${Math.round(contract.pool.YES)} YES, ${Math.round(
                    contract.pool.NO
                  )} NO`
                : mechanism === 'cpmm-1' && outcomeType === 'PSEUDO_NUMERIC'
                ? `${Math.round(contract.pool.YES)} HIGHER, ${Math.round(
                    contract.pool.NO
                  )} LOWER`
                : contractPool(contract)}
            </td>
          </tr>
        )}

        {addAnswersPossible && (isCreator || isAdmin || isMod) && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
            <td>
              Creator only{' '}
              <InfoTooltip
                text={
                  creatorOnly
                    ? 'Only creator can add answers'
                    : 'Anyone can add answers'
                }
              />
            </td>
            <td>
              <ShortToggle
                className="mr-1 align-middle"
                on={creatorOnly}
                setOn={(on) =>
                  updateMarket({
                    contractId: contract.id,
                    addAnswersMode: on ? 'ONLY_CREATOR' : 'ANYONE',
                  })
                }
              />
              {addAnswersMode === 'DISABLED' && <span>(Disabled for all)</span>}
            </td>
          </tr>
        )}

        {/* Show a path to Firebase if user is an admin, or we're on localhost */}
        {(isAdmin || isDev) && (
          <>
            <tr className="bg-purple-500/30">
              <td>Supabase link</td>
              <td>
                <a
                  href={supabaseConsoleContractPath(id)}
                  target="_blank"
                  className="text-primary-600"
                  rel="noreferrer"
                >
                  {id}
                </a>
              </td>
            </tr>
            <tr className="bg-purple-500/30">
              <td>SQL query</td>
              <td>
                <span className="truncate">select * from contracts...</span>
                <CopyLinkOrShareButton
                  url={`select * from contracts where id = '${id}';`}
                  tooltip="Copy sql query to contract id"
                  eventTrackingName={'admin copy contract id'}
                  className="!py-0 align-middle"
                  trackingInfo={{ contractId: id }}
                />
              </td>
            </tr>
          </>
        )}

        {!hideAdvanced && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
            <td>
              🔎 Publicly listed{' '}
              <InfoTooltip
                text={
                  isPublic
                    ? 'Visible on home page and search results'
                    : 'Only visible via link'
                }
              />
            </td>
            <td>
              <CheckOrSwitch
                canToggle={isMod || isCreator}
                disabled={!isPublic && !isMod && !wasUnlistedByCreator}
                on={isPublic}
                setOn={(pub) =>
                  updateMarket({
                    contractId: contract.id,
                    visibility: pub ? 'public' : 'unlisted',
                  })
                }
              />
            </td>
          </tr>
        )}

        {!hideAdvanced && isBettingContract && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
            <td>
              🏆 Ranked{' '}
              <InfoTooltip
                text={'Profit and creator bonuses count towards leagues'}
              />
            </td>
            <td>
              <CheckOrSwitch
                canToggle={isMod}
                disabled={!isPublic}
                on={isPublic && contract.isRanked !== false}
                setOn={(on) => {
                  toast.promise(
                    api('market/:contractId/group', {
                      contractId: contract.id,
                      groupId: UNRANKED_GROUP_ID,
                      remove: on,
                    }),
                    {
                      loading: `${
                        on ? 'Removing' : 'Adding'
                      } question to the unranked topic...`,
                      success: `Successfully ${
                        on ? 'removed' : 'added'
                      } question to the unranked topic!`,
                      error: `Error ${
                        on ? 'removing' : 'adding'
                      } topic. Try again?`,
                    }
                  )
                }}
              />
            </td>
          </tr>
        )}
        {!hideAdvanced && isBettingContract && (
          <tr className={clsx(isMod && 'bg-purple-500/30')}>
            <td>
              💰 Prize market{' '}
              <InfoTooltip
                text={'Whether this market issue prizes points on resolution'}
              />
            </td>
            <td>
              <CheckOrSwitch
                canToggle={isAdmin}
                disabled={!isAdmin}
                on={!!isSpicePayout}
                setOn={(val) =>
                  updateMarket({ contractId: contract.id, isSpicePayout: val })
                }
              />
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  )
}

export const CheckOrSwitch = (props: {
  canToggle: boolean
  disabled?: boolean
  on: boolean
  setOn: (on: boolean) => void
}) => {
  const { on, setOn, canToggle, disabled } = props
  return canToggle ? (
    <ShortToggle
      className="align-middle"
      disabled={disabled}
      on={on}
      setOn={setOn}
    />
  ) : on ? (
    <>✅</>
  ) : (
    <>❌</>
  )
}

export function ContractInfoDialog(props: {
  contract: Contract
  user: User | null | undefined
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, user, open, setOpen } = props
  const isAdmin = useAdmin()
  const isTrusted = useTrusted()
  const isCreator = user?.id === contract.creatorId

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 flex flex-col gap-4 rounded p-6"
    >
      <FollowMarketButton contract={contract} user={user} />

      <Stats contract={contract} user={user} />

      {!!user && (
        <>
          <Row className="my-2 flex-wrap gap-2">
            {!isCreator && <BoostButton contract={contract} />}
            <DuplicateContractButton contract={contract} />
            <ContractHistoryButton contract={contract} />
            <ShareQRButton contract={contract} />
            <ShareIRLButton contract={contract} />
            <ShareEmbedButton contract={contract} />
            {(contract.mechanism == 'cpmm-1' ||
              contract.mechanism == 'cpmm-multi-1') && (
              <SubsidizeButton contract={contract} />
            )}
          </Row>
          <Row className="flex-wrap gap-2">
            <ReportButton
              report={{
                contentId: contract.id,
                contentType: 'contract',
                contentOwnerId: contract.creatorId,
              }}
            />

            <BlockMarketButton contract={contract} />
            <DisinterestedButton contract={contract} user={user} />
            {isAdmin || isTrusted ? (
              <SuperBanControl userId={contract.creatorId} />
            ) : null}
          </Row>
        </>
      )}
    </Modal>
  )
}
const DisinterestedButton = (props: {
  contract: Contract
  user: User | null | undefined
}) => {
  const { contract, user } = props
  if (!user) return null
  const markUninteresting = async () => {
    await updateUserDisinterestEmbedding({
      contractId: contract.id,
      creatorId: contract.creatorId,
    })
    toast(`We won't show you content like that again`, {
      icon: <TiVolumeMute className={'h-5 w-5 text-teal-500'} />,
    })
  }
  return (
    <Button size="xs" color="yellow-outline" onClick={markUninteresting}>
      <Row className={'items-center text-sm'}>
        <TiVolumeMute className="h-5 w-5" />
        Uninterested
      </Row>
    </Button>
  )
}
