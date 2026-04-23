import { getDataSheetRows } from "../services/incident.service.js";

export function listDataSheetRows() {
  return getDataSheetRows();
}

export function renderDataSheetTable(targetSelector) {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  const rows = listDataSheetRows();
  target.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.incidentNumber}</td>
        <td>${row.symphonyTicket}</td>
        <td>${row.node}</td>
        <td>${row.alarm}</td>
        <td>${row.startTime}</td>
        <td>${row.responseTime ?? "-"}</td>
        <td>${row.finishTime}</td>
        <td>${row.downtimeMinutes}</td>
      </tr>
    `
    )
    .join("");
}
