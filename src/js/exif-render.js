import exifr from '../../vendor/exifr.esm.js';
import { state } from './state.js';

// ── Render EXIF ───────────────────────────────────────────────────────────
export function renderExif(rows) {
  const section = document.getElementById('exifSection');
  const content = document.getElementById('exifContent');
  const rowsEl  = document.getElementById('exifRows');
  const chevron = document.getElementById('exifChevron');

  if (!rows.length) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  rowsEl.innerHTML = '';
  for (const [label, val] of rows) {
    const row = document.createElement('div');
    row.className = 'flex justify-between py-1.5 text-sm';
    const isGPS = label === 'GPS';
    const valueHTML = isGPS
      ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(val)}" target="_blank" rel="noopener noreferrer" class="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 text-right break-all underline underline-offset-2">${val}</a>`
      : `<span class="text-gray-800 dark:text-gray-200 text-right break-all">${val}</span>`;
    row.innerHTML = `
      <span class="text-gray-400 dark:text-gray-500 font-medium shrink-0 pr-4">${label}</span>
      ${valueHTML}
    `;
    rowsEl.appendChild(row);
  }

  // Reset collapsed state on new file
  content.classList.add('hidden');
  chevron.classList.remove('open');
}


document.getElementById('exifToggle').addEventListener('click', () => {
  const content = document.getElementById('exifContent');
  const chevron = document.getElementById('exifChevron');
  const hidden = content.classList.toggle('hidden');
  chevron.classList.toggle('open', !hidden);
});

document.getElementById('iptcToggle').addEventListener('click', () => {
  const content = document.getElementById('iptcContent');
  const chevron = document.getElementById('iptcChevron');
  chevron.classList.toggle('open', content.classList.toggle('hidden') === false);
});

document.getElementById('iccToggle').addEventListener('click', () => {
  const content = document.getElementById('iccContent');
  const chevron = document.getElementById('iccChevron');
  chevron.classList.toggle('open', content.classList.toggle('hidden') === false);
});

// ── exifr enrichment (runs async after initial render) ────────────────────
export function runExifrEnrichment(file) {
  const opts = { iptc: true, icc: true, exif: true, tiff: true, jfif: true, xmp: false };
  exifr.parse(file, opts).then(data => { if (data) enrichWithExifr(data); }).catch(() => {});
}

