import { finishIncident as finishIncidentService } from "../services/incident.service.js";

export function finishIncident(incidentNumber) {
  const result = finishIncidentService(incidentNumber);
  document.dispatchEvent(
    new CustomEvent("incident:finished", {
      detail: result,
    })
  );
  return result;
}

window.finishIncident = finishIncident;
