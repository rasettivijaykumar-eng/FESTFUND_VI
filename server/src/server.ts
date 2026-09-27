import { connectDb } from "./config/db.js";
import { app } from "./app.js";
import { env } from "./config/env.js";

await connectDb();
app.listen(env.port, () => {
  console.log(`FestFund API listening on http://localhost:${env.port}`);
});
