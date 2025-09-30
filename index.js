// index.js - VERSÃO FINAL E COMPLETA
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Configuração de segurança: só aceita pedidos do seu site
const corsOptions = {
  origin: 'https://centro-de-analise-final.netlify.app',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// O endereço da sua API de dados real
const URL_DA_API_DE_DADOS = 'https://datafootball.com.br/api';

// Pega a chave secreta que você salvou no Render
const CHAVE_SECRETA = process.env.DATA_API_KEY;

// O "TELEFONE" PRINCIPAL QUE O SEU SITE VAI USAR
app.get('/api/data', async (req, res) => {
  if (!CHAVE_SECRETA) {
    return res.status(500).json({ error: 'Chave da API não foi configurada no servidor do Render.' });
  }
  try {
    // 1. O robô busca a lista de todos os jogos na API de dados
    console.log('Buscando jogos na API externa...');
    const gamesResponse = await axios.get(`${URL_DA_API_DE_DADOS}/games`, { // Assumindo que o endpoint para jogos é /games
      headers: { 'x-api-key': CHAVE_SECRETA }
    });
    const games = gamesResponse.data.games || [];
    console.log(`Recebidos ${games.length} jogos.`);

    if (games.length === 0) {
        return res.json({ games: [], teams: [], leagues: [], capabilities: { hasOdds: false, hasXg: false, hasSeason: false } });
    }

    // 2. Com base nos jogos, ele extrai a lista de times e ligas
    const homeTeams = games.map(game => game.home_name?.trim()).filter(Boolean);
    const awayTeams = games.map(game => game.away_name?.trim()).filter(Boolean);
    const teams = [...new Set([...homeTeams, ...awayTeams])].sort();
    const leagues = [...new Set(games.map(game => game.league?.trim()).filter(Boolean))].sort();

    // 3. Ele verifica as "capacidades" dos dados (se tem odds, xg, etc.)
    const firstGame = games[0];
    const capabilities = {
        hasOdds: firstGame && 'odds_ft_1' in firstGame,
        hasXg: firstGame && 'team_a_xg' in firstGame,
        hasSeason: firstGame && 'season' in firstGame,
    };
    console.log('Capacidades detectadas:', capabilities);

    // 4. Envia tudo de uma vez para o seu site no Netlify
    res.json({
        games,
        teams,
        leagues,
        capabilities
    });

  } catch (error) {
    console.error("ERRO CRÍTICO ao buscar dados da API externa:", error.message);
    res.status(502).json({ error: 'Falha ao comunicar com a API de dados (datafootball.com.br).' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor intermediário rodando na porta ${PORT}`));
