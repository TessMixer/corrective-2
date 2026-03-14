# NOC Incident Flow (localStorage based)

This implementation uses three localStorage collections:

- `activeIncidents`
- `incidentHistory`
- `dataSheet`

## Flow

1. Alert Monitor creates/updates incidents in `activeIncidents`.
2. Corrective finishes incident via `finishIncident(incidentNumber)`.
3. System generates one Symphony ticket per node.
4. System appends one row per node into `dataSheet`.
5. System moves incident record to `incidentHistory` and removes it from `activeIncidents`.

## Example button

```html
<button onclick="finishIncident('I2503-000123')">
  Finish Incident
</button>
```

## Core modules

- `services/ticket.service.js`: `generateSymphonyTicket()`
- `services/time.service.js`: `calcDowntime(startTime, finishTime)`
- `services/incident.service.js`: `finishIncident(incidentNumber)` and collection operations
- `modules/alertMonitor.js`: create/list active incidents
- `modules/corrective.js`: finish incident and emit event
- `modules/history.js`: list/render incident history
- `modules/datasheet.js`: list/render data sheet
