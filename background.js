const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

const GEMINI_MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const LMSTUDIO_MODELS = ['local-model'];

// Global variables for offscreen document readiness handshake
let _offscreenReadyResolve = null; // Stores the resolve function of the promise
let _offscreenReadyPromise = null; // Stores the promise itself

// PROMPTS object embedded directly to avoid module loading issues
const PROMPTS = {
    OCR_ONLY: {
        SYSTEM: `You are an expert at accurately extracting all text from an image.`, 
        USER: `Extract all text from the image. Preserve original line breaks and spacing. Do not add or remove unnecessary spaces or line breaks. Preserve the layout and structure of the text. Output only the extracted text. Do not add any other explanations or introductory phrases. IMPORTANT: Do not wrap the output in any kind of quotes (", ").`
    },
    TRANSLATE: {
        SYSTEM: `You are an expert at accurately extracting text from images and translating it into the specified language.`, 
        USER: `Extract all text from the image. Preserve original line breaks and spacing. Do not add or remove unnecessary spaces or line breaks. Preserve the layout and structure of the text. Translate all information from the original without omission. Do not summarize or paraphrase the content; translate while preserving the original meaning and information as much as possible. Translate to a length similar to the original. Maintain original line breaks, but adjust them naturally to fit the grammar and readability of the target language. Provide only the translated text as output. Remove any unnecessary explanations. IMPORTANT: Do not wrap the output in any kind of quotes (", ").\n\nSource Language: {sourceLang}\nTarget Language: {targetLang}\nGlossary:\n{glossary}`
    }
};

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get({
        modelProvider: 'lmstudio',
        apiKey: '',
        modelName: 'local-model',
        extractionMode: 'translate',
        sourceLang: '',
        targetLang: 'zh-TW', // Default target language
        resultAction: 'clipboard' // New default
    }, (items) => {
        // Set default target language to browser's UI language on first install
        if (items.targetLang === 'zh-TW') { // Only if it's still the hardcoded default
            const browserLang = chrome.i18n.getUILanguage(); // e.g., "en-US", "ko", "zh-TW"
            const primaryLang = browserLang.split('-')[0]; // e.g., "en", "ko", "zh"

            let detectedTargetLang = 'zh-TW'; // Fallback default

            const supportedLangs = [
                'en', 'ko', 'ja', 'zh-CN', 'zh-TW', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'vi'
            ];

            if (supportedLangs.includes(browserLang)) {
                detectedTargetLang = browserLang;
            } else if (supportedLangs.includes(primaryLang)) {
                detectedTargetLang = primaryLang;
            } else if (primaryLang === 'zh') {
                // Special handling for Chinese variants
                if (browserLang === 'zh-TW') {
                    detectedTargetLang = 'zh-TW';
                } else {
                    detectedTargetLang = 'zh-CN'; // Default to simplified if just 'zh' or other variant
                }
            }
            items.targetLang = detectedTargetLang;
        }
        // After potentially modifying items, set them back.
        chrome.storage.sync.set(items);
    });
});

