const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { init, db } = require("../backend/db");
const { createUser, authenticateUser, deleteUser } = require("./userService");
const {
  saveFilterConfig,
  loadUserConfigs,
  updateFilterConfig,
  deleteFilterConfig,
} = require("../backend/filtersService");
const IAAIBot = require("../backend/bot");

const app = express();

app.use(bodyParser.json());
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  })
);
To: filters?.max_bid ?? 150000, init();

const bots = new Map();

// Root page: interactive UI with auth, filters and bot controls
app.get("/", (req, res) => {
  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>IAAI - Web UI (API)</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;padding:20px;background:#f5f7fb}
      .container{max-width:980px;margin:0 auto;background:#fff;padding:18px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.06)}
      h1{margin-top:0}
      label{display:block;font-weight:600;margin-bottom:6px}
      input,select,textarea{width:100%;padding:8px;border:1px solid #dcdfe6;border-radius:6px;box-sizing:border-box}
      button{padding:8px 12px;border-radius:6px;border:none;background:#2563eb;color:#fff;cursor:pointer}
      button.secondary{background:#6b7280}
      .small{padding:6px 8px;font-size:14px}
      .controls{display:flex;gap:8px;align-items:center}
      pre{background:#f8fafc;padding:12px;border-radius:6px;overflow:auto}
      .filters{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
      .toast{position:fixed;right:20px;bottom:20px;min-width:220px;padding:12px 16px;border-radius:8px;color:#fff;display:none;box-shadow:0 8px 24px rgba(2,6,23,0.2);z-index:9999}
      .toast.show{display:block;opacity:0;animation:toast-in 0.18s ease forwards}
      .toast.success{background:#16a34a}
      .toast.error{background:#ef4444}
      /* Password toggle styles */
      .password-wrapper { position: relative; display: flex; align-items: center }
      .password-wrapper input { padding-right: 36px }
      .password-toggle { position: absolute; right: 8px; background: transparent; border: none; cursor: pointer; height: 28px; width: 28px; display: inline-flex; align-items: center; justify-content: center }
      .password-toggle svg { display: block }
      @keyframes toast-in{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}
    </style>
  </head>
  <body>
    <div class="container">
      <h1>IAAI - Quick UI</h1>

      <section style="margin-bottom:14px">
        <div class="controls">
          <div id="auth-status">Not signed in</div>
          <button id="btn-show-signin" class="small secondary">Sign In</button>
          <button id="btn-show-signup" class="small">Sign Up</button>
          <button id="btn-signout" class="small secondary" style="display:none">Sign Out</button>
          <button id="btn-delete-account" class="small" style="display:none;background:#ef4444">Delete Account</button>
        </div>
      </section>

      <section style="margin-bottom:14px">
        <h3>Filters</h3>
        <div class="filters">
          <div>
            <label>Year From</label>
            <input id="year_from" type="number" value="2015" />
          </div>
          <div>
            <label>Year To</label>
            <input id="year_to" type="number" value="${new Date().getFullYear()}" />
          </div>
          <!-- <div>
            <label>Auction Type</label>
            <select id="auction_type"><option>Buy Now</option></select>
          </div> -->
          <div>
            <label>Inventory Type</label>
            <select id="inventory_type"><option>Automobiles</option><option>Motorcycles</option></select>
          </div>
          <div>
            <label>Min Bid ($)</label>
            <input id="min_bid" type="number" value="0" />
          </div>
          <div>
            <label>Max Bid ($)</label>
            <input id="max_bid" type="number" value="150000" />
          </div>
          <div>
            <label>Max Mileage</label>
            <input id="odo_max" type="number" value="150000" />
          </div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button id="apply-filters">Apply Filters</button>
          <button id="save-filter" class="secondary">Save Filter</button>
          <button id="list-filters" class="secondary">List Filters</button>
        </div>
      </section>

      <section style="margin-bottom:14px">
        <h3>Bot</h3>
        <div style="display:flex;gap:8px">
          <button id="run-once">Run Now</button>
          <button id="start-monitoring" class="secondary">Start</button>
          <button id="stop-monitoring" class="secondary">Stop</button>
        </div>
      </section>

      <section>
        <h3>Saved Filters</h3>
        <div id="saved-filters">(none)</div>
      </section>

      <section style="margin-top:12px">
        <h3>Output</h3>
        <pre id="output">Ready</pre>
      </section>
    </div>

    <!-- Signin/signup modal -->
    <div id="modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.35);align-items:center;justify-content:center">
      <div id="modal-content" style="background:#fff;padding:16px;border-radius:8px;width:360px;margin:40px auto;"></div>
    </div>

    <!-- toast popup -->
    <div id="toast" class="toast"></div>

    <script>
      let userId = null;
      const setStatus = () => {
        document.getElementById('auth-status').textContent = userId ? ('Signed in: ' + userId) : 'Not signed in';
        document.getElementById('btn-signout').style.display = userId ? 'inline-block' : 'none';
        document.getElementById('btn-delete-account').style.display = userId ? 'inline-block' : 'none';
      };

      async function postJson(url, data){
        const r = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        return r.json().catch(()=>({}));
      }

      function showToast(msg, type='success', timeout=3000){
        const el = document.getElementById('toast');
        el.textContent = msg || '';
        el.className = 'toast show ' + (type==='error' ? 'error' : 'success');
        if(el._hideTimer) clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(()=>{ el.className = 'toast'; }, timeout);
      }

      document.getElementById('btn-show-signup').addEventListener('click', ()=>{
        showModal("<h3>Sign Up</h3><label>Username</label><input id='su-username' />"
          + "<label>Password</label><div class='password-wrapper'><input id='su-password' type='password' /><button type='button' class='password-toggle' aria-label='Show password'></button></div>"
          + "<label>Email</label><input id='su-email' /><div style='margin-top:8px'><button id='do-signup'>Create</button> <button id='cancel'>Cancel</button></div>");
        setupPasswordToggles();
        document.getElementById('do-signup').onclick = async ()=>{
          const u=document.getElementById('su-username').value, p=document.getElementById('su-password').value, e=document.getElementById('su-email').value;
            const res = await postJson('/api/auth/signup',{username:u,password:p,email:e});
            showToast(res.msg || JSON.stringify(res), res.user_id ? 'success' : 'error');
            if(res.user_id){ userId = res.user_id; setStatus(); }
          hideModal();
        };
        document.getElementById('cancel').onclick = hideModal;
      });

      document.getElementById('btn-show-signin').addEventListener('click', ()=>{
        showModal("<h3>Sign In</h3><label>Username</label><input id='si-username' />"
          + "<label>Password</label><div class='password-wrapper'><input id='si-password' type='password' /><button type='button' class='password-toggle' aria-label='Show password'></button></div>"
          + "<div style='margin-top:8px'><button id='do-signin'>Sign In</button> <button id='cancel2'>Cancel</button></div>");
        setupPasswordToggles();
        document.getElementById('do-signin').onclick = async ()=>{
          const u=document.getElementById('si-username').value, p=document.getElementById('si-password').value;
          const res = await postJson('/api/auth/signin',{username:u,password:p});
          if(res.user_id){ userId = res.user_id; setStatus(); showToast('Signed in','success'); } else showToast('Invalid credentials','error');
          hideModal();
        };
        document.getElementById('cancel2').onclick = hideModal;
      });

      document.getElementById('btn-signout').addEventListener('click', ()=>{ userId=null; setStatus(); document.getElementById('output').textContent='Signed out'; });

      document.getElementById('btn-delete-account').addEventListener('click', async ()=>{
        if(!userId){ showToast('Sign in first','error'); return; }
        const ok = await showConfirm('Delete account?', 'Delete', 'Cancel');
        if(!ok) return;
        const r = await postJson('/api/user/delete',{user_id:userId});
        if(r.ok){ userId=null; setStatus(); showToast('Deleted','success'); } else showToast('Failed','error');
      });

      function showModal(html){ document.getElementById('modal-content').innerHTML=html; document.getElementById('modal').style.display='flex'; }
      function hideModal(){ document.getElementById('modal').style.display='none'; }

      function setupPasswordToggles(){
        const eyeSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12C1 12 5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z" stroke="#555" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const eyeOffSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.94 17.94C16.03 19.11 14.06 19.75 12 19.75C6.48 19.75 2 14.5 2 12C2 10.74 3.46 8.32 5.12 6.86" stroke="#555" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 1L23 23" stroke="#555" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const buttons = document.querySelectorAll('#modal-content .password-toggle');
        buttons.forEach(btn => {
          const wrapper = btn.parentNode;
          const input = wrapper && wrapper.querySelector('input');
          if(!input) return;
          btn.innerHTML = eyeSvg;
          btn.onclick = () => {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            btn.innerHTML = show ? eyeOffSvg : eyeSvg;
          };
        });
      }

      function showConfirm(message, okText='OK', cancelText='Cancel'){
        return new Promise(resolve => {
          const html = '<div><p style="margin:0 0 12px">' + message + '</p><div style="display:flex;gap:8px;justify-content:flex-end">'
            + "<button id='confirm-cancel' class='secondary'>" + cancelText + "</button>"
            + "<button id='confirm-ok' style='background:#ef4444'>" + okText + "</button></div></div>";
          showModal(html);
          const onOk = () => { cleanup(); resolve(true); };
          const onCancel = () => { cleanup(); resolve(false); };
          function cleanup(){
            const okBtn = document.getElementById('confirm-ok');
            const cancelBtn = document.getElementById('confirm-cancel');
            if(okBtn) okBtn.removeEventListener('click', onOk);
            if(cancelBtn) cancelBtn.removeEventListener('click', onCancel);
            hideModal();
          }
          setTimeout(()=>{
            const okBtn = document.getElementById('confirm-ok');
            const cancelBtn = document.getElementById('confirm-cancel');
            if(okBtn) okBtn.addEventListener('click', onOk);
            if(cancelBtn) cancelBtn.addEventListener('click', onCancel);
          }, 50);
        });
      }

      document.getElementById('apply-filters').addEventListener('click', async ()=>{
        if(!userId){ showToast('Sign in first','error'); return; }
        const filters = readFilters();
        const r = await postJson('/api/filters/apply',{user_id:userId,filters});
        document.getElementById('output').textContent = JSON.stringify(r,null,2);
        showToast('Filters applied','success');
      });

      document.getElementById('save-filter').addEventListener('click', async ()=>{
        if(!userId){ showToast('Sign in first','error'); return; }
        const name = prompt('Filter name'); if(!name) return;
        const filters = readFilters();
        const r = await postJson('/api/filters/save',{user_id:userId,name,filters});
        showToast(r.ok? 'Saved':'Failed', r.ok? 'success':'error');
      });

      document.getElementById('list-filters').addEventListener('click', async ()=>{ await listFilters(); });

          async function listFilters(){
            if(!userId){ showToast('Sign in first','error'); return; }
            const r = await fetch('/api/filters/'+userId).then(x=>x.json());
            const el = document.getElementById('saved-filters');
            if(!r.filters || r.filters.length === 0) {
              el.innerText = '(none)';
              return;
            }
            let html = '';
            r.filters.forEach(f => {
              html += "<div style='border:1px solid #eee;padding:8px;margin-bottom:8px;border-radius:6px'>";
              html += '<strong>' + (f.name || '') + '</strong>';
              html += '<pre>' + JSON.stringify(f.payload, null, 2) + '</pre>';
              html += "<div style='display:flex;gap:8px'>";
              html += "<button onclick='applySaved(" + f.id + ")'>Apply</button>";
              html += "<button onclick='editSaved(" + f.id + ")' class='secondary'>Edit</button>";
              html += "<button onclick='deleteSaved(" + f.id + ")' class='secondary'>Delete</button>";
              html += '</div></div>';
            });
            el.innerHTML = html;
          }

      window.applySaved = async (id)=>{
        if(!userId){ showToast('Sign in first','error'); return; }
        const r = await fetch('/api/filters/'+userId).then(x=>x.json());
        const f = r.filters.find(ff=>ff.id===id);
        if(!f){ showToast('Not found','error'); return; }
        const p = f.payload;
        Object.keys(p||{}).forEach(k=>{ if(document.getElementById(k)) document.getElementById(k).value = p[k]; });
        showToast('Applied saved filter to inputs','success');
      };

      window.deleteSaved = async (id)=>{
        const ok = await showConfirm('Delete saved filter?', 'Delete', 'Cancel');
        if(!ok) return;
        const res = await fetch('/api/filters/'+id,{method:'DELETE'}).then(x=>x.json());
        showToast(res.ok? 'Deleted':'Failed', res.ok? 'success':'error');
        if(res.ok) listFilters();
      };

      window.editSaved = async (id)=>{
        if(!userId){ showToast('Sign in first','error'); return; }
        const r = await fetch('/api/filters/'+userId).then(x=>x.json());
        const f = r.filters.find(ff=>ff.id===id);
        if(!f){ showToast('Not found','error'); return; }
        const name = prompt('Name', f.name); if(!name) return;
        const payload = prompt('Payload JSON', JSON.stringify(f.payload,null,2));
        try{
          const parsed = JSON.parse(payload);
          const rr = await fetch('/api/filters/update',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({config_id:id,name,filters:parsed})}).then(x=>x.json());
          showToast(rr.ok? 'Updated':'Failed', rr.ok? 'success':'error');
          listFilters();
        }catch(e){ showToast('Invalid JSON','error'); }
      };

      document.getElementById('run-once').addEventListener('click', async ()=>{
        if(!userId){ showToast('Sign in first','error'); return; }
        const r = await postJson('/api/bot/run_once',{user_id:userId}); document.getElementById('output').textContent = JSON.stringify(r,null,2);
      });

      document.getElementById('start-monitoring').addEventListener('click', async ()=>{
        if(!userId){ showToast('Sign in first','error'); return; }
        const r = await postJson('/api/bot/start',{user_id:userId}); document.getElementById('output').textContent = JSON.stringify(r,null,2);
      });

      document.getElementById('stop-monitoring').addEventListener('click', async ()=>{
        if(!userId){ showToast('Sign in first','error'); return; }
        const r = await postJson('/api/bot/stop',{user_id:userId}); document.getElementById('output').textContent = JSON.stringify(r,null,2);
      });

      function readFilters(){ return {
        year_from: Number(document.getElementById('year_from').value),
        year_to: Number(document.getElementById('year_to').value),
        // Auction Type is not shown in the UI; always use Buy Now.
        auction_type: 'Buy Now',
        min_bid: Number(document.getElementById('min_bid').value),
        max_bid: Number(document.getElementById('max_bid').value),
        odo_max: Number(document.getElementById('odo_max').value || 150000),
        inventory_type: document.getElementById('inventory_type').value,
      }; }

      setStatus();
    </script>
  </body>
  </html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.post("/api/auth/signup", (req, res) => {
  const { username, password, email } = req.body;
  const { ok, msg, user_id } = createUser(username, email, password);
  if (!ok) return res.json({ ok: false, msg });
  return res.json({ ok: true, msg, user_id });
});

app.post("/api/auth/signin", (req, res) => {
  const { username, password } = req.body;
  const id = authenticateUser(username, password);
  return res.json({ user_id: id });
});

// Delete user and their saved filters
app.post("/api/user/delete", (req, res) => {
  const { user_id } = req.body;
  const id = parseInt(user_id, 10);
  if (!id) return res.json({ ok: false, msg: "invalid user_id" });
  try {
    // remove filter configs for user
    db.prepare("DELETE FROM filter_configs WHERE user_id = ?").run(id);
  } catch (e) {
    console.error("Failed to delete user filter configs", e);
  }
  const ok = deleteUser(id);
  return res.json({ ok });
});

app.post("/api/filters/apply", (req, res) => {
  const { user_id, filters } = req.body;
  const payload = buildPayload(filters);
  let bot = bots.get(user_id);
  if (!bot) {
    bot = new IAAIBot(user_id);
    bots.set(user_id, bot);
  }
  bot.PAYLOAD = payload;
  return res.json({ ok: true });
});

function buildPayload(filters) {
  const nowYear = new Date().getFullYear();
  return {
    Searches: [
      {
        LongRanges: [
          {
            From: filters?.year_from ?? 2015,
            To: filters?.year_to ?? nowYear,
            Name: "Year",
          },
        ],
      },
      {
        Facets: [
          {
            Group: "AuctionType",
            Value: filters?.auction_type ?? "Buy Now",
            ForAnalytics: false,
          },
        ],
      },
      {
        LongRanges: [
          {
            From: filters?.min_bid ?? 0,
            To: filters?.max_bid ?? 50000,
            Name: "MinimumBidAmount",
          },
        ],
      },
      {
        LongRanges: [
          { From: 0, To: filters?.odo_max ?? 150000, Name: "ODOValue" },
        ],
      },
      {
        Facets: [
          {
            Group: "InventoryTypes",
            Value: filters?.inventory_type ?? "Automobiles",
            ForAnalytics: false,
          },
        ],
      },
    ],
    PageSize: 100,
    CurrentPage: 1,
    Sort: [{ SortField: "TenantSortOrder", IsDescending: false }],
    ShowRecommendations: false,
  };
}

app.post("/api/filters/save", (req, res) => {
  const { user_id, name, filters } = req.body;
  const ok = saveFilterConfig(user_id, name, filters);
  return res.json({ ok });
});
app.get("/api/filters/:user_id", (req, res) => {
  const user_id = parseInt(req.params.user_id, 10);
  const rows = loadUserConfigs(user_id);
  const results = rows.map(([id, name, payload]) => {
    let parsed = null;
    try {
      parsed = JSON.parse(payload);
    } catch (e) {
      parsed = null;
    }
    return { id, name, payload: parsed };
  });
  return res.json({ filters: results });
});

app.post("/api/bot/run_once", async (req, res) => {
  const { user_id } = req.body;
  let bot = bots.get(user_id);
  if (!bot) {
    bot = new IAAIBot(user_id);
    bots.set(user_id, bot);
  }
  const result = await bot.run_once();
  return res.json({ result });
});

app.post("/api/bot/start", (req, res) => {
  const { user_id } = req.body;
  let bot = bots.get(user_id);
  if (!bot) {
    bot = new IAAIBot(user_id);
    bots.set(user_id, bot);
  }
  const r = bot.start_continuous();
  return res.json({ result: r });
});

app.post("/api/bot/stop", (req, res) => {
  const { user_id } = req.body;
  const bot = bots.get(user_id);
  if (!bot) return res.json({ result: "Not running" });
  const r = bot.stop_continuous();
  return res.json({ result: r });
});

const PORT = process.env.PORT || 8001;
app.listen(PORT, () =>
  console.log(`API server listening on http://127.0.0.1:${PORT}`)
);
