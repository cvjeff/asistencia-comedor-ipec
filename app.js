// app.js
import { Html5Qrcode } from 'https://unpkg.com/html5-qrcode?module';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

// Configuración de Supabase
const supabaseUrl = 'https://pqwpieuxyudsvetytoac.supabase.co';
const supabaseKey = 'PUBLIC_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

let estudiantesCache = [];
let reportesFiltrados = [];
let estudianteEditando = null;
let html5QrCode;

// Modal
const modal = document.getElementById('attendanceModal');
const modalText = document.getElementById('modalText');
const modalClose = document.getElementById('modalClose');
modalClose.onclick = () => modal.classList.add('hidden');
function showModal(msg) { modalText.textContent = msg; modal.classList.remove('hidden'); }

// Registro manual
async function manualRegistro() {
  const ced = document.getElementById('manCedula').value.trim();
  const nom = document.getElementById('manNombre').value.trim();
  const area = document.getElementById('manArea').value.trim();
  const nivel = document.getElementById('manNivel').value.trim();
  if (!ced||!nom||!area||!nivel) { alert('Complete todos los campos.'); return; }
  await supabase.from('estudiantes').insert({ cedula:ced, nombre_completo:nom, area_academica:area, nivel });
  alert('Estudiante registrado.');
  await cargarListaEstudiantes(); await cargarReportes();
}

// CSV
async function cargarEstudiantesDesdeCSV(file) {
  if (!file) { alert('Seleccione CSV.'); return; }
  const text = await file.text();
  const res = Papa.parse(text,{header:true,skipEmptyLines:true});
  if (res.errors.length) { alert('Error CSV: '+res.errors[0].message); return; }
  let errs=0;
  for(const e of res.data) {
    const { error }= await supabase.from('estudiantes').upsert({
      cedula:e.cedula.trim(), nombre_completo:e.nombre_completo.trim(), area_academica:e.area_academica.trim(), nivel:e.nivel.trim()
    }); if(error) errs++;
  }
  alert(errs?`Con ${errs} errores`:`Cargados ${res.data.length}`);
  await cargarListaEstudiantes(); await cargarReportes();
}

document.getElementById('btnRegistroManual').onclick=manualRegistro;
document.getElementById('btnCargarCSV').onclick=()=> cargarEstudiantesDesdeCSV(document.getElementById('csvInput').files[0]);

// Listar
async function cargarListaEstudiantes(filtro='') {
  const { data, error }= await supabase.from('estudiantes').select('*').ilike('cedula',`%${filtro}%`).order('nombre_completo');
  if(error){alert('Error: '+error.message);return;} estudiantesCache=data; renderListaEstudiantes();
}
function renderListaEstudiantes(){
  const t=document.getElementById('tblEstudiantes');t.innerHTML='';
  estudiantesCache.forEach(e=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><button class="btnEditar" data-cedula="${e.cedula}">✏️</button></td>`+
                 `<td>${e.cedula}</td><td>${e.nombre_completo}</td><td>${e.area_academica}</td><td>${e.nivel}</td>`;
    t.appendChild(tr);
  });
  document.querySelectorAll('.btnEditar').forEach(b=>b.onclick=()=>{
    estudianteEditando= estudiantesCache.find(x=>x.cedula===b.dataset.cedula);
    ['Cedula','Nombre','Area','Nivel'].forEach(f=>document.getElementById('edit'+f).value=estudianteEditando['cedula']==='Cedula'?'' : estudianteEditando[`nombre_completo`]);
    document.getElementById('editCedula').value=estudianteEditando.cedula;
    document.getElementById('editNombre').value=estudianteEditando.nombre_completo;
    document.getElementById('editArea').value=estudianteEditando.area_academica;
    document.getElementById('editNivel').value=estudianteEditando.nivel;
    document.getElementById('editForm').classList.remove('hidden');
  });
}

// Filtrar buscador estudiantes registrados
document.getElementById('btnFiltrar').onclick=()=> cargarListaEstudiantes(document.getElementById('filtroCedula').value.trim());

// Editar
async function guardarEdicion(){
  const nom=document.getElementById('editNombre').value.trim();
  const area=document.getElementById('editArea').value.trim();
  const niv=document.getElementById('editNivel').value.trim();
  if(!nom||!area||!niv){alert('Campos vacíos');return;}
  await supabase.from('estudiantes').update({nombre_completo:nom,area_academica:area,nivel:niv}).eq('cedula',estudianteEditando.cedula);
  alert('Actualizado'); estudianteEditando=null;
  document.getElementById('editForm').classList.add('hidden');
  await cargarListaEstudiantes(); await cargarReportes();
}
document.getElementById('btnGuardarEdicion').onclick=guardarEdicion;

document.getElementById('btnEliminarEstudiante').onclick=async()=>{
  if(!confirm('Eliminar?'))return;
  await supabase.from('asistencias').delete().eq('cedula',estudianteEditando.cedula);
  await supabase.from('estudiantes').delete().eq('cedula',estudianteEditando.cedula);
  alert('Eliminado'); estudianteEditando=null;
  document.getElementById('editForm').classList.add('hidden');
  await cargarListaEstudiantes(); await cargarReportes();
};

document.getElementById('btnCancelarEdicion').onclick=()=>{ estudianteEditando=null; document.getElementById('editForm').classList.add('hidden'); };

// Reportes
async function cargarReportes(){
  const {data:as, error}=await supabase.from('asistencias').select('*'); if(error){alert('Error');return;}
  const m={}; as.forEach(a=>{m[a.cedula]=m[a.cedula]||new Set(); m[a.cedula].add(a.fecha);});
  reportesFiltrados=estudiantesCache.map(e=>({cedula:e.cedula,nombre_completo:e.nombre_completo,dias:m[e.cedula]?.size||0,fechas:Array.from(m[e.cedula]||[]).join(', ')}));
  mostrarReportes(reportesFiltrados);
}
function mostrarReportes(d){const t=document.getElementById('tblReportes');t.innerHTML=''; d.forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.cedula}</td><td>${r.nombre_completo}</td><td>${r.dias}</td><td>${r.fechas}</td>`; t.appendChild(tr); }); }

