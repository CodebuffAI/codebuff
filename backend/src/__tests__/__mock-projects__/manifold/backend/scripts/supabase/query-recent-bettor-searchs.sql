with recent_bettors as (
    select id
    from users
    where data->>'lastBetTime' is not null
    order by created_time desc
    limit 5000 -- only uses search terms from the most recently created users who've placed a bet
),
     recent_events as (
         select
             ue.user_id,
             ue.data->>'query' as query,
             ue.ts
         from
             user_events ue
         where
             ue.name = 'search' and
             ue.user_id in (select id from recent_bettors)
         order by
             ue.ts desc
         limit 50000 -- only searches the latest 50k events
     )
select
    re.query,
    count(*) as query_count
from
    recent_events re
        join
    recent_bettors tu on re.user_id = tu.id
group by
    re.query
order by
    query_count desc;
