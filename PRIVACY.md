# Privacy Policy for OCR Translator

Last Updated: 2025-09-14

Thank you for using OCR Translator. This privacy policy explains what data the extension handles and why. Our core principle is to protect your privacy by processing everything locally on your computer.

## 1. Single Purpose of the Extension

The single purpose of "OCR Translator" is to **allow the user to capture a specific area of their screen, recognize the text within it (OCR), and provide a translation.** All features and data handling are strictly limited to achieving this purpose.

## 2. Data Handling and Prominent Disclosure

To comply with the User Data Policy, we provide this clear disclosure about the data the extension handles.

**No Data is Collected or Transmitted Externally.**

This extension is designed for complete privacy. **We do not collect, store, or transmit any of your personal data or on-screen content to any external servers.** All processing happens locally on your computer.

Here is a breakdown of how data is handled internally:

*   **Screen Capture Data:** When you select an area of your screen, the extension takes a screenshot of only that specific area. This image data is held temporarily in your computer's memory. It is **never** sent over the internet.
*   **Recognized Text (OCR):** The captured image is processed locally to recognize text. This text is then used for translation.
*   **Translated Text:** The recognized text is sent to a local language model (LLM) running on your own machine for translation.

## 3. Justification for Permissions

The extension requests certain permissions only to enable its core functionality.

*   `activeTab` / `scripting` / `<all_urls>`: These permissions are required to enable the screen capture functionality on any webpage you visit. The extension needs to draw a selection box over the web page and capture the selected area. No data from the pages is read or stored.
*   `storage`: This permission is used to save your settings, such as your preferred translation language, locally on your browser.
*   `clipboardWrite` / `clipboardRead`: These permissions are used to provide the convenience of copying the translated text to your clipboard or pasting text for translation.
*   `offscreen`: This is used to run the OCR and translation tasks in a background process on your machine, ensuring the web page you are on does not slow down.

## 4. Secure Handling and Localhost Communication

This section directly addresses the "Secure Handling" policy.

The extension communicates with a local server at `http://localhost:1234/` to access the local AI model for translation.

*   **Why HTTP is Used:** The connection is to `localhost`, which is a special address that always points to your own computer. This is **not an external internet address.**
*   **Is it Secure?** Yes. Because the data transfer occurs entirely within your own computer (from the browser extension to a local program), it does not travel over the public internet and is therefore not exposed to network sniffing or interception. It is an offline, local-only operation.
*   **No User Data Transmitted:** The only data sent to this local address is the text recognized from your screen capture, for the sole purpose of translation by the local AI model.

We use this method to provide powerful AI translation features without compromising your privacy by sending data to the cloud.

By using the OCR Translator extension, you consent to the data handling practices described in this policy, which are all performed locally on your computer.

---
Contact: If you have any questions about this privacy policy, please contact us at [Your-Email-Here].