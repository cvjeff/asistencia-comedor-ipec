import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

const supabaseUrl = 'https://pqwpieuxyudsvetytoac.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxd3BpZXV4eXVkc3ZldHl0b2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwNTQ5MjksImV4cCI6MjA2NjYzMDkyOX0.FZOSbJTSiedP1yrwgXn_GLLeELxfzQ13fnIss7aDaJ4';

const sb = createClient(supabaseUrl, supabaseKey);

let csvFile = null;
let estudiantesCache = [];

function showMsg(text, error = false) {
  const msg = document.getElementById('msg');
  msg.textContent = text;
  msg.style.color = error ? 'red' : 'green';
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
      // Validar estructura mínima
      const valid = data.every(row =>
        row.cedula && row.nombre_completo && row.area_academica && row.nivel
      );
      if (!valid) {
        showMsg('CSV inválido, revise las columnas.', true);
        return;
      }
      // Insertar con upsert para evitar errores por duplicados
      const { error } = await sb.from('estudiantes').upsert(data);
      if (error) showMsg('Error al cargar estudiantes: ' + error.message, true);
      else {
        showMsg('Estudiantes cargados correctamente');
        await cargarListaEstudiantes();
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
      <td>${est.cedula}</td>
      <td>${est.nombre_completo}</td>
      <td>${est.area_academica}</td>
      <td>${est.nivel}</td>
      <td><button onclick="editarEstudiante('${est.cedula}')">Editar</button></td>
    `;
    tbody.appendChild(tr);
  }
}

async function registrarAsistencia(cedula) {
  // Verificar estudiante existe
  const est = estudiantesCache.find(e => e.cedula === cedula);
  if (!est) {
    showMsg(`Cédula no registrada: ${cedula}`, true);
    return;
  }

  // Verificar si ya tiene registro hoy
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: asistenciaHoy, error } = await sb
    .from('asistencias')
    .select('*')
    .eq('cedula', cedula)
    .eq('fecha', hoy);
  if (error) {
    showMsg('Error al consultar asistencia', true);
    return;
  }
  if (asistenciaHoy.length > 0) {
    showMsg(`Ya se registró asistencia hoy para ${est.nombre_completo}`, true);
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
    showMsg('Error al registrar asistencia: ' + insertErr.message, true);
  } else {
    showMsg(`Asistencia registrada para ${est.nombre_completo}`);
    cargarReportePorEstudiante(document.getElementById('reporteCedula').value.trim());
  }
}

async function cargarReportePorEstudiante(cedula) {
  if (!cedula) {
    document.getElementById('tblReportes').innerHTML = '';
    return;
  }
  // Cargar estudiante para nombre
  const est = estudiantesCache.find(e => e.cedula === cedula);
  if (!est) {
    showMsg('Estudiante no encontrado para reporte', true);
    document.getElementById('tblReportes').innerHTML = '';
    return;
  }

  // Cargar asistencias
  const { data, error } = await sb
    .from('asistencias')
    .select('fecha')
    .eq('cedula', cedula)
    .order('fecha', { ascending: true });
  if (error) {
    showMsg('Error al cargar reporte: ' + error.message, true);
    return;
  }

  // Contar días y mostrar fechas
  const dias = data ? data.length : 0;
  const fechas = data ? data.map(a => a.fecha).join(', ') : '';

  const tbody = document.getElementById('tblReportes');
  tbody.innerHTML = `
    <tr>
      <td>${est.cedula}</td>
      <td>${est.nombre_completo}</td>
      <td>${dias}</td>
      <td>${fechas}</td>
    </tr>
  `;
}

window.editarEstudiante = function(cedula) {
  const est = estudiantesCache.find(e => e.cedula === cedula);
  if (!est) return alert('Estudiante no encontrado');
  document.getElementById('editCedula').value = est.cedula;
  document.getElementById('editNombre').value = est.nombre_completo;
  document.getElementById('editArea').value = est.area_academica;
  document.getElementById('editNivel').value = est.nivel;
  document.getElementById('editForm').classList.remove('hidden');
};

window.guardarEdicion = async function() {
  const cedula = document.getElementById('editCedula').value;
  const nombre = document.getElementById('editNombre').value.trim();
  const area = document.getElementById('editArea').value.trim();
  const nivel = document.getElementById('editNivel').value.trim();

  if (!nombre || !area || !nivel) {
    alert('Complete todos los campos');
    return;
  }

  const { error } = await sb
    .from('estudiantes')
    .update({
      nombre_completo: nombre,
      area_academica: area,
      nivel: nivel,
    })
    .eq('cedula', cedula);

  if (error) {
    alert('Error al guardar: ' + error.message);
  } else {
    alert('Estudiante actualizado');
    document.getElementById('editForm').classList.add('hidden');
    cargarListaEstudiantes();
  }
};

window.cancelarEdicion = function() {
  document.getElementById('editForm').classList.add('hidden');
};

document.getElementById('csvInput').addEventListener('change', (e) => {
  csvFile = e.target.files[0];
});

document.getElementById('btnCargarCSV').addEventListener('click', () => {
  cargarEstudiantesDesdeCSV(csvFile);
});

document.getElementById('btnFiltrar').addEventListener('click', () => {
  const filtro = document.getElementById('filtroCedula').value.trim();
  cargarListaEstudiantes(filtro);
});

document.getElementById('btnBuscarReporte').addEventListener('click', () => {
  const cedula = document.getElementById('reporteCedula').value.trim();
  cargarReportePorEstudiante(cedula);
});

document.getElementById('btnBorrarEstudiantes').addEventListener('click', async () => {
  if (!confirm('¿Seguro que quiere borrar todos los estudiantes?')) return;
  const { error } = await sb.from('estudiantes').delete().neq('cedula', '');
  if (error) alert('Error borrando: ' + error.message);
  else {
    alert('Estudiantes borrados');
    cargarListaEstudiantes();
  }
});

async function init() {
  await cargarListaEstudiantes();

  const qr = new Html5Qrcode('reader');
  Html5Qrcode.getCameras()
    .then(cams => {
      if (!cams || cams.length === 0) {
        showMsg('No se detectó cámara', true);
        return;
      }
      qr.start(cams[0].id, { fps: 10, qrbox: 250 },
        code => registrarAsistencia(code.trim()),
        error => {}
      );
    })
    .catch(() => showMsg('Error al acceder a la cámara', true));
}

window.onload = init;


