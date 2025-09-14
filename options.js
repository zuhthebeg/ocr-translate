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
function showStatus(message, isError = false, duration = 2000) {
    let statusDiv = document.getElementById('autoSaveStatus');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'autoSaveStatus';
        statusDiv.style.position = 'fixed';
        statusDiv.style.bottom = '20px';
        statusDiv.style.left = '50%';
        statusDiv.style.transform = 'translateX(-50%)';
        statusDiv.style.padding = '10px 20px';
        statusDiv.style.borderRadius = '5px';
        statusDiv.style.zIndex = '2147483647';
        statusDiv.style.opacity = '0';
        statusDiv.style.transition = 'opacity 0.3s ease';
        document.body.appendChild(statusDiv);
    }

    if (statusTimeout) clearTimeout(statusTimeout);

    statusDiv.textContent = message;
    statusDiv.style.backgroundColor = isError ? '#e74c3c' : '#27ae60';
    statusDiv.style.opacity = '1';

    statusTimeout = setTimeout(() => {
        statusDiv.style.opacity = '0';
    }, duration);
}

// --- Save & Restore Options ---
async function save_options() {
    const localServerAddress = document.getElementById('localServerAddress').value.trim();
    const modelProvider = document.getElementById('modelProvider').value;

    // If using lmstudio, request permission for the origin
    if (modelProvider === 'lmstudio' && localServerAddress) {
        try {
            const url = new URL(localServerAddress);
            const origin = url.origin + '/'; // Permissions need a trailing slash

            const granted = await chrome.permissions.request({ origins: [origin] });

            if (granted) {
                showStatus('Permission granted!');
            } else {
                showStatus('Permission denied.', true);
            }
        } catch (e) {
            showStatus('Invalid URL format.', true);
            console.error("Invalid URL for permission request:", e);
            return; // Stop saving if URL is invalid
        }
    }

    const resultAction = document.querySelector('input[name="resultAction"]:checked').value;
    const glossary = document.getElementById('glossary').value;

    chrome.storage.sync.set({
        modelProvider: modelProvider,
        apiKey: document.getElementById('apiKey').value,
        modelName: document.getElementById('modelName').value,
        extractionMode: document.getElementById('extractionMode').value,
        sourceLang: document.getElementById('sourceLang').value,
        targetLang: document.getElementById('targetLang').value,
        resultAction: resultAction,
        localServerAddress: localServerAddress
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving sync settings:', chrome.runtime.lastError);
            showStatus('Error saving!', true);
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
        resultAction: 'clipboard',
        localServerAddress: 'http://localhost:1234'
    }, function(items) {
        document.getElementById('modelProvider').value = items.modelProvider;
        document.getElementById('apiKey').value = items.apiKey;
        document.getElementById('modelName').value = items.modelName;
        document.getElementById('extractionMode').value = items.extractionMode;
        document.getElementById('sourceLang').value = items.sourceLang;
        document.getElementById('targetLang').value = items.targetLang;
        document.getElementById('localServerAddress').value = items.localServerAddress;
        
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
    const localServerGroup = document.getElementById('localServerGroup');
    const modelNameSelect = document.getElementById('modelName');

    modelNameSelect.innerHTML = '';
    apiKeyGroup.classList.add('hidden');
    modelNameGroup.classList.add('hidden');
    localServerGroup.classList.add('hidden');

    if (provider === 'lmstudio') {
        localServerGroup.classList.remove('hidden');
        modelNameSelect.innerHTML = '<option value="local-model">local-model</option>';
    } else if (provider === 'gemini') {
        apiKeyGroup.classList.remove('hidden');
        modelNameGroup.classList.remove('hidden');
        modelNameSelect.innerHTML = `
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
        `;
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    restore_options();

    const debouncedSave = debounce(save_options, 500);

    const inputs = ['apiKey', 'glossary', 'localServerAddress'];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener('input', debouncedSave);
    });

    const changes = ['modelName', 'extractionMode', 'sourceLang', 'targetLang'];
    changes.forEach(id => {
        document.getElementById(id).addEventListener('change', save_options);
    });

    document.querySelectorAll('input[name="resultAction"]').forEach(radio => {
        radio.addEventListener('change', save_options);
    });

    document.getElementById('modelProvider').addEventListener('change', (e) => {
        updateUI(e.target.value);
        save_options(); // Also save when provider changes
    });
});
