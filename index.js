// index.js - StreamCine (TV + Filmes + Filmes Pedidos + Séries + Novelas - CSV separados)
//
// - TV ao vivo a partir de canais_tv.csv
// - Filmes VOD a partir de filmes.csv
// - Filmes pedidos (Google Drive, Dropbox, outros hosts) a partir de filmes_pessoais.csv
// - Séries VOD a partir de series_episodios.csv
// - Novelas VOD a partir de novelas.csv
//
// Em todos os casos, o addon tenta HLS (.m3u8) se a URL é .ts.
// Links do Google Drive em formato "file/d/.../view" ou "open?id=..." são
// convertidos automaticamente para "uc?export=download&id=...".
// Para Dropbox, basta usar links diretos (ex: ?raw=1 ou ?dl=1).

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fs = require('fs');
const path = require('path');

// Poster genérico pra quando não houver logo definido
const DEFAULT_POSTER =
  'https://www.stremio.com/website/stremio-logo-small.png';

// Caches em memória
let CHANNELS_CACHE = null;
let MOVIES_CACHE = null;
let PERSONAL_MOVIES_CACHE = null;
let SERIES_CACHE = null;
let NOVELAS_CACHE = null;

// ---------- Detecta delimitador do CSV (vírgula ou ;) ----------

function detectDelimiter(line) {
  line = line.replace(/^\uFEFF/, ''); // remove BOM se tiver
  const semicolonCount = (line.match(/;/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;

  if (semicolonCount === 0 && commaCount === 0) return ','; // fallback
  if (commaCount >= semicolonCount) return ','; // se tiver mais vírgulas, assume vírgula
  return ';';
}

// ---------- Helper genérico pra ler CSV ----------

function readCsv(fileName, requiredCols) {
  const csvPath = path.join(__dirname, fileName);

  if (!fs.existsSync(csvPath)) {
    console.error('[StreamCine] Arquivo não encontrado:', csvPath);
    return { header: [], delimiter: ',', lines: [] };
  }

  console.log('[StreamCine] Lendo', csvPath);

  const raw = fs.readFileSync(csvPath, 'utf8');

  const linesAll = raw
    .split(/\r?\n/) // quebra de linha correta
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (linesAll.length <= 1) {
    console.warn('[StreamCine] CSV parece vazio (linhas <= 1):', fileName);
    return { header: [], delimiter: ',', lines: [] };
  }

  const headerLine = linesAll[0].replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(headerLine);
  console.log(
    `[StreamCine] Delimitador detectado em ${fileName}:`,
    JSON.stringify(delimiter)
  );

  const header = headerLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase());

  for (const col of requiredCols) {
    if (!header.includes(col)) {
      console.warn(
        `[StreamCine] Cabeçalho de ${fileName} não possui coluna obrigatória: ${col}. Cabeçalho:`,
        header
      );
    }
  }

  const dataLines = linesAll.slice(1);

  return { header, delimiter, lines: dataLines };
}

// ---------- TV: carrega canais de canais_tv.csv ----------

function loadChannelsFromCsv() {
  if (CHANNELS_CACHE) return CHANNELS_CACHE;

  const { header, delimiter, lines } = readCsv('canais_tv.csv', [
    'nome',
    'url'
  ]);

  if (!header.length || !lines.length) {
    CHANNELS_CACHE = [];
    return CHANNELS_CACHE;
  }

  const idxIndex = header.indexOf('index');
  const nameIndex = header.indexOf('nome');
  const groupIndex = header.indexOf('grupo');
  const urlIndex = header.indexOf('url');

  let logoIndex = header.indexOf('logo');
  if (logoIndex === -1) {
    logoIndex = header.indexOf('tvg-logo');
  }

  const channels = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.split(delimiter);

    const name = nameIndex !== -1 ? (parts[nameIndex] || '').trim() : '';
    const group =
      groupIndex !== -1 ? (parts[groupIndex] || '').trim() : '';
    const url = urlIndex !== -1 ? (parts[urlIndex] || '').trim() : '';
    const logo =
      logoIndex !== -1 ? (parts[logoIndex] || '').trim() : '';

    if (!name || !url) continue;

    let idxValue = null;
    if (idxIndex !== -1) idxValue = (parts[idxIndex] || '').trim();

    const id = `streamcine_tv_${idxValue || i + 1}`;

    channels.push({ id, name, group, url, logo });
  }

  channels.sort((a, b) => {
    const ga = (a.group || '').toLowerCase();
    const gb = (b.group || '').toLowerCase();
    if (ga < gb) return -1;
    if (ga > gb) return 1;

    const na = (a.name || '').toLowerCase();
    const nb = (b.name || '').toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });

  console.log(
    '[StreamCine] Total de canais TV carregados do CSV:',
    channels.length
  );

  CHANNELS_CACHE = channels;
  return CHANNELS_CACHE;
}

