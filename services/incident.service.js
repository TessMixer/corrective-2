import { generateSymphonyTicket } from "./ticket.service.js";
import { calcDowntime, nowIso } from "./time.service.js";

const COLLECTIONS = {
  activeIncidents: "activeIncidents",
  incidentHistory: "incidentHistory",
  dataSheet: "dataSheet",
};

function readCollection(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`Failed to parse collection: ${key}`, error);
    return [];
  }
}

function writeCollection(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function toSafeIsoTime(value, fallback) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  const fb = new Date(fallback);
  if (!Number.isNaN(fb.getTime())) return fb.toISOString();

  return new Date().toISOString();
}


function validateIncident(incident) {
  if (!incident || typeof incident !== "object") {
    throw new Error("INVALID_INCIDENT_PAYLOAD");
  }
  if (!incident.incidentNumber) {
    throw new Error("INCIDENT_NUMBER_REQUIRED");
  }
  if (!incident.startTime) {
    throw new Error("START_TIME_REQUIRED");
  }
  if (!Array.isArray(incident.nodes) || incident.nodes.length === 0) {
    throw new Error("AT_LEAST_ONE_NODE_REQUIRED");
  }
}

export function getActiveIncidents() {
  return readCollection(COLLECTIONS.activeIncidents);
}

export function getIncidentHistory() {
  return readCollection(COLLECTIONS.incidentHistory);
}

export function getDataSheetRows() {
  return readCollection(COLLECTIONS.dataSheet);
}

export function upsertActiveIncident(incident) {
  validateIncident(incident);

  const incidents = getActiveIncidents();
  const next = incidents.some((item) => item.incidentNumber === incident.incidentNumber)
    ? incidents.map((item) => (item.incidentNumber === incident.incidentNumber ? incident : item))
    : [...incidents, incident];

  writeCollection(COLLECTIONS.activeIncidents, next);
  return incident;
}

export function finishIncident(incidentNumber) {
  if (!incidentNumber) {
    throw new Error("INCIDENT_NUMBER_REQUIRED");
  }

  const activeIncidents = getActiveIncidents();
  const incidentIndex = activeIncidents.findIndex((item) => item.incidentNumber === incidentNumber);

  if (incidentIndex < 0) {
    throw new Error(`INCIDENT_NOT_FOUND: ${incidentNumber}`);
  }

  const incident = activeIncidents[incidentIndex];
  validateIncident(incident);

  const finishTime = nowIso();
  const incidentStartTime = toSafeIsoTime(incident.startTime, finishTime);
  const dataSheet = getDataSheetRows();

  const rows = incident.nodes.map((nodeInfo) => {
    const nodeStartTime = toSafeIsoTime(nodeInfo.startTime, incidentStartTime);
    const nodeResponseTime = nodeInfo.responseTime ?? incident.responseTime ?? null;
    const ticketFromIncident = nodeInfo.symphonyTicket || nodeInfo.ticket || "";

    return {
      incidentNumber: incident.incidentNumber,
      symphonyTicket: ticketFromIncident || generateSymphonyTicket(),
      node: nodeInfo.node,
      alarm: nodeInfo.alarm,
      cid: nodeInfo.cid || "",
      detail: nodeInfo.detail || "",
      subContractors: Array.isArray(nodeInfo.subContractors) ? nodeInfo.subContractors : [],
      causeOfIncident: nodeInfo.causeOfIncident || "",
      hopRoad: nodeInfo.hopRoad || "",
      latLong: nodeInfo.latLong || "",
      delayBy: nodeInfo.delayBy || "",
      customerTrunk: nodeInfo.customerTrunk || "",
      controlStatus: nodeInfo.controlStatus || "",
      team: nodeInfo.team || "",
      mainCause: nodeInfo.mainCause || "",
      rootCauseFromSymc: nodeInfo.rootCauseFromSymc || "",
      rootCauseFromSub: nodeInfo.rootCauseFromSub || "",
      rootCauseFromCustomer: nodeInfo.rootCauseFromCustomer || "",
      rootCauseFromUncontrol: nodeInfo.rootCauseFromUncontrol || "",
      prevention: nodeInfo.prevention || "",
      startTime: nodeStartTime,
      responseTime: nodeResponseTime,
      finishTime,
      downtimeMinutes: calcDowntime(nodeStartTime, finishTime),
    };
  });

  const closedIncident = {
    ...incident,
    finishTime,
    status: "finished",
    finishedNodes: rows.map((row) => ({
      node: row.node,
      alarm: row.alarm,
      symphonyTicket: row.symphonyTicket,
      downtimeMinutes: row.downtimeMinutes,
    })),
  };

  const nextActive = activeIncidents.filter((item) => item.incidentNumber !== incidentNumber);
  const history = getIncidentHistory();

  writeCollection(COLLECTIONS.dataSheet, [...dataSheet, ...rows]);
  writeCollection(COLLECTIONS.incidentHistory, [...history, closedIncident]);
  writeCollection(COLLECTIONS.activeIncidents, nextActive);

  return {
    incident: closedIncident,
    dataSheetRows: rows,
  };
}

export function seedCollections({ activeIncidents = [], incidentHistory = [], dataSheet = [] } = {}) {
  writeCollection(COLLECTIONS.activeIncidents, activeIncidents);
  writeCollection(COLLECTIONS.incidentHistory, incidentHistory);
  writeCollection(COLLECTIONS.dataSheet, dataSheet);
}
