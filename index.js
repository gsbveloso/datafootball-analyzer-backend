// index.js - VERSÃO FINAL CORRETA
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Ferramenta para falar com outras APIs

const app = express();

// Configuração de segurança: só aceita pedidos do seu site
const corsOptions = {
  origin: 'https://centro-de-analise-final.netlify.app',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// O endereço da sua API de dados real.
// (Estou assumindo que os endpoints são /api/teams e /api/analyze. Se for diferente, me avise).
const URL_DA_API_DE_DADOS = 'https://datafootball.com.br/api';

// Pega a chave secreta que você salvou no Render
const CHAVE_SECRETA = process.env.DATA_API_KEY;

// "Telefone" que busca a lista de times
app.get('/api/teams', async (req, res) => {
  if (!CHAVE_SECRETA) {
    return res.status(500).json({ error: 'Chave da API não foi configurada no servidor do Render.' });
  }
  try {
    // O robô repassa o pedido para a datafootball, usando a chave secreta
    const response = await axios.get(`${URL_DA_API_DE_DADOS}/teams`, {
      headers: { 'x-api-key': CHAVE_SECRETA }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Erro ao buscar times da API externa:", error.message);
    res.status(502).json({ error: 'Falha ao comunicar com a API de dados (datafootball.com.br).' });
  }
});

// "Telefone" que pede a análise
app.post('/api/analyze', async (req, res) => {
    if (!CHAVE_SECRETA) {
        return res.status(500).json({ error: 'Chave da API não foi configurada no servidor do Render.' });
    }
  try {
    // O robô repassa o pedido de análise para a datafootball
    const response = await axios.post(`${URL_DA_API_DE_DADOS}/analyze`, req.body, {
      headers: { 'x-api-key': CHAVE_SECRETA }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Erro ao analisar na API externa:", error.message);
    res.status(502).json({ error: 'Falha ao comunicar com a API de dados (datafootball.com.br).' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor intermediário rodando na porta ${PORT}`));
