// scripts/utils/date.utils.js
(function() {
  const DateUtils = {
    /**
     * Parse various date formats into a Date object.
     * Supports: ISO, DD/MM/YYYY HH:mm:ss, DD-MM-YYYY HH:mm:ss
     */
    parseDate(dateStr) {
      if (!dateStr) return null;
      if (dateStr instanceof Date) return dateStr;
      
      // Standard parse
      let d = new Date(dateStr);
      if (!Number.isNaN(d.getTime())) return d;

      // Handle DD/MM/YYYY format commonly used in Thailand
      const parts = String(dateStr).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(\s+(\d{1,2}):(\d{1,2})(:(\d{1,2}))?)?/);
      if (parts) {
        const day = parseInt(parts[1], 10);
        const month = parseInt(parts[2], 10) - 1;
        const year = parseInt(parts[3], 10);
        const hour = parseInt(parts[5] || "0", 10);
        const min = parseInt(parts[6] || "0", 10);
        const sec = parseInt(parts[8] || "0", 10);
        d = new Date(year, month, day, hour, min, sec);
        if (!Number.isNaN(d.getTime())) return d;
      }

      return null;
    },

    formatDateTime(dateStr) {
      if (!dateStr) return '-';
      const date = this.parseDate(dateStr);
      if (!date) return String(dateStr);

      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },

    getDurationMinutes(start, end) {
      if (!start) return null;
      const startDate = this.parseDate(start);
      if (!startDate) return null;

      const endDate = end ? this.parseDate(end) : new Date();
      if (!endDate) return null;

      const diff = Math.floor((endDate - startDate) / 60000);
      return Math.max(diff, 0);
    },

    formatDuration(totalMins) {
      if (totalMins === null || totalMins === undefined) return '-';
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;

      if (days > 0) return `${days}d ${remainingHours}h ${mins}m`;
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    }
  };

  window.DateUtils = DateUtils;
})();