async function captureAndTranslate(request) {
    let activeTab;
    try {
        //console.log("[OCR BG] Starting captureAndTranslate.");
        const { area, coords } = request;
        activeTab = await getActiveTab();
        if (!activeTab) throw new Error("No active tab found.");

        const screenDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        
        const settings = await chrome.storage.sync.get([
            'modelProvider', 'apiKey', 'modelName',
            'extractionMode', 'sourceLang', 'targetLang', 'resultAction'
        ]);
        const { glossary } = await chrome.storage.local.get('glossary');
        settings.glossary = glossary; // Combine settings

        //console.log("[OCR BG] Settings loaded:", settings);

        const croppedDataUrl = await cropImage(screenDataUrl, area);

        if (!croppedDataUrl || croppedDataUrl === 'data:,') {
            throw new Error("Failed to crop a valid image.");
        }
        //console.log("[OCR BG] Image cropped.");

        // Validate request size
        const imageSizeInBytes = Math.ceil(croppedDataUrl.length * (3 / 4));
        const glossarySizeInBytes = new TextEncoder().encode(settings.glossary).length;
        const totalSizeInMB = (imageSizeInBytes + glossarySizeInBytes) / (1024 * 1024);

        if (totalSizeInMB > 1) {
            const errorMessage = `Error: Request size exceeds 1MB (${totalSizeInMB.toFixed(2)}MB)`;
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'showCustomToast',
                message: errorMessage,
                duration: 5000
            });
            throw new Error(errorMessage);
        }

        let resultText = '';
        const MAX_RETRIES = 1;
        for (let i = 0; i <= MAX_RETRIES; i++) {
            try {
                //console.log(`[OCR BG] Attempt ${i + 1} to call LLM API.`);
                resultText = await callLlmApi(croppedDataUrl, settings);
                if (resultText) {
                    //console.log("[OCR BG] API call successful.");
                    break;
                }
            } catch (apiError) {
                console.error(`[OCR BG] API call attempt ${i + 1} failed:`, apiError);
                if (i < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    throw apiError;
                }
            }
        }

        if (!resultText) throw new Error("Result text is empty after API calls.");

        await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: copyToClipboard,
            args: [resultText]
        });
        //console.log("[OCR BG] Text copied to clipboard.");

        chrome.tabs.sendMessage(activeTab.id, { 
            action: 'translationSuccess', 
            text: resultText 
        });
        //console.log("[OCR BG] Translation success message sent.");

        // Perform action based on user setting
        //console.log(`[OCR BG] Performing result action: ${settings.resultAction}`);
        switch (settings.resultAction) {
            case 'paste':
                chrome.tabs.sendMessage(activeTab.id, {
                    action: 'autoClickPaste',
                    coords: { x: coords.startX, y: coords.startY }
                });
                //console.log("[OCR BG] Auto-click-paste message sent.");
                break;
            case 'popup':
                chrome.tabs.sendMessage(activeTab.id, {
                    action: 'showResultPopup',
                    text: resultText,
                    coords: { startX: coords.startX, startY: coords.startY }
                });
                //console.log("[OCR BG] Show result popup message sent.");
                break;
        }
    } catch (error) {
        console.error("OCR Translator Error:", error);

        if (error.message && (error.message.includes("API call failed") || error.message.includes("API response did not contain expected text"))) {
            const currentProvider = (await chrome.storage.sync.get('modelProvider')).modelProvider;
            const currentModel = (await chrome.storage.sync.get('modelName')).modelName;
            let fallbackModels = [];

            if (currentProvider === 'gemini') {
                fallbackModels = GEMINI_MODELS;
            }

            if (fallbackModels.length > 0) {
                const currentIndex = fallbackModels.indexOf(currentModel);
                const nextIndex = (currentIndex + 1) % fallbackModels.length;
                const nextModel = fallbackModels[nextIndex];

                if (nextModel !== currentModel) {
                    await chrome.storage.sync.set({ modelName: nextModel });
                    if (activeTab && activeTab.id) {
                        chrome.tabs.sendMessage(activeTab.id, {
                            action: 'showCustomToast',
                            message: `모델 오류 발생! '${currentModel}'에서 '${nextModel}'로 자동 변경되었습니다.`, 
                            duration: 5000
                        });
                    }
                }
            } else {
                if (activeTab && activeTab.id) {
                    chrome.tabs.sendMessage(activeTab.id, {
                        action: 'showCustomToast',
                        message: `모델 오류 발생! 모든 모델 시도 실패.`, 
                        duration: 5000
                    });
                }
            }
        }

        if (error.message && error.message.includes("429")) {
            if (activeTab && activeTab.id) {
                chrome.tabs.sendMessage(activeTab.id, {
                    action: 'showCustomToast',
                    message: '무료 체험 한도에 도달했습니다. (429 오류)', 
                    duration: 5000
                });
            }
        }
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "capture") {
        captureAndTranslate(request);
    } else if (request.action === 'offscreenReady') {
        // Resolve the promise when offscreen document signals readiness
        if (_offscreenReadyResolve) {
            _offscreenReadyResolve(); // Call the stored resolve function
            _offscreenReadyResolve = null; // Clear for next use
            _offscreenReadyPromise = null; // Clear the promise too
        }
    }
});

