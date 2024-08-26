create temp table
  about_updates as (
    select
      g.id,
      g.data -> 'about' as old,
      p.data -> 'content' as new
    from
      groups g
      join old_posts p on g.data ->> 'aboutPostId' = p.id
  );

update groups
set
  data = jsonb_set(data, '{about}', about_updates.new)
from
  about_updates
where
  about_updates.id = groups.id;

delete from old_posts
where
  id in (
    select
      id
    from
      about_updates
  )
