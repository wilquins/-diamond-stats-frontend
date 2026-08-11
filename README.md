# DiamondStats Frontend

La app de React que ya conoces, ahora como proyecto independiente listo
para desplegar con su propio link público.

## Probarlo en tu computadora

```bash
npm install
npm run dev
```

Abre la URL que te muestre (normalmente `http://localhost:5173`).

## Desplegarlo gratis en Vercel (el más simple de todos)

1. Sube esta carpeta a un repositorio nuevo en GitHub, igual que hiciste
   con el backend:
   ```bash
   git init
   git add .
   git commit -m "Frontend inicial"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/diamond-stats-frontend.git
   git push -u origin main
   ```
2. Ve a [vercel.com](https://vercel.com) y entra con tu cuenta de GitHub.
3. Haz clic en "Add New..." → "Project".
4. Selecciona tu repositorio `diamond-stats-frontend`.
5. Vercel detecta automáticamente que es un proyecto Vite — no cambies
   nada, solo haz clic en "Deploy".
6. En 1-2 minutos te da tu link público, algo como
   `https://diamond-stats-frontend.vercel.app` — ese es tu link
   definitivo para usar la app desde cualquier lado.

## Nota sobre el backend

Este frontend ya está apuntando a tu backend real en
`https://diamond-stats-backend.onrender.com`. No necesitas cambiar nada
para que funcionen juntos.
