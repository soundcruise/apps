-- Old signatures cannot be converted without the raw title. Keep records quarantined.
UPDATE candidate_items SET title_fingerprint=NULL,
 review_status=CASE WHEN review_status='rejected' THEN 'rejected' ELSE 'pending' END,
 review_reason='legacy_pepper_recollection_required',reviewed_at=NULL,reviewed_by=NULL,
 review_checks=NULL,article_checks=NULL;
ALTER TABLE candidate_items DROP COLUMN title_hash;
UPDATE news_controls SET revision=revision+1 WHERE id=1;
