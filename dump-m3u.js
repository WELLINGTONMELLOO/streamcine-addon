// dump-m3u.js
const fs = require('fs');
const fetch = require('node-fetch');
const parser = require('iptv-playlist-parser');

// 👉 COLOQUE AQUI A SUA URL DA LISTA M3U
const M3U_URL = 'http://skolalpha.top/get.php?username=878698658teste&password=181506425&type=m3u_plus&output=mpegts';
// Exemplo: const M3U_URL = 'http://seu-servidor.com/sualista.m3u';

(async () => {
  try {
    console.log('Baixando lista M3U...');
    const res = await fetch(M3U_URL);
    if (!res.ok) {
      throw new Error('Erro HTTP: ' + res.status);
    }

    const text = await res.text();
    console.log('Fazendo parse da M3U...');
    const result = parser.parse(text);

    const items = result.items || [];
    console.log(`Total de canais encontrados: ${items.length}`);

    const linhas = [];
    // Cabeçalho do CSV
    linhas.push('index;nome;grupo;url');

    items.forEach((item, index) => {
      const nome =
        item.name ||
        (item.tvg && (item.tvg.name || item.tvg.id)) ||
        '';
      const grupo =
        (item.group && item.group.title ? item.group.title : '') || '';
      const url = item.url || '';

      // Evitar ; quebrando o CSV
      const nomeSan = String(nome).replace(/;/g, ',');
      const grupoSan = String(grupo).replace(/;/g, ',');
      const urlSan = String(url).replace(/;/g, ',');

      linhas.push(`${index};${nomeSan};${grupoSan};${urlSan}`);
    });

    const fileName = 'canais_streamcine.csv';
    fs.writeFileSync(fileName, linhas.join('\n'), 'utf8');

    console.log(`Arquivo "${fileName}" criado na mesma pasta do projeto.`);
    console.log('Exemplo dos 20 primeiros canais:\n');

    items.slice(0, 20).forEach((item, i) => {
      const nome =
        item.name ||
        (item.tvg && (item.tvg.name || item.tvg.id)) ||
        '';
      const grupo =
        (item.group && item.group.title ? item.group.title : '') || '';
      console.log(
        `#${i} - ${nome} | grupo: ${grupo} | url: ${item.url || ''}`
      );
    });
  } catch (err) {
    console.error('Erro ao processar M3U:', err.message);
  }
})();
