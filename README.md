# Overview

**VerifAI** is a Chrome extension designed to combat misinformation by allowing users to fact-check claims against trusted source materials. Simply right-click on any text, select **"Verify claim with a Source"**, and let AI analyze whether your uploaded documents or URLs support, contradict, or provide insufficient evidence for the claim.

## Features

### Multi-Source Support
- Upload **PDF, DOC, DOCX, TXT** files  
- Extract text from **images** using OCR (Tesseract.js)  
- Fetch and parse content from **URLs**

### AI-Powered Analysis
- Uses **OpenAI GPT-4** to provide intelligent fact-checking

### Side Panel Interface
- Clean, intuitive UI for managing sources and reviewing results

### Smart Content Extraction
- **PDF.js** – PDF text extraction  
- **Mammoth.js** – Word document parsing  
- **Readability.js** – Web page content extraction  
- **Tesseract.js** – Image OCR support  

---

# Installation

## Prerequisites
- Google Chrome browser (or any Chromium-based browser)
- OpenAI API key (get one from OpenAI)

## Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/verifai-extension.git
cd verifai-extension
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure your API key
```Javascript
window.CONFIG = {
  OPENAI_API_KEY: 'your-openai-api-key-here'
};
```

### 4. Load the extension in Chrome
- Open Chrome and navigate to `chrome://extensions/`
- Enable Developer mode (toggle in the top-right)
- Click Load unpacked
- Select the extension directory

### 5. Run Locally (Optional) 
```
# Install dependencies
npm install

# Start development server (optional)
npm run dev

# Validate extension
npm run validate
```

# Architecture
## Key Components
```
verifai-extension/
├── manifest.json                # Extension configuration
├── background.js                # Context menu setup
├── panel.js                     # Main logic and UI interactions
├── index.html                   # Side panel interface
├── config.js                    # API key configuration
├── readability.js               # Web content extraction
└── libs/                        # Third-party libraries
    ├── pdf.min.js               # PDF parsing
    ├── mammoth.browser.min.js   # Word document parsing
    └── tesseract.min.js         # OCR for images
```
## Technology Stack

### Frontend: 
Vanilla JavaScript, HTML5, CSS3
### AI Integration: 
OpenAI GPT-4 API
### Chrome APIs
- Context Menus
- Side Panel
- Storage

## Security & Privacy
- **API Keys**: Never commit your config.js file (included in .gitignore)
- **Data Privacy**: All processing happens client-side; only claims and source text are sent to OpenAI
- **No Data Storage**: No personal data is stored on external servers

## Screenshots 
<img width="872" height="887" alt="image" src="https://github.com/user-attachments/assets/4d3268bd-d45f-4053-a5f4-565d8767cb0c" />
