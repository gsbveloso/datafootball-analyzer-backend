// index.js - VERSÃO FINAL E CORRETA ("LENTO E COMPLETO")
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const corsOptions = { origin: 'https://centro-de-analise-final.netlify.app', optionsSuccessStatus: 200 };
app.use(cors(corsOptions));
app.use(express.json());
const URL_DA_API_DE_DADOS = 'https://datafootball.com.br';
const CHAVE_SECRETA = process.env.DATA_API_KEY;
let allGamesData = [];
let isDataReady = false;

async function loadAllData() {
    console.log('Iniciando carga de dados...');
    if (!CHAVE_SECRETA) { console.error('ERRO: Chave da API não configurada.'); return; }
    try {
        const combosResponse = await axios.get(`${URL_DA_API_DE_DADOS}/leagues_seasons`, { headers: { 'x-api-key': CHAVE_SECRETA } });
        const combinations = combosResponse.data;
        console.log(`Encontradas ${combinations.length} combinações de liga/temporada.`);
        let tempGames = [];
        for (const combo of combinations) {
            let currentPage = 1;
            let hasMorePages = true;
            while (hasMorePages) {
                try {
                    const matchesResponse = await axios.get(`${URL_DA_API_DE_DADOS}/matches`, {
                        params: { liga: combo.liga, temporada: combo.temporada, page: currentPage, limit: 100 },
                        headers: { 'x-api-key': CHAVE_SECRETA },
                        timeout: 30000 // Aumenta o tempo de espera para cada pedido
                    });
                    const newMatches = matchesResponse.data;
                    if (newMatches && newMatches.length > 0) {
                        tempGames.push(...newMatches);
                        currentPage++;
                        if (newMatches.length < 100) hasMorePages = false;
                    } else {
                        hasMorePages = false;
                    }
                } catch (pageError) {
                    console.error(`Erro na página ${currentPage} para ${combo.liga}-${combo.temporada}. Continuando...`);
                    hasMorePages = false;
                }
            }
        }
        allGamesData = tempGames;
        isDataReady = true;
        console.log(`CARGA COMPLETA! Total de ${allGamesData.length} jogos.`);
    } catch (error) {
        console.error("ERRO CRÍTICO durante carga de dados:", error.message);
    }
}

// ESTE É O "TELEFONE" QUE O SEU SITE ESTÁ CHAMANDO
app.get('/api/data', (req, res) => {
  if (!isDataReady) return res.status(503).json({ error: 'Servidor ainda processando dados. Tente novamente em alguns minutos.' });
  const games = allGamesData;
  const teams = [...new Set(games.flatMap(g => [g.home_name, g.away_name]).filter(Boolean))].sort();
  const leagues = [...new Set(games.map(g => g.league).filter(Boolean))].sort();
  const firstGame = games.length > 0 ? games[0] : {};
  const capabilities = { hasOdds: 'odds_ft_1' in firstGame, hasXg: 'team_a_xg' in firstGame, hasSeason: 'season' in firstGame };
  res.json({ games, teams, leagues, capabilities });
});

const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => {
    console.log(`Servidor "lento e completo" rodando na porta ${PORT}`);
    loadAllData();
});
server.setTimeout(600000); // AUMENTA O TEMPO DE ESPERA GERAL DO SERVIDOR PARA 10 MINUTOS
