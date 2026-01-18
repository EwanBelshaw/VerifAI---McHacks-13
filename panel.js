const CONFIG = window.CONFIG || { OPENAI_API_KEY: '' };

// STATE MANAGEMENT

const appState = {
  uploadedFiles: [],
  urlSources: [],
  pendingClaim: null,
  sourceContents: [] // Stores extracted text from all sources
};

// FILE PROCESSING UTILITIES


/**
 * Validate file type and size
 */
function validateFile(file) {
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = {
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif']
  };

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name}" exceeds 10MB limit`);
  }

  // Check file type
  const isValidType = Object.keys(ALLOWED_TYPES).includes(file.type) ||
      Object.values(ALLOWED_TYPES).flat().some(ext => file.name.toLowerCase().endsWith(ext));

  if (!isValidType) {
    throw new Error(`File type not supported: ${file.name}`);
  }

  return true;
}

/**
 * Extract text from PDF files using PDF.js
 */
async function extractTextFromPDF(file) {
  try {
    // Load PDF.js library dynamically
    const pdfjsLib = window['pdfjs-dist/build/pdf'];

    if (!pdfjsLib) {
      // Fallback: read as text (won't work well for PDFs but prevents errors)
      return await readFileAsText(file);
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }

    return fullText.trim();
  } catch (error) {
    console.error('PDF extraction error:', error);
    // Fallback to basic text reading
    return await readFileAsText(file);
  }
}

/**
 * Extract text from DOC/DOCX files using mammoth.js
 */
async function extractTextFromWord(file) {
  try {
    // Load mammoth.js library
    if (typeof mammoth === 'undefined') {
      // Fallback if library not available
      return await readFileAsText(file);
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error('Word document extraction error:', error);
    return await readFileAsText(file);
  }
}

/**
 * Extract text from images using Tesseract.js OCR
 */
async function extractTextFromImage(file) {
  try {
    // Check if Tesseract is available
    if (typeof Tesseract === 'undefined') {
      return `[Image: ${file.name}]\nOCR library not loaded. Please install Tesseract.js to extract text from images.`;
    }

    const { data: { text } } = await Tesseract.recognize(file, 'eng', {
      logger: m => console.log(m)
    });

    return text.trim() || `[Image: ${file.name}]\nNo text detected in image.`;
  } catch (error) {
    console.error('Image OCR error:', error);
    return `[Image: ${file.name}]\nFailed to extract text from image.`;
  }
}

/**
 * Read plain text files
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      resolve(e.target.result);
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };

    reader.readAsText(file);
  });
}

/**
 * Process uploaded file and extract text content
 */
async function processFile(file) {
  try {
    validateFile(file);

    let extractedText = '';

    // Determine file type and use appropriate extraction method
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      extractedText = await extractTextFromPDF(file);
    }
    else if (file.type === 'application/msword' ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name.match(/\.(doc|docx)$/i)) {
      extractedText = await extractTextFromWord(file);
    }
    else if (file.type.startsWith('image/')) {
      extractedText = await extractTextFromImage(file);
    }
    else if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
      extractedText = await readFileAsText(file);
    }
    else {
      // Default fallback
      extractedText = await readFileAsText(file);
    }

    return {
      name: file.name,
      type: file.type,
      size: file.size,
      content: extractedText,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('File processing error:', error);
    throw error;
  }
}


// URL FETCHING UTILITIES

/**
 * Validate URL format
 */
function validateUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fetch content from URL and extract readable text
 */
