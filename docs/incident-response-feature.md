# Incident Response Grouping (Alert Monitor → Corrective)

## 1) Database schema

> Grouping key: `incident_number`

```sql
-- Alert rows (1 incident_number can have many rows/nodes)
CREATE TABLE alerts (
  id BIGSERIAL PRIMARY KEY,
  incident_number VARCHAR(32) NOT NULL,
  node VARCHAR(255) NOT NULL,
  alarm TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  workflow_stage VARCHAR(32) NOT NULL DEFAULT 'ALERT_MONITOR',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_incident_number ON alerts(incident_number);

-- Symphony tickets under an alert/incident
CREATE TABLE symphony_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_no VARCHAR(64) NOT NULL,
  incident_number VARCHAR(32) NOT NULL,
  cid VARCHAR(128),
  port VARCHAR(128),
  down_time TIMESTAMP,
  clear_time TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (ticket_no, incident_number)
);

CREATE INDEX idx_tickets_incident_number ON symphony_tickets(incident_number);

-- 1 corrective card per incident_number (idempotent key)
CREATE TABLE corrective_cards (
  incident_number VARCHAR(32) PRIMARY KEY,
  node TEXT,
  alarm TEXT,
  root_cause TEXT,
  solution TEXT,
  remark TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'PROCESS',
  source_status VARCHAR(32) NOT NULL DEFAULT 'ALERT_MONITOR',
  target_status VARCHAR(32) NOT NULL DEFAULT 'CORRECTIVE',
  work_type VARCHAR(32),
  eta VARCHAR(32),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Link all incident tickets into one corrective card
CREATE TABLE corrective_card_tickets (
  incident_number VARCHAR(32) NOT NULL REFERENCES corrective_cards(incident_number) ON DELETE CASCADE,
  ticket_no VARCHAR(64) NOT NULL,
  PRIMARY KEY (incident_number, ticket_no)
);
```

## 2) Backend API logic

### Endpoint

`POST /.netlify/functions/respond-incident`

Payload:

```json
{
  "incident_number": "I2509-002222",
  "work_type": "Fiber",
  "eta": "2h"
}
```

### Behavior

1. Validate `incident_number`.
2. Query all alert rows where `incident == incident_number`.
3. Merge/de-duplicate all tickets across those rows.
4. Upsert one corrective document keyed by `incident_number`.
5. Update all matching alert rows to status `PROCESS` and stage `CORRECTIVE`.
6. Return counts of moved rows/tickets.

Implementation reference: `netlify/functions/respond-incident.js`.

## 3) Frontend Response button handler

When user clicks **Response** and confirms modal:

- Collect selected incident id.
- Gather all in-memory alert rows sharing that incident.
- Merge all tickets from those rows.
- Enforce idempotency in UI state by removing any existing corrective card with same incident id, then inserting one card.
- Call backend API for durable upsert and status transition.

Implementation reference: `scripts/services/alert.service.js` (`responseAlert`).

## 4) Example SQL queries (grouping by incident_number)

```sql
-- All alert monitor rows for the selected incident
SELECT incident_number, node, alarm, status
FROM alerts
WHERE incident_number = $1;

-- All tickets across rows with same incident
SELECT ticket_no, cid, port, down_time, clear_time
FROM symphony_tickets
WHERE incident_number = $1
ORDER BY ticket_no;

-- Build one card (idempotent upsert)
INSERT INTO corrective_cards (
  incident_number, node, alarm, status, source_status, target_status, work_type, eta, updated_at
)
SELECT
  a.incident_number,
  STRING_AGG(DISTINCT a.node, ', ') AS node,
  STRING_AGG(DISTINCT a.alarm, ' | ') AS alarm,
  'PROCESS',
  'ALERT_MONITOR',
  'CORRECTIVE',
  $2,
  $3,
  NOW()
FROM alerts a
WHERE a.incident_number = $1
GROUP BY a.incident_number
ON CONFLICT (incident_number)
DO UPDATE SET
  node = EXCLUDED.node,
  alarm = EXCLUDED.alarm,
  status = 'PROCESS',
  target_status = 'CORRECTIVE',
  work_type = EXCLUDED.work_type,
  eta = EXCLUDED.eta,
  updated_at = NOW();

-- Attach all incident tickets to the one corrective card
INSERT INTO corrective_card_tickets (incident_number, ticket_no)
SELECT incident_number, ticket_no
FROM symphony_tickets
WHERE incident_number = $1
ON CONFLICT (incident_number, ticket_no) DO NOTHING;

-- Move incident status from Alert Monitor to Corrective
UPDATE alerts
SET status = 'PROCESS', workflow_stage = 'CORRECTIVE', updated_at = NOW()
WHERE incident_number = $1;
```