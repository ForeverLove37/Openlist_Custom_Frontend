import { createApp } from "./server/app.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const app = createApp();

app.listen(port, host, () => {
  console.log(`OpenList Drive BFF listening on http://${host}:${port}`);
});
