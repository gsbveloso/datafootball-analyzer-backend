// index.js - VERSÃO FINAL CORRETA, BASEADA NA DOCUMENTAÇÃO DA API
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
const URL_DA_API_DE_DADOS = 'https://datafootball.com.br';

// Pega a chave secreta que você salvou no Render
const CHAVE_SECRETA = process.env.DATA_API_KEY;

// Variáveis para guardar os dados carregados em memória
let allGamesData = [];
let isDataReady = false;

// Função que busca TODOS os dados da API externa
async function loadAllData() {
    console.log('Iniciando o processo de carregamento completo dos dados...');
    if (!CHAVE_SECRETA) {
        console.error('ERRO CRÍTICO: Chave da API (DATA_API_KEY) não encontrada nas variáveis de ambiente do Render.');
        return;
    }

    try {
        // 1. Buscar todas as combinações de ligas e temporadas
        console.log('Buscando combinações de ligas e temporadas...');
        const combosResponse = await axios.get(`${URL_DA_API_DE_DADOS}/leagues_seasons`, {
            headers: { 'x-api-key': CHAVE_SECRETA }
        });
        const combinations = combosResponse.data; // Assumindo que a resposta é um array
        console.log(`Encontradas ${combinations.length} combinações.`);

        let tempGames = [];

        // 2. Para cada combinação, buscar todos os jogos (lidando com paginação)
        for (const combo of combinations) {
            let currentPage = 1;
            let hasMorePages = true;
            console.log(`Buscando jogos para: ${combo.liga} - ${combo.temporada}...`);

            while (hasMorePages) {
                try {
                    const matchesResponse = await axios.get(`${URL_DA_API_DE_DADOS}/matches`, {
                        params: {
                            liga: combo.liga,
                            temporada: combo.temporada,
                            page: currentPage,
                            limit: 100 // Buscando de 100 em 100
                        },
                        headers: { 'x-api-key': CHAVE_SECRETA }
                    });

                    const newMatches = matchesResponse.data; // Assumindo que a resposta da API é um array de jogos
                    
                    if (newMatches && newMatches.length > 0) {
                        tempGames.push(...newMatches);
                        console.log(`  - Página ${currentPage}: ${newMatches.length} jogos adicionados. Total parcial: ${tempGames.length}`);
                        currentPage++;
                        // Se a API retornou menos de 100 jogos, essa é a última página
                        if (newMatches.length < 100) {
                            hasMorePages = false;
                        }
                    } else {
                        hasMorePages = false; // Não há mais jogos ou a página está vazia
                    }
                } catch (pageError) {
                    console.error(`  - Erro ao buscar página ${currentPage} para ${combo.liga} - ${combo.temporada}. Continuando...`);
                    hasMorePages = false; // Para de tentar esta combinação se der erro
                }
            }
        }

        allGamesData = tempGames;
        isDataReady = true;
        console.log(`=================================================`);
        console.log(`CARGA COMPLETA! Total de ${allGamesData.length} jogos carregados.`);
        console.log(`=================================================`);

    } catch (error) {
        console.error("ERRO CRÍTICO durante o carregamento inicial dos dados:", error.message);
    }
}

// "Telefone" principal que o seu site vai usar
app.get('/api/data', (req, res) => {
  if (!isDataReady) {
    // Se os dados ainda não carregaram, pede para o usuário esperar
    return res.status(503).json({ error: 'O servidor ainda está processando os dados. Por favor, tente novamente em um minuto.' });
  }

  // Com os dados prontos, prepara a resposta para o frontend
  const games = allGamesData;
  const homeTeams = games.map(game => game.home_name?.trim()).filter(Boolean);
  const awayTeams = games.map(game => game.away_name?.trim()).filter(Boolean);
  const teams = [...new Set([...homeTeams, ...awayTeams])].sort();
  const leagues = [...new Set(games.map(game => game.league?.trim()).filter(Boolean))].sort();
  
  const firstGame = games.length > 0 ? games[0] : {};
  const capabilities = {
      hasOdds: 'odds_ft_1' in firstGame,
      hasXg: 'team_a_xg' in firstGame,
      hasSeason: 'season' in firstGame,
  };

  res.json({ games, teams, leagues, capabilities });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor intermediário rodando na porta ${PORT}`);
    // Inicia o longo processo de carregamento dos dados em segundo plano
    loadAllData();
});
