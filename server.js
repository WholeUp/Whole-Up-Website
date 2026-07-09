require('dotenv').config();
const express = require('express');
const compression = require('compression');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const nodemailer = require('nodemailer');

// ─── Gemini API Key Rotation (auto-switch when quota exceeded) ─────────────────
async function getGeminiResponse(prompt, systemInstruction = null, contentsArray = null) {
  const { GoogleGenAI } = require('@google/genai');
  // All available API keys — add more here when needed
  const apiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter(k => k && k.trim() !== '');

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'];
  let lastError = null;

  for (const apiKey of apiKeys) {
    for (const model of models) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const contents = contentsArray || [{ role: 'user', parts: [{ text: prompt }] }];
        const config = systemInstruction ? { systemInstruction } : {};
        const result = await ai.models.generateContent({ model, contents, config });
        console.log(`✅ Gemini success — key: ...${apiKey.slice(-6)}, model: ${model}`);
        return result.text;
      } catch (err) {
        const is429 = err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('quota'));
        const is404 = err.message && err.message.includes('404');
        if (is429) {
          console.warn(`⚠️ Key ...${apiKey.slice(-6)} quota exceeded on ${model}, trying next...`);
          break; // Try next key (this key is exhausted)
        } else if (is404) {
          console.warn(`⚠️ Model ${model} not found for key ...${apiKey.slice(-6)}, trying next model...`);
          lastError = err;
          continue; // Try next model
        } else {
          lastError = err;
          continue;
        }
      }
    }
  }
  throw lastError || new Error('All Gemini API keys and models are exhausted.');
}

const app = express();
app.use(compression());
const PORT = process.env.PORT || 3000;

// ─── Security & Middleware ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to inject canonical URL to all rendered pages
app.use((req, res, next) => {
  res.locals.canonicalUrl = `https://wholeup.in${req.path === '/' ? '' : req.path}`;
  res.locals.gaId = process.env.GA_TRACKING_ID || 'G-XXXXXXXXXX';
  res.locals.fbPixelId = process.env.FB_PIXEL_ID || '287654321012345';
  next();
});

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
const aiServices = require('./data/ai-services.json');

// ─── Lead Scoring Engine ────────────────────────────────────────────────────
function scoreLead(leadData) {
  let score = 0;
  const { name, phone, email, service, message, city } = leadData;

  // Phone provided = high intent
  if (phone && phone !== 'Not provided' && phone.length >= 10) score += 30;

  // Email provided and not gmail/yahoo (business email = more serious)
  if (email && email !== 'Not provided') {
    score += 10;
    if (!email.includes('gmail') && !email.includes('yahoo') && !email.includes('hotmail')) score += 15;
  }

  // High-value services
  const highValueServices = ['ppc-google-ads', 'meta-ads', 'ecommerce-marketing', 'seo', 'marketing-automation', 'ai-', 'voice-ai', 'Grader'];
  if (service && highValueServices.some(s => service.toLowerCase().includes(s.toLowerCase()))) score += 25;

  // Message length = more effort = more serious
  if (message && message.length > 100) score += 10;
  if (message && message.length > 250) score += 10;

  // Name quality (not just one word)
  if (name && name.trim().includes(' ')) score += 5;

  // Determine label
  let label, emoji;
  if (score >= 65) { label = 'Hot'; emoji = '🔥'; }
  else if (score >= 35) { label = 'Warm'; emoji = '⚡'; }
  else { label = 'Cold'; emoji = '❄️'; }

  return { score, label, emoji };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// HOME
app.get('/', (req, res) => {
  res.render('home', {
    title: 'Wholeup | Digital Marketing Agency | SEO & Ads',
    metaDesc: 'Wholeup is a digital marketing agency in Surat. We offer expert SEO, Google Ads, Meta Ads, Web Design, and WhatsApp Automation.',
    canonicalUrl: 'https://wholeup.in',
    metaKeywords: 'digital marketing agency Surat, SEO agency Surat, Google Ads agency, Meta Ads agency, paid ads, WhatsApp automation, web design Surat, social media marketing Surat, case studies, Wholeup',
    ogImage: 'https://wholeup.in/favicon.png',
    page: 'home',
    services: services.slice(0, 6),
    testimonials,
    portfolio: portfolio.slice(0, 6),
    featuredPosts: blogPosts.slice(0, 4)
  });
});

// ABOUT
app.get('/about', (req, res) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "name": "About Wholeup",
    "description": "Learn about Wholeup — a results-driven digital marketing agency in Surat. Our expert team helps businesses grow.",
    "url": "https://wholeup.in/about",
    "publisher": {
      "@type": "Organization",
      "name": "Wholeup",
      "url": "https://wholeup.in",
      "logo": "https://wholeup.in/favicon.png"
    }
  };
  res.render('about', {
    title: 'About Wholeup | Best Digital Marketing Agency in Surat',
    metaDesc: 'Learn about Wholeup — a results-driven digital marketing agency in Surat. Our expert team helps businesses grow with SEO, paid ads, AI automation & creative strategies.',
    canonicalUrl: 'https://wholeup.in/about',
    metaKeywords: 'about Wholeup, digital marketing agency Surat, marketing team Surat, best marketing agency Surat',
    page: 'about',
    loadThree: true,
    schemaMarkup: `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  });
});

// SERVICES
app.get('/services', (req, res) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "provider": {
      "@type": "LocalBusiness",
      "name": "Wholeup - Digital Marketing In Surat",
      "url": "https://wholeup.in",
      "logo": "https://wholeup.in/favicon.png",
      "telephone": "+919725137538",
      "email": "wholeup.agency@gmail.com",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Gujarat",
        "addressRegion": "Gujarat",
        "addressCountry": "IN"
      }
    },
    "serviceType": "Digital Marketing Services",
    "areaServed": "Surat",
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Digital Marketing Services Catalog",
      "itemListElement": services.map(s => ({
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": s.title,
          "description": s.description
        }
      }))
    }
  };
  res.render('services', {
    title: 'Digital Marketing Services in Surat | SEO, Ads, Web Design | Wholeup',
    metaDesc: 'Wholeup offers full-stack digital marketing services in Surat — SEO, Google Ads, Meta Ads, Social Media Marketing, WhatsApp Automation, AI Voice Agents & Conversion-Optimized Websites. Start growing today!',
    canonicalUrl: 'https://wholeup.in/services',
    metaKeywords: 'SEO services Surat, Google Ads agency Surat, Meta Ads Surat, social media marketing, web design Surat, WhatsApp automation, digital marketing services',
    page: 'services',
    services,
    loadThree: true,
    schemaMarkup: `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  });
});

