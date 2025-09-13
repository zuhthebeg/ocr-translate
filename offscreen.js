chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'cropImage') {
    const { dataUrl, area } = request;

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = area.width;
      canvas.height = area.height;
      const ctx = canvas.getContext('2d');
      
      ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
      
      const croppedDataUrl = canvas.toDataURL('image/png');
      chrome.runtime.sendMessage({ action: 'cropImageResult', dataUrl: croppedDataUrl });
    };
    image.onerror = (err) => {
        console.error("Offscreen image loading error:", err);
        chrome.runtime.sendMessage({ action: 'cropImageResult', error: 'Failed to load image in offscreen document.' });
    }
    image.src = dataUrl;
  }
});
