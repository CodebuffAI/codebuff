-- Add cash_balance column to user_portfolio_history table
alter table user_portfolio_history
add column if not exists cash_investment_value numeric not null default 0,
add column if not exists total_cash_deposits numeric not null default 0,
add column if not exists cash_balance numeric not null default 0;

-- Add cash_balance column to user_portfolio_history_latest table
alter table user_portfolio_history_latest
add column if not exists cash_investment_value numeric not null default 0.0,
add column if not exists total_cash_deposits numeric not null default 0.0,
add column if not exists cash_balance numeric not null default 0.0;

alter table users
add column if not exists cash_balance numeric not null default 0,
add column if not exists total_cash_deposits numeric not null default 0;

-- Functions
create
or replace function public.update_user_portfolio_history_latest () returns trigger language plpgsql as $function$
begin
    insert into user_portfolio_history_latest (user_id, ts, investment_value, cash_investment_value, balance, total_deposits, total_cash_deposits, cash_balance, spice_balance, loan_total, profit, last_calculated)
    values (new.user_id, new.ts, new.investment_value, new.cash_investment_value, new.balance, new.total_deposits, new.total_cash_deposits, new.cash_balance, new.spice_balance, new.loan_total, new.profit, new.ts)
    on conflict (user_id) do update
        set ts = excluded.ts,
            investment_value = excluded.investment_value,
            cash_investment_value = excluded.cash_investment_value,
            total_deposits = excluded.total_deposits,
            total_cash_deposits = excluded.total_cash_deposits,
            balance = excluded.balance,
            cash_balance = excluded.cash_balance,
            spice_balance = excluded.spice_balance,
            loan_total = excluded.loan_total,
            profit = excluded.profit,
            last_calculated = excluded.ts
    where user_portfolio_history_latest.ts < excluded.ts;
    return new;
end;
$function$;