// AI SERVICES
app.get('/ai-services', (req, res) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "provider": {
      "@type": "LocalBusiness",
      "name": "Wholeup - Digital Marketing In Surat",
      "url": "https://wholeup.in",
      "logo": "https://wholeup.in/favicon.png"
    },
    "serviceType": "AI Business Automation",
    "areaServed": "Surat",
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "AI Solutions Catalog",
      "itemListElement": aiServices.map(s => ({
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": s.title,
          "description": s.description
        }
      }))
    }
  };
  res.render('ai-services', {
    title: 'AI Services for Business | 24/7 Voice AI, WhatsApp Automation, AI Chatbot | Wholeup',
    metaDesc: 'Automate your business with Wholeup AI Services — 24/7 AI Voice Call Agents, WhatsApp AI Chatbots, AI Lead Generation, Smart CRM & more. Never miss a lead again. Get FREE demo!',
    canonicalUrl: 'https://wholeup.in/ai-services',
    metaKeywords: 'AI voice agent Surat, WhatsApp automation business, AI chatbot Surat, AI lead generation, business automation Surat, 24/7 AI system',
    page: 'ai-services',
    aiServices,
    schemaMarkup: `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  });
});

// Single Service Metadata Mapping for Local SEO Optimization
const serviceMeta = {
  "seo": {
    title: "SEO Services & SEO Company in Surat | Wholeup",
    metaDesc: "Wholeup is the best SEO agency in Surat. Get top Google rankings, organic search growth, and local Maps SEO. Book your free audit!"
  },
  "website-designing": {
    title: "Website Designing & Development Company in Surat | Wholeup",
    metaDesc: "Professional website designing and web development services in Surat. We build fast, high-converting, mobile-responsive websites."
  },
  "meta-ads": {
    title: "Meta (Facebook & Instagram) Ads Agency in Surat | Wholeup",
    metaDesc: "Get higher ROAS and qualified leads with Surat's top Meta ads agency. Expert campaign setups, retargeting funnels, and creative optimization."
  },
  "ppc-google-ads": {
    title: "Google Ads & PPC Management Company in Surat | Wholeup",
    metaDesc: "Boost sales instantly with expert Google Ads management in Surat. High-ROI search, display, and shopping campaigns. Call today!"
  },
  "whatsapp-marketing": {
    title: "WhatsApp Marketing Automation & API Services in Surat | Wholeup",
    metaDesc: "Reach customers directly on their mobile screens with 98% open rates. Official WhatsApp API setup and automated broadcasts in Surat."
  },
  "local-seo": {
    title: "Local SEO & Google Maps Rankings Company in Surat | Wholeup",
    metaDesc: "Dominate Google Maps 3-Pack and near me searches. Drive store footfall and inquiries with professional local SEO in Surat."
  },
  "social-media-management": {
    title: "Social Media Management & SMM Agency in Surat | Wholeup",
    metaDesc: "Engage your audience and grow followers with top social media management in Surat. Content scheduling, graphic design, and custom captions."
  }
};

// Single Service
app.get('/services/:slug', (req, res) => {
  const service = services.find(s => s.slug === req.params.slug);
  if (!service) return res.redirect('/services');
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": service.title,
    "description": service.description,
    "provider": {
      "@type": "LocalBusiness",
      "name": "Wholeup - Digital Marketing In Surat",
      "url": "https://wholeup.in",
      "logo": "https://wholeup.in/favicon.png"
    }
  };
  const meta = serviceMeta[service.slug] || {
    title: `${service.title} in Surat | Wholeup Digital Marketing`,
    metaDesc: `${service.description} Wholeup provides expert ${service.title} services in Surat. Get a FREE consultation today!`
  };
  res.render('service-single', {
    title: meta.title,
    metaDesc: meta.metaDesc,
    canonicalUrl: `https://wholeup.in/services/${service.slug}`,
    page: 'services',
    service,
    related: services.filter(s => s.slug !== service.slug).slice(0, 3),
    schemaMarkup: `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  });
});

// PORTFOLIO
app.get('/portfolio', (req, res) => {
  res.render('portfolio', {
    title: 'Portfolio & Case Studies | Real Results by Wholeup Digital Marketing',
    metaDesc: 'Explore Wholeup\'s portfolio — real case studies showing how we helped businesses in Surat achieve 2x–5x growth with SEO, paid ads & digital marketing.',
    canonicalUrl: 'https://wholeup.in/portfolio',
    metaKeywords: 'digital marketing case studies Surat, SEO results, ad campaign results, Wholeup portfolio',
    page: 'portfolio',
    portfolio
  });
});

app.get('/portfolio/:slug', (req, res) => {
  const project = portfolio.find(p => p.slug === req.params.slug);
  if (!project) {
    return res.status(404).render('404', { title: '404 - Case Study Not Found' });
  }
  const schema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": project.title,
    "description": project.description,
    "author": {
      "@type": "Organization",
      "name": "Wholeup"
    }
  };
  res.render('portfolio-single', {
    title: `${project.title} Case Study | Wholeup`,
    metaDesc: `${project.description} Read how Wholeup achieved outstanding results: ${project.result}`,
    canonicalUrl: `https://wholeup.in/portfolio/${project.slug}`,
    page: 'portfolio',
    project,
    related: portfolio.filter(p => p.slug !== project.slug).slice(0, 3),
    schemaMarkup: `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  });
});

// APEX STOCK SCANNER MOCKUP DASHBOARD
app.get('/apex-scanner', (req, res) => {
  res.render('portfolio-single', {
    title: 'ApexAI Stock Scanner | Live Interactive Market Analysis',
    metaDesc: 'ApexAI Stock Scanner is an advanced automated stock market scanner with real-time breakout indicator logs and 75-80% analysis accuracy mockup.',
    canonicalUrl: 'https://wholeup.in/apex-scanner',
    page: 'portfolio'
  });
});

// PRICING (Temporary Redirected to Home)
app.get('/pricing', (req, res) => {
  res.redirect('/');
});

// BLOG
app.get('/blog', (req, res) => {
  res.render('blog', {
    title: 'Digital Marketing Blog | SEO Tips, Ads Strategies & Growth Insights | Wholeup',
    metaDesc: 'Read expert digital marketing tips, SEO strategies, Google & Meta Ads guides, and business growth insights from Wholeup — India\'s trusted digital marketing agency.',
    canonicalUrl: 'https://wholeup.in/blog',
    metaKeywords: 'digital marketing blog Surat, SEO tips, Google Ads guide, Meta Ads strategy, social media marketing tips, business growth Surat',
    page: 'blog',
    posts: blogPosts
  });
});

// Single Blog Post
app.get('/blog/:slug', (req, res) => {
  const post = blogPosts.find(p => p.slug === req.params.slug);
  if (!post) return res.redirect('/blog');
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt,
    "datePublished": post.date ? new Date(post.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    "author": {
      "@type": "Organization",
      "name": "Wholeup Team"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Wholeup",
      "logo": {
        "@type": "ImageObject",
        "url": "https://wholeup.in/favicon.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://wholeup.in/blog/${post.slug}`
    }
  };
  res.render('blog-single', {
    title: `${post.title} | Wholeup Digital Marketing Blog`,
    metaDesc: post.excerpt,
    canonicalUrl: `https://wholeup.in/blog/${post.slug}`,
    page: 'blog',
    post,
    related: blogPosts.filter(p => p.slug !== post.slug).slice(0, 3),
    schemaMarkup: `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  });
});

// FAQ
app.get('/faq', (req, res) => {
  const flatFaqs = [];
  if (Array.isArray(faqs)) {
    faqs.forEach(cat => {
      if (cat.items && Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          flatFaqs.push(item);
        });
      }
    });
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": flatFaqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.a
      }
    }))
  };
  res.render('faq', {
    title: 'FAQs | Digital Marketing Agency Questions Answered | Wholeup',
    metaDesc: 'Got questions about digital marketing? Wholeup answers everything — SEO timelines, ad budgets, pricing, process, and how we help your business grow. Read our FAQs.',
    canonicalUrl: 'https://wholeup.in/faq',
    metaKeywords: 'digital marketing FAQ, SEO questions, Google Ads FAQ, marketing agency questions Surat',
    page: 'faq',
    faqs,
    schemaMarkup: `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  });
});

