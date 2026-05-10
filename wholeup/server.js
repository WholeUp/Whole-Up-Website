require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Middleware ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for contact form
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// ─── Template Engine ─────────────────────────────────────────────────────────
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    eq: (a, b) => a === b,
    json: (obj) => JSON.stringify(obj),
    stars: (rating) => {
      let html = '';
      const full = Math.floor(rating);
      const half = (rating % 1) >= 0.4;
      for (let i = 0; i < full; i++) html += '<i class="fas fa-star"></i>';
      if (half) html += '<i class="fas fa-star-half-alt"></i>';
      return html;
    }
  }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// ─── Data ────────────────────────────────────────────────────────────────────
const services = require('./data/services.json');
const testimonials = require('./data/testimonials.json');
const portfolio = require('./data/portfolio.json');
const blogPosts = require('./data/blog.json');
const faqs = require('./data/faqs.json');
const pricing = require('./data/pricing.json');

// ─── Routes ──────────────────────────────────────────────────────────────────

// HOME
app.get('/', (req, res) => {
  res.render('home', {
    title: 'Wholeup | Full-Funnel Digital Marketing Agency',
    metaDesc: 'Wholeup is a results-driven digital marketing agency helping businesses scale with SEO, paid ads, social media, and conversion-first websites.',
    page: 'home',
    services: services.slice(0, 6),
    testimonials,
    portfolio: portfolio.slice(0, 6),
    featuredPosts: blogPosts.slice(0, 4)
  });
});

// ABOUT
app.get('/about', (req, res) => {
  res.render('about', {
    title: 'About Wholeup | Who We Are',
    metaDesc: 'Learn about Wholeup Digital Marketing Agency — our story, team, values, and what makes us different.',
    page: 'about'
  });
});

// SERVICES
app.get('/services', (req, res) => {
  res.render('services', {
    title: 'Our Services | Wholeup Digital Marketing',
    metaDesc: 'Full-service digital marketing: SEO, Google Ads, Meta Ads, Social Media, Web Design, Email Marketing and more.',
    page: 'services',
    services
  });
});

// Single Service
app.get('/services/:slug', (req, res) => {
  const service = services.find(s => s.slug === req.params.slug);
  if (!service) return res.redirect('/services');
  res.render('service-single', {
    title: `${service.title} | Wholeup`,
    metaDesc: service.description,
    page: 'services',
    service,
    related: services.filter(s => s.slug !== service.slug).slice(0, 3)
  });
});

// PORTFOLIO
app.get('/portfolio', (req, res) => {
  res.render('portfolio', {
    title: 'Portfolio & Case Studies | Wholeup',
    metaDesc: 'See our proven results — case studies showing how we grew businesses with digital marketing.',
    page: 'portfolio',
    portfolio
  });
});

// PRICING
app.get('/pricing', (req, res) => {
  res.render('pricing', {
    title: 'Pricing Plans | Wholeup Digital Marketing',
    metaDesc: 'Transparent pricing for SEO, social media, paid ads, and full-stack digital marketing. No hidden fees.',
    page: 'pricing',
    pricing
  });
});

// BLOG
app.get('/blog', (req, res) => {
  res.render('blog', {
    title: 'Digital Marketing Blog | Wholeup Insights',
    metaDesc: 'Expert tips, strategies, and insights on SEO, paid ads, social media, and digital growth.',
    page: 'blog',
    posts: blogPosts
  });
});

// Single Blog Post
app.get('/blog/:slug', (req, res) => {
  const post = blogPosts.find(p => p.slug === req.params.slug);
  if (!post) return res.redirect('/blog');
  res.render('blog-single', {
    title: `${post.title} | Wholeup Blog`,
    metaDesc: post.excerpt,
    page: 'blog',
    post,
    related: blogPosts.filter(p => p.slug !== post.slug).slice(0, 3)
  });
});

// FAQ
app.get('/faq', (req, res) => {
  res.render('faq', {
    title: 'Frequently Asked Questions | Wholeup',
    metaDesc: 'Got questions? We have answers. Learn everything about our digital marketing services, pricing, and process.',
    page: 'faq',
    faqs
  });
});

// CONTACT PAGE
app.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Contact Wholeup | Book a Free Strategy Call',
    metaDesc: 'Get in touch with Wholeup. Book a free consultation and let us build your digital growth strategy.',
    page: 'contact'
  });
});

// PRIVACY POLICY
app.get('/privacy', (req, res) => {
  res.render('privacy', {
    title: 'Privacy Policy | Wholeup',
    page: 'privacy'
  });
});

// TERMS
app.get('/terms', (req, res) => {
  res.render('terms', {
    title: 'Terms of Service | Wholeup',
    page: 'terms'
  });
});

// ─── API: Contact Form Submission ─────────────────────────────────────────────
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, phone, city, email, service, message } = req.body;

  // Basic validation
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
  }

  // Save to a simple JSON log (in production, use a database)
  const fs = require('fs');
  const logPath = path.join(__dirname, 'data/leads.json');
  let leads = [];
  try { leads = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch(e) { leads = []; }
  leads.push({ name, phone, city, email, service, message, date: new Date().toISOString() });
  fs.writeFileSync(logPath, JSON.stringify(leads, null, 2));

  // Send email (configure SMTP in .env)
  try {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({
        from: `"Wholeup Website" <${process.env.SMTP_USER}>`,
        to: 'wholeup.agency@gmail.com',
        subject: `New Lead from ${name} — ${service || 'General Inquiry'}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#16A34A;padding:24px;border-radius:12px 12px 0 0;">
              <h2 style="color:white;margin:0;font-size:20px;">New Lead from Wholeup Website</h2>
            </div>
            <div style="background:#f9f9f9;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
              <p><strong>City:</strong> ${city || 'Not provided'}</p>
              <p><strong>Service Interested In:</strong> ${service || 'Not specified'}</p>
              <p><strong>Message:</strong><br>${message}</p>
              <p style="color:#999;font-size:12px;margin-top:24px;">Submitted: ${new Date().toLocaleString('en-IN')}</p>
            </div>
          </div>
        `
      });
    }
  } catch (emailErr) {
    console.error('Email error:', emailErr.message);
  }

  res.json({ success: true, message: 'Thank you! We\'ll contact you within 24 hours.' });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found | Wholeup', page: '404' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Wholeup server running at http://localhost:${PORT}`);
});
