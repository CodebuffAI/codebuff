create
or replace function public.contract_populate_cols () returns trigger language plpgsql as $function$
begin
  if new.data is not null then
  new.slug := (new.data) ->> 'slug';
  new.question := (new.data) ->> 'question';
  new.creator_id := (new.data) ->> 'creatorId';
  new.visibility := (new.data) ->> 'visibility';
  new.mechanism := (new.data) ->> 'mechanism';
  new.outcome_type := (new.data) ->> 'outcomeType';
  new.unique_bettor_count := ((new.data) -> 'uniqueBettorCount')::bigint;
  new.tier := (new.data) ->> 'marketTier';
  new.created_time := case
      when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint)
      else null
    end;
  new.close_time := case
      when new.data ? 'closeTime' then millis_to_ts(((new.data) ->> 'closeTime')::bigint)
      else null
    end;
  new.resolution_time := case
      when new.data ? 'resolutionTime' then millis_to_ts(((new.data) ->> 'resolutionTime')::bigint)
      else null
    end;
  new.resolution_probability := ((new.data) ->> 'resolutionProbability')::numeric;
  new.resolution := (new.data) ->> 'resolution';
  new.is_spice_payout := coalesce(((new.data) ->> 'isSpicePayout')::boolean, false);
  new.popularity_score := coalesce(((new.data) ->> 'popularityScore')::numeric, 0);
  new.deleted := coalesce(((new.data) ->> 'deleted')::boolean, false);
  new.group_slugs := case
      when new.data ? 'groupSlugs' then jsonb_array_to_text_array((new.data) -> 'groupSlugs')
      else null
    end;
  new.last_updated_time := case
      when new.data ? 'lastUpdatedTime' then millis_to_ts(((new.data) ->> 'lastUpdatedTime')::bigint)
      else null
    end;
  new.last_bet_time := case
      when new.data ? 'lastBetTime' then millis_to_ts(((new.data) ->> 'lastBetTime')::bigint)
      else null
    end;
  new.last_comment_time := case
      when new.data ? 'lastCommentTime' then millis_to_ts(((new.data) ->> 'lastCommentTime')::bigint)
      else null
    end;
  end if;
  return new;
end
$function$;

create
or replace function public.get_open_limit_bets_with_contracts_1 (uid text, count integer, politics boolean) returns table (contract_id text, bets jsonb[], contract jsonb) language sql stable parallel SAFE as $function$;
  -- TODO: drop this function
  select * from get_open_limit_bets_with_contracts(uid, count);
$function$;

alter table contracts
drop column if exists is_politics;

replace view public_contracts as
select
  *
from
  contracts
where
  visibility = 'public';
