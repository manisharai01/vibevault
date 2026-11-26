-- ============================================================
-- VibeVault – live marketplace catalogue
--
-- Listings come from official marketplace APIs (Flipkart Affiliate,
-- eBay Browse) via the `refresh-catalog` and `live-item` Edge
-- Functions. Prices are recorded once per day so the app can show
-- real price history. Clients get read-only access; all writes go
-- through the Edge Functions with the service role.
-- ============================================================

-- ---- What to search for ----------------------------------------
create table public.search_queries (
  id bigint generated always as identity primary key,
  source text not null check (source in ('flipkart', 'ebay')),
  query text not null check (length(query) between 2 and 120),
  category text not null check (category in ('Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories', 'Bags')),
  style_archetype text not null check (style_archetype in (
    'Minimalist', 'Streetwear', 'Bohemian', 'Vintage', 'Athleisure',
    'Preppy', 'Grunge', 'Cottagecore', 'Dark Academia', 'Y2K')),
  max_results integer not null default 5 check (max_results between 1 and 10),
  enabled boolean not null default true,
  unique (source, query)
);

comment on table public.search_queries is
  'Searches run by refresh-catalog. Edit freely (Table Editor) to change what the app discovers.';

-- ---- Listings ---------------------------------------------------
create table public.listings (
  id text primary key,                         -- '<source>:<source_item_id>'
  source text not null check (source in ('flipkart', 'ebay')),
  source_item_id text not null,
  title text not null,
  description text,
  brand text,
  image_url text,
  product_url text not null,
  category text not null,
  style_archetypes text[] not null default '{}',
  condition text not null check (condition in ('New with tags', 'Like new', 'Good', 'Fair', 'Well-loved')),
  size text,
  colors text[] not null default '{}',
  seller text,
  region text not null check (region in ('India', 'Global')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  current_price numeric(12, 2) not null check (current_price >= 0),
  original_price numeric(12, 2) check (original_price is null or original_price >= 0),
  available boolean not null default true,
  listed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  unique (source, source_item_id)
);

create index listings_available_idx on public.listings (available, source);
create index listings_checked_idx on public.listings (source, last_checked_at) where available;

-- ---- Daily price history ----------------------------------------
create table public.price_points (
  listing_id text not null references public.listings (id) on delete cascade,
  observed_on date not null,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null,
  primary key (listing_id, observed_on)
);

-- ---- Exchange rates (ECB via frankfurter.dev) -------------------
create table public.fx_rates (
  base text not null,
  quote text not null,
  observed_on date not null,
  rate numeric(14, 6) not null check (rate > 0),
  primary key (base, quote, observed_on)
);

-- ---- Refresh log --------------------------------------------------
create table public.refresh_runs (
  id bigint generated always as identity primary key,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'error', 'skipped')),
  listings_checked integer not null default 0,
  listings_found integer not null default 0,
  listings_removed integer not null default 0,
  message text
);

create index refresh_runs_source_idx on public.refresh_runs (source, started_at desc);

-- ---- Read models for the app --------------------------------------
create view public.catalog_items with (security_invoker = true) as
select
  l.id, l.source, l.source_item_id, l.title, l.description, l.brand, l.image_url, l.product_url,
  l.category, l.style_archetypes, l.condition, l.size, l.colors, l.seller, l.region, l.currency,
  l.current_price, l.original_price, l.available, l.listed_at, l.first_seen_at, l.last_seen_at,
  l.last_checked_at,
  case when l.currency = 'INR' then 1::numeric else fx.rate end as inr_rate,
  coalesce(h.history, '[]'::json) as price_history
from public.listings l
left join lateral (
  select f.rate from public.fx_rates f
  where f.base = l.currency and f.quote = 'INR'
  order by f.observed_on desc
  limit 1
) fx on true
left join lateral (
  select json_agg(json_build_object('date', p.observed_on, 'price', p.price) order by p.observed_on) as history
  from public.price_points p
  where p.listing_id = l.id and p.observed_on >= current_date - 30
) h on true;

create view public.catalog_status with (security_invoker = true) as
select
  r.source,
  max(r.finished_at) filter (where r.status in ('ok', 'partial')) as last_success_at,
  (array_agg(r.status order by r.started_at desc))[1] as last_status,
  (array_agg(r.message order by r.started_at desc))[1] as last_message,
  (select count(*) from public.listings l where l.source = r.source and l.available) as available_listings
from public.refresh_runs r
group by r.source;

