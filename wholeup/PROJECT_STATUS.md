# Wholeup Website Project Status & History

This file provides the complete context and deployment methods for the Wholeup website project. New AI agents should read this file to understand the current state, recent changes, and guidelines.

---

## 🚀 1. Deployment Method
- **Repository:** `https://github.com/WholeUp/Whole-Up-Website.git`
- **Branch:** `main`
- **Deployment Platform:** **Render** (Auto-deploys when changes are pushed to `origin/main`).
- **Command to deploy:**
  ```bash
  git add .
  git commit -m "Commit message"
  git push origin main
  ```

---

## 🛠️ 2. Core Project Architecture
- **Framework:** Node.js / Express.
- **View Engine:** Handlebars (`.hbs`) views located in `/views`, layout located in `/views/layouts/main.hbs`, and partials in `/views/partials`.
- **Styling:** Vanilla CSS & Tailwind CDN inside `main.hbs`.

---

## 📈 3. Recent Changes & Completed Tasks

### A. Homepage Visual Fixes:
- **GSAP Animation Fix:** Converted homepage GSAP card animations to `fromTo` with explicit `opacity: 1` as end state and `once: true` to prevent blank card rendering. Added a 2-second fallback safety timer.
- **Hero Cleanups:** Removed the glowing blue blob (`hero-blob-2`) and specific floating WebGL particle decorators from `views/home.hbs`.

### B. Advanced SEO Implementation:
- **Conditional JSON-LD Schemas:** Set up dynamic, page-specific structured data schemas (Organization, Product, Service, FAQPage, ContactPage, BlogPosting) mapped inside `server.js` and rendered via `{{{schemaMarkup}}}` in `views/layouts/main.hbs`.
- **Dynamic Sitemap:** Added auto-generating `sitemap.xml` served at `/sitemap.xml` compiling on server startup.
- **Compression:** Installed and integrated `compression` middleware in `server.js` for Gzip assets compression.

### C. SEOptimer Audit Optimizations (Achieved On-Page A+ and Performance A+):
- **Title Tag:** Shortened home title to: `Wholeup | Digital Marketing Agency in India | SEO & Ads` (56 chars) inside `server.js`.
- **Meta Description:** Shortened home description to under 160 chars inside `server.js`.
- **Social Links:** Added Facebook, X (Twitter), YouTube, and LinkedIn links in `views/partials/footer.hbs` next to Instagram & WhatsApp.
- **Pixel & Analytics:** Added scripts for Google Analytics (GA4) and Facebook Pixel in `<head>` of `main.hbs`.
- **GEO Hack:** Created a `public/llms.txt` file summarizing the business for AI search engines.

---

## 📋 4. Completed Manual Actions (By User)
- **SPF Mail Record:** Added TXT record `v=spf1 include:_spf.google.com ~all` in the GoDaddy DNS zone.
- **Google Business Profile:** Created and verified Google maps profile, targeting the service area "India" and linking `https://wholeup.in` as the official website.
- **Search Console:** Submitted `https://wholeup.in` for indexing to crawl the new SEO changes.

---

## 🤖 5. AI Chatbot Integration (GrowBot)
- **Frontend Component:** [chatbot.hbs](file:///C:/Users/NEEL/Downloads/wholeup-website/wholeup/views/partials/chatbot.hbs)
- **Backend API Endpoint:** `/api/chat` (POST) in [server.js](file:///C:/Users/NEEL/Downloads/wholeup-website/wholeup/server.js).
- **Core Technology:** Google Gemini AI using the official `@google/genai` SDK with `GEMINI_API_KEY` from `.env`.
- **Key Features:**
  - **Dynamic Lead Capture:** If the AI extracts a lead (Name, Phone, Email, or Service) during the conversation, it appends a structured tag like `[LEAD: name|phone|email|service]`. The server automatically parses this tag, logs the lead, and sends an email notification.
  - **Interactive CTAs:** Supports dynamic rendering of click-to-call (`[CALL_CTA]`) and click-to-WhatsApp (`[WHATSAPP_CTA]`) buttons based on the user's queries.
  - **Offline Fallback:** If the `GEMINI_API_KEY` is not found or empty, the bot automatically responds with a friendly offline message prompting the user to contact the growth team directly at `+91 97251 37538`.
  - **Strict Niche Constraints:** The system prompt restricts the AI to only answer digital marketing, web design, and business growth-related queries, politely redirecting other off-topic questions.
