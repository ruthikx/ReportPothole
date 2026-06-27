const DOMPurify = require('isomorphic-dompurify');

const validateSource = (schema, source) => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req[source] = result.data;
    next();
  };
};

const validate = (schema) => validateSource(schema, 'body');
const validateParams = (schema) => validateSource(schema, 'params');
const validateQuery = (schema) => validateSource(schema, 'query');

const sanitizeDescription = (req, res, next) => {
  if (req.body.description) {
    req.body.description = DOMPurify.sanitize(req.body.description);
  }
  if (req.body.description === '') {
    req.body.description = undefined;
  }
  next();
};

module.exports = { validate, validateParams, validateQuery, sanitizeDescription };
