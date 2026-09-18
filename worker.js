import { onRequestGet as productsGet } from './functions/api/products.js';
import { onRequestPost as orderCreate } from './functions/api/order/create.js';
import { onRequestGet as orderGet } from './functions/api/order/[id].js';
import { onRequestPost as orderPay } from './functions/api/order/[id]/pay.js';
import { onRequestGet as asGet, onRequestPost as asPost } from './functions/api/order/[id]/aftersales.js';
import { onRequestPost as adminLogin } from './functions/api/admin/login.js';
import { onRequestPost as adminLogout } from './functions/api/admin/logout.js';
import { onRequestGet as adminOrdersGet } from './functions/api/admin/orders.js';
import { onRequestPost as adminTrackingPost } from './functions/api/admin/tracking.js';
import { onRequestGet as adminAsGet, onRequestPost as adminAsPost } from './functions/api/admin/aftersales.js';
import { onRequestGet as adminProductsGet, onRequestPost as adminProductsPost } from './functions/api/admin/products.js';
import { onRequestPost as payCbPost, onRequestGet as payCbGet } from './functions/api/payment/callback.js';

const ID = '([A-Za-z0-9-]+)';
const routes = [
  ['GET', new RegExp(`^/api/products$`), productsGet],
  ['POST', new RegExp(`^/api/order/create$`), orderCreate],
  ['GET', new RegExp(`^/api/order/${ID}$`), orderGet],
  ['POST', new RegExp(`^/api/order/${ID}/pay$`), orderPay],
  ['GET', new RegExp(`^/api/order/${ID}/aftersales$`), asGet],
  ['POST', new RegExp(`^/api/order/${ID}/aftersales$`), asPost],
  ['POST', new RegExp(`^/api/admin/login$`), adminLogin],
  ['POST', new RegExp(`^/api/admin/logout$`), adminLogout],
  ['GET', new RegExp(`^/api/admin/orders$`), adminOrdersGet],
  ['POST', new RegExp(`^/api/admin/tracking$`), adminTrackingPost],
  ['GET', new RegExp(`^/api/admin/aftersales$`), adminAsGet],
  ['POST', new RegExp(`^/api/admin/aftersales$`), adminAsPost],
  ['GET', new RegExp(`^/api/admin/products$`), adminProductsGet],
  ['POST', new RegExp(`^/api/admin/products$`), adminProductsPost],
  ['POST', new RegExp(`^/api/payment/callback$`), payCbPost],
  ['GET', new RegExp(`^/api/payment/callback$`), payCbGet],
];

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      let pathKnown = false;
      for (const [method, re, handler] of routes) {
        const m = path.match(re);
        if (!m) continue;
        pathKnown = true;
        if (request.method !== method) continue;
        return handler({ request, env, params: m[1] ? { id: m[1] } : {}, ctx });
      }
      return json(
        { error: pathKnown ? 'Method not allowed.' : 'Not found.' },
        pathKnown ? 405 : 404
      );
    }
    return env.ASSETS.fetch(request);
  },
};
