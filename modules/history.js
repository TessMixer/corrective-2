import { getIncidentHistory } from "../services/incident.service.js";

export function listIncidentHistory() {
  return getIncidentHistory();
}

export function renderIncidentHistoryTable(targetSelector) {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  const rows = listIncidentHistory();
  target.innerHTML = rows
    .map(
      (incident) => `
      <tr>
        <td>${incident.incidentNumber}</td>
        <td>${incident.startTime}</td>
        <td>${incident.responseTime ?? "-"}</td>
        <td>${incident.finishTime ?? "-"}</td>
        <td>${incident.nodes?.length ?? 0}</td>
      </tr>
    `
    )
    .join("");
}
