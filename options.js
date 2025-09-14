// Debounce function to limit how often a function can run
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// --- Status Notifier ---
let statusTimeout;
function showStatus(message, duration = 1500) {
    let statusDiv = document.getElementById('autoSaveStatus');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'autoSaveStatus';
        statusDiv.style.position = 'fixed';
        statusDiv.style.bottom = '20px';
        statusDiv.style.left = '50%';
        statusDiv.style.transform = 'translateX(-50%)';
        statusDiv.style.padding = '10px 20px';
        statusDiv.style.backgroundColor = '#27ae60';
        statusDiv.style.color = 'white';
        statusDiv.style.borderRadius = '5px';
        statusDiv.style.zIndex = '2147483647';
        statusDiv.style.opacity = '0';
        statusDiv.style.transition = 'opacity 0.3s ease';
        document.body.appendChild(statusDiv);
    }

    if (statusTimeout) clearTimeout(statusTimeout);

    statusDiv.textContent = message;
    statusDiv.style.opacity = '1';

    statusTimeout = setTimeout(() => {
        statusDiv.style.opacity = '0';
    }, duration);
}

// --- Save & Restore Options ---
function save_options() {
    const resultAction = document.querySelector('input[name="resultAction"]:checked').value;
    const glossary = document.getElementById('glossary').value;

    chrome.storage.sync.set({
        modelProvider: document.getElementById('modelProvider').value,
        apiKey: document.getElementById('apiKey').value,
        modelName: document.getElementById('modelName').value,
        extractionMode: document.getElementById('extractionMode').value,
        sourceLang: document.getElementById('sourceLang').value,
        targetLang: document.getElementById('targetLang').value,
        resultAction: resultAction
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving sync settings:', chrome.runtime.lastError);
        } else {
            showStatus('Saved!');
        }
    });

    chrome.storage.local.set({ glossary: glossary }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving local settings:', chrome.runtime.lastError);
        }
    });
}

function restore_options() {
    chrome.storage.sync.get({
        modelProvider: 'lmstudio',
        apiKey: '',
        modelName: 'gemini-2.5-flash',
        extractionMode: 'translate',
        sourceLang: '',
        targetLang: 'zh-TW',
        resultAction: 'clipboard'
    }, function(items) {
        document.getElementById('modelProvider').value = items.modelProvider;
        document.getElementById('apiKey').value = items.apiKey;
        document.getElementById('modelName').value = items.modelName;
        document.getElementById('extractionMode').value = items.extractionMode;
        document.getElementById('sourceLang').value = items.sourceLang;
        document.getElementById('targetLang').value = items.targetLang;
        
        const radioToCheck = document.querySelector(`input[name="resultAction"][value="${items.resultAction}"]`);
        if (radioToCheck) radioToCheck.checked = true;
        
        updateUI(items.modelProvider);
    });

    chrome.storage.local.get({ glossary: '' }, function(items) {
        document.getElementById('glossary').value = items.glossary;
    });
}

function updateUI(provider) {
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const modelNameGroup = document.getElementById('modelNameGroup');
    const modelNameSelect = document.getElementById('modelName');

    modelNameSelect.innerHTML = '';

    if (provider === 'lmstudio') {
        apiKeyGroup.classList.add('hidden');
        modelNameGroup.classList.add('hidden');
        modelNameSelect.innerHTML = '<option value="local-model">local-model</option>';
    } else if (provider === 'gemini') {
        apiKeyGroup.classList.remove('hidden');
        modelNameGroup.classList.remove('hidden');
        modelNameSelect.innerHTML = `
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
        `;
    } else {
        apiKeyGroup.classList.remove('hidden');
        modelNameGroup.classList.add('hidden');
        modelNameSelect.innerHTML = '<option value="">Select Model</option>';
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    restore_options();

    const debouncedSave = debounce(save_options, 400);

    const inputs = ['apiKey', 'glossary'];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener('input', debouncedSave);
    });

    const selects = ['modelProvider', 'modelName', 'extractionMode', 'sourceLang', 'targetLang'];
    selects.forEach(id => {
        document.getElementById(id).addEventListener('change', save_options);
    });

    document.querySelectorAll('input[name="resultAction"]').forEach(radio => {
        radio.addEventListener('change', save_options);
    });

    document.getElementById('modelProvider').addEventListener('change', (e) => {
        updateUI(e.target.value);
    });
});