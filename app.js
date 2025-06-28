// app.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

// Supabase
const supabaseUrl = 'https://pqwpieuxyudsvetytoac.supabase.co';
const supabaseKey = 'PUBLIC_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Caché y estados
let estudiantesCache = [];
let reportesFiltrados = [];
let estudianteEditando = null;

// Modal de asistencia
const modal = document.getElementById('attendanceModal');
const modalText = document.getElementById('modalText');
const modalClose = document.getElementById('modalClose');
modalClose.onclick = () => modal.classList.add('hidden');

function showModal(msg) {
  modalText.textContent = msg;
  modal.classList.remove('hidden');
}

// Registro manual
async function manualRegistro() {
  const ced = document.getElementById('manCedula').value.trim();
  const nom = document.getElementById('manNombre').value.trim();
  const area = document.getElementById('manArea').value.trim();
  const nivel = document.getElementById('manNivel').value.trim();
  if (!ced || !nom || !area || !nivel) { alert('Complete todos los campos.'); return; }
  await supabase.from('estudiantes').insert({ cedula: ced, nombre_completo: nom, area_academica: area, nivel });
  alert('Estudiante manual registrado.');
  await cargarListaEstudiantes();
  await cargarReportes();
}

document.getElementById('btnRegistroManual').onclick = manualRegistro;
\ // Carga desde CSV
async function cargarEstudiantesDesdeCSV(file) {
  if (!file) { alert('Seleccione un archivo CSV.'); return; }
  const text = await file.text();
  const results = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (results.errors.length) { alert('Error leyendo CSV: ' + results.errors[0].message); return; }
  const estudiantes = results.data.map(e => ({
    cedula: e.cedula.trim(),
    nombre_completo: e.nombre_completo.trim(),
    area_academica: e.area_academica.trim(),
    nivel: e.nivel.trim(),
  }));
  let errores = 0;
  for (const est of estudiantes) {
    const { error } = await supabase.from('estudiantes').upsert(est);
    if (error) errores++;
  }
  alert(errores ? `Cargados con ${errores} errores.` : `Cargados ${estudiantes.length} estudiantes.`);
  await cargarListaEstudiantes();
  await cargarReportes();
}

document.getElementById('btnCargarCSV').onclick = () => {
  const input = document.getElementById('csvInput');
  cargarEstudiantesDesdeCSV(input.files[0]);
};

// Listar estudiantes
async function cargarListaEstudiantes(filtro = '') {
  const { data, error } = await supabase
    .from('estudiantes')
    .select('*')
    .ilike('cedula', `%${filtro}%`)
    .order('nombre_completo');
  if (error) { alert('Error cargando estudiantes: ' + error.message); return; }
  estudiantesCache = data;
  renderListaEstudiantes();
}

function renderListaEstudiantes() {
  const tbody = document.getElementById('tblEstudiantes');
  tbody.innerHTML = '';
  estudiantesCache.forEach(est => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="chkEstudiante" data-cedula="${est.cedula}"></td>
      <td>${est.cedula}</td>
      <td>${est.nombre_completo}</td>
      <td>${est.area_academica}</td>
      <td>${est.nivel}</td>
      <td><button class="btnEditar" data-cedula="${est.cedula}">Editar</button></td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('chkTodos').checked = false;
  // Editar
  document.querySelectorAll('.btnEditar').forEach(btn => btn.onclick = () => {
    const ced = btn.dataset.cedula;
    estudianteEditando = estudiantesCache.find(e => e.cedula === ced);
    document.getElementById('editCedula').value = estudianteEditando.cedula;
    document.getElementById('editNombre').value = estudianteEditando.nombre_completo;
    document.getElementById('editArea').value = estudianteEditando.area_academica;
    document.getElementById('editNivel').value = estudianteEditando.nivel;
    document.getElementById('editForm').classList.remove('hidden');
  });
}

document.getElementById('chkTodos').onchange = function() {
  document.querySelectorAll('.chkEstudiante').forEach(chk => chk.checked = this.checked);
};

// Guardar edición\async function guardarEdicion() {
  const nombre = document.getElementById('editNombre').value.trim();
  const area = document.getElementById('editArea').value.trim();
  const nivel = document.getElementById('editNivel').value.trim();
  if (!nombre || !area || !nivel) { alert('Complete todos los campos.'); return; }
  await supabase.from('estudiantes').update({ nombre_completo: nombre, area_academica: area, nivel })
    .eq('cedula', estudianteEditando.cedula);
  alert('Estudiante actualizado.');
  estudianteEditando = null;
  document.getElementById('editForm').classList.add('hidden');
  await cargarListaEstudiantes(); await cargarReportes();
}
document.getElementById('btnGuardarEdicion').onclick = guardarEdicion;

// Cancelar edición
function cancelarEdicion() {
  estudianteEditando = null;
  document.getElementById('editForm').classList.add('hidden');
}
document.getElementById('btnCancelarEdicion').onclick = cancelarEdicion;

