const jwt = require('jsonwebtoken');
const jwtSecret = () => process.env.JWT_SECRET || 'potholetrack-dev-secret-change-me';

const ROLE_RANKS = {
  citizen: 0,
  worker: 1,
  engineer: 2,
  supervisor: 3,
  commissioner: 4,
  admin: 4,
};

const normalizeRole = (role) => (role === 'admin' ? 'commissioner' : role);

const hasRole = (actualRole, allowedRoles) => {
  const actualRank = ROLE_RANKS[actualRole];
  if (actualRank === undefined) return false;

  return allowedRoles.some((role) => {
    if (actualRole === role || normalizeRole(actualRole) === role) return true;
    const requiredRank = ROLE_RANKS[role];
    return requiredRank !== undefined && actualRank >= requiredRank;
  });
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.auth || !req.auth.role) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!hasRole(req.auth.role, roles)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, jwtSecret());
    req.auth = {
      ...decoded,
      sub: decoded.sub || decoded.id,
    };
  } catch {
    // Public endpoints should continue anonymously when a token is missing or stale.
  }

  next();
};

module.exports = {
  ROLE_RANKS,
  normalizeRole,
  hasRole,
  requireRole,
  optionalAuth,
};