// ---------- FILMES: carrega filmes.csv ----------

function loadMoviesFromCsv() {
  if (MOVIES_CACHE) return MOVIES_CACHE;

  const { header, delimiter, lines } = readCsv('filmes.csv', [
    'titulo',
    'url'
  ]);

  if (!header.length || !lines.length) {
    MOVIES_CACHE = [];
    return MOVIES_CACHE;
  }

  const idxIndex = header.indexOf('index');
  const titleIndex = header.indexOf('titulo');
  const yearIndex = header.indexOf('ano');
  const genreIndex = header.indexOf('genero');
  const logoIndex = header.indexOf('logo');
  const fundoIndex = header.indexOf('fundo');
  const sinopseIndex = header.indexOf('sinopse');
  const urlIndex = header.indexOf('url');

  const movies = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.split(delimiter);

    const title =
      titleIndex !== -1 ? (parts[titleIndex] || '').trim() : '';
    const url = urlIndex !== -1 ? (parts[urlIndex] || '').trim() : '';

    if (!title || !url) continue;

    const year = yearIndex !== -1 ? (parts[yearIndex] || '').trim() : '';
    const genre =
      genreIndex !== -1 ? (parts[genreIndex] || '').trim() : '';
    const logo =
      logoIndex !== -1 ? (parts[logoIndex] || '').trim() : '';
    const fundo =
      fundoIndex !== -1 ? (parts[fundoIndex] || '').trim() : '';
    const sinopse =
      sinopseIndex !== -1 ? (parts[sinopseIndex] || '').trim() : '';

    let idxValue = null;
    if (idxIndex !== -1) idxValue = (parts[idxIndex] || '').trim();

    const id = `streamcine_movie_${idxValue || i + 1}`;

    movies.push({
      id,
      title,
      year,
      genre,
      logo,
      fundo,
      sinopse,
      url
    });
  }

  movies.sort((a, b) => {
    const ga = (a.genre || '').toLowerCase();
    const gb = (b.genre || '').toLowerCase();
    if (ga < gb) return -1;
    if (ga > gb) return 1;

    const ta = (a.title || '').toLowerCase();
    const tb = (b.title || '').toLowerCase();
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });

  console.log(
    '[StreamCine] Total de filmes carregados do CSV (filmes.csv):',
    movies.length
  );

  MOVIES_CACHE = movies;
  return MOVIES_CACHE;
}

// ---------- FILMES PEDIDOS: carrega filmes_pessoais.csv ----------

