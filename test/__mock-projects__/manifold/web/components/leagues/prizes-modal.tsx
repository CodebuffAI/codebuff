import { range, sortBy } from 'lodash'
import { DIVISION_NAMES, prizesByDivisionAndRank } from 'common/leagues'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { SPICE_NAME } from 'common/envs/constants'

export function PrizesModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  const divisions = sortBy(
    Object.entries(DIVISION_NAMES).filter(([division]) => +division > 0),
    ([division]) => division
  )
  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <Col className={'bg-canvas-0 text-ink-1000 gap-4 rounded-lg py-3'}>
        <Col className="gap-4 px-3 sm:px-4">
          <Title className={'!mb-0'}>Prizes</Title>
          <div>
            Win {SPICE_NAME}s at the end of the season based on your division
            and finishing rank.
          </div>
        </Col>
        <Col className="overflow-x-auto px-3 sm:px-4">
          <table className="[&_*]:border-ink-200 table-auto border-collapse [&_*]:border">
            <thead>
              <tr>
                <th className="px-4 py-2">Rank</th>
                {divisions.map(([, divisionName], i) => (
                  <th key={i} className="px-4 py-2">
                    {divisionName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {range(
                0,
                prizesByDivisionAndRank[prizesByDivisionAndRank.length - 1]
                  .length
              ).map((i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-center font-black">{i + 1}</td>
                  {prizesByDivisionAndRank.map((divisionPrizes, j) => (
                    <td key={j} className="px-4 py-2 text-center">
                      {divisionPrizes[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Col>
      </Col>
    </Modal>
  )
}
