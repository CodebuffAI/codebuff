-- Add 'token' column to contracts table
alter table contracts
add column token text not null default 'MANA';

-- Add a check constraint to ensure token is either 'MANA' or 'CASH'
alter table contracts
add constraint contracts_token_check check (token in ('MANA', 'CASH'));

-- Add 'cash_balance' column to users table
alter table users
add column cash_balance numeric not null default 0;

-- Update the check constraint for the token column in txns table
alter table txns
drop constraint if exists txns_token_check;

alter table txns
add constraint txns_token_check check (token in ('M$', 'CASH', 'SHARE', 'SPICE'));
