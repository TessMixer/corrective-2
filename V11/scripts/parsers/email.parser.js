// scripts/services/email.parser.js

const EmailParser = {

  extractTicketId(subject) {
    const match = subject.match(/I\d{4}-\d{3}/);
    return match ? match[0] : 'UNKNOWN';
  },

  extractField(body, field) {
    const regex = new RegExp(`${field}:\\s*(.*)`);
    const match = body.match(regex);
    return match ? match[1].trim() : '-';
  },

  toAlert(email) {
    return {
      jobId: this.extractTicketId(email.subject),
      project: this.extractField(email.body, 'Project'),
      agency: this.extractField(email.body, 'Agency'),
      location: this.extractField(email.body, 'Location'),
      planDate: this.extractField(email.body, 'PlanDate'),
      actionDate: this.extractField(email.body, 'ActionDate'),
      status: 'PROCESS',
      sourceMailId: email.id
    };
  }

};