// CONTACT PAGE
app.get('/contact', (req, res) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "name": "Contact Wholeup",
    "description": "Contact Wholeup Digital Marketing Agency in Surat. Book a FREE 30-minute growth strategy call. We help businesses with SEO, Ads, AI Automation & Web Design.",
    "url": "https://wholeup.in/contact"
  };
  res.render('contact', {
    title: 'Contact Wholeup | Book a FREE Digital Marketing Strategy Call',
    metaDesc: 'Contact Wholeup Digital Marketing Agency. Book a FREE 30-minute growth strategy call. We help businesses with SEO, Ads, AI Automation & Web Design. Call: +91 97251 37538.',
    canonicalUrl: 'https://wholeup.in/contact',
    metaKeywords: 'contact digital marketing agency Surat, book marketing consultation, Wholeup contact, free marketing call Surat',
    page: 'contact',
    schemaMarkup: `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  });
});

// PRIVACY POLICY
app.get('/privacy', (req, res) => {
  res.render('privacy', {
    title: 'Privacy Policy | Wholeup Digital Marketing Agency',
    metaDesc: 'Read Wholeup\'s privacy policy. We are committed to protecting your data and personal information.',
    canonicalUrl: 'https://wholeup.in/privacy',
    page: 'privacy'
  });
});

// TERMS
app.get('/terms', (req, res) => {
  res.render('terms', {
    title: 'Terms of Service | Wholeup Digital Marketing Agency',
    metaDesc: 'Read Wholeup\'s terms of service and conditions for using our digital marketing services.',
    canonicalUrl: 'https://wholeup.in/terms',
    page: 'terms'
  });
});

// Helper function to get cookie by name
const getCookie = (req, name) => {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  const match = cookies.match(new RegExp('(^| )' + name + '=([^;]+)'));
  if (match) return match[2];
  return null;
};

// CLIENT PORTAL LOGIN (GET)
app.get('/login', (req, res) => {
  res.setHeader('Set-Cookie', 'client_session=; Path=/; HttpOnly; Max-Age=0');
  res.render('login', {
    title: 'Client Portal Login | Whole Up',
    page: 'login'
  });
});

// CLIENT PORTAL LOGIN (POST)
app.post('/login', (req, res) => {
  const { clientId, password } = req.body;
  if (clientId === 'demo' && password === 'demo') {
    res.setHeader('Set-Cookie', 'client_session=demo_active; Path=/; HttpOnly; Max-Age=86400');
    return res.redirect('/dashboard');
  }
  res.render('login', {
    title: 'Client Portal Login | Whole Up',
    page: 'login',
    error: 'Invalid Client ID or Password'
  });
});

// CLIENT DASHBOARD (GET)
app.get('/dashboard', (req, res) => {
  const session = getCookie(req, 'client_session');
  if (session !== 'demo_active') {
    return res.redirect('/login');
  }
  res.render('dashboard', {
    title: 'Client Dashboard | Whole Up',
    page: 'dashboard'
  });
});

// D2C SCALE LANDING PAGE (GET)
app.get('/d2c-scale', (req, res) => {
  res.render('d2c-scale', {
    title: 'Scale Your D2C & E-commerce Brand with AI Automation | Wholeup',
    metaDesc: 'Stop running ads manually. Use Wholeup\'s AI Agents — 24/7 voice calls, WhatsApp automation & smart lead capture — to scale your D2C or E-commerce brand on autopilot. Get FREE demo!',
    canonicalUrl: 'https://wholeup.in/d2c-scale',
    metaKeywords: 'D2C marketing Surat, ecommerce AI automation, AI voice agent D2C, WhatsApp automation ecommerce, scale D2C brand Surat',
    page: 'd2c-scale'
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

// ─── API: Chatbot AI Response (Gemini) ─────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, history, context } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, reply: 'Your inquiry cannot be empty.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return res.json({
      success: true,
      reply: 'Hello! 😊 My AI engine is currently offline. However, I can certainly assist you with your digital marketing, SEO, paid ads, or web development needs. Please feel free to contact our growth team directly: +91 97251 37538!'
    });
  }

  try {
    // Use new @google/genai SDK (supports AQ. key format)
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    let systemPrompt = `You are Wholeup AI (GrowBot), the premier digital marketing consultant for "Wholeup" - a results-driven digital marketing agency.
Your goal is to answer all digital marketing, SEO, paid advertising, social media, web development, and business growth queries. You must act as an extremely knowledgeable, creative, and experienced digital marketing expert.
- Answer general questions, technical setup questions (like Meta pixels, tracking, keyword tools, backlink metrics, Instagram hooks, or SEO audits) with highly accurate, detailed, and professional marketing knowledge to prove your expertise.
- Always explain concepts simply, and IMMEDIATELY follow up your explanation with a direct invitation to contact Wholeup's experts to implement it.
- CRITICAL: At the end of every marketing query explanation, you MUST append the text "[CALL_CTA] [WHATSAPP_CTA]" so the user has immediate access to our contact buttons. For example: "To design a custom growth strategy for your business, feel free to connect with our experts: [CALL_CTA] [WHATSAPP_CTA]".

Tone & Language:
- Speak strictly in professional, formal, and authoritative English. Do NOT use Hindi, Hinglish, or informal/slang expressions.
- CRITICAL: Never use conversational fluff, slang, or generic opening/closing expressions like "What a fantastic question!", "That is a brilliant query!", or any Hindi/Hinglish greetings/slang (e.g., "zabardast", "namaste", "sawaal", "kijiye"). Address the user's query directly and professionally.
- Keep answers highly informative, business-oriented, and concise (3 to 5 sentences max).

Strict Constraints:
- You must ONLY answer questions related to digital marketing, websites, copywriting, and business growth.
- If a user asks general knowledge, academic, coding (other than explaining web design or simple analytics snippets), recipes, sports, or completely unrelated questions, you must politely and creatively redirect them back to digital marketing. Say something like: "I am GrowBot, your virtual digital marketing consultant at Wholeup. I can only assist you with business growth, SEO, paid advertising, or web development queries. 😊"
- Always encourage the user to book a Free Strategy Consultation or contact Wholeup directly:
  - Phone: +91 97251 37538
  - WhatsApp: +91 97251 37538
  - Email: wholeup.agency@gmail.com
  - Encourage them to fill out the contact form right here on the website, or click the WhatsApp / Call float buttons on the screen! Do NOT tell the user to visit the website URL "www.wholeup.in" because they are already browsing on it!

Interactive Call-To-Actions (CTAs):
- If the user asks how to contact you, how to call you, wants a consultation, or asks about plans/pricing, you must append these specific code tags at the end of your response to render interactive call-to-action buttons:
  - Append \`[CALL_CTA]\` to show a click-to-call button.
  - Append \`[WHATSAPP_CTA]\` to show a click-to-WhatsApp button.
  - Example response: "...You can connect with us directly. [CALL_CTA] [WHATSAPP_CTA]"

Lead Capture Automation:
- If the user shares their contact information (like Name, Phone number, Email, or Service interest), you must extract them. At the very end of your response, append a special structured tag in this exact format:
  \`[LEAD: name|phone|email|service]\`
  - Fill in whichever details are provided, and leave the others blank (e.g. \`[LEAD: Neel|9999999999||]\` or \`[LEAD: ||neel@gmail.com|SEO]\`).
  - Do not show this \`[LEAD: ...]\` tag to the user as raw text, but append it at the very end of your response. The server will detect it and save it to the leads database.`;

    // Dynamic Persona / Context Customization
    if (context === 'seo') {
      systemPrompt += `\n\n[CONTEXT: SEO SPECIALIST MODE]
You are acting as Wholeup's Chief SEO Strategist. You possess deep knowledge of Google ranking algorithms, page-speed optimization, backlink strategies, and local GMB. Make sure to direct the conversation toward performing an SEO audit and improving organic search traffic. Mention that Wholeup has proven ranking methods.`;
    } else if (context === 'ppc' || context === 'ads') {
      systemPrompt += `\n\n[CONTEXT: PAID ADS SPECIALIST MODE]
You are acting as Wholeup's Paid Ads (PPC) Campaign Director. You are focused on Maximizing ROAS, Facebook/Instagram pixels, Google Search ads, Youtube campaigns, and reducing cost-per-lead (CPL). Keep your tone sales-driven and explain how custom advertising funnels build instant client pipelines.`;
    } else if (context === 'social' || context === 'smm') {
      systemPrompt += `\n\n[CONTEXT: SOCIAL MEDIA STRATEGIST MODE]
You are acting as Wholeup's Chief Social Media Growth Expert. You focus on building Instagram/Facebook brand presence, script hooks for viral Reels, carousel strategies, and increasing engagement. Make sure to suggest creative concepts and explain how social authority boosts client conversions.`;
    } else if (context === 'webdev' || context === 'web') {
      systemPrompt += `\n\n[CONTEXT: WEB DEVELOPMENT ARCHITECT MODE]
You are acting as Wholeup's Lead Full-Stack Web Architect. You explain how fast, responsive, conversion-rate optimized (CRO) websites and landing pages convert traffic into paying customers. You focus on premium visual design systems, glassmorphism UI, and GSAP micro-animations.`;
    } else if (context === 'consultant' || context === 'wizard') {
      systemPrompt += `\n\n[CONTEXT: BUSINESS GROWTH CONSULTANT MODE]
You are acting as Wholeup's Lead Business Consultant. Your task is to walk the user through a guided discovery process. 
- You must ask them about their business goals, website status, and marketing budget.
- Once they share details (or select from interactive chips), suggest a customized marketing package (e.g. SEO + Paid Ads for local leads, or E-commerce Ads + WebDev for online stores).
- Always end with a recommendation and clear next steps to call or WhatsApp you directly to implement the roadmap.`;
    }

    // Build chat contents with history
    const chatContents = [];
    if (history && Array.isArray(history)) {
      history.forEach(h => {
        chatContents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.parts[0].text }]
        });
      });
    }
    chatContents.push({ role: 'user', parts: [{ text: message }] });

    const reply = await getGeminiResponse(null, systemPrompt, chatContents);

    // Extract lead if present in the response
    const leadRegex = /\[LEAD:\s*([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]/;
    const leadMatch = reply.match(leadRegex);
    if (leadMatch) {
      const name = leadMatch[1].trim();
      const phone = leadMatch[2].trim();
      const email = leadMatch[3].trim();
      const service = leadMatch[4].trim();

      // Write to leads.json
      const fs = require('fs');
      const logPath = path.join(__dirname, 'data/leads.json');
      let leads = [];
      try { leads = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch(e) { leads = []; }
      const chatLeadData = { name, phone, email, service, message: 'Lead captured dynamically during AI chatbot conversation.' };
      const chatScore = scoreLead(chatLeadData);
      leads.push({
        name: name || 'Chatbot Lead',
        phone: phone || 'Not provided',
        city: 'Chatbot Capture',
        email: email || 'Not provided',
        service: service || 'General Inquiry',
        message: 'Lead captured dynamically during AI chatbot conversation.',
        date: new Date().toISOString(),
        score: chatScore.score,
        scoreLabel: chatScore.label,
        scoreEmoji: chatScore.emoji
      });
      fs.writeFileSync(logPath, JSON.stringify(leads, null, 2));
      console.log('✅ Lead captured and saved to leads.json:', { name, phone, email, service });

      // Send email notification for chatbot lead (using the same email configuration in .env)
      try {
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          });
          await transporter.sendMail({
            from: `"Wholeup AI Chatbot" <${process.env.SMTP_USER}>`,
            to: 'wholeup.agency@gmail.com',
            subject: `🤖 NEW CHAT LEAD: ${name || 'Inquiry'} — ${service || 'General'}`,
            html: `
              <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#16A34A;padding:24px;border-radius:12px 12px 0 0;">
                  <h2 style="color:white;margin:0;font-size:20px;">🤖 New Chat Lead Captured by AI</h2>
                </div>
                <div style="background:#f9f9f9;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;">
                  <p><strong>Name:</strong> ${name || 'Not provided'}</p>
                  <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                  <p><strong>Email:</strong> ${email || 'Not provided'}</p>
                  <p><strong>Service of Interest:</strong> ${service || 'Not specified'}</p>
                  <p><strong>Capture Source:</strong> Wholeup AI Chatbot Conversation</p>
                  <p style="color:#999;font-size:12px;margin-top:24px;">Submitted: ${new Date().toLocaleString('en-IN')}</p>
                </div>
              </div>
            `
          });
          console.log('✉️ Chatbot Lead email notification sent successfully!');
        }
      } catch (emailErr) {
        console.error('Chatbot Lead Email notification error:', emailErr.message);
      }

      // Strip the [LEAD: ...] tag from the reply so the user doesn't see it
      reply = reply.replace(leadRegex, '').trim();
    }

    res.json({ success: true, reply });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({
      success: false,
      reply: 'Apologies, we are experiencing a temporary server connectivity issue. Please try again shortly or contact our growth experts directly at +91 97251 37538.'
    });
  }
});

