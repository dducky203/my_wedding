import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function createDeleteHandler(env) {
  return async (req, res) => {
    const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    try {
      const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
      const cloud = env.CLOUDINARY_CLOUD_NAME || env.VITE_CLOUDINARY_CLOUD_NAME;
      if (!projectId || !cloud || !env.FIREBASE_ADMIN_UID || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return send(503, { error: 'Máy chủ chưa có cấu hình xoá ảnh Cloudinary.' });
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) return send(401, { error: 'Vui lòng đăng nhập lại.' });
      const app = getApps().find((app) => app.name === 'cloudinary-delete') || initializeApp({ projectId }, 'cloudinary-delete');
      let user;
      try { user = await getAuth(app).verifyIdToken(token); }
      catch { return send(401, { error: 'Phiên đăng nhập không hợp lệ.' }); }
      if (user.uid !== env.FIREBASE_ADMIN_UID) return send(403, { error: 'Chỉ admin được xoá ảnh.' });
      let body = req.body;
      if (!body) {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 8192) return send(413, { error: 'Request too large' }); }
        body = JSON.parse(raw);
      }
      if (typeof body === 'string') body = JSON.parse(body);
      const url = new URL(body.url);
      const prefix = `/${cloud}/image/upload/`;
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith(prefix)) return send(400, { error: 'URL ảnh không thuộc Cloudinary của website.' });
      const match = url.pathname.slice(prefix.length).match(/^(?:.*\/)?v\d+\/(.+)\.[^/.]+$/);
      if (!match) return send(400, { error: 'URL ảnh không hợp lệ.' });
      const publicId = decodeURIComponent(match[1]);
      const authorization = 'Basic ' + Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64');
      const details = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload/${encodeURIComponent(publicId)}`, { headers: { Authorization: authorization } });
      if (details.status === 404) return send(200, { ok: true });
      if (!details.ok) throw new Error('Không kiểm tra được ảnh Cloudinary.');
      const asset = await details.json();
      if (asset.asset_folder !== 'wedding' && !publicId.startsWith('wedding/')) return send(403, { error: 'Chỉ được xoá ảnh trong folder wedding.' });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHash('sha1').update(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`).digest('hex');
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/destroy`, { method: 'POST', body: new URLSearchParams({ api_key: env.CLOUDINARY_API_KEY, public_id: publicId, timestamp: String(timestamp), invalidate: 'true', signature }) });
      const result = await response.json();
      if (!response.ok || !['ok', 'not found'].includes(result.result)) throw new Error('Cloudinary chưa xoá được ảnh.');
      send(200, { ok: true });
    } catch { send(500, { error: 'Không xoá được ảnh Cloudinary. Hãy thử lưu lại.' }); }
  };
}

export default (req, res) => createDeleteHandler(process.env)(req, res);
