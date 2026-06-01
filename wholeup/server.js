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

// ─── API: Chatbot AI Response (Gemini) ─────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, reply: 'Sawaal khali nahi ho sakta.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return res.json({
      success: true,
      reply: 'Namaste! 😊 Mera AI engine connect nahi ho paa raha hai kyunki API key configured nahi hai. Lekin main aapki digital marketing (SEO, Ads, Social Media) me zaroor madad karunga. Kripya humein call karein: +91 94268 46035!'
    });
  }

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    const systemPrompt = `You are Wholeup AI, the virtual digital marketing expert for "Wholeup" - a results-driven digital marketing agency.
Your goal is to answer queries strictly regarding digital marketing services provided by Wholeup, such as:
1. SEO (Search Engine Optimization) - Google rankings, GMB.
2. Paid Ads (Google Ads, Meta/Facebook/Instagram Ads, YouTube Ads).
3. Social Media Management - content, reels, posts, strategy.
4. Web Design & Conversion Optimization.
5. Email Marketing & Lead Nurturing.

Tone & Language:
- Speak in a friendly, extremely helpful, and professional tone using a mix of Hindi and English (Hinglish).
- Keep answers very short, concise, and clear (2 to 4 sentences max).

Strict Constraints:
- You must ONLY talk about digital marketing, Wholeup's services, and business growth.
- If a user asks general knowledge, academic, coding (other than explaining web design), recipes, sports, or completely unrelated questions, you must politely and creatively redirect them back to digital marketing. Say something like: "Main Wholeup ka digital marketing assistant hoon, isliye main sirf aapke business ko grow karne ke baare me baat kar sakta hoon! 😊 Aap apne business ke liye SEO ya Ads ke baare me poochh sakte hain."
- Always encourage the user to book a Free Strategy Consultation or contact Wholeup directly:
  - Phone/WhatsApp: +91 94268 46035
  - Email: wholeup.agency@gmail.com
  - Encourage them to fill out the contact form right here on the website, or click the WhatsApp / Call float buttons on the screen! Do NOT tell the user to visit the website URL "www.wholeup.in" because they are already browsing on it!

Interactive Call-To-Actions (CTAs):
- If the user asks how to contact you, how to call you, wants a consultation, or asks about plans/pricing, you must append these specific code tags at the end of your response to render interactive call-to-action buttons:
  - Append \`[CALL_CTA]\` to show a click-to-call button.
  - Append \`[WHATSAPP_CTA]\` to show a click-to-WhatsApp button.
  - Example response: "...Aap humein call kar sakte hain. [CALL_CTA] [WHATSAPP_CTA]"

Lead Capture Automation:
- If the user shares their contact information (like Name, Phone number, Email, or Service interest), you must extract them. At the very end of your response, append a special structured tag in this exact format:
  \`[LEAD: name|phone|email|service]\`
  - Fill in whichever details are provided, and leave the others blank (e.g. \`[LEAD: Neel|9999999999||]\` or \`[LEAD: ||neel@gmail.com|SEO]\`).
  - Do not show this \`[LEAD: ...]\` tag to the user as raw text, but append it at the very end of your response. The server will detect it and save it to the leads database.`;

    // Loop through available models to handle high-demand 503 errors gracefully
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    let reply = '';
    let success = false;
    let lastError = null;

    // Convert history format if present, making sure it fits the SDK expectations
    const formattedHistory = [];
    if (history && Array.isArray(history)) {
      history.forEach(h => {
        formattedHistory.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.parts[0].text }]
        });
      });
    }

    for (const modelName of modelsToTry) {
      try {
        console.log(`Trying Gemini model: ${modelName}`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt
        });
        
        // Start native chat session with conversation history
        const chatSession = model.startChat({
          history: formattedHistory
        });
        
        const result = await chatSession.sendMessage(message);
        reply = result.response.text();
        success = true;
        console.log(`Success with model: ${modelName}`);
        break; // Successfully got response, stop loop!
      } catch (err) {
        console.warn(`Model ${modelName} failed/busy, trying next... Error:`, err.message);
        lastError = err;
      }
    }

    if (!success) {
      throw lastError || new Error('All Gemini models failed to respond.');
    }

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
      leads.push({
        name: name || 'Chatbot Lead',
        phone: phone || 'Not provided',
        city: 'Chatbot Capture',
        email: email || 'Not provided',
        service: service || 'General Inquiry',
        message: 'Lead captured dynamically during AI chatbot conversation.',
        date: new Date().toISOString()
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
      reply: 'Maaf kijiyega, server me thodi dikkat aa gayi hai. Kripya kuch samay baad prayaas karein ya humse seedhe sampark karein: +91 94268 46035.'
    });
  }
});

// ─── AI Agent Admin Dashboard ──────────────────────────────────────────────────
app.get('/admin/agent', (req, res) => {
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
    title: 'Wholeup AI Agent Command Center',
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
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
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
5. End with a professional email signature for "Wholeup Digital Growth Team" and phone: +91 94268 46035 / email: wholeup.agency@gmail.com.
6. Keep the email highly readable, clean, and concise (under 250 words total). Do NOT include generic placeholder brackets. Write the final email copy directly.`;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(agentPrompt);
        proposalText = result.response.text();
        success = true;
        break;
      } catch (err) {
        console.warn(`Outreach Agent model ${modelName} failed/busy. Error:`, err.message);
        lastError = err;
      }
    }

    if (!success) {
      throw lastError || new Error('All Gemini models failed to generate proposal.');
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
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    let contentCopy = '';
    let success = false;
    let lastError = null;

    const copilotPrompt = `You are Wholeup Content Studio Copilot, the social media strategist for Wholeup Digital Marketing Agency.
Your task is to write a highly engaging, high-converting social media post outline regarding the following topic:
Topic: ${topic}

Please structure your response beautifully with:
1. 🎨 **Visual Graphic / Reel Concept**: A brief, creative description of the image, video, or carousel hook that our designers should create to accompany this post.
2. ✍️ **Engaging Hook & Caption**: A high-impact caption using paragraph spacing, bold text format where appropriate, and a friendly, expert Hinglish/English tone. 
3. 🏷️ **Curated Hashtags**: 8-10 highly relevant, high-traffic digital marketing hashtags (e.g. #Wholeup, #DigitalMarketing, #SEO, #SocialMediaStrategy).
4. 📞 **Strong Call-To-Action (CTA)**: Prompt the reader to DM Wholeup for a Free Growth Audit or call +91 94268 46035.`;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(copilotPrompt);
        contentCopy = result.response.text();
        success = true;
        break;
      } catch (err) {
        console.warn(`Content Agent model ${modelName} failed/busy. Error:`, err.message);
        lastError = err;
      }
    }

    if (!success) {
      throw lastError || new Error('All Gemini models failed to generate content.');
    }

    res.json({ success: true, content: contentCopy });
  } catch (error) {
    console.error('Content Copilot API Error:', error);
    res.status(500).json({ success: false, message: 'AI Agent failed to generate social media content.' });
  }
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found | Wholeup', page: '404' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Wholeup server running at http://localhost:${PORT}`);
});
