-- ============================================================
-- VibeVault – when to buy: yearly price patterns and announced sales
--
--  • season_profiles: how prices move through the calendar year,
--    learnt from recorded and archived (e.g. Keepa) daily prices.
--    For each listing with about a year of history, each month's
--    median price is divided by the listing's own median; those
--    ratios are pooled (median) per marketplace + country + category
--    and per marketplace + country. The app uses the most specific
--    pattern available and only when enough listings stand behind it.
--  • upcoming_offers: sales a store has announced in its official
--    feed that start within 90 days (the app shows them as "sale
--    starts on …"; they become coupons once they start).
-- Builds on 20261127000000_global_catalog.sql.
-- ============================================================

create table public.season_profiles (
  level text not null check (level in ('listing', 'category', 'marketplace')),
  -- listing id, 'source|market|category' or 'source|market'
  key text not null,
  month smallint not null check (month between 1 and 12),
  -- median price in this month / yearly median price (0.85 = 15% cheaper than usual)
  ratio numeric(6, 4) not null check (ratio > 0),
  -- listings behind the ratio (1 for a listing's own pattern)
  listings integer not null check (listings > 0),
  -- years of price history behind it (median across the listings)
  years numeric(5, 2) not null,
  computed_on date not null,
  primary key (level, key, month)
);

comment on table public.season_profiles is
  'Yearly price patterns learnt from price_points (see compute_seasonality); read through catalog_items.season.';

-- Recomputes every pattern from the last three years of daily prices.
create or replace function public.compute_seasonality(p_asof date default current_date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  n_listing integer;
  n_category integer;
  n_marketplace integer;
begin
  drop table if exists tmp_season;
  create temporary table tmp_season on commit drop as
  with spans as (
    select p.listing_id,
           max(p.observed_on) - min(p.observed_on) as span_days,
           percentile_cont(0.5) within group (order by p.price) as median_price
    from price_points p
    where p.observed_on > p_asof - 1096 and p.observed_on <= p_asof
    group by p.listing_id
    -- about a year of near-daily prices
    having max(p.observed_on) - min(p.observed_on) >= 330 and count(*) >= 200
  )
  select s.listing_id, l.source, l.market, l.category,
         extract(month from p.observed_on)::smallint as month,
         (percentile_cont(0.5) within group (order by p.price) / s.median_price)::numeric as ratio,
         (s.span_days / 365.25)::numeric as years
  from spans s
  join listings l on l.id = s.listing_id
  join price_points p on p.listing_id = s.listing_id and p.observed_on > p_asof - 1096 and p.observed_on <= p_asof
  where s.median_price > 0
  group by s.listing_id, l.source, l.market, l.category, extract(month from p.observed_on), s.median_price, s.span_days
  -- a month needs a week of prices to say anything about it
  having count(*) >= 7;

  delete from season_profiles;

  insert into season_profiles (level, key, month, ratio, listings, years, computed_on)
  select 'listing', listing_id, month, round(ratio, 4), 1, round(years, 2), p_asof
  from tmp_season;
  get diagnostics n_listing = row_count;

  insert into season_profiles (level, key, month, ratio, listings, years, computed_on)
  select 'category', concat_ws('|', source, market, category), month,
         round(percentile_cont(0.5) within group (order by ratio)::numeric, 4), count(*),
         round(percentile_cont(0.5) within group (order by years)::numeric, 2), p_asof
  from tmp_season
  group by source, market, category, month
  having count(*) >= 10;
  get diagnostics n_category = row_count;

  insert into season_profiles (level, key, month, ratio, listings, years, computed_on)
  select 'marketplace', concat_ws('|', source, market), month,
         round(percentile_cont(0.5) within group (order by ratio)::numeric, 4), count(*),
         round(percentile_cont(0.5) within group (order by years)::numeric, 2), p_asof
  from tmp_season
  group by source, market, month
  having count(*) >= 20;
  get diagnostics n_marketplace = row_count;

  return jsonb_build_object('listing_months', n_listing, 'category_months', n_category, 'marketplace_months', n_marketplace);
end;
$$;

-- Sales announced ahead of time: still listed by the feed in the last 26 hours, starting within 90 days.
create view public.upcoming_offers with (security_invoker = true) as
select o.id, o.network, o.market, o.merchant, o.merchant_domain, o.source, o.listing_id, o.title,
       o.description, o.code, o.url, o.discount_text, o.min_spend, o.currency, o.starts_at, o.ends_at,
       o.categories, o.image_url, o.last_seen_at
from public.offers o
where o.active
  and o.last_seen_at > now() - interval '26 hours'
  and o.starts_at > now()
  and o.starts_at <= now() + interval '90 days'
  and (o.ends_at is null or o.ends_at > o.starts_at);

-- catalog_items gains `season`: the most specific yearly pattern for the listing (or null).
create or replace view public.catalog_items with (security_invoker = true) as
select
  l.id, l.source, m.name as source_name, m.kind as source_kind, coalesce(mm.site_name, m.name) as site_name,
  l.market, l.source_item_id, l.title, l.description, l.brand, l.image_url, l.product_url,
  l.category, l.department, l.style_archetypes, l.condition, l.size, l.colors, l.seller, l.currency,
  l.current_price, l.original_price, l.available, l.listed_at, l.first_seen_at, l.last_seen_at,
  l.last_checked_at, l.ended_on, l.end_reason,
  coalesce(h.history, '[]'::json) as price_history,
  st.stats,
  pr.prediction,
  se.season
from public.listings l
join public.marketplaces m on m.id = l.source
left join public.marketplace_markets mm on mm.source = l.source and mm.market = l.market
left join lateral (
  select json_agg(json_build_object('date', p.observed_on, 'price', p.price) order by p.observed_on) as history
  from public.price_points p
  where p.listing_id = l.id and p.observed_on >= current_date - 30
) h on true
left join lateral (
  select json_build_object(
    'days', count(*),
    'since', min(p.observed_on),
    'lowest', min(p.price),
    'lowest_on', (array_agg(p.observed_on order by p.price, p.observed_on desc))[1],
    'highest', max(p.price),
    'median', percentile_cont(0.5) within group (order by p.price)
  ) as stats
  from public.price_points p
  where p.listing_id = l.id
) st on true
left join lateral (
  select json_build_object(
    'made_on', x.made_on,
    'price', x.price,
    'horizons', json_object_agg(x.horizon_days, json_build_object(
      'p_drop', x.p_drop, 'p_gone', x.p_gone, 'expected_low', x.expected_low,
      'basis', x.basis, 'basis_listings', x.basis_listings, 'verdict', x.verdict))
  ) as prediction
  from public.price_predictions x
  where x.listing_id = l.id
    and x.made_on = (select max(y.made_on) from public.price_predictions y where y.listing_id = l.id)
  group by x.made_on, x.price
) pr on true
left join lateral (
  select json_build_object(
    'basis', sp.level,
    'listings', min(sp.listings),
    'years', min(sp.years),
    'months', json_object_agg(sp.month, sp.ratio)
  ) as season
  from public.season_profiles sp
  where (sp.level, sp.key) = (
    select s2.level, s2.key
    from public.season_profiles s2
    where (s2.level = 'listing' and s2.key = l.id)
       or (s2.level = 'category' and s2.key = concat_ws('|', l.source, l.market, l.category))
       or (s2.level = 'marketplace' and s2.key = concat_ws('|', l.source, l.market))
    order by case s2.level when 'listing' then 0 when 'category' then 1 else 2 end
    limit 1
  )
  group by sp.level
) se on true;

-- ---- Access ----
alter table public.season_profiles enable row level security;
create policy "Anyone can read season profiles" on public.season_profiles for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.season_profiles from anon, authenticated;
grant select on public.season_profiles, public.upcoming_offers, public.catalog_items to anon, authenticated;

revoke execute on function public.compute_seasonality(date) from public, anon, authenticated;
grant execute on function public.compute_seasonality(date) to service_role;
