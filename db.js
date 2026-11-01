/* Stockage local de la caisse (IndexedDB) : tout reste sur la tablette, sans internet. */
const DB = (() => {
  const NOM = "caisse-comite";
  const VERSION = 1;
  const MAGASINS = ["categories", "articles", "moyens", "utilisateurs", "sessions", "tickets",
                    "mouvements", "ajustements", "params"];
  let base = null;

  function ouvrir() {
    if (base) return Promise.resolve(base);
    return new Promise((ok, ko) => {
      const req = indexedDB.open(NOM, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const m of MAGASINS) {
          if (!db.objectStoreNames.contains(m)) {
            const s = db.createObjectStore(m, { keyPath: "id" });
            if (m === "tickets" || m === "mouvements") s.createIndex("sessionId", "sessionId");
          }
        }
      };
      req.onsuccess = () => { base = req.result; ok(base); };
      req.onerror = () => ko(req.error);
    });
  }

  async function tx(magasin, mode, fn) {
    const db = await ouvrir();
    return new Promise((ok, ko) => {
      const t = db.transaction(magasin, mode);
      const s = t.objectStore(magasin);
      let resultat;
      Promise.resolve(fn(s)).then(r => { resultat = r; });
      t.oncomplete = () => ok(resultat);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    });
  }

  const enPromesse = req => new Promise((ok, ko) => { req.onsuccess = () => ok(req.result); req.onerror = () => ko(req.error); });

  return {
    MAGASINS,
    tous: m => tx(m, "readonly", s => enPromesse(s.getAll())),
    lire: (m, id) => tx(m, "readonly", s => enPromesse(s.get(id))),
    ecrire: (m, obj) => tx(m, "readwrite", s => enPromesse(s.put(obj))),
    ecrireTous: (m, objs) => tx(m, "readwrite", s => Promise.all(objs.map(o => enPromesse(s.put(o))))),
    supprimer: (m, id) => tx(m, "readwrite", s => enPromesse(s.delete(id))),
    vider: m => tx(m, "readwrite", s => enPromesse(s.clear())),
    parSession: (m, sessionId) => tx(m, "readonly", s => enPromesse(s.index("sessionId").getAll(sessionId))),
    /* Écrit plusieurs magasins dans une seule transaction (vente = ticket + stock + compteur) */
    async lot(operations) {
      const db = await ouvrir();
      const noms = [...new Set(operations.map(o => o[0]))];
      return new Promise((ok, ko) => {
        const t = db.transaction(noms, "readwrite");
        for (const [m, obj, suppr] of operations) {
          const s = t.objectStore(m);
          suppr ? s.delete(obj) : s.put(obj);
        }
        t.oncomplete = () => ok();
        t.onerror = () => ko(t.error);
        t.onabort = () => ko(t.error);
      });
    },
    async exporter() {
      const tout = {};
      for (const m of MAGASINS) tout[m] = await this.tous(m);
      return { application: "caisse-comite", version: 1, exporteLe: new Date().toISOString(), donnees: tout };
    },
    async restaurer(sauvegarde) {
      if (!sauvegarde || sauvegarde.application !== "caisse-comite") throw new Error("Ce fichier n'est pas une sauvegarde de la caisse.");
      for (const m of MAGASINS) {
        await this.vider(m);
        const objs = sauvegarde.donnees[m] || [];
        if (objs.length) await this.ecrireTous(m, objs);
      }
    },
  };
})();
