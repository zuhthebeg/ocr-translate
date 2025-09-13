const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get({
        modelProvider: 'lmstudio',
        apiKey: '',
        modelName: 'local-model',
        extractionMode: 'translate',
        sourceLang: '',
        targetLang: 'zh-TW',
        glossary: '',
        autoClickPaste: false
    }, (items) => {
        chrome.storage.sync.set(items);
    });
});

async function captureAndTranslate(request) {
    try {
        const { area, coords } = request;
        const activeTab = await getActiveTab();
        if (!activeTab) throw new Error("No active tab found.");

        const screenDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        const settings = await chrome.storage.sync.get([
            'modelProvider', 'apiKey', 'modelName', // New model settings
            'extractionMode', 'sourceLang', 'targetLang', 'glossary', 'autoClickPaste'
        ]);

        const croppedDataUrl = await cropImage(screenDataUrl, area);
        if (!croppedDataUrl || croppedDataUrl === 'data:,') {
            throw new Error("Failed to crop a valid image.");
        }

        // callLlmApi now returns the parsed text directly
        const resultText = await callLlmApi(croppedDataUrl, settings);
        if (!resultText) throw new Error("Result text is empty.");

        await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: copyToClipboard,
            args: [resultText]
        });

        chrome.tabs.sendMessage(activeTab.id, { 
            action: 'translationSuccess', 
            text: resultText 
        });

        if (settings.autoClickPaste) {
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'autoClickPaste',
                coords: { x: coords.startX, y: coords.startY }
            });
        }

    } catch (error) {
        console.error("OCR Translator Error:", error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "capture") {
        captureAndTranslate(request);
    }
});

async function cropImage(dataUrl, area) {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    return new Promise((resolve, reject) => {
        const listener = (msg) => {
            if (msg.action === 'cropImageResult') {
                chrome.runtime.onMessage.removeListener(listener);
                if (msg.dataUrl) {
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

    await chrome.offscreen.createDocument({
        url: path,
        reasons: ['DOM_PARSER'],
        justification: 'Image cropping requires DOM APIs (Canvas).'
    });
}

// --- LLM API Dispatcher ---
async function callLlmApi(imageDataUrl, settings) {
    let responseData;
    switch (settings.modelProvider) {
        case 'lmstudio':
            responseData = await _callLmStudioApi(imageDataUrl, settings);
            break;
        case 'openai':
            responseData = await _callOpenAIApi(imageDataUrl, settings);
            break;
        case 'gemini':
            responseData = await _callGeminiApi(imageDataUrl, settings);
            break;
        default:
            throw new Error('Unsupported model provider: ' + settings.modelProvider);
    }
    return responseData; // Now returns the parsed text
}

// --- Helper for LM Studio API Call ---
async function _callLmStudioApi(imageDataUrl, settings) {
    let systemPrompt = '';
    let userPrompt = '';

    if (settings.extractionMode === 'ocr_only') {
        systemPrompt = `You are an expert at accurately extracting all text from an image.\nRules:\n1. Extract all text from the image.\n2. Output only the extracted text. Do not add any other explanations or introductory phrases.`;
        userPrompt = `Extract the text from this image.`;
    } else { // Default to translate
        systemPrompt = `당신은 이미지 속 텍스트를 정확히 추출하고, 지정된 언어로 번역하는 전문가입니다.\n규칙:\n1. 이미지에서 모든 텍스트를 추출합니다.\n2. 출발언어가 지정되지 않으면 자동 감지합니다.\n3. 대상언어로 번역합니다. (기본: 繁體中文)\n4. 번역 시 아래 용어집을 반드시 반영합니다.\n5. 출력은 번역문만 제공합니다. 불필요한 설명은 제거합니다.`;
        userPrompt = `출발언어: ${settings.sourceLang || '자동 감지'}\n대상언어: ${settings.targetLang || '繁體中文'}\n용어집:\n${settings.glossary}`;
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
        const errorBody = await response.text();
        throw new Error(`LM Studio API call failed with status: ${response.status}. Body: ${errorBody}`);
    }
    const jsonResponse = await response.json();
    return jsonResponse.choices[0].message.content.trim();
}

// --- Helper for OpenAI API Call ---
async function _callOpenAIApi(imageDataUrl, settings) {
    if (!settings.apiKey) {
        throw new Error("OpenAI API Key is not set in extension settings.");
    }
    if (!settings.modelName) {
        throw new Error("OpenAI Model Name is not set in extension settings.");
    }

    let systemPrompt = '';
    let userPrompt = '';

    if (settings.extractionMode === 'ocr_only') {
        systemPrompt = `You are an expert at accurately extracting all text from an image.\nRules:\n1. Extract all text from the image.\n2. Output only the extracted text. Do not add any other explanations or introductory phrases.`;
        userPrompt = `Extract the text from this image.`;
    } else {
        systemPrompt = `You are an expert at accurately extracting text from images and translating it into the specified language.\nRules:\n1. Extract all text from the image.\n2. If a source language is not specified, auto-detect it.\n3. Translate to the target language. (Default: Traditional Chinese)\n4. Strictly apply the glossary below during translation.\n5. Provide only the translated text as output. Remove any unnecessary explanations.`;
        userPrompt = `Source Language: ${settings.sourceLang || 'Auto-detect'}\nTarget Language: ${settings.targetLang || 'Traditional Chinese'}\nGlossary:\n${settings.glossary}`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.modelName,
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
        const errorBody = await response.text();
        throw new Error(`OpenAI API call failed with status: ${response.status}. Body: ${errorBody}`);
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

    if (settings.extractionMode === 'ocr_only') {
        userPromptParts.push({ text: `You are an expert at accurately extracting all text from an image. Rules: 1. Extract all text from the image. 2. Output only the extracted text. Do not add any other explanations or introductory phrases.` });
        userPromptParts.push({ text: `Extract the text from this image.` });
    } else {
        userPromptParts.push({ text: `You are an expert at accurately extracting text from images and translating it into the specified language. Rules: 1. Extract all text from the image. 2. If a source language is not specified, auto-detect it. 3. Translate to the target language. (Default: Traditional Chinese) 4. Strictly apply the glossary below during translation. 5. Provide only the translated text as output. Remove any unnecessary explanations.` });
        userPromptParts.push({ text: `Source Language: ${settings.sourceLang || 'Auto-detect'}\nTarget Language: ${settings.targetLang || 'Traditional Chinese'}\nGlossary:\n${settings.glossary}` });
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
        const errorBody = await response.text();
        throw new Error(`Gemini API call failed with status: ${response.status}. Body: ${errorBody}`);
    }
    const jsonResponse = await response.json();
    // Gemini response parsing
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
