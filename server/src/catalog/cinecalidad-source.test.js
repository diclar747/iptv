import test from 'node:test';
import assert from 'node:assert/strict';
import { parseListing, validPage } from './cinecalidad-source.js';

const movie = `<article id="post-1" class="item movies"><img src="data:image/png;base64,placeholder" data-src="https://image.tmdb.org/t/p/w342/poster.jpg">
<h3><a href="https://www.cinecalidad.am/ver-pelicula/example/"><div class="in_title">Una &amp; otra &#241;</div><p></p><p>2026</p><p class="custom_synop">Una historia &quot;especial&quot;.</p></a>
<div class="home_post_cat"><a href="https://www.cinecalidad.am/genero-de-la-pelicula/drama/">Drama</a></div></h3><div class="rating">7.2</div></article>`;

test('extracts catalog metadata, lazy posters and pagination', () => {
  const result = parseListing(movie + `<a href='/page/2/'>Más películas</a><a href="https://www.cinecalidad.am/page/869/?q=test">869</a>`);
  assert.equal(result.lastPage, 869);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.items[0], {
    externalId: 'example', title: 'Una & otra ñ', year: 2026,
    poster: 'https://image.tmdb.org/t/p/w342/poster.jpg', overview: 'Una historia "especial".',
    genres: [{ slug: 'drama', name: 'Drama' }], rating: 7.2,
    sourceUrl: 'https://www.cinecalidad.am/ver-pelicula/example/',
  });
});
test('excludes series, ads and external links and deduplicates movies', () => {
  const series = movie.replaceAll('/ver-pelicula/', '/ver-serie/');
  const ad = movie.replaceAll('https://www.cinecalidad.am/ver-pelicula/', 'https://ads.example/ver-pelicula/');
  assert.equal(parseListing(movie + movie + series + ad).items.length, 1);
});
test('last page ends scan; markup or access errors are not interpreted as success', () => {
  assert.equal(parseListing(movie, 869).hasMore, false);
  assert.throws(() => parseListing('<html>Access denied</html>'), /No se encontraron/);
});
test('continues through a page containing only series', () => {
  const result = parseListing(movie.replaceAll('/ver-pelicula/', '/ver-serie/') + '<a href="/page/3/">3</a>', 2);
  assert.equal(result.items.length, 0);
  assert.equal(result.hasMore, true);
});
test('validates page input', () => {
  assert.equal(validPage('2'), 2);
  for (const value of [0, -1, 1.5, 'NaN', Infinity, 10001, 'https://example.com']) {
    assert.throws(() => validPage(value), /Página inválida/);
  }
});
