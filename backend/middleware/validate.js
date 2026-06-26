const DOMPurify = require('isomorphic-dompurify');

const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req.body = result.data;
    next();
  };
};

const sanitizeDescription = (req, res, next) => {
  if (req.body.description) {
    req.body.description = DOMPurify.sanitize(req.body.description);
  }
  if (req.body.description === '') {
    req.body.description = undefined;
  }
  next();
};

module.exports = { validate, sanitizeDescription };
