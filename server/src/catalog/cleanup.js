import { query } from '../pg.js';

// Retira las fichas importadas sin video. Conserva los datos para poder
// recuperarlos si se vincula una fuente; nunca oculta títulos con una fuente.
export async function retireMetadataOnlyMovies() {
  const result = await query(`UPDATE movies m SET hidden=true
    WHERE NOT m.hidden AND m.provider IS NOT NULL
      AND NULLIF(trim(m.stream_url),'') IS NULL
      AND NOT EXISTS (SELECT 1 FROM media_sources ms
        WHERE ms.content_type='movie' AND ms.content_id=m.id
          AND NULLIF(trim(ms.url),'') IS NOT NULL)`);
  if (result.rowCount) console.log(`[catalog] ${result.rowCount} fichas sin video retiradas`);
  return result.rowCount;
}
