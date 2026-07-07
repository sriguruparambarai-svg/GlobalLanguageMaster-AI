// /api/auth.js — School login + Super Admin management for Global Language Master
// All database work happens here on the server, using the secret service key.
// Needs 3 environment variables in Vercel:
//   SUPABASE_URL          e.g. https://spncxkkpbgvicmewwaeq.supabase.co
//   SUPABASE_SERVICE_KEY  the service_role key from Supabase settings
//   ADMIN_KEY             the super admin password you choose

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'POST only' });

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  var ADMIN_KEY    = process.env.ADMIN_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ ok:false, error:'SUPABASE_URL / SUPABASE_SERVICE_KEY not set in Vercel environment variables' });
  }

  var body = req.body || {};
  var action = body.action || '';

  // small helper to call Supabase REST with the service key
  async function db(method, path, payload) {
    var opts = {
      method: method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    if (payload !== undefined) opts.body = JSON.stringify(payload);
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
    var text = await r.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
    if (!r.ok) throw new Error(typeof data === 'object' && data && data.message ? data.message : ('Database error ' + r.status));
    return data;
  }

  function isAdmin() {
    return ADMIN_KEY && body.admin_key && body.admin_key === ADMIN_KEY;
  }

  try {
    /* ───────── SCHOOL LOGIN ───────── */
    if (action === 'school_login') {
      var code = (body.code || '').trim();
      var pass = (body.password || '').trim();
      if (!code || !pass) return res.status(400).json({ ok:false, error:'Enter school code and password' });

      var rows = await db('GET', 'schools?school_code=eq.' + encodeURIComponent(code) + '&select=school_code,name,password,has_english,has_hindi,active');
      if (!rows || !rows.length) return res.status(200).json({ ok:false, error:'School code not found' });
      var s = rows[0];
      if (s.password !== pass) return res.status(200).json({ ok:false, error:'Wrong password' });
      if (!s.active) return res.status(200).json({ ok:false, error:'This school subscription is not active. Please contact DigiSmartSchool.' });

      return res.status(200).json({ ok:true, school:{
        code: s.school_code, name: s.name,
        has_english: !!s.has_english, has_hindi: !!s.has_hindi
      }});
    }

    /* ───────── ADMIN ACTIONS (need admin_key) ───────── */
    if (action === 'admin_login') {
      if (!ADMIN_KEY) return res.status(500).json({ ok:false, error:'ADMIN_KEY not set in Vercel environment variables' });
      return res.status(200).json({ ok: isAdmin(), error: isAdmin() ? undefined : 'Wrong admin password' });
    }

    if (['list_schools','add_school','update_school','delete_school'].indexOf(action) >= 0) {
      if (!isAdmin()) return res.status(403).json({ ok:false, error:'Admin access denied' });

      if (action === 'list_schools') {
        var all = await db('GET', 'schools?select=school_code,name,has_english,has_hindi,active,created_at&order=created_at.desc');
        return res.status(200).json({ ok:true, schools: all });
      }

      if (action === 'add_school') {
        var nc = (body.code||'').trim(), nn = (body.name||'').trim(), np = (body.password||'').trim();
        if (!nc || !nn || !np) return res.status(400).json({ ok:false, error:'Code, name and password are required' });
        var made = await db('POST', 'schools', {
          school_code: nc, name: nn, password: np,
          has_english: body.has_english !== false,
          has_hindi: !!body.has_hindi,
          active: true
        });
        return res.status(200).json({ ok:true, school: made && made[0] });
      }

      if (action === 'update_school') {
        var uc = (body.code||'').trim();
        if (!uc) return res.status(400).json({ ok:false, error:'School code required' });
        var fields = {};
        if (typeof body.name === 'string' && body.name.trim()) fields.name = body.name.trim();
        if (typeof body.password === 'string' && body.password.trim()) fields.password = body.password.trim();
        if (typeof body.has_english === 'boolean') fields.has_english = body.has_english;
        if (typeof body.has_hindi === 'boolean') fields.has_hindi = body.has_hindi;
        if (typeof body.active === 'boolean') fields.active = body.active;
        if (!Object.keys(fields).length) return res.status(400).json({ ok:false, error:'Nothing to update' });
        var upd = await db('PATCH', 'schools?school_code=eq.' + encodeURIComponent(uc), fields);
        return res.status(200).json({ ok:true, school: upd && upd[0] });
      }

      if (action === 'delete_school') {
        var dc = (body.code||'').trim();
        if (!dc) return res.status(400).json({ ok:false, error:'School code required' });
        await db('DELETE', 'schools?school_code=eq.' + encodeURIComponent(dc));
        return res.status(200).json({ ok:true });
      }
    }

    return res.status(400).json({ ok:false, error:'Unknown action' });

  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
};
