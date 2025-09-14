let isDragging = false;
let potentialDrag = false;
let dragJustFinished = false;
let startX, startY;
let overlay = null;
const DRAG_THRESHOLD = 5; // Minimum pixels to move to be considered a drag

console.log("[OCR] Content script loaded.");

// --- UI Management ---
function showToast(message, duration = 3000) {
    let toast = document.querySelector('.ocr-translator-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'ocr-translator-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');

    const toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function showLoader(coords) {
    hideLoader(); // Ensure no multiple loaders
    const loader = document.createElement('div');
    loader.className = 'ocr-translator-loader';
    // Position loader at the start of the drag, slightly offset
    loader.style.left = `${coords.startX + 15}px`;
    loader.style.top = `${coords.startY + 15}px`;
    document.body.appendChild(loader);
}

function hideLoader() {
    const loader = document.querySelector('.ocr-translator-loader');
    if (loader) {
        loader.remove();
    }
}

// --- Overlay Logic ---
function createOverlay() {
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'ocr-translator-overlay';
        document.body.appendChild(overlay);
    }
}

function removeOverlay() {
    if (overlay) {
        overlay.remove();
        overlay = null;
    }
}

function updateOverlay(e) {
    const currentX = e.clientX;
    const currentY = e.clientY;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(startX - currentX);
    const height = Math.abs(startY - currentY);
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
}

// --- Event Handling Logic ---
window.addEventListener('mousedown', (e) => {
    if (e.button === 2) { // Right-click
        potentialDrag = true;
        isDragging = false;
        dragJustFinished = false;
        startX = e.clientX;
        startY = e.clientY;
    }
});

window.addEventListener('mousemove', (e) => {
    if (!potentialDrag) return;

    if (!isDragging) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
            isDragging = true;
            createOverlay();
        }
    }

    if (isDragging) {
        updateOverlay(e);
    }
});

window.addEventListener('mouseup', (e) => {
    potentialDrag = false;
    if (!isDragging) return;

    if (e.button === 2) {
        dragJustFinished = true;
        isDragging = false;
        removeOverlay();

        const endX = e.clientX;
        const endY = e.clientY;
        let x = Math.min(startX, endX);
        let y = Math.min(startY, endY);
        let width = Math.abs(startX - endX);
        let height = Math.abs(startY - endY);

        const dpr = window.devicePixelRatio || 1;
        x *= dpr;
        y *= dpr;
        width *= dpr;
        height *= dpr;

        if (width > 10 && height > 10) {
            showLoader({ startX, startY });
            const captureRequest = {
                action: "capture",
                area: { x, y, width, height },
                coords: { startX, startY, endX, endY }
            };
            chrome.runtime.sendMessage(captureRequest);
        }
    }
});

window.addEventListener('contextmenu', (e) => {
    if (dragJustFinished) {
        e.preventDefault();
        dragJustFinished = false;
    }
});

window.addEventListener('keydown', (e) => {
    // Cancel drag or loading with Escape key
    if (e.key === 'Escape') {
        if (isDragging || potentialDrag) {
            isDragging = false;
            potentialDrag = false;
            removeOverlay();
        }
        hideLoader();
    }
});

// --- Listener for messages from background script ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    hideLoader(); // Hide loader on any final response from background

    if (request.action === 'translationSuccess') {
        const truncatedText = request.text.length > 50 ? request.text.substring(0, 50) + '...' : request.text;
        showToast(`Copied: "${truncatedText}"`, 4000);
    } else if (request.action === 'autoClickPaste') {
        const { x, y } = request.coords;
        const elementAtPoint = document.elementFromPoint(x, y);

        if (elementAtPoint) {
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
            elementAtPoint.dispatchEvent(clickEvent);
            setTimeout(() => document.execCommand('paste'), 100);
        } else {
            console.error("[OCR] Could not find an element to click at the specified coordinates.");
        }
    } else if (request.action === 'showResultPopup') {
        const { text, coords } = request;
        const existingPopup = document.querySelector('.ocr-translator-result-popup');
        if (existingPopup) existingPopup.remove();

        const popup = document.createElement('div');
        popup.className = 'ocr-translator-result-popup';
        popup.style.top = `${coords.startY}px`;
        popup.style.left = `${coords.startX}px`;

        const textDiv = document.createElement('div');
        textDiv.className = 'ocr-translator-result-popup-text';
        textDiv.textContent = text;

        const closeButton = document.createElement('button');
        closeButton.className = 'ocr-translator-result-popup-close';

        popup.appendChild(textDiv);
        popup.appendChild(closeButton);
        document.body.appendChild(popup);

        closeButton.addEventListener('click', () => popup.remove());

    } else if (request.action === 'showCustomToast') {
        showToast(request.message, request.duration);
    }
});