function loadPersonalMoviesFromCsv() {
  if (PERSONAL_MOVIES_CACHE) return PERSONAL_MOVIES_CACHE;

  const { header, delimiter, lines } = readCsv('filmes_pessoais.csv', [
    'titulo',
    'url'
  ]);

  if (!header.length || !lines.length) {
    PERSONAL_MOVIES_CACHE = [];
    return PERSONAL_MOVIES_CACHE;
  }

  const idxIndex = header.indexOf('index');
  const titleIndex = header.indexOf('titulo');
  const yearIndex = header.indexOf('ano');
  const genreIndex = header.indexOf('genero');
  const logoIndex = header.indexOf('logo');
  const fundoIndex = header.indexOf('fundo');
  const sinopseIndex = header.indexOf('sinopse');
  const urlIndex = header.indexOf('url');

  const movies = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.split(delimiter);

    const title =
      titleIndex !== -1 ? (parts[titleIndex] || '').trim() : '';
    const url = urlIndex !== -1 ? (parts[urlIndex] || '').trim() : '';

    if (!title || !url) continue;

    const year = yearIndex !== -1 ? (parts[yearIndex] || '').trim() : '';
    const genre =
      genreIndex !== -1 ? (parts[genreIndex] || '').trim() : '';
    const logo =
      logoIndex !== -1 ? (parts[logoIndex] || '').trim() : '';
    const fundo =
      fundoIndex !== -1 ? (parts[fundoIndex] || '').trim() : '';
    const sinopse =
      sinopseIndex !== -1 ? (parts[sinopseIndex] || '').trim() : '';

    let idxValue = null;
    if (idxIndex !== -1) idxValue = (parts[idxIndex] || '').trim();

    const id = `streamcine_pmovie_${idxValue || i + 1}`;

    movies.push({
      id,
      title,
      year,
      genre,
      logo,
      fundo,
      sinopse,
      url
    });
  }

  movies.sort((a, b) => {
    const ta = (a.title || '').toLowerCase();
    const tb = (b.title || '').toLowerCase();
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });

  console.log(
    '[StreamCine] Total de filmes pedidos carregados (filmes_pessoais.csv):',
    movies.length
  );

  PERSONAL_MOVIES_CACHE = movies;
  return PERSONAL_MOVIES_CACHE;
}

// ---------- helper: slug de nome de série/novela ----------

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------- SÉRIES: carrega series_episodios.csv (agrupa por série/temporada/episódio) ----------

function loadSeriesFromCsv() {
  if (SERIES_CACHE) return SERIES_CACHE;

  const { header, delimiter, lines } = readCsv('series_episodios.csv', [
    'nome',
    'url'
  ]);

  if (!header.length || !lines.length) {
    SERIES_CACHE = {
      seriesList: [],
      episodesBySeriesId: {},
      episodesById: {}
    };
    return SERIES_CACHE;
  }

  const idxIndex = header.indexOf('index');
  const nameIndex = header.indexOf('nome');
  const groupIndex = header.indexOf('grupo');
  const urlIndex = header.indexOf('url');

  let logoIndex = header.indexOf('logo');
  if (logoIndex === -1) {
    logoIndex = header.indexOf('tvg-logo');
  }

  // regex pra "Nome S01E08", "Nome [L] S05E14", etc.
  const pattern = /^(.+?)(?:\s*\[.*?\])?\s+S(\d+)E(\d+)$/i;

  const seriesMap = {}; // slug -> { id, name, group, logo }
  const episodesBySeriesId = {};
  const episodesById = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.split(delimiter);

    const fullName =
      nameIndex !== -1 ? (parts[nameIndex] || '').trim() : '';
    const url = urlIndex !== -1 ? (parts[urlIndex] || '').trim() : '';

    if (!fullName || !url) continue;

    const group =
      groupIndex !== -1 ? (parts[groupIndex] || '').trim() : '';
    const logo =
      logoIndex !== -1 ? (parts[logoIndex] || '').trim() : '';

    let seriesName = fullName;
    let season = 1;
    let episode = 1;
    let episodeTitle = fullName;

    const match = fullName.match(pattern);
    if (match) {
      seriesName = match[1].trim();
      season = parseInt(match[2], 10) || 1;
      episode = parseInt(match[3], 10) || 1;
      episodeTitle = `E${String(episode).padStart(2, '0')} - ${seriesName}`;
    }

    let seriesSlug = slugify(seriesName);
    if (!seriesSlug) {
      seriesSlug = 's' + (Object.keys(seriesMap).length + 1);
    }

    if (!seriesMap[seriesSlug]) {
      const seriesId = `streamcine_series_${seriesSlug}`;
      seriesMap[seriesSlug] = {
        id: seriesId,
        name: seriesName,
        group,
        logo: logo || ''
      };
      episodesBySeriesId[seriesId] = [];
    } else {
      if (!seriesMap[seriesSlug].logo && logo) {
        seriesMap[seriesSlug].logo = logo;
      }
      if (!seriesMap[seriesSlug].group && group) {
        seriesMap[seriesSlug].group = group;
      }
    }

    const seriesId = seriesMap[seriesSlug].id;

    const episodeId = `${seriesId}_s${String(season).padStart(
      2,
      '0'
    )}e${String(episode).padStart(2, '0')}`;

    const epObj = {
      id: episodeId,
      seriesId,
      seriesName,
      season,
      episode,
      title: episodeTitle,
      group,
      logo,
      url
    };

    episodesById[episodeId] = epObj;
    episodesBySeriesId[seriesId].push(epObj);
  }

  const seriesList = Object.values(seriesMap);

  // Ordena séries por nome
  seriesList.sort((a, b) => {
    const na = (a.name || '').toLowerCase();
    const nb = (b.name || '').toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });

  // Ordena episódios por temporada, depois episódio
  for (const seriesId of Object.keys(episodesBySeriesId)) {
    episodesBySeriesId[seriesId].sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      return a.episode - b.episode;
    });
  }

  console.log(
    '[StreamCine] Total de séries detectadas (series_episodios.csv):',
    seriesList.length
  );
  console.log(
    '[StreamCine] Total de episódios em séries:',
    Object.keys(episodesById).length
  );

  SERIES_CACHE = {
    seriesList,
    episodesBySeriesId,
    episodesById
  };
  return SERIES_CACHE;
}

