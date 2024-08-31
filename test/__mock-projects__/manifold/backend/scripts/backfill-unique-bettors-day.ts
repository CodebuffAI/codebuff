import { runScript } from 'run-script'

runScript(async ({ pg }) => {
  await pg.none(`
-- Update each contract's data->'uniqueBettorCountDay' field
UPDATE contracts
SET data = jsonb_set(
    data,
    '{uniqueBettorCountDay}',
    to_jsonb(subquery.unique_bettors_count)::jsonb
)
FROM (
    SELECT 
        c.id as contract_id,
        COALESCE(COUNT(DISTINCT cb.user_id), 0)::numeric as unique_bettors_count
    FROM 
        contracts c
    LEFT JOIN 
        contract_bets cb ON c.id = cb.contract_id AND cb.created_time > now() - interval '1 day' AND cb.is_redemption = false
    GROUP BY 
        c.id
) subquery
WHERE 
    contracts.id = subquery.contract_id;
`)
})
