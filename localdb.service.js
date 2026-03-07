// scripts/repositories/email.repository.js

const EmailRepository = (function () {

  const mockEmails = [
    {
      id: 'mail-001',
      subject: 'NS Alert Ticket I2603-008 - Interruption OFC',
      from: 'noc@symphony.net.th',
      receivedAt: '2026-03-18T08:30:00',
      body: `
        Project: RCA Reroute
        Agency: Landlord
        Location: RCA Telehouse
        PlanDate: 25/2/2569
        ActionDate: 18/3/2569 00:00-05:00
      `
    },
    {
      id: 'mail-002',
      subject: 'NS Alert Ticket I2603-007 - Interruption Equipment',
      from: 'noc@symphony.net.th',
      receivedAt: '2026-03-18T09:00:00',
      body: `
        Project: Lat Phrao Phase 2
        Agency: NBTC
        Location: Lat Phrao 52
        PlanDate: 26/2/2569
        ActionDate: 17/3/2569 00:00-05:00
      `
    }
  ];

  async function getUnreadAlerts() {
    return new Promise(resolve => {
      setTimeout(() => resolve(structuredClone(mockEmails)), 500);
    });
  }

  return {
    getUnreadAlerts
  };

})();