// ─── API: AI Website Grader & Live Audit Report ─────────────────────────────────
app.post('/api/grader/audit', async (req, res) => {
  const { name, email, phone, url, goal, message } = req.body;

  if (!name || !email || !url || !goal) {
    return res.status(400).json({ success: false, message: 'Required fields (Name, Email, Website URL, Goal) are missing.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  let auditText = '';

  if (!apiKey || apiKey.trim() === '') {
    auditText = `Hello ${name}! 😊

Thank you for requesting an audit for ${url}. Currently, our live AI grading engine is offline due to missing configuration, but we've logged your request!

Here is our initial review of your objective (${goal}):
1. 🎯 PRIMARY OPPORTUNITY: Improve page loading speeds and simplify form capture fields to increase signup conversions by up to 25%.
2. 🔍 COMPETITOR GAP ANALYSIS: Competitors in your niche are aggressively bidding on local high-intent keywords that your brand isn't targeting yet.
3. ⚡ 30-DAY ROADMAP: Add clean customer reviews (trust triggers), make your contact button float on mobile screen, and build localized content pages.

Our human strategist will contact you within 24 hours at ${email} to deliver a custom growth roadmap!`;
  } else {
    try {
      const prompt = `You are a World-Class Digital Marketing Strategist and Conversion Rate Auditor for Wholeup Solutions.
Generate an actionable, highly customized Digital Audit Report for the domain: ${url}
Audit Objective: ${goal}
Client Business Context / Competitor info: ${message || 'Not provided'}

Please write exactly 3 distinct, professional sections. Keep it clear, concise, and direct (max 12-15 lines total):
1. 🎯 PRIMARY OPPORTUNITY: Identify a critical marketing or UX conversion gap for a website in this niche (e.g. speed, CTA layout, or clear value proposition).
2. 🔍 COMPETITOR GAP: Show how top competitors leverage paid search or social branding to attract their target clients.
3. ⚡ 30-DAY GROWTH ROADMAP: Give 3 specific, step-by-step actionable optimization steps they can do right now.

Maintain a confident, highly professional tone. Do not write generic placeholders. Talk directly as Wholeup Solutions. Do not mention that you cannot browse. Speak with expert authority.`;

      auditText = await getGeminiResponse(prompt);
    } catch(err) {
      console.error('Grader Gemini Error:', err.message);
      return res.status(500).json({ success: false, message: 'AI Agent failed to analyze website. Please try again later.' });
    }
  }

  // Save lead details to leads.json
  const fs = require('fs');
  const logPath = path.join(__dirname, 'data/leads.json');
  let leads = [];
  try { leads = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch(e) { leads = []; }
  
  const graderLeadData = { name, phone, email, service: `Grader: ${goal}`, message: `Analyzed website: ${url}\n\nGenerated Audit Report:\n${auditText}` };
  const graderScore = scoreLead(graderLeadData);
  leads.push({
    name,
    phone: phone || 'Not provided',
    city: 'AI Website Grader',
    email,
    service: `Grader: ${goal}`,
    message: `Analyzed website: ${url}\n\nGenerated Audit Report:\n${auditText}`,
    date: new Date().toISOString(),
    score: graderScore.score,
    scoreLabel: graderScore.label,
    scoreEmoji: graderScore.emoji
  });
  
  fs.writeFileSync(logPath, JSON.stringify(leads, null, 2));

  // Email the generated audit report to the client and notify Wholeup admin
  try {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      // 1. Send report to client
      await transporter.sendMail({
        from: `"Wholeup Solutions" <${process.env.SMTP_USER}>`,
        to: email,
        cc: 'wholeup.agency@gmail.com',
        subject: `Your Free Website Growth Audit Report for ${url}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;color:#333;">
            <div style="background:#16A34A;padding:32px 24px;border-radius:12px 12px 0 0;text-align:center;">
              <h1 style="color:white;margin:0;font-size:24px;text-transform:uppercase;letter-spacing:1px;">Growth Audit Report</h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0 0;font-size:14px;">Custom Strategy for ${url}</p>
            </div>
            <div style="background:#fafafa;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;line-height:1.6;">
              <p>Hello <strong>${name}</strong>,</p>
              <p>Our AI marketing agent has analyzed your website details and generated your custom growth audit based on your objective of <strong>${goal}</strong>:</p>
              
              <div style="background:white;padding:20px;border-radius:8px;border:1px solid #e5e7eb;margin:20px 0;white-space:pre-line;">
                ${auditText}
              </div>

              <p>We'll follow up with you within 24 hours to schedule a free 30-minute consultation call to walk you through these recommendations and answer any questions.</p>
              
              <div style="text-align:center;margin-top:24px;">
                <a href="tel:+919725137538" style="background:#16A34A;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;display:inline-block;">Call Us Directly</a>
              </div>
            </div>
          </div>
        `
      });
      console.log('✉️ Grader Audit email sent to client successfully!');
    }
  } catch (emailErr) {
    console.error('Grader Email delivery error:', emailErr.message);
  }

  res.json({ success: true, audit: auditText });
});

// ─── AI Agent Admin Dashboard ──────────────────────────────────────────────────
app.get('/admin/agent', (req, res) => {
  if (req.query.pass !== 'wholeup2026') {
    return res.status(404).render('404', { title: 'Page Not Found | Whole Up', page: '404' });
  }

  const fs = require('fs');
  const logPath = path.join(__dirname, 'data/leads.json');
  let leads = [];
  try {
    leads = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    leads.reverse(); // Newest leads first
  } catch(e) {
    leads = [];
  }

  res.render('agent', {
    title: 'Whole Up AI Agent Command Center',
    page: 'agent',
    leads: leads
  });
});

// API: Trigger AI Outreach Proposal Email
app.post('/api/agent/outreach', async (req, res) => {
  const { index } = req.body;
  const fs = require('fs');
  const logPath = path.join(__dirname, 'data/leads.json');
  let leads = [];
  try { leads = JSON.parse(fs.readFileSync(logPath, 'utf8')); leads.reverse(); } catch(e) { leads = []; }

  const lead = leads[index];
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return res.status(400).json({ success: false, message: 'Gemini API key is not configured.' });
  }

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'];
    let proposalText = '';
    let success = false;
    let lastError = null;

    const agentPrompt = `You are Wholeup Sales Agent, the automated client outreach and strategy proposal specialist for "Wholeup Digital Marketing Agency".
Your task is to analyze the following client's inquiry and write a highly professional, hyper-targeted digital marketing proposal email.
Client Name: ${lead.name}
Service Interested: ${lead.service}
Client Contact Details: Email: ${lead.email || 'Not provided'}, Phone: ${lead.phone || 'Not provided'}

Instructions:
1. Address the client warmly by their name (Dear ${lead.name}).
2. Explain how Wholeup Digital Marketing Agency can help scale their business specifically for their service interest (${lead.service}). Provide 2-3 high-level actionable strategy points (e.g. SEO optimization, conversion audits, premium Meta ad funnel setup).
3. Sound extremely expert, professional, encouraging, and warm. 
4. Pitch the value of scheduling a "Free 30-Minute Growth Strategy Call" to align further.
5. End with a professional email signature for "Wholeup Digital Growth Team" and phone: +91 97251 37538 / email: wholeup.agency@gmail.com.
6. Keep the email highly readable, clean, and concise (under 250 words total). Do NOT include generic placeholder brackets. Write the final email copy directly.`;

    proposalText = await getGeminiResponse(agentPrompt);

    if (!proposalText) {
      throw new Error('Outreach Agent AI failed to generate proposal.');
    }

    let emailSent = false;
    if (process.env.SMTP_USER && process.env.SMTP_PASS && lead.email && lead.email.trim() !== '') {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
        await transporter.sendMail({
          from: `"Wholeup Sales Agent" <${process.env.SMTP_USER}>`,
          to: lead.email,
          cc: 'wholeup.agency@gmail.com',
          subject: `Scaling Wholeup's ${lead.service} Strategy for ${lead.name}`,
          text: proposalText
        });
        emailSent = true;
        console.log(`✉️ Automated outreach proposal email sent successfully to ${lead.email}`);
      } catch (emailErr) {
        console.error('Failed to send automated outreach email:', emailErr.message);
      }
    }

    res.json({ success: true, proposal: proposalText, emailSent });
  } catch (error) {
    console.error('Outreach Agent API Error:', error);
    res.status(500).json({ success: false, message: 'AI Agent encountered an error while writing proposal.' });
  }
});

