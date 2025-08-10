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

function normalizar(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

// Normalización básica para códigos (en mayúsculas, sin espacios extremos)
function clean(str) {
  return String(str || '').trim().toUpperCase();
}

/**
 * Genera un conjunto de claves equivalentes para matchear códigos:
 * - T#####  <-> ##### (sin la T)
 * - ceros a la izquierda removidos en la versión numérica
 * - variantes sin separadores (- _ . espacios)
 */
function codeKeys(raw) {
  const c = clean(raw);
  const keys = new Set([c]);

  const mTNum = /^T(\d+)$/.exec(c);
  if (mTNum) {
    const num = (mTNum[1] || '').replace(/^0+/, '') || '0';
    keys.add(num);           // 1100000
    keys.add('T' + num);     // T1100000
  } else {
    const mNum = /^(\d+)$/.exec(c);
    if (mNum) {
      const num = (mNum[1] || '').replace(/^0+/, '') || '0';
      keys.add(num);         // 1100000 normalizado
      keys.add('T' + num);   // T1100000
    }
  }

  const noSep = c.replace(/[\s\-_.]/g, '');
  if (noSep !== c) keys.add(noSep);

  return Array.from(keys);
}

function esCamionImportado(rubro) {
  const normal = normalizar(rubro);
  return normal === 'direccion' || normal === 'traccion';
}

function esAutoImportado(rubro) {
  const normal = normalizar(rubro);
  const rubrosExactos = [
    'touringh7',
    'royalcomfort',
    'royalmile',
    'royaleco',
    'transerenuseco'
  ];
  if (rubrosExactos.includes(normal)) return true;
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

    const buttonHTML = `
      <button 
        class="copy-btn" 
        title="Copiar código: ${item.codigo || ''}" 
        data-codigo="${item.codigo || ''}"
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
        (item.codigo && item.codigo.toLowerCase().includes(valor)) ||
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

    // Mapa de precios: almacenar TODAS las variantes de cada código de price
    const priceMap = new Map();
    (Array.isArray(dataPrices) ? dataPrices : []).forEach(p => {
      const precio = p?.precio ?? null;
      codeKeys(p?.codigo).forEach(k => {
        if (!priceMap.has(k)) priceMap.set(k, precio);
      });
    });

    // Merge: para cada item de stock, buscar precio por variantes del código
    allData = (Array.isArray(dataStock) ? dataStock : []).map(item => {
      const keys = codeKeys(item?.codigo);
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