async function cropImage(dataUrl, area) {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    return new Promise((resolve, reject) => {
        const listener = (msg) => {
            if (msg.action === 'cropImageResult') {
                chrome.runtime.onMessage.removeListener(listener);
                if (msg.dataUrl) {
                    // 일관성을 위해 dataUrl 문자열만 반환
                    resolve(msg.dataUrl);
                } else {
                    reject(new Error(msg.error || 'Failed to crop image in offscreen document.'));
                }
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        
        chrome.runtime.sendMessage({ 
            action: 'cropImage',
            dataUrl,
            area 
        });
    }).finally(() => chrome.offscreen.closeDocument());
}


async function setupOffscreenDocument(path) {
    const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (existingContexts.length > 0) return;

    _offscreenReadyPromise = new Promise(resolve => {
        _offscreenReadyResolve = resolve;
    });

    await chrome.offscreen.createDocument({
        url: path,
        reasons: ['DOM_PARSER'], // 원래대로 복원
        justification: 'Image cropping requires DOM APIs (Canvas).'
    });

    await _offscreenReadyPromise;
}

// --- LLM API Dispatcher ---
async function callLlmApi(imageDataUrl, settings) {
    let responseData;
    switch (settings.modelProvider) {
        case 'lmstudio':
            responseData = await _callLmStudioApi(imageDataUrl, settings);
            break;
        case 'gemini':
            responseData = await _callGeminiApi(imageDataUrl, settings);
            break;
        default:
            throw new Error('Unsupported model provider: ' + settings.modelProvider);
    }
    return responseData;
}

// --- Helper for LM Studio API Call ---
async function _callLmStudioApi(imageDataUrl, settings) {
    let systemPrompt = '';
    let userPrompt = '';

    // Glossary is now processed at save time in options.js
    const processedGlossary = settings.glossary ?? ''; // Ensure it's a string

    if (settings.extractionMode === 'ocr_only') {
        systemPrompt = PROMPTS.OCR_ONLY.SYSTEM;
        userPrompt = PROMPTS.OCR_ONLY.USER;
    } else { // Default to translate
        systemPrompt = PROMPTS.TRANSLATE.SYSTEM;
        userPrompt = PROMPTS.TRANSLATE.USER
            .replace('{sourceLang}', settings.sourceLang || 'Auto-detect')
            .replace('{targetLang}', settings.targetLang || '繁體中文')
            .replace('{glossary}', processedGlossary);
    }

    const response = await fetch("http://192.168.219.107:1234/v1/chat/completions", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: settings.modelName || "local-model",
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: userPrompt },
                        { type: "image_url", image_url: { url: imageDataUrl } }
                    ]
                }
            ],
            stream: false
        })
    });

    if (!response.ok) {
        throw new Error(`LM Studio API call failed with status: ${response.status}.`);
    }
    const jsonResponse = await response.json();
    return jsonResponse.choices[0].message.content.trim();
}

// --- Helper for Google Gemini API Call ---
async function _callGeminiApi(imageDataUrl, settings) {
    if (!settings.apiKey) {
        throw new Error("Gemini API Key is not set in extension settings.");
    }
    if (!settings.modelName) {
        throw new Error("Gemini Model Name is not set in extension settings.");
    }

    const base64Data = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.split(';')[0].split(':')[1];

    let userPromptParts = [];

    // Glossary is now processed at save time in options.js
    const processedGlossary = settings.glossary ?? ''; // Ensure it's a string

    if (settings.extractionMode === 'ocr_only') {
        userPromptParts.push({ text: PROMPTS.OCR_ONLY.SYSTEM });
        userPromptParts.push({ text: PROMPTS.OCR_ONLY.USER });
    } else {
        userPromptParts.push({ text: PROMPTS.TRANSLATE.SYSTEM });
        userPromptParts.push({ text: PROMPTS.TRANSLATE.USER
            .replace('{sourceLang}', settings.sourceLang || 'Auto-detect')
            .replace('{targetLang}', settings.targetLang || '繁體中文')
            .replace('{glossary}', processedGlossary) });
    }

    userPromptParts.push({
        inlineData: {
            mimeType: mimeType,
            data: base64Data
        }
    });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.modelName}:generateContent?key=${settings.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                { parts: userPromptParts }
            ]
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API call failed with status: ${response.status}.`);
    }
    const jsonResponse = await response.json();
    if (jsonResponse.candidates && jsonResponse.candidates.length > 0 &&
        jsonResponse.candidates[0].content && jsonResponse.candidates[0].content.parts &&
        jsonResponse.candidates[0].content.parts.length > 0 && jsonResponse.candidates[0].content.parts[0].text) {
        return jsonResponse.candidates[0].content.parts[0].text.trim();
    } else {
        throw new Error("Gemini API response did not contain expected text in candidates.");
    }
}

async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}