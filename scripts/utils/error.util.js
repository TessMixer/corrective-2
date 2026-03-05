window.addEventListener('error', function (e) {
  console.error('Global Error:', e.message);
  NotificationUI.show('System error occurred', 'error');
});