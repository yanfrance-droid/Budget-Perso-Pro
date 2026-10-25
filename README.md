# PersonalBudgetPro

> Application personnelle et souveraine de gestion budgétaire et de patrimoine.  
> **Conception & Développement :** Yann Donne  

Consultez le manuel complet : [`docs/manuel.md`](./docs/manuel.md).

## Démarrage rapide

### Mode Développement
```bash
npm install
npm run dev
```

### Mode Production (Serveur Node.js + Frontend unifié)
```bash
npm run build
npm run server
```
Le serveur écoute sur `http://0.0.0.0:3001` et sert à la fois l'API REST SQLite et l'interface utilisateur.

### Déploiement Docker
```bash
docker compose up -d --build
```

---
*Fait avec passion par Yann Donne.*
