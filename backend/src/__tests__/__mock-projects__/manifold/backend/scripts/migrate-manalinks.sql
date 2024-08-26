alter table manalinks
alter column id
set default random_alphanumeric (8),
alter column amount
set not null,
alter column creator_id
set not null,
alter column created_time
set default now(),
alter column data
drop not null,
alter column fs_updated_time
drop not null;

alter table manalink_claims enable row level security;

create policy "public read" on manalink_claims for
select
  using (true);
