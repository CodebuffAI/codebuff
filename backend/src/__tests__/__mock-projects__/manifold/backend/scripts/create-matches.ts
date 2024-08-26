import { runScript } from './run-script'
import { manifoldLoveUserId } from 'common/love/constants'
import { createMatchMain } from 'api/love/create-match'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const matches = await pg.many<{
      lover_user_id1: string
      lover_user_id2: string
    }>(`
    select data->>'loverUserId1' as lover_user_id1, data->>'loverUserId2' as lover_user_id2 from contracts
    where
      data->'loverUserId1' is not null
      and data->>'loverUserId1' != '9AkFpivhbtXhTapLVJ2UCjuziLy2'
      and data->>'loverUserId2' != '9AkFpivhbtXhTapLVJ2UCjuziLy2'
      and data->>'loverUserId1' != 'im95n0PrSrN6H8UnaM4eQHvgilF3'
      and data->>'loverUserId2' != 'im95n0PrSrN6H8UnaM4eQHvgilF3'
      and outcome_type = 'BINARY'
      and resolution is null
    `)

    console.log('matches', matches)

    for (const { lover_user_id1, lover_user_id2 } of matches) {
      console.log('creating match for', lover_user_id1, lover_user_id2)

      await createMatchMain(
        manifoldLoveUserId,
        lover_user_id1,
        lover_user_id2,
        50,
        undefined
      ).catch((e) => {
        console.log('error creating match', e)
      })
    }
  })
}
