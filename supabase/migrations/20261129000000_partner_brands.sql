-- Brand stores from impact.com: the product catalogs of brands that approved the app's partner
-- account (supabase/functions/_shared/providers/impact.ts). Listings are shown under each
-- brand's name and link through the partner's tracking URL. Catalog items don't list delivery
-- countries, so each country gets the items priced in its own currency.

insert into public.marketplaces (id, name, kind, api, website, attribution) values
  ('impact', 'Brand stores', 'retail', 'impact.com Partner API (catalogs)', 'https://impact.com', null)
on conflict (id) do nothing;

insert into public.marketplace_markets (source, market, site_name, domain, currency, language)
select 'impact', m.market, 'Brand stores', 'impact.com', m.currency, 'en'
from (values
  ('US', 'USD'), ('GB', 'GBP'), ('CA', 'CAD'), ('AU', 'AUD'), ('NZ', 'NZD'), ('IN', 'INR'),
  ('DE', 'EUR'), ('FR', 'EUR'), ('IT', 'EUR'), ('ES', 'EUR'), ('NL', 'EUR'), ('IE', 'EUR'),
  ('SG', 'SGD'), ('AE', 'AED'), ('JP', 'JPY')
) as m(market, currency)
on conflict (source, market) do nothing;
