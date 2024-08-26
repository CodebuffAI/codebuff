-- select millis_to_ts(daily_values[1]::bigint)::date + 365 as today
-- from stats
-- where title = 'startDate';
-- result: 2024-07-16

create table
  daily_stats as
with
  days as (
    select
      title,
      unnest(daily_values) as value,
      generate_series(array_length(daily_values, 1) - 1, 0, -1) as days_ago
    from
      stats
  )
select
 '2024-07-16'::date - days_ago::integer - 1 as start_date,
  max(case when title = 'dailyActiveUsers' then value end) as dau,
  max(case when title = 'weeklyActiveUsers' then value end) as wau,
  max(case when title = 'monthlyActiveUsers' then value end) as mau,
  max(case when title = 'avgDailyUserActions' then value end) as avg_user_actions,
  max(case when title = 'dailySales' then value end) as sales,
  max(case when title = 'engagedUsers' then value end) as engaged_users,
  max(case when title = 'd1' then value end) as d1,
  max(case when title = 'nd1' then value end) as nd1,
  max(case when title = 'nw1' then value end) as nw1,
  max(case when title = 'fracDaysActiveD1ToD3' then value end) as active_d1_to_d3,
  max(case when title = 'dailyBetCounts' then value end) as bet_count,
  max(case when title = 'dailyContractCounts' then value end) as contract_count,
  max(case when title = 'dailyCommentCounts' then value end) as comment_count,
  max(case when title = 'dailySignups' then value end) as signups,
  max(case when title = 'dailyNewRealUserSignups' then value end) as signups_real,
  max(case when title = 'weekOnWeekRetention' then value end) as w1,
  max(case when title = 'monthlyRetention' then value end) as m1,
  max(case when title = 'dailyActivationRate' then value end) as activation,
  max(case when title = 'manaBetDaily' then value end) as bet_amount,
  max(case when title = 'd1BetAverage' then value end) as d1_bet_average,
  max(case when title = 'd1Bet3DayAverage' then value end) as d1_bet_3_day_average,
  max(case when title = 'feedConversionScores' then value end) as feed_conversion
from
  days
group by
  days.days_ago
order by
  days.days_ago asc;

alter table daily_stats
add primary key (start_date),
alter column start_date set not null;

alter table daily_stats enable row level security;

create policy "public read" on daily_stats for
select
  using (true);

create function date_to_midnight_pt (d date) returns timestamp language sql immutable parallel safe as $$
  select timezone('America/Los_Angeles', d::timestamp)::timestamptz
$$;