// ---------- NOVELAS: carrega novelas.csv (agrupa por novela/temporada/episódio) ----------

function loadNovelasFromCsv() {
  if (NOVELAS_CACHE) return NOVELAS_CACHE;

  const { header, delimiter, lines } = readCsv('novelas.csv', [
    'nome',
    'url'
  ]);

  if (!header.length || !lines.length) {
    NOVELAS_CACHE = {
      novelaList: [],
      episodesByNovelaId: {},
      episodesById: {}
    };
    return NOVELAS_CACHE;
  }

  const idxIndex = header.indexOf('index');
  const nameIndex = header.indexOf('nome');
  const groupIndex = header.indexOf('grupo');
  const urlIndex = header.indexOf('url');
  let logoIndex = header.indexOf('logo');
  if (logoIndex === -1) {
    logoIndex = header.indexOf('tvg-logo');
  }

  // Mesmo padrão de "Nome S01E280" etc.
  const pattern = /^(.+?)(?:\s*\[.*?\])?\s+S(\d+)E(\d+)$/i;

  const novelaMap = {}; // slug -> { id, name, group, logo }
  const episodesByNovelaId = {};
  const episodesById = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.split(delimiter);

    const fullName =
      nameIndex !== -1 ? (parts[nameIndex] || '').trim() : '';
    const url = urlIndex !== -1 ? (parts[urlIndex] || '').trim() : '';
    if (!fullName || !url) continue;

    const group =
      groupIndex !== -1 ? (parts[groupIndex] || '').trim() : '';
    const logo =
      logoIndex !== -1 ? (parts[logoIndex] || '').trim() : '';

    let novelaName = fullName;
    let season = 1;
    let episode = 1;
    let episodeTitle = fullName;

    const match = fullName.match(pattern);
    if (match) {
      novelaName = match[1].trim();
      season = parseInt(match[2], 10) || 1;
      episode = parseInt(match[3], 10) || 1;
      episodeTitle = `E${String(episode).padStart(3, '0')} - ${novelaName}`;
    }

    let novelaSlug = slugify(novelaName);
    if (!novelaSlug) {
      novelaSlug = 'n' + (Object.keys(novelaMap).length + 1);
    }

    if (!novelaMap[novelaSlug]) {
      const novelaId = `streamcine_novela_${novelaSlug}`;
      novelaMap[novelaSlug] = {
        id: novelaId,
        name: novelaName,
        group,
        logo: logo || ''
      };
      episodesByNovelaId[novelaId] = [];
    } else {
      if (!novelaMap[novelaSlug].logo && logo) {
        novelaMap[novelaSlug].logo = logo;
      }
      if (!novelaMap[novelaSlug].group && group) {
        novelaMap[novelaSlug].group = group;
      }
    }

    const novelaId = novelaMap[novelaSlug].id;

    const episodeId = `${novelaId}_s${String(season).padStart(
      2,
      '0'
    )}e${String(episode).padStart(3, '0')}`;

    const epObj = {
      id: episodeId,
      seriesId: novelaId,
      seriesName: novelaName,
      season,
      episode,
      title: episodeTitle,
      group,
      logo,
      url
    };

    episodesById[episodeId] = epObj;
    episodesByNovelaId[novelaId].push(epObj);
  }

  const novelaList = Object.values(novelaMap);

  novelaList.sort((a, b) => {
    const na = (a.name || '').toLowerCase();
    const nb = (b.name || '').toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });

  for (const novelaId of Object.keys(episodesByNovelaId)) {
    episodesByNovelaId[novelaId].sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      return a.episode - b.episode;
    });
  }

  console.log(
    '[StreamCine] Total de novelas detectadas (novelas.csv):',
    novelaList.length
  );
  console.log(
    '[StreamCine] Total de episódios em novelas:',
    Object.keys(episodesById).length
  );

  NOVELAS_CACHE = {
    novelaList,
    episodesByNovelaId,
    episodesById
  };
  return NOVELAS_CACHE;
}

