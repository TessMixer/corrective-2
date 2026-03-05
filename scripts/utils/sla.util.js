function calcMinutes(from, to) {
  return Math.floor((new Date(to) - new Date(from)) / 60000);
}

function isOverResponseSLA(incident) {
  if (!incident.timeline.respondedAt) return false;

  const diff = calcMinutes(
    incident.timeline.openedAt,
    incident.timeline.respondedAt
  );

  return diff > 15; // 15 นาที SLA
}