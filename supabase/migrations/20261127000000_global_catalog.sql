-- ============================================================
-- VibeVault – global marketplaces, coupons and price predictions
--
--  • Listings from many marketplaces, each offered to shoppers in a
--    country ("market"); ids become '<source>:<market>:<item id>'.
--  • Search terms per department, translated for each market.
--  • Coupons/offers from official merchant and affiliate-network feeds,
--    shown only while the feed still lists them and they're in date.
--  • "Will it get cheaper?" predictions learnt from what actually
--    happened to tracked prices, each one scored afterwards so the app
--    can show the model's real track record.
-- Builds on 20261126000000_live_catalog.sql.
-- ============================================================

drop view if exists public.catalog_items;
drop view if exists public.catalog_status;

-- ---- Marketplaces ------------------------------------------------------
create table public.marketplaces (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null,
  kind text not null check (kind in ('retail', 'mixed', 'handmade', 'comparison')),
  api text not null,
  website text not null,
  -- Notice the marketplace's API terms require apps to display, if any.
  attribution text
);

-- Shopper countries each marketplace serves, and how often to refresh them.
create table public.marketplace_markets (
  source text not null references public.marketplaces (id) on delete cascade,
  market text not null check (market ~ '^[A-Z]{2}$'),
  site_name text not null,
  domain text not null,
  currency text check (currency ~ '^[A-Z]{3}$'),
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  enabled boolean not null default true,
  searches_per_run integer not null default 12 check (searches_per_run between 0 and 100),
  lookups_per_run integer not null default 150 check (lookups_per_run between 0 and 2000),
  hours_between_runs integer not null default 4 check (hours_between_runs between 1 and 168),
  last_run_at timestamptz,
  primary key (source, market)
);

insert into public.marketplaces (id, name, kind, api, website, attribution) values
  ('flipkart', 'Flipkart', 'retail', 'Flipkart Affiliate API', 'https://www.flipkart.com', null),
  ('amazon', 'Amazon', 'retail', 'Amazon Creators API', 'https://www.amazon.com',
   'As an Amazon Associate, VibeVault earns from qualifying purchases.'),
  ('ebay', 'eBay', 'mixed', 'eBay Browse API', 'https://www.ebay.com', null),
  ('etsy', 'Etsy', 'handmade', 'Etsy Open API v3', 'https://www.etsy.com',
   'The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.'),
  ('aliexpress', 'AliExpress', 'retail', 'AliExpress Affiliate API', 'https://www.aliexpress.com', null),
  ('google_shopping', 'Google Shopping', 'comparison', 'Google Shopping results via SerpApi', 'https://shopping.google.com', null);

insert into public.marketplace_markets (source, market, site_name, domain, currency, language) values
  ('flipkart', 'IN', 'Flipkart', 'flipkart.com', 'INR', 'en'),
  ('amazon', 'IN', 'Amazon.in', 'amazon.in', 'INR', 'en'),
  ('amazon', 'US', 'Amazon.com', 'amazon.com', 'USD', 'en'),
  ('amazon', 'GB', 'Amazon.co.uk', 'amazon.co.uk', 'GBP', 'en'),
  ('amazon', 'DE', 'Amazon.de', 'amazon.de', 'EUR', 'de'),
  ('amazon', 'FR', 'Amazon.fr', 'amazon.fr', 'EUR', 'fr'),
  ('amazon', 'IT', 'Amazon.it', 'amazon.it', 'EUR', 'it'),
  ('amazon', 'ES', 'Amazon.es', 'amazon.es', 'EUR', 'es'),
  ('amazon', 'CA', 'Amazon.ca', 'amazon.ca', 'CAD', 'en'),
  ('amazon', 'JP', 'Amazon.co.jp', 'amazon.co.jp', 'JPY', 'ja'),
  ('amazon', 'AU', 'Amazon.com.au', 'amazon.com.au', 'AUD', 'en'),
  ('amazon', 'BR', 'Amazon.com.br', 'amazon.com.br', 'BRL', 'pt'),
  ('amazon', 'MX', 'Amazon.com.mx', 'amazon.com.mx', 'MXN', 'es'),
  ('amazon', 'AE', 'Amazon.ae', 'amazon.ae', 'AED', 'en'),
  ('amazon', 'SG', 'Amazon.sg', 'amazon.sg', 'SGD', 'en'),
  ('amazon', 'NL', 'Amazon.nl', 'amazon.nl', 'EUR', 'nl'),
  ('amazon', 'SE', 'Amazon.se', 'amazon.se', 'SEK', 'sv'),
  ('amazon', 'PL', 'Amazon.pl', 'amazon.pl', 'PLN', 'pl'),
  ('amazon', 'TR', 'Amazon.com.tr', 'amazon.com.tr', 'TRY', 'tr'),
  ('amazon', 'SA', 'Amazon.sa', 'amazon.sa', 'SAR', 'en'),
  ('amazon', 'BE', 'Amazon.com.be', 'amazon.com.be', 'EUR', 'fr'),
  ('amazon', 'EG', 'Amazon.eg', 'amazon.eg', 'EGP', 'en'),
  ('amazon', 'IE', 'Amazon.ie', 'amazon.ie', 'EUR', 'en'),
  ('ebay', 'IN', 'eBay (ships to India)', 'ebay.com', 'USD', 'en'),
  ('ebay', 'US', 'eBay', 'ebay.com', 'USD', 'en'),
  ('ebay', 'GB', 'eBay UK', 'ebay.co.uk', 'GBP', 'en'),
  ('ebay', 'DE', 'eBay.de', 'ebay.de', 'EUR', 'de'),
  ('ebay', 'FR', 'eBay.fr', 'ebay.fr', 'EUR', 'fr'),
  ('ebay', 'IT', 'eBay.it', 'ebay.it', 'EUR', 'it'),
  ('ebay', 'ES', 'eBay.es', 'ebay.es', 'EUR', 'es'),
  ('ebay', 'AU', 'eBay Australia', 'ebay.com.au', 'AUD', 'en'),
  ('ebay', 'CA', 'eBay Canada', 'ebay.ca', 'CAD', 'en'),
  ('etsy', 'US', 'Etsy', 'etsy.com', null, 'en'),
  ('etsy', 'GB', 'Etsy', 'etsy.com', null, 'en'),
  ('etsy', 'CA', 'Etsy', 'etsy.com', null, 'en'),
  ('etsy', 'AU', 'Etsy', 'etsy.com', null, 'en'),
  ('etsy', 'DE', 'Etsy', 'etsy.com', null, 'en'),
  ('etsy', 'FR', 'Etsy', 'etsy.com', null, 'en'),
  ('etsy', 'IN', 'Etsy', 'etsy.com', null, 'en');

-- Amazon's new API keys are limited to one call a second: fewer searches per run (lookups go 10 per call).
update public.marketplace_markets set searches_per_run = 8, lookups_per_run = 120 where source = 'amazon';

-- AliExpress ships almost everywhere; English search with local currencies.
insert into public.marketplace_markets (source, market, site_name, domain, currency, language)
select 'aliexpress', m.market, 'AliExpress', 'aliexpress.com', m.currency, 'en'
from (values
  ('IN', 'INR'), ('US', 'USD'), ('GB', 'GBP'), ('DE', 'EUR'), ('FR', 'EUR'), ('ES', 'EUR'), ('IT', 'EUR'),
  ('NL', 'EUR'), ('PL', 'PLN'), ('AU', 'AUD'), ('CA', 'CAD'), ('BR', 'BRL'), ('MX', 'MXN'), ('JP', 'JPY'),
  ('KR', 'KRW'), ('AE', 'AED'), ('SA', 'SAR'), ('SG', 'SGD')
) as m(market, currency);

