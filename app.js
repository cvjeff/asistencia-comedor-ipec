import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';

const supabaseUrl = 'https://pqwpieuxyudsvetytoac.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxd3BpZXV4eXVkc3ZldHl0b2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwNTQ5MjksImV4cCI6MjA2NjYzMDkyOX0.FZOSbJTSiedP1yrwgXn_GLLeELxfzQ13fnIss7aDaJ4';

const sb = createClient(supabaseUrl, supabaseKey);

function showMsg(txt, error = false) {
  const el = document.getElementById('msg');
  el.textContent = txt;
  el.style.color = error ? 'red' : 'green';
}

async function loadCSV(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async ({ data }) => {
      const { error } = await sb.from('estudiantes').insert(data);
      if (error) showMsg('Error al cargar: ' + error.message, true);
      else showMsg('✅ Estudiantes cargados');
    }
  });
}

async function registrarAsistencia(cedula) {
  const { data: est } = await sb.from('estudiantes').select('*').eq('cedula', cedula).single();
  if (!est) {
    showMsg(`❌ Cédula no encontrada: ${cedula}`, true);
    return;
  }

  const now = new Date();
  const fecha = now.toISOString().split('T')[0];
  const hora = now.toTimeString().split(' ')[0];

  const { error } = await sb.from('asistencias').insert({
    cedula, fecha, hora,
    area_academica: est.area_academica,
    nivel: est.nivel
  });

  if (error) showMsg('❌ Error al guardar asistencia', true);
  else {
    showMsg(`✅ ${est.nombre_completo} presente`);
    cargarTabla();
  }
}

async function cargarTabla() {
  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await sb.from('asistencias').select('*').eq('fecha', hoy);
  if (error) return;

  const tbl = document.getElementById('tblAssist');
  tbl.innerHTML = '';
  for (const a of data) {
    const { data: est } = await sb.from('estudiantes').select('nombre_completo').eq('cedula', a.cedula).single();
    const fila = document.createElement('tr');
    fila.innerHTML = `<td>${a.cedula}</td><td>${est.nombre_completo}</td><td>${a.fecha}</td><td>${a.hora}</td>`;
    tbl.appendChild(fila);
  }
}

document.getElementById('csvInput').addEventListener('change', e => {
  if (e.target.files.length) loadCSV(e.target.files[0]);
});

const qr = new Html5Qrcode('reader');
Html5Qrcode.getCameras()
  .then(cams => cams && cams.length
    ? qr.start(cams[0].id, { fps: 10, qrbox: 250 },
        code => registrarAsistencia(code.trim()),
        _ => {}
      )
    : showMsg('No se detecta cámara', true)
  )
  .catch(() => showMsg('Error de cámara', true));

document.getElementById('btnExport').addEventListener('click', async () => {
  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await sb.from('asistencias').select('cedula,fecha,hora').eq('fecha', hoy);
  if (error) return alert(error.message);

  const csv = Papa.unparse(data);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `asistencia_${hoy}.csv`;
  a.click();
});

window.addEventListener('load', cargarTabla);
