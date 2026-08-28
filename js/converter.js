/* ==========================================================================
   이미지 변환기 — 업로드 / 드래그앤드롭 / canvas 변환 / 일괄 처리 / 다운로드
   파일은 서버로 전송되지 않으며, 모든 변환은 브라우저 내에서 처리된다.

   페이지별 출력 포맷·허용 입력 형식은 이 스크립트를 불러오기 전에
   window.CONVERTER_CONFIG 로 지정한다 (지정하지 않으면 기본값: 다양한 포맷 → PNG).
   ========================================================================== */

(function () {
  const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB 초과 시 경고

  const DEFAULT_CONFIG = {
    label: 'PNG',                 // 카드 배지 / 안내 문구에 쓰이는 출력 포맷 이름
    outputFormat: 'image/png',    // canvas.toBlob / heic2any 에 넘길 MIME 타입
    outputExt: '.png',            // 다운로드 파일 확장자
    outputQuality: undefined,     // 손실 포맷(JPG 등)의 품질 (0~1)
    fillBackground: null,         // 알파 채널을 지원하지 않는 포맷으로 변환 시 채울 배경색
    accept: ['image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/png'],
    acceptExt: /\.(jpe?g|webp|gif|bmp|png)$/i,
    acceptLabel: '이미지',
    decodeWith: null,             // 'heic2any' | null — canvas로 직접 그릴 수 없는 포맷의 디코더
  };

  const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.CONVERTER_CONFIG || {});

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const cardGrid = document.getElementById('card-grid');
  const toolbar = document.getElementById('toolbar');
  const toolbarCount = document.getElementById('toolbar-count');
  const downloadAllBtn = document.getElementById('download-all');
  const clearAllBtn = document.getElementById('clear-all');

  if (!dropzone || !fileInput || !cardGrid) return; // 변환기가 없는 페이지(예: 개인정보처리방침)

  /** @type {Map<string, {name:string, originalSize:number, blob:Blob|null, url:string|null, status:'processing'|'done'|'error'}>} */
  const items = new Map();
  let seq = 0;

  // ---------- 드롭존 이벤트 ----------
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) handleFiles(files);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length) handleFiles(fileInput.files);
    fileInput.value = ''; // 같은 파일 재업로드 허용
  });

  // ---------- 파일 처리 ----------
  function handleFiles(fileList) {
    Array.from(fileList).forEach((file) => {
      if (isAccepted(file)) addCard(file);
      else addRejectedCard(file);
    });
    updateToolbar();
  }

  function isAccepted(file) {
    return CONFIG.accept.includes(file.type) || CONFIG.acceptExt.test(file.name);
  }

  function addCard(file) {
    const id = 'f' + (++seq);
    items.set(id, { name: file.name, originalSize: file.size, blob: null, url: null, status: 'processing' });

    const card = buildCardShell(id, file);
    cardGrid.appendChild(card);

    card.querySelector('[data-action="remove"]').addEventListener('click', () => removeCard(id));
    card.querySelector('[data-action="download"]').addEventListener('click', () => triggerDownload(id));

    convertItem(file)
      .then((result) => {
        const entry = items.get(id);
        if (!entry) return;
        entry.blob = result.blob;
        entry.url = result.url;
        entry.status = 'done';
        renderDone(card, file, result);
        updateToolbar();
      })
      .catch((err) => {
        const entry = items.get(id);
        if (!entry) return;
        entry.status = 'error';
        renderError(card, file, err);
        updateToolbar();
      });
  }

  function addRejectedCard(file) {
    const id = 'f' + (++seq);
    items.set(id, { name: file.name, originalSize: file.size, blob: null, url: null, status: 'error' });

    const card = buildCardShell(id, file);
    cardGrid.appendChild(card);
    card.querySelector('[data-action="remove"]').addEventListener('click', () => removeCard(id));

    renderError(card, file, new Error('unsupported-on-this-page'), `이 페이지는 ${CONFIG.acceptLabel} 파일만 변환합니다.`);
  }

  function buildCardShell(id, file) {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.id = id;
    card.innerHTML = `
      <div class="file-card-preview">
        <span class="file-card-badge">${CONFIG.label}</span>
        <div style="display:flex;align-items:center;justify-content:center;height:100%;">
          <div class="spinner"></div>
        </div>
      </div>
      <div class="file-card-body">
        <div class="file-card-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        <div class="file-card-meta">${formatSize(file.size)} → 변환 중…</div>
        ${isGif(file) ? noteMarkup('GIF 첫 프레임만 변환돼요') : ''}
        ${file.size > MAX_SIZE_BYTES ? warningMarkup() : ''}
        <div class="file-card-actions">
          <button class="btn btn-sm" disabled data-action="download">다운로드</button>
          <button class="btn btn-secondary btn-sm icon-btn" data-action="remove" aria-label="삭제">${iconTrash()}</button>
        </div>
      </div>
    `;
    return card;
  }

  function renderDone(card, file, result) {
    const preview = card.querySelector('.file-card-preview');
    preview.innerHTML = `<span class="file-card-badge">${CONFIG.label}</span><img src="${result.url}" alt="${escapeHtml(file.name)} 변환 미리보기">`;

    const meta = card.querySelector('.file-card-meta');
    meta.textContent = `${formatSize(file.size)} → ${formatSize(result.blob.size)}`;

    const downloadBtn = card.querySelector('[data-action="download"]');
    downloadBtn.disabled = false;
  }

  function renderError(card, file, err, message) {
    const preview = card.querySelector('.file-card-preview');
    preview.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--danger);">${iconAlert()}</div>`;
    const meta = card.querySelector('.file-card-meta');
    meta.innerHTML = '';
    const body = card.querySelector('.file-card-body');
    const errEl = document.createElement('div');
    errEl.className = 'file-card-error';
    errEl.textContent = message || '변환 실패: 지원하지 않는 이미지 형식이거나 손상된 파일입니다.';
    body.insertBefore(errEl, body.querySelector('.file-card-actions'));
    const downloadBtn = card.querySelector('[data-action="download"]');
    if (downloadBtn) downloadBtn.remove();
  }

  function removeCard(id) {
    const entry = items.get(id);
    if (entry && entry.url) URL.revokeObjectURL(entry.url);
    items.delete(id);
    const card = document.getElementById(id);
    if (card) card.remove();
    updateToolbar();
  }

  function triggerDownload(id) {
    const entry = items.get(id);
    if (!entry || !entry.url) return;
    const a = document.createElement('a');
    a.href = entry.url;
    a.download = toOutputFilename(entry.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function updateToolbar() {
    const count = items.size;
    const doneCount = Array.from(items.values()).filter((i) => i.status === 'done').length;
    toolbar.style.display = count ? 'flex' : 'none';
    toolbarCount.textContent = `${count}개 파일 · 변환 완료 ${doneCount}개`;
    downloadAllBtn.disabled = doneCount === 0;
  }

  downloadAllBtn && downloadAllBtn.addEventListener('click', () => {
    const ids = Array.from(items.entries()).filter(([, v]) => v.status === 'done').map(([k]) => k);
    ids.forEach((id, i) => setTimeout(() => triggerDownload(id), i * 300));
  });

  clearAllBtn && clearAllBtn.addEventListener('click', () => {
    Array.from(items.keys()).forEach(removeCard);
  });

  // ---------- 변환 ----------
  function convertItem(file) {
    return CONFIG.decodeWith === 'heic2any' ? convertViaHeic2any(file) : convertViaCanvas(file);
  }

  function convertViaCanvas(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (CONFIG.fillBackground) {
            ctx.fillStyle = CONFIG.fillBackground;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) { reject(new Error('canvas-to-blob-failed')); return; }
            resolve({ blob, url: URL.createObjectURL(blob) });
          }, CONFIG.outputFormat, CONFIG.outputQuality);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('image-load-failed'));
      };
      img.src = objectUrl;
    });
  }

  function convertViaHeic2any(file) {
    return new Promise((resolve, reject) => {
      if (typeof window.heic2any !== 'function') {
        reject(new Error('heic2any-not-loaded'));
        return;
      }
      window.heic2any({ blob: file, toType: CONFIG.outputFormat, quality: CONFIG.outputQuality })
        .then((result) => {
          const blob = Array.isArray(result) ? result[0] : result;
          resolve({ blob, url: URL.createObjectURL(blob) });
        })
        .catch(reject);
    });
  }

  // ---------- 유틸 ----------
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function toOutputFilename(name) {
    return name.replace(/\.[^.]+$/, '') + CONFIG.outputExt;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function warningMarkup() {
    return `<div class="file-card-warning">${iconAlert()} 20MB 이상 — 변환에 시간이 걸릴 수 있어요</div>`;
  }

  function noteMarkup(text) {
    return `<div class="file-card-note">${iconInfo()} ${text}</div>`;
  }

  function isGif(file) {
    return file.type === 'image/gif' || /\.gif$/i.test(file.name);
  }

  function iconInfo() {
    return `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
  }

  function iconTrash() {
    return `<svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;
  }

  function iconAlert() {
    return `<svg class="icon" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  }
})();
