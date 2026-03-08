function can(user, action) {

  const map = {
    createAlert: ['admin', 'operator'],
    assignCorrective: ['admin', 'operator'],
    closeIncident: ['admin']
  };

  return map[action]?.includes(user.role);
}