// ---------- Google Drive: normaliza link pra uc?export=download ----------

function normalizeGoogleDriveUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return trimmed;

  // Formato: https://drive.google.com/file/d/ARQUIVO_ID/view?...
  const m1 = trimmed.match(/https?:\/\/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m1 && m1[1]) {
    const id = m1[1];
    const direct = `https://drive.google.com/uc?export=download&id=${id}`;
    console.log('[StreamCine] Link Drive convertido (file/d/...):', direct);
    return direct;
  }

  // Formato: https://drive.google.com/open?id=ARQUIVO_ID
  const m2 = trimmed.match(/https?:\/\/drive\.google\.com\/open\?id=([^&]+)/);
  if (m2 && m2[1]) {
    const id = m2[1];
    const direct = `https://drive.google.com/uc?export=download&id=${id}`;
    console.log('[StreamCine] Link Drive convertido (open?id=...):', direct);
    return direct;
  }

  return trimmed;
}

// ---------- Helper: escolhe melhor stream (HLS preferido para .ts) ----------

function pickBestStream(title, originalUrl) {
  if (!originalUrl) return null;

  // Normaliza se for link do Google Drive
  let trimmed = normalizeGoogleDriveUrl(originalUrl);

  // Já é HLS
  if (trimmed.match(/\.m3u8(\?|$)/i)) {
    return {
      title: `${title} (HLS)`,
      url: trimmed
    };
  }

  // Se for .ts, trocamos pra .m3u8
  if (trimmed.match(/\.ts(\?|$)/i)) {
    const hlsUrl = trimmed.replace(/\.ts(\?|$)/i, '.m3u8$1');
    return {
      title: `${title} (HLS)`,
      url: hlsUrl
    };
  }

  // Outros formatos (mp4, mkv, drive, dropbox, etc.) – usamos como veio
  return {
    title: title,
    url: trimmed
  };
}

// ---------- MANIFESTO DO ADDON ----------

