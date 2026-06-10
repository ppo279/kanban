import Database from "better-sqlite3";
const db = new Database("./data/kanban.db");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("tables:", tables.map(t => t.name).join(", "));
const row = db.prepare("SELECT * FROM project_settings").get();
console.log("project_settings row:", row);
db.close();
