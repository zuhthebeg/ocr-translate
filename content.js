let isDragging = false;
let potentialDrag = false;
let dragJustFinished = false;
let startX, startY;
let overlay = null;
const DRAG_THRESHOLD = 5; // Minimum pixels to move to be considered a drag

console.log("[OCR] Content script loaded.");

// --- Toast Notification Logic ---
let toastTimer = null;
function showToast(message, duration = 3000) {
    let toast = document.querySelector('.ocr-translator-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'ocr-translator-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
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
    if (!isDragging) return; // Not a drag, do nothing.

    if (e.button === 2) {
        dragJustFinished = true; // Set flag for contextmenu listener
        isDragging = false;
        removeOverlay();

        const endX = e.clientX;
        const endY = e.clientY;
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const width = Math.abs(startX - endX);
        const height = Math.abs(startY - endY);

        if (width > 10 && height > 10) {
            showToast('Translating...', 2000);
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
        dragJustFinished = false; // Reset the flag
    }
});

window.addEventListener('keydown', (e) => {
    if ((isDragging || potentialDrag) && e.key === 'Escape') {
        isDragging = false;
        potentialDrag = false;
        removeOverlay();
    }
});

// --- Listener for messages from background script ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translationSuccess') {
        const truncatedText = request.text.length > 50 ? request.text.substring(0, 50) + '...' : request.text;
        showToast(`Copied: "${truncatedText}"`, 4000);
    } else if (request.action === 'autoClickPaste') {
        const { x, y } = request.coords;
        const elementAtPoint = document.elementFromPoint(x, y);

        if (elementAtPoint) {
            const targetContainer = elementAtPoint.closest('.translation-imgs') || elementAtPoint.closest('#trans-t');
            const elementToClick = targetContainer || elementAtPoint;

            console.log("[OCR] Simulating a click on:", elementToClick);

            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y
            });
            elementToClick.dispatchEvent(clickEvent);

            setTimeout(async () => {
                try {
                    const textToPaste = await navigator.clipboard.readText();
                    const activeElement = document.activeElement;
                    
                    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                        console.log("[OCR] Pasting text into focused element:", activeElement);
                        activeElement.value = textToPaste;
                        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        console.error("[OCR] No active input/textarea found to paste into.");
                    }
                } catch (err) {
                    console.error("[OCR] Paste failed. Permissions issue?", err);
                }
            }, 1000);

        } else {
            console.error("[OCR] Could not find an element to click at the specified coordinates.");
        }
    } else if (request.action === 'showCustomToast') {
        showToast(request.message, request.duration);
    }
});