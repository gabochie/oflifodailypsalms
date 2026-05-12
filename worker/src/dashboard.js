export function renderDashboard(d) {
  const recentRows = (d.recent || []).map(s =>
    `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.phone)}</td><td style="color:#999;font-size:12px">${esc(s.created_at)}</td></tr>`
  ).join('');

  const campaignRows = (d.campaigns || []).map(c => {
    const failed = c.failed > 0 ? `<span style="color:#dc3545;font-weight:600">${c.failed}</span>` : '0';
    return `<tr>
      <td style="color:#999;font-size:12px">${esc(c.created_at)}</td>
      <td><span class="badge bg-success">${esc(c.channel)}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.subject || c.message.slice(0,40) + '...')}</td>
      <td>${c.sent}/${c.total}</td>
      <td>${failed}</td>
      <td><button class="btn btn-outline-secondary btn-sm" onclick="window.open('/api/campaign/${c.id}')">Details</button></td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OFLIFO — Admin Dashboard</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<style>
:root { --sidebar-width: 250px; --brand: #2d6a4f; --brand-dark: #1b4332; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, sans-serif; background: #f5f7fa; overflow-x: hidden; }
.sidebar { position:fixed; top:0; left:0; width:var(--sidebar-width); height:100vh; background:var(--brand-dark); color:#fff; z-index:100; display:flex; flex-direction:column; transition:transform .3s; }
.sidebar-brand { padding:20px 20px 16px; border-bottom:1px solid rgba(255,255,255,.1); }
.sidebar-brand h1 { font-size:20px; margin:0; font-weight:700; }
.sidebar-brand small { font-size:11px; opacity:.6; text-transform:uppercase; letter-spacing:1px; }
.sidebar-nav { flex:1; padding:12px 0; overflow-y:auto; }
.sidebar-nav a { display:flex; align-items:center; gap:12px; padding:10px 20px; color:rgba(255,255,255,.7); text-decoration:none; font-size:14px; transition:all .15s; cursor:pointer; border:none; background:none; width:100%; text-align:left; }
.sidebar-nav a:hover, .sidebar-nav a.active { background:rgba(255,255,255,.1); color:#fff; }
.sidebar-nav a.active { border-right:3px solid #fff; }
.sidebar-nav a i { font-size:18px; width:22px; text-align:center; }
.sidebar-footer { padding:16px 20px; border-top:1px solid rgba(255,255,255,.1); font-size:12px; opacity:.5; text-align:center; }
.main { margin-left:var(--sidebar-width); min-height:100vh; }
.topbar { background:#fff; padding:14px 28px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 1px 3px rgba(0,0,0,.06); position:sticky; top:0; z-index:99; }
.topbar span { font-size:18px; font-weight:600; }
.topbar .badge { background:var(--brand); color:#fff; padding:4px 12px; border-radius:20px; font-size:12px; }
.page { padding:24px 28px; }
.page-section { display:none; }
.page-section.active { display:block; }
.stat-card { background:#fff; border-radius:12px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,.06); transition:transform .15s; border:1px solid #eee; }
.stat-card:hover { transform:translateY(-2px); }
.stat-card .num { font-size:30px; font-weight:700; line-height:1.2; }
.stat-card .num.green { color:var(--brand); } .stat-card .num.blue { color:#1c7ed6; } .stat-card .num.purple { color:#7c3aed; } .stat-card .num.orange { color:#ea580c; }
.stat-card .label { font-size:12px; color:#888; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
.stat-card .sub { font-size:12px; color:#aaa; }
.content-card { background:#fff; border-radius:12px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,.06); border:1px solid #eee; }
.content-card h3 { font-size:14px; font-weight:600; color:#555; text-transform:uppercase; letter-spacing:.5px; margin-bottom:16px; }
.content-table { width:100%; border-collapse:collapse; font-size:13px; }
.content-table th { color:#888; font-weight:600; font-size:11px; text-transform:uppercase; padding:10px 8px; border-bottom:2px solid #eee; text-align:left; }
.content-table td { padding:10px 8px; border-bottom:1px solid #f0f0f0; vertical-align:middle; }
.content-table tr:hover td { background:#fafbfc; }
.chart-wrap { max-height:240px; position:relative; }
.form-control:focus, .form-select:focus { border-color:var(--brand); box-shadow:0 0 0 3px rgba(45,106,79,.15); }
.btn-brand { background:var(--brand); color:#fff; border:none; }
.btn-brand:hover { background:var(--brand-dark); color:#fff; }
.btn-outline-brand { border-color:var(--brand); color:var(--brand); }
.btn-outline-brand:hover { background:var(--brand); color:#fff; }
.empty-state { text-align:center; padding:40px 20px; color:#999; }
.empty-state i { font-size:40px; margin-bottom:12px; display:block; color:#ddd; }
.empty-state p { margin:0; font-size:14px; }
.toast-container { position:fixed; top:16px; right:16px; z-index:9999; }
.bulk-bar { background:#f8f9fa; padding:10px 16px; border-radius:8px; display:flex; align-items:center; gap:12px; font-size:13px; margin-bottom:12px; }
.mobile-toggle { display:none; background:none; border:none; color:#333; font-size:24px; padding:4px; cursor:pointer; }
@media (max-width:768px) {
  .sidebar { transform:translateX(-100%); }
  .sidebar.show { transform:translateX(0); }
  .main { margin-left:0; }
  .mobile-toggle { display:block; }
  .page { padding:16px; }
  .topbar { padding:12px 16px; }
}
</style>
</head>
<body>
<div class="sidebar" id="sidebar">
  <div class="sidebar-brand"><h1><i class="bi bi-book"></i> OFLIFO</h1><small>Admin Dashboard</small></div>
  <nav class="sidebar-nav">
    <a class="active" data-section="section-dashboard"><i class="bi bi-speedometer2"></i> Dashboard</a>
    <a data-section="section-signups"><i class="bi bi-people"></i> Signups</a>
    <a data-section="section-contacts"><i class="bi bi-person-lines-fill"></i> Contacts</a>
    <a data-section="section-campaign"><i class="bi bi-send"></i> Send Campaign</a>
    <a data-section="section-uploads"><i class="bi bi-upload"></i> Uploads</a>
    <a data-section="section-history"><i class="bi bi-clock-history"></i> Campaign History</a>
    <a data-section="section-roadmap"><i class="bi bi-signpost-2"></i> Roadmap</a>
  </nav>
  <div class="sidebar-footer">OFLIFO &mdash; Daily Psalms</div>
</div>
<div class="main">
  <div class="topbar">
    <div><button class="mobile-toggle" onclick="document.getElementById('sidebar').classList.toggle('show')"><i class="bi bi-list"></i></button><span id="page-title">Dashboard</span></div>
    <span class="badge">Live</span>
  </div>
  <div class="page">
    <div id="toast-container" class="toast-container"></div>

    <div id="section-dashboard" class="page-section active">
      <div class="row g-3 mb-4">
        <div class="col-lg-3 col-6"><div class="stat-card"><div class="label"><i class="bi bi-person-plus"></i> Signups</div><div class="num green">${d.total_signups}</div><div class="sub">+${d.today_signups} today</div></div></div>
        <div class="col-lg-3 col-6"><div class="stat-card"><div class="label"><i class="bi bi-eye"></i> Page Views</div><div class="num blue">${d.total_views}</div><div class="sub">+${d.today_views} today</div></div></div>
        <div class="col-lg-3 col-6"><div class="stat-card"><div class="label"><i class="bi bi-upload"></i> Uploaded</div><div class="num purple">${d.total_contacts}</div><div class="sub">contacts</div></div></div>
        <div class="col-lg-3 col-6"><div class="stat-card"><div class="label"><i class="bi bi-send"></i> Campaigns</div><div class="num orange">${d.total_campaigns}</div><div class="sub">sent</div></div></div>
      </div>
      <div class="content-card"><h3>Signups (Last 7 Days)</h3><div class="chart-wrap"><canvas id="signupChart"></canvas></div></div>
    </div>

    <div id="section-signups" class="page-section">
      <div class="content-card">
        <h3>Recent Signups
          <span style="font-weight:normal;text-transform:none;font-size:13px;color:#888">&nbsp;·&nbsp; <span id="unsynced-count">${d.unsynced}</span> not yet in contacts</span>
          <button class="btn btn-sm btn-outline-brand float-end" onclick="promoteSignups()" id="promote-btn"><i class="bi bi-arrow-right-circle"></i> Promote All to Contacts</button>
        </h3>
        ${d.recent.length ? '<table class="content-table"><thead><tr><th>Name</th><th>Phone</th><th>Date</th></tr></thead><tbody>' + recentRows + '</tbody></table>' : '<div class="empty-state"><i class="bi bi-inbox"></i><p>No signups yet.</p></div>'}
      </div>
    </div>

    <div id="section-contacts" class="page-section">
      <div class="content-card mb-3">
        <h3>Upload CSV</h3>
        <form id="upload-form" class="row g-2 align-items-end">
          <div class="col-auto"><input type="file" id="csv-file" accept=".csv" class="form-control form-control-sm" required></div>
          <div class="col-auto"><button class="btn btn-brand btn-sm" type="submit"><i class="bi bi-cloud-upload"></i> Upload</button></div>
        </form>
        <div id="upload-status" class="mt-2"></div>
      </div>
      <div class="content-card">
        <h3>All Contacts</h3>
        <div class="row mb-3"><div class="col-auto"><input type="text" id="contact-search" class="form-control form-control-sm" placeholder="Search..." oninput="loadContacts()" style="width:220px"></div></div>
        <div id="bulk-bar" class="bulk-bar" style="display:none"><span id="selected-count">0 selected</span><button class="btn btn-outline-danger btn-sm" onclick="deleteSelected()"><i class="bi bi-trash"></i> Delete</button></div>
        <div id="contacts-table-wrap"><div class="empty-state"><i class="bi bi-hourglass-split"></i><p>Loading...</p></div></div>
      </div>
    </div>

    <div id="section-campaign" class="page-section">
      <div class="content-card">
        <h3>New Campaign</h3>
        <div class="row g-3">
          <div class="col-md-4"><label class="form-label">Channel</label><select id="campaign-channel" class="form-select form-select-sm"><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></div>
          <div class="col-md-8" id="subject-group"><label class="form-label">Subject (email only)</label><input type="text" id="campaign-subject" class="form-control form-control-sm" placeholder="Amazing Daily Psalms"></div>
          <div class="col-12"><label class="form-label">Message</label><textarea id="campaign-message" class="form-control" rows="5">Hi [Name],\\n\\nI wanted to share OFLIFO with you. Each day you'll receive a psalm verse straight to your phone.\\n\\nSign up here: https://oflifo.org\\n\\nGod bless!</textarea></div>
          <div class="col-12"><label class="form-label">Send to <strong id="send-count">0</strong> contacts</label><div id="campaign-contact-list" style="max-height:200px;overflow-y:auto;border:1px solid #dee2e6;border-radius:8px;padding:8px;background:#fafbfc"></div></div>
          <div class="col-12"><button class="btn btn-brand" onclick="sendCampaign()" id="send-btn"><i class="bi bi-send"></i> Send Campaign</button></div>
        </div>
      </div>
    </div>

    <div id="section-uploads" class="page-section">
      <div class="content-card"><h3>Upload History</h3><div id="upload-history-wrap"><div class="empty-state"><i class="bi bi-hourglass-split"></i><p>Loading...</p></div></div></div>
    </div>

    <div id="section-history" class="page-section">
      <div class="content-card">
        <h3>Campaign History</h3>
        ${d.campaigns.length ? '<table class="content-table"><thead><tr><th>Date</th><th>Channel</th><th>Message</th><th>Sent</th><th>Failed</th><th></th></tr></thead><tbody>' + campaignRows + '</tbody></table>' : '<div class="empty-state"><i class="bi bi-inbox"></i><p>No campaigns sent yet.</p></div>'}
      </div>
    </div>

    <div id="section-roadmap" class="page-section">
      <div class="content-card">
        <h3>Feature Build Checklist</h3>
        <p style="color:#888;font-size:13px;margin-bottom:20px">Features planned to enhance user experience and encourage donations. Update status as you go.</p>
        <div style="display:grid;gap:12px" id="roadmap-list"></div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;font-size:13px;color:#888">
          <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ddd;vertical-align:middle;margin-right:4px"></span> Planned
          <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ffc107;vertical-align:middle;margin-right:4px;margin-left:12px"></span> In Progress
          <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#2d6a4f;vertical-align:middle;margin-right:4px;margin-left:12px"></span> Built
        </div>
      </div>
    </div>

  </div>
</div>
<script>
document.querySelectorAll('.sidebar-nav a').forEach(function(el) {
  el.addEventListener('click', function() {
    document.querySelectorAll('.sidebar-nav a').forEach(function(a){ a.classList.remove('active') });
    document.querySelectorAll('.page-section').forEach(function(s){ s.classList.remove('active') });
    el.classList.add('active');
    document.getElementById(el.dataset.section).classList.add('active');
    document.getElementById('page-title').textContent = el.textContent.trim();
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('show');
  });
});
function flash(m,t){var c=document.getElementById('toast-container'),o=document.createElement('div');o.className='toast align-items-center text-bg-'+(t==='error'?'danger':'success')+' border-0 show';o.setAttribute('role','alert');o.innerHTML='<div class="d-flex"><div class="toast-body">'+m+'</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';c.appendChild(o);setTimeout(function(){o.remove()},5000);}
function promoteSignups(){var b=document.getElementById('promote-btn');b.disabled=true;b.innerHTML='<span class="spinner-border spinner-border-sm"></span> Promoting...';fetch('/api/signups/promote',{method:'POST'}).then(function(r){return r.json()}).then(function(d){b.disabled=false;b.innerHTML='<i class="bi bi-arrow-right-circle"></i> Promote All to Contacts';if(d.ok){flash('Promoted '+d.promoted+' signup(s).',d.promoted>0?'success':'error');loadContacts();var e=document.getElementById('unsynced-count');if(e)e.textContent='0';}}).catch(function(){b.disabled=false;b.innerHTML='<i class="bi bi-arrow-right-circle"></i> Promote All to Contacts';flash('Promotion failed.','error');});}
var ctx=document.getElementById('signupChart').getContext('2d');new Chart(ctx,{type:'bar',data:{labels:${d.chart_labels},datasets:[{label:'Signups',data:${d.chart_data},backgroundColor:'#2d6a4f88',borderColor:'#2d6a4f',borderWidth:2,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false}}}}});
document.getElementById('upload-form').addEventListener('submit',function(e){e.preventDefault();var fd=new FormData();fd.append('file',document.getElementById('csv-file').files[0]);fetch('/api/contacts/upload',{method:'POST',body:fd}).then(function(r){return r.json()}).then(function(d){var st=document.getElementById('upload-status');if(d.error){st.innerHTML='<div class="alert alert-danger py-2 mb-0">'+d.error+'</div>';}else{var h='<div class="alert alert-success py-2 mb-0">Uploaded <strong>'+d.inserted+'</strong> contact(s).</div>';if(d.errors&&d.errors.length){h+='<div class="alert alert-warning py-2 mt-1 mb-0" style="font-size:13px"><strong>'+d.errors.length+' warning(s):</strong><ul class="mb-0 mt-1">';d.errors.forEach(function(e){h+='<li>Row '+e.row+': '+e.reason+'</li>';});h+='</ul></div>';}st.innerHTML=h;loadContacts();loadUploads();}});});
function loadContacts(){var q=document.getElementById('contact-search').value;fetch('/api/contacts?q='+encodeURIComponent(q)).then(function(r){return r.json()}).then(function(data){var wrap=document.getElementById('contacts-table-wrap');if(!data.length){wrap.innerHTML='<div class="empty-state"><i class="bi bi-inbox"></i><p>No contacts. Upload a CSV above.</p></div>';return;}var html='<table class="content-table"><thead><tr><th style="width:32px"><input type="checkbox" onchange="toggleAll(this)"></th><th>Name</th><th>Phone</th><th>Email</th><th>Date</th></tr></thead><tbody>';data.forEach(function(c){html+='<tr><td><input type="checkbox" class="contact-check" value="'+c.id+'" onchange="updateBulkBar()"></td><td><strong>'+esc(c.name)+'</strong></td><td>'+(c.phone||'<span style="color:#ccc">-</span>')+'</td><td>'+(c.email||'<span style="color:#ccc">-</span>')+'</td><td style="color:#999;font-size:12px">'+c.created_at+'</td></tr>';});html+='</tbody></table>';wrap.innerHTML=html;var cl=document.getElementById('campaign-contact-list');if(!data.length){cl.innerHTML='<div style="color:#999;padding:16px;text-align:center;font-size:13px">No contacts. Upload a CSV first.</div>';}else{var ch='';data.forEach(function(c){ch+='<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:13px;cursor:pointer;border-bottom:1px solid #f0f0f0"><input type="checkbox" class="campaign-check" value="'+c.id+'" onchange="updateSendCount()"> <strong>'+esc(c.name)+'</strong> <span style="color:#999">('+esc(c.phone||c.email||'')+')</span></label>';});cl.innerHTML=ch;}updateSendCount();});}
function esc(s){var d=document.createElement('div');d.appendChild(document.createTextNode(s));return d.innerHTML;}
function toggleAll(el){document.querySelectorAll('.contact-check').forEach(function(c){c.checked=el.checked;});updateBulkBar();}
function updateBulkBar(){var n=document.querySelectorAll('.contact-check:checked').length,bar=document.getElementById('bulk-bar');bar.style.display=n>0?'flex':'none';document.getElementById('selected-count').textContent=n+' selected';}
function updateSendCount(){document.getElementById('send-count').textContent=document.querySelectorAll('.campaign-check:checked').length;}
function deleteSelected(){var ids=[];document.querySelectorAll('.contact-check:checked').forEach(function(c){ids.push(parseInt(c.value));});if(!ids.length||!confirm('Delete '+ids.length+' contact(s)?'))return;fetch('/api/contacts/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids})}).then(function(r){return r.json()}).then(function(d){if(d.ok){flash('Deleted contacts.','success');loadContacts();}});}
document.getElementById('campaign-channel').addEventListener('change',function(){document.getElementById('subject-group').style.display=this.value==='email'?'block':'none';});
function sendCampaign(){var ids=[];document.querySelectorAll('.campaign-check:checked').forEach(function(c){ids.push(parseInt(c.value));});if(!ids.length){flash('Select at least one contact.','error');return;}var btn=document.getElementById('send-btn');btn.disabled=true;btn.innerHTML='<span class="spinner-border spinner-border-sm"></span> Sending...';fetch('/api/campaign/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:document.getElementById('campaign-channel').value,subject:document.getElementById('campaign-subject').value,message:document.getElementById('campaign-message').value,contact_ids:ids})}).then(function(r){return r.json()}).then(function(d){btn.disabled=false;btn.innerHTML='<i class="bi bi-send"></i> Send Campaign';if(d.error){flash(d.error,'error');}else{flash('Sent '+d.sent+'/'+d.total+' via '+d.channel+'. Failed: '+d.failed,d.failed?'error':'success');}}).catch(function(){btn.disabled=false;btn.innerHTML='<i class="bi bi-send"></i> Send Campaign';flash('Send failed.','error');});}
function viewCampaign(id){fetch('/api/campaign/'+id).then(function(r){return r.json()}).then(function(d){var h='<div class="mb-3 p-3 bg-light rounded"><strong>Channel:</strong> '+d.campaign.channel+'<br><strong>Subject:</strong> '+(d.campaign.subject||'-')+'<br><strong>Message:</strong> '+esc(d.campaign.message)+'</div><table class="content-table"><thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>Error</th></tr></thead><tbody>';d.recipients.forEach(function(r){var badge=r.status==='sent'?'bg-success':r.status==='failed'?'bg-danger':'bg-warning text-dark';h+='<tr><td>'+esc(r.name)+'</td><td>'+(r.phone||r.email||'')+'</td><td><span class="badge '+badge+'">'+r.status+'</span></td><td style="color:#dc3545;font-size:12px">'+(r.error||'')+'</td></tr>';});h+='</tbody></table>';var w=window.open('','_blank');w.document.write('<html><head><title>Campaign #'+id+'</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><style>body{padding:24px;font-family:system-ui;}</style></head><body>'+h+'</body></html>');});}
function loadUploads(){fetch('/api/uploads').then(function(r){return r.json()}).then(function(d){var wrap=document.getElementById('upload-history-wrap');if(!d.length){wrap.innerHTML='<div class="empty-state"><i class="bi bi-inbox"></i><p>No uploads yet.</p></div>';return;}var html='<table class="content-table"><thead><tr><th>File</th><th>Inserted</th><th>Errors</th><th>Date</th><th></th></tr></thead><tbody>';d.forEach(function(u){html+='<tr><td><strong>'+esc(u.filename)+'</strong></td><td>'+u.inserted+'</td><td>'+(u.error_count?'<span style="color:#dc3545">'+u.error_count+'</span>':'0')+'</td><td style="color:#999;font-size:12px">'+u.created_at+'</td><td><button class="btn btn-outline-secondary btn-sm" onclick="viewUpload('+u.id+')">View</button></td></tr>';});html+='</tbody></table>';wrap.innerHTML=html;});}
function viewUpload(id){fetch('/api/uploads/'+id).then(function(r){return r.json()}).then(function(d){var h='<div class="mb-3 p-3 bg-light rounded"><strong>File:</strong> '+esc(d.filename)+'<br><strong>Inserted:</strong> '+d.inserted+'<br><strong>Errors:</strong> '+d.errors.length+'</div>';if(d.errors.length){h+='<table class="content-table"><thead><tr><th>Row</th><th>Reason</th></tr></thead><tbody>';d.errors.forEach(function(e){h+='<tr><td>'+e.row+'</td><td>'+esc(e.reason)+'</td></tr>';});h+='</tbody></table>';}else{h+='<div class="alert alert-success py-2">No errors.</div>';}var w=window.open('','_blank');w.document.write('<html><head><title>Upload #'+id+'</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><style>body{padding:24px;font-family:system-ui;}</style></head><body>'+h+'</body></html>');});}
var roadmap=[{feature:"Share buttons",desc:"WhatsApp, Twitter, Facebook share for each daily psalm",status:"planned"},{feature:"Testimonials wall",desc:"Users share how the psalms helped them",status:"planned"},{feature:"Prayer requests",desc:"Allow people to submit prayer requests",status:"planned"},{feature:"Audio psalms",desc:"Listen to the daily verse instead of reading",status:"planned"},{feature:"Progress tracker",desc:"Day 45 of 150 - shows commitment",status:"planned"},{feature:"Subscriber count",desc:"Social proof to encourage signups",status:"planned"},{feature:"Weekly digest",desc:"Email option for weekly psalms",status:"planned"},{feature:"Donation goal bar",desc:"Visual progress toward monthly target",status:"planned"},{feature:"Verse art generator",desc:"Shareable image of daily verse",status:"planned"}];
function renderRoadmap(){var html='';roadmap.forEach(function(item,i){var c={planned:'#ddd','in progress':'#ffc107',built:'#2d6a4f'}[item.status]||'#ddd';html+='<div style="background:#f8f9fa;border-radius:10px;padding:16px 20px;display:flex;align-items:center;gap:16px"><span style="width:14px;height:14px;border-radius:50%;background:'+c+';flex-shrink:0"></span><div style="flex:1"><strong style="font-size:14px">'+esc(item.feature)+'</strong><br><span style="font-size:12px;color:#888">'+esc(item.desc)+'</span></div><select class="form-select form-select-sm" style="width:130px" onchange="roadmap['+i+'].status=this.value;renderRoadmap()"><option value="planned"'+(item.status==='planned'?' selected':'')+'>Planned</option><option value="in progress"'+(item.status==='in progress'?' selected':'')+'>In Progress</option><option value="built"'+(item.status==='built'?' selected':'')+'>Built</option></select></div>';});document.getElementById('roadmap-list').innerHTML=html;}
renderRoadmap();
loadContacts();loadUploads();
</script>
</body>
</html>`;
}
