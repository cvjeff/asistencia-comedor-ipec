import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

const supabaseUrl = 'https://pqwpieuxyudsvetytoac.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxd3BpZXV4eXVkc3ZldHl0b2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwNTQ5MjksImV4cCI6MjA2NjYzMDkyOX0.FZOSbJTSiedP1yrwgXn_GLLeELxfzQ13fnIss7aDaJ4';

const sb = createClient(supabaseUrl, supabaseKey);

let estudiantesCache = [];
let reportesFiltrados = [];

function showMsg(text, error = false, lugar = 'msg') {
  const el = document.getElementById(lugar);
  el.textContent = text;
  el.style.color = error ? 'red' : 'green';
}

async function cargarEstudiantesDesdeCSV(file) {
  if (!file) {
    showMsg('Debe seleccionar un archivo CSV', true);
    return;
  }
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async ({ data }) => {
      const valid = data.every(row =>
        row.cedula && row.nombre_completo && row.area_academica && row.nivel
      );
      if (!valid) {
        showMsg('CSV inválido, revise las columnas.', true);
        return;
      }
      const { error } = await sb.from('estudiantes').upsert(data);
      if (error) showMsg('Error al cargar estudiantes: ' + error.message, true);
      else {
        showMsg('Estudiantes cargados correctamente');
        cargarListaEstudiantes();
      }
    }
  });
}

