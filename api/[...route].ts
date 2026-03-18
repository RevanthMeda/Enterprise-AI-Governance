import { getVercelApp } from "../server/app";

export const config = {
  api: {
    bodyParser: false,
  },
};

const runtimePromise = getVercelApp();

export default async function handler(req: any, res: any) {
  const { app } = await runtimePromise;
  return app(req, res);
}
