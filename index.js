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

// Ligas que queremos monitorar.
const TARGET_LEAGUE_IDS = [1, 2, 10, 13, 14, 15];

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- FUNÇÕES DO ROBÔ ---

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

async function fetchLatestGamesForLeague(leagueId) {
  try {
    console.log(`Fetching games for league ${leagueId}...`);
    const response = await axiosInstance.get('/matches', {
      params: { league_id: leagueId, status: 'complete' }
    });
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

async function runUpdateCycle() {
  console.log('--- Starting new update cycle ---');
  for (const leagueId of TARGET_LEAGUE_IDS) {
    const games = await fetchLatestGamesForLeague(leagueId);
    for (const game of games) {
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

// --- ROTAS DA API ---

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'DataFootball Analyzer Backend is running.' });
});

app.get('/test-db', async (req, res) => {
    try {
        const client = await pool.connect();
        res.json({ status: 'success', message: 'Database connection successful.' });
        client.release();
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Database connection failed.', error: error.message });
    }
});

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

app.get('/teams', async (req, res) => {
    const { league_id } = req.query;
    try {
        const client = await pool.connect();
        const result = await client.query(
            `SELECT DISTINCT team_name FROM (
                SELECT data->>'home_name' as team_name FROM games WHERE league_id = $1
                UNION
                SELECT data->>'away_name' as team_name FROM games WHERE league_id = $1
            ) as teams ORDER BY team_name ASC;`, [league_id]);
        res.json(result.rows.map(r => r.team_name));
        client.release();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/games', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT data FROM games ORDER BY date_ts ASC');
        res.json(result.rows.map(r => r.data));
        client.release();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- INICIALIZAÇÃO E AGENDAMENTO ---
app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  await setupDatabase(); 
  
  console.log('Running initial data fetch...');
  runUpdateCycle();

  cron.schedule('0 */2 * * *', () => {
    console.log('Running scheduled data fetch...');
    runUpdateCycle();
  });
});
