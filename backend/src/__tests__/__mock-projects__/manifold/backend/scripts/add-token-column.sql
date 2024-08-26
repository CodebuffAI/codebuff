alter table txns
add column token text not null default 'M$' check (token in ('M$', 'SHARE', 'SPICE'));

create
or replace function txns_populate_cols () returns trigger language plpgsql as $$
begin
    if new.data is not null then
    new.from_id := (new.data ->> 'fromId');
    new.from_type := (new.data ->> 'fromType');
    new.to_id := (new.data ->> 'toId');
    new.to_type := (new.data ->> 'toType');
    new.amount := (new.data ->> 'amount')::numeric;
    new.token := (new.data ->> 'token');
    new.category := (new.data ->> 'category');
    end if;
    return new;
end
$$;

-- drop indexes
drop index if exists txns_category_to_id;

drop index if exists txns_category_native;

drop index if exists txns_to_created_time;

drop index if exists txns_from_created_time;

drop index if exists txns_category_to_id_from_id;

-- trigger txns_populate_cols on all rows by updating them
update txns
set
  id = id;

-- recreate indexes
create index if not exists txns_category_to_id on txns (category, to_id);

create index if not exists txns_category_native on txns (category);

create index if not exists txns_to_created_time on txns (to_id, created_time);

create index if not exists txns_from_created_time on txns (from_id, created_time);

create index if not exists txns_category_to_id_from_id on txns (category, to_id, from_id);

-- update usages of data->>'token' to use token column
create
or replace function get_donations_by_charity () returns table (
  charity_id text,
  num_supporters bigint,
  total numeric
) as $$
    select to_id as charity_id,
      count(distinct from_id) as num_supporters,
      sum(case when token = 'M$'
        then amount / 100
        else amount / 1000 end
      ) as total
    from txns
    where category = 'CHARITY'
    group by to_id
    order by total desc
$$ language sql;
