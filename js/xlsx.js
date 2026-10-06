// Чтение .xlsx без библиотек: файл это zip с XML внутри. Нужна только первая таблица.

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const utf8 = new TextDecoder('utf-8');

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Достаёт файлы из zip по центральному каталогу.
export async function unzip(buf) {
  const b = new Uint8Array(buf);
  let e = b.length - 22;
  while (e >= 0 && u32(b, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Это не архив xlsx');
  const count = u16(b, e + 10);
  let p = u32(b, e + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('Повреждён архив');
    const method = u16(b, p + 10);
    const csize = u32(b, p + 20);
    const nlen = u16(b, p + 28);
    const xlen = u16(b, p + 30);
    const clen = u16(b, p + 32);
    const off = u32(b, p + 42);
    const name = utf8.decode(b.subarray(p + 46, p + 46 + nlen));
    files[name] = { method, csize, off };
    p += 46 + nlen + xlen + clen;
  }
  const read = async (name) => {
    const f = files[name];
    if (!f) return null;
    const o = f.off;
    const start = o + 30 + u16(b, o + 26) + u16(b, o + 28);
    const data = b.subarray(start, start + f.csize);
    if (f.method === 0) return utf8.decode(data);
    if (f.method === 8) return utf8.decode(await inflateRaw(data));
    throw new Error('Неизвестный способ сжатия');
  };
  return { names: Object.keys(files), read };
}

const unesc = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const colIndex = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Возвращает строки первого листа как массивы строк.
export async function readSheet(buf) {
  const zip = await unzip(buf);
  const sst = [];
  const sstXml = await zip.read('xl/sharedStrings.xml');
  if (sstXml) {
    for (const m of sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      let text = '';
      for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
      sst.push(unesc(text));
    }
  }
  const sheetName = zip.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error('В файле нет листа с таблицей');
  const xml = await zip.read(sheetName);
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs);
      if (!ref) continue;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const inner = cm[2] || '';
      let val = '';
      if (type === 'inlineStr') val = unesc([...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v != null) val = type === 's' ? sst[Number(v)] ?? '' : unesc(v);
      }
      row[colIndex(ref[1])] = val;
    }
    rows.push(row);
  }
  return rows;
}
