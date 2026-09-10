const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const morgan = require('morgan');
const compression = require('compression');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Security middleware
const fs = require('fs');
const path = require('path');

// Behind Railway/Nginx/Cloudflare the client IP arrives in X-Forwarded-For.
// Without this, express-rate-limit sees one proxy IP and throttles everybody.
app.set('trust proxy', 1);

// Force HTTPS in production. Leaves localhost development alone.
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
  }
  next();
});

// A missed database connection must never cost a lead, so every enquiry is
// appended here first and MongoDB is treated as the secondary store.
const nodemailer = require('nodemailer');

// Where enquiries are emailed. Must match the address shown on the site.
const NOTIFY_TO = process.env.NOTIFY_EMAIL || 'bluejetholidaypune@gmail.com';

// A placeholder in .env is not a configuration, so treat it as absent rather
// than building a transport that will fail on every send.
function smtpConfigured() {
  const u = process.env.SMTP_USER, p = process.env.SMTP_PASS;
  return Boolean(u && p && !/^your[-_]?/i.test(u) && !/^your[-_]?/i.test(p));
}

let mailer = null;
if (smtpConfigured()) {
  const port = Number(process.env.SMTP_PORT) || 587;
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  mailer.verify()
    .then(() => console.log('SMTP ready - enquiries will be emailed to ' + NOTIFY_TO))
    .catch((err) => console.error('SMTP verify FAILED, enquiries will not be emailed:', err.message));
} else {
  console.warn(
    [
      'SMTP is not configured.',
      'Enquiries are still captured in data/leads.ndjson, but no email will reach ' + NOTIFY_TO + '.',
      'Set SMTP_USER and SMTP_PASS in .env - see "Email notifications" in README.md.'
    ].join('\n  ')
  );
}

function emailLead(lead) {
  if (!mailer) return Promise.resolve(false);

  const lines = [
    'Name:         ' + lead.name,
    'Phone:        ' + lead.phone,
    'Email:        ' + lead.email,
    'Destination:  ' + lead.destination,
    'Travel month: ' + lead.month,
    'Travellers:   ' + lead.pax,
    '',
    'Notes:',
    lead.notes || '(none)'
  ].join('\n');

  return mailer.sendMail({
    from: '"Blue Jet Holidays website" <' + process.env.SMTP_USER + '>',
    to: NOTIFY_TO,
    // So hitting Reply in the inbox writes straight back to the customer.
    replyTo: lead.email,
    subject: 'Enquiry: ' + lead.destination + ' - ' + lead.name,
    text: lines
  })
    .then(() => true)
    .catch((err) => {
      console.error('Enquiry email FAILED (lead is safe in data/leads.ndjson):', err.message);
      return false;
    });
}

const DATA_DIR = path.join(__dirname, 'data');
const LEAD_LOG = path.join(DATA_DIR, 'leads.ndjson');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function persistLead(lead) {
  const row = JSON.stringify(Object.assign({ receivedAt: new Date().toISOString() }, lead));
  fs.appendFile(LEAD_LOG, row + '\n', (err) => {
    if (err) console.error('LEAD WRITE FAILED - capture manually:', row, err.message);
  });
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https://assets.mixkit.co"],
      mediaSrc: ["'self'", "https://assets.mixkit.co"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // strict limit for sensitive endpoints
  message: 'Too many attempts, please try again later.'
});

app.use('/api/', limiter);
// 5 per 15 min is right for a login endpoint and wrong for a lead form:
// a shared office or mobile-carrier NAT would lock out real customers.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many enquiries from this connection. Please call us instead.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/contact', contactLimiter);
app.use('/api/auth', strictLimiter);

// Body parsing and compression
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(compression());

