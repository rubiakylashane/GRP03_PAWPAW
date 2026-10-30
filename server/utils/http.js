function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requiredString(value, field, maxLength = 255) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    const error = new Error(`${field} is required and must be at most ${maxLength} characters.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function passwordError(password, label = 'Password') {
  const missing = [];
  if (password.length < 8) missing.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) missing.push('one uppercase letter');
  if (!/[a-z]/.test(password)) missing.push('one lowercase letter');
  if (!/[0-9]/.test(password)) missing.push('one number');
  if (!/[^A-Za-z0-9\s]/.test(password)) missing.push('one special character');
  return missing.length ? `${label} must include ${missing.join(', ')}.` : null;
}

function notFound(res, message = 'Record not found.') {
  return res.status(404).json({ error: message });
}

module.exports = { asyncRoute, requiredString, passwordError, notFound };
