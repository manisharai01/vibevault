-- ============================================================
-- VibeVault – schedule the refresh and the price model
--
-- Run once in the Supabase SQL editor AFTER deploying the functions.
-- Replace the two placeholders first:
--   <PROJECT_REF>          your project ref (Project Settings → General)
--   <REFRESH_CRON_SECRET>  the same value you set with `supabase secrets set REFRESH_CRON_SECRET=...`
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'vibevault_project_url');
select vault.create_secret('<REFRESH_CRON_SECRET>', 'vibevault_refresh_secret');

-- Jobs from the first version (one per marketplace), if you scheduled them.
select cron.unschedule(jobname) from cron.job where jobname in ('vibevault-refresh-flipkart', 'vibevault-refresh-ebay');

-- Every 10 minutes: exchange rates when due, then the most overdue marketplace + country and
-- the most overdue coupon feed. Each marketplace + country is refreshed every few hours
-- (marketplace_markets.hours_between_runs), so every call stays well inside the time limit.
select cron.schedule(
  'vibevault-refresh',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'vibevault_project_url')
           || '/functions/v1/refresh-catalog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vibevault_refresh_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- Daily at 23:40 UTC: score old predictions, relearn from every recorded outcome and publish
-- today's predictions (runs inside the database; no function call needed).
select cron.schedule('vibevault-price-model', '40 23 * * *', $$ select public.run_price_model(current_date); $$);

-- Check the jobs:     select * from cron.job;
-- Recent refreshes:   select * from public.refresh_runs order by started_at desc limit 20;
-- Model runs:         select * from public.model_runs order by started_at desc limit 5;
-- Track record:       select * from public.prediction_track_record;
-- Remove a job:       select cron.unschedule('vibevault-refresh');
