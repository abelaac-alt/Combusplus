const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderList(values) {
  return (values || [])
    .map((item) => `<div>${escapeHtml(item[0])}: <strong>${Number(item[1]) || 0}</strong></div>`)
    .join('');
}

async function loadPanel() {
  const button = $('#load');
  const message = $('#msg');
  const token = $('#token').value.trim();
  const config = window.COMBUSPLUS_CONFIG || {};
  const base = String(config.supabaseFunctionsUrl || '').replace(/\/$/, '');

  if (!token) {
    message.textContent = 'Introduce el token de administrador.';
    return;
  }
  if (!base) {
    message.textContent = 'La URL del backend no está configurada en config.js.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Cargando…';
  message.textContent = 'Conectando con el backend…';

  try {
    const headers = {
      accept: 'application/json',
      'x-combusplus-admin': token
    };

    if (config.supabasePublishableKey) {
      headers.apikey = config.supabasePublishableKey;
      headers.authorization = `Bearer ${config.supabasePublishableKey}`;
    }

    const response = await fetch(`${base}/admin-analytics`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`Respuesta no válida del servidor (${response.status}).`);
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Error del servidor (${response.status}).`);
    }

    $('#content').hidden = false;
    message.textContent = `Actualizado: ${new Date(data.generatedAt).toLocaleString()}`;

    const totals = data.totals || {};
    $('#metrics').innerHTML = [
      ['Instalaciones con analítica', totals.installations || 0],
      ['Conectados ahora', totals.activeNow || 0],
      ['Eventos 24 h', totals.events24h || 0],
      ['Eventos 30 días', totals.events30d || 0]
    ].map(([label, value]) =>
      `<div class="card metric"><small>${escapeHtml(label)}</small><strong>${Number(value) || 0}</strong></div>`
    ).join('');

    $('#platforms').innerHTML = renderList(data.byPlatform);
    $('#devices').innerHTML = renderList(data.byDevice);
    $('#cities').innerHTML = renderList(data.byCity);

    $('#rows').innerHTML = (data.installations || []).map((item) => `
      <tr>
        <td>${escapeHtml(item.installation)}</td>
        <td>${escapeHtml(item.platform)}</td>
        <td>${escapeHtml(item.device)}</td>
        <td>${escapeHtml(item.version)}</td>
        <td>${escapeHtml(item.city)}</td>
        <td>${item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString() : ''}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error(error);
    message.textContent = error instanceof Error ? error.message : 'No se pudo cargar el panel.';
  } finally {
    button.disabled = false;
    button.textContent = 'Cargar panel';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  $('#load')?.addEventListener('click', loadPanel);
  $('#token')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadPanel();
  });
});