const manifest = {
  id: 'org.streamcine.iptv',
  version: '5.3.0', // versão para forçar recarregamento no Stremio
  name: 'StreamCine',
  description:
    'Canais de TV, filmes, filmes pedidos, séries e novelas a partir de listas e CSVs personalizados',
  logo: DEFAULT_POSTER,

  resources: [
    {
      name: 'catalog',
      types: ['tv', 'movie', 'series']
    },
    {
      name: 'meta',
      types: ['tv', 'movie', 'series'],
      idPrefixes: [
        'streamcine_tv_',
        'streamcine_movie_',
        'streamcine_pmovie_',
        'streamcine_series_',
        'streamcine_novela_'
      ]
    },
    {
      name: 'stream',
      types: ['tv', 'movie', 'series'],
      idPrefixes: [
        'streamcine_tv_',
        'streamcine_movie_',
        'streamcine_pmovie_',
        'streamcine_series_',
        'streamcine_novela_'
      ]
    }
  ],

  types: ['tv', 'movie', 'series'],

  catalogs: [
    {
      type: 'tv',
      id: 'streamcine_iptv_channels',
      name: 'StreamCine IPTV',
      extra: []
    },
    {
      type: 'movie',
      id: 'streamcine_movies',
      name: 'StreamCine Filmes',
      extra: []
    },
    {
      type: 'movie',
      id: 'streamcine_personal_movies',
      name: 'StreamCine Pedidos',
      extra: []
    },
    {
      type: 'series',
      id: 'streamcine_series',
      name: 'StreamCine Séries',
      extra: []
    },
    {
      type: 'series',
      id: 'streamcine_novelas',
      name: 'StreamCine Novelas',
      extra: []
    }
  ],

  behaviorHints: {
    configurable: false,
    configurationRequired: false
  }
};

const builder = new addonBuilder(manifest);

// ---------- CATALOG HANDLER ----------

builder.defineCatalogHandler(async (args) => {
  const { type, id } = args;

  // TV
  if (type === 'tv' && id === 'streamcine_iptv_channels') {
    const channels = loadChannelsFromCsv();
    console.log(
      '[StreamCine] Catálogo TV solicitado. Total de canais:',
      channels.length
    );

    const metas = channels.map((ch) => ({
      id: ch.id,
      type: 'tv',
      name: ch.name,
      poster: ch.logo || DEFAULT_POSTER,
      posterShape: 'square',
      description: ch.group,
      genres: ch.group ? [ch.group] : []
    }));

    return { metas };
  }

  // FILMES (lista principal)
  if (type === 'movie' && id === 'streamcine_movies') {
    const movies = loadMoviesFromCsv();
    console.log(
      '[StreamCine] Catálogo FILMES solicitado. Total de filmes:',
      movies.length
    );

    const metas = movies.map((m) => ({
      id: m.id,
      type: 'movie',
      name: m.title,
      poster: m.logo || DEFAULT_POSTER,
      posterShape: 'poster',
      description: m.sinopse || '',
      year: m.year ? parseInt(m.year, 10) || undefined : undefined,
      genres: m.genre ? [m.genre] : []
    }));

    return { metas };
  }

  // FILMES PEDIDOS
  if (type === 'movie' && id === 'streamcine_personal_movies') {
    const movies = loadPersonalMoviesFromCsv();
    console.log(
      '[StreamCine] Catálogo FILMES PEDIDOS solicitado. Total de filmes:',
      movies.length
    );

    const metas = movies.map((m) => ({
      id: m.id,
      type: 'movie',
      name: m.title,
      poster: m.logo || DEFAULT_POSTER,
      posterShape: 'poster',
      description: m.sinopse || '',
      year: m.year ? parseInt(m.year, 10) || undefined : undefined,
      genres: m.genre ? [m.genre] : ['Pedido']
    }));

    return { metas };
  }

  // SÉRIES (normais, de series_episodios.csv)
  if (type === 'series' && id === 'streamcine_series') {
    const { seriesList } = loadSeriesFromCsv();
    console.log(
      '[StreamCine] Catálogo SÉRIES solicitado. Total de séries:',
      seriesList.length
    );

    const metas = seriesList.map((s) => ({
      id: s.id,
      type: 'series',
      name: s.name,
      poster: s.logo || DEFAULT_POSTER,
      posterShape: 'poster',
      description: s.group || '',
      genres: s.group ? [s.group] : []
    }));

    return { metas };
  }

  // NOVELAS (de novelas.csv)
  if (type === 'series' && id === 'streamcine_novelas') {
    const { novelaList } = loadNovelasFromCsv();
    console.log(
      '[StreamCine] Catálogo NOVELAS solicitado. Total de novelas:',
      novelaList.length
    );

    const metas = novelaList.map((n) => ({
      id: n.id,
      type: 'series',
      name: n.name,
      poster: n.logo || DEFAULT_POSTER,
      posterShape: 'poster',
      description: n.group || 'Novela',
      genres: n.group ? [n.group] : ['Novela']
    }));

    return { metas };
  }

  return { metas: [] };
});

