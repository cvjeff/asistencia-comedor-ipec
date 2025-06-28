import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

const supabaseUrl = 'https://pqwpieuxyudsvetytoac.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxd3BpZXV4eXVkc3ZldHl0b2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwNTQ5MjksImV4cCI6MjA2NjYzMDkyOX0.FZOSbJTSiedP1yrwgXn_GLLeELxfzQ13fnIss7aDaJ4';

const supabase = createClient(supabaseUrl, supabaseKey);

let estudiantesCache = [];
let reportesFiltrados = [];
let estudianteEditando = null;

function showMsg(text, error = false, lugar = 'msg') {
  const el = document.getElementById(lugar);
  el.textContent = text;
  el.style.color = error ? 'red' : 'green';
}

async function cargarEstudiantesDesdeCSV(file) {
  if (!file) {
    showMsg('Seleccione un archivo CSV.', true);
    return;
  }

  const text = await file.text();
  const results = Papa.parse(text, { header: true, skipEmptyLines: true });

  if (results.errors.length) {
    showMsg('Error leyendo CSV: ' + results.errors[0].message, true);
    return;
  }

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
  if (errores) showMsg(`Cargados con ${errores} errores.`, true);
  else showMsg(`Cargados ${estudiantes.length} estudiantes correctamente.`);
  cargarListaEstudiantes();
  cargarReportes();
}

async function cargarListaEstudiantes(filtro = '') {
  const { data, error } = await supabase
    .from('estudiantes')
    .select('*')
    .ilike('cedula', `%${filtro}%`)
    .order('nombre_completo');

  if (error) {
    showMsg('Error cargando estudiantes: ' + error.message, true);
    return;
  }
  estudiantesCache = data || [];
  renderListaEstudiantes();
}

function renderListaEstudiantes() {
  const tbody = document.getElementById('tblEstudiantes');
  tbody.innerHTML = '';

  for (const est of estudiantesCache) {
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
  }

  document.getElementById('chkTodos').checked = false;

  document.querySelectorAll('.btnEditar').forEach(btn => {
    btn.onclick = () => {
      const cedula = btn.dataset.cedula;
      estudianteEditando = estudiantesCache.find(e => e.cedula === cedula);
      if (!estudianteEditando) return;

      document.getElementById('editCedula').value = estudianteEditando.cedula;
      document.getElementById('editNombre').value = estudianteEditando.nombre_completo;
      document.getElementById('editArea').value = estudianteEditando.area_academica;
      document.getElementById('editNivel').value = estudianteEditando.nivel;

      document.getElementById('editForm').classList.remove('hidden');
    };
  });
}

document.getElementById('chkTodos').addEventListener('change', function() {
  const checked = this.checked;
  document.querySelectorAll('.chkEstudiante').forEach(chk => chk.checked = checked);
});

async function guardarEdicion() {
  if (!estudianteEditando) return;
  const nombre = document.getElementById('editNombre').value.trim();
  const area = document.getElementById('editArea').value.trim();
  const nivel = document.getElementById('editNivel').value.trim();

  if (!nombre || !area || !nivel) {
    alert('Complete todos los campos para editar.');
    return;
  }

  const { error } = await supabase.from('estudiantes').update({
    nombre_completo: nombre,
    area_academica: area,
    nivel: nivel
  }).eq('cedula', estudianteEditando.cedula);

  if (error) {
    alert('Error guardando: ' + error.message);
  } else {
    alert('Estudiante actualizado.');
    estudianteEditando = null;
    document.getElementById('editForm').classList.add('hidden');
    cargarListaEstudiantes();
    cargarReportes();
  }
}

function cancelarEdicion() {
  estudianteEditando = null;
  document.getElementById('editForm').classList.add('hidden');
}

async function borrarEstudiantes(cedulas) {
  if (cedulas.length === 0) {
    alert('No hay estudiantes seleccionados.');
    return;
  }

  if (!confirm(`¿Seguro que desea borrar ${cedulas.length} estudiante(s)?`)) return;

  for (const ced of cedulas) {
    await supabase.from('asistencias').delete().eq('cedula', ced);
    await supabase.from('estudiantes').delete().eq('cedula', ced);
  }
  alert('Estudiantes borrados.');
  cargarListaEstudiantes();
  cargarReportes();
}

async function registrarAsistencia(cedula) {
  const estudiante = estudiantesCache.find(e => e.cedula === cedula);
  if (!estudiante) {
    showMsg('Estudiante no encontrado', true, 'msgAsistencia');
    return;
  }

  const hoy = new Date().toISOString().slice(0, 10);

  const { data: asistenciaHoy, error } = await supabase
    .from('asistencias')
    .select('*')
    .eq('cedula', cedula)
    .eq('fecha', hoy);

  if (error) {
    showMsg('Error al consultar asistencia', true, 'msgAsistencia');
    return;
  }

  if (asistenciaHoy.length > 0) {
    showMsg(`Asistencia de ${estudiante.nombre_completo} ya registrada hoy.`, true, 'msgAsistencia');
    return;
  }

  const hora = new Date().toLocaleTimeString();
  const { error: errInsert } = await supabase.from('asistencias').insert({
    cedula,
    fecha: hoy,
    hora,
    area_academica: estudiante.area_academica,
    nivel: estudiante.nivel
  });

  if (errInsert) {
    showMsg('Error al registrar asistencia: ' + errInsert.message, true, 'msgAsistencia');
  } else {
    showMsg(`Asistencia registrada: ${estudiante.nombre_completo}`, false, 'msgAsistencia');
    cargarReportes();
  }
}