async function fetchUrlContent(url) {
  try {
    if (!validateUrl(url)) {
      throw new Error('Invalid URL format. Please use http:// or https://');
    }

    showStatus('Fetching content from URL...', 'loading');

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const htmlText = await response.text();

    // Parse HTML and extract readable content using Readability
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');

    // Use Readability to extract main content
    let extractedContent;
    try {
      const reader = new Readability(doc);
      const article = reader.parse();
      extractedContent = article ? article.textContent : doc.body.innerText;
    } catch (error) {
      console.warn('Readability parsing failed, using fallback', error);
      extractedContent = doc.body.innerText;
    }

    return {
      url: url,
      content: extractedContent,
      title: doc.title || 'Untitled',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('URL fetch error:', error);
    throw error;
  }
}

// AI VERIFICATION


/**
 * Verify claim against all available sources using AI
 */
async function verifyClaimWithAI(claim, sources) {
  try {
    if (!claim || claim.trim().length === 0) {
      throw new Error('Please enter a claim to verify');
    }

    if (sources.length === 0) {
      throw new Error('Please add at least one source (file or URL) before verifying');
    }

    showStatus('Analyzing claim against sources...', 'loading');

    // Combine all source contents
    const combinedSourceText = sources
        .map(source => source.content)
        .join('\n\n=== NEXT SOURCE ===\n\n')
        .substring(0, 100000); // Limit to prevent token overflow

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a professional fact-checker. You will be given a CLAIM and SOURCE TEXTS from various documents and websites.

Your job is to:
1. Carefully analyze whether the SOURCE TEXTS support, contradict, or are insufficient to verify the CLAIM
2. Provide a clear verdict: "Supported", "Contradicted", "Partially Supported", or "Insufficient Evidence"
3. Explain your reasoning in 1-2 sentence, citing specific information from the sources
4. Be precise - the claim must be accurately reflected in the sources, not just topically related

Format your response as:
[Your verdict]
Explanation: [Your detailed explanation]`
          },
          {
            role: "user",
            content: `CLAIM: ${claim}\n\nSOURCE TEXTS:\n${combinedSourceText}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;

  } catch (error) {
    console.error('AI verification error:', error);
    throw error;
  }
}


// UI UPDATES


/**
 * Display status message in result box
 */
function showStatus(message, type = 'loading') {
  const resultBox = document.getElementById('resultBox');
  const resultContent = document.getElementById('resultContent');

  resultBox.className = 'result-box show ' + type;

  if (type === 'loading') {
    resultContent.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <span>${message}</span>
      </div>
    `;
  } else {
    resultContent.innerHTML = message;
  }
}

/**
 * Display verification result
 */
function displayResult(analysis) {
  const resultBox = document.getElementById('resultBox');
  const resultContent = document.getElementById('resultContent');

  // Determine result type based on verdict
  let resultType = 'valid';
  if (analysis.includes('Contradicted') || analysis.includes('False')) {
    resultType = 'invalid';
  } else if (analysis.includes('Insufficient') || analysis.includes('Partially')) {
    resultType = 'error';
  }

  resultBox.className = 'result-box show ' + resultType;
  resultContent.innerHTML = `
    <div class="result-header">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Verification Result
    </div>
    <div style="white-space: pre-wrap; line-height: 1.6;">${analysis}</div>
  `;
}

/**
 * Update file list display
 */
function updateFileList() {
  const fileList = document.getElementById('fileList');

  if (appState.uploadedFiles.length === 0 && appState.urlSources.length === 0) {
    fileList.innerHTML = '';
    return;
  }

  const allSources = [
    ...appState.uploadedFiles.map(f => ({ ...f, sourceType: 'file' })),
    ...appState.urlSources.map(u => ({ ...u, sourceType: 'url' }))
  ];

  fileList.innerHTML = allSources.map((source, index) => `
    <div class="file-item">
      <svg class="file-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        ${source.sourceType === 'file' ? `
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        ` : `
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        `}
      </svg>
      <div class="file-info">
        <div class="file-name">${source.name || source.title || source.url}</div>
        <div class="file-size">
          ${source.size ? formatFileSize(source.size) : 'Web source'} • 
          ${new Date(source.timestamp).toLocaleTimeString()}
        </div>
      </div>
      <button class="file-remove" onclick="removeSource(${index}, '${source.sourceType}')">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  `).join('');
}

fileList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.file-remove');
  if (removeBtn) {
    const index = parseInt(removeBtn.dataset.index);
    const type = removeBtn.dataset.type;
    removeSource(index, type);
  }
});


/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Remove source from state
 */
window.removeSource = function(index, type) {
  if (type === 'file') {
    const fileIndex = appState.uploadedFiles.findIndex((_, i) => {
      const filesBefore = 0;
      return i === index - filesBefore;
    });
    appState.uploadedFiles.splice(index, 1);
  } else {
    const urlIndex = index - appState.uploadedFiles.length;
    appState.urlSources.splice(urlIndex, 1);
  }

  updateSourceContents();
  updateFileList();
};

/**
 * Update combined source contents
 */
function updateSourceContents() {
  appState.sourceContents = [
    ...appState.uploadedFiles,
    ...appState.urlSources
  ];
}


// EVENT HANDLERS


document.addEventListener('DOMContentLoaded', async () => {
  // Check for pending claim from context menu
  try {
    const data = await chrome.storage.local.get("pendingClaim");
    if (data.pendingClaim) {
      document.getElementById("claimBox").value = data.pendingClaim;
      appState.pendingClaim = data.pendingClaim;
      // Clear the pending claim
      chrome.storage.local.remove("pendingClaim");
    }
  } catch (error) {
    console.log('Not running in extension context or no pending claim');
  }

  // File upload handling
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');

  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragging');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragging');
  });

  uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragging');
    await handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', async (e) => {
    await handleFiles(e.target.files);
    fileInput.value = ''; // Reset input
  });

  // URL fetch handling
  document.getElementById('fetchUrlBtn').addEventListener('click', async () => {
    const urlInput = document.getElementById('sourceUrl');
    const url = urlInput.value.trim();

    if (!url) {
      showStatus('Please enter a URL', 'error');
      return;
    }

    try {
      const urlContent = await fetchUrlContent(url);
      appState.urlSources.push(urlContent);
      updateSourceContents();
      updateFileList();

      urlInput.value = '';
      showStatus('URL content fetched successfully!', 'valid');
      setTimeout(() => {
        document.getElementById('resultBox').classList.remove('show');
      }, 2000);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  });

  // Verify button handling
  document.getElementById('verifyBtn').addEventListener('click', async () => {
    const claim = document.getElementById('claimBox').value.trim();

    try {
      const analysis = await verifyClaimWithAI(claim, appState.sourceContents);
      displayResult(analysis);
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  });
});

/**
 * Handle file uploads
 */
async function handleFiles(files) {
  const fileArray = Array.from(files);

  if (fileArray.length === 0) return;

  showStatus(`Processing ${fileArray.length} file(s)...`, 'loading');

  try {
    for (const file of fileArray) {
      const processedFile = await processFile(file);
      appState.uploadedFiles.push(processedFile);
    }

    updateSourceContents();
    updateFileList();

    showStatus(`Successfully processed ${fileArray.length} file(s)!`, 'valid');
    setTimeout(() => {
      document.getElementById('resultBox').classList.remove('show');
    }, 2000);

  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
}