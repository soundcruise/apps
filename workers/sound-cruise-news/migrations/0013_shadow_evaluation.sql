-- Immutable shadow observations; never updates candidates or legacy decisions.
CREATE TABLE news_shadow_evaluations (
 evaluation_id TEXT PRIMARY KEY,
 candidate_id TEXT NOT NULL,
 candidate_revision INTEGER NOT NULL,
 candidate_snapshot TEXT NOT NULL,
 evaluated_at INTEGER NOT NULL,
 policy_version TEXT NOT NULL,
 rule_version TEXT NOT NULL,
 recommendation TEXT NOT NULL CHECK(recommendation IN ('RECOMMEND_APPROVE','RECOMMEND_REJECT','NO_RECOMMENDATION')),
 profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
 evaluation_json TEXT NOT NULL CHECK(json_valid(evaluation_json))
);
CREATE INDEX news_shadow_candidate ON news_shadow_evaluations(candidate_id,candidate_revision,evaluated_at DESC);
CREATE INDEX news_shadow_versions ON news_shadow_evaluations(policy_version,rule_version,evaluated_at);
-- Same SQL transaction as the existing human decision/feedback trigger.
-- Old Operator versions without an evaluation ID remain compatible during rollout.
CREATE TRIGGER news_shadow_human_commit BEFORE INSERT ON news_decision_ledger
WHEN NEW.actor_type='human_operator' AND json_extract(NEW.decision_features_json,'$.shadowEvaluation.evaluationId') IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'stale_shadow_evaluation') WHERE
 json_extract(NEW.decision_features_json,'$.shadowEvaluation.candidateId') IS NOT NEW.candidate_id OR
 json_extract(NEW.decision_features_json,'$.shadowEvaluation.candidateRevision') IS NOT NEW.candidate_revision OR
 json_extract(NEW.decision_features_json,'$.shadowEvaluation.candidateSnapshot') IS NOT NEW.candidate_snapshot OR
 json_extract(NEW.decision_features_json,'$.shadowEvaluation.policyVersion') IS NOT NEW.policy_version OR
 json_extract(NEW.decision_features_json,'$.shadowEvaluation.generatedAt')>NEW.decided_at OR
 json_extract(NEW.decision_features_json,'$.shadowEvaluation.generatedAt')<NEW.decided_at-1800000;
 INSERT OR IGNORE INTO news_shadow_evaluations
 VALUES(json_extract(NEW.decision_features_json,'$.shadowEvaluation.evaluationId'),NEW.candidate_id,NEW.candidate_revision,NEW.candidate_snapshot,
 json_extract(NEW.decision_features_json,'$.shadowEvaluation.generatedAt'),NEW.policy_version,
 json_extract(NEW.decision_features_json,'$.shadowEvaluation.ruleVersion'),json_extract(NEW.decision_features_json,'$.shadowEvaluation.recommendation'),
 json_extract(NEW.decision_features_json,'$.insightsProfile'),json_extract(NEW.decision_features_json,'$.shadowEvaluation'));
END;
-- Coarse audit evidence follows 365-day retention; lazy expiry on the next insert.
CREATE TRIGGER news_shadow_retention AFTER INSERT ON news_shadow_evaluations
BEGIN
 DELETE FROM news_shadow_evaluations WHERE evaluated_at<=NEW.evaluated_at-31536000000;
END;
