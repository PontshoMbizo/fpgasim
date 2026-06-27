import React from 'react';
import { Monitor } from 'lucide-react';

export default function HdmiPreview({ ppmBase64 }) {
  if (!ppmBase64) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-text-muted bg-panel overflow-hidden">
        <Monitor size={48} className="mb-4 opacity-50" />
        <p>No HDMI frame captured.</p>
        <p className="text-[12px] opacity-70 mt-2">Connect hsync, vsync, and rgb[23:0] in your design.</p>
      </div>
    );
  }

  // Convert the PPM base64 to a canvas or data URL.
  // Actually, standard HTML <img> doesn't support PPM.
  // We can convert the PPM to a canvas rendering it here.

  const renderPpm = (canvas) => {
    if (!canvas || !ppmBase64) return;
    const ctx = canvas.getContext('2d');
    const buf = Buffer.from(ppmBase64, 'base64');
    
    // Minimal PPM parser
    let i = 0;
    while (i < buf.length && buf[i] !== 10) i++; i++; // P6
    let widthStr = '';
    while (i < buf.length && buf[i] !== 32) widthStr += String.fromCharCode(buf[i++]); i++;
    let heightStr = '';
    while (i < buf.length && buf[i] !== 10) heightStr += String.fromCharCode(buf[i++]); i++;
    let maxColor = '';
    while (i < buf.length && buf[i] !== 10) maxColor += String.fromCharCode(buf[i++]); i++;
    
    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);
    
    canvas.width = width;
    canvas.height = height;
    
    const imgData = ctx.createImageData(width, height);
    let outIdx = 0;
    for (let p = i; p < buf.length; p += 3) {
      imgData.data[outIdx++] = buf[p];
      imgData.data[outIdx++] = buf[p+1];
      imgData.data[outIdx++] = buf[p+2];
      imgData.data[outIdx++] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  };

  return (
    <div className="w-full h-full bg-black flex items-center justify-center p-4">
      <canvas ref={renderPpm} className="max-w-full max-h-full border border-edge" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
