# GEMINI.md

## Project Overview

This project is a Chrome browser extension (Manifest V3) designed for on-the-fly OCR (Optical Character Recognition) and translation. It allows users to select an area of their screen, captures it, extracts text, and translates it. The extension is architected to work with a local Large Language Model (LLM) via an API endpoint, but also supports configuration for Google's Gemini API.

The core functionality is initiated by a right-click and drag action on any webpage, which triggers the screen capture and translation workflow.

## How It Works

The extension follows a typical Manifest V3 architecture:

1.  **`content.js` (Content Script):** Injected into the web page, it listens for a right-click and drag mouse event. It draws a visual overlay for the user to see the selected area. Once the user releases the mouse, it sends the coordinates of the selected area to the service worker (`background.js`).
2.  **`background.js` (Service Worker):** This is the brain of the extension. It receives the coordinates, captures the visible tab, and then passes the captured image and coordinates to an offscreen document for processing.
3.  **`offscreen.js` & `offscreen.html` (Offscreen Document):** Because Service Workers in Manifest V3 don't have DOM access, an offscreen document is used to create a temporary canvas element. The captured screen image is drawn onto this canvas and cropped according to the user's selection. The cropped image is then converted to a Base64 data URL.
4.  **`background.js` (Service Worker):** The service worker receives the cropped image data. It then constructs a request to the configured LLM API (either a local one or the Gemini API), sending the image for OCR and translation.
5.  **API Response:** Once the LLM responds with the translated text, the service worker copies the text to the user's clipboard and displays a brief notification.

## Key Files

*   `manifest.json`: The extension's manifest file. It defines permissions (activeTab, storage, scripting, offscreen), registers the service worker, content scripts, and options page. It also specifies host permissions for the local LLM API.
*   `background.js`: The core service worker. It orchestrates the entire process, from receiving the capture request to calling the API and handling the response.
*   `content.js`: The content script responsible for all user interaction on the web page, including detecting the drag-to-capture gesture.
*   `content.css`: Styles for the overlay and notifications created by `content.js`.
*   `offscreen.js` / `offscreen.html`: The offscreen document used for image cropping.
*   `options.html` / `options.js` / `options.css`: The user-facing options page for configuring the extension's settings, such as API provider, model name, API key, and languages.
*   `DESIGN.md`: A detailed design document outlining the system architecture, data flow, component responsibilities, and API models. This is a crucial document for understanding the project in depth.

## Building and Running

This is an unpacked Chrome extension. To install and run it for development:

1.  Open Google Chrome and navigate to `chrome://extensions`.
2.  Enable "Developer mode" using the toggle in the top-right corner.
3.  Click the "Load unpacked" button.
4.  Select the directory containing this project (`/home/cocy/ocr-translate`).
5.  The extension will be installed and active. You can manage its settings by clicking its icon in the Chrome toolbar.

## Development Conventions

*   The project follows a message-passing architecture, with components communicating via `chrome.runtime.sendMessage`.
*   Configuration is stored using `chrome.storage.sync`.
*   The `DESIGN.md` file serves as the primary source of truth for the intended architecture and data flow.
*   The extension supports two API providers: a local LM Studio instance and the Google Gemini API. The logic for each is separated in `background.js`.
