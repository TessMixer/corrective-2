const TICKET_SEQUENCE_KEY = "symphonyTicketSequence";

function getCurrentYYMM(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

function loadTicketSequenceMap() {
  try {
    const raw = localStorage.getItem(TICKET_SEQUENCE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Failed to parse symphony ticket sequence map", error);
    return {};
  }
}

function saveTicketSequenceMap(sequenceMap) {
  localStorage.setItem(TICKET_SEQUENCE_KEY, JSON.stringify(sequenceMap));
}

export function generateSymphonyTicket() {
  const yymm = getCurrentYYMM();
  const sequenceMap = loadTicketSequenceMap();
  const nextSequence = (Number(sequenceMap[yymm]) || 0) + 1;

  sequenceMap[yymm] = nextSequence;
  saveTicketSequenceMap(sequenceMap);

  return `S${yymm}-${String(nextSequence).padStart(6, "0")}`;
}