async function cargarReportes() {
  const { data: asistencias, error } = await supabase
    .from('asistencias')
    .select('*');

  if (error) {
    showMsg('Error cargando reportes: ' + error.message, true, 'msg');
    return;
  }

  const mapAsistencia = {};

  for (const a of asistencias) {
    if (!mapAsistencia[a.cedula]) {
      mapAsistencia[a.cedula] = new Set();
    }
    mapAsistencia[a.cedula].add(a.fecha);
  }

  const resumen = estudiantesCache.map(e => ({
    cedula: e.cedula,
    nombre_completo: e.nombre_completo,
    dias: mapAsistencia[e.cedula] ? mapAsistencia[e.cedula].size : 0,
    fechas: mapAsistencia[e.cedula] ? Array.from(mapAsistencia[e.cedula]).join(', ') : ''
  }));

  reportesFiltrados = resumen;

  const tbody = document.getElementById('tblReportes');
  tbody.innerHTML = '';

  for (const r of resumen) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.cedula}</td>
      <td>${r.nombre_completo}</td>
      <td>${r.dias}</td>
      <td>${r.fechas}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function filtrarPorDias() {
  const dias = parseInt(document.getElementById('filtroDias').value);
  if (isNaN(dias)) {
    alert('Ingrese un número válido de días.');
    return [];
  }
  return reportesFiltrados.filter(e => e.dias < dias);
}

async function descargarExcel(data, nombreArchivo) {
  if (!data.length) {
    alert('No hay datos para exportar.');
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, nombreArchivo);
}

async function iniciarLectorQR() {
  const html5QrCode = new Html5Qrcode("reader");

  const qrConfig = { fps: 10, qrbox: { width: 250, height: 250 } };

  await html5QrCode.start(
    { facingMode: "environment" },
    qrConfig,
    qrCodeMessage => {
      registrarAsistencia(qrCodeMessage.trim());
    },
    errorMessage => {
      //console.log('QR error:', errorMessage);
    }
  );
}

async function detenerLectorQR() {
  const html5QrCode = new Html5Qrcode("reader");
  try {
    await html5QrCode.stop();
  } catch {}
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      const tabId = tab.getAttribute('data-tab');
      document.getElementById(tabId).classList.remove('hidden');

      if (tabId === 'asistencia') {
        iniciarLectorQR();
      } else {
        detenerLectorQR();
      }
    });
  });
}

async function main() {
  setupTabs();

  document.getElementById('btnCargarCSV').addEventListener('click', () => {
    const input = document.getElementById('csvInput');
    cargarEstudiantesDesdeCSV(input.files[0]);
  });

  document.getElementById('btnFiltrar').addEventListener('click', () => {
    const filtro = document.getElementById('filtroCedula').value.trim();
    cargarListaEstudiantes(filtro);
  });

  document.getElementById('btnBorrarSeleccionados').addEventListener('click', () => {
    const seleccionados = Array.from(document.querySelectorAll('.chkEstudiante:checked')).map(chk => chk.dataset.cedula);
    borrarEstudiantes(seleccionados);
  });

  document.getElementById('btnGuardarEdicion').addEventListener('click', guardarEdicion);
  document.getElementById('btnCancelarEdicion').addEventListener('click', cancelarEdicion);

  document.getElementById('btnFiltrarDias').addEventListener('click', async () => {
    const filtrados = await filtrarPorDias();
    reportesFiltrados = filtrados;
    mostrarReportesFiltrados(filtrados);
  });

  document.getElementById('btnBorrarFiltrados').addEventListener('click', async () => {
    if (reportesFiltrados.length === 0) {
      alert('No hay estudiantes filtrados para borrar.');
      return;
    }
    if (!confirm(`¿Seguro que desea borrar ${reportesFiltrados.length} estudiantes filtrados?`)) return;

    for (const est of reportesFiltrados) {
      await supabase.from('asistencias').delete().eq('cedula', est.cedula);
      await supabase.from('estudiantes').delete().eq('cedula', est.cedula);
    }
    alert('Estudiantes filtrados borrados.');
    cargarListaEstudiantes();
    cargarReportes();
  });

  document.getElementById('btnDescargarTodos').addEventListener('click', () => {
    descargarExcel(reportesFiltrados, 'Reporte_Asistencia_Todos.xlsx');
  });

  document.getElementById('btnDescargarFiltrados').addEventListener('click', () => {
    descargarExcel(reportesFiltrados, 'Reporte_Asistencia_Filtrados.xlsx');
  });

  // Inicializar lista y reportes
  await cargarListaEstudiantes();
  await cargarReportes();
}

function mostrarReportesFiltrados(filtrados) {
  const tbody = document.getElementById('tblReportes');
  tbody.innerHTML = '';
  for (const r of filtrados) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.cedula}</td>
      <td>${r.nombre_completo}</td>
      <td>${r.dias}</td>
      <td>${r.fechas}</td>
    `;
    tbody.appendChild(tr);
  }
}

window.onload = main;

