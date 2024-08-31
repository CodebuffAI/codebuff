drop index if exists txns_to_created_time;

drop index if exists txns_from_created_time;

drop index if exists txns_data_gin;

alter table txns
add column created_time timestamptz default now(),
add column from_id text,
add column from_type text,
add column to_id text,
add column to_type text,
add column amount numeric,
add column category text;

-- trigger when data is updated
create
or replace function txns_populate_cols () returns trigger language plpgsql as $$
begin
    if new.data is not null then
    new.from_id := (new.data ->> 'fromId');
    new.from_type := (new.data ->> 'fromType');
    new.to_id := (new.data ->> 'toId');
    new.to_type := (new.data ->> 'toType');
    new.amount := (new.data ->> 'amount')::numeric;
    new.category := (new.data ->> 'category');
    end if;
    return new;
end
$$;

create trigger txns_populate before insert
or
update on txns for each row
execute function txns_populate_cols ();
