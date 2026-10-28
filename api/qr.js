import QRCode from 'qrcode';

export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code') || '';
  if (!code || code.length > 512) return new Response('Parâmetro code inválido', { status: 400 });
  const png = await QRCode.toBuffer(code, { type: 'png', width: 440, margin: 2, errorCorrectionLevel: 'M' });
  return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
}