-- Google Shopping (via SerpApi) bills per search, so it runs once a day with fewer searches.
insert into public.marketplace_markets (source, market, site_name, domain, currency, language, searches_per_run, hours_between_runs)
select 'google_shopping', m.market, 'Google Shopping', 'google.com', m.currency, m.language, 6, 24
from (values
  ('IN', 'INR', 'en'), ('US', 'USD', 'en'), ('GB', 'GBP', 'en'), ('DE', 'EUR', 'de'), ('FR', 'EUR', 'fr'),
  ('IT', 'EUR', 'it'), ('ES', 'EUR', 'es'), ('CA', 'CAD', 'en'), ('AU', 'AUD', 'en'), ('JP', 'JPY', 'ja'),
  ('BR', 'BRL', 'pt'), ('MX', 'MXN', 'es'), ('AE', 'AED', 'en'), ('SG', 'SGD', 'en'), ('NL', 'EUR', 'nl'),
  ('IE', 'EUR', 'en'), ('NZ', 'NZD', 'en'), ('SA', 'SAR', 'en'), ('ZA', 'ZAR', 'en')
) as m(market, currency, language);

-- ---- Listings: market, department, how they ended ---------------------
alter table public.listings drop constraint if exists listings_source_check;
alter table public.listings drop constraint if exists listings_region_check;
alter table public.listings drop constraint if exists listings_condition_check;
alter table public.listings drop constraint if exists listings_source_source_item_id_key;
alter table public.price_points drop constraint if exists price_points_listing_id_fkey;

-- Every listing so far was offered to shoppers in India.
alter table public.listings add column market text not null default 'IN' check (market ~ '^[A-Z]{2}$');
alter table public.listings alter column market drop default;
alter table public.listings add column department text not null default 'unisex' check (department in ('women', 'men', 'unisex'));
alter table public.listings add column ended_on date;
alter table public.listings add column end_reason text check (end_reason in ('gone', 'stale'));
alter table public.listings drop column region;
alter table public.listings add constraint listings_condition_check
  check (condition in ('New with tags', 'Like new', 'Good', 'Fair', 'Well-loved', 'Pre-owned'));

update public.price_points set listing_id = regexp_replace(listing_id, '^([a-z_]+):', '\1:IN:');
update public.listings set id = source || ':' || market || ':' || source_item_id;
update public.listings set ended_on = last_checked_at::date, end_reason = 'gone' where not available;

alter table public.listings add constraint listings_source_market_item_key unique (source, market, source_item_id);
alter table public.listings add constraint listings_source_fkey foreign key (source) references public.marketplaces (id);
alter table public.price_points add constraint price_points_listing_id_fkey
  foreign key (listing_id) references public.listings (id) on delete cascade on update cascade;

drop index if exists public.listings_available_idx;
create index listings_available_idx on public.listings (available, market, source);

-- 'observed' = recorded by VibeVault; 'archive' = imported from a price-history archive (e.g. Keepa).
alter table public.price_points add column origin text not null default 'observed' check (origin in ('observed', 'archive'));

-- ---- Search terms (replace search_queries) ------------------------------
drop table public.search_queries;

create table public.search_terms (
  id bigint generated always as identity primary key,
  query text not null check (length(query) between 2 and 120),
  -- Same search in other languages: {"de": "...", "ja": "..."}; English is used otherwise.
  translations jsonb not null default '{}'::jsonb,
  category text not null check (category in ('Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories', 'Bags')),
  department text not null check (department in ('women', 'men', 'unisex')),
  style_archetype text check (style_archetype is null or style_archetype in (
    'Minimalist', 'Streetwear', 'Bohemian', 'Vintage', 'Athleisure',
    'Preppy', 'Grunge', 'Cottagecore', 'Dark Academia', 'Y2K')),
  -- Only search in these markets (null = everywhere).
  markets text[],
  enabled boolean not null default true,
  unique (query, department)
);

comment on table public.search_terms is
  'What refresh-catalog searches for. Edit freely (Table Editor) to change what the app discovers.';

create table public.search_runs (
  term_id bigint not null references public.search_terms (id) on delete cascade,
  source text not null,
  market text not null,
  last_run_at timestamptz not null,
  results integer not null default 0,
  primary key (term_id, source, market)
);

