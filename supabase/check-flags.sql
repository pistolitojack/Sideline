-- Phase 3.1 verification — NOT a migration. Safe to run any time, changes
-- nothing.
--
-- Recomputes two of the scorecard's checks directly in SQL, straight from the
-- stored EDL, and puts them next to the flags the worker wrote in JavaScript.
-- Two independent implementations agreeing on real data is the actual proof
-- that the ruler works; the unit tests only prove it agrees with itself.
--
-- Read the last two columns: both should say "match" on every row.

select
  p.id,
  p.piece_kind,
  p.status,
  p.flags,

  -- total piece duration, summed from the segments
  round(
    coalesce(
      (select sum((s ->> 'out')::numeric - (s ->> 'in')::numeric)
         from jsonb_array_elements(p.edl -> 'segments') s),
      0
    ), 2
  ) as total_sec,

  jsonb_array_length(coalesce(p.edl -> 'captions', '[]'::jsonb)) as captions,

  -- CHECK 1: does SQL agree about piece_too_short (< 5s)?
  case
    when (
      coalesce(
        (select sum((s ->> 'out')::numeric - (s ->> 'in')::numeric)
           from jsonb_array_elements(p.edl -> 'segments') s),
        0
      ) < 5
    ) = (p.flags ? 'piece_too_short')
    then 'match' else '*** MISMATCH ***'
  end as short_check,

  -- CHECK 2: does SQL agree about captions_overlap?
  case
    when exists (
      select 1
        from jsonb_array_elements(coalesce(p.edl -> 'captions', '[]'::jsonb))
               with ordinality a(v, i),
             jsonb_array_elements(coalesce(p.edl -> 'captions', '[]'::jsonb))
               with ordinality b(v, j)
       where i < j
         and least((a.v ->> 't1')::numeric, (b.v ->> 't1')::numeric)
           - greatest((a.v ->> 't0')::numeric, (b.v ->> 't0')::numeric) > 0.01
    ) = (p.flags ? 'captions_overlap')
    then 'match' else '*** MISMATCH ***'
  end as overlap_check

from content_pieces p
where p.session_id = (select session_id from jobs order by created_at desc limit 1)
order by p.created_at;
