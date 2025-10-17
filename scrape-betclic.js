import puppeteer from "puppeteer";
import TelegramBot from "node-telegram-bot-api";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import "dotenv/config";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TARGET_URL = "https://www.betclic.fr/rugby-a-xv-srugby_union";
const STATE_FILE = path.resolve("/app/data/notified-betclic.json");
const BOT = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Créer le dossier de données s'il n'existe pas
function ensureDataDir() {
    const dataDir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`📁 Dossier de données créé: ${dataDir}`);
    }
}

// === STATE ===
function loadState() {
    ensureDataDir();
    if (fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        } catch {
            return { matches: {} };
        }
    }
    return { matches: {} };
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function launchBrowser() {
    // Configuration pour Alpine Linux avec Chromium
    return puppeteer.launch({
        headless: "new",
        executablePath: '/usr/bin/chromium-browser',
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--single-process"
        ]
    });
}

async function scrapeMatches(page) {
    try {
        // Navigation vers Betclic (timeout augmenté pour Railway)
        console.log(`🌐 Navigation vers: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
        console.log("✅ Page chargée avec succès");

        try {
            await page.waitForSelector('[aria-label="Fermer"]', { timeout: 4000 });
            await page.click('[aria-label="Fermer"]');
            console.log("✅ Popup fermée");
        } catch {
            console.log("ℹ️ Pas de popup à fermer");
        }
    } catch (error) {
        console.error("❌ Erreur de navigation:", error.message);
        throw error;
    }

    // Attendre plus longtemps sur Railway (environnement plus lent)
    await new Promise(resolve => setTimeout(resolve, 10000)); // Attendre 10 secondes supplémentaires

    // Essayer plusieurs sélecteurs avec plus de patience
    let cardsFound = false;
    const selectors = ['.groupEvents_card', 'sports-events-event-card', '.cardEvent'];
    
    for (const selector of selectors) {
        try {
            await page.waitForSelector(selector, { timeout: 30000 });
            cardsFound = true;
            break;
        } catch (e) {
            // Continue avec le sélecteur suivant
        }
    }
    
    // Continue même si aucun sélecteur n'est trouvé

    const matches = await page.evaluate(() => {
        // Essayer plusieurs sélecteurs possibles
        let cards = Array.from(document.querySelectorAll('.groupEvents_card'));
        if (cards.length === 0) {
            cards = Array.from(document.querySelectorAll('sports-events-event-card'));
        }
        if (cards.length === 0) {
            cards = Array.from(document.querySelectorAll('.cardEvent'));
        }
        // Logs supprimés pour Railway
        return cards.map((card, index) => {
            // Récupérer les équipes
            const contestant1 = card.querySelector('[data-qa="contestant-1-label"]')?.textContent?.trim();
            const contestant2 = card.querySelector('[data-qa="contestant-2-label"]')?.textContent?.trim();
            
            // Vérifier si on a de vrais noms d'équipes (pas des noms génériques)
            const hasRealTeams = contestant1 && contestant2 && 
                !contestant1.toLowerCase().includes('match') && 
                !contestant2.toLowerCase().includes('match') &&
                !contestant1.match(/^match\s*\d+$/i) && 
                !contestant2.match(/^match\s*\d+$/i);
            
            const matchName = hasRealTeams ? `${contestant1} - ${contestant2}` : `Match inconnu`;
            
            // Récupérer l'heure
            const timeEl = card.querySelector('.scoreboard_hour');
            const time = timeEl ? timeEl.textContent.trim() : 'Heure inconnue';
            
            // Récupérer la compétition depuis le breadcrumb
            const breadcrumbItems = card.querySelectorAll('.breadcrumb_itemLabel');
            let competition = 'Compétition inconnue';
            for (const item of breadcrumbItems) {
                const text = item.textContent.trim();
                if (text && text !== '' && text !== '•') {
                    // Prendre le texte qui contient "•" (ex: "United Rugby Championship • J2")
                    if (text.includes('•')) {
                        competition = text;
                        break;
                    }
                    // Sinon prendre le premier texte non vide qui n'est pas juste "•"
                    if (competition === 'Compétition inconnue' && text !== '•') {
                        competition = text;
                    }
                }
            }
            
            // Récupérer le nombre de paris
            const betCountEl = card.querySelector('.event_betsNum');
            let betCount = 0;
            if (betCountEl) {
                const match = betCountEl.textContent.match(/(\d+)/);
                if (match) betCount = parseInt(match[1], 10);
            }
            
            // Récupérer les cotes 1N2
            const odds = [];
            const oddButtons = card.querySelectorAll('.btn.is-odd');
            oddButtons.forEach(btn => {
                const labelEl = btn.querySelector('.btn_label.is-top');
                const valueEl = btn.querySelector('.btn_label:not(.is-top)');
                if (labelEl && valueEl) {
                    const label = labelEl.textContent.trim();
                    const value = valueEl.textContent.trim();
                    if (label && value) {
                        odds.push({ label, cote: value });
                    }
                }
            });
            
            return {
                matchName,
                competition,
                time,
                betCount,
                odds,
                index
            };
        }).filter(match => 
            match.matchName !== 'Match inconnu' && 
            match.time !== 'Heure inconnue' &&
            // Filtrer les noms génériques (Match 1, Match 2, etc.)
            !match.matchName.match(/^match\s*\d+$/i) &&
            !match.matchName.toLowerCase().includes('match inconnu') &&
            // Filtrer les vainqueurs de championnats
            !match.matchName.toLowerCase().includes('vainqueur') &&
            !match.competition.toLowerCase().includes('vainqueur') &&
            !match.matchName.toLowerCase().includes('winner') &&
            !match.competition.toLowerCase().includes('winner') &&
            // Filtrer les compétitions futures
            !match.competition.includes('2025') &&
            !match.competition.includes('2026')
        ); // Filter out incomplete matches, generic names, future competitions and championship winners
    });

    console.log(`🎯 ${matches.length} matchs trouvés`);
    return matches;
}

async function mainRun() {
    console.log(`=== Betclic Run start: ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} ===`);
    let browser;
    try {
        console.log("🚀 Lancement navigateur Betclic...");
        browser = await launchBrowser();
        
        // Vérifier que le navigateur est bien lancé
        if (!browser || browser.isConnected() === false) {
            throw new Error("Navigateur non connecté");
        }
        
        const page = await browser.newPage();
        
        // Configuration pour Railway (plus de patience)
        await page.setDefaultTimeout(120000);
        await page.setDefaultNavigationTimeout(120000);
        
        // Gestion des erreurs de page
        page.on('error', (err) => {
            console.error("❌ Erreur de page:", err.message);
        });
        
        page.on('pageerror', (err) => {
            console.error("❌ Erreur JavaScript:", err.message);
        });
        
        const state = loadState();
        if (!state.matches) state.matches = {};
        
        console.log("📊 Récupération des matchs Betclic...");
        const matches = await scrapeMatches(page);

    for (const match of matches) {
        const matchKey = `${match.matchName} (${match.competition})`;
        const oldMatch = state.matches[matchKey] || {};
        
        console.log(`📊 Betclic - ${match.matchName}: ${oldMatch.betCount || 0} → ${match.betCount}`);
        
        // Vérifier seulement le changement du nombre de paris
        if (match.betCount !== oldMatch.betCount) {
            const oldCount = oldMatch.betCount || 0;
            const newCount = match.betCount;
            
            const message = `🏉 <b>Nouveaux paris Betclic</b>\n\n` +
                          `<b>Match :</b> ${match.matchName}\n` +
                          `<b>Compétition :</b> ${match.competition}\n` +
                          `<b>Heure :</b> ${match.time}\n\n` +
                          `• <b>Nombre de paris :</b> ${oldCount} → ${newCount}`;
            
            try {
                await BOT.sendMessage(CHAT_ID, message, { 
                    parse_mode: "HTML",
                    message_thread_id: 246
                });
                console.log(`✅ Changement de paris envoyé pour ${match.matchName} (${oldCount} → ${newCount})`);
                
                // Délai de 2 secondes entre chaque message pour éviter les erreurs 429
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
                console.error("Erreur Telegram:", e.message);
                // Si erreur 429, attendre plus longtemps avant de continuer
                if (e.message.includes('429')) {
                    console.log("⏳ Attente de 30 secondes avant de continuer...");
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            }
        } else {
            console.log(`   Aucun changement pour ${match.matchName}`);
        }

        // Sauvegarder l'état actuel (seulement le nombre de paris)
        state.matches[matchKey] = {
            betCount: match.betCount
        };
        saveState(state);
    }

    await browser.close();
    console.log("=== Betclic Run end ===\n");
    } catch (error) {
        console.error("❌ Erreur dans mainRun:", error.message);
        console.error("❌ Stack trace:", error.stack);
        
        if (browser) {
            try {
                await browser.close();
                console.log("✅ Navigateur fermé proprement");
            } catch (closeError) {
                console.error("❌ Erreur lors de la fermeture du navigateur:", closeError.message);
            }
        }
        
        // Attendre un peu avant de relancer
        console.log("⏳ Attente de 30 secondes avant de continuer...");
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}

// Cron : toutes les 30 min 24h/24
cron.schedule("*/30 * * * *", () => {
    console.log("🕒 CRON lancé:", new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));
    // Délai de 2 minutes pour éviter les conflits avec les autres scripts
    setTimeout(() => {
        mainRun().catch((err) => console.error("Erreur CRON:", err));
    }, 120000); // 2 minutes
});

// Premier run au démarrage
mainRun().catch((e) => console.error("Erreur mainRun:", e));
