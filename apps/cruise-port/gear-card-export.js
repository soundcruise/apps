import { gearCardLabel } from './gear-list-ux.js?v=0.58.0';

const WIDTH = 1200;
const HEIGHT = 1600;
const FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const STATUS_LABELS = { owned: '今持っている機材', sold: '手放した機材', wishlist: 'ほしい機材' };

function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
}

function drawLines(context, value, x, y, maxWidth, lineHeight, maxLines) {
    const characters = Array.from(String(value || '').replace(/\s+/gu, ' ').trim());
    let line = '';
    let lineIndex = 0;
    for (let index = 0; index < characters.length; index += 1) {
        const candidate = line + characters[index];
        if (line && context.measureText(candidate).width > maxWidth) {
            if (lineIndex === maxLines - 1) {
                while (line && context.measureText(`${line}…`).width > maxWidth) line = line.slice(0, -1);
                context.fillText(`${line}…`, x, y + lineIndex * lineHeight);
                return;
            }
            context.fillText(line, x, y + lineIndex * lineHeight);
            lineIndex += 1;
            line = characters[index];
        } else {
            line = candidate;
        }
    }
    if (line) context.fillText(line, x, y + lineIndex * lineHeight);
}

function drawPill(context, label, x, y) {
    context.font = `600 28px ${FONT}`;
    const width = Math.min(500, context.measureText(label).width + 38);
    context.fillStyle = '#252116';
    context.strokeStyle = '#776847';
    context.lineWidth = 2;
    roundedRect(context, x, y, width, 52, 26);
    context.fill();
    context.stroke();
    context.fillStyle = '#e6d29b';
    drawLines(context, label, x + 19, y + 35, width - 38, 35, 1);
    return width;
}

async function loadPhoto(blob) {
    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
        });
        return image;
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function createGearCardPng(item, categories, photoBlob = null) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas-unavailable');

    context.fillStyle = '#11100d';
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.strokeStyle = '#74633f';
    context.lineWidth = 3;
    roundedRect(context, 36, 36, 1128, 1528, 42);
    context.stroke();

    context.fillStyle = '#e6d29b';
    context.font = `700 35px ${FONT}`;
    context.fillText('CRUISE PORT', 86, 114);
    context.fillStyle = '#a49a86';
    context.font = `400 25px ${FONT}`;
    context.textAlign = 'right';
    context.fillText('GEAR CARD', 1114, 112);
    context.textAlign = 'left';

    context.save();
    roundedRect(context, 80, 160, 1040, 780, 24);
    context.clip();
    context.fillStyle = '#201c15';
    context.fillRect(80, 160, 1040, 780);
    if (photoBlob) {
        const image = await loadPhoto(photoBlob);
        const coverScale = Math.max(1040 / image.naturalWidth, 780 / image.naturalHeight);
        const coverWidth = image.naturalWidth * coverScale;
        const coverHeight = image.naturalHeight * coverScale;
        context.globalAlpha = 0.25;
        context.drawImage(image, 80 + (1040 - coverWidth) / 2, 160 + (780 - coverHeight) / 2, coverWidth, coverHeight);
        context.globalAlpha = 1;
        const scale = Math.min(1040 / image.naturalWidth, 780 / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, 80 + (1040 - width) / 2, 160 + (780 - height) / 2, width, height);
    } else {
        const gradient = context.createLinearGradient(80, 160, 1120, 940);
        gradient.addColorStop(0, '#282319');
        gradient.addColorStop(1, '#17150f');
        context.fillStyle = gradient;
        context.fillRect(80, 160, 1040, 780);
        context.fillStyle = '#a49a86';
        context.font = `500 38px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('写真なし', 600, 565);
        context.textAlign = 'left';
    }
    context.restore();

    const category = categories.find((entry) => entry.id === item.category)?.name || item.category || 'その他';
    const status = STATUS_LABELS[item.status] || '機材';
    const categoryWidth = drawPill(context, category, 86, 976);
    drawPill(context, status, 86 + categoryWidth + 16, 976);

    context.fillStyle = '#aaa08b';
    context.font = `500 30px ${FONT}`;
    drawLines(context, item.manufacturer || '機材', 88, 1082, 1024, 38, 1);
    context.fillStyle = '#f4f0e8';
    context.font = `700 66px ${FONT}`;
    drawLines(context, item.name, 86, 1170, 1028, 76, 2);

    if (item.priceText) {
        context.fillStyle = '#e6d29b';
        context.font = `650 48px ${FONT}`;
        drawLines(context, item.priceText, 88, 1382, 1024, 54, 1);
    }
    if (item.memo) {
        context.fillStyle = '#a49a86';
        context.font = `400 27px ${FONT}`;
        drawLines(context, item.memo, 88, 1450, 1024, 38, 2);
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('png-unavailable')), 'image/png');
    });
}

export async function shareGearCardPng(blob, item, {
    navigatorObject = globalThis.navigator,
    downloadBlob
} = {}) {
    const safeName = String(item.name || '機材カード').replace(/[\\/:*?"<>|]/gu, '_').slice(0, 80);
    const fileName = `${safeName || '機材カード'}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });
    let canShareFile = false;
    try { canShareFile = typeof navigatorObject?.share === 'function' && navigatorObject.canShare?.({ files: [file] }) === true; }
    catch (_) { canShareFile = false; }
    if (canShareFile) {
        try {
            await navigatorObject.share({ files: [file], title: gearCardLabel(item) });
            return 'shared';
        } catch (error) {
            if (error?.name === 'AbortError') return 'cancelled';
        }
    }
    downloadBlob(blob, fileName);
    return 'downloaded';
}