insert into public.search_terms (query, category, department, style_archetype, markets, translations) values
  ('women white linen shirt', 'Tops', 'women', 'Minimalist', null, '{"de":"Damen weißes Leinenhemd","fr":"chemise en lin blanche femme","it":"camicia di lino bianca donna","es":"camisa de lino blanca mujer","pt":"camisa de linho branca feminina","ja":"レディース 白 リネンシャツ","ko":"여성 화이트 린넨 셔츠"}'),
  ('women straight leg trousers', 'Bottoms', 'women', 'Minimalist', null, '{"de":"Damen Hose gerades Bein","fr":"pantalon droit femme","it":"pantaloni dritti donna","es":"pantalón recto mujer","pt":"calça reta feminina","ja":"レディース ストレートパンツ","ko":"여성 스트레이트 팬츠"}'),
  ('slip dress', 'Dresses', 'women', 'Minimalist', null, '{"de":"Slipdress Kleid","fr":"robe nuisette","it":"abito sottoveste","es":"vestido lencero","pt":"vestido slip","ja":"スリップドレス","ko":"슬립 원피스"}'),
  ('women tote bag', 'Bags', 'women', 'Minimalist', null, '{"de":"Damen Shopper Tasche","fr":"sac cabas femme","it":"borsa shopper donna","es":"bolso tote mujer","pt":"bolsa tote feminina","ja":"レディース トートバッグ","ko":"여성 토트백"}'),
  ('women oversized graphic hoodie', 'Tops', 'women', 'Streetwear', null, '{"de":"Damen Oversize Hoodie mit Print","fr":"sweat à capuche oversize imprimé femme","it":"felpa con cappuccio oversize stampa donna","es":"sudadera con capucha oversize estampada mujer","pt":"moletom oversized estampado feminino","ja":"レディース オーバーサイズ パーカー","ko":"여성 오버핏 후드티"}'),
  ('women cargo pants', 'Bottoms', 'women', 'Streetwear', null, '{"de":"Damen Cargohose","fr":"pantalon cargo femme","it":"pantaloni cargo donna","es":"pantalón cargo mujer","pt":"calça cargo feminina","ja":"レディース カーゴパンツ","ko":"여성 카고 팬츠"}'),
  ('floral maxi dress', 'Dresses', 'women', 'Bohemian', null, '{"de":"geblümtes Maxikleid","fr":"robe longue fleurie","it":"abito lungo floreale","es":"vestido largo de flores","pt":"vestido longo floral","ja":"花柄 マキシワンピース","ko":"플라워 맥시 원피스"}'),
  ('women peasant blouse', 'Tops', 'women', 'Bohemian', null, '{"de":"Damen Bauernbluse","fr":"blouse bohème femme","it":"blusa stile boho donna","es":"blusa campesina mujer","pt":"blusa camponesa feminina","ja":"レディース ペザントブラウス","ko":"여성 페전트 블라우스"}'),
  ('fringe crossbody bag', 'Bags', 'women', 'Bohemian', null, '{"de":"Umhängetasche mit Fransen","fr":"sac bandoulière à franges","it":"borsa a tracolla con frange","es":"bolso bandolera con flecos","pt":"bolsa transversal com franjas","ja":"フリンジ ショルダーバッグ","ko":"프린지 크로스백"}'),
  ('women high waist mom jeans', 'Bottoms', 'women', 'Vintage', null, '{"de":"Damen Mom Jeans hohe Taille","fr":"jean mom taille haute femme","it":"jeans mom vita alta donna","es":"jeans mom tiro alto mujer","pt":"calça jeans mom cintura alta","ja":"レディース ハイウエスト マムジーンズ","ko":"여성 하이웨스트 맘진"}'),
  ('polka dot dress', 'Dresses', 'women', 'Vintage', null, '{"de":"gepunktetes Kleid","fr":"robe à pois","it":"vestito a pois","es":"vestido de lunares","pt":"vestido de bolinhas","ja":"ドット柄 ワンピース","ko":"도트 원피스"}'),
  ('women denim jacket', 'Outerwear', 'women', 'Vintage', null, '{"de":"Damen Jeansjacke","fr":"veste en jean femme","it":"giacca di jeans donna","es":"chaqueta vaquera mujer","pt":"jaqueta jeans feminina","ja":"レディース デニムジャケット","ko":"여성 청자켓"}'),
  ('women joggers', 'Bottoms', 'women', 'Athleisure', null, '{"de":"Damen Jogginghose","fr":"jogging femme","it":"pantaloni jogger donna","es":"joggers mujer","pt":"calça jogger feminina","ja":"レディース ジョガーパンツ","ko":"여성 조거팬츠"}'),
  ('women yoga leggings', 'Bottoms', 'women', 'Athleisure', null, '{"de":"Damen Yoga Leggings","fr":"legging de yoga femme","it":"leggings yoga donna","es":"leggings de yoga mujer","pt":"legging de yoga feminina","ja":"レディース ヨガレギンス","ko":"여성 요가 레깅스"}'),
  ('women cable knit sweater', 'Tops', 'women', 'Preppy', null, '{"de":"Damen Zopfstrickpullover","fr":"pull torsadé femme","it":"maglione a trecce donna","es":"jersey de ochos mujer","pt":"suéter tricô trança feminino","ja":"レディース ケーブルニット セーター","ko":"여성 꽈배기 니트"}'),
  ('pleated skirt', 'Bottoms', 'women', 'Preppy', null, '{"de":"Faltenrock","fr":"jupe plissée","it":"gonna a pieghe","es":"falda plisada","pt":"saia plissada","ja":"プリーツスカート","ko":"플리츠 스커트"}'),
  ('women ripped black jeans', 'Bottoms', 'women', 'Grunge', null, '{"de":"Damen schwarze Jeans zerrissen","fr":"jean noir déchiré femme","it":"jeans neri strappati donna","es":"jeans negros rotos mujer","pt":"calça jeans preta rasgada feminina","ja":"レディース ブラック ダメージジーンズ","ko":"여성 블랙 찢어진 청바지"}'),
  ('puff sleeve dress', 'Dresses', 'women', 'Cottagecore', null, '{"de":"Kleid mit Puffärmeln","fr":"robe manches bouffantes","it":"vestito maniche a sbuffo","es":"vestido de manga abullonada","pt":"vestido manga bufante","ja":"パフスリーブ ワンピース","ko":"퍼프소매 원피스"}'),
  ('women knit cardigan', 'Outerwear', 'women', 'Cottagecore', null, '{"de":"Damen Strickjacke","fr":"cardigan en maille femme","it":"cardigan in maglia donna","es":"cárdigan de punto mujer","pt":"cardigã de tricô feminino","ja":"レディース ニットカーディガン","ko":"여성 니트 가디건"}'),
  ('straw tote bag', 'Bags', 'women', 'Cottagecore', null, '{"de":"Strohtasche","fr":"sac cabas en paille","it":"borsa di paglia","es":"bolso de paja","pt":"bolsa de palha","ja":"かごバッグ","ko":"라탄 토트백"}'),
  ('women wool blazer', 'Outerwear', 'women', 'Dark Academia', null, '{"de":"Damen Wollblazer","fr":"blazer en laine femme","it":"blazer in lana donna","es":"blazer de lana mujer","pt":"blazer de lã feminino","ja":"レディース ウール ジャケット","ko":"여성 울 블레이저"}'),
  ('women turtleneck sweater', 'Tops', 'women', 'Dark Academia', null, '{"de":"Damen Rollkragenpullover","fr":"pull col roulé femme","it":"dolcevita donna","es":"jersey de cuello alto mujer","pt":"suéter gola alta feminino","ja":"レディース タートルネック ニット","ko":"여성 터틀넥 니트"}'),
  ('women trench coat', 'Outerwear', 'women', 'Dark Academia', null, '{"de":"Damen Trenchcoat","fr":"trench femme","it":"trench donna","es":"gabardina mujer","pt":"trench coat feminino","ja":"レディース トレンチコート","ko":"여성 트렌치코트"}'),
  ('baby tee', 'Tops', 'women', 'Y2K', null, '{"ja":"ベビーT","ko":"베이비 티"}'),
  ('women flared jeans', 'Bottoms', 'women', 'Y2K', null, '{"de":"Damen Schlaghose Jeans","fr":"jean évasé femme","it":"jeans a zampa donna","es":"jeans acampanados mujer","pt":"calça jeans flare feminina","ja":"レディース フレアジーンズ","ko":"여성 부츠컷 청바지"}'),
  ('platform sneakers', 'Shoes', 'women', 'Y2K', null, '{"de":"Plateau Sneaker","fr":"baskets à plateforme","it":"sneakers con plateau","es":"zapatillas con plataforma","pt":"tênis plataforma","ja":"厚底スニーカー","ko":"통굽 스니커즈"}'),
  ('women ankle boots', 'Shoes', 'women', null, null, '{"de":"Damen Stiefeletten","fr":"bottines femme","it":"stivaletti donna","es":"botines mujer","pt":"bota cano curto feminina","ja":"レディース ショートブーツ","ko":"여성 앵클부츠"}'),
  ('women sandals', 'Shoes', 'women', null, null, '{"de":"Damen Sandalen","fr":"sandales femme","it":"sandali donna","es":"sandalias mujer","pt":"sandália feminina","ja":"レディース サンダル","ko":"여성 샌들"}'),
  ('women midi skirt', 'Bottoms', 'women', null, null, '{"de":"Damen Midirock","fr":"jupe midi femme","it":"gonna midi donna","es":"falda midi mujer","pt":"saia midi feminina","ja":"レディース ミディスカート","ko":"여성 미디 스커트"}'),
  ('women kurta set', 'Dresses', 'women', null, '{IN}', '{}'),
  ('saree', 'Dresses', 'women', null, '{IN}', '{}'),
  ('men white oxford shirt', 'Tops', 'men', 'Minimalist', null, '{"de":"Herren weißes Oxford Hemd","fr":"chemise oxford blanche homme","it":"camicia oxford bianca uomo","es":"camisa oxford blanca hombre","pt":"camisa oxford branca masculina","ja":"メンズ 白 オックスフォードシャツ","ko":"남성 화이트 옥스포드 셔츠"}'),
  ('men slim chinos', 'Bottoms', 'men', 'Minimalist', null, '{"de":"Herren Chino Slim","fr":"chino slim homme","it":"chino slim uomo","es":"chinos slim hombre","pt":"calça chino slim masculina","ja":"メンズ スリム チノパン","ko":"남성 슬림 치노팬츠"}'),
  ('men oversized graphic t-shirt', 'Tops', 'men', 'Streetwear', null, '{"de":"Herren Oversize T-Shirt Print","fr":"t-shirt oversize imprimé homme","it":"t-shirt oversize stampa uomo","es":"camiseta oversize estampada hombre","pt":"camiseta oversized estampada masculina","ja":"メンズ オーバーサイズ プリントTシャツ","ko":"남성 오버핏 그래픽 티셔츠"}'),
  ('men cargo pants', 'Bottoms', 'men', 'Streetwear', null, '{"de":"Herren Cargohose","fr":"pantalon cargo homme","it":"pantaloni cargo uomo","es":"pantalón cargo hombre","pt":"calça cargo masculina","ja":"メンズ カーゴパンツ","ko":"남성 카고 팬츠"}'),
  ('men bomber jacket', 'Outerwear', 'men', 'Streetwear', null, '{"de":"Herren Bomberjacke","fr":"blouson aviateur homme","it":"bomber uomo","es":"chaqueta bomber hombre","pt":"jaqueta bomber masculina","ja":"メンズ ボンバージャケット","ko":"남성 항공점퍼"}'),
  ('men printed resort shirt', 'Tops', 'men', 'Bohemian', null, '{"de":"Herren Hawaiihemd","fr":"chemise hawaïenne homme","it":"camicia hawaiana uomo","es":"camisa hawaiana hombre","pt":"camisa estampada masculina","ja":"メンズ アロハシャツ","ko":"남성 하와이안 셔츠"}'),
  ('men linen pants', 'Bottoms', 'men', 'Bohemian', null, '{"de":"Herren Leinenhose","fr":"pantalon en lin homme","it":"pantaloni di lino uomo","es":"pantalón de lino hombre","pt":"calça de linho masculina","ja":"メンズ リネンパンツ","ko":"남성 린넨 바지"}'),
  ('men corduroy trousers', 'Bottoms', 'men', 'Vintage', null, '{"de":"Herren Cordhose","fr":"pantalon en velours côtelé homme","it":"pantaloni di velluto a coste uomo","es":"pantalón de pana hombre","pt":"calça de veludo cotelê masculina","ja":"メンズ コーデュロイパンツ","ko":"남성 코듀로이 팬츠"}'),
  ('men joggers', 'Bottoms', 'men', 'Athleisure', null, '{"de":"Herren Jogginghose","fr":"jogging homme","it":"pantaloni jogger uomo","es":"joggers hombre","pt":"calça jogger masculina","ja":"メンズ ジョガーパンツ","ko":"남성 조거팬츠"}'),
  ('men polo shirt', 'Tops', 'men', 'Preppy', null, '{"de":"Herren Poloshirt","fr":"polo homme","it":"polo uomo","es":"polo hombre","pt":"camisa polo masculina","ja":"メンズ ポロシャツ","ko":"남성 폴로 셔츠"}'),
  ('men ripped black jeans', 'Bottoms', 'men', 'Grunge', null, '{"de":"Herren schwarze Jeans zerrissen","fr":"jean noir déchiré homme","it":"jeans neri strappati uomo","es":"jeans negros rotos hombre","pt":"calça jeans preta rasgada masculina","ja":"メンズ ブラック ダメージジーンズ","ko":"남성 블랙 찢어진 청바지"}'),
  ('men knit cardigan', 'Outerwear', 'men', 'Cottagecore', null, '{"de":"Herren Strickjacke","fr":"cardigan en maille homme","it":"cardigan in maglia uomo","es":"cárdigan de punto hombre","pt":"cardigã de tricô masculino","ja":"メンズ ニットカーディガン","ko":"남성 니트 가디건"}'),
  ('men wool blazer', 'Outerwear', 'men', 'Dark Academia', null, '{"de":"Herren Wollsakko","fr":"blazer en laine homme","it":"blazer in lana uomo","es":"blazer de lana hombre","pt":"blazer de lã masculino","ja":"メンズ ウール テーラードジャケット","ko":"남성 울 블레이저"}'),
  ('men turtleneck sweater', 'Tops', 'men', 'Dark Academia', null, '{"de":"Herren Rollkragenpullover","fr":"pull col roulé homme","it":"dolcevita uomo","es":"jersey de cuello alto hombre","pt":"suéter gola alta masculino","ja":"メンズ タートルネック ニット","ko":"남성 터틀넥 니트"}'),
  ('men baggy jeans', 'Bottoms', 'men', 'Y2K', null, '{"de":"Herren Baggy Jeans","fr":"jean baggy homme","it":"jeans baggy uomo","es":"jeans baggy hombre","pt":"calça jeans baggy masculina","ja":"メンズ バギージーンズ","ko":"남성 와이드 청바지"}'),
  ('men chelsea boots', 'Shoes', 'men', null, null, '{"de":"Herren Chelsea Boots","fr":"chelsea boots homme","it":"chelsea boots uomo","es":"botas chelsea hombre","pt":"bota chelsea masculina","ja":"メンズ サイドゴアブーツ","ko":"남성 첼시부츠"}'),
  ('men sneakers', 'Shoes', 'men', null, null, '{"de":"Herren Sneaker","fr":"baskets homme","it":"sneakers uomo","es":"zapatillas hombre","pt":"tênis masculino","ja":"メンズ スニーカー","ko":"남성 스니커즈"}'),
  ('men kurta', 'Tops', 'men', null, '{IN}', '{}'),
  ('nehru jacket', 'Outerwear', 'men', null, '{IN}', '{}'),
  ('white leather sneakers', 'Shoes', 'unisex', 'Minimalist', null, '{"de":"weiße Leder Sneaker","fr":"baskets blanches en cuir","it":"sneakers bianche in pelle","es":"zapatillas blancas de piel","pt":"tênis branco de couro","ja":"白 レザースニーカー","ko":"화이트 가죽 스니커즈"}'),
  ('bucket hat', 'Accessories', 'unisex', 'Streetwear', null, '{"de":"Fischerhut","fr":"bob chapeau","it":"cappello alla pescatora","es":"gorro de pescador","pt":"chapéu bucket","ja":"バケットハット","ko":"버킷햇"}'),
  ('vintage denim jacket', 'Outerwear', 'unisex', 'Vintage', null, '{"de":"Vintage Jeansjacke","fr":"veste en jean vintage","it":"giacca di jeans vintage","es":"chaqueta vaquera vintage","pt":"jaqueta jeans vintage","ja":"ヴィンテージ デニムジャケット","ko":"빈티지 데님 자켓"}'),
  ('leather belt', 'Accessories', 'unisex', null, null, '{"de":"Ledergürtel","fr":"ceinture en cuir","it":"cintura in pelle","es":"cinturón de cuero","pt":"cinto de couro","ja":"レザーベルト","ko":"가죽 벨트"}'),
  ('running shoes', 'Shoes', 'unisex', 'Athleisure', null, '{"de":"Laufschuhe","fr":"chaussures de running","it":"scarpe da corsa","es":"zapatillas de running","pt":"tênis de corrida","ja":"ランニングシューズ","ko":"러닝화"}'),
  ('track jacket', 'Outerwear', 'unisex', 'Athleisure', null, '{"de":"Trainingsjacke","fr":"veste de survêtement","it":"giacca della tuta","es":"chaqueta deportiva","pt":"jaqueta esportiva","ja":"トラックジャケット","ko":"트랙 자켓"}'),
  ('leather loafers', 'Shoes', 'unisex', 'Preppy', null, '{"de":"Leder Loafer","fr":"mocassins en cuir","it":"mocassini in pelle","es":"mocasines de cuero","pt":"mocassim de couro","ja":"レザー ローファー","ko":"가죽 로퍼"}'),
  ('flannel shirt', 'Tops', 'unisex', 'Grunge', null, '{"de":"Flanellhemd","fr":"chemise en flanelle","it":"camicia di flanella","es":"camisa de franela","pt":"camisa de flanela","ja":"ネルシャツ","ko":"플란넬 셔츠"}'),
  ('combat boots', 'Shoes', 'unisex', 'Grunge', null, '{"de":"Combat Boots","fr":"boots rangers","it":"anfibi","es":"botas militares","pt":"coturno","ja":"コンバットブーツ","ko":"워커 부츠"}'),
  ('leather satchel', 'Bags', 'unisex', 'Dark Academia', null, '{"de":"Leder Umhängetasche","fr":"cartable en cuir","it":"borsa a tracolla in pelle","es":"bolso cartera de cuero","pt":"bolsa carteiro de couro","ja":"レザー サッチェルバッグ","ko":"가죽 사첼백"}');

