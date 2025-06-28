// app.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode/+esm';
import { jsPDF } from 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

const supabaseUrl = 'https://pqwpieuxyudsvetytoac.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxd3BpZXV4eXVkc3ZldHl0b2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwNTQ5MjksImV4cCI6MjA2NjYzMDkyOX0.FZOSbJTSiedP1yrwgXn_GLLeELxfzQ13fnIss7aDaJ4';
const supabase = createClient(supabaseUrl, supabaseKey);

let qrScanner = null;
let estudianteEditando = null;

function iniciarLectorQR() {
  if (qrScanner) return;
  qrScanner = new Html5Qrcode("reader");
  qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScan);
}

function detenerLectorQR() {
  if (qrScanner) {
    qrScanner.stop().then(() => qrScanner.clear());
    qrScanner = null;
  }
}

async function onScan(code) {
  const cedula = code.trim();
  const { data: estudiante } = await supabase.from('estudiantes').select('*').eq('cedula', cedula).single();
  if (!estudiante) return alert('Estudiante no registrado');

  const hoy = new Date().toISOString().split('T')[0];
  const { data: yaAsistio } = await supabase.from('asistencias').select('*').eq('cedula', cedula).eq('fecha', hoy);
  if (yaAsistio.length > 0) return alert(`Ya se registró asistencia para hoy`);

  await supabase.from('asistencias').insert({
    cedula,
    fecha: hoy,
    hora: new Date().toLocaleTimeString(),
    area_academica: estudiante.area_academica,
    nivel: estudiante.nivel
  });

  alert(`Asistencia registrada`);
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(tab.getAttribute('data-tab')).classList.remove('hidden');

      if (tab.dataset.tab === 'asistencia') iniciarLectorQR();
      else detenerLectorQR();
    });
  });
}

async function cargarEstudiantesDesdeCSV(file) {
  const text = await file.text();
  const filas = text.trim().split('\n');
  const inserts = filas.slice(1).map(fila => {
    const [cedula, nombre, area, nivel] = fila.split(',');
    return { cedula: cedula.trim(), nombre_completo: nombre.trim(), area_academica: area.trim(), nivel: nivel.trim() };
  });
  await supabase.from('estudiantes').upsert(inserts);
  alert('Estudiantes cargados');
  cargarListaEstudiantes();
}

async function cargarListaEstudiantes(filtro = '') {
  const { data } = await supabase.from('estudiantes').select('*');
  const tbody = document.getElementById('tblEstudiantes');
  tbody.innerHTML = '';
  data.filter(e => e.cedula.includes(filtro)).forEach(est => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${est.cedula}</td>
      <td>${est.nombre_completo}</td>
      <td>${est.area_academica}</td>
      <td>${est.nivel}</td>
      <td><button class="btnEditar" data-cedula="${est.cedula}">Editar</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.btnEditar').forEach(btn => {
    btn.onclick = () => editarEstudiante(btn.dataset.cedula);
  });
}

async function editarEstudiante(cedula) {
  const { data } = await supabase.from('estudiantes').select('*').eq('cedula', cedula).single();
  if (!data) return alert('Estudiante no encontrado');
  estudianteEditando = data;
  document.getElementById('editCedula').value = data.cedula;
  document.getElementById('editNombre').value = data.nombre_completo;
  document.getElementById('editArea').value = data.area_academica;
  document.getElementById('editNivel').value = data.nivel;
  document.getElementById('editForm').classList.remove('hidden');
}

async function guardarEdicion() {
  if (!estudianteEditando) return;
  const cedula = estudianteEditando.cedula;
  const nombre = document.getElementById('editNombre').value.trim();
  const area = document.getElementById('editArea').value.trim();
  const nivel = document.getElementById('editNivel').value.trim();
  if (!nombre || !area || !nivel) return alert('Todos los campos son obligatorios');
  await supabase.from('estudiantes').update({
    nombre_completo: nombre,
    area_academica: area,
    nivel: nivel
  }).eq('cedula', cedula);
  alert('Estudiante actualizado');
  cancelarEdicion();
  cargarListaEstudiantes();
}

function cancelarEdicion() {
  estudianteEditando = null;
  document.getElementById('editForm').classList.add('hidden');
}

async function eliminarEstudiante() {
  if (!estudianteEditando) return;
  if (!confirm('¿Eliminar estudiante y sus asistencias?')) return;
  await supabase.from('asistencias').delete().eq('cedula', estudianteEditando.cedula);
  await supabase.from('estudiantes').delete().eq('cedula', estudianteEditando.cedula);
  alert('Estudiante eliminado');
  cancelarEdicion();
  cargarListaEstudiantes();
  cargarReportes();
}

