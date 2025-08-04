// pages/api/stash-graphql.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createProxyMiddleware, type Options } from 'http-proxy-middleware';

export const config = { api: { bodyParser: false } };

const proxyOpts: Options = {
  target: process.env.NEXT_PUBLIC_STASH_GRAPHQL!,
  changeOrigin: true,
  pathRewrite: { '^/api/stash-graphql': '' },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('ApiKey', process.env.API_KEY ?? '');
  },
};

const proxy = createProxyMiddleware(proxyOpts);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return proxy(req, res, (err) => {
    if (err) {
      console.error('Proxy error:', err);
      res.status(500).end();
    }
  });
}