-- Picks the searches a run should do next for one marketplace + market: least recently run
-- first, in the market's language when a translation exists.
create or replace function public.next_search_terms(p_source text, p_market text, p_limit integer)
returns table (id bigint, query text, query_en text, category text, department text, style_archetype text)
language sql
stable
set search_path = public
as $$
  select t.id,
         coalesce(nullif(t.translations ->> coalesce(mm.language, 'en'), ''), t.query),
         t.query,
         t.category,
         t.department,
         t.style_archetype
  from search_terms t
  left join marketplace_markets mm on mm.source = p_source and mm.market = p_market
  left join search_runs r on r.term_id = t.id and r.source = p_source and r.market = p_market
  where t.enabled and (t.markets is null or p_market = any (t.markets))
  order by r.last_run_at nulls first, t.id
  limit greatest(p_limit, 0);
$$;

-- ---- Refresh queue -------------------------------------------------------
alter table public.refresh_runs add column market text;
alter table public.refresh_runs add column kind text not null default 'catalog' check (kind in ('catalog', 'offers', 'fx'));

-- Claims the marketplace + market most overdue for a refresh among the configured ones
-- (`pairs` like 'ebay:GB'), creating rows for configured pairs that aren't listed yet.
create or replace function public.claim_catalog_job(pairs text[])
returns table (source text, market text, language text, searches_per_run integer, lookups_per_run integer)
language plpgsql
set search_path = public
as $$
begin
  insert into marketplace_markets as mm (source, market, site_name, domain)
  select split_part(p, ':', 1), split_part(p, ':', 2), m.name, regexp_replace(m.website, '^https?://(www\.)?', '')
  from unnest(pairs) as p
  join marketplaces m on m.id = split_part(p, ':', 1)
  where split_part(p, ':', 2) ~ '^[A-Z]{2}$'
  on conflict do nothing;

  return query
  with next_job as (
    select mm.source, mm.market
    from marketplace_markets mm
    where mm.enabled
      and (mm.source || ':' || mm.market) = any (pairs)
      and (mm.last_run_at is null or mm.last_run_at < now() - make_interval(hours => mm.hours_between_runs))
    order by mm.last_run_at nulls first
    limit 1
    for update skip locked
  )
  update marketplace_markets mm set last_run_at = now()
  from next_job j
  where mm.source = j.source and mm.market = j.market
  returning mm.source, mm.market, mm.language, mm.searches_per_run, mm.lookups_per_run;