// ---------- META HANDLER ----------

builder.defineMetaHandler(async (args) => {
  const { type, id } = args;

  console.log('[StreamCine] Meta solicitado:', type, id);

  if (type === 'tv') {
    const channels = loadChannelsFromCsv();
    const channel = channels.find((ch) => ch.id === id);
    if (!channel) {
      console.log('[StreamCine] Canal não encontrado na meta:', id);
      return { meta: null };
    }

    const meta = {
      id: channel.id,
      type: 'tv',
      name: channel.name,
      poster: channel.logo || DEFAULT_POSTER,
      posterShape: 'square',
      description: channel.group || 'Canal de TV',
      genres: channel.group ? [channel.group] : [],
      background: channel.logo || undefined
    };

    return { meta };
  }

  if (type === 'movie') {
    const movies = loadMoviesFromCsv();
    const personalMovies = loadPersonalMoviesFromCsv();

    let movie = movies.find((m) => m.id === id);
    let isPersonal = false;

    if (!movie) {
      movie = personalMovies.find((m) => m.id === id);
      if (movie) isPersonal = true;
    }

    if (!movie) {
      console.log('[StreamCine] Filme não encontrado na meta:', id);
      return { meta: null };
    }

    const meta = {
      id: movie.id,
      type: 'movie',
      name: movie.title,
      poster: movie.logo || DEFAULT_POSTER,
      posterShape: 'poster',
      description: movie.sinopse || (isPersonal ? 'Filme de pedidos' : ''),
      year: movie.year ? parseInt(movie.year, 10) || undefined : undefined,
      genres: movie.genre
        ? [movie.genre]
        : isPersonal
        ? ['Pedido']
        : [],
      background: movie.fundo || movie.logo || DEFAULT_POSTER
    };

    return { meta };
  }

  if (type === 'series') {
    const { seriesList, episodesBySeriesId, episodesById } =
      loadSeriesFromCsv();
    const { novelaList, episodesByNovelaId, episodesById: novelaEpsById } =
      loadNovelasFromCsv();

    let serie = null;
    let episodes = [];
    let isNovela = false;

    // Se for id de série normal
    if (id.startsWith('streamcine_series_')) {
      serie = seriesList.find((s) => s.id === id);
      if (serie) {
        episodes = episodesBySeriesId[serie.id] || [];
      }
    } else if (id.startsWith('streamcine_novela_')) {
      // id de novela
      serie = novelaList.find((n) => n.id === id);
      isNovela = true;
      if (serie) {
        episodes = episodesByNovelaId[serie.id] || [];
      }
    } else {
      // Pode ser id de episódio (série ou novela)
      let ep = episodesById[id];
      if (ep) {
        serie = seriesList.find((s) => s.id === ep.seriesId) || {
          id: ep.seriesId,
          name: ep.seriesName,
          group: ep.group,
          logo: ep.logo
        };
        episodes = episodesBySeriesId[serie.id] || [ep];
      } else {
        ep = novelaEpsById[id];
        if (ep) {
          serie = novelaList.find((n) => n.id === ep.seriesId) || {
            id: ep.seriesId,
            name: ep.seriesName,
            group: ep.group,
            logo: ep.logo
          };
          episodes = episodesByNovelaId[serie.id] || [ep];
          isNovela = true;
        }
      }
    }

    if (!serie) {
      console.log('[StreamCine] Série/Novela não encontrada na meta:', id);
      return { meta: null };
    }

    const videos = episodes.map((ep) => ({
      id: ep.id,
      title: ep.title,
      season: ep.season,
      episode: ep.episode
    }));

    const meta = {
      id: serie.id,
      type: 'series',
      name: serie.name,
      poster: serie.logo || DEFAULT_POSTER,
      posterShape: 'poster',
      description: serie.group || (isNovela ? 'Novela' : 'Série'),
      genres: serie.group ? [serie.group] : isNovela ? ['Novela'] : [],
      background: serie.logo || DEFAULT_POSTER,
      videos
    };

    return { meta };
  }

  return { meta: null };
});