// API: Content Studio Copilot
app.post('/api/agent/content', async (req, res) => {
  const { topic } = req.body;
  if (!topic) {
    return res.status(400).json({ success: false, message: 'Topic is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return res.status(400).json({ success: false, message: 'Gemini API key is not configured.' });
  }

  try {
    const copilotPrompt = `You are Wholeup Content Studio Copilot, the social media strategist for Wholeup Digital Marketing Agency.
Your task is to write a highly engaging, high-converting social media post outline regarding the following topic:
Topic: ${topic}

Please structure your response beautifully with:
1. 🎨 **Visual Graphic / Reel Concept**: A brief, creative description of the image, video, or carousel hook that our designers should create to accompany this post.
2. ✍️ **Engaging Hook & Caption**: A high-impact caption using paragraph spacing, bold text format where appropriate, and a friendly, expert Hinglish/English tone. 
3. 🏷️ **Curated Hashtags**: 8-10 highly relevant, high-traffic digital marketing hashtags (e.g. #Wholeup, #DigitalMarketing, #SEO, #SocialMediaStrategy).
4. 📞 **Strong Call-To-Action (CTA)**: Prompt the reader to DM Wholeup for a Free Growth Audit or call +91 97251 37538.`;

    const contentCopy = await getGeminiResponse(copilotPrompt);

    if (!contentCopy) {
      throw new Error('Content Copilot failed to generate content.');
    }

    res.json({ success: true, content: contentCopy });
  } catch (error) {
    console.error('Content Copilot API Error:', error);
    res.status(500).json({ success: false, message: 'AI Agent failed to generate social media content.' });
  }
});

// ─── 24/7 Cloud Telegram Bot & Cron Routes ──────────────────────────────────────

// In-memory state tracker for accountability checks
let awaitingAccountabilityReply = false;

// Helper function to send Telegram Text messages
async function sendTelegramMessage(botToken, chatId, text) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    return await response.json();
  } catch (err) {
    console.error('Error sending Telegram message:', err.message);
  }
}

// Helper function to send Telegram Document (CSV files)
async function sendTelegramDocument(botToken, chatId, csvContent, filename, caption) {
  try {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', blob, filename);
    if (caption) formData.append('caption', caption);

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    return await response.json();
  } catch (err) {
    console.error('Error sending Telegram document:', err.message);
  }
}

