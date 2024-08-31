begin;

update dashboards
set
  items = jsonb_build_object(
    'id',
    'a migrated description',
    'type',
    'text',
    'content',
    description
  ) || items
where
  description is not null;

alter table dashboards
drop column description;

commit;
