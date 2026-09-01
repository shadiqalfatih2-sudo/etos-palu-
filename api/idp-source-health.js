module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const url = 'https://docs.google.com/spreadsheets/d/1OzW2RfiXL5SmqLOJx-t4Grimy7usdnSqVvSQszZ8WvQ/gviz/tq?tqx=out:csv&sheet=Nama%20Etoser';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'ETOS-IDP-Source-Health/1.0' }
    });
    const body = await response.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: response.ok,
      upstreamStatus: response.status,
      contentType: response.headers.get('content-type') || '',
      readableCsv: response.ok && body.length > 0 && !/accounts\.google\.com|ServiceLogin|Sign in/i.test(body),
      bytes: body.length
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: false, readableCsv: false, error: error && error.message ? error.message : String(error) });
  } finally {
    clearTimeout(timer);
  }
};
