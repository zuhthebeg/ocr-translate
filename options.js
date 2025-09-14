function save_options() {
    // Process glossary for token efficiency before saving
    let processedGlossary = document.getElementById('glossary').value;
    
    // Aggressive compacting:
    processedGlossary = processedGlossary
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => line.replace(/\s+/g, ' ')) // Replace multiple spaces with single space
        .map(line => line.replace(/\s*=\s*/g, '=')) // Remove spaces around =
        .join(';'); // Join with semicolon for compactness

    // Save non-glossary options to sync storage
    chrome.storage.sync.set({
        modelProvider: document.getElementById('modelProvider').value,
        apiKey: document.getElementById('apiKey').value,
        modelName: document.getElementById('modelName').value,
        extractionMode: document.getElementById('extractionMode').value,
        sourceLang: document.getElementById('sourceLang').value,
        targetLang: document.getElementById('targetLang').value,
        autoClickPaste: document.getElementById('autoClickPaste').checked
    }, function() {
        const status = document.getElementById('status');
        if (chrome.runtime.lastError) {
            status.textContent = 'Error saving general options: ' + chrome.runtime.lastError.message;
            status.style.color = 'red';
            console.error('Error saving general options:', chrome.runtime.lastError);
        } else {
            // Save glossary to local storage (larger quota)
            chrome.storage.local.set({
                glossary: processedGlossary
            }, function() {
                if (chrome.runtime.lastError) {
                    status.textContent = 'Error saving glossary: ' + chrome.runtime.lastError.message;
                    status.style.color = 'red';
                    console.error('Error saving glossary:', chrome.runtime.lastError);
                } else {
                    status.textContent = 'Options saved.';
                    status.style.color = 'green';
                }
                setTimeout(() => { status.textContent = ''; status.style.color = ''; }, 3000);
            });
        }
    });
}

function restore_options() {
    chrome.storage.sync.get({
        modelProvider: 'lmstudio',
        apiKey: '',
        modelName: 'gemini-2.5-flash', // Default to a valid model
        extractionMode: 'translate',
        sourceLang: '',
        targetLang: 'zh-TW',
        autoClickPaste: false
    }, function(items) {
        document.getElementById('modelProvider').value = items.modelProvider;
        document.getElementById('apiKey').value = items.apiKey;
        document.getElementById('modelName').value = items.modelName;
        document.getElementById('extractionMode').value = items.extractionMode;
        document.getElementById('sourceLang').value = items.sourceLang;
        document.getElementById('targetLang').value = items.targetLang;
        document.getElementById('autoClickPaste').checked = items.autoClickPaste;
        
        updateUI(items.modelProvider);
    });
}

function updateUI(provider) {
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const modelNameGroup = document.getElementById('modelNameGroup');
    const modelNameSelect = document.getElementById('modelName'); // Get the select element

    // Clear existing options first
    modelNameSelect.innerHTML = '';

    if (provider === 'lmstudio') {
        apiKeyGroup.classList.add('hidden');
        modelNameGroup.classList.add('hidden');
        // LM Studio uses a generic local-model name
        modelNameSelect.innerHTML = '<option value="local-model">local-model</option>';
    } else if (provider === 'gemini') {
        apiKeyGroup.classList.remove('hidden');
        modelNameGroup.classList.remove('hidden');
        // Specific options for Gemini models
        modelNameSelect.innerHTML = `
            <option value=\"gemini-2.5-flash\">gemini-2.5-flash</option>
            <option value=\"gemini-2.5-flash-lite\">gemini-2.5-flash-lite</option>
        `;
    } else { // Fallback for any other future providers
        apiKeyGroup.classList.remove('hidden');
        modelNameGroup.classList.add('hidden'); // Ensure modelName is hidden for unknown providers
        modelNameSelect.innerHTML = '<option value="">Select Model</option>';
    }
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('modelProvider').addEventListener('change', (e) => {
    updateUI(e.target.value);
});