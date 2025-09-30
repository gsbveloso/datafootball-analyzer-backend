import express from 'express';
import cors from 'cors';
import pg from 'pg';
import axios from 'axios';
import 'dotenv/config';
import cron from 'node-cron';

// --- CONFIGURAÇÃO INICIAL ---
const app = express();
const PORT = process.env.PORT || 10000;
const { Pool } = pg;

// --- CONFIGURAÇÕES DE CONEXÃO ---
// Render usa DATABASE_URL. Em ambiente local, usaria as variáveis separadas.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- API CONFIG ---
const API_KEY = process.env.API_KEY;
const API_BASE_URL = 'https://datafootball.com.br/api/v1';
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`
  }
});

// Ligas que queremos monitorar. Adicione ou remova IDs conforme necessário.
const TARGET_LEAGUE_IDS = [1, 2, 10, 13, 14, 15]; // Ex: Brasileirão A, B, Premier League, etc.

// --- MIDDLEWARE ---
app.use(cors()); // Permite que qualquer site (como o seu no Netlify) acesse nosso servidor
app.use(express.json());

// --- FUNÇÕES DO ROBÔ ---

// Função para criar a tabela de jogos se ela não existir
async function setupDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        game_id INT UNIQUE NOT NULL,
        data JSONB NOT NULL,
        league_id INT NOT NULL,
        date_ts BIGINT NOT NULL
      );
    `);
    console.log('Database table "games" is ready.');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    client.release();
  }
}

// Função para buscar os jogos mais recentes de uma liga na API
async function fetchLatestGamesForLeague(leagueId) {
  try {
    console.log(`Fetching games for league ${leagueId}...`);
    const response = await axiosInstance.get('/matches', {
      params: { league_id: leagueId, status: 'complete' }
    });
    // A API parece não ter um filtro de data, então pegamos os últimos 100 jogos completos
    // e filtramos apenas os dos últimos 7 dias para sermos eficientes.
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentGames = response.data.data.filter(game => 
      new Date(game.date).getTime() > oneWeekAgo.getTime()
    );
    console.log(`Found ${recentGames.length} recent games for league ${leagueId}.`);
    return recentGames;
  } catch (error) {
    console.error(`Error fetching games for league ${leagueId}:`, error.response ? error.response.data : error.message);
    return [];
  }
}

// Função para salvar ou atualizar um jogo no nosso banco de dados
async function saveGameToDB(game) {
  const client = await pool.connect();
  try {
    const dateTimestamp = new Date(game.date).getTime();
    await client.query(
      `INSERT INTO games (game_id, data, league_id, date_ts) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (game_id) 
       DO UPDATE SET data = $2, date_ts = $4;`,
      [game.id, game, game.league_id, dateTimestamp]
    );
  } catch (err) {
    console.error(`Error saving game ${game.id} to DB:`, err);
  } finally {
    client.release();
  }
}

// A TAREFA PRINCIPAL DO ROBÔ: buscar e salvar dados de todas as ligas
async function runUpdateCycle() {
  console.log('--- Starting new update cycle ---');
  for (const leagueId of TARGET_LEAGUE_IDS) {
    const games = await fetchLatestGamesForLeague(leagueId);
    for (const game of games) {
      // Pedido extra para obter estatísticas detalhadas (como xG e minutos dos gols)
      try {
        const statsResponse = await axiosInstance.get(`/matches/${game.id}`);
        const fullGameData = statsResponse.data.data;
        await saveGameToDB(fullGameData);
      } catch (error) {
         console.error(`Error fetching stats for game ${game.id}:`, error.response ? error.response.data : error.message);
      }
    }
  }
  console.log('--- Update cycle finished ---');
}

// --- ROTAS DA API (Para a sua ferramenta se conectar) ---

// Rota de teste para ver se o servidor está vivo
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'DataFootball Analyzer Backend is running.' });
});

// Rota de teste de conexão com o banco de dados
app.get('/test-db', async (req, res) => {
    try {
        const client = await pool.connect();
        res.json({ status: 'success', message: 'Database connection successful.' });
        client.release();
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Database connection failed.', error: error.message });
    }
});

// Rota para a ferramenta buscar as ligas
app.get('/leagues', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT DISTINCT league_id, data->>\'league_name\' as league_name FROM games ORDER BY league_name ASC');
        res.json(result.rows);
        client.release();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rota para a ferramenta buscar os times de uma liga
app.get('/teams', async (req, res) => {
    const { league_id } = req.query;
    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT DISTINCT team_name FROM (
                SELECT data->>'home_name' as team_name FROM games WHERE league_id = $1
                UNION
                SELECT data->>'away_name' as team_name FROM games WHERE league_id = $1
            ) as teams ORDER BY team_name ASC;
        `, [league_id]);
        res.json(result.rows.map(r => r.team_name));
        client.release();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rota para a ferramenta buscar todos os jogos
app.get('/games', async (req, res) => {
    try {
        const client = await pool.connect();
        // Ordena por data para a ferramenta sempre ter os jogos na ordem certa
        const result = await client.query('SELECT data FROM games ORDER BY date_ts ASC');
        res.json(result.rows.map(r => r.data));
        client.release();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// --- INICIALIZAÇÃO E AGENDAMENTO ---
app.listen(PORT, async () 
