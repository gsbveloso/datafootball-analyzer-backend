// index.js - VERSÃO ATUALIZADA E CORRETA PARA NODE.JS

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const app = express();
app.use(cors()); // Permite a comunicação com o Netlify
app.use(express.json()); // Permite que o servidor entenda JSON

// --- VARIÁVEIS GLOBAIS PARA GUARDAR OS DADOS ---
let allGames = [];
let allTeams = [];
let allLeagues = [];

// --- NOMES DAS COLUNAS (AJUSTE SE FOR DIFERENTE NOS SEUS ARQUIVOS) ---
const COLUMN_NAMES = {
    date: 'date',
    home_team: 'home_name',
    away_team: 'away_name',
    home_goals_ft: 'homeGoalCount',
    away_goals_ft: 'awayGoalCount',
    home_goals_min: 'homeGoals_timings',
    away_goals_min: 'awayGoals_timings',
    league: 'league',
    status: 'status'
};

// --- FUNÇÃO PARA CARREGAR E PROCESSAR OS DADOS ---
async function loadData() {
    const dataFolderPath = path.join(__dirname, 'data');
    let loadedGames = [];

    try {
        const files = fs.readdirSync(dataFolderPath);
        const csvFiles = files.filter(file => file.endsWith('.csv'));

        if (csvFiles.length === 0) {
            console.log("Nenhum arquivo CSV encontrado na pasta 'data'.");
            return;
        }

        console.log(`Encontrados ${csvFiles.length} arquivos CSV. Iniciando leitura...`);

        for (const file of csvFiles) {
            await new Promise((resolve, reject) => {
                fs.createReadStream(path.join(dataFolderPath, file))
                    .pipe(csv())
                    .on('data', (row) => {
                        // Filtra apenas jogos completos
                        if (row[COLUMN_NAMES.status] && row[COLUMN_NAMES.status].toLowerCase() === 'complete') {
                            loadedGames.push(row);
                        }
                    })
                    .on('end', () => {
                        console.log(`Arquivo ${file} processado.`);
                        resolve();
                    })
                    .on('error', reject);
            });
        }

        // Ordena os jogos por data
        loadedGames.sort((a, b) => new Date(a[COLUMN_NAMES.date]) - new Date(b[COLUMN_NAMES.date]));
        allGames = loadedGames;

        // Extrai times e ligas
        const homeTeams = allGames.map(game => game[COLUMN_NAMES.home_team]?.trim()).filter(Boolean);
        const awayTeams = allGames.map(game => game[COLUMN_NAMES.away_team]?.trim()).filter(Boolean);
        allTeams = [...new Set([...homeTeams, ...awayTeams])].sort();
        allLeagues = [...new Set(allGames.map(game => game[COLUMN_NAMES.league]?.trim()).filter(Boolean))].sort();

        console.log(`Dados carregados: ${allGames.length} jogos, ${allTeams.length} times, ${allLeagues.length} ligas.`);

    } catch (error) {
        console.error("!!!!!!!!!! ERRO CRÍTICO AO CARREGAR OS DADOS !!!!!!!!!!!");
        console.error("Verifique se a pasta 'data' existe e contém arquivos CSV válidos.", error);
    }
}

// --- FUNÇÕES DE ANÁLISE ---
function parseGoals(goalTimingsStr) {
    if (!goalTimingsStr || typeof goalTimingsStr !== 'string' || goalTimingsStr.trim() === '[]') return [];
    const cleanedStr = goalTimingsStr.replace(/[\[\]',]/g, '').trim();
    if (!cleanedStr) return [];
    return cleanedStr.split(/\s+/).map(m => parseInt(m.split('+')[0], 10)).filter(Number.isFinite);
}

function getScoreAtMinute(minute, homeGoalsList, awayGoalsList) {
    const homeScore = homeGoalsList.filter(goalMin => goalMin <= minute).length;
    const awayScore = awayGoalsList.filter(goalMin => goalMin <= minute).length;
    return [homeScore, awayScore];
}

function getRecentGames(teamName, location, count) {
    let teamGames = allGames.filter(game => 
        game[COLUMN_NAMES.home_team] === teamName || game[COLUMN_NAMES.away_team] === teamName
    );

    if (location === 'home') {
        teamGames = teamGames.filter(game => game[COLUMN_NAMES.home_team] === teamName);
    } else if (location === 'away') {
        teamGames = teamGames.filter(game => game[COLUMN_NAMES.away_team] === teamName);
    }
    
    return teamGames.slice(-count); // Pega os últimos 'count' jogos
}

function findPatternFrequency(games, teamParams) {
    const universeSize = games.length;
    if (universeSize === 0) return { occurrences: 0, universeSize: 0, params: teamParams, lastTwoOccurrences: [] };

    const targetMinute = parseInt(teamParams.minute, 10);
    const targetScoreH = parseInt(teamParams.scoreH, 10);
    const targetScoreA = parseInt(teamParams.scoreA, 10);

    if (isNaN(targetScoreH) || isNaN(targetScoreA)) {
        return { occurrences: 0, universeSize, params: teamParams, lastTwoOccurrences: [] };
    }

    const foundGames = games.filter(game => {
        const homeGoals = parseGoals(game[COLUMN_NAMES.home_goals_min]);
        const awayGoals = parseGoals(game[COLUMN_NAMES.away_goals_min]);
        const [scoreH, scoreA] = getScoreAtMinute(targetMinute, homeGoals, awayGoals);
        return scoreH === targetScoreH && scoreA === targetScoreA;
    });

    return {
        occurrences: foundGames.length,
        universeSize: universeSize,
        params: teamParams,
        lastTwoOccurrences: foundGames.slice(-2) // Pega as duas últimas ocorrências
    };
}


// --- "TELEFONES" DA API ---

// Telefone 1: Envia a lista de times para o frontend
app.get('/api/teams', (req, res) => {
    if (allTeams.length > 0) {
        res.json({ teams: allTeams, leagues: allLeagues });
    } else {
        res.status(503).json({ error: "Servidor ainda está carregando os dados. Tente novamente em um minuto." });
    }
});

// Telefone 2: Recebe o pedido de análise e retorna os resultados
app.post('/api/analyze', (req, res) => {
    try {
        const params = req.body;
        if (params.tool === 'confrontation') {
            const { homeTeamName, awayTeamName, homeParams, awayParams } = params;

            const homeRecentGames = getRecentGames(homeTeamName, homeParams.location, homeParams.recentGames);
            const awayRecentGames = getRecentGames(awayTeamName, awayParams.location, awayParams.recentGames);

            const homeResult = findPatternFrequency(homeRecentGames, homeParams);
            const awayResult = findPatternFrequency(awayRecentGames, awayParams);

            const responseData = {
                leagueContext: "Forma Geral", // Simplificado por enquanto
                homeResult,
                awayResult,
                lastGameHome: homeRecentGames.length > 0 ? homeRecentGames[homeRecentGames.length - 1] : null,
                lastGameAway: awayRecentGames.length > 0 ? awayRecentGames[awayRecentGames.length - 1] : null,
            };
            res.json(responseData);
        } else {
            res.status(400).json({ error: "Ferramenta não suportada" });
        }
    } catch (error) {
        console.error("ERRO DURANTE A ANÁLISE:", error);
        res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
    }
});

// --- INICIA O SERVIDOR ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    loadData(); // Carrega os dados depois que o servidor já está no ar
});
