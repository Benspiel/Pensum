/* Datenbank-Zugriff für alle Tools (Appwrite TablesDB) – nutzt die gemeinsame Session aus auth.js.
 *
 * Datenschutz: Jede Zeile bekommt beim Anlegen Rechte nur für den eigenen Benutzer
 * (read/update/delete für Role.user(<id>)). Die Tabellen selbst erlauben nur „create“ für
 * angemeldete Benutzer und haben Row Security an – fremde Zeilen sind damit unsichtbar. */
import { TablesDB, ID, Query, Permission, Role } from "/vendor/appwrite.js";
import { client } from "/js/auth.js";
import { config } from "/js/config.js";

export { ID, Query };
export const tablesDB = new TablesDB(client);
export const databaseId = config.databaseId;
export const tableIds = config.tables;

/** Rechte für eine Zeile, die nur ihrem Besitzer gehört. */
export const ownerPermissions = (userId) => [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId)),
];

/** Alle Zeilen einer Tabelle lesen (seitenweise, je 100). */
export async function listAllRows(tableId, queries = []) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const page = await tablesDB.listRows({
      databaseId,
      tableId,
      queries: [...queries, Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
    });
    rows.push(...page.rows);
    if (page.rows.length < 100) return rows;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}
