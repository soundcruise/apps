-- Read-only. Run ONLY against AI_SUPPORT_USAGE_DB. No Account identifiers in output.
-- Recent detail + archived aggregate share one shape; no double-counting after atomic cleanup.
WITH metrics AS (
  SELECT day, model, policy_version, outcome, latency, COUNT(*) AS consultations,
    SUM(model_calls) AS model_calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
    SUM(estimated_micros) AS estimated_micros, SUM(budget_micros) AS budget_micros,
    SUM(CASE WHEN state='reserved' THEN model_calls ELSE unknown_calls END) AS unknown_calls,
    SUM(state='reserved') AS incomplete, SUM(repair) AS repairs, SUM(fallback) AS fallbacks
  FROM ai_usage GROUP BY day, model, policy_version, outcome, latency
  UNION ALL SELECT * FROM ai_usage_daily
)
SELECT * FROM metrics WHERE day >= date('now','+9 hours','-7 days')
ORDER BY day DESC, model, outcome, latency;

WITH period AS (SELECT date('now','+9 hours') AS day, strftime('%Y-%m','now','+9 hours') AS month),
totals AS (
  SELECT COALESCE(SUM(CASE WHEN u.day=p.day THEN u.budget_micros ELSE 0 END),0) AS day_micros,
    COALESCE(SUM(u.budget_micros),0) AS month_micros,
    SUM(CASE WHEN u.day=p.day THEN 1 ELSE 0 END) AS day_consultations, COUNT(u.id) AS month_consultations
  FROM period p LEFT JOIN ai_usage u ON u.month=p.month
)
SELECT p.account_daily, p.account_monthly, p.daily_micros, p.monthly_micros, p.warning_percent, p.usage_verified,
  t.*, ROUND(t.day_micros*100.0/p.daily_micros,2) AS day_percent,
  ROUND(t.month_micros*100.0/p.monthly_micros,2) AS month_percent,
  (t.day_micros*100>=p.daily_micros*p.warning_percent OR t.month_micros*100>=p.monthly_micros*p.warning_percent) AS warning,
  p.enabled FROM ai_usage_policy p CROSS JOIN totals t WHERE p.id=1;

-- Maximum Account quota use, anonymous output. Never print account_key or identity_tag.
WITH counts AS (
  SELECT SUM(day=date('now','+9 hours')) AS daily, COUNT(*) AS monthly
  FROM ai_usage WHERE month=strftime('%Y-%m','now','+9 hours') GROUP BY account_key
)
SELECT COALESCE(MAX(daily),0) AS max_account_daily, COALESCE(MAX(monthly),0) AS max_account_monthly FROM counts;

SELECT MIN(day) AS oldest_detail_day, COUNT(*) AS detail_rows,
  SUM(state='reserved') AS unsettled_reservations FROM ai_usage;