// Webhook endpoint for Telegram bot
app.post('/api/telegram/webhook', async (req, res) => {
  res.sendStatus(200); // Always respond 200 OK immediately to Telegram

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUser = process.env.TELEGRAM_ALLOWED_USERS;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!botToken || !req.body || !req.body.message) return;

  const { chat, text } = req.body.message;
  const chatId = chat.id.toString();

  // Access Control: Only allow the authorized user
  if (chatId !== allowedUser) {
    await sendTelegramMessage(botToken, chatId, "Access Denied: You are not authorized to use this bot.");
    return;
  }

  const rawText = (text || '').trim();

  // 1. Welcome / Help Command
  if (rawText.toLowerCase() === '/start' || rawText.toLowerCase() === 'hi' || rawText.toLowerCase() === 'hello') {
    await sendTelegramMessage(botToken, chatId, 
      `*Welcome to Wholeup Agency AI Bot!* 🚀\n\n` +
      `Here is what I can do for you 24/7:\n\n` +
      `1️⃣ *Audit Website (Redesign)*: \`Audit website: [url]\`\n` +
      `2️⃣ *Audit Business (No Website)*: \`Audit business: [name]\`\n` +
      `3️⃣ *Competitor Spy* 🕵️: \`/spy competitor.com\` — Full intelligence report\n` +
      `4️⃣ *Lead Tracker*: Auto-logs all audits to CSV file\n` +
      `5️⃣ *Daily Reels & News*: Auto-sends Reel scripts & AI news daily\n` +
      `6️⃣ *Accountability Logs*: Reply to morning check-in to log goals\n\n` +
      `🧠 *Ask me anything* — I can help with strategy, captions, pitches, and more!`
    );
    return;
  }

  // 2. Expecting Accountability Reply state
  if (awaitingAccountabilityReply) {
    awaitingAccountabilityReply = false;
    
    // Save accountability log
    const fs = require('fs');
    const logPath = path.join(__dirname, 'data/accountability.json');
    let logs = [];
    try { logs = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch(e) { logs = []; }
    
    const newLog = {
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('en-IN'),
      goals: rawText,
      notes: "Logged via Telegram 24/7 Cloud Bot"
    };
    logs.push(newLog);
    try { fs.mkdirSync(path.dirname(logPath), { recursive: true }); } catch(e){}
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

    // Generate CSV
    let csv = 'Date,Time,Goals/Tasks Met,Notes\n';
    logs.forEach(l => {
      const escape = (val) => `"${(val || '').replace(/"/g, '""')}"`;
      csv += `${l.date},${escape(l.time)},${escape(l.goals)},${escape(l.notes)}\n`;
    });

    await sendTelegramMessage(botToken, chatId, `✅ *Accountability Progress Logged!* \n\nI have saved your progress into the daily log file.`);
    await sendTelegramDocument(botToken, chatId, csv, 'Daily_Accountability_Log.csv', 'Updated Daily Accountability Tracker');
    return;
  }

  // 3. Audit website command
  if (rawText.toLowerCase().startsWith('audit website:')) {
    const url = rawText.substring(14).trim();
    if (!url) {
      await sendTelegramMessage(botToken, chatId, "Please provide a valid website URL. Example: `Audit website: myclient.com`");
      return;
    }

    await sendTelegramMessage(botToken, chatId, `🔍 *Analyzing website: ${url}...* Please wait 15-30 seconds.`);

    try {
      // Fetch homepage html snippet (first 6000 chars to avoid model context bloat)
      let htmlSample = 'Could not fetch site HTML';
      try {
        const response = await fetch(url.startsWith('http') ? url : `https://${url}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        htmlSample = html.substring(0, 6000);
      } catch(e) {
        htmlSample = `Error fetching site: ${e.message}`;
      }

      const prompt = `Perform a web design and performance audit on this website (${url}) using this HTML sample:\n${htmlSample}\n\n` +
        `Instructions:\n` +
        `1. Identify 2 visual layout or loading speed weaknesses (e.g. outdated style, mobile scaling, missing call to action).\n` +
        `2. Draft a highly personalized, short DM outreach pitch (under 120 words) proposing a website redesign. Highlight a specific visual gap and offer a free modern homepage mockup screenshot.\n` +
        `3. Keep the tone professional, friendly, and value-first. Do NOT use marketing jargon.\n\n` +
        `Format your response exactly as:\n` +
        `*Audit Gaps:* [1-2 sentences summarizing weaknesses]\n` +
        `*Outreach Pitch:* [Your custom pitch text here]`;

      const auditResponse = await getGeminiResponse(prompt);

      // Parse audit results
      let weaknesses = "Outdated design, mobile responsiveness gaps";
      let pitch = auditResponse;
      const gapsMatch = auditResponse.match(/\*Audit Gaps:\*([\s\S]*?)(?=\*Outreach Pitch:\*|$)/i);
      const pitchMatch = auditResponse.match(/\*Outreach Pitch:\*([\s\S]*)/i);
      if (gapsMatch) weaknesses = gapsMatch[1].trim();
      if (pitchMatch) pitch = pitchMatch[1].trim();

      // Log Lead to leads_audit.json
      const fs = require('fs');
      const leadPath = path.join(__dirname, 'data/leads_audit.json');
      let leads = [];
      try { leads = JSON.parse(fs.readFileSync(leadPath, 'utf8')); } catch(e) { leads = []; }
      leads.push({
        date: new Date().toISOString().split('T')[0],
        url: url,
        type: 'Redesign Pitch',
        weaknesses: weaknesses,
        pitch: pitch
      });
      try { fs.mkdirSync(path.dirname(leadPath), { recursive: true }); } catch(e){}
      fs.writeFileSync(leadPath, JSON.stringify(leads, null, 2));

      // Generate CSV
      let csv = 'Date,Target URL/Name,Type,Weaknesses/Gaps,Outreach Pitch\n';
      leads.forEach(l => {
        const escape = (val) => `"${(val || '').replace(/"/g, '""')}"`;
        csv += `${l.date},${escape(l.url)},${escape(l.type)},${escape(l.weaknesses)},${escape(l.pitch)}\n`;
      });

      await sendTelegramMessage(botToken, chatId, `✅ *Audit Complete for ${url}!*\n\n*Audit Gaps Found:*\n${weaknesses}\n\n*Your Outreach Pitch:*\n\`\`\`\n${pitch}\n\`\`\``);
      await sendTelegramDocument(botToken, chatId, csv, 'Wholeup_Leads_Audit.csv', 'Updated Leads & Audits Tracker');

    } catch (err) {
      await sendTelegramMessage(botToken, chatId, `❌ Error performing audit: ${err.message}`);
    }
    return;
  }

  // 4. Audit business command (no website)
  if (rawText.toLowerCase().startsWith('audit business:')) {
    const bizName = rawText.substring(15).trim();
    if (!bizName) {
      await sendTelegramMessage(botToken, chatId, "Please provide a valid business name or Instagram link. Example: `Audit business: Neel Bakery Delhi`");
      return;
    }

    await sendTelegramMessage(botToken, chatId, `🔍 *Researching business: ${bizName}...* Please wait 15-30 seconds.`);

    try {
      const prompt = `Research this business: "${bizName}". They currently do not have a website.\n` +
        `1. Identify why they need a professional website (e.g. automate customer bookings, showcase portfolio, build Google search authority, reduce DM checkout friction).\n` +
        `2. Draft a highly personalized, short DM outreach pitch (under 120 words) proposing a new website build from scratch. Include a hook praising their business/brand, a value drop explaining how a landing page will capture more customer leads, and a CTA offering a free customized homepage layout mockup.\n\n` +
        `Format your response exactly as:\n` +
        `*Audit Gaps:* [1-2 sentences on why they need a website]\n` +
        `*Outreach Pitch:* [Your custom pitch text here]`;

      const auditResponse = await getGeminiResponse(prompt);

      // Parse audit results
      let weaknesses = "No official website, manual checkout friction";
      let pitch = auditResponse;
      const gapsMatch = auditResponse.match(/\*Audit Gaps:\*([\s\S]*?)(?=\*Outreach Pitch:\*|$)/i);
      const pitchMatch = auditResponse.match(/\*Outreach Pitch:\*([\s\S]*)/i);
      if (gapsMatch) weaknesses = gapsMatch[1].trim();
      if (pitchMatch) pitch = pitchMatch[1].trim();

      // Log Lead
      const fs = require('fs');
      const leadPath = path.join(__dirname, 'data/leads_audit.json');
      let leads = [];
      try { leads = JSON.parse(fs.readFileSync(leadPath, 'utf8')); } catch(e) { leads = []; }
      leads.push({
        date: new Date().toISOString().split('T')[0],
        url: bizName,
        type: 'New Website Pitch',
        weaknesses: weaknesses,
        pitch: pitch
      });
      try { fs.mkdirSync(path.dirname(leadPath), { recursive: true }); } catch(e){}
      fs.writeFileSync(leadPath, JSON.stringify(leads, null, 2));

      // Generate CSV
      let csv = 'Date,Target URL/Name,Type,Weaknesses/Gaps,Outreach Pitch\n';
      leads.forEach(l => {
        const escape = (val) => `"${(val || '').replace(/"/g, '""')}"`;
        csv += `${l.date},${escape(l.url)},${escape(l.type)},${escape(l.weaknesses)},${escape(l.pitch)}\n`;
      });

      await sendTelegramMessage(botToken, chatId, `✅ *Audit Complete for "${bizName}"!*\n\n*Value Proposition:*\n${weaknesses}\n\n*Your Outreach Pitch:*\n\`\`\`\n${pitch}\n\`\`\``);
      await sendTelegramDocument(botToken, chatId, csv, 'Wholeup_Leads_Audit.csv', 'Updated Leads & Audits Tracker');

    } catch (err) {
      await sendTelegramMessage(botToken, chatId, `❌ Error performing audit: ${err.message}`);
    }
    return;
  }

  // 5. Competitor Spy Command: /spy [url]
  if (rawText.toLowerCase().startsWith('/spy')) {
    const target = rawText.substring(4).trim();
    if (!target) {
      await sendTelegramMessage(botToken, chatId, '🕵️ *Competitor Spy* — Usage:\n\n`/spy competitor.com`\n\nI will analyze their website, ads strategy, SEO gaps, and write you a battle plan to beat them.');
      return;
    }

    await sendTelegramMessage(botToken, chatId, `🔍 *Spying on: ${target}...*\n\nFetching their site, running AI analysis... give me 20–30 seconds.`);

    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);

      // Try to fetch competitor homepage HTML
      let htmlSample = 'Could not fetch site HTML — analyzing based on domain name only.';
      try {
        const r = await fetch(target.startsWith('http') ? target : `https://${target}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
          signal: AbortSignal.timeout(8000)
        });
        const html = await r.text();
        htmlSample = html.substring(0, 8000);
      } catch(e) { htmlSample = `Fetch error: ${e.message}. Analyze based on domain only.`; }

      const spyPrompt = `You are Wholeup Digital Marketing Agency's Competitive Intelligence AI. Your job is to analyze a competitor and give Neel (founder of Wholeup) a precise battle plan.\n\nCompetitor: ${target}\nWebsite HTML Sample:\n${htmlSample}\n\nGenerate a sharp, executive-level Competitor Intelligence Report with exactly these sections:\n\n🏢 *COMPETITOR OVERVIEW*\nWhat they do, who they target, their positioning in 2-3 lines.\n\n🎯 *THEIR STRENGTHS*\nWhat they are doing well (2-3 specific points from the HTML/domain).\n\n⚠️ *THEIR WEAKNESSES & GAPS*\nCritical gaps in their UX, messaging, SEO or services that Wholeup can exploit (3 specific points).\n\n🔥 *WHOLEUP BATTLE PLAN*\nExact 3-step strategy for Neel to position Wholeup as the superior choice over this competitor. Be specific — mention what copy, what offer, what page to build.\n\n💬 *KILLER PITCH LINE*\nOne powerful one-liner Neel can use in DMs or ads to steal this competitor's clients.\n\nKeep the tone sharp, strategic, and actionable. No fluff.`;

      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
      let spyReport = '';
      for (const m of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: m });
          const result = await model.generateContent(spyPrompt);
          spyReport = result.response.text();
          break;
        } catch(e) { console.warn(`Spy model ${m} failed:`, e.message); }
      }

      if (!spyReport) throw new Error('All models failed for spy report.');

      // Save to spy log
      const fs = require('fs');
      const spyPath = path.join(__dirname, 'data/spy_log.json');
      let spyLog = [];
      try { spyLog = JSON.parse(fs.readFileSync(spyPath, 'utf8')); } catch(e) { spyLog = []; }
      spyLog.push({ date: new Date().toISOString(), target, report: spyReport });
      try { fs.mkdirSync(path.dirname(spyPath), { recursive: true }); } catch(e){}
      fs.writeFileSync(spyPath, JSON.stringify(spyLog, null, 2));

      // Telegram has 4096 char limit — split if needed
      const fullMsg = `🕵️ *Competitor Intelligence Report*\n📌 Target: ${target}\n\n${spyReport}`;
      if (fullMsg.length <= 4000) {
        await sendTelegramMessage(botToken, chatId, fullMsg);
      } else {
        await sendTelegramMessage(botToken, chatId, fullMsg.substring(0, 4000));
        await sendTelegramMessage(botToken, chatId, fullMsg.substring(4000));
      }

    } catch(err) {
      await sendTelegramMessage(botToken, chatId, `❌ Spy failed: ${err.message}`);
    }
    return;
  }

  // 6. Default General Conversation (GrowBot)
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    const prompt = `You are Wholeup Agency Assistant, an automated co-pilot for Neel, the founder of Wholeup Digital Marketing Agency.\n` +
      `Neels asks: "${rawText}"\n\n` +
      `Provide a helpful, direct, and short response (under 100 words). If they ask for content ideas, scripts, or sales strategies, draft them directly.`;

    const result = await model.generateContent(prompt);
    await sendTelegramMessage(botToken, chatId, result.response.text());
  } catch (err) {
    await sendTelegramMessage(botToken, chatId, `Error processing message: ${err.message}`);
  }
});

// CRON Endpoint: Keep-Awake Ping Route (Public)
app.get('/api/cron/ping', (req, res) => {
  res.status(200).send('pong');
});

// ─── WhatsApp Automation Webhook (Ready when API approved) ───────────────────
// This endpoint receives incoming WhatsApp messages via Meta/360dialog webhook.
// When your WhatsApp Business API is approved, just set WHATSAPP_TOKEN & WHATSAPP_PHONE_ID in .env
// and point your webhook URL to: https://wholeup.in/api/whatsapp/webhook

// Webhook verification (GET) — required by Meta
app.get('/api/whatsapp/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'wholeup_wa_verify_2026';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified by Meta!');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Incoming WhatsApp message handler (POST)
app.post('/api/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200); // Always respond immediately

  const waToken = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') return; // Only handle text messages

    const from = message.from; // Customer's phone number
    const msgBody = message.text.body.trim();
    const contactName = value?.contacts?.[0]?.profile?.name || 'Customer';

    console.log(`💬 WhatsApp message from ${contactName} (${from}): ${msgBody}`);

    // Auto-reply using Gemini AI
    let replyText = 'Thank you for reaching out to Wholeup! 😊 Our team will get back to you shortly. For instant help, call us at +91 97251 37538.';

    if (apiKey && apiKey.trim() !== '') {
      try {
        const waPrompt = `You are Wholeup Digital Marketing Agency's WhatsApp AI assistant. A customer named "${contactName}" sent this message:\n\n"${msgBody}"\n\nReply in a friendly, professional, short manner (under 80 words). \n- If they ask about services, mention: SEO, Meta Ads, Google Ads, WhatsApp Automation, AI Services, Website Design.\n- If they want to book a call, give number: +91 97251 37538\n- If they ask pricing, say packages start from ₹8,000/month and invite them to book a free call.\n- Always end with a clear CTA. Speak naturally. Do NOT mention AI or that you are a bot.`;
        replyText = await getGeminiResponse(waPrompt);
      } catch(e) { console.warn('WhatsApp AI reply failed, using fallback:', e.message); }
    }

    // Send reply via WhatsApp API
    if (waToken && phoneNumberId) {
      await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from,
          type: 'text',
          text: { body: replyText }
        })
      });
      console.log(`✅ WhatsApp AI reply sent to ${from}`);
    } else {
      console.log('⚠️ WhatsApp API credentials not set. Reply not sent. Set WHATSAPP_TOKEN & WHATSAPP_PHONE_ID in .env');
    }

    // Log this as a lead
    const fs = require('fs');
    const waLeadPath = path.join(__dirname, 'data/whatsapp_leads.json');
    let waLeads = [];
    try { waLeads = JSON.parse(fs.readFileSync(waLeadPath, 'utf8')); } catch(e) { waLeads = []; }
    const waLeadData = { name: contactName, phone: from, email: 'Not provided', service: 'WhatsApp Inquiry', message: msgBody };
    const waScore = scoreLead(waLeadData);
    waLeads.push({ ...waLeadData, reply: replyText, date: new Date().toISOString(), score: waScore.score, scoreLabel: waScore.label, scoreEmoji: waScore.emoji });
    try { fs.mkdirSync(path.dirname(waLeadPath), { recursive: true }); } catch(e){}
    fs.writeFileSync(waLeadPath, JSON.stringify(waLeads, null, 2));

    // Notify Neel on Telegram
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgUser = process.env.TELEGRAM_ALLOWED_USERS;
    if (tgToken && tgUser) {
      await sendTelegramMessage(tgToken, tgUser,
        `💬 *New WhatsApp Lead!*\n\n*Name:* ${contactName}\n*Phone:* ${from}\n*Score:* ${waScore.emoji} ${waScore.label} (${waScore.score}/100)\n*Message:* ${msgBody}\n\n*AI Reply Sent:* ✅\n${replyText}`
      );
    }

  } catch(err) {
    console.error('❌ WhatsApp webhook error:', err.message);
  }
});

