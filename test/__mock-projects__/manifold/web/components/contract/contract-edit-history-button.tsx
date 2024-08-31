import { Contract } from 'common/contract'
import { Button } from 'web/components/buttons/button'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useEffect, useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { CloseDate } from 'web/components/contract/contract-details'
import { isEqual, uniqBy } from 'lodash'
import { formatTimeShort } from 'web/lib/util/time'
import { Row } from '../layout/row'
import { UserFromId } from 'web/components/user-from-id'
import { CollapsibleContent } from '../widgets/collapsible-content'
import { JSONContent } from '@tiptap/core'
import { filterDefined } from 'common/util/array'

type ContractEdit = {
  id: string
  question?: string
  description?: string | JSONContent
  closeTime?: number
  resolution?: string | false
  updatedKeys: string[] | null
  editCreated: number
  editorId: string
  answers?: string[]
}
export const ContractHistoryButton = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [contractHasEdits, setContractHasEdits] = useState(false)
  const [edits, setEdits] = useState<ContractEdit[] | undefined>(undefined)

  const getCount = async () => {
    const { count } = await db
      .from('contract_edits')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contract.id)
    setContractHasEdits(count ? count > 0 : false)
  }
  useEffect(() => {
    getCount()
  }, [contract.id])

  const loadEdits = async () => {
    const { data } = await run(
      db
        .from('contract_edits')
        .select('*')
        .eq('contract_id', contract.id)
        .order('created_time', { ascending: false })
    )

    const rawEdits = uniqBy(
      data.map((edit) => {
        const contract = edit.data as Contract
        return {
          ...contract,
          editCreated: new Date(edit.created_time).valueOf(),
          idempotencyKey: edit.idempotency_key
            ? edit.idempotency_key
            : Math.random().toString(),
          updatedKeys: edit.updated_keys,
          editorId: edit.editor_id,
        }
      }),
      'idempotencyKey'
    )

    // throwaway
    rawEdits.unshift({
      ...contract,
      editCreated: Date.now(),
      idempotencyKey: Math.random().toString(),
      updatedKeys: null,
      editorId: contract.creatorId,
    })

    // each row's contract (title, desc, close) is from before the edit, but created_time, updatedKeys, and editorId are at the time of the edit
    const edits: ContractEdit[] = []

    for (let i = 0; i < rawEdits.length; i++) {
      const edit = rawEdits[i]
      const prev = rawEdits[i + 1]
      const answers =
        edit && prev && 'answers' in edit && 'answers' in prev
          ? filterDefined([
              prev.answers.find(
                (a) =>
                  a.text !== edit.answers.find((a2) => a2.id === a.id)?.text
              )?.text,
              edit.answers.find(
                (a) =>
                  a.text !== prev.answers.find((a2) => a2.id === a.id)?.text
              )?.text,
            ])
          : undefined
      if (prev) {
        edits.push({
          id: edit.id,
          question: edit.question != prev.question ? edit.question : undefined,
          description: !isEqual(edit.description, prev.description)
            ? edit.description
            : undefined,
          closeTime:
            edit.closeTime != prev.closeTime ? edit.closeTime : undefined,
          resolution:
            edit.resolution != prev.resolution
              ? edit.resolution ?? false
              : undefined,
          updatedKeys: prev.updatedKeys,
          editCreated: prev.editCreated,
          editorId: prev.editorId,
          answers: answers?.length ? answers : undefined,
        })
      } else {
        // market created
        edits.push({
          id: edit.id,
          question: edit.question,
          description: edit.description,
          closeTime: edit.closeTime,
          resolution: edit.resolution,
          updatedKeys: null,
          editCreated: contract.createdTime,
          editorId: contract.creatorId,
        })
      }
    }

    setEdits(edits)
  }
  useEffect(() => {
    if (showEditHistory && edits === undefined) {
      loadEdits()
    }
  }, [showEditHistory])
  if (!contractHasEdits) return null
  return (
    <>
      <Button
        color="gray-outline"
        size="sm"
        onClick={() => setShowEditHistory(true)}
        className={className}
      >
        History
      </Button>
      <Modal size={'lg'} open={showEditHistory} setOpen={setShowEditHistory}>
        <div className={'bg-canvas-50 rounded p-4'}>
          <Title>Question History</Title>

          <Col className="gap-4 px-2">
            {edits?.map((edit, i) => {
              return (
                <div key={edit.id}>
                  <Row className={'items-center gap-1 text-sm'}>
                    <UserFromId userId={edit.editorId} />

                    <div className="text-ink-500 flex gap-1 ">
                      {i === edits.length - 1 ? 'created' : 'updated'}
                      <span>on {formatTimeShort(edit.editCreated)}</span>
                    </div>
                  </Row>

                  <Col className="gap-1">
                    {edit.question && (
                      <div className="text-ink-1000 text-xl font-medium">
                        {edit.question}
                      </div>
                    )}
                    {edit.description && (
                      <div className="bg-canvas-0 rounded-lg p-2">
                        <CollapsibleContent
                          content={edit.description}
                          stateKey={`isCollapsed-contract-${edit.id}`}
                          defaultCollapse
                        />
                      </div>
                    )}
                    {edit.answers && edit.answers.length > 1 && (
                      <Col>
                        <div className={'text-ink-500'}>Edited answer: </div>
                        {edit.answers[0]} → {edit.answers[1]}
                      </Col>
                    )}
                    {edit.closeTime && !edit.resolution && (
                      <CloseDate
                        closeTime={edit.closeTime}
                        contract={contract}
                      />
                    )}

                    {edit.resolution != null &&
                      (edit.resolution ? (
                        <div>Resolved {edit.resolution}</div>
                      ) : (
                        <div>Unresolved</div>
                      ))}

                    {edit.updatedKeys?.includes('isRanked') && (
                      <div>Toggled ranked</div>
                    )}
                    {edit.updatedKeys?.includes('isSubsidized') && (
                      <div>Toggled subsidized</div>
                    )}
                  </Col>
                </div>
              )
            })}
          </Col>
        </div>
      </Modal>
    </>
  )
}