// Logging
app.use(morgan('combined'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bluejet-holidays')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Inquiry Schema
const inquirySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  destination: { type: String, required: true, trim: true },
  month: { type: String, required: true, trim: true },
  pax: { type: Number, required: true },
  notes: { type: String, trim: true },
  status: { type: String, enum: ['pending', 'contacted', 'booked', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const Inquiry = mongoose.model('Inquiry', inquirySchema);

// Destination Schema
const destinationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  country: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  duration: { type: String, required: true },
  videoUrl: { type: String, required: true },
  highlights: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const Destination = mongoose.model('Destination', destinationSchema);

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Routes

// Contact/Inquiry endpoint
app.post('/api/contact', [
  body('name').trim().isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('phone').isMobilePhone('any').trim(),
  body('destination').trim().isLength({ min: 2, max: 100 }).escape(),
  body('month').trim().isLength({ min: 2, max: 20 }).escape(),
  body('pax').isInt({ min: 1, max: 50 }),
  body('notes').optional().trim().escape(),
  // Honeypot. A real browser leaves this empty because nobody can see it.
  body('company').isEmpty().withMessage('rejected')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // express-validator's escape() is a rendering defence, not a storage format.
  // Left as-is, a planner reads "Dubai &amp; Abu Dhabi" off the lead sheet.
  const plain = (v) => typeof v === 'string'
    ? v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/')
       .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    : v;

  const lead = {
    name: plain(req.body.name),
    email: plain(req.body.email),
    phone: plain(req.body.phone),
    destination: plain(req.body.destination),
    month: plain(req.body.month),
    pax: req.body.pax,
    notes: plain(req.body.notes)
  };

  persistLead(lead);

  // Not awaited: the visitor should not wait on an SMTP round trip, and a
  // mail failure must never turn a captured lead into an error response.
  emailLead(lead);

  // readyState 1 is "connected". Anything else and we do not attempt a write
  // that would hang the request until Mongo's server-selection timeout.
  if (mongoose.connection.readyState === 1) {
    try {
      const inquiry = new Inquiry(lead);
      await inquiry.save();
      return res.status(201).json({ message: 'Inquiry submitted successfully', id: inquiry._id });
    } catch (error) {
      console.error('Inquiry DB write failed (lead is safe in leads.ndjson):', error.message);
    }
  }

  return res.status(201).json({ message: 'Inquiry submitted successfully' });
});

// Get all destinations
app.get('/api/destinations', async (req, res) => {
  try {
    const destinations = await Destination.find({ isActive: true });
    res.json(destinations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch destinations' });
  }
});

// Get single destination
app.get('/api/destinations/:id', async (req, res) => {
  try {
    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res.status(404).json({ error: 'Destination not found' });
    }
    res.json(destination);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch destination' });
  }
});

// Admin routes - create destination
app.post('/api/destinations', authenticateToken, requireAdmin, [
  body('name').trim().isLength({ min: 2, max: 100 }).escape(),
  body('country').trim().isLength({ min: 2, max: 50 }).escape(),
  body('description').trim().isLength({ min: 10, max: 500 }).escape(),
  body('price').isFloat({ min: 0 }),
  body('duration').trim().isLength({ min: 2, max: 20 }).escape(),
  body('videoUrl').isURL()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const destination = new Destination(req.body);
    await destination.save();
    res.status(201).json({ message: 'Destination created successfully', id: destination._id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create destination' });
  }
});

// Admin routes - get all inquiries
app.get('/api/inquiries', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 });
    res.json(inquiries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inquiries' });
  }
});

// Admin routes - update inquiry status
app.put('/api/inquiries/:id', authenticateToken, requireAdmin, [
  body('status').isIn(['pending', 'contacted', 'booked', 'cancelled'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const inquiry = await Inquiry.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    if (!inquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    res.json({ message: 'Inquiry status updated', inquiry });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update inquiry' });
  }
});

// Auth routes - register admin
app.post('/api/auth/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({
      email: req.body.email,
      password: hashedPassword,
      role: 'admin'
    });
    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Auth routes - login
app.post('/api/auth/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(req.body.password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Browsers ask for /favicon.ico regardless of the <link rel="icon"> tag.
// Answer once rather than logging a 404 on every single page load.
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Serve static files
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, {
  dotfiles: 'deny',
  index: 'index.html',
  setHeaders: (res, filePath) => {
    // Fingerprint-free filenames, so HTML must always be revalidated while
    // the media it points at can sit in cache.
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    else if (/\.(mp4|jpg|jpeg|png|svg|webp|woff2)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
