const ENDPOINTS = {
  olavarria:
    'https://corsproxy.io/?https://api-stock-live.vercel.app/api/stock_olav',
  cordoba:
    'https://corsproxy.io/?https://api-stock-live.vercel.app/api/stock_cba',
    polo:
    'https://corsproxy.io/?https://api-stock-live.vercel.app/api/stock_polo'
}

const tableBody = document.querySelector('#stock-table tbody')
const loading = document.getElementById('loading')
const error = document.getElementById('error')
const buscador = document.getElementById('buscador')
const filtroCamion = document.getElementById('filtro-camion')
const filtroAuto = document.getElementById('filtro-auto')
const filtroTodos = document.getElementById('filtro-todos')
const stockSelect = document.getElementById('stock-select')
const filtroBtns = [filtroCamion, filtroAuto, filtroTodos]

let allData = []
let stockActual = 'olavarria'

function normalizar (str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
}

function esCamionImportado (rubro) {
  const normal = normalizar(rubro)
  return normal === 'direccion' || normal === 'traccion'
}
function esAutoImportado (rubro) {
  const normal = normalizar(rubro)
  const rubrosExactos = [
    'touringh7',
    'royalcomfort',
    'royalmile',
    'royaleco',
    'transerenuseco'
  ]
  if (rubrosExactos.includes(normal)) return true
  return normal.startsWith('royal') || normal.startsWith('trans')
}

function renderTable (data) {
  tableBody.innerHTML = ''
  if (data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Sin resultados</td></tr>`
    return
  }

  data.forEach(item => {
    const tr = document.createElement('tr')

    // Creamos el botón con imagen
    const buttonHTML = `
      <button 
        class="copy-btn" 
        title="Copiar código: ${item.codigo}" 
        data-codigo="${item.codigo}"
        style="background:none;border:none;cursor:pointer;padding:0;">
        <img width="18px" src="./media/content-copy.svg" alt="Copiar">
      </button>
    `

    tr.innerHTML = `
      <td>${buttonHTML} ${item.descripcion || ''}</td>
      <td>${item.rubro || ''}</td>
      <td>${item.stock || ''}</td>
    `

    tableBody.appendChild(tr)
  })

  // Asignamos eventos a todos los botones creados
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const codigo = btn.getAttribute('data-codigo')
      navigator.clipboard
        .writeText(codigo)
        .then(() => {
          console.log(`Código ${codigo} copiado al portapapeles`)
        })
        .catch(err => {
          console.error('Error al copiar:', err)
        })
    })
  })
}

// Resalta botón de filtro activo
function setActiveBtn (btn) {
  filtroBtns.forEach(b => b.classList.remove('active'))
  if (btn) btn.classList.add('active')
}

function aplicarFiltros () {
  let datos = [...allData]
  if (window.filtroActivo === 'camion') {
    datos = datos.filter(item => esCamionImportado(item.rubro))
  } else if (window.filtroActivo === 'auto') {
    datos = datos.filter(item => esAutoImportado(item.rubro))
  }
  const valor = buscador.value.trim().toLowerCase()
  if (valor) {
    datos = datos.filter(
      item =>
        (item.codigo && item.codigo.toLowerCase().includes(valor)) ||
        (item.descripcion && item.descripcion.toLowerCase().includes(valor))
    )
  }
  renderTable(datos)
}

// Carga datos según stock
function cargarDatos (stock) {
  loading.style.display = ''
  error.textContent = ''
  buscador.value = ''
  window.filtroActivo = null
  setActiveBtn(null)
  fetch(ENDPOINTS[stock])
    .then(response => response.json())
    .then(data => {
      loading.style.display = 'none'
      allData = data
      renderTable(allData)
    })
    .catch(err => {
      loading.style.display = 'none'
      error.textContent = 'Error al cargar datos'
    })
}

// Listeners de filtros
buscador.addEventListener('input', aplicarFiltros)

filtroCamion.addEventListener('click', () => {
  window.filtroActivo = 'camion'
  setActiveBtn(filtroCamion)
  aplicarFiltros()
})
filtroAuto.addEventListener('click', () => {
  window.filtroActivo = 'auto'
  setActiveBtn(filtroAuto)
  aplicarFiltros()
})
filtroTodos.addEventListener('click', () => {
  window.filtroActivo = null
  setActiveBtn(filtroTodos)
  aplicarFiltros()
})

// Listener del filtro de stock (Olavarría/Córdoba)
stockSelect.addEventListener('change', e => {
  stockActual = e.target.value
  cargarDatos(stockActual)
})

// Al cargar la página, cargar Olavarría por defecto
window.addEventListener('DOMContentLoaded', () => {
  setActiveBtn(filtroTodos)
  cargarDatos(stockActual)
})
