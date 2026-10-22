import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Reproducible, dependency-free Earth Talk geological-layer mark. The source
// files are generated only inside this mobile app's owned asset directory.
const root = path.resolve('assets/images');
const size = 1024;
const scale = 2;
const high = size * scale;
const forest = [24, 61, 50, 255];
const paper = [245, 247, 244, 255];
const stone = [226, 216, 197, 255];
const clay = [156, 112, 78, 255];
const moss = [112, 144, 111, 255];

function canvas(fill) {
  const data = Buffer.alloc(high * high * 4);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return data;
}
function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]; const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polygon(data, points, color) {
  const scaled = points.map(([x, y]) => [x * scale, y * scale]);
  const minX = Math.max(0, Math.floor(Math.min(...scaled.map(([x]) => x))));
  const maxX = Math.min(high - 1, Math.ceil(Math.max(...scaled.map(([x]) => x))));
  const minY = Math.max(0, Math.floor(Math.min(...scaled.map(([, y]) => y))));
  const maxY = Math.min(high - 1, Math.ceil(Math.max(...scaled.map(([, y]) => y))));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (insidePolygon(x + 0.5, y + 0.5, scaled)) data.set(color, (y * high + x) * 4);
  }
}
function layerMark(fill, layers = [stone, clay, moss, forest]) {
  const data = canvas(fill);
  const rock = [[512,170],[674,221],[790,348],[817,506],[770,668],[650,789],[500,835],[351,788],[230,675],[190,517],[227,358],[345,233]];
  polygon(data, rock, layers[0]);
  polygon(data, [[226,491],[323,455],[419,478],[509,449],[606,467],[714,435],[808,467],[817,527],[784,641],[683,748],[574,794],[465,778],[350,735],[252,640],[210,547]], layers[1]);
  polygon(data, [[211,552],[315,526],[412,548],[511,514],[614,537],[721,503],[804,527],[784,641],[683,748],[574,794],[465,778],[350,735],[252,640]], layers[2]);
  polygon(data, [[233,618],[333,589],[426,611],[516,580],[613,601],[706,573],[785,594],[745,685],[650,765],[557,798],[454,773],[350,735],[267,670]], layers[3]);
  return data;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, sum]);
}
function encodePng(data) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const offset = y * (size * 4 + 1); rows[offset] = 0;
    for (let x = 0; x < size; x++) {
      const target = offset + 1 + x * 4; const samples = [
        ((y * scale) * high + x * scale) * 4,
        ((y * scale) * high + x * scale + 1) * 4,
        (((y * scale + 1) * high) + x * scale) * 4,
        (((y * scale + 1) * high) + x * scale + 1) * 4,
      ];
      for (let channel = 0; channel < 4; channel++) rows[target + channel] = Math.round(samples.reduce((sum, at) => sum + data[at + channel], 0) / 4);
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function write(name, data) { fs.writeFileSync(path.join(root, name), encodePng(data)); }

fs.mkdirSync(root, { recursive: true });
write('icon.png', layerMark(forest));
write('splash-icon.png', layerMark([0, 0, 0, 0]));
write('splash-icon-dark.png', layerMark([0, 0, 0, 0], [stone, clay, moss, [183, 220, 197, 255]]));
write('android-icon-foreground.png', layerMark([0, 0, 0, 0]));
const monochrome = layerMark([0, 0, 0, 0], [paper, paper, paper, paper]);
for (let i = 0; i < monochrome.length; i += 4) if (monochrome[i + 3]) monochrome.set([255, 255, 255, 255], i);
write('android-icon-monochrome.png', monochrome);
write('android-icon-background.png', canvas(paper));
write('favicon.png', layerMark(forest));
console.log('Generated Earth Talk geological-layer PNG assets in assets/images.');
