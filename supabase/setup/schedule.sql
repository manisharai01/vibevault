-- ============================================================
-- VibeVault – schedule the daily catalogue refresh
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

-- One job per marketplace keeps each run well inside the Edge Function time limit.
select cron.schedule(
  'vibevault-refresh-flipkart',
  '30 0 * * *', -- 00:30 UTC (06:00 IST) every day
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'vibevault_project_url')
           || '/functions/v1/refresh-catalog?source=flipkart',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vibevault_refresh_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

select cron.schedule(
  'vibevault-refresh-ebay',
  '45 0 * * *', -- 00:45 UTC
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'vibevault_project_url')
           || '/functions/v1/refresh-catalog?source=ebay',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vibevault_refresh_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- Check the jobs:   select * from cron.job;
-- Recent results:   select * from public.refresh_runs order by started_at desc limit 10;
-- Remove a job:     select cron.unschedule('vibevault-refresh-ebay');
