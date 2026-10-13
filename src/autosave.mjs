// Robot de guardado automático: abre DiamondStats en un navegador invisible,
// entra a cada deporte, y visita "Juegos" y "Picks del día" para que la app
// guarde predicciones, Over/Under y picks (mismo código, mismo cálculo).
import { chromium } from "playwright";

const URL = process.env.SITE_URL || "https://diamondstats123.vercel.app/";
const SPORTS = ["MLB", "NFL", "NBA", "NHL"];
const WAIT_GAMES_MS = 45000; // la lista calcula y guarda juego por juego
const WAIT_PICKS_MS = 90000; // Picks del día consulta jugadores de todos los equipos

const browser = await chromium.launch();
const page = await browser.newPage();
let failures = 0;

for (const sport of SPORTS) {
  try {
    await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("button", { name: new RegExp(sport) }).first().click({ timeout: 20000 });
    await page.waitForTimeout(WAIT_GAMES_MS);
    await page.getByRole("button", { name: "Picks del día", exact: true }).click({ timeout: 20000 });
    await page.waitForTimeout(WAIT_PICKS_MS);
    console.log(`OK ${sport}`);
  } catch (e) {
    failures++;
    console.log(`FALLÓ ${sport}: ${e.message}`);
  }
}

await browser.close();
if (failures === SPORTS.length) process.exit(1);
