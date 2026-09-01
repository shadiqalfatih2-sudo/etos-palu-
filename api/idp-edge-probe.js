module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ok:false,error:'Method not allowed'});
  try {
    const r = await fetch('https://jrrmgfzfpcrjtyjqpaff.supabase.co/functions/v1/etos-idp-source-probe');
    const text = await r.text();
    res.setHeader('Cache-Control','no-store');
    res.status(r.ok ? 200 : 502).send(text);
  } catch (e) {
    res.setHeader('Cache-Control','no-store');
    res.status(502).json({ok:false,error:e && e.message ? e.message : String(e)});
  }
};