// CRON Endpoint: Morning Check-in (7:00 AM)
app.get('/api/cron/morning-checkin', async (req, res) => {
  const token = req.query.token;
  const secret = process.env.CRON_SECRET_TOKEN || 'wholeup_cron_secret_123';
  if (token !== secret) return res.status(401).send('Unauthorized');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUser = process.env.TELEGRAM_ALLOWED_USERS;

  if (!botToken || !allowedUser) return res.sendStatus(500);

  const msg = `☀️ *Good Morning, Neel!* \n\nTime to dominate the day. What are your main priority goals for Wholeup Solutions today?\n\nReply to this message with your goals, and I will log them into your accountability tracker!`;
  await sendTelegramMessage(botToken, allowedUser, msg);
  
  awaitingAccountabilityReply = true; // Set state to expect user response next
  res.send('Morning check-in triggered successfully.');
});

// CRON Endpoint: Daily Instagram Reels Machine (8:00 AM)
app.get('/api/cron/reels', async (req, res) => {
  const token = req.query.token;
  const secret = process.env.CRON_SECRET_TOKEN || 'wholeup_cron_secret_123';
  if (token !== secret) return res.status(401).send('Unauthorized');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUser = process.env.TELEGRAM_ALLOWED_USERS;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!botToken || !allowedUser || !apiKey) return res.sendStatus(500);

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    const prompt = `Generate 3 high-converting Instagram Reel concepts for a general website development and redesign agency. Only select targets that have 2,000+ followers or active traction.\n` +
      `For each concept, provide:\n` +
      `- An attention-grabbing hook (first 3 seconds exact script)\n` +
      `- Video visual/action description (what to show on screen)\n` +
      `- Voiceover script/points to speak\n` +
      `- A strong call to action and 5 hashtags.\n\n` +
      `Make the script modern, engaging, and tailored for Indian e-commerce / direct-to-consumer business owners. Keep it concise.`;

    const result = await model.generateContent(prompt);
    await sendTelegramMessage(botToken, allowedUser, `🎬 *Daily Instagram Reels Idea Machine* \n\nHere are 3 fresh Reel concepts for today:\n\n${result.response.text()}`);
    res.send('Reels cron executed successfully.');
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// CRON Endpoint: Daily Marketing & AI News Digest (10:00 AM)
app.get('/api/cron/news', async (req, res) => {
  const token = req.query.token;
  const secret = process.env.CRON_SECRET_TOKEN || 'wholeup_cron_secret_123';
  if (token !== secret) return res.status(401).send('Unauthorized');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUser = process.env.TELEGRAM_ALLOWED_USERS;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!botToken || !allowedUser || !apiKey) return res.sendStatus(500);

  try {
    // Helper function to fetch and parse feeds using regex
    const fetchFeed = async (url) => {
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const xml = await response.text();
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && items.length < 3) {
          const itemContent = match[1];
          const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
          const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
          let title = titleMatch ? titleMatch[1] : "";
          let link = linkMatch ? linkMatch[1] : "";
          if (title.startsWith("<![CDATA[")) title = title.substring(9, title.length - 3);
          if (link.startsWith("<![CDATA[")) link = link.substring(9, link.length - 3);
          
          // Clean HTML entities
          title = title.replace(/&#8217;/g, "'").replace(/&#8216;/g, "'").replace(/&amp;/g, "&").trim();
          link = link.trim();
          items.push({ title, link });
        }
        return items;
      } catch (e) {
        console.error("Feed error:", url, e.message);
        return [];
      }
    };

    const seoNews = await fetchFeed("https://searchengineland.com/feed");
    const aiNews = await fetchFeed("https://techcrunch.com/category/artificial-intelligence/feed/");
    
    let feedContext = "";
    if (seoNews.length > 0) {
      feedContext += "Google SEO & Marketing News:\n";
      seoNews.forEach(item => {
        feedContext += `- Title: ${item.title}\n  Source: ${item.link}\n`;
      });
    }
    if (aiNews.length > 0) {
      feedContext += "\nArtificial Intelligence (AI) News:\n";
      aiNews.forEach(item => {
        feedContext += `- Title: ${item.title}\n  Source: ${item.link}\n`;
      });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' };
    const todayDateStr = new Date().toLocaleDateString('en-US', options);

    const prompt = `Today's Date is ${todayDateStr}. Here are the latest breaking headlines in digital marketing and AI today:\n\n${feedContext}\n\n` +
      `Instructions:\n` +
      `1. Write the entire response in friendly and professional Hinglish (Hindi + English mixed, using Latin script, e.g., 'Google ne Search ad policy ko change kiya hai...').\n` +
      `2. Summarize each news story into 2 clear, high-impact bullet points explaining what happened and how it impacts agency owners / e-commerce businesses.\n` +
      `3. Include the source link provided for each story so the user can read more.\n` +
      `4. CRITICAL: Do NOT mention 2024 or any outdated years. Frame all summaries as current June 2026 news.`;

    const result = await model.generateContent(prompt);
    await sendTelegramMessage(botToken, allowedUser, `📰 *Daily Digital Marketing & AI News Digest* \n\nHere is what you need to know today:\n\n${result.response.text()}`);
    res.send('News cron executed successfully.');
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// CRON Endpoint: Evening Check-in (10:00 PM)
app.get('/api/cron/evening-checkin', async (req, res) => {
  const token = req.query.token;
  const secret = process.env.CRON_SECRET_TOKEN || 'wholeup_cron_secret_123';
  if (token !== secret) return res.status(401).send('Unauthorized');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUser = process.env.TELEGRAM_ALLOWED_USERS;

  if (!botToken || !allowedUser) return res.sendStatus(500);

  const msg = `🌙 *Evening Accountability Check-in!* \n\nDid you accomplish the goals you set out this morning, Neel? What are the key wins of the day?\n\nReply directly to this message to log your evening check-in into your excel database!`;
  await sendTelegramMessage(botToken, allowedUser, msg);
  
  awaitingAccountabilityReply = true; // Set state to expect user response next
  res.send('Evening check-in triggered successfully.');
});

// CRON Endpoint: Competitor Spy Agent (Monday 9:00 AM)
app.get('/api/cron/competitor-spy', async (req, res) => {
  const token = req.query.token;
  const secret = process.env.CRON_SECRET_TOKEN || 'wholeup_cron_secret_123';
  if (token !== secret) return res.status(401).send('Unauthorized');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUser = process.env.TELEGRAM_ALLOWED_USERS;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!botToken || !allowedUser || !apiKey) return res.sendStatus(500);

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' };
    const todayDateStr = new Date().toLocaleDateString('en-US', options);

    const prompt = `Today's Date is ${todayDateStr}. Write a competitor spy strategy report analyzing the current active marketing campaigns, main offers, new reels hook themes, and content from Digital Deepak and Ankur Warikoo as of June 2026.\n` +
      `Write the entire report in friendly, professional Hinglish (Hindi + English mixed, using Latin script).\n` +
      `Explain their current campaigns and highlight 2 key strategies that Wholeup can learn from or replicate.\n` +
      `CRITICAL: Do NOT mention 2024, 2025 or any past years. All details must be framed as current in June 2026.`;

    const result = await model.generateContent(prompt);
    await sendTelegramMessage(botToken, allowedUser, `🕵️‍♂️ *Weekly Competitor Spy Agent Report* \n\nHere is the weekly strategy report on Warikoo and Digital Deepak:\n\n${result.response.text()}`);
    res.send('Competitor spy executed successfully.');
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Helper function to auto-register webhook with Telegram on start
async function initTelegramWebhook() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = `https://wholeup.in/api/telegram/webhook`;
  if (!botToken) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${webhookUrl}`);
    const data = await response.json();
    if (data.ok) {
      console.log(`🤖 Telegram Webhook registered successfully to: ${webhookUrl}`);
    } else {
      console.warn(`⚠️ Telegram Webhook registration failed: ${data.description}`);
    }
  } catch (err) {
    console.error('Failed to automatically register Telegram Webhook:', err.message);
  }
}

// Register webhook immediately on startup (non-blocking)
initTelegramWebhook();

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found | Whole Up', page: '404' });
});

// ─── Sitemap Generator ────────────────────────────────────────────────────────
function generateSitemap() {
  const fs = require('fs');
  const baseUrl = 'https://wholeup.in';
  const staticPages = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/about', changefreq: 'monthly', priority: '0.8' },
    { loc: '/services', changefreq: 'monthly', priority: '0.9' },
    { loc: '/ai-services', changefreq: 'monthly', priority: '0.9' },
    { loc: '/portfolio', changefreq: 'monthly', priority: '0.8' },
    { loc: '/pricing', changefreq: 'monthly', priority: '0.8' },
    { loc: '/blog', changefreq: 'weekly', priority: '0.7' },
    { loc: '/faq', changefreq: 'monthly', priority: '0.7' },
    { loc: '/contact', changefreq: 'monthly', priority: '0.9' },
    { loc: '/d2c-scale', changefreq: 'monthly', priority: '0.8' }
  ];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  const today = new Date().toISOString().split('T')[0];

  // Static pages
  staticPages.forEach(page => {
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}${page.loc}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += `  </url>\n`;
  });

  // Dynamic blog posts
  if (typeof blogPosts !== 'undefined' && Array.isArray(blogPosts)) {
    blogPosts.forEach(post => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/blog/${post.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.6</priority>\n`;
      xml += `  </url>\n`;
    });
  }

  // Dynamic services
  if (typeof services !== 'undefined' && Array.isArray(services)) {
    services.forEach(service => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/services/${service.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    });
  }

  // Dynamic portfolio cases
  if (typeof portfolio !== 'undefined' && Array.isArray(portfolio)) {
    portfolio.forEach(project => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/portfolio/${project.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    });
  }

  xml += `</urlset>\n`;

  try {
    fs.writeFileSync(path.join(__dirname, 'public', 'sitemap.xml'), xml);
    console.log('✅ Dynamic sitemap.xml generated successfully!');
  } catch (err) {
    console.error('❌ Failed to generate sitemap.xml:', err.message);
  }
}

// Generate sitemap on startup
generateSitemap();

// ─── Start ────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ Wholeup server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
