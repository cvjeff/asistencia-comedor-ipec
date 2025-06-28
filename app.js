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
  if (yaAsistio.length > 0) return alert(`Ya se registró asistencia para ${estudiante.nombre_completo}`);

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
  const rows = text.split('\n').map(r => r.split(','));
  const inserts = rows.slice(1).filter(r => r.length >= 4).map(([cedula, nombre_completo, area_academica, nivel]) => ({
    cedula: cedula.trim(),
    nombre_completo: nombre_completo.trim(),
    area_academica: area_academica.trim(),
    nivel: nivel.trim()
  }));
  await supabase.from('estudiantes').upsert(inserts);
  alert('Estudiantes cargados');
  cargarListaEstudiantes();
}

async function cargarListaEstudiantes(filtro = '') {
  const { data } = await supabase.from('estudiantes').select('*');
  const tbody = document.getElementById('tblEstudiantes');
  tbody.innerHTML = '';
  data.filter(est => est.cedula.includes(filtro)).forEach(est => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${est.cedula}</td><td>${est.nombre_completo}</td><td>${est.area_academica}</td><td>${est.nivel}</td>
      <td><button onclick="editarEstudiante('${est.cedula}')">Editar</button></td>`;
    tbody.appendChild(tr);
  });
}

async function editarEstudiante(cedula) {
  const { data } = await supabase.from('estudiantes').select('*').eq('cedula', cedula).single();
  estudianteEditando = data;
  document.getElementById('editCedula').value = data.cedula;
  document.getElementById('editNombre').value = data.nombre_completo;
  document.getElementById('editArea').value = data.area_academica;
  document.getElementById('editNivel').value = data.nivel;
  document.getElementById('editForm').classList.remove('hidden');
}

async function guardarEdicion() {
  if (!estudianteEditando) return;
  const actual = {
    cedula: estudianteEditando.cedula,
    nombre_completo: document.getElementById('editNombre').value,
    area_academica: document.getElementById('editArea').value,
    nivel: document.getElementById('editNivel').value
  };
  await supabase.from('estudiantes').upsert(actual);
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
  if (!confirm('¿Eliminar estudiante y asistencias?')) return;
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

  const reportes = estudiantes.map(est => {
    const registros = asistencias.filter(a => a.cedula === est.cedula);
    return {
      cedula: est.cedula,
      nombre_completo: est.nombre_completo,
      dias: registros.length,
      fechas: registros.map(r => r.fecha).join(', ')
    };
  });

  mostrarReportes(reportes);
}

function mostrarReportes(lista) {
  const tbody = document.getElementById('tblReportes');
  tbody.innerHTML = '';
  lista.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.cedula}</td><td>${r.nombre_completo}</td><td>${r.dias}</td><td>${r.fechas}</td>`;
    tbody.appendChild(tr);
  });
}

async function buscarReporteCedula() {
  const filtro = document.getElementById('reporteCedula').value.trim();
  const { data: asistencias } = await supabase.from('asistencias').select('*').eq('cedula', filtro);
  const { data: estudiante } = await supabase.from('estudiantes').select('*').eq('cedula', filtro).single();
  if (!estudiante) return alert('No encontrado');

  const reporte = [{
    cedula: estudiante.cedula,
    nombre_completo: estudiante.nombre_completo,
    dias: asistencias.length,
    fechas: asistencias.map(r => r.fecha).join(', ')
  }];
  mostrarReportes(reporte);
}

async function agregarEstudianteManual() {
  const cedula = document.getElementById('manualCedula').value;
  const nombre = document.getElementById('manualNombre').value;
  const area = document.getElementById('manualArea').value;
  const nivel = document.getElementById('manualNivel').value;

  if (!cedula || !nombre || !area || !nivel) return alert('Todos los campos son obligatorios.');

  await supabase.from('estudiantes').upsert({
    cedula,
    nombre_completo: nombre,
    area_academica: area,
    nivel
  });
  alert('Estudiante agregado');
  document.getElementById('manualCedula').value = '';
  document.getElementById('manualNombre').value = '';
  document.getElementById('manualArea').value = '';
  document.getElementById('manualNivel').value = '';
  cargarListaEstudiantes();
}

async function generarQRMasivo() {
  const { data: estudiantes } = await supabase.from('estudiantes').select('*');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const columnas = 6;
  const filas = 6;
  const espacioX = 30;
  const espacioY = 45;
  let x = 10;
  let y = 10;
  let count = 0;

  for (let i = 0; i < estudiantes.length; i++) {
    const est = estudiantes[i];

    // Generar QR en canvas
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, est.cedula, { width: 50 });

    const imgData = qrCanvas.toDataURL('image/png');

    pdf.addImage(imgData, 'PNG', x, y, 25, 25);
    pdf.setFontSize(8);
    pdf.text(`${est.nombre_completo}`, x, y + 32);
    pdf.text(`Cédula: ${est.cedula}`, x, y + 38);

    x += espacioX;
    count++;
    if (count % columnas === 0) {
      x = 10;
      y += espacioY;
    }
    if (count % (columnas * filas) === 0 && i !== estudiantes.length - 1) {
      pdf.addPage();
      x = 10;
      y = 10;
    }
  }

  pdf.save('codigos_qr_estudiantes.pdf');
}

function main() {
  setupTabs();
  iniciarLectorQR();
  document.getElementById('btnCargarCSV').addEventListener('click', () => {
    const input = document.getElementById('csvInput');
    if (input.files.length > 0) cargarEstudiantesDesdeCSV(input.files[0]);
  });
  document.getElementById('btnAgregarManual').addEventListener('click', agregarEstudianteManual);
  document.getElementById('btnFiltrar').addEventListener('click', () => cargarListaEstudiantes(document.getElementById('filtroCedula').value));
  document.getElementById('btnBuscarReporte').addEventListener('click', buscarReporteCedula);
  document.getElementById('btnGenerarQR').addEventListener('click', generarQRMasivo);

  cargarListaEstudiantes();
  cargarReportes();
}

window.onload = main;
