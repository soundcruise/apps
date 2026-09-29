-- Display deadline (inclusive epoch ms) is independent of 90-day physical retention.
ALTER TABLE candidate_items ADD COLUMN sale_ends_at INTEGER;
-- Pre-1.5 WIP facts held date-only deadlines. Invalid/unknown dates remain unknown.
UPDATE candidate_items SET sale_ends_at=(unixepoch(json_extract(product_facts,'$.endDate')||'T00:00:00+09:00')+86400)*1000-1
WHERE json_valid(product_facts)
 AND (category='sale' OR event_type='sale' OR json_extract(product_facts,'$.kind')='sale')
 AND json_extract(product_facts,'$.endDate') GLOB '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
 AND date(json_extract(product_facts,'$.endDate'),'+0 days')=json_extract(product_facts,'$.endDate');
UPDATE news_controls SET revision=revision+1 WHERE id=1;
