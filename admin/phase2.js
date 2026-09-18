
(() => {
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(v||0)) + ' MAD';
  const fmtDate = v => !v ? '—' : new Intl.DateTimeFormat('fr-FR',{dateStyle:'short'}).format(new Date(v+'T12:00:00'));
  const toast = msg => {
    const t = q('#toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  };
  async function api(path, opts={}) {
    const res = await fetch(path, {
      ...opts,
      headers: {
        ...(opts.body ? {'Content-Type':'application/json'} : {}),
        ...(opts.headers || {})
      }
    });
    if (res.status === 401) { location.href='/admin/login'; throw new Error('Session expirée'); }
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || 'Erreur');
    return data;
  }
  function openModal(id){ q('#'+id)?.classList.add('open'); }
  function closeModal(id){ q('#'+id)?.classList.remove('open'); }
  function statusTag(s){
    const map = {
      paid:['Payé','tag'], deposit:['Acompte','tag pending'], planned:['Prévu','tag pending'],
      booked:['Réservé','tag'], discussing:['En discussion','tag pending'], prospect:['À contacter','tag pending'],
      done:['Terminé','tag'], doing:['En cours','tag pending'], todo:['À faire','tag pending']
    };
    const x = map[s] || [s || '—','tag pending'];
    return '<span class="'+x[1]+'">'+esc(x[0])+'</span>';
  }

  const style = document.createElement('style');
  style.textContent = \`
    .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .vendor-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .vendor-card h3{margin:7px 0 6px}.vendor-card p{font-size:12px;color:var(--muted);line-height:1.6}
    .timeline{display:grid;gap:10px}.event{display:grid;grid-template-columns:90px 1fr auto;gap:14px;align-items:start;border:1px solid var(--line);border-radius:16px;background:#fff;padding:14px}
    .event .time{font-weight:800;color:var(--gold)}.event small{color:var(--muted);display:block;margin-top:4px}
    @media(max-width:980px){.grid3,.vendor-grid{grid-template-columns:1fr 1fr}}
    @media(max-width:640px){.grid3,.vendor-grid{grid-template-columns:1fr}.event{grid-template-columns:60px 1fr}.event .row-actions{grid-column:2}}
  \`;
  document.head.appendChild(style);

  q('#budget').innerHTML = \`
    <div class="section-title"><h2>Budget</h2><button class="primary" id="newBudgetBtn">+ Ajouter une dépense</button></div>
    <div class="grid3" style="margin-bottom:18px">
      <div class="card metric"><div class="label">Prévu</div><div class="value" id="budgetPlanned">—</div><div class="hint">MAD</div></div>
      <div class="card metric"><div class="label">Payé</div><div class="value" id="budgetPaid">—</div><div class="hint">MAD</div></div>
      <div class="card metric"><div class="label">Reste</div><div class="value" id="budgetRemaining">—</div><div class="hint">MAD</div></div>
    </div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Catégorie</th><th>Dépense</th><th>Prestataire</th><th>Prévu</th><th>Payé</th><th>Échéance</th><th>Statut</th><th></th></tr></thead><tbody id="budgetRows"></tbody></table></div>
  \`;
  q('#vendors').innerHTML = \`
    <div class="section-title"><h2>Prestataires</h2><button class="primary" id="newVendorBtn">+ Ajouter un prestataire</button></div>
    <div class="vendor-grid" id="vendorGrid"></div>
  \`;
  q('#tasks').innerHTML = \`
    <div class="section-title"><h2>Tâches</h2><button class="primary" id="newTaskBtn">+ Nouvelle tâche</button></div>
    <div class="toolbar">
      <select id="taskOwnerFilter"><option value="all">Tous les responsables</option><option>Fatima</option><option>Morwane</option><option>Fatine</option><option>Ensemble</option></select>
      <select id="taskStatusFilter"><option value="all">Tous les statuts</option><option value="todo">À faire</option><option value="doing">En cours</option><option value="done">Terminé</option></select>
    </div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Tâche</th><th>Responsable</th><th>Priorité</th><th>Échéance</th><th>Statut</th><th></th></tr></thead><tbody id="taskRows"></tbody></table></div>
  \`;
  q('#program').innerHTML = \`
    <div class="section-title"><h2>Programme</h2><button class="primary" id="newProgramBtn">+ Ajouter un moment</button></div>
    <div class="toolbar"><select id="programDayFilter"><option value="all">Les deux jours</option><option value="25">25 mai</option><option value="26">26 mai</option></select></div>
    <div class="timeline" id="programList"></div>
  \`;

  document.body.insertAdjacentHTML('beforeend', \`
    <div class="modal" id="budgetModal"><div class="modal-card"><div class="modal-head"><h2>Ajouter une dépense</h2><button data-x="budgetModal">×</button></div><form id="budgetForm"><div class="form-grid">
      <div class="field"><label>Catégorie</label><input name="category" required placeholder="Traiteur, lieu, photo…"></div>
      <div class="field"><label>Dépense</label><input name="item_name" required></div>
      <div class="field"><label>Prestataire</label><input name="vendor_name"></div>
      <div class="field"><label>Statut</label><select name="status"><option value="planned">Prévu</option><option value="deposit">Acompte</option><option value="paid">Payé</option></select></div>
      <div class="field"><label>Montant prévu (MAD)</label><input type="number" min="0" step="0.01" name="planned_amount" value="0"></div>
      <div class="field"><label>Montant payé (MAD)</label><input type="number" min="0" step="0.01" name="paid_amount" value="0"></div>
      <div class="field"><label>Échéance</label><input type="date" name="due_date"></div>
      <div class="field full"><label>Notes</label><textarea name="notes"></textarea></div>
    </div><div class="modal-actions"><button type="button" class="secondary" data-x="budgetModal">Annuler</button><button class="primary">Ajouter</button></div></form></div></div>

    <div class="modal" id="vendorModal"><div class="modal-card"><div class="modal-head"><h2>Ajouter un prestataire</h2><button data-x="vendorModal">×</button></div><form id="vendorForm"><div class="form-grid">
      <div class="field"><label>Catégorie</label><input name="category" required></div><div class="field"><label>Nom</label><input name="name" required></div>
      <div class="field"><label>Contact</label><input name="contact_name"></div><div class="field"><label>Téléphone</label><input name="phone"></div>
      <div class="field"><label>Email</label><input type="email" name="email"></div><div class="field"><label>Statut</label><select name="status"><option value="prospect">À contacter</option><option value="discussing">En discussion</option><option value="booked">Réservé</option></select></div>
      <div class="field full"><label>Notes</label><textarea name="notes"></textarea></div>
    </div><div class="modal-actions"><button type="button" class="secondary" data-x="vendorModal">Annuler</button><button class="primary">Ajouter</button></div></form></div></div>

    <div class="modal" id="taskModal"><div class="modal-card"><div class="modal-head"><h2>Nouvelle tâche</h2><button data-x="taskModal">×</button></div><form id="taskForm"><div class="form-grid">
      <div class="field full"><label>Tâche</label><input name="title" required></div><div class="field"><label>Responsable</label><select name="owner"><option>Fatima</option><option>Morwane</option><option>Fatine</option><option>Ensemble</option></select></div>
      <div class="field"><label>Priorité</label><select name="priority"><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option></select></div>
      <div class="field"><label>Échéance</label><input type="date" name="due_date"></div><div class="field"><label>Statut</label><select name="status"><option value="todo">À faire</option><option value="doing">En cours</option><option value="done">Terminé</option></select></div>
      <div class="field full"><label>Notes</label><textarea name="notes"></textarea></div>
    </div><div class="modal-actions"><button type="button" class="secondary" data-x="taskModal">Annuler</button><button class="primary">Ajouter</button></div></form></div></div>

    <div class="modal" id="programModal"><div class="modal-card"><div class="modal-head"><h2>Ajouter au programme</h2><button data-x="programModal">×</button></div><form id="programForm"><div class="form-grid">
      <div class="field"><label>Jour</label><select name="day"><option value="25">25 mai</option><option value="26">26 mai</option></select></div><div class="field"><label>Heure</label><input type="time" name="time" required></div>
      <div class="field full"><label>Moment</label><input name="title" required></div><div class="field"><label>Type</label><input name="type"></div>
      <div class="field"><label>Lieu</label><input name="location"></div><div class="field full"><label>Notes</label><textarea name="notes"></textarea></div>
    </div><div class="modal-actions"><button type="button" class="secondary" data-x="programModal">Annuler</button><button class="primary">Ajouter</button></div></form></div></div>
  \`);
  qa('[data-x]').forEach(b => b.onclick = () => closeModal(b.dataset.x));

  const phase = {budget:[],vendors:[],tasks:[],program:[]};

  async function loadBudget(){
    const d=await api('/api/admin/budget'); phase.budget=d.items||[];
    q('#budgetPlanned').textContent=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(d.summary?.planned||0);
    q('#budgetPaid').textContent=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(d.summary?.paid||0);
    q('#budgetRemaining').textContent=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(d.summary?.remaining||0);
    const rows=q('#budgetRows');
    rows.innerHTML=phase.budget.length?phase.budget.map(x=>\`<tr><td>\${esc(x.category)}</td><td><strong>\${esc(x.item_name)}</strong></td><td>\${esc(x.vendor_name||'—')}</td><td>\${money(x.planned_amount)}</td><td>\${money(x.paid_amount)}</td><td>\${fmtDate(x.due_date)}</td><td>\${statusTag(x.status)}</td><td><button class="danger" data-delbudget="\${x.id}">Supprimer</button></td></tr>\`).join(''):'<tr><td colspan="8"><div class="empty">Aucune dépense enregistrée.</div></td></tr>';
    qa('[data-delbudget]').forEach(b=>b.onclick=()=>deleteBudget(Number(b.dataset.delbudget)));
  }
  q('#newBudgetBtn').onclick=()=>openModal('budgetModal');
  q('#budgetForm').onsubmit=async e=>{e.preventDefault();await api('/api/admin/budget',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal('budgetModal');e.target.reset();await loadBudget();toast('Dépense ajoutée')};
  async function deleteBudget(id){if(!confirm('Supprimer cette dépense ?'))return;await api('/api/admin/budget/'+id,{method:'DELETE'});await loadBudget();toast('Dépense supprimée')}

  async function loadVendors(){
    const d=await api('/api/admin/vendors'); phase.vendors=d.items||[]; const grid=q('#vendorGrid');
    grid.innerHTML=phase.vendors.length?phase.vendors.map(v=>\`<div class="card vendor-card"><div class="eyebrow">\${esc(v.category)}</div><h3>\${esc(v.name)}</h3><p>\${esc(v.notes||'Aucune note')}</p><div style="display:grid;gap:6px;font-size:11px;color:var(--muted)">\${statusTag(v.status)}<span>\${esc(v.contact_name||'')}</span><span>\${esc(v.phone||v.email||'')}</span></div><div class="row-actions" style="margin-top:14px"><button class="danger" data-delvendor="\${v.id}">Supprimer</button></div></div>\`).join(''):'<div class="card empty">Aucun prestataire enregistré.</div>';
    qa('[data-delvendor]').forEach(b=>b.onclick=()=>deleteVendor(Number(b.dataset.delvendor)));
  }
  q('#newVendorBtn').onclick=()=>openModal('vendorModal');
  q('#vendorForm').onsubmit=async e=>{e.preventDefault();await api('/api/admin/vendors',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal('vendorModal');e.target.reset();await loadVendors();toast('Prestataire ajouté')};
  async function deleteVendor(id){if(!confirm('Supprimer ce prestataire ?'))return;await api('/api/admin/vendors/'+id,{method:'DELETE'});await loadVendors();toast('Prestataire supprimé')}

  function renderTasks(){
    const o=q('#taskOwnerFilter').value,s=q('#taskStatusFilter').value,list=phase.tasks.filter(t=>(o==='all'||t.owner===o)&&(s==='all'||t.status===s)),rows=q('#taskRows');
    rows.innerHTML=list.length?list.map(t=>\`<tr><td><strong>\${esc(t.title)}</strong><div style="font-size:11px;color:var(--muted);margin-top:3px">\${esc(t.notes||'')}</div></td><td>\${esc(t.owner||'—')}</td><td>\${esc(({normal:'Normale',high:'Haute',urgent:'Urgente'}[t.priority]||t.priority||'—'))}</td><td>\${fmtDate(t.due_date)}</td><td><select data-taskstatus="\${t.id}" style="border:1px solid var(--line);border-radius:10px;padding:7px"><option value="todo" \${t.status==='todo'?'selected':''}>À faire</option><option value="doing" \${t.status==='doing'?'selected':''}>En cours</option><option value="done" \${t.status==='done'?'selected':''}>Terminé</option></select></td><td><button class="danger" data-deltask="\${t.id}">Supprimer</button></td></tr>\`).join(''):'<tr><td colspan="6"><div class="empty">Aucune tâche.</div></td></tr>';
    qa('[data-taskstatus]').forEach(s=>s.onchange=()=>updateTask(Number(s.dataset.taskstatus),s.value)); qa('[data-deltask]').forEach(b=>b.onclick=()=>deleteTask(Number(b.dataset.deltask)));
  }
  async function loadTasks(){const d=await api('/api/admin/tasks');phase.tasks=d.items||[];renderTasks()}
  q('#taskOwnerFilter').onchange=renderTasks;q('#taskStatusFilter').onchange=renderTasks;q('#newTaskBtn').onclick=()=>openModal('taskModal');
  q('#taskForm').onsubmit=async e=>{e.preventDefault();await api('/api/admin/tasks',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal('taskModal');e.target.reset();await loadTasks();toast('Tâche ajoutée')};
  async function updateTask(id,status){await api('/api/admin/tasks/'+id,{method:'PATCH',body:JSON.stringify({status})});await loadTasks();toast('Tâche mise à jour')}
  async function deleteTask(id){if(!confirm('Supprimer cette tâche ?'))return;await api('/api/admin/tasks/'+id,{method:'DELETE'});await loadTasks();toast('Tâche supprimée')}

  function renderProgram(){
    const day=q('#programDayFilter').value,list=phase.program.filter(x=>day==='all'||String(x.day)===day),box=q('#programList');
    box.innerHTML=list.length?list.map(x=>\`<div class="event"><div class="time">\${esc(x.time)}</div><div><strong>\${esc(x.day)} mai · \${esc(x.title)}</strong><small>\${esc([x.type,x.location].filter(Boolean).join(' · '))}</small><small>\${esc(x.notes||'')}</small></div><div class="row-actions"><button class="danger" data-delprogram="\${x.id}">Supprimer</button></div></div>\`).join(''):'<div class="card empty">Aucun moment au programme.</div>';
    qa('[data-delprogram]').forEach(b=>b.onclick=()=>deleteProgram(Number(b.dataset.delprogram)));
  }
  async function loadProgram(){const d=await api('/api/admin/program');phase.program=d.items||[];renderProgram()}
  q('#programDayFilter').onchange=renderProgram;q('#newProgramBtn').onclick=()=>openModal('programModal');
  q('#programForm').onsubmit=async e=>{e.preventDefault();await api('/api/admin/program',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal('programModal');e.target.reset();await loadProgram();toast('Programme mis à jour')};
  async function deleteProgram(id){if(!confirm('Supprimer ce moment ?'))return;await api('/api/admin/program/'+id,{method:'DELETE'});await loadProgram();toast('Moment supprimé')}

  Promise.all([loadBudget(),loadVendors(),loadTasks(),loadProgram()]).catch(err=>toast(err.message));
})();