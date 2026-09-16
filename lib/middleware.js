const FREE_SUB_LIMIT = 5;

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "not_authenticated", message: "Log in to continue." });
  }
  next();
}

module.exports = { requireAuth, FREE_SUB_LIMIT };
