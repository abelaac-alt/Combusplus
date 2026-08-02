const API_BASE = 'https://api.precioil.es';

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  const isAllowed = origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Combusplus-Client',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'Content-Type':'application/json; charset=utf-8', ...headers}
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
    if (request.method !== 'GET') return json({error:'Método no permitido'}, 405, cors);
    if (url.pathname !== '/estaciones/radio') return json({error:'Ruta no disponible'}, 404, cors);
    if (!env.PRECIOIL_API_KEY) return json({error:'Falta configurar PRECIOIL_API_KEY'}, 500, cors);

    const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
    const originAllowed = origin && allowedOrigins.includes(origin);
    const clientToken = request.headers.get('X-Combusplus-Client') || '';
    const tokenAllowed = env.CLIENT_TOKEN && clientToken === env.CLIENT_TOKEN;
    if (!originAllowed && !tokenAllowed) return json({error:'Cliente no autorizado'}, 403, cors);

    const upstream = new URL(`${API_BASE}/estaciones/radio`);
    for (const [key, value] of url.searchParams) upstream.searchParams.set(key, value);

    const response = await fetch(upstream, {
      headers: {'X-API-Key': env.PRECIOIL_API_KEY, 'Accept':'application/json'}
    });
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        ...cors,
        'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=120'
      }
    });
  }
};