document.getElementById('btnFiltrarDias').onclick=()=>{
  const d=parseInt(document.getElementById('filtroDias').value); if(isNaN(d)){alert('Días?');return;} mostrarReportes(reportesFiltrados.filter(x=>x.dias<d));
};

document.getElementById('btnFiltrarCedulaReporte').onclick=()=>{
  const c=document.getElementById('filtroCedulaReporte').value.trim(); mostrarReportes(c?reportesFiltrados.filter(x=>x.cedula.includes(c)):reportesFiltrados);
};

document.getElementById('btnDescargarTodos').onclick=()=>{
  const wb=XLSX.utils.book_new(); const ws=XLSX.utils.json_to_sheet(reportesFiltrados);
  XLSX.utils.book_append_sheet(wb,ws,'Reporte'); XLSX.writeFile(wb,'Reporte_Asistencia.xlsx');
};

// QR Asistencia
async function registrarAsistencia(c){
  const e=estudiantesCache.find(x=>x.cedula===c); if(!e){showModal('No existe');return;}
  const hoy=new Date().toISOString().slice(0,10);
  const {data:ex}=await supabase.from('asistencias').select('*').eq('cedula',c).eq('fecha',hoy);
  if(ex.length){showModal('Ya registrada');return;} await supabase.from('asistencias').insert({cedula:c,fecha:hoy,hora:new Date().toLocaleTimeString(),area_academica:e.area_academica,nivel:e.nivel});
  showModal(`Registrada: ${e.nombre_completo}`);
  await cargarReportes();
}

// PDF QRs
async function generarQRPdf(){ const doc=new jsPDF({unit:'cm',format:[21,29.7]}); let x=1,y=1;
 for(const e of estudiantesCache){ const canvas=document.createElement('canvas'); await QRCode.toCanvas(canvas,e.cedula,{width:200});
  doc.addImage(canvas.toDataURL(),'PNG',x,y,6,6); doc.text(e.cedula,x,y+6.5); doc.text(e.nombre_completo,x,y+7.2);
  x+=7; if(x>14){x=1; y+=8; if(y>20){doc.addPage(); y=1;}} }
 doc.save('QRCodes.pdf'); }

document.getElementById('btnGenerarQRPdf').onclick=generarQRPdf;

// Lector QR
async function iniciarLectorQR(){ html5QrCode=new Html5Qrcode('reader'); await html5QrCode.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:250}},msg=>registrarAsistencia(msg.trim())); }
async function detenerLectorQR(){ if(html5QrCode) await html5QrCode.stop(); }

// Navegación pestañas
function setupTabs(){ document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{ document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); const id=t.dataset.tab; document.querySelectorAll('.tab-content').forEach(c=>c.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); if(id==='asistencia') iniciarLectorQR(); else detenerLectorQR(); }); }

// Inicio
window.onload=async()=>{ setupTabs(); iniciarLectorQR(); await cargarListaEstudiantes(); await cargarReportes(); };