-- ---- Ingest (service role only) ------------------------------------
-- Upserts listings and records today's price for available ones.
-- Style tags are merged so an item found by several searches keeps all of them.
create or replace function public.ingest_listings(items jsonb, observed date default current_date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
begin
  insert into listings as l (
    id, source, source_item_id, title, description, brand, image_url, product_url, category,
    style_archetypes, condition, size, colors, seller, region, currency, current_price,
    original_price, available, listed_at, last_seen_at, last_checked_at
  )
  select
    x.id, x.source, x.source_item_id, x.title, x.description, x.brand, x.image_url, x.product_url,
    x.category, coalesce(x.style_archetypes, '{}'), x.condition, x.size, coalesce(x.colors, '{}'),
    x.seller, x.region, x.currency, x.current_price, x.original_price, x.available, x.listed_at,
    now(), now()
  from jsonb_to_recordset(items) as x(
    id text, source text, source_item_id text, title text, description text, brand text,
    image_url text, product_url text, category text, style_archetypes text[], condition text,
    size text, colors text[], seller text, region text, currency text, current_price numeric,
    original_price numeric, available boolean, listed_at timestamptz
  )
  on conflict (id) do update set
    title = excluded.title,
    description = coalesce(excluded.description, l.description),
    brand = coalesce(excluded.brand, l.brand),
    image_url = coalesce(excluded.image_url, l.image_url),
    product_url = excluded.product_url,
    style_archetypes = (
      select coalesce(array_agg(distinct s order by s), '{}')
      from unnest(l.style_archetypes || excluded.style_archetypes) as s
    ),
    condition = excluded.condition,
    size = coalesce(excluded.size, l.size),
    colors = case when cardinality(excluded.colors) > 0 then excluded.colors else l.colors end,
    seller = coalesce(excluded.seller, l.seller),
    currency = excluded.currency,
    current_price = excluded.current_price,
    original_price = excluded.original_price,
    available = excluded.available,
    listed_at = coalesce(l.listed_at, excluded.listed_at),
    last_seen_at = now(),
    last_checked_at = now();

  get diagnostics affected = row_count;

  insert into price_points (listing_id, observed_on, price, currency)
  select x.id, observed, x.current_price, x.currency
  from jsonb_to_recordset(items) as x(id text, current_price numeric, currency text, available boolean)
  where x.available
  on conflict (listing_id, observed_on) do update set price = excluded.price, currency = excluded.currency;

  return affected;
end;
$$;

-- ---- Access ---------------------------------------------------------
alter table public.search_queries enable row level security;
alter table public.listings enable row level security;
alter table public.price_points enable row level security;
alter table public.fx_rates enable row level security;
alter table public.refresh_runs enable row level security;

create policy "Anyone can read listings" on public.listings for select to anon, authenticated using (true);
create policy "Anyone can read price history" on public.price_points for select to anon, authenticated using (true);
create policy "Anyone can read exchange rates" on public.fx_rates for select to anon, authenticated using (true);
create policy "Anyone can read refresh status" on public.refresh_runs for select to anon, authenticated using (true);
-- search_queries: no policies, so only the service role can read or change it.

revoke all on public.search_queries from anon, authenticated;
revoke insert, update, delete, truncate on public.listings, public.price_points, public.fx_rates, public.refresh_runs from anon, authenticated;
grant select on public.listings, public.price_points, public.fx_rates, public.refresh_runs to anon, authenticated;
grant select on public.catalog_items, public.catalog_status to anon, authenticated;

revoke execute on function public.ingest_listings(jsonb, date) from public, anon, authenticated;
grant execute on function public.ingest_listings(jsonb, date) to service_role;

-- ---- Starting searches (one per style × category; edit any time) ----
insert into public.search_queries (source, query, category, style_archetype)
select s.source, q.query, q.category, q.style
from (values ('flipkart'), ('ebay')) as s(source)
cross join (values
  ('white oxford shirt', 'Tops', 'Minimalist'),
  ('beige chinos', 'Bottoms', 'Minimalist'),
  ('white leather sneakers', 'Shoes', 'Minimalist'),
  ('oversized graphic hoodie', 'Tops', 'Streetwear'),
  ('cargo pants', 'Bottoms', 'Streetwear'),
  ('bucket hat', 'Accessories', 'Streetwear'),
  ('floral maxi dress', 'Dresses', 'Bohemian'),
  ('peasant blouse', 'Tops', 'Bohemian'),
  ('fringe bag', 'Bags', 'Bohemian'),
  ('vintage denim jacket', 'Outerwear', 'Vintage'),
  ('high waist mom jeans', 'Bottoms', 'Vintage'),
  ('leather belt', 'Accessories', 'Vintage'),
  ('track jacket', 'Outerwear', 'Athleisure'),
  ('joggers', 'Bottoms', 'Athleisure'),
  ('running shoes', 'Shoes', 'Athleisure'),
  ('cable knit sweater', 'Tops', 'Preppy'),
  ('pleated skirt', 'Bottoms', 'Preppy'),
  ('loafers', 'Shoes', 'Preppy'),
  ('flannel shirt', 'Tops', 'Grunge'),
  ('ripped black jeans', 'Bottoms', 'Grunge'),
  ('combat boots', 'Shoes', 'Grunge'),
  ('puff sleeve dress', 'Dresses', 'Cottagecore'),
  ('knit cardigan', 'Outerwear', 'Cottagecore'),
  ('straw tote bag', 'Bags', 'Cottagecore'),
  ('wool blazer', 'Outerwear', 'Dark Academia'),
  ('turtleneck sweater', 'Tops', 'Dark Academia'),
  ('leather satchel', 'Bags', 'Dark Academia'),
  ('baby tee', 'Tops', 'Y2K'),
  ('flared jeans', 'Bottoms', 'Y2K'),
  ('platform sneakers', 'Shoes', 'Y2K')
) as q(query, category, style);
