import { CONFIG } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get("pendingClaim", (data) => {
    if (data.pendingClaim) {
      document.getElementById("claimBox").value = data.pendingClaim;
    }
  });

  document.getElementById("verifyBtn").addEventListener("click", async () => {
    const claim = document.getElementById("claimBox").value;
    const url = document.getElementById("sourceUrl").value;
    const resultDiv = document.getElementById("result");

    resultDiv.style.display = "block";
    resultDiv.innerText = "Fetching source...";

    try {
      const response = await fetch(url);
      const htmlText = await response.text();

      const doc = new DOMParser().parseFromString(htmlText, "text/html");
      const reader = new Readability(doc);
      const article = reader.parse(); 
      const sourceContent = article ? article.textContent : document.body.innerText;

      resultDiv.innerText = "Analyzing logic...";
      
      const analysis = await checkWithAI(claim, sourceContent);
      
      resultDiv.innerHTML = `<strong>Verdict:</strong> ${analysis}`;
      resultDiv.className = analysis.includes("Supported") ? "valid" : "invalid";

    } catch (err) {
      resultDiv.innerText = "Error: " + err.message;
    }
  });
});

async function checkWithAI(claim, sourceText) {
  const truncatedSource = sourceText.substring(0, 100000); 

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer ${CONFIG.OPENAI_API_KEY}" // <-- imported api key
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system", 
          content: "You are a fact-checker. You will be given a CLAIM and a SOURCE TEXT. Your job is to determine if the SOURCE TEXT supports the CLAIM. Answer with 'True' or 'False' followed by a one sentence explanation. Make sure the claim is 100% true and not just close."
        },
        {
          role: "user",
          content: `CLAIM: ${claim}\n\nSOURCE TEXT: ${truncatedSource}`
        }
      ]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}