end;
$$;

-- ---- Exchange rates ---------------------------------------------------------
-- fx_rates now holds the European Central Bank's daily reference rates: base 'EUR',
-- quote = currency, rate = units of that currency per euro. Cross rates are derived.
create view public.fx_latest with (security_invoker = true) as
select distinct on (f.quote) f.quote as currency, f.rate as per_eur, f.observed_on
from public.fx_rates f
where f.base = 'EUR'
order by f.quote, f.observed_on desc;

-- ---- Coupons & offers ---------------------------------------------------------
create table public.offer_feeds (
  network text not null,
  market text not null check (market ~ '^[A-Z]{2}$'),
  enabled boolean not null default true,
  hours_between_runs integer not null default 6 check (hours_between_runs between 1 and 168),
  last_run_at timestamptz,
  primary key (network, market)
);

create table public.offers (
  id text primary key,                       -- '<network>:<market>:<network offer id>'
  network text not null,
  market text not null check (market ~ '^[A-Z]{2}$'),
  network_offer_id text not null,
  merchant text not null,
  merchant_domain text,
  -- The marketplace this store is, when it's one of ours (matched on domain).
  source text references public.marketplaces (id) on delete set null,
  -- Set when the marketplace attached the promo to one listing.
  listing_id text references public.listings (id) on delete cascade on update cascade,
  title text not null,
  description text,
  code text,
  url text not null check (url ~ '^https://'),
  discount_text text,
  min_spend numeric(12, 2),
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  categories text[] not null default '{}',
  image_url text,
  first_seen_at timestamptz not null default now(),
  -- Last time the network's feed still listed the offer.
  last_seen_at timestamptz not null default now(),
  active boolean not null default true
);

create index offers_market_idx on public.offers (market, active);
create index offers_listing_idx on public.offers (listing_id) where listing_id is not null;

-- Offers to show right now: still listed by the feed in the last 26 hours and in date.
create view public.active_offers with (security_invoker = true) as
select o.id, o.network, o.market, o.merchant, o.merchant_domain, o.source, o.listing_id, o.title,
       o.description, o.code, o.url, o.discount_text, o.min_spend, o.currency, o.starts_at, o.ends_at,
       o.categories, o.image_url, o.last_seen_at
from public.offers o
where o.active
  and o.last_seen_at > now() - interval '26 hours'
  and (o.starts_at is null or o.starts_at <= now())
  and (o.ends_at is null or o.ends_at > now());

create or replace function public.claim_offer_job(pairs text[])
returns table (network text, market text)
language plpgsql
set search_path = public
as $$
begin
  insert into offer_feeds (network, market)
  select split_part(p, ':', 1), split_part(p, ':', 2)
  from unnest(pairs) as p
  where split_part(p, ':', 2) ~ '^[A-Z]{2}$'
  on conflict do nothing;

  return query
  with next_job as (
    select f.network, f.market
    from offer_feeds f
    where f.enabled
      and (f.network || ':' || f.market) = any (pairs)
      and (f.last_run_at is null or f.last_run_at < now() - make_interval(hours => f.hours_between_runs))
    order by f.last_run_at nulls first
    limit 1
    for update skip locked
  )
  update offer_feeds f set last_run_at = now()
  from next_job j
  where f.network = j.network and f.market = j.market
  returning f.network, f.market;
end;
$$;

