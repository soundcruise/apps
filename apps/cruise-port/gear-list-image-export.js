import { gearCardLabel } from './gear-list-ux.js?v=0.57.0';

const WIDTH = 1200;
const PAD = 48;
const GAP = 14;
const FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const SECTIONS = [
    { status: 'owned', title: '今持っている機材' },
    { status: 'sold', title: '手放した機材' },
    { status: 'wishlist', title: 'ほしい機材' }
];

export function gearListImageSections(items, status) {
    return SECTIONS.filter((section) => status === 'all' || status === 'owned' && section.status !== 'wishlist' || status === section.status)
        .map((section) => ({ ...section, items: items.filter((item) => item.status === section.status) }));
}

function rounded(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
}

function lines(context, text, x, y, width, lineHeight, count) {
    const chars = Array.from(String(text || '').replace(/\s+/gu, ' ').trim());
    let line = '';
    let row = 0;
    for (const char of chars) {
        if (line && context.measureText(line + char).width > width) {
            if (row === count - 1) {
                while (line && context.measureText(`${line}…`).width > width) line = line.slice(0, -1);
                context.fillText(`${line}…`, x, y + row * lineHeight);
                return;
            }
            context.fillText(line, x, y + row * lineHeight);
            row += 1;
            line = char;
        } else line += char;
    }
    if (line) context.fillText(line, x, y + row * lineHeight);
}

async function imageFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
        });
        return image;
    } finally { URL.revokeObjectURL(url); }
}

function photo(context, image, x, y, size) {
    context.save();
    rounded(context, x, y, size, size, 12);
    context.clip();
    context.fillStyle = '#17150f';
    context.fillRect(x, y, size, size);
    if (image) {
        const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
    } else {
        context.fillStyle = '#a49a86';
        context.font = `500 ${Math.max(18, Math.min(30, size / 6))}px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('写真なし', x + size / 2, y + size / 2 + 8);
        context.textAlign = 'left';
    }
    context.restore();
}

function drawCard(context, item, image, category, x, y, width, height, columns) {
    context.fillStyle = item.status === 'wishlist' ? '#242016' : item.status === 'sold' ? '#171611' : '#1a1914';
    context.strokeStyle = '#514735';
    context.lineWidth = 2;
    rounded(context, x, y, width, height, 14);
    context.fill();
    context.stroke();
    const inset = columns === 4 ? 10 : 16;
    const size = columns === 1 ? 138 : width - inset * 2;
    const imageX = x + inset;
    const imageY = y + inset;
    photo(context, image, imageX, imageY, size);
    const textX = columns === 1 ? imageX + size + 20 : imageX;
    const textWidth = columns === 1 ? width - (textX - x) - 16 : width - inset * 2;
    const nameY = columns === 1 ? y + 48 : imageY + size + 33;
    context.fillStyle = '#f4f0e8';
    context.font = `700 ${columns === 1 ? 29 : columns === 4 ? 20 : 25}px ${FONT}`;
    lines(context, gearCardLabel(item), textX, nameY, textWidth, columns === 1 ? 36 : 30, columns === 1 ? 2 : 3);
    if (item.priceText) {
        context.fillStyle = '#e6d29b';
        context.font = `650 ${columns === 1 ? 25 : columns === 4 ? 17 : 21}px ${FONT}`;
        lines(context, item.priceText, textX, columns === 1 ? y + 126 : imageY + size + 124, textWidth, 24, 1);
    }
    if (columns === 1) {
        context.fillStyle = '#aaa08b';
        context.font = `400 20px ${FONT}`;
        lines(context, category, textX, y + 172, textWidth, 24, 1);
        if (item.memo) lines(context, item.memo, textX, y + 208, textWidth, 25, 2);
    }
}

export async function createGearListPng(items, categories, { status = 'all', columns = 1, getPhoto } = {}) {
    if (![1, 2, 3, 4].includes(columns)) throw new Error('invalid-columns');
    const sections = gearListImageSections(items, status);
    const cardWidth = (WIDTH - PAD * 2 - GAP * (columns - 1)) / columns;
    const cardHeight = columns === 1 ? 250 : Math.ceil(cardWidth + (columns === 4 ? 145 : 155));
    const sectionHeight = (section) => 76 + (section.items.length ? Math.ceil(section.items.length / columns) * (cardHeight + GAP) : 70) + 24;
    const height = 190 + sections.reduce((sum, section) => sum + sectionHeight(section), 0) + 48;
    if (height > 16000) throw new Error('image-too-tall');
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas-unavailable');
    context.fillStyle = '#11100d';
    context.fillRect(0, 0, WIDTH, height);
    context.fillStyle = '#e6d29b';
    context.font = `700 32px ${FONT}`;
    context.fillText('CRUISE PORT', PAD, 70);
    context.fillStyle = '#f4f0e8';
    context.font = `700 48px ${FONT}`;
    context.fillText('機材リスト', PAD, 143);
    const categoryNames = new Map(categories.map((entry) => [entry.id, entry.name]));
    const photos = new Map();
    await Promise.all(items.filter((item) => item.photoId).map(async (item) => {
        try {
            const blob = await getPhoto(item.photoId);
            if (blob) photos.set(item.id, await imageFromBlob(blob));
        } catch (_) { /* A missing photo leaves a visible placeholder. */ }
    }));
    let y = 190;
    for (const section of sections) {
        context.fillStyle = '#e6d29b';
        context.font = `650 31px ${FONT}`;
        context.fillText(section.title, PAD, y + 36);
        const titleWidth = context.measureText(section.title).width;
        context.fillStyle = '#aaa08b';
        context.font = `400 24px ${FONT}`;
        context.fillText(`${section.items.length}件`, PAD + titleWidth + 24, y + 36);
        y += 76;
        if (!section.items.length) {
            context.fillStyle = '#aaa08b';
            context.font = `400 25px ${FONT}`;
            context.fillText('機材はまだありません', PAD + 12, y + 30);
            y += 94;
            continue;
        }
        section.items.forEach((item, index) => {
            const x = PAD + (index % columns) * (cardWidth + GAP);
            const cardY = y + Math.floor(index / columns) * (cardHeight + GAP);
            drawCard(context, item, photos.get(item.id), categoryNames.get(item.category) || item.category || 'その他', x, cardY, cardWidth, cardHeight, columns);
        });
        y += Math.ceil(section.items.length / columns) * (cardHeight + GAP) + 24;
    }
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('png-unavailable')), 'image/png'));
}
