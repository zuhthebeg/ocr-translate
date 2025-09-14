# Privacy Policy for OCR Translator

**Last Updated:** 2025-09-15

Thank you for using OCR Translator. This privacy policy explains how we handle your information when you use our extension.

### 1. Information We Collect and How We Use It

Our extension is designed with your privacy in mind. We only process data to provide the core functionality of the service.

*   **Screen Capture Data:** When you select an area of your screen, an image of that specific area is captured. This image is sent directly to the Language Model (LLM) API you have configured (either Google Gemini via your own API key, or a local server address you provide) for Optical Character Recognition (OCR) and translation. **This image data is processed in memory and is NOT stored, logged, or collected by our servers.**

*   **Glossary and Settings:** All your settings, including API keys, language preferences, and glossary terms, are stored locally on your computer using Chrome's built-in storage (`chrome.storage`). Your API key is stored in a password field but is managed entirely by your browser. **This information is never transmitted to our servers.**

### 2. Data Transmission

To perform the translation, the following data is sent to the API endpoint you have configured:

*   The captured image data (as a Base64 string).
*   Your selected source and target languages.
*   Your glossary terms (if configured).

If you use the "User API Key Mode" (e.g., for Google Gemini), this data is sent directly from your browser to Google's servers, governed by Google's own privacy policy. If you use the "Local Server Mode", this data is sent to the address you specify.

### 3. Data Storage and Security

We do not operate a central server that stores your personal data or translation history. All settings are stored locally within your Chrome browser profile.

### 4. Changes to This Privacy Policy

We may update this privacy policy from time to time. We will notify you of any changes by posting the new privacy policy in the extension's description on the Chrome Web Store.

### 5. Contact Us

If you have any questions about this privacy policy, you can contact the developer at: **cocy@kakao.com**
