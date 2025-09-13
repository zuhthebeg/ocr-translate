function save_options() {
    chrome.storage.sync.set({
        modelProvider: document.getElementById('modelProvider').value,
        apiKey: document.getElementById('apiKey').value,
        modelName: document.getElementById('modelName').value,
        extractionMode: document.getElementById('extractionMode').value,
        sourceLang: document.getElementById('sourceLang').value,
        targetLang: document.getElementById('targetLang').value,
        glossary: document.getElementById('glossary').value,
        autoClickPaste: document.getElementById('autoClickPaste').checked
    }, function() {
        const status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(() => { status.textContent = ''; }, 1500);
    });
}

function restore_options() {
    chrome.storage.sync.get({
        modelProvider: 'lmstudio',
        apiKey: '',
        modelName: 'local-model',
        extractionMode: 'translate',
        sourceLang: '',
        targetLang: 'zh-TW',
        glossary: '',
        autoClickPaste: false
    }, function(items) {
        document.getElementById('modelProvider').value = items.modelProvider;
        document.getElementById('apiKey').value = items.apiKey;
        document.getElementById('modelName').value = items.modelName;
        document.getElementById('extractionMode').value = items.extractionMode;
        document.getElementById('sourceLang').value = items.sourceLang;
        document.getElementById('targetLang').value = items.targetLang;
        document.getElementById('glossary').value = items.glossary;
        document.getElementById('autoClickPaste').checked = items.autoClickPaste;
        
        updateUI(items.modelProvider);
    });
}

function updateUI(provider) {
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const modelNameGroup = document.getElementById('modelNameGroup');
    if (provider === 'lmstudio') {
        apiKeyGroup.classList.add('hidden');
        modelNameGroup.classList.add('hidden');
    } else {
        apiKeyGroup.classList.remove('hidden');
        modelNameGroup.classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('modelProvider').addEventListener('change', (e) => {
    updateUI(e.target.value);
});