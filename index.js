import "dotenv/config";
import "./scrape-unibet.js";
import "./scrapping-cb-rugby.js";

console.log("🚀 Unibet Scraper complet démarré !");
console.log("⏰ Surveillance 24h/24 toutes les 30 minutes");
console.log("📊 Unibet Matchs → Canal 247");
console.log("🔥 Unibet Cotes Boostées → Canal 14");

// Garder le processus en vie pour Railway
let isShuttingDown = false;

process.on('SIGTERM', () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('SIGTERM reçu, arrêt propre en cours...');
    setTimeout(() => {
        console.log('Arrêt terminé');
        process.exit(0);
    }, 10000);
});

process.on('SIGINT', () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('SIGINT reçu, arrêt propre en cours...');
    setTimeout(() => {
        console.log('Arrêt terminé');
        process.exit(0);
    }, 10000);
});

// Garder le processus en vie
setInterval(() => {
    if (!isShuttingDown) {
        console.log('💓 Heartbeat - Unibet Scraper actif');
    }
}, 300000); // Toutes les 5 minutes