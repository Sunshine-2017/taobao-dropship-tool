import { batchListToTaobao } from "./src/services/taobao-auto-list.js";
import { getDb, closeDb } from "./src/sqlite.js";
import { writeFileSync } from "fs";

async function main() {
  const db = getDb();
  const row = db.prepare("SELECT * FROM my_products WHERE id = ?").get(2);
  console.error("Product loaded:", row?.title);
  closeDb();
  const result = await batchListToTaobao([row]);
  writeFileSync("D:/Temp/auto-list-result.json", JSON.stringify(result, null, 2));
  console.error("Done!");
}
main().catch(e => {
  console.error("Error:", e.message);
  writeFileSync("D:/Temp/auto-list-error.json", JSON.stringify({error: e.message, stack: e.stack}));
});
