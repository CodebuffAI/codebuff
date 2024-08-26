begin;

-- add colummns: text, content_type, and created_time
alter table user_reactions
add column content_id text,
add column content_type text,
add column content_owner_id text,
add column created_time timestamptz not null default now(),
alter column data
drop not null,
alter column reaction_id
set default random_alphanumeric (12);

-- trigger when data is updated
create
or replace function user_reactions_populate_cols () returns trigger language plpgsql as $$
begin
  if new.data is not null then
    new.content_id := (new.data) ->> 'contentId';
    new.content_type := (new.data) ->> 'contentType';
    new.content_owner_id := (new.data) ->> 'contentOwnerId';
    new.created_time :=
      case when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint) else null end;
  end if;
  return new;
end
$$;

create trigger user_reactions_populate before insert
or
update on user_reactions for each row
execute function user_reactions_populate_cols ();

-- populate all existing rows
update user_reactions
set
  reaction_id = reaction_id;

create index if not exists user_reactions_content_id_raw on user_reactions (content_id);

commit;

-- part 2, after reads all migrated over
begin;

drop index user_reactions_data_gin;

drop index user_reactions_type;

drop index user_reactions_content_id;

commit;
