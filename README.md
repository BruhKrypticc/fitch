<p align="center">
  <img src="image/fitchBanner1.png" alt="Fitch — For School Communities" width="100%" style="border-radius: 12px;">
</p>

> A secure real-time platform connecting students and their communities through information. Built for the Congressional App Challenge.

[![Live Demo](https://img.shields.io/badge/Live_Demo-fitch--6393c.web.app-245847?style=for-the-badge&logo=firebase)](https://fitch-6393c.web.app)
[![Firebase](https://img.shields.io/badge/Firebase-v10.8.0-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-Serverless-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Gemini AI](https://img.shields.io/badge/Google_Gemini-3.1_Flash_Lite-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

---

## 📖 Overview

Communication within high schools can be frustrating. Whether it be paper flyers, boring morning announcements, or social media, students often miss out on important information. In diverse areas like Fitchburg, Lawrence, and Lowell, many students and families face language barriers, as I have experienced myself. Growing up in a Spanish-speaking household, we missed out on events and activities because my parents never knew or had the ability to access the information in their native language, and that is why I built Fitch.

Fitch aims to connect the whole school community by providing real-time announcements, Q&A with student officers, calendar integration, photo boards, live translation, and an AI assistant called Finch—all in one easy-to-use web application built without heavy frameworks.

---

## Features

### 1. Privacy-Focused Join (No PII)
* Students log in with a random 5-character alphanumeric code.
* No need to provide an email address, phone number, or password.
* Easy to comply with FERPA and COPPA standards.

### 2. Live Translation
* Real-time translation of announcements and Q&A using the MyMemory API, supporting Spanish, Portuguese, Chinese, and English and so many more languages.
* Built with request guards (`translationRequestId`) and memoization caching to ensure zero UI delay.

### 3. Finch (AI Assistant)
* Powered by Google Gemini 3.1 Flash Lite via a secure Cloudflare Worker proxy.
* Uses lightweight RAG to answer questions based on school handbooks, bell schedules, and club updates.

### 4. Two-Stage Moderation
* Live filtering combining a custom regex blocklist with an OpenAI Omni-Moderation serverless proxy.
* Blocks offensive or cyberbullying language before posts reach public feeds.

### 5. Role-Based Access Control (RBAC)
* **School Organisers:** Log in using Google OAuth to set up schools, change theme colors, toggle features, pin announcements, and invite officers.
* **Class Officers:** Verified users who can post announcements, moderate feeds, and reply to students with official badges.
* **Students:** Can view announcements, translate posts, and ask questions.

### 6. Custom Themes & Mobile
* Calculates hover and contrast colors based on a school's main hex code using RGB scaling (`* 0.78`).
* Dedicated mobile interface featuring amazing UI I made, safe area padding, and thumb-friendly layout.

---

## Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Layer (Vanilla ES Modules)"]
        Index["index.html (Join/Auth)"]
        Student["student.html (Student Board)"]
        Admin["admin.html (Organiser Console)"]
        Mobile["mobile.html (Liquid Glass App)"]
    end

    subgraph Firebase ["Google Cloud Firebase"]
        Auth["Firebase Auth (Google OAuth)"]
        Firestore["Cloud Firestore (Real Time DB)"]
        Rules["Security Rules (getAfter() verification)"]
        Hosting["Firebase Hosting (Clean URL Rewrites)"]
    end

    subgraph Serverless ["Cloudflare Serverless Workers"]
        GeminiProxy["finch-gemini-proxy\n(Gemini 3.1 Flash Lite)"]
        ModProxy["finch-moderation\n(OpenAI Omni-Moderation)"]
        ImageKitProxy["fitch-imagekit-auth\n(HMAC-SHA1 Auth Signer)"]
    end

    subgraph External ["External Services"]
        MyMemory["MyMemory API (Translation)"]
        ImageKit["ImageKit.io (Media CDN)"]
        GCal["Google Calendar (Embeds)"]
    end

    Client --> Hosting
    Client <--> Auth
    Client <--> Firestore
    Firestore --- Rules

    Client <--> GeminiProxy
    Client <--> ModProxy
    Client <--> ImageKitProxy
    Client <--> MyMemory
    Client <--> ImageKit
    Client <--> GCal

```

---

## Security

* **No Client Secrets:** All API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `IMAGEKIT_PRIVATE_KEY`) are kept securely in Cloudflare Worker secrets.
* **Atomic `getAfter()`:** Promoting officers requires verification in Firestore security rules to match their invite record within the same batch.
* **Input Sanitisation:** URL helper functions strip phishing vectors and restrict calendar embeds to whitelisted domains.
* **Unsubscribe Listeners:** Real-time listeners (`onSnapshot`) automatically unsubscribe when navigating away to prevent memory leaks.

---

## Repository Structure

```text
├── index.html             # Home page, code login, and Google Sign-in
├── student.html / js      # Main student dashboard with Q&A
├── admin.html / js        # Organiser console
├── mobile.html / js / css # Mobile design with glassmorphism UI
├── activity.html / js     # Secure analytics dashboard
├── finch.js               # Client-side logic for Finch AI
├── moderation.js          # Client-side content moderation
├── photo-utils.js         # ImageKit upload and lightbox preview logic
├── calendar.js            # Google Calendar embed sanitizer
├── school-theme.js        # Calculate dynamic theme colors
├── firestore.rules        # Production database rules
├── firebase.json          # Deployment configuration
│
├── gemini-worker/         # Cloudflare Worker for Gemini AI
├── moderation-worker/     # Cloudflare Worker for content moderation
└── imagekit-worker/       # Cloudflare Worker for HMAC upload signing

```

---

## Quick Start

### Prerequisites

* [Node.js](https://nodejs.org/) (v18+)
* [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)

### Commands

1. **Clone the repository:**
```bash
git clone [https://github.com/YOUR_USERNAME/fitch.git](https://github.com/YOUR_USERNAME/fitch.git)
cd fitch

```


2. **Run locally:**
```bash
firebase serve

```


Navigate to `http://localhost:5000` in your browser.
3. **Deploy:**
```bash
firebase deploy

```



---


*3rd Congressional District of Massachusetts (MA-03)*

This project was created to help student governments communicate better within their schools and ensure announcements are accessible to all students.


