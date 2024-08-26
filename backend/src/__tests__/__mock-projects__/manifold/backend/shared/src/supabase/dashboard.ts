import { ITask } from 'pg-promise'
import { pgp } from './init'

// assumes dashboard exists, user authed
export const updateDashboardGroups = async (
  dashboardId: string,
  groupsIds: string[],
  txn: ITask<{}>
) => {
  // delete all dashboard_groups
  txn.none(`delete from dashboard_groups where dashboard_id = $1`, [
    dashboardId,
  ])

  if (groupsIds.length) {
    // insert each group into dashboard_groups
    const cs = new pgp.helpers.ColumnSet(['dashboard_id', 'group_id'], {
      table: 'dashboard_groups',
    })
    const query = pgp.helpers.insert(
      groupsIds.map((g) => ({ dashboard_id: dashboardId, group_id: g })),
      cs
    )
    txn.none(query)
  }
}