-- Stores one complete fetch of a network's offers for a market. Offers the feed no longer
-- lists are switched off, so nothing it has withdrawn or expired stays visible.
create or replace function public.store_offers(p_network text, p_market text, p_offers jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
begin
  insert into offers as o (
    id, network, market, network_offer_id, merchant, merchant_domain, title, description, code, url,
    discount_text, min_spend, currency, starts_at, ends_at, categories, image_url, last_seen_at, active
  )
  select
    p_network || ':' || p_market || ':' || x.network_offer_id, p_network, p_market, x.network_offer_id,
    x.merchant, lower(x.merchant_domain), x.title, x.description, nullif(x.code, ''), x.url,
    x.discount_text, x.min_spend, x.currency, x.starts_at, x.ends_at, coalesce(x.categories, '{}'),
    x.image_url, now(), true
  from jsonb_to_recordset(p_offers) as x(
    network_offer_id text, merchant text, merchant_domain text, title text, description text, code text,
    url text, discount_text text, min_spend numeric, currency text, starts_at timestamptz,
    ends_at timestamptz, categories text[], image_url text
  )
  on conflict (id) do update set
    merchant = excluded.merchant,
    merchant_domain = excluded.merchant_domain,
    title = excluded.title,
    description = excluded.description,
    code = excluded.code,
    url = excluded.url,
    discount_text = excluded.discount_text,
    min_spend = excluded.min_spend,
    currency = excluded.currency,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    categories = excluded.categories,
    image_url = excluded.image_url,
    last_seen_at = now(),
    active = true;
  get diagnostics affected = row_count;

  update offers o set active = false
  where o.network = p_network and o.market = p_market and o.listing_id is null and o.active
    and o.last_seen_at < now() - interval '1 minute';

  update offers o set source = mm.source
  from marketplace_markets mm
  where o.network = p_network and o.market = p_market and o.merchant_domain is not null
    and mm.market = o.market
    and (o.merchant_domain = mm.domain or o.merchant_domain like '%.' || mm.domain);

  return affected;
end;
$$;

-- Promo codes a marketplace attaches to individual listings (e.g. AliExpress). A listing
-- that was re-checked without a promo has its old one switched off.
create or replace function public.store_listing_promos(p_checked text[], p_promos jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
begin
  insert into offers as o (
    id, network, market, network_offer_id, merchant, merchant_domain, source, listing_id, title, description,
    code, url, min_spend, currency, starts_at, ends_at, last_seen_at, active
  )
  select
    l.source || ':' || l.market || ':' || l.source_item_id || ':' || coalesce(nullif(x.code, ''), 'deal'),
    l.source, l.market, l.source_item_id || ':' || coalesce(nullif(x.code, ''), 'deal'),
    m.name, mm.domain, l.source, l.id, x.description, null, nullif(x.code, ''), l.product_url,
    x.min_spend, x.currency, x.starts_at, x.ends_at, now(), true
  from jsonb_to_recordset(p_promos) as x(
    listing_id text, code text, description text, min_spend numeric, currency text,
    starts_at timestamptz, ends_at timestamptz
  )
  join listings l on l.id = x.listing_id
  join marketplaces m on m.id = l.source
  left join marketplace_markets mm on mm.source = l.source and mm.market = l.market
  on conflict (id) do update set
    title = excluded.title,
    code = excluded.code,
    url = excluded.url,
    min_spend = excluded.min_spend,
    currency = excluded.currency,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    last_seen_at = now(),
    active = true;
  get diagnostics affected = row_count;

  update offers o set active = false
  where o.listing_id = any (p_checked) and o.active and o.last_seen_at < now() - interval '1 minute';

  return affected;
end;
$$;

-- ---- Ingest (service role only) -----------------------------------------
-- Upserts listings, records today's price for available ones, and notes when (and why)
-- a listing stopped being available.
create or replace function public.ingest_listings(items jsonb, observed date default current_date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
begin
  insert into listings as l (
    id, source, market, source_item_id, title, description, brand, image_url, product_url, category,
    department, style_archetypes, condition, size, colors, seller, currency, current_price,
    original_price, available, listed_at, last_seen_at, last_checked_at, ended_on, end_reason
  )
  select
    x.id, x.source, x.market, x.source_item_id, x.title, x.description, x.brand, x.image_url, x.product_url,
    x.category, x.department, coalesce(x.style_archetypes, '{}'), x.condition, x.size, coalesce(x.colors, '{}'),
    x.seller, x.currency, x.current_price, x.original_price, x.available, x.listed_at, now(), now(),
    case when x.available then null else observed end,
    case when x.available then null else 'gone' end
  from jsonb_to_recordset(items) as x(
    id text, source text, market text, source_item_id text, title text, description text, brand text,
    image_url text, product_url text, category text, department text, style_archetypes text[],
    condition text, size text, colors text[], seller text, currency text, current_price numeric,
    original_price numeric, available boolean, listed_at timestamptz
  )
  on conflict (id) do update set
    title = excluded.title,
    description = coalesce(excluded.description, l.description),
    brand = coalesce(excluded.brand, l.brand),
    image_url = coalesce(excluded.image_url, l.image_url),
    product_url = excluded.product_url,
    category = excluded.category,
    department = excluded.department,
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
    last_checked_at = now(),
    ended_on = case when excluded.available then null else coalesce(l.ended_on, observed) end,
    end_reason = case when excluded.available then null else coalesce(l.end_reason, 'gone') end;

  get diagnostics affected = row_count;

  insert into price_points (listing_id, observed_on, price, currency, origin)
  select x.id, observed, x.current_price, x.currency, 'observed'
  from jsonb_to_recordset(items) as x(id text, current_price numeric, currency text, available boolean)
  where x.available
  on conflict (listing_id, observed_on) do update
    set price = excluded.price, currency = excluded.currency, origin = 'observed';

  return affected;
end;
$$;

-- Marks listings as no longer available: 'gone' = the marketplace says so (sold, removed),
-- 'stale' = VibeVault couldn't confirm it for a few days.
create or replace function public.end_listings(ids text[], reason text, observed date default current_date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
begin
  if reason not in ('gone', 'stale') then
    raise exception 'reason must be gone or stale';
  end if;
  update listings set
    available = false,
    ended_on = coalesce(ended_on, observed),
    end_reason = coalesce(end_reason, reason),
    last_checked_at = case when reason = 'gone' then now() else last_checked_at end
  where id = any (ids) and available;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Imports archived daily prices (e.g. Keepa for Amazon) without overwriting prices
-- VibeVault recorded itself.
create or replace function public.ingest_history(p_listing text, p_currency text, p_points jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
begin
  insert into price_points (listing_id, observed_on, price, currency, origin)
  select p_listing, x.date, x.price, p_currency, 'archive'
  from jsonb_to_recordset(p_points) as x(date date, price numeric)
  where x.price > 0
  on conflict (listing_id, observed_on) do nothing;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Listings whose archived price history hasn't been fetched yet (oldest first).
alter table public.listings add column archive_checked_at timestamptz;

create or replace function public.listings_needing_archive(p_source text, p_market text, p_limit integer)
returns table (id text, source_item_id text)
language sql
stable
set search_path = public
as $$
  select l.id, l.source_item_id
  from listings l
  where l.source = p_source and l.market = p_market and l.available and l.archive_checked_at is null
  order by l.first_seen_at
  limit greatest(p_limit, 0);
$$;

-- ============================================================
-- Price predictions
--
-- Question: "If I wait H days (7, 14 or 30), will this listing be at
-- least 5% cheaper at some point while it's still for sale?"
--
-- Every recorded day of every listing is a past "situation" described by
-- how long it has been tracked, where the price sits in its 60-day range,
-- the 7-day trend and how often the price changed in 30 days. For past
-- situations we know what happened next (dropped / no drop / sold out),
-- so the chance for today's situation is the observed frequency in the
-- same situation, pooled from broad (all listings) to specific (same
-- marketplace and category, then this listing's own history) with
-- Bayesian shrinkage. Nothing is published until at least 30 listings
-- have complete outcomes for a horizon. Each published prediction is
-- kept and scored when its window closes (prediction_track_record).
-- ============================================================

create table public.prediction_cells (
  horizon_days integer not null,
  level smallint not null,       -- 0 all, 1 situation, 2 +marketplace, 3 +category, 4 this listing in this situation
  cell text not null,
  examples integer not null,
  listings integer not null,
  drops integer not null,
  gone integer not null,
  low_ratio_p50 numeric(8, 4),   -- median of (lowest price in the window / price at the time)
  primary key (horizon_days, level, cell)
);

create table public.price_predictions (
  listing_id text not null references public.listings (id) on delete cascade on update cascade,
  made_on date not null,
  horizon_days integer not null check (horizon_days in (7, 14, 30)),
  price numeric(12, 2) not null,
  currency text not null,
  p_drop numeric(5, 4) not null check (p_drop between 0 and 1),
  p_gone numeric(5, 4) not null check (p_gone between 0 and 1),
  expected_low numeric(12, 2) not null,
  basis text not null check (basis in ('listing', 'category', 'marketplace', 'situation', 'all')),
  basis_listings integer not null,
  verdict text not null check (verdict in ('wait', 'buy', 'unclear')),
  outcome text check (outcome in ('dropped', 'no_drop', 'gone', 'unknown')),
  outcome_low numeric(12, 2),
  resolved_on date,
  primary key (listing_id, made_on, horizon_days)
);

create index price_predictions_open_idx on public.price_predictions (made_on) where outcome is null;

create table public.model_runs (
  id bigint generated always as identity primary key,
  run_on date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  training_examples integer,
  predictions integer,
  resolved integer
);

-- One row per recorded day of each listing, with its situation and what happened next.
create or replace function public.price_situations(p_asof date, p_listing text default null)
returns table (
  listing_id text, source text, category text, d date, price numeric,
  age text, pos text, trend text, activity text,
  fmin7 numeric, fmin14 numeric, fmin30 numeric, last_d date
)
language sql
stable
set search_path = public
as $$
  with pts as (
    select p.listing_id, l.source, l.category, p.observed_on as d, p.price
    from price_points p
    join listings l on l.id = p.listing_id
    where p.observed_on <= p_asof and p.price > 0 and (p_listing is null or p.listing_id = p_listing)
  ),
  w as (
    select pts.*,
      min(pts.price) over past60 as min60,
      max(pts.price) over past60 as max60,
      first_value(pts.price) over past7 as p7,
      min(pts.d) over all_days as first_d,
      max(pts.d) over all_days as last_d,
      lag(pts.price) over by_day as prev,
      min(pts.price) over next7 as fmin7,
      min(pts.price) over next14 as fmin14,
      min(pts.price) over next30 as fmin30
    from pts
    window
      by_day as (partition by pts.listing_id order by pts.d),
      all_days as (partition by pts.listing_id),
      past60 as (partition by pts.listing_id order by pts.d range between interval '60 days' preceding and current row),
      past7 as (partition by pts.listing_id order by pts.d range between interval '7 days' preceding and current row),
      next7 as (partition by pts.listing_id order by pts.d range between interval '1 day' following and interval '7 days' following),
      next14 as (partition by pts.listing_id order by pts.d range between interval '1 day' following and interval '14 days' following),
      next30 as (partition by pts.listing_id order by pts.d range between interval '1 day' following and interval '30 days' following)
  ),
  c as (
    select w.*,
      sum(case when w.prev is not null and w.prev <> w.price then 1 else 0 end)
        over (partition by w.listing_id order by w.d range between interval '30 days' preceding and current row) as changes30
    from w
  )
  select
    c.listing_id, c.source, c.category, c.d, c.price,
    case when c.d - c.first_d < 7 then 'new' when c.d - c.first_d < 30 then 'young' else 'established' end,
    case
      when c.max60 = c.min60 then 'flat'
      when (c.price - c.min60) / (c.max60 - c.min60) <= 0.15 then 'low'
      when (c.price - c.min60) / (c.max60 - c.min60) >= 0.85 then 'high'
      else 'mid'
    end,
    case when c.price <= c.p7 * 0.97 then 'falling' when c.price >= c.p7 * 1.03 then 'rising' else 'steady' end,
    case when c.changes30 = 0 then 'still' when c.changes30 <= 2 then 'some' else 'active' end,
    c.fmin7, c.fmin14, c.fmin30, c.last_d
  from c;
$$;

-- Scores predictions whose outcome is now known. A drop of 5%+ settles a prediction as soon as
-- it's recorded; otherwise it waits for the window to close.
create or replace function public.resolve_predictions(p_asof date default current_date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
begin
  with win as (
    select pr.listing_id, pr.made_on, pr.horizon_days, pr.price, l.end_reason, l.ended_on,
      (select min(p.price) from price_points p
        where p.listing_id = pr.listing_id and p.observed_on > pr.made_on
          and p.observed_on <= least(pr.made_on + pr.horizon_days, p_asof)) as low,
      (select max(p.observed_on) from price_points p
        where p.listing_id = pr.listing_id and p.observed_on <= p_asof) as last_d
    from price_predictions pr
    join listings l on l.id = pr.listing_id
    where pr.outcome is null and pr.made_on < p_asof
  ),
  decided as (
    select w.*,
      case
        when w.low <= w.price * 0.95 then 'dropped'
        when w.made_on + w.horizon_days > p_asof then null
        when w.low is not null and w.last_d >= w.made_on + w.horizon_days then 'no_drop'
        when w.end_reason = 'gone' and w.ended_on > w.made_on and w.ended_on <= w.made_on + w.horizon_days then 'gone'
        when p_asof >= w.made_on + w.horizon_days + 3 then 'unknown'
      end as outcome
    from win w
  )
  update price_predictions pr
  set outcome = d.outcome, outcome_low = d.low, resolved_on = p_asof
  from decided d
  where d.outcome is not null
    and pr.listing_id = d.listing_id and pr.made_on = d.made_on and pr.horizon_days = d.horizon_days;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Publishes today's predictions for available listings (or one listing) from the learnt cells.
create or replace function public.publish_predictions(p_asof date default current_date, p_listing text default null)
returns integer
language plpgsql
set search_path = public
as $$
declare
  affected integer;
  strength constant numeric := 20;  -- pseudo-observations each level borrows from the broader one
begin
  with situation as (
    select distinct on (s.listing_id) s.*, l.currency
    from price_situations(p_asof, p_listing) s
    join listings l on l.id = s.listing_id
    where l.available
    order by s.listing_id, s.d desc
  ),
  cells as (
    select s.listing_id, s.price, s.currency, h.horizon,
      g.examples as n0, g.drops as k0, g.gone as q0, g.listings as l0, g.low_ratio_p50 as r0,
      c1.examples as n1, c1.drops as k1, c1.gone as q1, c1.listings as l1, c1.low_ratio_p50 as r1,
      c2.examples as n2, c2.drops as k2, c2.gone as q2, c2.listings as l2, c2.low_ratio_p50 as r2,
      c3.examples as n3, c3.drops as k3, c3.gone as q3, c3.listings as l3, c3.low_ratio_p50 as r3,
      c4.examples as n4, c4.drops as k4, c4.gone as q4, c4.low_ratio_p50 as r4
    from situation s
    cross join (values (7), (14), (30)) as h(horizon)
    join prediction_cells g on g.horizon_days = h.horizon and g.level = 0 and g.cell = 'all'
    left join prediction_cells c1 on c1.horizon_days = h.horizon and c1.level = 1
      and c1.cell = concat_ws('|', s.age, s.pos, s.trend, s.activity)
    left join prediction_cells c2 on c2.horizon_days = h.horizon and c2.level = 2
      and c2.cell = concat_ws('|', s.source, s.age, s.pos, s.trend, s.activity)
    left join prediction_cells c3 on c3.horizon_days = h.horizon and c3.level = 3
      and c3.cell = concat_ws('|', s.source, s.category, s.age, s.pos, s.trend, s.activity)
    left join prediction_cells c4 on c4.horizon_days = h.horizon and c4.level = 4
      and c4.cell = concat_ws('|', s.listing_id, s.pos, s.trend, s.activity)
    where s.d >= p_asof - 3      -- only listings with a recent price
      and g.listings >= 30       -- enough complete outcomes to learn from
  ),
  shrunk as (
    select c.*,
      (c.k0 + 1.0) / (c.n0 + 2.0) as p0,
      (c.q0 + 1.0) / (c.n0 + 2.0) as g0
    from cells c
  ),
  s1 as (
    select s.*,
      (coalesce(s.k1, 0) + strength * s.p0) / (coalesce(s.n1, 0) + strength) as p1,
      (coalesce(s.q1, 0) + strength * s.g0) / (coalesce(s.n1, 0) + strength) as g1
    from shrunk s
  ),
  s2 as (
    select s.*,
      (coalesce(s.k2, 0) + strength * s.p1) / (coalesce(s.n2, 0) + strength) as p2,
      (coalesce(s.q2, 0) + strength * s.g1) / (coalesce(s.n2, 0) + strength) as g2
    from s1 s
  ),
  s3 as (
    select s.*,
      (coalesce(s.k3, 0) + strength * s.p2) / (coalesce(s.n3, 0) + strength) as p3,
      (coalesce(s.q3, 0) + strength * s.g2) / (coalesce(s.n3, 0) + strength) as g3
    from s2 s
  ),
  final as (
    select s.*,
      (coalesce(s.k4, 0) + strength * s.p3) / (coalesce(s.n4, 0) + strength) as p_drop,
      (coalesce(s.q4, 0) + strength * s.g3) / (coalesce(s.n4, 0) + strength) as p_gone,
      case
        when coalesce(s.n4, 0) >= 30 then 'listing'
        when coalesce(s.n3, 0) >= 30 then 'category'
        when coalesce(s.n2, 0) >= 30 then 'marketplace'
        when coalesce(s.n1, 0) >= 30 then 'situation'
        else 'all'
      end as basis
    from s3 s
  )
  insert into price_predictions as pr (
    listing_id, made_on, horizon_days, price, currency, p_drop, p_gone, expected_low, basis, basis_listings, verdict
  )
  select
    f.listing_id, p_asof, f.horizon, f.price, f.currency,
    round(least(1, greatest(0, f.p_drop)), 4),
    round(least(1, greatest(0, f.p_gone)), 4),
    round(f.price * case f.basis
      when 'listing' then f.r4 when 'category' then f.r3 when 'marketplace' then f.r2
      when 'situation' then f.r1 else f.r0 end, 2),
    f.basis,
    case f.basis when 'listing' then 1 when 'category' then f.l3 when 'marketplace' then f.l2
      when 'situation' then f.l1 else f.l0 end,
    case when f.p_drop >= 0.6 then 'wait' when f.p_drop <= 0.3 then 'buy' else 'unclear' end
  from final f
  on conflict (listing_id, made_on, horizon_days) do update set
    price = excluded.price,
    currency = excluded.currency,
    p_drop = excluded.p_drop,
    p_gone = excluded.p_gone,
    expected_low = excluded.expected_low,
    basis = excluded.basis,
    basis_listings = excluded.basis_listings,
    verdict = excluded.verdict,
    outcome = null,
    outcome_low = null,
    resolved_on = null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Daily job (pg_cron, see supabase/setup/schedule.sql): score old predictions, relearn from
-- every outcome recorded so far, publish today's predictions.
create or replace function public.run_price_model(p_asof date default current_date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  run_id bigint;
  n_examples integer;
  n_predictions integer;
  n_resolved integer;
begin
  insert into model_runs (run_on) values (p_asof) returning id into run_id;
  n_resolved := resolve_predictions(p_asof);

  drop table if exists tmp_examples;
  create temporary table tmp_examples on commit drop as
  select s.listing_id, s.source, s.category, s.age, s.pos, s.trend, s.activity, h.horizon,
    case
      when h.fmin <= s.price * 0.95 then 'dropped'
      when h.fmin is not null and s.last_d >= s.d + h.horizon then 'no_drop'
      when l.end_reason = 'gone' and l.ended_on > s.d and l.ended_on <= s.d + h.horizon then 'gone'
    end as outcome,
    least(coalesce(h.fmin, s.price), s.price) / s.price as low_ratio
  from price_situations(p_asof) s
  join listings l on l.id = s.listing_id
  cross join lateral (values (7, s.fmin7), (14, s.fmin14), (30, s.fmin30)) as h(horizon, fmin)
  where s.d + h.horizon <= p_asof;

  delete from tmp_examples where outcome is null;
  select count(*) into n_examples from tmp_examples;

  delete from prediction_cells;
  insert into prediction_cells (horizon_days, level, cell, examples, listings, drops, gone, low_ratio_p50)
  select e.horizon, k.level, k.cell, count(*), count(distinct e.listing_id),
    count(*) filter (where e.outcome = 'dropped'),
    count(*) filter (where e.outcome = 'gone'),
    percentile_cont(0.5) within group (order by e.low_ratio)
  from tmp_examples e
  cross join lateral (values
    (0::smallint, 'all'),
    (1::smallint, concat_ws('|', e.age, e.pos, e.trend, e.activity)),
    (2::smallint, concat_ws('|', e.source, e.age, e.pos, e.trend, e.activity)),
    (3::smallint, concat_ws('|', e.source, e.category, e.age, e.pos, e.trend, e.activity)),
    (4::smallint, concat_ws('|', e.listing_id, e.pos, e.trend, e.activity))
  ) as k(level, cell)
  group by e.horizon, k.level, k.cell;

  n_predictions := publish_predictions(p_asof, null);

  update model_runs
  set finished_at = now(), training_examples = n_examples, predictions = n_predictions, resolved = n_resolved
  where id = run_id;
  return jsonb_build_object('examples', n_examples, 'predictions', n_predictions, 'resolved', n_resolved);
end;
$$;

-- ---- Read models for the app ------------------------------------------------
create view public.catalog_items with (security_invoker = true) as
select
  l.id, l.source, m.name as source_name, m.kind as source_kind, coalesce(mm.site_name, m.name) as site_name,
  l.market, l.source_item_id, l.title, l.description, l.brand, l.image_url, l.product_url,
  l.category, l.department, l.style_archetypes, l.condition, l.size, l.colors, l.seller, l.currency,
  l.current_price, l.original_price, l.available, l.listed_at, l.first_seen_at, l.last_seen_at,
  l.last_checked_at, l.ended_on, l.end_reason,
  coalesce(h.history, '[]'::json) as price_history,
  st.stats,
  pr.prediction
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
) pr on true;

create view public.catalog_status with (security_invoker = true) as
select
  m.id as source,
  m.name,
  m.kind,
  m.attribution,
  (select max(r.finished_at) from public.refresh_runs r
    where r.source = m.id and r.kind = 'catalog' and r.status in ('ok', 'partial')) as last_success_at,
  (select r.status from public.refresh_runs r
    where r.source = m.id and r.kind = 'catalog' order by r.started_at desc limit 1) as last_status,
  (select r.message from public.refresh_runs r
    where r.source = m.id and r.kind = 'catalog' order by r.started_at desc limit 1) as last_message,
  (select count(*) from public.listings l where l.source = m.id and l.available) as available_listings,
  (select coalesce(array_agg(distinct l.market order by l.market), '{}') from public.listings l
    where l.source = m.id and l.available) as markets
from public.marketplaces m;

-- Countries with live listings right now, for the country picker.
create view public.available_markets with (security_invoker = true) as
select l.market, count(*) as listings, array_agg(distinct l.source order by l.source) as sources
from public.listings l
where l.available
group by l.market;

-- How the published predictions turned out (overall and per marketplace). brier_base_rate is
-- the score of always predicting the average drop rate: the model is only useful if it beats it.
create view public.prediction_track_record with (security_invoker = true) as
with resolved as (
  select pr.horizon_days, pr.p_drop, pr.verdict, pr.made_on, pr.resolved_on, l.source,
         (pr.outcome = 'dropped')::int as hit
  from public.price_predictions pr
  join public.listings l on l.id = pr.listing_id
  where pr.outcome in ('dropped', 'no_drop', 'gone')
),
base as (
  select r.horizon_days, avg(r.hit) as base_rate from resolved r group by r.horizon_days
)
select
  r.horizon_days,
  r.source,
  count(*) as resolved,
  sum(r.hit) as dropped,
  round(avg(power(r.p_drop - r.hit, 2)), 4) as brier,
  round(avg(power(b.base_rate - r.hit, 2)), 4) as brier_base_rate,
  count(*) filter (where r.verdict = 'wait') as wait_calls,
  count(*) filter (where r.verdict = 'wait' and r.hit = 1) as wait_correct,
  count(*) filter (where r.verdict = 'buy') as buy_calls,
  count(*) filter (where r.verdict = 'buy' and r.hit = 0) as buy_correct,
  min(r.made_on) as since,
  max(r.resolved_on) as last_resolved
from resolved r
join base b on b.horizon_days = r.horizon_days
group by grouping sets ((r.horizon_days), (r.horizon_days, r.source));

-- Calibration: of the predictions that said ~X%, how many actually dropped.
create view public.prediction_calibration with (security_invoker = true) as
select
  pr.horizon_days,
  least(width_bucket(pr.p_drop, 0, 1, 5), 5) as bucket,
  count(*) as resolved,
  round(avg(pr.p_drop), 3) as predicted,
  round(avg((pr.outcome = 'dropped')::int), 3) as observed
from public.price_predictions pr
where pr.outcome in ('dropped', 'no_drop', 'gone')
group by pr.horizon_days, least(width_bucket(pr.p_drop, 0, 1, 5), 5);

create view public.model_status with (security_invoker = true) as
select r.run_on, r.finished_at, r.training_examples, r.predictions, r.resolved
from public.model_runs r
where r.finished_at is not null
order by r.finished_at desc
limit 1;

-- ---- Access ------------------------------------------------------------------
alter table public.marketplaces enable row level security;
alter table public.marketplace_markets enable row level security;
alter table public.search_terms enable row level security;
alter table public.search_runs enable row level security;
alter table public.offer_feeds enable row level security;
alter table public.offers enable row level security;
alter table public.prediction_cells enable row level security;
alter table public.price_predictions enable row level security;
alter table public.model_runs enable row level security;

create policy "Anyone can read marketplaces" on public.marketplaces for select to anon, authenticated using (true);
create policy "Anyone can read marketplace markets" on public.marketplace_markets for select to anon, authenticated using (true);
create policy "Anyone can read offers" on public.offers for select to anon, authenticated using (true);
create policy "Anyone can read predictions" on public.price_predictions for select to anon, authenticated using (true);
create policy "Anyone can read model runs" on public.model_runs for select to anon, authenticated using (true);
-- search_terms, search_runs, offer_feeds, prediction_cells: service role only.

revoke all on public.search_terms, public.search_runs, public.offer_feeds, public.prediction_cells from anon, authenticated;
revoke insert, update, delete, truncate on public.marketplaces, public.marketplace_markets, public.offers,
  public.price_predictions, public.model_runs from anon, authenticated;
grant select on public.marketplaces, public.marketplace_markets, public.offers, public.price_predictions,
  public.model_runs to anon, authenticated;
grant select on public.catalog_items, public.catalog_status, public.available_markets, public.fx_latest,
  public.active_offers, public.prediction_track_record, public.prediction_calibration, public.model_status
  to anon, authenticated;

revoke execute on function public.ingest_listings(jsonb, date) from public, anon, authenticated;
revoke execute on function public.end_listings(text[], text, date) from public, anon, authenticated;
revoke execute on function public.ingest_history(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.listings_needing_archive(text, text, integer) from public, anon, authenticated;
revoke execute on function public.next_search_terms(text, text, integer) from public, anon, authenticated;
revoke execute on function public.claim_catalog_job(text[]) from public, anon, authenticated;
revoke execute on function public.claim_offer_job(text[]) from public, anon, authenticated;
revoke execute on function public.store_offers(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.store_listing_promos(text[], jsonb) from public, anon, authenticated;
revoke execute on function public.price_situations(date, text) from public, anon, authenticated;
revoke execute on function public.resolve_predictions(date) from public, anon, authenticated;
revoke execute on function public.publish_predictions(date, text) from public, anon, authenticated;
revoke execute on function public.run_price_model(date) from public, anon, authenticated;

grant execute on function public.ingest_listings(jsonb, date), public.end_listings(text[], text, date),
  public.ingest_history(text, text, jsonb), public.listings_needing_archive(text, text, integer),
  public.next_search_terms(text, text, integer),
  public.claim_catalog_job(text[]), public.claim_offer_job(text[]), public.store_offers(text, text, jsonb),
  public.store_listing_promos(text[], jsonb), public.price_situations(date, text),
  public.resolve_predictions(date), public.publish_predictions(date, text), public.run_price_model(date)
  to service_role;
