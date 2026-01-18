// Setup the right-click menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "verifyClaim",
    title: "Verify claim with a Source",
    contexts: ["selection"]
  });
});

// Listen for the click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "verifyClaim") {
    // Save the text to storage so the panel can read it
    chrome.storage.local.set({ "pendingClaim": info.selectionText }, () => {
      // Opens the side panel after storage is set
      chrome.sidePanel.open({ tabId: tab.id }).catch(err => {
        console.error('Error opening side panel:', err);
      });
    });
  }
});