async function cargarListaEstudiantes(filtro = '') {
  let query = sb.from('estudiantes').select('*').order('nombre_completo');
  if (filtro.trim()) query = query.ilike('cedula', `%${filtro}%`);
  const { data, error } = await query;
  if (error) {
    showMsg('Error al cargar estudiantes: ' + error.message, true);
    return;
  }
  estudiantesCache = data || [];
  const tbody = document.getElementById('tblEstudiantes');
  tbody.innerHTML = '';
  for (const est of estudiantesCache) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="chkEstudiante" data-cedula="${est.cedula}" /></td>
      <td>${est.cedula}</td>
      <td>${est.nombre_completo}</td>
      <td>${est.area_academica}</td>
      <td>${est.nivel}</td>
      <td><button class="btnEditar" data-cedula="${est.cedula}">Editar</button></td>
    `;
    tbody.appendChild(tr);
  }
  // checkbox "seleccionar todos"
  const chkTodos = document.getElementById('chkTodos');
  chkTodos.checked = false;
  chkTodos.addEventListener('change', () => {
    document.querySelectorAll('.chkEstudiante').forEach(chk => chk.checked = chkTodos.checked);
  });
  // botones editar
  document.querySelectorAll('.btnEditar').forEach(btn =>
    btn.addEventListener('click', e => {
      const ced = e.target.dataset.cedula;
      editarEstudiante(ced);
    })
  );
}

async function registrarAsistencia(cedula) {
  const est = estudiantesCache.find(e => e.cedula === cedula);
  if (!est) {
    showMsg(`Cédula no registrada: ${cedula}`, true, 'msgAsistencia');
    return;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: asistenciaHoy, error } = await sb
    .from('asistencias')
    .select('*')
    .eq('cedula', cedula)
    .eq('fecha', hoy);
  if (error) {
    showMsg('Error al consultar asistencia', true, 'msgAsistencia');
    return;
  }
  if (asistenciaHoy.length > 0) {
    showMsg(`Ya se registró asistencia hoy para ${est.nombre_completo}`, true, 'msgAsistencia');
    return;
  }
  const hora = new Date().toTimeString().split(' ')[0];
  const { error: insertErr } = await sb.from('asistencias').insert({
    cedula,
    fecha: hoy,
    hora,
    area_academica: est.area_academica,
    nivel: est.nivel,
  });
  if (insertErr) {
    showMsg('Error al registrar asistencia: ' + insertErr.message, true, 'msgAsistencia');
  } else {
    showMsg(`Asistencia registrada para ${est.nombre_completo}`, false, 'msgAsistencia');
  }
  cargarReportes();
}

async function cargarReportes() {
  const { data, error } = await sb.from('estudiantes').select('*').order('nombre_completo');
  if (error) {
    showMsg('Error cargando reportes: ' + error.message, true);
    return;
  }
  estudiantesCache = data || [];
  // Cargar asistencias agrupadas por cedula
  const { data: asistencias, error: errAsis } = await sb
    .from('asistencias')
    .select('cedula,fecha')
    .order('fecha', { ascending: true });
  if (errAsis) {
    showMsg('Error cargando asistencias: ' + errAsis.message, true);
    return;
  }
  // Contar días por estudiante
  const countByCedula = {};
  const fechasByCedula = {};
  for (const a of asistencias) {
    if (!countByCedula[a.cedula]) {
      countByCedula[a.cedula] = 0;
      fechasByCedula[a.cedula] = [];
    }
    countByCedula[a.cedula]++;
    fechasByCedula[a.cedula].push(a.fecha);
  }
  // Guardar reportes filtrados por defecto todos
  reportesFiltrados = estudiantesCache.map(est => ({
    cedula: est.cedula,
    nombre_completo: est.nombre_completo,
    dias: countByCedula[est.cedula] || 0,
    fechas: fechasByCedula[est.cedula] ? fechasByCedula[est.cedula].join(', ') : '',
  }));
  mostrarReportes(reportesFiltrados);
}

function mostrarReportes(reportes) {
  const tbody = document.getElementById('tblReportes');
  tbody.innerHTML = '';
  for (const r of reportes) {
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

function editarEstudiante(cedula) {
  const est = estudiantesCache.find(e => e.cedula === cedula);
  if (!est) return alert('Estudiante no encontrado');
  document.getElementById('editCedula').value = est.cedula;
  document.getElementById('editNombre').value = est.nombre_completo;
  document.getElementById('editArea').value = est.area_academica;
  document.getElementById('editNivel').value = est.nivel;
  document.getElementById('editForm').classList.remove('hidden');
}

async function guardarEdicion() {
  const cedula = document.getElementById('editCedula').value;
  const nombre = document.getElementById('editNombre').value.trim();
  const area = document.getElementById('editArea').value.trim();
  const nivel = document.getElementById('editNivel').value.trim();

  if (!nombre || !area || !nivel) {
    alert('Complete todos los campos');
    return;
  }
  const { error } = await sb.from('estudiantes')
    .update({ nombre_completo: nombre, area_academica: area, nivel: nivel })
    .eq('cedula', cedula);
  if (error) {
    alert('Error al guardar: ' + error.message);
  } else {
    alert('Estudiante actualizado');
    document.getElementById('editForm').classList.add('hidden');
    cargarListaEstudiantes();
    cargarReportes();
  }
}

function cancelarEdicion() {
  document.getElementById('editForm').classList.add('hidden');
}

async function borrarEstudiantes(cedulas) {
  if (cedulas.length === 0) {
    alert('No hay estudiantes seleccionados');
    return;
  }
  if (!confirm(`¿Seguro que quiere borrar ${cedulas.length} estudiantes seleccionados?`)) return;

  for (const c of cedulas) {
    await sb.from('asistencias').delete().eq('cedula', c);
    await sb.from('estudiantes').delete().eq('cedula', c);
  }
  alert('Estudiantes borrados');
  cargarListaEstudiantes();
  cargarReportes();
}

async function borrarTodosEstudiantes() {
  document.getElementById('confirmBorrarTodos').classList.remove('hidden');
}

async function confirmarBorrarTodos() {
  // Borra asistencias y estudiantes
  await sb.from('asistencias').delete().neq('cedula', '');
  await sb.from('estudiantes').delete().neq('cedula', '');
  alert('Todos los estudiantes y asistencias borrados');
  cargarListaEstudiantes();
  cargarReportes();
  document.getElementById('confirmBorrarTodos').classList.add('hidden');
}

function cancelarBorrarTodos() {
  document.getElementById('confirmBorrarTodos').classList.add('hidden');
}

function descargarExcel(data, nombreArchivo) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, nombreArchivo);
}

async function filtrarPorDias() {
  const n = parseInt(document.getElementById('filtroDias').value);
  if (isNaN(n)) {
    alert('Ingrese un número válido');
    return;
  }
  const filtrados = reportesFiltrados.filter(r => r.dias < n);
  if (filtrados.length === 0) {
    alert('No hay estudiantes con menos de ' + n + ' días');
  }
  mostrarReportes(filtrados);
  return filtrados;
}

async function init() {
  // Eventos pestañas
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(tab.dataset.tab).classList.remove('hidden');
    });
  });

  // Cargar estudiantes CSV
  document.getElementById('btnCargarCSV').addEventListener('click', () => {
    const input = document.getElementById('csvInput');
    cargarEstudiantesDesdeCSV(input.files[0]);
  });

  // Borrar todos estudiantes
  document.getElementById('btnBorrarEstudiantes').addEventListener('click', borrarTodosEstudiantes);

  // Confirmación borrar todos
  document.getElementById('confirmSi').addEventListener('click', confirmarBorrarTodos);
  document.getElementById('confirmNo').addEventListener('click', cancelarBorrarTodos);

  // Buscar estudiantes
  document.getElementById('btnFiltrar').addEventListener('click', () => {
    const filtro = document.getElementById('filtroCedula').value.trim();
    cargarListaEstudiantes(filtro);
  });

  // Borrar seleccionados
  document.getElementById('btnBorrarSeleccionados').addEventListener('click', () => {
    const seleccionados = Array.from(document.querySelectorAll('.chkEstudiante:checked')).map(chk => chk.dataset.cedula);
    borrarEstudiantes(seleccionados);
  });

  // Guardar edición
  document.getElementById('btnGuardarEdicion').addEventListener('click', guardarEdicion);
  document.getElementById('btnCancelarEdicion').addEventListener('click', cancelarEdicion);

  // Reportes: filtrar por días
  document.getElementById('btnFiltrarDias').addEventListener('click', async () => {
    reportesFiltrados = await filtrarPorDias() || [];
  });

  // Reportes: borrar filtrados
  document.getElementById('btnBorrarFiltrados').addEventListener('click', async () => {
    if (!confirm('¿Seguro que desea borrar los estudiantes filtrados?')) return;
    const filtrados = await filtrarPorDias() || [];
    if (filtrados.length === 0) {
      alert('No hay estudiantes para borrar');
      return;
    }
    await borrarEstudiantes(filtrados.map(r => r.cedula));
    // Refrescar filtro
    reportesFiltrados = await filtrarPorDias() || [];
  });

  // Descargar reportes Excel
  document.getElementById('btnDescargarTodos').addEventListener('click', () => {
    descargarExcel(reportesFiltrados.length ? reportesFiltrados : estudiantesCache.map(e => ({
      cedula: e.cedula,
      nombre_completo: e.nombre_completo,
      dias: 0,
      fechas: ''
    })), 'Reporte_Completo.xlsx');
  });

  document.getElementById('btnDescargarFiltrados').addEventListener('click', () => {
    if (reportesFiltrados.length === 0) {
      alert('No hay datos filtrados para descargar');
      return;
    }
    descargarExcel(reportesFiltrados, 'Reporte_Filtrado.xlsx');
  });

  // Cargar lista inicial y reportes
  await cargarListaEstudiantes();
  await cargarReportes();

  // Iniciar lector QR en pestaña asistencia
  const qr = new Html5Qrcode('reader');
  try {
    const cameras = await Html5Qrcode.getCameras();
    if (cameras && cameras.length) {
      await qr.start(
        cameras[0].id,
        { fps: 10, qrbox: 250 },
        (decodedText) => registrarAsistencia(decodedText.trim()),
        (errorMessage) => { /* ignore scan errors */ }
      );
    } else {
      showMsg('No se detectó cámara', true, 'msgAsistencia');
    }
  } catch {
    showMsg('Error al iniciar cámara', true, 'msgAsistencia');
  }
}

window.onload = init;