// ---------- STREAM HANDLER ----------

builder.defineStreamHandler(async (args) => {
  const { type, id } = args;

  // TV
  if (type === 'tv') {
    const channels = loadChannelsFromCsv();
    const channel = channels.find((ch) => ch.id === id);

    if (!channel) {
      console.log('[StreamCine] Canal não encontrado para stream:', id);
      return { streams: [] };
    }

    console.log('[StreamCine] Reproduzindo CANAL:', channel.name);
    console.log('[StreamCine] URL original:', channel.url);

    const stream = pickBestStream(channel.name, channel.url);
    if (!stream) return { streams: [] };

    console.log('[StreamCine] URL final usada (TV):', stream.url);
    return { streams: [stream] };
  }

  // FILMES / FILMES PEDIDOS
  if (type === 'movie') {
    const movies = loadMoviesFromCsv();
    const personalMovies = loadPersonalMoviesFromCsv();

    let movie = movies.find((m) => m.id === id);
    if (!movie) movie = personalMovies.find((m) => m.id === id);

    if (!movie) {
      console.log('[StreamCine] Filme não encontrado para stream:', id);
      return { streams: [] };
    }

    console.log('[StreamCine] Reproduzindo FILME:', movie.title);
    console.log('[StreamCine] URL original:', movie.url);

    const stream = pickBestStream(movie.title, movie.url);
    if (!stream) return { streams: [] };

    console.log('[StreamCine] URL final usada (FILME):', stream.url);
    return { streams: [stream] };
  }

  // SÉRIES / NOVELAS
  if (type === 'series') {
    const { episodesBySeriesId, episodesById } = loadSeriesFromCsv();
    const {
      episodesByNovelaId,
      episodesById: novelaEpsById
    } = loadNovelasFromCsv();

    let episode = episodesById[id] || novelaEpsById[id];

    // Se id for de série/novela (não de episódio), toca o primeiro ep
    if (!episode) {
      if (id.startsWith('streamcine_series_') && episodesBySeriesId[id]) {
        const eps = episodesBySeriesId[id];
        if (eps && eps.length) episode = eps[0];
      } else if (
        id.startsWith('streamcine_novela_') &&
        episodesByNovelaId[id]
      ) {
        const eps = episodesByNovelaId[id];
        if (eps && eps.length) episode = eps[0];
      }
    }

    if (!episode) {
      console.log(
        '[StreamCine] Série/Novela não encontrada para stream:',
        id
      );
      return { streams: [] };
    }

    console.log('[StreamCine] Reproduzindo SÉRIE/NOVELA ep:', episode.seriesName);
    console.log('[StreamCine] Temp/Ep:', episode.season, episode.episode);
    console.log('[StreamCine] URL original:', episode.url);

    const stream = pickBestStream(episode.title, episode.url);
    if (!stream) return { streams: [] };

    console.log('[StreamCine] URL final usada (SÉRIE/NOVELA):', stream.url);
    return { streams: [stream] };
  }

  return { streams: [] };
});

// ---------- SERVIDOR HTTP DO ADDON (local + Railway) ----------

const PORT = process.env.PORT || 7000;

serveHTTP(builder.getInterface(), { port: PORT });

console.log(
  `StreamCine (TV + Filmes + Pedidos + Séries + Novelas) rodando na porta ${PORT}`
);
