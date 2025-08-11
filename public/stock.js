// stock.js

const ENDPOINTS = {
  olavarria:
    'https://corsproxy.io/?https://api-stock-live.vercel.app/api/stock_olav',
  cordoba:
    'https://corsproxy.io/?https://api-stock-live.vercel.app/api/stock_cba',
  polo:
    'https://corsproxy.io/?https://api-stock-live.vercel.app/api/stock_polo'
};

// Endpoint de precios (via proxy CORS)
const PRICES_URL =
  'https://corsproxy.io/?https://api-prices-nu.vercel.app/api/prices';

const tableBody = document.querySelector('#stock-table tbody');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const buscador = document.getElementById('buscador');
const filtroCamion = document.getElementById('filtro-camion');
const filtroAuto = document.getElementById('filtro-auto');
const filtroTodos = document.getElementById('filtro-todos');
const stockSelect = document.getElementById('stock-select');
const filtroBtns = [filtroCamion, filtroAuto, filtroTodos];

let allData = [];
let stockActual = 'olavarria';

// -------------------- Utilidades --------------------

// Normaliza texto para búsquedas por rubro/descripción
function normalizar(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

// Limpia código (espacios y mayúsculas)
function clean(str) {
  return String(str || '').trim().toUpperCase();
}

// Divide un campo de código tipo "A/B/C" en candidatos ["A","B","C"]
// Soporta separadores "/" y " / " (y múltiples espacios).
function splitCandidates(raw) {
  if (!raw) return [];
  return String(raw)
    .split('/')        // separar por slash
    .map(s => clean(s))
    .filter(Boolean);  // quitar vacíos
}

// Toma el primer código si viene "X/Y/Z"
function primaryCode(raw) {
  const parts = splitCandidates(raw);
  return parts[0] || '';
}

/**
 * Genera claves equivalentes para matchear un único código:
 * - Letra + dígitos (p.ej. X1100050, F42) -> agregar variante solo-dígitos (1100050 / 42).
 * - Caso especial T + dígitos (T1100000) -> agregar sin T (1100000) y viceversa.
 * - Solo dígitos -> agregar T + dígitos también (para cubrir T####).
 * - Quita separadores ( - _ . espacios ) como variante adicional.
 * - Remueve ceros a la izquierda en la variante numérica.
 */
function codeKeysOne(raw) {
  const c = clean(raw);
  const keys = new Set([c]);

  // Variante sin separadores internos
  const noSep = c.replace(/[\s\-_.]/g, '');
  if (noSep !== c) keys.add(noSep);

  // T + dígitos
  let m = /^T(\d+)$/.exec(c);
  if (m) {
    const num = (m[1] || '').replace(/^0+/, '') || '0';
    keys.add(num);
    keys.add('T' + num);
    return Array.from(keys);
  }

  // Cualquier letra + dígitos (X123, F48, etc.)
  m = /^([A-Z])(\d+)$/.exec(c);
  if (m) {
    const num = (m[2] || '').replace(/^0+/, '') || '0';
    keys.add(num);  // 123 / 48
  } else {
    // Solo dígitos
    m = /^(\d+)$/.exec(c);
    if (m) {
      const num = (m[1] || '').replace(/^0+/, '') || '0';
      keys.add(num);        // normalizado
      keys.add('T' + num);  // T#### para cubrir variantes T
    }
  }

  return Array.from(keys);
}

/**
 * Para un campo de stock que puede venir "F42 / F68", genera
 * una lista de claves en ORDEN DE PRIORIDAD:
 * - Primero las variantes de F42
 * - Si no hay match, probar variantes de F68
 * - etc.
 */
function codeKeys(raw) {
  const parts = splitCandidates(raw); // ["F42","F68"]
  const out = [];
  const seen = new Set();
  for (const p of parts) {
    for (const k of codeKeysOne(p)) {
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  return out;
}

function esCamionImportado(rubro) {
  const normal = normalizar(rubro);
  return normal === 'direccion' || normal === 'traccion';
}

function esAutoImportado(rubro) {
  const normal = normalizar(rubro);
  const exactos = ['touringh7', 'royalcomfort', 'royalmile', 'royaleco', 'transerenuseco'];
  if (exactos.includes(normal)) return true;
  return normal.startsWith('royal') || normal.startsWith('trans');
}

function formatPrecio(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '';
  return '$ ' + Number(n).toLocaleString('es-AR');
}

// -------------------- Render --------------------

function renderTable(data) {
  tableBody.innerHTML = '';
  if (data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Sin resultados</td></tr>`;
    return;
  }

  data.forEach(item => {
    const tr = document.createElement('tr');

    // Mostrar/copiar SIEMPRE el primer código
    const codigoDisplay = primaryCode(item.codigo);

    const buttonHTML = `
      <button 
        class="copy-btn" 
        title="Copiar código: ${codigoDisplay}" 
        data-codigo="${codigoDisplay}"
        style="background:none;border:none;cursor:pointer;padding:0;">
        <img width="18px" src="./media/content-copy.svg" alt="Copiar">
      </button>
    `;

    tr.innerHTML = `
      <td>${buttonHTML} ${item.descripcion || ''}</td>
      <td>${item.rubro || ''}</td>
      <td>${item.stock || ''}</td>
      <td>${formatPrecio(item.precio)}</td>
    `;

    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const codigo = btn.getAttribute('data-codigo');
      navigator.clipboard
        .writeText(codigo)
        .then(() => console.log(`Código ${codigo} copiado al portapapeles`))
        .catch(err => console.error('Error al copiar:', err));
    });
  });
}

// -------------------- Filtros --------------------

function setActiveBtn(btn) {
  filtroBtns.forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function aplicarFiltros() {
  let datos = [...allData];
  if (window.filtroActivo === 'camion') {
    datos = datos.filter(item => esCamionImportado(item.rubro));
  } else if (window.filtroActivo === 'auto') {
    datos = datos.filter(item => esAutoImportado(item.rubro));
  }

  const valor = buscador.value.trim().toLowerCase();
  if (valor) {
    datos = datos.filter(
      item =>
        (item.codigo && String(item.codigo).toLowerCase().includes(valor)) ||
        (item.descripcion && item.descripcion.toLowerCase().includes(valor))
    );
  }

  renderTable(datos);
}

// -------------------- Carga y Merge --------------------

async function cargarDatos(stock) {
  loading.style.display = '';
  error.textContent = '';
  buscador.value = '';
  window.filtroActivo = null;
  setActiveBtn(null);

  try {
    const [respStock, respPrices] = await Promise.all([
      fetch(ENDPOINTS[stock]),
      fetch(PRICES_URL)
    ]);

    const dataStock = await respStock.json();
    const dataPrices = await respPrices.json();

    // Mapa de precios: guardar TODAS las variantes para cada código de price
    const priceMap = new Map();
    (Array.isArray(dataPrices) ? dataPrices : []).forEach(p => {
      const precio = p?.precio ?? null;
      // indexar por variantes del código de la tabla de precios
      codeKeysOne(p?.codigo).forEach(k => {
        if (!priceMap.has(k)) priceMap.set(k, precio);
      });
    });

    // Merge: para cada item de stock, probar candidatos en orden (F42, luego F68, etc.)
    allData = (Array.isArray(dataStock) ? dataStock : []).map(item => {
      const keys = codeKeys(item?.codigo); // ordenadas por prioridad
      let precio = null;
      for (const k of keys) {
        if (priceMap.has(k)) {
          precio = priceMap.get(k);
          break;
        }
      }
      return { ...item, precio };
    });

    loading.style.display = 'none';
    renderTable(allData);
  } catch (err) {
    console.error('Error al cargar datos:', err);
    loading.style.display = 'none';
    error.textContent = 'Error al cargar datos';
  }
}

// -------------------- Listeners --------------------

buscador.addEventListener('input', aplicarFiltros);

filtroCamion.addEventListener('click', () => {
  window.filtroActivo = 'camion';
  setActiveBtn(filtroCamion);
  aplicarFiltros();
});

filtroAuto.addEventListener('click', () => {
  window.filtroActivo = 'auto';
  setActiveBtn(filtroAuto);
  aplicarFiltros();
});

filtroTodos.addEventListener('click', () => {
  window.filtroActivo = null;
  setActiveBtn(filtroTodos);
  aplicarFiltros();
});

stockSelect.addEventListener('change', e => {
  stockActual = e.target.value;
  cargarDatos(stockActual);
});

// Inicial
window.addEventListener('DOMContentLoaded', () => {
  setActiveBtn(filtroTodos);
  cargarDatos(stockActual);
});
