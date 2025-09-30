// index.js - VERSÃO FINAL, RÁPIDA E SEGURA (INTERMEDIÁRIO)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

const corsOptions = {
  origin: 'https://centro-de-analise-final.netlify.app',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

const URL_DA_API_DE_DADOS = 'https://datafootball.com.br';
const CHAVE_SECRETA = process.env.DATA_API_KEY;

// "Telefone" que busca a lista de times
app.get('/api/teams', async (req, res) => {
  if (!CHAVE_SECRETA) return res.status(500).json({ error: 'Chave da API não configurada no Render.' });
  try {
    // Repassa o pedido para a API de dados, usando a chave secreta
    const response = await axios.get(`${URL_DA_API_DE_DADOS}/leagues`, {
      headers: { 'x-api-key': CHAVE_SECRETA }
    });
    // A sua API retorna ligas, vamos extrair os times a partir delas (precisamos adaptar se a API tiver um endpoint de times)
    // Por agora, vamos assumir que a API de análise nos dará os times.
    // Apenas para teste, vamos retornar a lista de ligas para confirmar a conexão.
    res.json({ teams: response.data }); // Temporariamente retornando ligas como times
  } catch (error) {
    console.error("Erro ao buscar /leagues:", error.message);
    res.status(502).json({ error: 'Falha ao buscar dados da API externa.' });
  }
});

// "Telefone" que faz a análise
app.post('/api/analyze', async (req, res) => {
  if (!CHAVE_SECRETA) return res.status(500).json({ error: 'Chave da API não configurada no Render.' });
  try {
    // Pega os parâmetros da sua ferramenta (ex: liga, temporada, time)
    const params = req.body;
    
    // Monta a URL correta para a API de dados
    // Exemplo para a busca de jogos por liga e temporada
    const response = await axios.get(`${URL_DA_API_DE_DADOS}/matches`, {
      params: {
        liga: params.liga, // Exemplo, precisaria vir da interface
        temporada: params.temporada, // Exemplo
        page: 1,
        limit: 100
      },
      headers: { 'x-api-key': CHAVE_SECRETA }
    });
    
    // Aqui, o robô faria a análise com os dados recebidos e retornaria o resultado.
    // Por enquanto, vamos apenas retornar os jogos para confirmar que funciona.
    res.json(response.data);

  } catch (error) {
    console.error("Erro ao analisar na API externa:", error.message);
    res.status(502).json({ error: 'Falha ao analisar dados na API externa.' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor intermediário ÁGIL rodando na porta ${PORT}`));
