# 🟢 Wholeup — Full-Stack Digital Marketing Agency Website

A complete, production-ready website for **Wholeup Digital Marketing Agency** built with Node.js + Express backend and the original frontend design system (cream/green/dark palette, Inter + Playfair Display fonts, GSAP animations, smooth scrolling).

---

## 📁 Project Structure

```
wholeup/
├── server.js              ← Express server + all routes
├── package.json
├── .env.example           ← Copy to .env and configure
├── data/
│   ├── services.json      ← All 8 services
│   ├── testimonials.json  ← 8 client reviews
│   ├── portfolio.json     ← 6 case studies
│   ├── blog.json          ← 6 blog posts
│   ├── faqs.json          ← 13 FAQs in 4 categories
│   ├── pricing.json       ← 3 pricing plans
│   └── leads.json         ← Contact form submissions (auto-created)
├── views/
│   ├── layouts/main.hbs   ← Main layout (nav, footer, scripts)
│   ├── partials/
│   │   ├── navbar.hbs
│   │   ├── footer.hbs
│   │   ├── chatbot.hbs
│   │   └── floatbtns.hbs
│   ├── home.hbs
│   ├── about.hbs
│   ├── services.hbs
│   ├── service-single.hbs ← Individual service pages
│   ├── portfolio.hbs
│   ├── pricing.hbs
│   ├── blog.hbs
│   ├── blog-single.hbs    ← Individual blog posts
│   ├── faq.hbs
│   ├── contact.hbs
│   ├── privacy.hbs
│   ├── terms.hbs
│   └── 404.hbs
└── public/               ← Static assets (CSS, JS, images)
```

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your SMTP credentials for email notifications
```

### 3. Start the server
```bash
# Production
npm start

# Development (with auto-reload — install nodemon first: npm i -g nodemon)
npm run dev
```

### 4. Open in browser
```
http://localhost:3000
```

---

## 📄 Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Full hero, services preview, portfolio, testimonials, blog |
| About | `/about` | Story, values, team, why us |
| Services | `/services` | All 8 services overview |
| Service (single) | `/services/:slug` | Individual service pages with features |
| Portfolio | `/portfolio` | Case studies with filter by category |
| Pricing | `/pricing` | 3 plans + custom quote |
| Blog | `/blog` | All blog posts |
| Blog (single) | `/blog/:slug` | Full article with related posts |
| FAQ | `/faq` | 13 FAQs in 4 categories |
| Contact | `/contact` | Contact form with live API submission |
| Privacy | `/privacy` | Privacy policy |
| Terms | `/terms` | Terms of service |

---

## 📬 Contact Form

All form submissions are:
1. **Saved to** `data/leads.json` (view any time)
2. **Emailed to** `wholeup.agency@gmail.com` (requires SMTP config in `.env`)

### Setting up Gmail SMTP:
1. Go to your Google Account → Security
2. Enable 2-Step Verification
3. Create an App Password (select "Mail" + "Other")
4. Add to `.env`:
   ```
   SMTP_USER=your-gmail@gmail.com
   SMTP_PASS=xxxx-xxxx-xxxx-xxxx
   ```

---

## 🛠️ Customization

### Update contact details
Edit `views/layouts/main.hbs` → search for `DM_CONFIG` and `+91 94268 46035`

### Add/edit services
Edit `data/services.json`

### Add blog posts
Edit `data/blog.json` — content field supports HTML

### Update pricing
Edit `data/pricing.json`

### Change colors/fonts
Edit the `tailwind.config` block in `views/layouts/main.hbs`

---

## 🌐 Deployment

### Deploy to Railway (recommended)
```bash
railway login
railway init
railway up
```

### Deploy to Render
1. Push to GitHub
2. New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in dashboard

### Deploy to VPS (DigitalOcean/AWS)
```bash
npm install -g pm2
pm2 start server.js --name wholeup
pm2 startup
pm2 save
```

---

## 📱 Features

- ✅ **10+ pages** — full multi-page website
- ✅ **Working contact form** — saves leads + sends email
- ✅ **AI chatbot** — Hindi + English keyword responses
- ✅ **Mobile-first** — fully responsive on all devices
- ✅ **GSAP animations** — scroll-triggered reveals
- ✅ **Custom cursor** — desktop magnetic cursor
- ✅ **Smooth scrolling** — Lenis smooth scroll
- ✅ **Portfolio filter** — filter by category
- ✅ **FAQ accordion** — animated expand/collapse
- ✅ **Blog system** — listing + individual posts
- ✅ **Rate limiting** — contact form spam protection
- ✅ **Security headers** — Helmet.js
- ✅ **WhatsApp + Call** — floating quick-contact buttons
- ✅ **Scroll progress** — top progress bar
- ✅ **SEO ready** — meta tags on every page

---

*Built with ❤️ for Wholeup Solutions*
