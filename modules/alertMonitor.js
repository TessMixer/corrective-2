import { getActiveIncidents, upsertActiveIncident } from "../services/incident.service.js";
import { nowIso } from "../services/time.service.js";

export function createIncidentFromAlert({
  incidentNumber,
  nodes = [],
  startTime = nowIso(),
  responseTime = null,
} = {}) {
  const incident = {
    incidentNumber,
    startTime,
    responseTime,
    nodes,
  };

  return upsertActiveIncident(incident);
}

export function listActiveIncidents() {
  return getActiveIncidents();
}
