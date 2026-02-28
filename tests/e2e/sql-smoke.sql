CREATE SCHEMA IF NOT EXISTS mcp_e2e;

CREATE TABLE IF NOT EXISTS mcp_e2e.health_checks (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  check_name TEXT NOT NULL,
  ok BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO mcp_e2e.health_checks (run_id, check_name, ok)
VALUES
  ('run-a', 'bootstrap', TRUE),
  ('run-a', 'variables', TRUE),
  ('run-b', 'bootstrap', TRUE);

UPDATE mcp_e2e.health_checks
SET check_name = 'sql-smoke'
WHERE run_id = 'run-b' AND check_name = 'bootstrap';

SELECT run_id, COUNT(*)::INT AS checks
FROM mcp_e2e.health_checks
GROUP BY run_id
ORDER BY run_id;
