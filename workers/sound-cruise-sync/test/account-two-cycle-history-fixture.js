// Installed exclusively into disposable test DBs, never production migrations.
export const TWO_CYCLE_HISTORY_SCHEMA=`CREATE TABLE sync_account_two_cycle_history(account_id TEXT NOT NULL,device_id TEXT NOT NULL,packet_json TEXT NOT NULL,packet_digest TEXT NOT NULL,PRIMARY KEY(account_id,device_id));`;
export function installTwoCycleHistoryFixture(db){db.raw.exec(TWO_CYCLE_HISTORY_SCHEMA);}