async function cargarReportes() {
  const { data: estudiantes } = await supabase.from('estudiantes').select('*');
  const { data: asistencias } = await supabase.from('asistencias').select('*');
  const tbody = document.getElementById('tblReportes');
  tbody.innerHTML = '';
  estudiantes.forEach(est => {
    const reg = asistencias.filter(a => a.cedula === est.cedula);
    const fechas = reg.map(r => r.fecha).join(', ');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${est.cedula}</td><td>${est.nombre_completo}</td><td>${reg.length}</td><td>${fechas}</td>`;
    tbody.appendChild(tr);
  });
}

async function buscarReporteCedula() {
  const cedula = document.getElementById('reporteCedula').value.trim();
  if (!cedula) return cargarReportes();
  const { data: asistencias } = await supabase.from('asistencias').select('*').eq('cedula', cedula);
  const { data: estudiante } = await supabase.from('estudiantes').select('*').eq('cedula', cedula).single();
  if (!estudiante) return alert('No encontrado');
  const tbody = document.getElementById('tblReportes');
  tbody.innerHTML = '';
  const fechas = asistencias.map(a => a.fecha).join(', ');
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${estudiante.cedula}</td><td>${estudiante.nombre_completo}</td><td>${asistencias.length}</td><td>${fechas}</td>`;
  tbody.appendChild(tr);
}

async function agregarEstudianteManual() {
  const cedula = document.getElementById('manualCedula').value.trim();
  const nombre = document.getElementById('manualNombre').value.trim();
  const area = document.getElementById('manualArea').value.trim();
  const nivel = document.getElementById('manualNivel').value.trim();

  if (!cedula || !nombre || !area || !nivel) return alert('Complete todos los campos');
  await supabase.from('estudiantes').upsert({ cedula, nombre_completo: nombre, area_academica: area, nivel });
  alert('Estudiante agregado');
  document.getElementById('manualCedula').value = '';
  document.getElementById('manualNombre').value = '';
  document.getElementById('manualArea').value = '';
  document.getElementById('manualNivel').value = '';
  cargarListaEstudiantes();
}

async function generarQRMasivo() {
  const { data: estudiantes } = await supabase.from('estudiantes').select('*');
  if (!estudiantes.length) return alert('No hay estudiantes para generar QR');

  // Crear doc PDF
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const margin = 10;
  const qrSize = 30;
  const cols = 6;
  const rows = 6;
  let x = margin;
  let y = margin;

  for (let i = 0; i < estudiantes.length; i++) {
    const est = estudiantes[i];
    const textoQR = est.cedula;

    // Generar QR como canvas
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, textoQR, { width: qrSize * 4 });

    // Insertar QR imagen en PDF (convertir canvas a DataURL)
    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, 'PNG', x, y, qrSize, qrSize);

    // Texto debajo del QR
    const texto = `${est.nombre_completo}\n${est.cedula}`;
    pdf.setFontSize(6);
    pdf.text(texto, x, y + qrSize + 6);

    x += qrSize + 10;
    if ((i + 1) % cols === 0) {
      x = margin;
      y += qrSize + 20;
      if ((i + 1) % (cols * rows) === 0) {
        pdf.addPage();
        x = margin;
        y = margin;
      }
    }
  }

  pdf.save('qr_estudiantes.pdf');
}

function main() {
  setupTabs();
  iniciarLectorQR();

  document.getElementById('btnCargarCSV').onclick = () => {
    const fileInput = document.getElementById('csvInput');
    if (fileInput.files.length === 0) return alert('Seleccione un archivo CSV');
    cargarEstudiantesDesdeCSV(fileInput.files[0]);
  };

  document.getElementById('btnAgregarManual').onclick = agregarEstudianteManual;
  document.getElementById('btnFiltrar').onclick = () => cargarListaEstudiantes(document.getElementById('filtroCedula').value.trim());
  document.getElementById('btnBuscarReporte').onclick = buscarReporteCedula;
  document.getElementById('btnGuardarEdicion').onclick = guardarEdicion;
  document.getElementById('btnCancelarEdicion').onclick = cancelarEdicion;
  document.getElementById('btnEliminarEstudiante').onclick = eliminarEstudiante;
  document.getElementById('btnGenerarQR').onclick = generarQRMasivo;

  cargarListaEstudiantes();
  cargarReportes();
}

window.onload = main;