// Eliminar estudiante individual
async function eliminarEstudiante() {
  if (!confirm('¿Eliminar este estudiante?')) return;
  await supabase.from('asistencias').delete().eq('cedula', estudianteEditando.cedula);
  await supabase.from('estudiantes').delete().eq('cedula', estudianteEditando.cedula);
  alert('Estudiante eliminado.');
  estudianteEditando = null;
  document.getElementById('editForm').classList.add('hidden');
  await cargarListaEstudiantes(); await cargarReportes();
}
(document.getElementById('btnEliminarEstudiante')).onclick = eliminarEstudiante;

// Registrar asistencia por QR
async function registrarAsistencia(cedula) {
  const estudiante = estudiantesCache.find(e => e.cedula === cedula);
  if (!estudiante) { showModal('Estudiante no encontrado.'); return; }
  const hoy = new Date().toISOString().slice(0,10);
  const { data: existentes } = await supabase.from('asistencias')
    .select('*').eq('cedula', cedula).eq('fecha', hoy);
  if (existentes.length) { showModal(`Asistencia de ${estudiante.nombre_completo} ya registrada.`); return; }
  const hora = new Date().toLocaleTimeString();
  await supabase.from('asistencias').insert({ cedula, fecha: hoy, hora, area_academica: estudiante.area_academica, nivel: estudiante.nivel });
  showModal(`Asistencia registrada: ${estudiante.nombre_completo}`);
  await cargarReportes();
}

// Iniciar/detener lector QR
let html5QrCode;
async function iniciarLectorQR() {
  html5QrCode = new Html5Qrcode("reader");
  await html5QrCode.start({ facingMode: "environment" }, { fps:10, qrbox:{width:250,height:250} },
    msg => registrarAsistencia(msg.trim()), err=>{});
}
async function detenerLectorQR() {
  if (html5QrCode) await html5QrCode.stop();
}

// Cargar reportes
async function cargarReportes() {
  const { data: asistencias } = await supabase.from('asistencias').select('*');
  const mapA = {};
  asistencias.forEach(a => { mapA[a.cedula] = mapA[a.cedula] || new Set(); mapA[a.cedula].add(a.fecha); });
  const resumen = estudiantesCache.map(e => ({
    cedula: e.cedula,
    nombre_completo: e.nombre_completo,
    dias: mapA[e.cedula]? mapA[e.cedula].size:0,
    fechas: mapA[e.cedula]? Array.from(mapA[e.cedula]).join(', '):''
  }));
  reportesFiltrados = resumen;
  mostrarReportesResumido(resumen);
}

function mostrarReportesResumido(data) {
  const tbody = document.getElementById('tblReportes'); tbody.innerHTML = '';
  data.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.cedula}</td><td>${r.nombre_completo}</td><td>${r.dias}</td><td>${r.fechas}</td>`;
    tbody.appendChild(tr);
  });
}

// Filtrar reportes por días
function filtrarPorDias() {
  const dias = parseInt(document.getElementById('filtroDias').value);
  if (isNaN(dias)) { alert('Ingrese un número válido de días.'); return; }
  const filtrados = reportesFiltrados.filter(e => e.dias < dias);
  mostrarReportesResumido(filtrados);
}
(document.getElementById('btnFiltrarDias')).onclick = filtrarPorDias;

// Filtrar por cédula en reportes
function filtrarPorCedulaReporte() {
  const ced = document.getElementById('filtroCedulaReporte').value.trim();
  if (!ced) return cargarReportes();
  const filtrados = reportesFiltrados.filter(e => e.cedula.includes(ced));
  mostrarReportesResumido(filtrados);
}
(document.getElementById('btnFiltrarCedulaReporte')).onclick = filtrarPorCedulaReporte;

// Descargar Excel
function descargarExcel(data, nombre) {
  if (!data.length) { alert('No hay datos para exportar.'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, nombre);
}
(document.getElementById('btnDescargarTodos')).onclick = () => descargarExcel(reportesFiltrados, 'Reporte_Asistencia.xlsx');

// Generar PDF con QRs
async function generarQRPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'cm', format: [21,29.7] });
  let x=1, y=1;
  for (const est of estudiantesCache) {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, est.cedula, { width: 200 });
    const img = canvas.toDataURL('image/png');
    doc.addImage(img, 'PNG', x, y, 6, 6);
    doc.text(`${est.cedula}`, x, y+6.5);
    doc.text(est.nombre_completo, x, y+7.2);
    x += 7;
    if (x > 14) { x = 1; y += 8; if (y > 20) { doc.addPage(); y = 1; } }
  }
  doc.save('QRCodes_Estudiantes.pdf');
}
(document.getElementById('btnGenerarQRPdf')).onclick = generarQRPdf;

// Control de pestañas
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(id).classList.remove('hidden');
      if (id === 'asistencia') iniciarLectorQR(); else detenerLectorQR();
    };
  });
}

// Inicio
async function main() {
  setupTabs();
  await cargarListaEstudiantes();
  await cargarReportes();
}

window.onload = main;
