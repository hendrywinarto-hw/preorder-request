(() => {
  const form = document.querySelector('#preorder-form');
  const success = document.querySelector('#success-state');
  const photosInput = document.querySelector('#photos');
  const preview = document.querySelector('#photo-preview');
  const submitButton = document.querySelector('#submit-button');
  const connectionNote = document.querySelector('#connection-note');
  const config = window.PREORDER_CONFIG || {};
  let selectedFiles = [];

  const connected = Boolean(config.submitEndpoint || (config.supabaseUrl && config.supabaseAnonKey));
  if (connected) connectionNote.classList.add('connected');

  document.querySelector('#upload-button').addEventListener('click', () => photosInput.click());
  document.querySelectorAll('.stepper').forEach(btn => btn.addEventListener('click', () => {
    const input = document.querySelector('#totalItems');
    const next = Math.max(1, Math.min(999, Number(input.value || 1) + Number(btn.dataset.step)));
    input.value = next;
  }));

  photosInput.addEventListener('change', () => {
    const incoming = [...photosInput.files];
    const valid = incoming.filter(file => ['image/jpeg','image/png','image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024);
    selectedFiles = [...selectedFiles, ...valid].slice(0, 5);
    photosInput.value = '';
    setError('photos', incoming.length !== valid.length ? 'Use JPG, PNG or WebP images up to 5 MB each.' : '');
    renderPhotos();
  });

  function renderPhotos() {
    preview.innerHTML = '';
    selectedFiles.forEach((file, index) => {
      const tile = document.createElement('div'); tile.className = 'photo-tile';
      const img = document.createElement('img'); img.alt = `Selected item ${index + 1}`;
      const url = URL.createObjectURL(file); img.src = url; img.onload = () => URL.revokeObjectURL(url);
      const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label','Remove photo'); remove.textContent = '×';
      remove.onclick = () => { selectedFiles.splice(index, 1); renderPhotos(); };
      tile.append(img, remove); preview.append(tile);
    });
  }

  function setError(id, message) {
    const node = document.querySelector(`[data-error-for="${id}"]`); if (node) node.textContent = message;
    const input = document.querySelector(`#${id}`); if (input) input.classList.toggle('invalid', Boolean(message));
  }

  function validate() {
    let ok = true;
    const values = {
      name: document.querySelector('#name').value.trim(), phone: document.querySelector('#phone').value.trim(),
      email: document.querySelector('#email').value.trim(), address: document.querySelector('#address').value.trim(),
      totalItems: Number(document.querySelector('#totalItems').value), totalKg: document.querySelector('#totalKg').value
    };
    [['name', values.name ? '' : 'Please enter your name.'],['phone', values.phone.length >= 6 ? '' : 'Please enter a valid phone number.'],['address', values.address.length >= 5 ? '' : 'Please enter the destination address.'],['totalItems', values.totalItems >= 1 ? '' : 'Please enter at least 1 item.']].forEach(([id,msg]) => { setError(id,msg); if(msg) ok=false; });
    const emailOk = !values.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email); setError('email', emailOk ? '' : 'Please enter a valid email address.'); if(!emailOk) ok=false;
    const kgOk = !values.totalKg || Number(values.totalKg) > 0; setError('totalKg', kgOk ? '' : 'Weight must be greater than 0.'); if(!kgOk) ok=false;
    return { ok, values };
  }

  form.addEventListener('submit', async event => {
    event.preventDefault(); const result = validate(); if (!result.ok) { document.querySelector('.invalid')?.focus(); return; }
    if (!connected) { connectionNote.scrollIntoView({behavior:'smooth',block:'center'}); return; }
    submitButton.disabled = true; submitButton.textContent = 'Submitting…';
    try {
      // Backend integration point. The server/API will create the request reference and securely handle uploads.
      const body = new FormData(); Object.entries(result.values).forEach(([k,v]) => body.append(k, v)); selectedFiles.forEach(file => body.append('photos', file));
      if (!config.submitEndpoint) throw new Error('Backend endpoint is not configured yet.');
      const response = await fetch(config.submitEndpoint, { method:'POST', body });
      if (!response.ok) throw new Error('Unable to submit your request. Please try again.');
      const data = await response.json();
      document.querySelector('#reference-number').textContent = data.requestNumber || 'Received';
      form.hidden = true; success.hidden = false; window.scrollTo({top:0,behavior:'smooth'});
    } catch (error) { alert(error.message || 'Unable to submit your request. Please try again.'); }
    finally { submitButton.disabled = false; submitButton.textContent = 'Submit request'; }
  });

  document.querySelector('#new-request').addEventListener('click', () => {
    form.reset(); document.querySelector('#totalItems').value = 1; selectedFiles = []; renderPhotos();
    success.hidden = true; form.hidden = false; window.scrollTo({top:0,behavior:'smooth'});
  });
})();
