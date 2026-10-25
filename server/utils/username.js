const USERNAME_PATTERN = /^[a-z0-9_]{4,20}$/;

function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}

module.exports = { normalizeUsername };