function enrichWithExifr(data) {
  // Helper: try multiple key variants, return first non-null
  const g = (...keys) => { for (const k of keys) { const v = data[k]; if (v != null && v !== '') return v; } return null; };

  // Supplement EXIF with fields the custom parser doesn't extract
  const extraExifFields = [
    ['JFIFVersion',       'JFIF Version'],
    ['EncodingProcess',   'Encoding'],
    ['YCbCrSubSampling',  'YCbCr Subsampling'],
    ['LensMake',          'Lens Make'],
    ['LensModel',         'Lens Model'],
    ['LensInfo',          'Lens Info'],
    ['BodySerialNumber',  'Camera Serial'],
    ['LensSerialNumber',  'Lens Serial'],
    ['SubSecTimeOriginal','Sub-Sec Time'],
  ];
  const existingLabels = new Set(state.currentExifRows.map(r => r[0]));
  const extraRows = [];
  for (const [key, label] of extraExifFields) {
    if (data[key] != null && !existingLabels.has(label)) {
      extraRows.push([label, String(data[key])]);
    }
  }
  if (extraRows.length) {
    const exifSection = document.getElementById('exifSection');
    const rowsEl = document.getElementById('exifRows');
    exifSection.classList.remove('hidden');
    for (const [label, val] of extraRows) {
      const row = document.createElement('div');
      row.className = 'flex justify-between py-1.5 text-sm';
      const lSpan = document.createElement('span');
      lSpan.className = 'text-gray-400 dark:text-gray-500 font-medium shrink-0 pr-4';
      lSpan.textContent = label;
      const vSpan = document.createElement('span');
      vSpan.className = 'text-gray-800 dark:text-gray-200 text-right break-all';
      vSpan.textContent = val;
      row.appendChild(lSpan);
      row.appendChild(vSpan);
      rowsEl.appendChild(row);
    }
    state.currentExifRows = [...state.currentExifRows, ...extraRows];
  }

  // IPTC section
  const iptcRows = [];
  const caption = g('Caption', 'caption', 'CaptionAbstract');
  if (caption) iptcRows.push(['Caption', String(caption)]);
  const kw = g('keywords', 'Keywords');
  if (kw) iptcRows.push(['Keywords', Array.isArray(kw) ? kw.join(', ') : String(kw)]);
  const headline = g('headline', 'Headline');
  if (headline) iptcRows.push(['Headline', String(headline)]);
  const dc = g('datecreated', 'DateCreated');
  if (dc) iptcRows.push(['Date Created', dc instanceof Date ? dc.toLocaleDateString() : String(dc)]);
  const tc = g('timecreated', 'TimeCreated');
  if (tc) iptcRows.push(['Time Created', String(tc)]);
  const creator = g('byline', 'Byline', 'Creator', 'creator');
  if (creator) iptcRows.push(['Creator', String(creator)]);
  const creatorTitle = g('bylinetitle', 'BylineTitle');
  if (creatorTitle) iptcRows.push(['Creator Title', String(creatorTitle)]);
  const credit = g('credit', 'Credit');
  if (credit) iptcRows.push(['Credit', String(credit)]);
  const src = g('source', 'Source');
  if (src) iptcRows.push(['Source', String(src)]);
  const copyright = g('copyrightnotice', 'CopyrightNotice');
  if (copyright) iptcRows.push(['Copyright', String(copyright)]);
  const city = g('city', 'City');
  if (city) iptcRows.push(['City', String(city)]);
  const country = g('country', 'Country', 'CountryPrimaryLocationName');
  if (country) iptcRows.push(['Country', String(country)]);
  renderMetaSection('iptcSection', 'iptcContent', 'iptcRows', iptcRows);

  // ICC Profile section
  const iccRows = [];
  const profileDesc = g('ProfileDescription', 'profiledescription');
  if (profileDesc) iccRows.push(['Color Profile', String(profileDesc)]);
  const colorSpaceData = g('ColorSpaceData', 'colorspacedata');
  if (colorSpaceData) iccRows.push(['Color Space', String(colorSpaceData).trim()]);
  const profileClass = g('ProfileClass', 'profileclass');
  if (profileClass) iccRows.push(['Profile Class', String(profileClass)]);
  const manufacturer = g('DeviceManufacturer', 'ProfileCreator', 'profilecreator');
  if (manufacturer) iccRows.push(['Manufacturer', String(manufacturer)]);
  const profileCopyright = g('ProfileCopyright', 'profilecopyright');
  if (profileCopyright) iccRows.push(['Profile Copyright', String(profileCopyright)]);
  renderMetaSection('iccSection', 'iccContent', 'iccRows', iccRows);
}

function renderMetaSection(sectionId, contentId, rowsId, rows) {
  const section = document.getElementById(sectionId);
  if (!rows.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  const rowsEl = document.getElementById(rowsId);
  rowsEl.innerHTML = '';
  for (const [label, val] of rows) {
    const row = document.createElement('div');
    row.className = 'flex justify-between py-1.5 text-sm';
    const lSpan = document.createElement('span');
    lSpan.className = 'text-gray-400 dark:text-gray-500 font-medium shrink-0 pr-4';
    lSpan.textContent = label;
    const vSpan = document.createElement('span');
    vSpan.className = 'text-gray-800 dark:text-gray-200 text-right break-all';
    vSpan.textContent = val;
    row.appendChild(lSpan);
    row.appendChild(vSpan);
    rowsEl.appendChild(row);
  }
  // Start collapsed
  document.getElementById(contentId).classList.add('hidden');
}
