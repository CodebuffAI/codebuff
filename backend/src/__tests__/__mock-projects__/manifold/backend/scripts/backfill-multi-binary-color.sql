-- see isBinaryMulti in common/src/contract.ts
create temporary table
  multi_binary as
select
  id
from
  contracts
where
  mechanism = 'cpmm-multi-1'
  -- and created_time > millis_to_ts (1708574059795)
  and outcome_type != 'NUMBER'
  and jsonb_array_length(data -> 'answers') = 2
  and data ->> 'addAnswersMode' = 'DISABLED'
  and (data -> 'shouldAnswersSumToOne')::boolean = true;

update answers
set
  data = data || jsonb_build_object(
    'color',
    case
      when answers.index = 0 then '#4e46dc'
      when answers.index = 1 then '#e9a23b'
      else null
    end
  )
from
  multi_binary
where
  answers.contract_id = multi_binary.id
  and answers.data -> 'color' is null;

-- update the contract updated time to force them to get their answers denormalized
update contracts
set
  data = data || jsonb_build_object('lastUpdatedTime', ts_to_millis (now()))
from
  multi_binary
where
  contracts.id = multi_binary.id;

drop table multi_binary;
