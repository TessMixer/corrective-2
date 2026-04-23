export function calcDowntime(startTime, finishTime) {
  const start = new Date(startTime);
  const finish = new Date(finishTime);

  if (Number.isNaN(start.getTime())) {
    throw new Error(`INVALID_START_TIME: ${startTime}`);
  }
  if (Number.isNaN(finish.getTime())) {
    throw new Error(`INVALID_FINISH_TIME: ${finishTime}`);
  }

  const milliseconds = finish.getTime() - start.getTime();
  return Math.max(0, Math.round(milliseconds / 60000));
}

export function nowIso() {
  return new Date().toISOString();
}
