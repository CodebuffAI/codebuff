import { type APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getLikesAndShips: APIHandler<'get-likes-and-ships'> = async (
  props
) => {
  const { userId } = props

  return {
    status: 'success',
    ...(await getLikesAndShipsMain(userId)),
  }
}

export const getLikesAndShipsMain = async (userId: string) => {
  const pg = createSupabaseDirectClient()

  const likesGiven = await pg.map<{
    user_id: string
    created_time: number
  }>(
    `
      select target_id, love_likes.created_time
      from love_likes
      join lovers on lovers.user_id = love_likes.target_id
      join users on users.id = love_likes.target_id
      where creator_id = $1
        and looking_for_matches
        and lovers.pinned_url is not null
        and (data->>'isBannedFromPosting' != 'true' or data->>'isBannedFromPosting' is null)
      order by created_time desc
    `,
    [userId],
    (r) => ({
      user_id: r.target_id,
      created_time: new Date(r.created_time).getTime(),
    })
  )

  const likesReceived = await pg.map<{
    user_id: string
    created_time: number
  }>(
    `
      select creator_id, love_likes.created_time
      from love_likes
      join lovers on lovers.user_id = love_likes.creator_id
      join users on users.id = love_likes.creator_id
      where target_id = $1
        and looking_for_matches
        and lovers.pinned_url is not null
        and (data->>'isBannedFromPosting' != 'true' or data->>'isBannedFromPosting' is null)
      order by created_time desc
    `,
    [userId],
    (r) => ({
      user_id: r.creator_id,
      created_time: new Date(r.created_time).getTime(),
    })
  )

  const ships = await pg.map<{
    creator_id: string
    target_id: string
    target1_id: string
    target2_id: string
    created_time: number
  }>(
    `
    select 
      target1_id, target2_id, creator_id, love_ships.created_time,
      target1_id as target_id
    from love_ships
    join lovers on lovers.user_id = love_ships.target1_id
    join users on users.id = love_ships.target1_id
    where target2_id = $1
      and lovers.looking_for_matches
      and lovers.pinned_url is not null
      and (users.data->>'isBannedFromPosting' != 'true' or users.data->>'isBannedFromPosting' is null)

    union all

    select
      target1_id, target2_id, creator_id, love_ships.created_time,
      target2_id as target_id
    from love_ships
    join lovers on lovers.user_id = love_ships.target2_id
    join users on users.id = love_ships.target2_id
    where target1_id = $1
      and lovers.looking_for_matches
      and lovers.pinned_url is not null
      and (users.data->>'isBannedFromPosting' != 'true' or users.data->>'isBannedFromPosting' is null)
    `,
    [userId],
    (r) => ({
      ...r,
      created_time: new Date(r.created_time).getTime(),
    })
  )

  return {
    likesGiven,
    likesReceived,
    ships,
  }
}
